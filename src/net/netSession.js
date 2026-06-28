/**
 * @file        netSession.js
 * @module      net
 * @summary     多人會話入口：依 role 啟動 peerHost 或 peerClient，回傳統一 session 介面；parseNetLaunch 解析 URL 參數
 * @exports     createNetSession, parseNetLaunch
 * @depends     net/protocol.js, net/peerHost.js, net/peerClient.js
 * @version     v0.0.20.0
 */
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
  client.sendInput = (input) => {
    client.send(makeMessage(MSG.INPUT, input));
  };
  return client;
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
