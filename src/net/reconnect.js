/**
 * @file        reconnect.js
 * @module      net
 * @summary     斷線重連 controller：grace 期後自動申請 reconnect token 並重新呼叫 connect；
 *              達最大重試次數後放棄並回呼 onGiveUp；成功後呼叫方須呼叫 cancel() 重置嘗試計數
 * @exports     createReconnectController, isConnectionSilent
 * @depends     net/roomManager.js
 * @sourceOfTruth Docs/game-architecture-plan.md「斷線重連機制」章節
 * @version     v0.0.42.0
 */
import { issueRoomJoinToken } from './roomManager.js';

export function createReconnectController({
  roomId,
  slotId,
  cfg,
  connect,
  graceMs = null,
  maxAttempts = null,
  maxWindowMs = null,
  onGiveUp = null,
  issueToken = issueRoomJoinToken,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const reconnectCfg = cfg?.net?.reconnect ?? {};
  const retryDelayMs = graceMs ?? reconnectCfg.retryDelayMs ?? 0;
  const attemptLimit = maxAttempts ?? reconnectCfg.maxAttempts ?? Number.POSITIVE_INFINITY;
  const reconnectWindowMs = maxWindowMs ?? reconnectCfg.maxWindowMs ?? Number.POSITIVE_INFINITY;
  let timer = 0;
  let attempts = 0;
  let deadlineAt = 0;
  let gaveUp = false;

  const giveUp = () => {
    if (gaveUp) return;
    gaveUp = true;
    clearTimer(timer);
    timer = 0;
    onGiveUp?.();
  };

  const controller = {
    startWindow(windowStartedAtMs = now()) {
      if (gaveUp) return;
      if (!deadlineAt) deadlineAt = windowStartedAtMs + reconnectWindowMs;
      if (now() >= deadlineAt) giveUp();
    },
    schedule(windowStartedAtMs = null) {
      clearTimer(timer);
      if (gaveUp) return;
      const currentMs = now();
      controller.startWindow(windowStartedAtMs ?? currentMs);
      if (gaveUp) return;
      const remainingMs = deadlineAt - currentMs;
      if (attempts >= attemptLimit || remainingMs <= 0) return giveUp();

      timer = setTimer(() => {
        timer = 0;
        if (now() >= deadlineAt) return giveUp();
        controller.reconnect().catch(() => controller.schedule());
      }, Math.min(retryDelayMs, remainingMs));
    },
    cancel() {
      clearTimer(timer);
      timer = 0;
      attempts = 0;
      deadlineAt = 0;
      gaveUp = false;
    },
    async reconnect() {
      if (gaveUp) throw new Error('reconnect window expired');
      const remainingMs = deadlineAt ? deadlineAt - now() : null;
      if (remainingMs !== null && remainingMs <= 0) {
        giveUp();
        throw new Error('reconnect window expired');
      }
      attempts += 1;
      const resolvedSlotId = typeof slotId === 'function' ? slotId() : slotId;
      const token = await issueToken({ room_id: roomId, join_type: 'reconnect', slot_id: resolvedSlotId }, cfg);
      return connect?.({
        roomId,
        token,
        slotId: resolvedSlotId,
        ...(remainingMs === null ? {} : { remainingMs }),
      });
    },
  };
  return controller;
}

export function isConnectionSilent(lastReceivedAt, currentMs, timeoutMs) {
  if (!Number.isFinite(lastReceivedAt) || !Number.isFinite(currentMs) || !Number.isFinite(timeoutMs)) return false;
  return currentMs - lastReceivedAt >= timeoutMs;
}
