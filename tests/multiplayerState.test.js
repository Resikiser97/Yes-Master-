import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld, ensurePlayer } from '../src/game/world.js';
import { serializeSnapshot, applySnapshot } from '../src/net/stateSync.js';

function testPlayerAliasUpdatesLocalPlayer() {
  const world = createWorld(GAME_CONFIG);
  assert.equal(world.player.id, 'p1');

  ensurePlayer(world, 'p2', GAME_CONFIG);
  world.localPlayerId = 'p2';
  world.player = { ...world.player, x: 42 };

  assert.equal(world.players.get('p2').x, 42);
  assert.notEqual(world.players.get('p1').x, 42);
}

function testSnapshotRoundTripKeepsPlayers() {
  const world = createWorld(GAME_CONFIG);
  const p2 = ensurePlayer(world, 'p2', GAME_CONFIG);
  p2.x = 91;
  world.storage.dirt = 3;
  world.dirt.add('79,90');
  world.fore.set('79,90', 'stone');
  world.buildPlanMode = true;
  world.buildDestroyMode = true;
  world.syncTick = 7;

  const target = createWorld(GAME_CONFIG);
  target.localPlayerId = 'p2';
  applySnapshot(target, serializeSnapshot(world), GAME_CONFIG);

  assert.equal(target.syncTick, 7);
  assert.equal(target.localPlayerId, 'p2');
  assert.equal(target.players.get('p2').x, 91);
  assert.equal(target.storage.dirt, 3);
  assert.equal(target.dirt.has('79,90'), true);
  assert.equal(target.fore.get('79,90'), 'stone');
  assert.equal(target.buildPlanMode, true);
  assert.equal(target.buildDestroyMode, true);
}

testPlayerAliasUpdatesLocalPlayer();
testSnapshotRoundTripKeepsPlayers();

console.log('multiplayer state tests passed');
