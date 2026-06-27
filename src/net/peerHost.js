/**
 * @file        peerHost.js
 * @module      net
 * @summary     PeerJS 房主端：建立 Peer、等待連線、auth handshake（verify token）、接收 Input Event、CHAT 轉發廣播
 * @exports     startPeerHost
 * @depends     net/protocol.js, net/peerRuntime.js, net/roomManager.js, net/strikeTracker.js, game/world.js
 * @sourceOfTruth Docs/game-architecture-plan.md「P2P 安全限制 → Handshake 流程」
 * @version     v0.0.18.0
 */
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { ensurePlayer } from '../game/world.js';
import { MSG, decode, encode, makeMessage } from './protocol.js';
import { createPeer, waitForPeerOpen } from './peerRuntime.js';
import { updateHostPeer, verifyRoomJoinToken } from './roomManager.js';
import { createStrikeTracker } from './strikeTracker.js';

export async function startPeerHost({ roomId, cfg = GAME_CONFIG, world = null, onInput = null, onPeerReady = null } = {}) {
  const peer = await createPeer(cfg);
  const peerId = await waitForPeerOpen(peer);
  if (roomId) await updateHostPeer(roomId, peerId, cfg);

  const peers = new Map();
  const strikes = createStrikeTracker();
  let nextSlot = 2;

  const host = {
    role: 'host',
    peer,
    peerId,
    peers,
    isHost: () => true,
    broadcast(message) {
      for (const session of peers.values()) sendConn(session.conn, message);
    },
    broadcastExcept(excludePeer, message) {
      for (const [peerId, session] of peers) {
        if (peerId !== excludePeer) sendConn(session.conn, message);
      }
    },
    sendTo(id, message) {
      const session = peers.get(id) ?? [...peers.values()].find((item) => item.slotId === id);
      if (session) sendConn(session.conn, message);
    },
    close() {
      for (const session of peers.values()) session.conn.close?.();
      peer.destroy?.();
    },
    _onInput: onInput,
    _onPeerReady: onPeerReady,
    reserveSlot(verified) {
      if (verified.slot_id) return verified.slot_id;
      return `p${nextSlot++}`;
    },
  };

  peer.on('connection', (conn) => {
    const authTimer = setTimeout(() => {
      sendConn(conn, makeMessage(MSG.AUTH_FAIL, { reason: 'auth_timeout' }));
      conn.close?.();
    }, 5000);

    conn.on('data', async (raw) => {
      let message;
      try { message = decode(raw); } catch { return; }

      if (!peers.has(conn.peer)) {
        if (message.type !== MSG.AUTH) return;
        clearTimeout(authTimer);
        try {
          const verified = await verifyRoomJoinToken(message.payload?.token, cfg);
          if (roomId && verified.room_id !== roomId) throw new Error('room mismatch');
          const slotId = host.reserveSlot(verified);
          if (world) ensurePlayer(world, slotId, cfg);
          const session = { conn, uid: verified.uid, slotId, connectedAt: Date.now(), lastPongAt: Date.now() };
          peers.set(conn.peer, session);
          sendConn(conn, makeMessage(MSG.AUTH_OK, { slotId, peerId, hostEpoch: message.payload?.hostEpoch ?? 1 }));
          host._onPeerReady?.(conn.peer, session);
        } catch (error) {
          sendConn(conn, makeMessage(MSG.AUTH_FAIL, { reason: error.message }));
          conn.close?.();
        }
        return;
      }

      const session = peers.get(conn.peer);
      if (message.type === MSG.INPUT) {
        host._onInput?.(session.slotId, message.payload, conn.peer);
      } else if (message.type === MSG.CHAT) {
        host._onChat?.(message, conn.peer);
      } else if (message.type === MSG.PONG) {
        session.lastPongAt = Date.now();
      } else if (message.type === MSG.PING) {
        sendConn(conn, makeMessage(MSG.PONG, { t: message.payload?.t ?? Date.now() }));
      }
    });

    conn.on('close', () => {
      const session = peers.get(conn.peer);
      if (session && world?.players?.has(session.slotId)) world.players.get(session.slotId).online = false;
      peers.delete(conn.peer);
    });
    conn.on('error', () => {
      const strike = strikes.add(conn.peer, 'connection_error');
      if (strike.kicked) conn.close?.();
    });
  });

  const pingTimer = setInterval(() => {
    const now = Date.now();
    for (const [peerKey, session] of peers) {
      if (now - session.lastPongAt > 3000) {
        session.conn.close?.();
        peers.delete(peerKey);
      } else {
        sendConn(session.conn, makeMessage(MSG.PING, { t: now }));
      }
    }
  }, 1000);
  peer.on('close', () => clearInterval(pingTimer));

  return host;
}

function sendConn(conn, message) {
  if (conn?.open === false) return;
  conn?.send?.(encode(message));
}
