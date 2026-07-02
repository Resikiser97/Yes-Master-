import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld } from '../src/game/world.js';
import { updateEnemies, spawnDebugEnemies } from '../src/game/combatRuntime.js';
import { buildWave } from '../src/logic/waveGen.js';
import { createRng } from '../src/logic/rng.js';

function testBuildWavePassesThroughDoorAttackAndHeight() {
  const wave = buildWave(20, 1, createRng(1));
  const boss = wave.enemies.find((e) => e.key === 'boss20');
  assert.ok(boss, 'stage 20 wave should include boss20');
  assert.equal(boss.doorAttack, true, 'buildWave should pass through doorAttack from ENEMIES config');
  assert.equal(boss.height, 4, 'buildWave should pass through height from ENEMIES config');
}

function testSpawnDebugEnemiesPassesThroughDoorAttackAndHeight() {
  const world = createWorld(GAME_CONFIG);
  spawnDebugEnemies(world, 1, 'boss20', GAME_CONFIG);
  const boss = world.enemies[world.enemies.length - 1];
  assert.equal(boss.doorAttack, true, 'debug-spawned boss20 should carry doorAttack');
  assert.equal(boss.height, 4, 'debug-spawned boss20 should carry height');
}

function testEnemyTargetsNearestPlacedBlock() {
  const world = createWorld(GAME_CONFIG);
  const coreHpBefore = world.coreHp;
  const enemyX = 40;
  const enemyY = world.groundY - 1;
  world.dirt.add(`${enemyX},${enemyY}`);

  world.enemies = [{
    id: 'e1',
    key: 'civilian',
    x: enemyX,
    y: enemyY,
    hp: 30,
    hpMax: 30,
    attack: 5,
    defense: 0,
    moveSpeed: 4.5,
    attackRange: 1,
    height: 2,
    doorAttack: false,
    attackCooldown: 0,
  }];

  updateEnemies(world, 0.1);
  assert.equal(world.enemies[0].isAttacking, true, 'enemy should attack the nearby placed block immediately');
  assert.ok(world.coreHp < coreHpBefore, 'attacking a placed block should still cost core HP');
}

function testDoorAttackBossExtendedRange() {
  const world = createWorld(GAME_CONFIG);
  const coreHpBefore = world.coreHp;
  const [cx, cy] = world.core[0];

  world.enemies = [{
    id: 'boss1',
    key: 'boss20',
    x: cx - 5,
    y: cy,
    hp: 650,
    hpMax: 650,
    attack: 6,
    defense: 0,
    moveSpeed: 2.8,
    attackRange: 2,
    height: 4,
    doorAttack: true,
    attackCooldown: 0,
  }];

  updateEnemies(world, 0.1);
  assert.equal(world.enemies[0].isAttacking, true, 'doorAttack boss should reach target at distance 5 (height+range=6)');
  assert.ok(world.coreHp < coreHpBefore);
}

function testNonDoorAttackBossDoesNotReachExtendedRange() {
  const world = createWorld(GAME_CONFIG);
  const coreHpBefore = world.coreHp;
  const [cx, cy] = world.core[0];

  world.enemies = [{
    id: 'boss10-1',
    key: 'boss10',
    x: cx - 5,
    y: cy,
    hp: 260,
    hpMax: 260,
    attack: 3,
    defense: 0,
    moveSpeed: 3,
    attackRange: 1,
    height: 4,
    doorAttack: false,
    attackCooldown: 0,
  }];

  updateEnemies(world, 0.1);
  assert.equal(world.enemies[0].isAttacking, false, 'boss10 (doorAttack:false) should not reach distance 5 with attackRange 1');
  assert.equal(world.coreHp, coreHpBefore, 'core HP must not change when boss is out of range');
}

function testDoorAttackBossHitsExtendedBalconyBlock() {
  const world = createWorld(GAME_CONFIG);
  const coreHpBefore = world.coreHp;
  const balconyX = 20;
  const balconyY = world.groundY - 10;
  world.fore.set(`${balconyX},${balconyY}`, 'stone');

  world.enemies = [{
    id: 'boss2',
    key: 'boss20',
    x: balconyX - 5,
    y: balconyY,
    hp: 650,
    hpMax: 650,
    attack: 6,
    defense: 0,
    moveSpeed: 2.8,
    attackRange: 2,
    height: 4,
    doorAttack: true,
    attackCooldown: 0,
  }];

  updateEnemies(world, 0.1);
  assert.equal(world.enemies[0].isAttacking, true, 'doorAttack boss should hit the extended balcony block directly');
  assert.ok(world.coreHp < coreHpBefore);
}

testBuildWavePassesThroughDoorAttackAndHeight();
testSpawnDebugEnemiesPassesThroughDoorAttackAndHeight();
testEnemyTargetsNearestPlacedBlock();
testDoorAttackBossExtendedRange();
testNonDoorAttackBossDoesNotReachExtendedRange();
testDoorAttackBossHitsExtendedBalconyBlock();

console.log('combatRuntime tests passed');
