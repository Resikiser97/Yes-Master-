import assert from 'node:assert/strict';

import { createInputValidator } from '../src/net/validation.js';

function baseInput(overrides = {}) {
  return { sequenceId: 0, connectionEpoch: 1, move: { x: 0, y: 0 }, action: null, ...overrides };
}

function testMissingOrInvalidEpochIsRejected() {
  const validate = createInputValidator({ cfg: {} });
  assert.equal(validate(baseInput({ connectionEpoch: undefined }), { playerId: 'p1' }).reason, 'bad_epoch');
  assert.equal(validate(baseInput({ connectionEpoch: 0 }), { playerId: 'p1' }).reason, 'bad_epoch');
  assert.equal(validate(baseInput({ connectionEpoch: -1 }), { playerId: 'p1' }).reason, 'bad_epoch');
  assert.equal(validate(baseInput({ connectionEpoch: 1.5 }), { playerId: 'p1' }).reason, 'bad_epoch');
}

function testSameEpochSequenceMonotonic() {
  const validate = createInputValidator({ cfg: {} });
  assert.equal(validate(baseInput({ sequenceId: 0, connectionEpoch: 1 }), { playerId: 'p1' }).ok, true);
  assert.equal(validate(baseInput({ sequenceId: 1, connectionEpoch: 1 }), { playerId: 'p1' }).ok, true);
  assert.equal(validate(baseInput({ sequenceId: 1, connectionEpoch: 1 }), { playerId: 'p1' }).reason, 'replay');
  assert.equal(validate(baseInput({ sequenceId: 0, connectionEpoch: 1 }), { playerId: 'p1' }).reason, 'replay');
}

function testNewEpochResetsSequenceBaseline() {
  const validate = createInputValidator({ cfg: {} });
  assert.equal(validate(baseInput({ sequenceId: 50, connectionEpoch: 1 }), { playerId: 'p1' }).ok, true);
  assert.equal(
    validate(baseInput({ sequenceId: 0, connectionEpoch: 2 }), { playerId: 'p1' }).ok,
    true,
    'new epoch should reset sequence baseline, not be rejected as replay',
  );
  assert.equal(validate(baseInput({ sequenceId: 1, connectionEpoch: 2 }), { playerId: 'p1' }).ok, true);
}

function testStaleEpochPacketIsRejected() {
  const validate = createInputValidator({ cfg: {} });
  assert.equal(validate(baseInput({ sequenceId: 0, connectionEpoch: 2 }), { playerId: 'p1' }).ok, true);
  assert.equal(validate(baseInput({ sequenceId: 99, connectionEpoch: 1 }), { playerId: 'p1' }).reason, 'stale_epoch');
}

function testEpochStateIsPerPlayer() {
  const validate = createInputValidator({ cfg: {} });
  assert.equal(validate(baseInput({ sequenceId: 5, connectionEpoch: 3 }), { playerId: 'p1' }).ok, true);
  assert.equal(validate(baseInput({ sequenceId: 0, connectionEpoch: 1 }), { playerId: 'p2' }).ok, true);
}

testMissingOrInvalidEpochIsRejected();
testSameEpochSequenceMonotonic();
testNewEpochResetsSequenceBaseline();
testStaleEpochPacketIsRejected();
testEpochStateIsPerPlayer();

console.log('validation tests passed');
