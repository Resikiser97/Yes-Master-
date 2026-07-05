/**
 * @file        peerClient.js
 * @module      net
 * @summary     PeerJS 客戶端（非房主玩家）：加入房間、取 room_join_token、連線房主、完成 auth handshake；
 *              斷線後自動排程重連（沿用同一個 Peer 物件，重新 issue reconnect token + 重做 handshake）
 * @exports     startPeerClient
 * @depends     net/protocol.js, net/peerRuntime.js, net/roomManager.js, net/reconnect.js
 * @version     v0.0.36.0
 */
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { MSG, decode, encode, makeMessage } from './protocol.js';
import { createPeer, waitForPeerOpen } from './peerRuntime.js';
import { getRoom, issueRoomJoinToken } from './roomManager.js';
import { createReconnectController } from './reconnect.js';

export async function startPeerClient({
  roomId,
  cfg = GAME_CONFIG,
  token = null,
  onMessage = null,
  onAuthed = null,
  onDisconnected = null,
  onReconnected = null,
  onReconnectFailed = null,
} = {}) {
  if (!roomId) throw new Error('roomId is required');
  const room = await getRoom(roomId, cfg);
  const hostPeerId = room.current_host_peer_id;
  if (!hostPeerId) throw new Error('room has no host peer id');
  const initialToken = token ?? await issueRoomJoinToken({ room_id: roomId, join_type: 'join' }, cfg);

  const peer = await createPeer(cfg);
  await waitForPeerOpen(peer);

  let closing = false;

  const client = {
    role: 'client',
    peer,
    conn: null,
    slotId: null,
    hostPeerId,
    connectionEpoch: null,
    isHost: () => false,
    send(message) {
      if (client.conn?.open === false) return;
      client.conn?.send(encode(message));
    },
    sendInput(input) {
      client.send(makeMessage(MSG.INPUT, input));
    },
    _onMessage: onMessage,
    close() {
      closing = true;
      reconnectCtl.cancel();
      client.conn?.close?.();
      peer.destroy?.();
    },
  };

  const reconnectCtl = createReconnectController({
    roomId,
    slotId: () => client.slotId,
    cfg,
    onGiveUp: () => onReconnectFailed?.(),
    connect: async ({ token: reconnectToken }) => {
      try {
        await attemptConnect(reconnectToken);
        reconnectCtl.cancel();
        onReconnected?.();
      } catch (err) {
        console.warn('[net] reconnect attempt failed', err);
        reconnectCtl.schedule();
      }
    },
  });

  function attemptConnect(joinToken) {
    return new Promise((resolve, reject) => {
      const conn = peer.connect(hostPeerId, { reliable: true });
      client.conn = conn;
      let authed = false;
      let settled = false;
      let timer = 0;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        conn.close?.();
        reject(error);
      };
      timer = setTimeout(() => fail(new Error('auth timeout')), 8000);

      conn.on('open', () => {
        conn.send(encode(makeMessage(MSG.AUTH, { token: joinToken, roomId })));
      });
      conn.on('data', (raw) => {
        const message = decode(raw);
        if (!authed && message.type === MSG.AUTH_OK) {
          authed = true;
          client.slotId = message.payload.slotId;
          client.connectionEpoch = message.payload.connectionEpoch ?? null;
          onAuthed?.(message.payload);
          finish(resolve);
          return;
        }
        if (!authed && message.type === MSG.AUTH_FAIL) {
          fail(new Error(message.payload?.reason ?? 'auth failed'));
          return;
        }
        if (message.type === MSG.PING) {
          client.send(makeMessage(MSG.PONG, { t: message.payload?.t ?? Date.now() }));
          return;
        }
        client._onMessage?.(message);
      });
      conn.on('error', (err) => fail(err));
      conn.on('close', () => {
        if (client.conn !== conn) return;
        if (!authed) {
          fail(new Error('connection closed before auth'));
          return;
        }
        if (closing) return;
        onDisconnected?.();
        reconnectCtl.schedule();
      });
    });
  }

  await attemptConnect(initialToken);
  return client;
}
