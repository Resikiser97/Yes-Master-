/**
 * @file        reconnect.js
 * @module      net
 * @summary     斷線重連 controller：grace 期後自動申請 reconnect token 並重新呼叫 connect
 * @exports     createReconnectController
 * @depends     net/roomManager.js
 * @sourceOfTruth Docs/game-architecture-plan.md「斷線重連機制」章節
 * @version     v0.0.19.0
 */
import { issueRoomJoinToken } from './roomManager.js';

export function createReconnectController({ roomId, slotId, cfg, connect, graceMs = 3000 } = {}) {
  let timer = 0;
  return {
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => this.reconnect(), graceMs);
    },
    cancel() {
      clearTimeout(timer);
      timer = 0;
    },
    async reconnect() {
      const token = await issueRoomJoinToken({ room_id: roomId, join_type: 'reconnect', slot_id: slotId }, cfg);
      return connect?.({ roomId, token, slotId });
    },
  };
}
