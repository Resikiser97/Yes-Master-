import assert from 'node:assert/strict';

import { createWorld } from '../src/game/world.js';
import { applyCardEffect } from '../src/logic/cardEffect.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

function testCoreStatEffect() {
  const world = createWorld(GAME_CONFIG);
  world.coreHp = 10;
  applyCardEffect(world, 'coreHp', {
    coreHp: { effect: { kind: 'coreStat', stat: 'hpMax', add: 25, heal: 15 } },
  });

  assert.equal(world.cardBonuses.hpMax, 25);
  assert.equal(world.coreHp, 25);
}

function testPlayerStatEffect() {
  const world = createWorld(GAME_CONFIG);
  applyCardEffect(world, 'carry', {
    carry: { effect: { kind: 'playerStat', stat: 'carry', add: 25 } },
  });

  assert.equal(world.player.carry, 25);
}

function testResourceEffect() {
  const world = createWorld(GAME_CONFIG);
  world.storage = { dirt: 2 };
  applyCardEffect(world, 'resources', {
    resources: { effect: { kind: 'resource', grant: { dirt: 3, stone: 4 } } },
  });

  assert.equal(world.storage.dirt, 5);
  assert.equal(world.storage.stone, 4);
}

function testModifierEffect() {
  const world = createWorld(GAME_CONFIG);
  const mod = { stat: 'nightRepairPct', pct: 20 };
  applyCardEffect(world, 'modifier', {
    modifier: { effect: { kind: 'modifier', mods: [mod] } },
  });

  assert.deepEqual(world.cardModifiers, [mod]);
  assert.notEqual(world.cardModifiers[0], mod);
}

testCoreStatEffect();
testPlayerStatEffect();
testResourceEffect();
testModifierEffect();
