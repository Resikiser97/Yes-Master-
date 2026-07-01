import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createPlayerState, createWorld } from '../src/game/world.js';
import { eligibleCardVotePlayerIds, submitCardVote } from '../src/game/phaseRuntime.js';
import { applyDelta, applySnapshot, serializeDelta, serializeSnapshot } from '../src/net/stateSync.js';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function makeCardWorld(playerIds = ['local'], onlineFlags = {}) {
  const world = createWorld(GAME_CONFIG);
  world.phase = 'cardOffer';
  world.pendingCardOffer = [
    { key: 'ironFangCore', effect: { kind: 'coreStat', stat: 'attack', add: 2 } },
    { key: 'towerCraft', effect: { kind: 'modifier', mods: [{ stat: 'heightBonusPct', pct: 10 }] } },
    { key: 'spiritBeat', effect: { kind: 'playerStat', stat: 'spirit', add: 20 } },
  ];
  world.cardVotes = {};
  world.players = new Map(playerIds.map((id) => {
    const player = createPlayerState(id, GAME_CONFIG);
    player.spirit = 0;
    player.online = onlineFlags[id] !== false;
    return [id, player];
  }));
  world.localPlayerId = playerIds[0];
  return world;
}

function testSinglePlayerVoteResolvesImmediately() {
  const world = makeCardWorld(['local']);
  submitCardVote(world, 'local', 0, GAME_CONFIG);
  assert.equal(world.phase, 'prep');
  assert.equal(world.pendingCardOffer, null);
  assert.equal(world.cardBonuses?.attack, 2, 'ironFangCore effect should apply');
}

function testMultiFirstVoteDoesNotResolve() {
  const world = makeCardWorld(['p1', 'p2']);
  submitCardVote(world, 'p1', 0, GAME_CONFIG);
  assert.equal(world.phase, 'cardOffer');
  assert.notEqual(world.pendingCardOffer, null);
}

function testMajorityWinsAndEffectApplies() {
  const world = makeCardWorld(['p1', 'p2', 'p3']);
  submitCardVote(world, 'p1', 1, GAME_CONFIG);
  submitCardVote(world, 'p2', 0, GAME_CONFIG);
  submitCardVote(world, 'p3', 1, GAME_CONFIG);
  assert.equal(world.phase, 'prep');
  assert.ok(
    (world.cardModifiers ?? []).some((m) => m.stat === 'heightBonusPct'),
    'towerCraft modifier should be applied',
  );
}

function testTiebreakPrefersLowerIndex() {
  const world = makeCardWorld(['p1', 'p2']);
  submitCardVote(world, 'p1', 2, GAME_CONFIG);
  submitCardVote(world, 'p2', 0, GAME_CONFIG);
  assert.equal(world.phase, 'prep');
  assert.equal(world.cardBonuses?.attack, 2, 'index 0 should win tiebreak');
}

function testOfflinePlayerDoesNotBlockVote() {
  const world = makeCardWorld(['p1', 'p2', 'p3'], { p3: false });
  assert.deepEqual(eligibleCardVotePlayerIds(world), ['p1', 'p2']);
  submitCardVote(world, 'p1', 0, GAME_CONFIG);
  submitCardVote(world, 'p2', 0, GAME_CONFIG);
  assert.equal(world.phase, 'prep', 'offline player should not block resolution');
}

function testBadIndexIsIgnored() {
  const world = makeCardWorld(['p1', 'p2']);
  submitCardVote(world, 'p1', 0, GAME_CONFIG);
  submitCardVote(world, 'p2', NaN, GAME_CONFIG);
  assert.equal(world.phase, 'cardOffer');
  assert.ok(hasOwn(world.cardVotes, 'p1'), 'valid vote preserved');
  submitCardVote(world, 'p2', 'abc', GAME_CONFIG);
  assert.equal(world.phase, 'cardOffer');
  submitCardVote(world, 'p2', 99, GAME_CONFIG);
  assert.equal(world.phase, 'cardOffer');
  submitCardVote(world, 'p2', 1, GAME_CONFIG);
  assert.equal(world.phase, 'prep', 'valid vote should still resolve');
}

function testCardVotesSnapshotRoundtrip() {
  const world = makeCardWorld(['p1', 'p2']);
  submitCardVote(world, 'p1', 0, GAME_CONFIG);
  const snap = serializeSnapshot(world);
  assert.ok(hasOwn(snap, 'cardVotes'), 'cardVotes should be in snapshot');
  assert.equal(snap.cardVotes?.p1, 0);

  const fresh = createWorld(GAME_CONFIG);
  applySnapshot(fresh, snap, GAME_CONFIG);
  assert.equal(fresh.cardVotes?.p1, 0, 'cardVotes should survive snapshot roundtrip');
}

function testCardVotesDeltaRoundtrip() {
  const world = makeCardWorld(['p1', 'p2']);
  const prevSnap = serializeSnapshot(world);
  submitCardVote(world, 'p1', 0, GAME_CONFIG);
  world.syncTick = (world.syncTick ?? 0) + 1;

  const delta = serializeDelta(prevSnap, world);
  assert.ok(hasOwn(delta, 'cardVotes'), 'delta should carry cardVotes');
  assert.equal(delta.cardVotes?.p1, 0);

  const client = makeCardWorld(['p1', 'p2']);
  applyDelta(client, delta, GAME_CONFIG);
  assert.equal(client.cardVotes?.p1, 0, 'client should see p1 vote via delta');
}

testSinglePlayerVoteResolvesImmediately();
testMultiFirstVoteDoesNotResolve();
testMajorityWinsAndEffectApplies();
testTiebreakPrefersLowerIndex();
testOfflinePlayerDoesNotBlockVote();
testBadIndexIsIgnored();
testCardVotesSnapshotRoundtrip();
testCardVotesDeltaRoundtrip();

console.log('cardVote tests passed');
