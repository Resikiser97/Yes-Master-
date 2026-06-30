import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld, ensurePlayer } from '../src/game/world.js';
import { refreshCoreSnapshot } from '../src/game/coreSnapshot.js';
import { applyCardEffect } from '../src/logic/cardEffect.js';
import { serializeSnapshot, serializeDelta, applySnapshot, applyDelta } from '../src/net/stateSync.js';

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
  world.syncTick = 7;

  const target = createWorld(GAME_CONFIG);
  target.localPlayerId = 'p2';
  target.buildPlanMode = true;
  target.buildDestroyMode = true;
  const snapshot = serializeSnapshot(world);
  assert.equal('buildPlanMode' in snapshot, false);
  assert.equal('buildDestroyMode' in snapshot, false);
  applySnapshot(target, snapshot, GAME_CONFIG);

  assert.equal(target.syncTick, 7);
  assert.equal(target.localPlayerId, 'p2');
  assert.equal(target.players.get('p2').x, 91);
  assert.equal(target.storage.dirt, 3);
  assert.equal(target.dirt.has('79,90'), true);
  assert.equal(target.fore.get('79,90'), 'stone');
  assert.equal(target.buildPlanMode, true);
  assert.equal(target.buildDestroyMode, true);
}

function testSnapshotPlayerStats() {
  const world = createWorld(GAME_CONFIG);
  applyCardEffect(world, 'miningPower');
  applyCardEffect(world, 'repairInstinct');
  applyCardEffect(world, 'carryBoost');
  applyCardEffect(world, 'spiritBeat');

  const snap = serializeSnapshot(world);
  const restored = applySnapshot(null, snap, GAME_CONFIG);
  const p = restored.player;

  assert.equal(p.mining, world.player.mining);
  assert.equal(p.repair, world.player.repair);
  assert.equal(p.carry, world.player.carry);
  assert.equal(p.spirit, world.player.spirit);
  assert.equal(p.spirit, GAME_CONFIG.player.spirit + 20);
  assert.equal(p.capacity, world.player.capacity);
}

function testSnapshotCardState() {
  const world = createWorld(GAME_CONFIG);
  applyCardEffect(world, 'nightRepairShift');
  world.cardBonuses.hpMax = 25;

  const snap = serializeSnapshot(world);
  const restored = applySnapshot(null, snap, GAME_CONFIG);

  assert.deepEqual(restored.cardModifiers, world.cardModifiers);
  assert.deepEqual(restored.cardBonuses, world.cardBonuses);
}

function testDeltaCardModifiers() {
  {
    const world = createWorld(GAME_CONFIG);
    const prevSnap = serializeSnapshot(world);
    applyCardEffect(world, 'nightRepairShift');
    applyCardEffect(world, 'miningPower');
    const delta = serializeDelta(prevSnap, world);

    assert.ok('cardModifiers' in delta, 'delta missing cardModifiers');
    assert.ok('cardBonuses' in delta, 'delta missing cardBonuses');

    const client = createWorld(GAME_CONFIG);
    applyDelta(client, delta, GAME_CONFIG);

    assert.deepEqual(client.cardModifiers, world.cardModifiers);
    assert.equal(client.player.mining, world.player.mining);
  }

  {
    const world = createWorld(GAME_CONFIG);
    const baseHpMax = world.coreStats.hpMax;
    const prevSnap = serializeSnapshot(world);

    applyCardEffect(world, 'greedyMinePact');
    refreshCoreSnapshot(world, { applyHpMaxDelta: true });

    const delta = serializeDelta(prevSnap, world);
    const client = createWorld(GAME_CONFIG);
    applyDelta(client, delta, GAME_CONFIG);

    assert.deepEqual(client.cardModifiers, world.cardModifiers);
    assert.equal(client.coreStats.hpMax, baseHpMax - 10);
  }
}

testPlayerAliasUpdatesLocalPlayer();
testSnapshotRoundTripKeepsPlayers();
testSnapshotPlayerStats();
testSnapshotCardState();
testDeltaCardModifiers();

console.log('multiplayer state tests passed');
