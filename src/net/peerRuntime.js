/**
 * @file        peerRuntime.js
 * @module      net
 * @summary     PeerJS 動態載入（esm.sh）與 Peer 實例建立；lazy singleton 防重複載入
 * @exports     loadPeerCtor, createPeer, waitForPeerOpen
 * @depends     config/gameConfig.js
 * @version     v0.0.14.1
 */
import { GAME_CONFIG } from '../../config/gameConfig.js';

let peerCtorPromise = null;

export async function loadPeerCtor() {
  if (typeof window === 'undefined') throw new Error('PeerJS is only available in the browser');
  if (!peerCtorPromise) {
    peerCtorPromise = import('https://esm.sh/peerjs@1.5.4?bundle').then((mod) => mod.Peer ?? mod.default);
  }
  return peerCtorPromise;
}

export async function createPeer(cfg = GAME_CONFIG) {
  const Peer = await loadPeerCtor();
  const net = cfg.net ?? {};
  return new Peer(undefined, {
    host: net.peerJsHost ?? '0.peerjs.com',
    port: net.peerJsPort ?? 443,
    secure: net.peerJsSecure ?? true,
    debug: net.peerJsDebug ?? 0,
  });
}

export function waitForPeerOpen(peer) {
  return new Promise((resolve, reject) => {
    if (peer.open) { resolve(peer.id); return; }
    peer.on('open', resolve);
    peer.on('error', reject);
  });
}
