import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld, ensurePlayer } from '../src/game/world.js';
import { updateEnemies } from '../src/game/combatRuntime.js';
import { createInputValidator } from '../src/net/validation.js';
import { applyInput, serializeControls } from '../src/net/inputBuffer.js';
import { key } from '../src/logic/connectivity.js';

function multiConfig() {
  return { ...GAME_CONFIG, mode: 'multi' };
}

function testMovementInputsAreNotRateLimited() {
  const cfg = multiConfig();
  const world = createWorld(cfg);
  ensurePlayer(world, 'p2', cfg);
  const validate = createInputValidator({ cfg });

  for (let i = 0; i < 10; i++) {
    const out = validate({ sequenceId: i, move: { x: 1, y: 0 }, action: null }, { world, playerId: 'p2' });
    assert.equal(out.ok, true);
  }
}

function testMultiplayerEnemiesDoNotUseFatigueAsHp() {
  const cfg = multiConfig();
  const world = createWorld(cfg);
  world.cfg = cfg;
  world.phase = 'night';
  world.coreHp = 50;
  const player = ensurePlayer(world, 'p2', cfg);
  player.x = world.core[0][0];
  player.y = world.core[0][1];
  player.fatigue = 60;
  const [x, y] = world.core[0];
  world.enemies.push({
    id: 'test-enemy',
    key: 'civilian',
    x,
    y,
    hp: 10,
    hpMax: 10,
    attack: 5,
    defense: 0,
    moveSpeed: 0,
    attackRange: 1,
    attackCooldown: 0,
  });

  updateEnemies(world, cfg.time.fixedStepSeconds);
  assert.equal(player.fatigue, 60);
  assert.equal(world.coreHp, 45);
}

testMovementInputsAreNotRateLimited();
testMultiplayerEnemiesDoNotUseFatigueAsHp();

function testClientDebugGrantRunsOnHost() {
  const cfg = multiConfig();
  const world = createWorld(cfg);
  ensurePlayer(world, 'p2', cfg);
  const before = { ...world.storage };

  applyInput(world, 'p2', {
    sequenceId: 1,
    move: { x: 0, y: 0 },
    debugActions: ['grantResources'],
  }, cfg.time.fixedStepSeconds, cfg);

  assert.equal(world.storage.dirt, (before.dirt ?? 0) + 10);
  assert.equal(world.storage.sand, (before.sand ?? 0) + 10);
  assert.equal(world.storage.stone, (before.stone ?? 0) + 10);
}

testClientDebugGrantRunsOnHost();

function placePlayerOnCore(world, playerId, cfg) {
  const player = ensurePlayer(world, playerId, cfg);
  player.x = world.core[0][0];
  player.y = world.core[0][1];
  player.prevX = player.x;
  player.prevY = player.y;
  return player;
}

function testClientCanToggleBuildPlanOnHost() {
  const cfg = multiConfig();
  const world = createWorld(cfg);
  placePlayerOnCore(world, 'p2', cfg);

  applyInput(world, 'p2', {
    sequenceId: 2,
    move: { x: 0, y: 0 },
    actions: [{ kind: 'buildPlanToggle' }],
  }, cfg.time.fixedStepSeconds, cfg);

  assert.equal(world.buildPlanMode, true);
  assert.equal(world.buildDestroyMode, false);
}

function testClientCanPlaceBlocksOnHost() {
  const cfg = multiConfig();
  const world = createWorld(cfg);
  placePlayerOnCore(world, 'p2', cfg);
  world.storage.dirt = 2;

  applyInput(world, 'p2', {
    sequenceId: 3,
    move: { x: 0, y: 0 },
    actions: [{ kind: 'place', blockKey: 'dirt', x: 78, y: 90 }],
  }, cfg.time.fixedStepSeconds, cfg);

  assert.equal(world.dirt.has(key(78, 90)), true);
  assert.equal(world.storage.dirt, 1);
}

function testClientCanChooseCardsOnHost() {
  const cfg = multiConfig();
  const world = createWorld(cfg);
  ensurePlayer(world, 'p2', cfg);
  world.phase = 'cardOffer';
  world.pendingCardOffer = [{ key: 'ironFangCore' }];
  const attackBefore = world.coreStats.attack;

  applyInput(world, 'p2', {
    sequenceId: 4,
    move: { x: 0, y: 0 },
    actions: [{ kind: 'cardChoice', index: 0 }],
  }, cfg.time.fixedStepSeconds, cfg);

  assert.equal(world.phase, 'prep');
  assert.equal(world.pendingCardOffer, null);
  assert.equal(world.coreStats.attack, attackBefore + 2);
}

function testCardChoiceDoesNotSerializeBuildAction() {
  const cfg = multiConfig();
  const world = createWorld(cfg);
  world.phase = 'cardOffer';
  const controls = {
    mouse: { x: 0, y: 0 },
    cardOfferMode: true,
    getSelectedSlot: () => 1,
    getMoveVector: () => ({ x: 0, y: 0 }),
    isMining: () => false,
    isRepairing: () => false,
    consumeCardChoice: () => 2,
    consumePlace: () => true,
    consumeRemove: () => false,
    consumeBuildPlanToggle: () => false,
    consumeDestroyToggle: () => false,
    consumeDragRect: () => null,
  };

  const input = serializeControls(controls, world, cfg, 5);
  assert.deepEqual(input.actions, [{ kind: 'cardChoice', index: 2 }]);
}

testClientCanToggleBuildPlanOnHost();
testClientCanPlaceBlocksOnHost();
testClientCanChooseCardsOnHost();
testCardChoiceDoesNotSerializeBuildAction();

console.log('multiplayer input tests passed');
