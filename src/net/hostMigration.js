/**
 * @file        hostMigration.js
 * @module      net
 * @summary     Host Migration controller：偵測到房主斷線後，candidate_host 執行 CAS 更新 current_host_peer_id
 * @exports     createHostMigrationController
 * @depends     net/roomManager.js
 * @sourceOfTruth Docs/game-architecture-plan.md「Host Migration」章節
 * @version     v0.0.14.0
 */
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
