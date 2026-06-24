import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld } from '../src/game/world.js';
import { updatePhase } from '../src/game/phaseRuntime.js';
import { updateEnemies } from '../src/game/combatRuntime.js';
import { applyDebugAction } from '../src/game/actions.js';
import { spawnPositions } from '../src/logic/spawnPosition.js';

function fakeRng(value = 0) {
  return { next: () => value };
}

function testSpawnPositionAvoidsMines() {
  const world = {
    stage: 1,
    groundY: 92,
    cols: 160,
    coreCenter: { x: 50, y: 91 },
    mines: {
      right: { cols: [74, 80] },
      left: { cols: [20, 26] },
    },
  };

  const positions = spawnPositions(2, world, GAME_CONFIG, fakeRng(0));
  assert.equal(positions[0].x, 81);
  assert.equal(positions[1].x, 19);
  assert.equal(positions[0].y, 91);
  assert.equal(positions[1].y, 91);
}

function testPhaseStartsNightAndSpawnsFirstBatch() {
  const world = createWorld(GAME_CONFIG);
  world.stage = 1;
  world.phaseTimer = 0;

  updatePhase(world, GAME_CONFIG.time.fixedStepSeconds, GAME_CONFIG);
  assert.equal(world.phase, 'night');
  assert.ok(world.pendingSpawns.length > 0);
  assert.equal(world.enemies.length, 0);

  updatePhase(world, 0, GAME_CONFIG);
  assert.ok(world.enemies.length > 0);
  assert.ok(world.enemies[0].id);
  assert.ok(Number.isFinite(world.enemies[0].x));
  assert.ok(Number.isFinite(world.enemies[0].y));
  assert.equal(world.enemies[0].hpMax, world.enemies[0].hp);
  assert.equal(world.enemies[0].attackCooldown, 0);
}

function testSpawnedWaveEnemyWalksToCoreAndAttacks() {
  const world = createWorld(GAME_CONFIG);
  world.stage = 1;
  world.phaseTimer = 0;

  updatePhase(world, GAME_CONFIG.time.fixedStepSeconds, GAME_CONFIG);
  updatePhase(world, 0, GAME_CONFIG);

  const enemy = world.enemies[0];
  const target = world.core[0];
  const startD = Math.hypot(enemy.x - target[0], enemy.y - target[1]);
  const startHp = world.coreHp;

  for (let i = 0; i < 7 / GAME_CONFIG.time.fixedStepSeconds; i++) {
    updateEnemies(world, GAME_CONFIG.time.fixedStepSeconds);
  }

  const endD = Math.hypot(enemy.x - target[0], enemy.y - target[1]);
  assert.ok(endD < startD);
  assert.ok(world.coreHp < startHp);
}

function testEnemiesDamageCoreAndCanGameOver() {
  const world = createWorld(GAME_CONFIG);
  const [x, y] = world.core[0];
  const hp = world.coreHp;
  world.enemies.push({
    id: 'test-civilian-1',
    key: 'civilian',
    x,
    y,
    hp: 30,
    hpMax: 30,
    attack: 10,
    defense: 0,
    moveSpeed: 4.5,
    attackRange: 1,
    attackCooldown: 0,
  });

  updateEnemies(world, GAME_CONFIG.time.fixedStepSeconds);
  assert.equal(world.coreHp, hp - 10);
  assert.equal(world.enemies[0].attackCooldown, 2);

  world.coreHp = 5;
  world.enemies[0].attackCooldown = 0;
  updateEnemies(world, GAME_CONFIG.time.fixedStepSeconds);
  assert.equal(world.coreHp, 0);
  assert.equal(world.phase, 'gameover');
}

function testRestartStageClearsCombatPhase() {
  const world = createWorld(GAME_CONFIG);
  world.phase = 'gameover';
  world.phaseTimer = 0;
  world.nightElapsed = 12;
  world.pendingSpawns = [{ atSecond: 0, defs: [{}] }];
  world.enemies = [{ id: 'enemy' }];
  world.combat.overtimeMultiplier = 8;
  world.combat.attackCooldown = 1;
  world.combat.lastHits = [{ id: 'enemy', damage: 1 }];

  const out = applyDebugAction(world, 'restartStage', GAME_CONFIG);
  assert.equal(out.ok, true);
  assert.equal(world.phase, 'prep');
  assert.equal(world.phaseTimer, GAME_CONFIG.phases.prepSeconds);
  assert.equal(world.nightElapsed, 0);
  assert.deepEqual(world.pendingSpawns, []);
  assert.deepEqual(world.enemies, []);
  assert.equal(world.combat.overtimeMultiplier, 1);
  assert.equal(world.combat.attackCooldown, 0);
  assert.deepEqual(world.combat.lastHits, []);
}

testSpawnPositionAvoidsMines();
testPhaseStartsNightAndSpawnsFirstBatch();
testSpawnedWaveEnemyWalksToCoreAndAttacks();
testEnemiesDamageCoreAndCanGameOver();
testRestartStageClearsCombatPhase();

console.log('Step 7 tests passed');
