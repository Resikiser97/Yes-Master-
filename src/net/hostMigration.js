import { getRoom, updateHostPeer } from './roomManager.js';

export function createHostMigrationController({ session, roomId, cfg, onPromote } = {}) {
  let migrating = false;
  return {
    async check() {
      if (!roomId || migrating || session?.isHost?.()) return { ok: false, reason: 'not_candidate' };
      if (session?.conn?.open !== false) return { ok: false, reason: 'host_alive' };
      migrating = true;
      try {
        const room = await getRoom(roomId, cfg);
        const promoted = await onPromote?.(room);
        if (promoted?.peerId) await updateHostPeer(roomId, promoted.peerId, cfg);
        return { ok: true, promoted };
      } finally {
        migrating = false;
      }
    },
  };
}
