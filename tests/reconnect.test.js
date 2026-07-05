import assert from 'node:assert/strict';

import { createReconnectController } from '../src/net/reconnect.js';

function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testReconnectUsesResolvedSlotAndInjectedTokenIssuer() {
  const calls = [];
  const controller = createReconnectController({
    roomId: 'room-1',
    slotId: () => 'p2',
    cfg: { test: true },
    issueToken: async (args, cfg) => {
      calls.push({ args, cfg });
      return 'token-1';
    },
    connect: async (args) => {
      calls.push({ connect: args });
      return 'connected';
    },
  });

  const result = await controller.reconnect();
  assert.equal(result, 'connected');
  assert.deepEqual(calls[0].args, { room_id: 'room-1', join_type: 'reconnect', slot_id: 'p2' });
  assert.deepEqual(calls[0].cfg, { test: true });
  assert.deepEqual(calls[1].connect, { roomId: 'room-1', token: 'token-1', slotId: 'p2' });
}

async function testScheduleStopsAtMaxAttemptsAndCallsGiveUp() {
  let reconnects = 0;
  let giveUps = 0;
  const controller = createReconnectController({
    roomId: 'room-1',
    slotId: 'p2',
    graceMs: 0,
    maxAttempts: 1,
    issueToken: async () => 'token-1',
    connect: async () => { reconnects += 1; },
    onGiveUp: () => { giveUps += 1; },
  });

  controller.schedule();
  await delay();
  controller.schedule();
  await delay();

  assert.equal(reconnects, 1);
  assert.equal(giveUps, 1);
}

async function testCancelResetsAttemptCounter() {
  let reconnects = 0;
  let giveUps = 0;
  const controller = createReconnectController({
    roomId: 'room-1',
    slotId: 'p2',
    graceMs: 0,
    maxAttempts: 1,
    issueToken: async () => 'token-1',
    connect: async () => { reconnects += 1; },
    onGiveUp: () => { giveUps += 1; },
  });

  controller.schedule();
  await delay();
  controller.cancel();
  controller.schedule();
  await delay();

  assert.equal(reconnects, 2);
  assert.equal(giveUps, 0);
}

await testReconnectUsesResolvedSlotAndInjectedTokenIssuer();
await testScheduleStopsAtMaxAttemptsAndCallsGiveUp();
await testCancelResetsAttemptCounter();

console.log('reconnect tests passed');
