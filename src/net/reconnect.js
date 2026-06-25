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
