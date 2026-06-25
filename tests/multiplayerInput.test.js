import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld, ensurePlayer } from '../src/game/world.js';
import { updateEnemies } from '../src/game/combatRuntime.js';
import { createInputValidator } from '../src/net/validation.js';

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

console.log('multiplayer input tests passed');
