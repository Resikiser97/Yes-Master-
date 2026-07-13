import assert from 'node:assert/strict';

import { createReconnectController, isConnectionSilent } from '../src/net/reconnect.js';

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

async function testReconnectWindowCapsAttemptAndGivesUpAtDeadline() {
  let currentMs = 1000;
  let scheduled = null;
  let giveUps = 0;
  let connectArgs = null;
  const controller = createReconnectController({
    roomId: 'room-1',
    slotId: 'p2',
    graceMs: 3000,
    maxAttempts: 10,
    maxWindowMs: 30000,
    now: () => currentMs,
    setTimer: (callback, delayMs) => {
      scheduled = { callback, delayMs };
      return 1;
    },
    clearTimer: () => { scheduled = null; },
    issueToken: async () => 'token-1',
    connect: async (args) => { connectArgs = args; },
    onGiveUp: () => { giveUps += 1; },
  });

  controller.schedule();
  assert.equal(scheduled.delayMs, 3000);

  currentMs = 30000;
  await controller.reconnect();
  assert.equal(connectArgs.remainingMs, 1000);

  currentMs = 31000;
  controller.schedule();
  assert.equal(giveUps, 1);
  assert.equal(scheduled, null);
}

function testConnectionSilentThreshold() {
  assert.equal(isConnectionSilent(1000, 15999, 15000), false);
  assert.equal(isConnectionSilent(1000, 16000, 15000), true);
  assert.equal(isConnectionSilent(Number.NaN, 16000, 15000), false);
}

function testOfflineWindowDoesNotRestartAfterDeadline() {
  let currentMs = 1000;
  let giveUps = 0;
  const controller = createReconnectController({
    maxWindowMs: 30000,
    now: () => currentMs,
    clearTimer: () => {},
    onGiveUp: () => { giveUps += 1; },
  });

  controller.startWindow();
  currentMs = 31001;
  controller.schedule();
  assert.equal(giveUps, 1);
}

await testReconnectUsesResolvedSlotAndInjectedTokenIssuer();
await testScheduleStopsAtMaxAttemptsAndCallsGiveUp();
await testCancelResetsAttemptCounter();
await testReconnectWindowCapsAttemptAndGivesUpAtDeadline();
testConnectionSilentThreshold();
testOfflineWindowDoesNotRestartAfterDeadline();

console.log('reconnect tests passed');
