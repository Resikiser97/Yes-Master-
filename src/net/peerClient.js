/**
 * @file        peerClient.js
 * @module      net
 * @summary     PeerJS 客戶端（非房主玩家）：加入房間、取 room_join_token、連線房主、完成 auth handshake
 * @exports     startPeerClient
 * @depends     net/protocol.js, net/peerRuntime.js, net/roomManager.js
 * @version     v0.0.18.0
 */
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { MSG, decode, encode, makeMessage } from './protocol.js';
import { createPeer, waitForPeerOpen } from './peerRuntime.js';
import { getRoom, issueRoomJoinToken } from './roomManager.js';

export async function startPeerClient({ roomId, cfg = GAME_CONFIG, token = null, onMessage = null, onAuthed = null } = {}) {
  if (!roomId) throw new Error('roomId is required');
  const room = await getRoom(roomId, cfg);
  const hostPeerId = room.current_host_peer_id;
  if (!hostPeerId) throw new Error('room has no host peer id');
  const joinToken = token ?? await issueRoomJoinToken({ room_id: roomId, join_type: 'join' }, cfg);

  const peer = await createPeer(cfg);
  await waitForPeerOpen(peer);
  const conn = peer.connect(hostPeerId, { reliable: true });

  const client = {
    role: 'client',
    peer,
    conn,
    slotId: null,
    hostPeerId,
    isHost: () => false,
    send(message) {
      if (conn.open === false) return;
      conn.send(encode(message));
    },
    sendInput(input) {
      client.send(makeMessage(MSG.INPUT, input));
    },
    _onMessage: onMessage,
    close() {
      conn.close?.();
      peer.destroy?.();
    },
  };

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('auth timeout')), 8000);
    let authed = false;
    conn.on('open', () => {
      conn.send(encode(makeMessage(MSG.AUTH, { token: joinToken, roomId })));
    });
    conn.on('data', (raw) => {
      const message = decode(raw);
      if (!authed && message.type === MSG.AUTH_OK) {
        authed = true;
        clearTimeout(timer);
        client.slotId = message.payload.slotId;
        onAuthed?.(message.payload);
        resolve();
        return;
      }
      if (!authed && message.type === MSG.AUTH_FAIL) {
        clearTimeout(timer);
        reject(new Error(message.payload?.reason ?? 'auth failed'));
        return;
      }
      if (message.type === MSG.PING) {
        client.send(makeMessage(MSG.PONG, { t: message.payload?.t ?? Date.now() }));
        return;
      }
      client._onMessage?.(message);
    });
    conn.on('error', reject);
  });

  return client;
}
