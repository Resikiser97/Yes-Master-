/**
 * @file        waitingRoom.js
 * @module      ui
 * @summary     等待室：玩家 slot 卡片 + PeerJS 聊天 + 開始遊戲
 * @exports     showWaitingRoom
 * @depends     src/net/authManager.js, src/net/supabaseClient.js, src/net/peerHost.js, src/net/peerClient.js, src/net/protocol.js, src/net/friendManager.js, src/ui/characterPopup.js
 * @version     v0.0.15.0
 */

import { getCurrentUser, getProfile } from '../net/authManager.js';
import { getRoomMembers, kickPlayer, leaveRoom, startRoom, heartbeatRoom } from '../net/roomManager.js';
import { startPeerHost } from '../net/peerHost.js';
import { startPeerClient } from '../net/peerClient.js';
import { MSG, makeMessage } from '../net/protocol.js';
import { sendFriendRequest } from '../net/friendManager.js';
import { showCharacterPopup } from './characterPopup.js';

const GOLD = '#D4A017';
const GOLD_DIM = 'rgba(212,160,23,0.7)';
const GOLD_BORDER = 'rgba(212,160,23,0.45)';
const BROWN_BG = 'rgba(139,90,43,0.18)';
const BROWN_BORDER = 'rgba(139,90,43,0.5)';

let pollTimer = null;
let heartbeatTimer = null;
let netSession = null;
let _tabCloseHandlers = null;

export async function showWaitingRoom({ roomId, roomName, role, inputMode, diffMode, maxPlayers = 4, onStart, onBack }) {
  _cleanup();

  const user = await getCurrentUser();
  const profile = user ? await getProfile(user.id) : null;
  const displayName = profile?.display_name || 'Goblin';

  let chatLogEl = null;

  const overlay = _el('div', {
    id: 'waitingroom-overlay',
    style: 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;display:flex;flex-direction:column;align-items:center;z-index:9998;opacity:0;transition:opacity 0.6s ease;font-family:sans-serif;',
  });

  // Title bar
  const titleBar = _el('div', { style: 'display:flex;align-items:center;justify-content:space-between;width:90%;max-width:900px;margin-top:16px;' });
  const roomTitle = _el('div', {
    textContent: roomName,
    style: `color:${GOLD};font-family:Georgia,serif;font-size:clamp(14px,3vw,22px);font-weight:bold;letter-spacing:3px;`,
  });
  const roomIdLabel = _el('div', {
    textContent: `ID: ${roomId?.slice(0, 8) ?? '???'}`,
    style: `color:${GOLD_DIM};font-size:11px;letter-spacing:1px;cursor:pointer;`,
  });
  roomIdLabel.title = '點擊複製房間 ID';
  roomIdLabel.addEventListener('click', () => {
    navigator.clipboard?.writeText(roomId).catch(() => {});
    roomIdLabel.textContent = '已複製!';
    setTimeout(() => { roomIdLabel.textContent = `ID: ${roomId?.slice(0, 8) ?? '???'}`; }, 1500);
  });
  titleBar.append(roomTitle, roomIdLabel);

  // Player slots area
  const slotsArea = _el('div', {
    style: 'display:flex;gap:16px;justify-content:center;flex-wrap:wrap;width:90%;max-width:900px;margin-top:16px;',
  });

  // Chat area
  const chatArea = _el('div', {
    style: `flex:1;width:90%;max-width:900px;margin-top:12px;border:2px solid ${BROWN_BORDER};background:${BROWN_BG};display:flex;flex-direction:column;min-height:160px;max-height:35vh;margin-bottom:8px;`,
  });
  chatLogEl = _el('div', {
    style: `flex:1;overflow-y:auto;padding:8px 12px;font-size:12px;color:#ccc;display:flex;flex-direction:column;gap:2px;`,
  });
  const chatInputRow = _el('div', { style: 'display:flex;border-top:1px solid rgba(139,90,43,0.4);' });
  const chatInput = _el('input', {
    placeholder: '輸入訊息...',
    style: `flex:1;padding:8px 12px;background:rgba(0,0,0,0.4);border:none;color:#eee;font-size:12px;outline:none;`,
  });
  const sendBtn = _el('button', {
    textContent: '送出',
    style: `padding:8px 16px;background:transparent;border:none;border-left:1px solid rgba(139,90,43,0.4);color:${GOLD};font-size:12px;cursor:pointer;`,
  });
  const sendChat = () => {
    const text = chatInput.value.trim();
    if (!text) return;
    const msg = makeMessage(MSG.CHAT, { from: displayName, text });
    if (netSession) {
      if (netSession.isHost()) {
        netSession.broadcast(msg);
      } else {
        netSession.send(msg);
      }
    }
    _addChat(chatLogEl, displayName, text);
    chatInput.value = '';
  };
  sendBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  chatInputRow.append(chatInput, sendBtn);
  chatArea.append(chatLogEl, chatInputRow);

  // Bottom bar
  const bottomBar = _el('div', {
    style: 'display:flex;gap:16px;justify-content:center;align-items:center;width:90%;max-width:900px;padding:12px 0;',
  });

  const exitBtn = _el('button', {
    textContent: '退出房間',
    style: `padding:10px 24px;background:rgba(200,40,40,0.15);border:1px solid rgba(200,40,40,0.5);color:#e44;font-size:13px;letter-spacing:1px;cursor:pointer;outline:none;transition:background 0.2s;`,
  });
  exitBtn.addEventListener('mouseover', () => { exitBtn.style.background = 'rgba(200,40,40,0.3)'; });
  exitBtn.addEventListener('mouseout', () => { exitBtn.style.background = 'rgba(200,40,40,0.15)'; });
  exitBtn.addEventListener('click', async () => {
    _cleanup();
    overlay.style.opacity = '0';
    try {
      await leaveRoom(roomId);
    } catch (e) { /* best effort */ }
    setTimeout(() => { overlay.remove(); if (onBack) onBack(); }, 400);
  });
  bottomBar.appendChild(exitBtn);

  if (role === 'host') {
    const startBtn = _el('button', {
      textContent: '開始遊戲',
      style: `padding:10px 28px;background:rgba(212,160,23,0.15);border:2px solid ${GOLD};color:${GOLD};font-size:14px;font-weight:bold;letter-spacing:2px;cursor:pointer;outline:none;transition:background 0.2s;`,
    });
    startBtn.addEventListener('mouseover', () => { startBtn.style.background = 'rgba(212,160,23,0.3)'; });
    startBtn.addEventListener('mouseout', () => { startBtn.style.background = 'rgba(212,160,23,0.15)'; });
    startBtn.addEventListener('click', async () => {
      if (startBtn._busy) return;
      startBtn._busy = true;
      startBtn.textContent = '啟動中...';
      try {
        await startRoom(roomId);
        if (netSession) {
          netSession.broadcast(makeMessage(MSG.GAME_START, { diffMode: diffMode || 'normal' }));
        }
        _launchGame(overlay, diffMode || 'normal', inputMode, roomId, role, onStart);
      } catch (err) {
        startBtn._busy = false;
        startBtn.textContent = '開始遊戲';
        _addChat(chatLogEl, '系統', '開始遊戲失敗: ' + (err.message || err));
      }
    });
    bottomBar.appendChild(startBtn);
  }

  overlay.append(titleBar, slotsArea, chatArea, bottomBar);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  _addChat(chatLogEl, '系統', `歡迎來到 ${roomName}！`);

  // --- PeerJS connection ---
  try {
    if (role === 'host') {
      _addChat(chatLogEl, '系統', '建立連線中...');
      netSession = await startPeerHost({
        roomId,
        onInput: () => {},
        onPeerReady: (_peerId, session) => {
          _addChat(chatLogEl, '系統', `玩家已連線 (${session.slotId})`);
          refreshMembers();
        },
      });
      netSession._onChat = (msg, senderPeer) => {
        _addChat(chatLogEl, msg.payload.from, msg.payload.text);
        netSession.broadcastExcept(senderPeer, msg);
      };
      _addChat(chatLogEl, '系統', '等待玩家加入...');
    } else {
      _addChat(chatLogEl, '系統', '連線到房主...');
      netSession = await startPeerClient({
        roomId,
        onMessage: (msg) => {
          if (msg.type === MSG.CHAT) {
            _addChat(chatLogEl, msg.payload.from, msg.payload.text);
          } else if (msg.type === MSG.GAME_START) {
            _launchGame(overlay, msg.payload.diffMode || 'normal', inputMode, roomId, 'client', onStart);
          } else if (msg.type === MSG.KICK) {
            _cleanup();
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.remove(); alert('你已被踢出房間'); if (onBack) onBack(); }, 400);
          }
        },
      });
      _addChat(chatLogEl, '系統', '已連線！');
    }
  } catch (err) {
    _addChat(chatLogEl, '系統', '連線失敗: ' + (err.message || err));
  }

  // --- Poll members ---
  async function refreshMembers() {
    try {
      const members = await getRoomMembers(roomId);
      _renderSlots(slotsArea, members || [], maxPlayers, role, roomId, netSession, chatLogEl, onBack);
    } catch (e) { /* silent */ }
  }

  refreshMembers();
  pollTimer = setInterval(refreshMembers, 2000);

  // --- Heartbeat every 10 seconds ---
  const doHeartbeat = () => {
    heartbeatRoom(roomId).catch(() => { /* best effort */ });
  };
  doHeartbeat(); // immediate first heartbeat
  heartbeatTimer = setInterval(doHeartbeat, 10_000);

  // --- Best-effort tab close handling ---
  _tabCloseHandlers = _setupTabCloseHandlers(roomId);
}

function _launchGame(overlay, diffMode, inputMode, roomId, role, onStart) {
  if (netSession) netSession._keepAlive = true;
  _cleanup();
  overlay.style.opacity = '0';
  setTimeout(() => {
    overlay.remove();
    onStart(diffMode, inputMode, { roomId, role, netSession });
  }, 600);
}

function _renderSlots(container, members, maxSlots, myRole, roomId, net, chatLogEl, onBack) {
  container.innerHTML = '';
  for (let i = 0; i < maxSlots; i++) {
    const m = members[i];
    const slot = _el('div', {
      style: `width:180px;min-height:200px;border:2px solid ${m ? GOLD_BORDER : 'rgba(255,255,255,0.1)'};background:${m ? 'rgba(212,160,23,0.06)' : 'rgba(255,255,255,0.02)'};display:flex;flex-direction:column;align-items:center;padding:16px 12px;gap:8px;transition:border-color 0.3s;`,
    });

    if (m) {
      if (m.role === 'host') {
        slot.appendChild(_el('div', { textContent: '👑', style: 'font-size:20px;' }));
      }
      const avatar = _el('div', {
        textContent: (m.display_name || 'G')[0].toUpperCase(),
        style: `width:56px;height:56px;border-radius:50%;background:rgba(139,90,43,0.3);border:2px solid ${GOLD_BORDER};display:flex;align-items:center;justify-content:center;color:${GOLD};font-size:22px;font-weight:bold;font-family:Georgia,serif;`,
      });
      slot.appendChild(avatar);
      slot.appendChild(_el('div', {
        textContent: m.display_name || 'Goblin',
        style: `color:#eee;font-size:13px;text-align:center;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`,
      }));
      slot.appendChild(_el('div', {
        textContent: `Lv.${m.player_level ?? 1}`,
        style: `color:${GOLD_DIM};font-size:11px;`,
      }));

      const actions = _el('div', { style: 'display:flex;gap:10px;margin-top:8px;' });

      // Blue: view stats
      actions.appendChild(_actionCircle('🔵', '查看', () => {
        showCharacterPopup(m.user_id);
      }));

      // Green: add friend
      actions.appendChild(_actionCircle('🟢', '加友', async () => {
        try {
          await sendFriendRequest(m.user_id);
          _addChat(chatLogEl, '系統', `已送出好友邀請給 ${m.display_name}`);
        } catch (err) {
          _addChat(chatLogEl, '系統', '好友邀請失敗: ' + (err.message || err));
        }
      }));

      // Red: kick (host only, not self)
      if (myRole === 'host' && m.role !== 'host') {
        actions.appendChild(_actionCircle('🔴', '踢出', async () => {
          if (!confirm(`踢出 ${m.display_name}？`)) return;
          try {
            if (net) {
              const targetSession = [...net.peers.values()].find(s => s.uid === m.user_id);
              if (targetSession) {
                net.sendTo(targetSession.conn.peer, makeMessage(MSG.KICK, {}));
                setTimeout(() => targetSession.conn.close?.(), 200);
              }
            }
            await kickPlayer(roomId, m.user_id);
            _addChat(chatLogEl, '系統', `已踢出 ${m.display_name}`);
          } catch (e) {
            _addChat(chatLogEl, '系統', '踢出失敗');
          }
        }));
      }
      slot.appendChild(actions);
    } else {
      slot.appendChild(_el('div', {
        textContent: '等待加入...',
        style: `color:rgba(255,255,255,0.2);font-size:13px;margin-top:60px;`,
      }));
    }

    container.appendChild(slot);
  }
}

function _actionCircle(emoji, title, onClick) {
  const c = _el('div', {
    textContent: emoji,
    title,
    style: 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;border-radius:50%;background:rgba(255,255,255,0.06);transition:background 0.2s;',
  });
  c.addEventListener('mouseover', () => { c.style.background = 'rgba(255,255,255,0.15)'; });
  c.addEventListener('mouseout', () => { c.style.background = 'rgba(255,255,255,0.06)'; });
  c.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return c;
}

function _addChat(chatLog, from, text) {
  if (!chatLog) return;
  const line = _el('div', { style: 'line-height:1.4;' });
  const nameSpan = _el('span', { textContent: `[${from}] `, style: `color:${GOLD};font-weight:bold;` });
  const msgSpan = _el('span', { textContent: text });
  line.append(nameSpan, msgSpan);
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function _cleanup() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (_tabCloseHandlers) { _removeTabCloseHandlers(_tabCloseHandlers); _tabCloseHandlers = null; }
  if (netSession && !netSession._keepAlive) {
    netSession.close?.();
    netSession = null;
  }
}

/**
 * Best-effort tab close / hide handling.
 * Uses pagehide + visibilitychange to attempt leave-room notification.
 * Cannot rely on async cleanup during unload — real guarantee comes from cleanup-rooms.
 *
 * Note on sendBeacon: Supabase Edge Functions require Authorization header
 * which sendBeacon cannot carry. We use fetch with keepalive instead.
 * This is inherently unreliable; the server-side cleanup-rooms is the safety net.
 */
function _setupTabCloseHandlers(roomId) {
  // Snapshot Supabase config at setup time so it's available synchronously during unload
  let _cachedUrl = null;
  let _cachedKey = null;
  let _cachedToken = null;

  // Try to cache credentials immediately and on each heartbeat cycle
  const cacheCredentials = async () => {
    try {
      const { GAME_CONFIG } = await import('../../config/gameConfig.js');
      _cachedUrl = GAME_CONFIG.net?.supabaseUrl ?? null;
      _cachedKey = GAME_CONFIG.net?.supabaseAnonKey ?? null;
      const { getSupabaseClient } = await import('../net/supabaseClient.js');
      const supabase = await getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      _cachedToken = data?.session?.access_token ?? null;
    } catch { /* best effort */ }
  };
  cacheCredentials();

  const onPageHide = () => {
    try {
      if (_cachedUrl && _cachedKey && _cachedToken) {
        fetch(`${_cachedUrl}/functions/v1/leave-room`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': _cachedKey,
            'Authorization': `Bearer ${_cachedToken}`,
          },
          body: JSON.stringify({ room_id: roomId }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch { /* never throw during unload */ }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      onPageHide();
    }
  };

  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return { onPageHide, onVisibilityChange, cacheCredentials };
}

function _removeTabCloseHandlers(handlers) {
  if (!handlers) return;
  window.removeEventListener('pagehide', handlers.onPageHide);
  document.removeEventListener('visibilitychange', handlers.onVisibilityChange);
}

function _el(tag, props = {}) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'style') el.style.cssText = v;
    else if (k === 'textContent') el.textContent = v;
    else if (k === 'title') el.title = v;
    else el.setAttribute(k, v);
  });
  return el;
}
