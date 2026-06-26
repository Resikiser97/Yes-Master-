/**
 * @file        syncScheduler.js
 * @module      net
 * @summary     同步排程器：afterHostTick 每幀決定廣播 delta 或 full snapshot（每 5s 強制全量）；createClientSyncApplier 處理收到的 SNAPSHOT/DELTA 訊息
 * @exports     createHostSyncScheduler, createClientSyncApplier
 * @depends     net/protocol.js, net/stateSync.js
 * @version     v0.0.14.0
 */
import { MSG, makeMessage } from './protocol.js';
import { serializeDelta, serializeSnapshot, applyDelta, applySnapshot } from './stateSync.js';

export function createHostSyncScheduler({ session, fullSnapshotIntervalMs = 5000 } = {}) {
  let lastFullAt = 0;
  let previous = null;
  return {
    afterHostTick(world) {
      if (!session?.isHost?.()) return;
      const now = Date.now();
      if (!previous || now - lastFullAt >= fullSnapshotIntervalMs) {
        previous = serializeSnapshot(world);
        lastFullAt = now;
        session.broadcast(makeMessage(MSG.SNAPSHOT, previous));
        return;
      }
      const delta = serializeDelta(previous, world);
      previous = serializeSnapshot(world);
      session.broadcast(makeMessage(MSG.DELTA, delta));
    },
    sendSnapshotTo(peerId, world) {
      session?.sendTo?.(peerId, makeMessage(MSG.SNAPSHOT, serializeSnapshot(world)));
    },
  };
}

export function createClientSyncApplier({ worldRef, cfg } = {}) {
  return {
    handle(message) {
      if (message.type === MSG.SNAPSHOT) {
        worldRef.current = applySnapshot(worldRef.current, message.payload, cfg);
        return true;
      }
      if (message.type === MSG.DELTA) {
        worldRef.current = applyDelta(worldRef.current, message.payload, cfg);
        return true;
      }
      return false;
    },
  };
}
