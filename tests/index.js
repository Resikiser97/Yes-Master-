import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld } from '../src/game/world.js';
import { updatePhase } from '../src/game/phaseRuntime.js';
import { updateEnemies, updateCoreCombat } from '../src/game/combatRuntime.js';
import { applyDebugAction } from '../src/game/actions.js';
import { spawnPositions } from '../src/logic/spawnPosition.js';
import './cardEffect.test.js';
import './cardOffer.test.js';
import './drops.test.js';
import './actions-mining.test.js';
import './import-smoke.test.js';
import './mobileLayout.test.js';
import './saveManager.test.js';
import './uiState.test.js';
import './multiplayerState.test.js';
import './multiplayerInput.test.js';
import './cardVote.test.js';
import './roomManager.test.js';
import './coreSnapshot.test.js';

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
  assert.equal(positions[0].x, 86);
  assert.equal(positions[1].x, 14);
  assert.equal(positions[0].y, 91);
  assert.equal(positions[1].y, 91);
}

function testPhaseStartsNightAndSpawnsFirstBatch() {
  const world = createWorld(GAME_CONFIG);
  world.stage = 1;
  world.phaseTimer = 0;

  updatePhase(world, GAME_CONFIG.time.fixedStepSeconds, GAME_CONFIG);
  assert.equal(world.phase, 'day');
  assert.equal(world.enemies.length, 0);

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
  world.vfx.timer = 0.25;
  world.vfx.bolts = [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], chainIdx: 0 }];
  world.debugPaused = true;

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
  assert.equal(world.vfx.timer, 0);
  assert.deepEqual(world.vfx.bolts, []);
  assert.equal(world.debugPaused, false);
}

function testDebugTogglePause() {
  const world = createWorld(GAME_CONFIG);
  assert.equal(world.debugPaused, false);

  const pauseOut = applyDebugAction(world, 'togglePause', GAME_CONFIG);
  assert.equal(pauseOut.ok, true);
  assert.equal(pauseOut.paused, true);
  assert.equal(world.debugPaused, true);

  const resumeOut = applyDebugAction(world, 'togglePause', GAME_CONFIG);
  assert.equal(resumeOut.ok, true);
  assert.equal(resumeOut.paused, false);
  assert.equal(world.debugPaused, false);
}

function testCoreCombatCreatesFixedVfxBolts() {
  const world = createWorld(GAME_CONFIG);
  world.phase = 'night';
  world.combat.attackCooldown = 0;
  world.enemies.push({
    id: 'test-vfx-1',
    key: 'civilian',
    x: world.coreCenter.x + 2,
    y: world.coreCenter.y,
    hp: 30,
    hpMax: 30,
    attack: 1,
    defense: 0,
    moveSpeed: 0,
    attackRange: 1,
    attackCooldown: 0,
  });

  updateCoreCombat(world, 0, GAME_CONFIG);
  assert.equal(world.vfx.timer, 0.45);
  assert.equal(world.vfx.bolts.length, 1);
  assert.equal(world.vfx.bolts[0].chainIdx, 0);
  assert.ok(world.vfx.bolts[0].points.length > 2);
  assert.ok(world.vfx.bolts[0].points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));

  const attackCooldown = world.combat.attackCooldown;
  world.combat.lastHitTimer = 0;
  world.enemies = [];
  updateCoreCombat(world, 0.45, GAME_CONFIG);
  assert.equal(world.vfx.timer, 0);
  assert.deepEqual(world.vfx.bolts, []);
  assert.equal(world.combat.attackCooldown, attackCooldown);
}

testSpawnPositionAvoidsMines();
testPhaseStartsNightAndSpawnsFirstBatch();
testSpawnedWaveEnemyWalksToCoreAndAttacks();
testEnemiesDamageCoreAndCanGameOver();
testRestartStageClearsCombatPhase();
testDebugTogglePause();
testCoreCombatCreatesFixedVfxBolts();

console.log(`All tests passed (${GAME_CONFIG.version})`);
