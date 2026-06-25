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
