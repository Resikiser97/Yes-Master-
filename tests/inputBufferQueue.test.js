import assert from 'node:assert/strict';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createWorld } from '../src/game/world.js';
import { createInputBuffer } from '../src/net/inputBuffer.js';

function fakeClock(startAt = 0) {
  let t = startAt;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
  };
}

function testFreshInputIsProcessed() {
  const clock = fakeClock(0);
  const buffer = createInputBuffer({ cfg: GAME_CONFIG, now: clock.now, maxQueueAgeMs: 5000 });
  const world = createWorld(GAME_CONFIG);
  const rejected = [];

  buffer.push('p1', { sequenceId: 0, connectionEpoch: 1, move: { x: 0, y: 0 } });
  clock.advance(1000);
  buffer.drain(world, GAME_CONFIG.time.fixedStepSeconds, (playerId, reason) => rejected.push(reason));

  assert.deepEqual(rejected, [], 'input within maxQueueAgeMs should not be rejected for staleness');
}

function testStaleQueuedInputIsDiscarded() {
  const clock = fakeClock(0);
  const buffer = createInputBuffer({ cfg: GAME_CONFIG, now: clock.now, maxQueueAgeMs: 5000 });
  const world = createWorld(GAME_CONFIG);
  const rejected = [];

  buffer.push('p1', { sequenceId: 0, connectionEpoch: 1, move: { x: 1, y: 0 } });
  clock.advance(5001);
  buffer.drain(world, GAME_CONFIG.time.fixedStepSeconds, (playerId, reason) => rejected.push(reason));

  assert.deepEqual(rejected, ['stale_queue']);
}

function testMixedFreshAndStaleInputsInSameDrain() {
  const clock = fakeClock(0);
  const buffer = createInputBuffer({ cfg: GAME_CONFIG, now: clock.now, maxQueueAgeMs: 5000 });
  const world = createWorld(GAME_CONFIG);
  const rejected = [];

  buffer.push('p1', { sequenceId: 0, connectionEpoch: 1, move: { x: 0, y: 0 } });
  clock.advance(6000);
  buffer.push('p1', { sequenceId: 1, connectionEpoch: 1, move: { x: 0, y: 0 } });
  buffer.drain(world, GAME_CONFIG.time.fixedStepSeconds, (playerId, reason) => rejected.push(reason));

  assert.deepEqual(rejected, ['stale_queue'], 'only the old queued input should be rejected as stale');
}

testFreshInputIsProcessed();
testStaleQueuedInputIsDiscarded();
testMixedFreshAndStaleInputsInSameDrain();

console.log('inputBufferQueue tests passed');
