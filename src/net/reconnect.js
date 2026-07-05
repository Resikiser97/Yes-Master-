/**
 * @file        reconnect.js
 * @module      net
 * @summary     斷線重連 controller：grace 期後自動申請 reconnect token 並重新呼叫 connect；
 *              達最大重試次數後放棄並回呼 onGiveUp；成功後呼叫方須呼叫 cancel() 重置嘗試計數
 * @exports     createReconnectController
 * @depends     net/roomManager.js
 * @sourceOfTruth Docs/game-architecture-plan.md「斷線重連機制」章節
 * @version     v0.0.36.0
 */
import { issueRoomJoinToken } from './roomManager.js';

export function createReconnectController({
  roomId,
  slotId,
  cfg,
  connect,
  graceMs = 3000,
  maxAttempts = 5,
  onGiveUp = null,
  issueToken = issueRoomJoinToken,
} = {}) {
  let timer = 0;
  let attempts = 0;
  const controller = {
    schedule() {
      clearTimeout(timer);
      if (attempts >= maxAttempts) {
        onGiveUp?.();
        return;
      }
      timer = setTimeout(() => {
        controller.reconnect().catch(() => controller.schedule());
      }, graceMs);
    },
    cancel() {
      clearTimeout(timer);
      timer = 0;
      attempts = 0;
    },
    async reconnect() {
      attempts += 1;
      const resolvedSlotId = typeof slotId === 'function' ? slotId() : slotId;
      const token = await issueToken({ room_id: roomId, join_type: 'reconnect', slot_id: resolvedSlotId }, cfg);
      return connect?.({ roomId, token, slotId: resolvedSlotId });
    },
  };
  return controller;
}
