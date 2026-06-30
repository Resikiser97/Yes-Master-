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
  const baseCap = world.player.capacity;
  applyCardEffect(world, 'carry', {
    carry: { effect: { kind: 'playerStat', stat: 'carry', add: 25 } },
  });

  assert.equal(world.player.capacity, baseCap + 25);
  assert.equal(world.player.carry, baseCap + 25);
}

function testRepairMiningFallback() {
  const world = createWorld(GAME_CONFIG);
  const player = world.player;
  delete player.repair;
  delete player.mining;

  applyCardEffect(world, 'repairInstinct');
  applyCardEffect(world, 'miningPower');

  assert.equal(player.repair, GAME_CONFIG.player.repair + 25);
  assert.equal(player.mining, GAME_CONFIG.player.mining + 25);
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
testRepairMiningFallback();
testResourceEffect();
testModifierEffect();
