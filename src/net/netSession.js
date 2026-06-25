import { GAME_CONFIG } from '../../config/gameConfig.js';
import { MSG, makeMessage } from './protocol.js';
import { startPeerHost } from './peerHost.js';
import { startPeerClient } from './peerClient.js';

export async function createNetSession({
  cfg = GAME_CONFIG,
  role = 'host',
  roomId = null,
  world = null,
  onInput = null,
  onMessage = null,
  onPeerReady = null,
} = {}) {
  if (role === 'host') {
    return startPeerHost({ roomId, cfg, world, onInput, onPeerReady });
  }
  const client = await startPeerClient({
    roomId,
    cfg,
    onMessage,
    onAuthed(payload) {
      if (world) world.localPlayerId = payload.slotId;
    },
  });
  return {
    ...client,
    sendInput(input) {
      client.send(makeMessage(MSG.INPUT, input));
    },
  };
}

export function parseNetLaunch(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  if (mode !== 'multi') return { mode: 'single' };
  return {
    mode: 'multi',
    role: params.get('role') === 'client' ? 'client' : 'host',
    roomId: params.get('room') ?? params.get('room_id') ?? null,
    token: params.get('token') ?? null,
  };
}
