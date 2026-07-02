import assert from 'node:assert/strict';

import { ECONOMY } from '../config/economyConfig.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { skillService } from '../src/account/skillService.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
}

function reset() {
  localStorage.removeItem(ECONOMY.skills.storageKey);
  skillService.resetSkills();
}

function testGetLevelsDefaultsToZero() {
  reset();
  const levels = skillService.getLevels();
  for (const attr of ECONOMY.skills.attributes) {
    assert.equal(levels[attr.key], 0, `${attr.key} should default to 0`);
  }
}

function testSetLevelValidatesKeyAndRange() {
  reset();
  const key = ECONOMY.skills.attributes[0].key;
  const maxLevel = GAME_CONFIG.skill.maxLevel;

  skillService.setLevel(key, 3);
  assert.equal(skillService.getLevel(key), 3);

  skillService.setLevel(key, maxLevel + 1);
  assert.equal(skillService.getLevel(key), 3, 'out-of-range level should be rejected, keeping previous value');

  skillService.setLevel(key, -1);
  assert.equal(skillService.getLevel(key), 3);

  skillService.setLevel('not_a_real_attribute', 5);
  assert.equal(skillService.getLevel('not_a_real_attribute'), 0);
}

function testGetUpgradeCostMatchesConfigCurveAndCapsAtMaxLevel() {
  reset();
  const key = ECONOMY.skills.attributes[0].key;
  const maxLevel = GAME_CONFIG.skill.maxLevel;

  assert.equal(skillService.getUpgradeCost(key), ECONOMY.skillGoldCost[0], 'Lv0->1 cost should read skillGoldCost[0]');

  skillService.setLevel(key, maxLevel);
  assert.equal(skillService.getUpgradeCost(key), null, 'no upgrade cost once at max level');
}

function testCanUpgradeChecksWalletGold() {
  reset();
  const key = ECONOMY.skills.attributes[0].key;
  const cost = ECONOMY.skillGoldCost[0];

  assert.equal(skillService.canUpgrade(key, { gold: cost - 1 }), false, 'insufficient gold should not allow upgrade');
  assert.equal(skillService.canUpgrade(key, { gold: cost }), true, 'exact gold amount should allow upgrade');
}

function testResetSkillsClearsAllAttributes() {
  reset();
  for (const attr of ECONOMY.skills.attributes) {
    skillService.setLevel(attr.key, 2);
  }
  skillService.resetSkills();

  const levels = skillService.getLevels();
  for (const attr of ECONOMY.skills.attributes) {
    assert.equal(levels[attr.key], 0);
  }
}

testGetLevelsDefaultsToZero();
testSetLevelValidatesKeyAndRange();
testGetUpgradeCostMatchesConfigCurveAndCapsAtMaxLevel();
testCanUpgradeChecksWalletGold();
testResetSkillsClearsAllAttributes();

console.log('skillService tests passed');
