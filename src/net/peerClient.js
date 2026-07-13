/**
 * @file        peerClient.js
 * @module      net
 * @summary     PeerJS 客戶端（非房主玩家）：加入房間、取 room_join_token、連線房主、完成 auth handshake；
 *              斷線後自動排程重連（沿用同一個 Peer 物件，重新 issue reconnect token + 重做 handshake）
 * @exports     startPeerClient
 * @depends     net/protocol.js, net/peerRuntime.js, net/roomManager.js, net/reconnect.js
 * @version     v0.0.42.0
 */
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { MSG, decode, encode, makeMessage } from './protocol.js';
import { createPeer, waitForPeerOpen } from './peerRuntime.js';
import { getRoom, issueRoomJoinToken } from './roomManager.js';
import { createReconnectController, isConnectionSilent } from './reconnect.js';

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
  let browserOffline = false;
  let disconnectedNotified = false;
  let connected = false;
  let lastHostMessageAt = Date.now();
  let hostWatchdogTimer = 0;

  const isBrowserOffline = () => (
    typeof globalThis.navigator !== 'undefined'
      && globalThis.navigator.onLine === false
  );
  const notifyDisconnected = () => {
    if (disconnectedNotified) return;
    disconnectedNotified = true;
    onDisconnected?.();
  };
  const scheduleReconnect = () => {
    if (closing || isBrowserOffline()) return;
    reconnectCtl.schedule();
  };
  const handleBrowserOffline = () => {
    if (closing || !client.slotId) return;
    browserOffline = true;
    notifyDisconnected();
    reconnectCtl.startWindow(Date.now());
    client.conn?.close?.();
  };
  const handleBrowserOnline = () => {
    if (closing || !browserOffline) return;
    browserOffline = false;
    scheduleReconnect();
  };

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
      stopHostWatchdog();
      removeNetworkListeners();
      client.conn?.close?.();
      peer.destroy?.();
    },
  };

  const addNetworkListeners = () => {
    globalThis.addEventListener?.('offline', handleBrowserOffline);
    globalThis.addEventListener?.('online', handleBrowserOnline);
  };
  const removeNetworkListeners = () => {
    globalThis.removeEventListener?.('offline', handleBrowserOffline);
    globalThis.removeEventListener?.('online', handleBrowserOnline);
  };

  const startHostWatchdog = () => {
    if (hostWatchdogTimer) return;
    hostWatchdogTimer = setInterval(() => {
      const currentMs = Date.now();
      if (closing || browserOffline || !connected) return;
      if (!isConnectionSilent(lastHostMessageAt, currentMs, cfg.net.reconnect.offlineDetectionMs)) return;

      connected = false;
      notifyDisconnected();
      reconnectCtl.schedule(lastHostMessageAt);
      client.conn?.close?.();
    }, cfg.net.reconnect.healthCheckIntervalMs);
  };

  const stopHostWatchdog = () => {
    clearInterval(hostWatchdogTimer);
    hostWatchdogTimer = 0;
  };

  const reconnectCtl = createReconnectController({
    roomId,
    slotId: () => client.slotId,
    cfg,
    graceMs: cfg.net.reconnect.retryDelayMs,
    maxAttempts: cfg.net.reconnect.maxAttempts,
    maxWindowMs: cfg.net.reconnect.maxWindowMs,
    onGiveUp: () => onReconnectFailed?.(),
    connect: async ({ token: reconnectToken, remainingMs }) => {
      try {
        await attemptConnect(reconnectToken, remainingMs);
        reconnectCtl.cancel();
        disconnectedNotified = false;
        onReconnected?.();
      } catch (err) {
        console.warn('[net] reconnect attempt failed', err);
        scheduleReconnect();
      }
    },
  });

  function attemptConnect(joinToken, remainingMs = null) {
    if (remainingMs !== null && remainingMs <= 0) {
      return Promise.reject(new Error('reconnect window expired'));
    }
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
        connected = false;
        clearTimeout(timer);
        conn.close?.();
        reject(error);
      };
      const authTimeoutMs = remainingMs === null
        ? cfg.net.reconnect.clientAuthTimeoutMs
        : Math.min(cfg.net.reconnect.clientAuthTimeoutMs, remainingMs);
      timer = setTimeout(() => fail(new Error('auth timeout')), authTimeoutMs);

      conn.on('open', () => {
        conn.send(encode(makeMessage(MSG.AUTH, { token: joinToken, roomId })));
      });
      conn.on('data', (raw) => {
        lastHostMessageAt = Date.now();
        const message = decode(raw);
        if (!authed && message.type === MSG.AUTH_OK) {
          authed = true;
          connected = true;
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
        connected = false;
        if (!authed) {
          fail(new Error('connection closed before auth'));
          return;
        }
        if (closing) return;
        notifyDisconnected();
        scheduleReconnect();
      });
    });
  }

  addNetworkListeners();
  await attemptConnect(initialToken);
  startHostWatchdog();
  return client;
}
