/**
 * @file        lobby.js
 * @module      ui
 * @summary     多人大廳：房間列表（公開/朋友/房間號碼 tab）+ 建房 popup + 商店/抽獎入口
 * @exports     showLobby
 * @depends     src/net/roomManager.js, src/net/authManager.js, src/net/friendManager.js, src/ui/waitingRoom.js, src/ui/friendsPanel.js, src/ui/uiManager.js
 * @version     v0.0.21.0
 */

import { listRooms, createRoom, joinRoom } from '../net/roomManager.js';
import { getCurrentUser, ensureProfile } from '../net/authManager.js';
import { listFriends } from '../net/friendManager.js';
import { showAuthScreen } from './authScreen.js';
import { showWaitingRoom } from './waitingRoom.js';
import { showFriendsPanel } from './friendsPanel.js';
import { openGacha, openShop } from './uiManager.js';

const GOLD = '#D4A017';
const GOLD_DIM = 'rgba(212,160,23,0.7)';
const GOLD_BORDER = 'rgba(212,160,23,0.45)';
const GOLD_BG = 'rgba(212,160,23,0.12)';
const BROWN_BG = 'rgba(139,90,43,0.15)';
const BROWN_BORDER = 'rgba(139,90,43,0.5)';

let pollTimer = null;

export async function showLobby(inputMode, onStart) {
  _cleanup();

  const user = await getCurrentUser();
  if (!user) {
    showAuthScreen((authedUser) => showLobby(inputMode, onStart));
    return;
  }

  const overlay = _el('div', {
    id: 'lobby-overlay',
    style: 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;display:flex;flex-direction:column;align-items:center;z-index:9998;opacity:0;transition:opacity 0.6s ease;font-family:sans-serif;overflow-y:auto;',
  });

  // Header
  const header = _el('div', {
    style: 'position:relative;width:90%;max-width:900px;margin-top:24px;display:flex;align-items:flex-start;justify-content:center;',
  });
  const title = _el('div', {
    textContent: 'GOBLIN NEST',
    style: `font-family:Georgia,'Times New Roman',serif;font-size:clamp(20px,4vw,36px);font-weight:bold;letter-spacing:6px;color:${GOLD};text-shadow:2px 2px 0px #7a5500;`,
  });
  const leftActions = _el('div', {
    style: 'position:absolute;left:0;top:4px;display:flex;gap:8px;flex-wrap:wrap;max-width:42%;',
  });
  const shopBtn = _btn('每日商店');
  shopBtn.addEventListener('click', openShop);
  const gachaBtn = _btn('🎲 抽獎盤');
  gachaBtn.addEventListener('click', openGacha);
  leftActions.append(shopBtn, gachaBtn);
  const friendsBtn = _btn('👥 好友');
  friendsBtn.style.position = 'absolute';
  friendsBtn.style.right = '0';
  friendsBtn.style.top = '4px';
  friendsBtn.addEventListener('click', showFriendsPanel);
  header.append(leftActions, title, friendsBtn);

  const sub = _el('div', {
    textContent: '多 人 大 廳',
    style: `font-family:Georgia,serif;font-size:clamp(10px,2vw,14px);letter-spacing:6px;color:${GOLD_DIM};margin-bottom:16px;`,
  });

  // Main layout: left tabs + center room list
  const main = _el('div', { style: 'display:flex;gap:16px;width:90%;max-width:900px;flex:1;min-height:0;' });

  // Left tabs
  const tabs = _el('div', { style: 'display:flex;flex-direction:column;gap:8px;min-width:100px;' });
  let activeTab = 'public';
  const tabBtns = {};
  const makeTab = (key, label) => {
    const btn = _btn(label);
    btn.addEventListener('click', () => { activeTab = key; _updateTabStyles(); refreshRooms(); });
    tabBtns[key] = btn;
    tabs.appendChild(btn);
  };
  makeTab('public', '公開');
  makeTab('friends', '朋友');
  makeTab('roomid', '房間號碼');

  const _updateTabStyles = () => {
    Object.entries(tabBtns).forEach(([k, b]) => {
      const sel = k === activeTab;
      b.style.background = sel ? 'rgba(212,160,23,0.2)' : 'transparent';
      b.style.borderColor = sel ? GOLD : GOLD_BORDER;
      b.style.color = sel ? GOLD : GOLD_DIM;
    });
  };

  // Create room button
  const createBtn = _btn('＋ 建立房間');
  createBtn.style.marginTop = '16px';
  createBtn.style.borderColor = GOLD;
  createBtn.style.color = GOLD;
  createBtn.addEventListener('click', () => _showCreateRoomPopup(overlay, inputMode, onStart));
  tabs.appendChild(createBtn);

  // Back button
  const backBtn = _btn('← 返回');
  backBtn.style.marginTop = 'auto';
  backBtn.addEventListener('click', () => {
    _cleanup();
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 600);
    import('./splash.js').then(m => m.showSplashScreen(onStart));
  });
  tabs.appendChild(backBtn);

  // Center panel
  const panel = _el('div', {
    style: `flex:1;border:2px solid ${GOLD_BORDER};background:rgba(0,0,0,0.6);padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;min-height:300px;max-height:70vh;`,
  });
  const roomIdPanel = _el('div', {
    style: 'display:none;flex-direction:column;gap:12px;padding:16px;',
  });
  const roomIdInput = _el('input', {
    placeholder: '輸入房間 ID',
    style: `padding:8px 12px;background:rgba(255,255,255,0.08);border:1px solid ${GOLD_BORDER};color:${GOLD};font-size:13px;outline:none;width:100%;box-sizing:border-box;`,
  });
  const pwdInput = _el('input', {
    placeholder: '密碼（如有）',
    type: 'password',
    style: `padding:8px 12px;background:rgba(255,255,255,0.08);border:1px solid ${GOLD_BORDER};color:${GOLD};font-size:13px;outline:none;width:100%;box-sizing:border-box;`,
  });
  const joinIdBtn = _btn('加入');
  joinIdBtn.addEventListener('click', async () => {
    const rid = roomIdInput.value.trim();
    if (!rid) return;
    try {
      const result = await joinRoom({ room_id: rid, password: pwdInput.value.trim() || null });
      _cleanup();
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        showWaitingRoom({
          roomId: rid,
          roomName: rid.slice(0, 8),
          role: 'client',
          inputMode,
          maxPlayers: result?.room?.max_players ?? 4,
          onStart,
          onBack: () => showLobby(inputMode, onStart),
        });
      }, 400);
    } catch (err) {
      alert(err.message || '加入失敗');
    }
  });
  roomIdPanel.append(roomIdInput, pwdInput, joinIdBtn);

  const statusMsg = _el('div', {
    textContent: '載入中...',
    style: `color:${GOLD_DIM};font-size:12px;text-align:center;padding:24px;`,
  });
  panel.appendChild(statusMsg);

  main.appendChild(tabs);
  main.appendChild(panel);
  main.appendChild(roomIdPanel);

  overlay.append(header, sub, main);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  _updateTabStyles();

  async function refreshRooms() {
    if (activeTab === 'roomid') {
      panel.style.display = 'none';
      roomIdPanel.style.display = 'flex';
      return;
    }
    panel.style.display = 'flex';
    roomIdPanel.style.display = 'none';
    panel.innerHTML = '';
    const loading = _el('div', { textContent: '載入中...', style: `color:${GOLD_DIM};font-size:12px;text-align:center;padding:24px;` });
    panel.appendChild(loading);

    try {
      let rooms = await listRooms();
      if (activeTab === 'friends') {
        try {
          const friends = await listFriends();
          const myId = user.id;
          const friendIds = new Set(friends.map(f => f.user_a === myId ? f.user_b : f.user_a));
          rooms = rooms.filter(r => friendIds.has(r.owner_id));
        } catch { rooms = []; }
      }
      panel.innerHTML = '';
      if (rooms.length === 0) {
        panel.appendChild(_el('div', {
          textContent: activeTab === 'friends' ? '目前沒有好友的房間' : '目前沒有房間',
          style: `color:${GOLD_DIM};font-size:13px;text-align:center;padding:40px;`,
        }));
        return;
      }
      rooms.forEach(room => {
        const card = _roomCard(room, overlay, inputMode, onStart);
        panel.appendChild(card);
      });
    } catch (err) {
      panel.innerHTML = '';
      panel.appendChild(_el('div', { textContent: '載入失敗: ' + (err.message || err), style: `color:#f44;font-size:12px;padding:24px;text-align:center;` }));
    }
  }

  refreshRooms();
  pollTimer = setInterval(refreshRooms, 3000);
}

function _roomCard(room, overlay, inputMode, onStart) {
  const card = _el('div', {
    style: `display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid ${GOLD_BORDER};background:${BROWN_BG};cursor:pointer;transition:background 0.2s,border-color 0.2s;`,
  });
  card.addEventListener('mouseover', () => { card.style.borderColor = GOLD; card.style.background = 'rgba(212,160,23,0.1)'; });
  card.addEventListener('mouseout', () => { card.style.borderColor = GOLD_BORDER; card.style.background = BROWN_BG; });

  const info = _el('div', { style: 'flex:1;display:flex;flex-direction:column;gap:2px;' });
  const row1 = _el('div', { style: 'display:flex;gap:12px;align-items:center;' });
  row1.appendChild(_el('span', { textContent: `${room.current_players ?? '?'}/${room.max_players ?? 4} 人`, style: `color:${GOLD};font-size:13px;font-weight:bold;` }));
  row1.appendChild(_el('span', { textContent: room.name || 'Room', style: `color:#eee;font-size:13px;` }));
  if (room.has_password) {
    row1.appendChild(_el('span', { textContent: 'LOCK', style: `color:${GOLD_DIM};font-size:10px;letter-spacing:1px;border:1px solid ${GOLD_BORDER};padding:1px 4px;` }));
  }
  const row2 = _el('div', { style: 'display:flex;gap:12px;' });
  row2.appendChild(_el('span', { textContent: `等級限制:${room.min_level > 0 ? room.min_level : '無'}`, style: `color:${GOLD_DIM};font-size:11px;` }));
  row2.appendChild(_el('span', { textContent: room.difficulty === 'test' ? '測試' : '簡單', style: `color:${GOLD_DIM};font-size:11px;` }));
  info.append(row1, row2);
  card.appendChild(info);

  card.addEventListener('click', async () => {
    if (card._joining) return;
    card._joining = true;
    try {
      const password = room.has_password ? await _askRoomPassword(room.name || 'Room') : null;
      if (password === false) {
        card._joining = false;
        return;
      }
      await joinRoom({ room_id: room.room_id, password });
      _cleanup();
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        showWaitingRoom({
          roomId: room.room_id,
          roomName: room.name || 'Room',
          role: 'client',
          inputMode,
          maxPlayers: room.max_players ?? 4,
          onStart,
          onBack: () => showLobby(inputMode, onStart),
        });
      }, 400);
    } catch (err) {
      card._joining = false;
      alert(err.message || '加入失敗');
    }
  });

  return card;
}

function _showCreateRoomPopup(overlay, inputMode, onStart) {
  const existing = document.getElementById('create-room-popup');
  if (existing) existing.remove();

  const popup = _el('div', {
    id: 'create-room-popup',
    style: `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;border:2px solid ${GOLD};padding:24px;z-index:10000;min-width:300px;display:flex;flex-direction:column;gap:12px;`,
  });

  popup.appendChild(_el('div', { textContent: '建立房間', style: `color:${GOLD};font-size:16px;font-weight:bold;letter-spacing:2px;text-align:center;` }));

  const nameInput = _el('input', {
    placeholder: '房間名稱',
    value: 'Room',
    style: `padding:8px 12px;background:rgba(255,255,255,0.08);border:1px solid ${GOLD_BORDER};color:${GOLD};font-size:13px;outline:none;`,
  });

  const passwordInput = _el('input', {
    placeholder: '房間密碼（可空白）',
    type: 'password',
    style: `padding:8px 12px;background:rgba(255,255,255,0.08);border:1px solid ${GOLD_BORDER};color:${GOLD};font-size:13px;outline:none;`,
  });

  const playerSelect = _el('select', {
    style: `padding:8px 12px;background:#222;border:1px solid ${GOLD_BORDER};color:${GOLD};font-size:13px;outline:none;`,
  });
  [2, 3, 4].forEach(n => {
    const opt = _el('option', { value: String(n), textContent: `${n} 人` });
    if (n === 4) opt.selected = true;
    playerSelect.appendChild(opt);
  });

  const diffSelect = _el('select', {
    style: `padding:8px 12px;background:#222;border:1px solid ${GOLD_BORDER};color:${GOLD};font-size:13px;outline:none;`,
  });
  [{ v: 'normal', t: '正式難度' }, { v: 'test', t: '測試模式' }].forEach(({ v, t }) => {
    diffSelect.appendChild(_el('option', { value: v, textContent: t }));
  });

  const minLevelInput = _el('input', {
    placeholder: '最低等級（0 = 不限制）',
    type: 'number',
    min: '0',
    max: '999',
    value: '0',
    style: `padding:8px 12px;background:rgba(255,255,255,0.08);border:1px solid ${GOLD_BORDER};color:${GOLD};font-size:13px;outline:none;`,
  });

  const visibilitySelect = _el('select', {
    style: `padding:8px 12px;background:#222;border:1px solid ${GOLD_BORDER};color:${GOLD};font-size:13px;outline:none;`,
  });
  [
    { v: 'public', t: '公開房間' },
    { v: 'friends', t: '朋友房間' },
    { v: 'private', t: '私人房間' },
  ].forEach(({ v, t }) => visibilitySelect.appendChild(_el('option', { value: v, textContent: t })));

  const btnRow = _el('div', { style: 'display:flex;gap:12px;justify-content:center;margin-top:8px;' });
  const confirmBtn = _btn('建立');
  confirmBtn.style.borderColor = GOLD;
  confirmBtn.style.color = GOLD;
  const cancelBtn = _btn('取消');
  cancelBtn.addEventListener('click', () => popup.remove());

  confirmBtn.addEventListener('click', async () => {
    if (confirmBtn._busy) return;
    confirmBtn._busy = true;
    confirmBtn.textContent = '建立中...';
    try {
      const user = await getCurrentUser();
      if (!user) {
        alert('請先登入');
        confirmBtn._busy = false;
        confirmBtn.textContent = '建立';
        return;
      }
      await ensureProfile(user);
      const result = await createRoom({
        name: nameInput.value.trim() || 'Room',
        maxPlayers: parseInt(playerSelect.value),
        password: passwordInput.value.trim() || null,
        minLevel: Math.max(0, parseInt(minLevelInput.value, 10) || 0),
        difficulty: diffSelect.value,
        visibility: visibilitySelect.value,
      });
      const roomId = result?.room_id || result?.room?.room_id;
      popup.remove();
      _cleanup();
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        showWaitingRoom({
          roomId,
          roomName: nameInput.value.trim() || 'Room',
          role: 'host',
          inputMode,
          diffMode: diffSelect.value,
          maxPlayers: parseInt(playerSelect.value),
          onStart,
          onBack: () => showLobby(inputMode, onStart),
        });
      }, 400);
    } catch (err) {
      confirmBtn._busy = false;
      confirmBtn.textContent = '建立';
      alert('建立失敗: ' + (err.message || err));
    }
  });

  btnRow.append(confirmBtn, cancelBtn);
  popup.append(nameInput, passwordInput, playerSelect, minLevelInput, diffSelect, visibilitySelect, btnRow);
  document.body.appendChild(popup);
}

function _askRoomPassword(roomName) {
  return new Promise((resolve) => {
    const popup = _el('div', {
      style: `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;border:2px solid ${GOLD};padding:20px;z-index:10000;min-width:280px;display:flex;flex-direction:column;gap:12px;`,
    });
    popup.appendChild(_el('div', {
      textContent: `${roomName} 需要密碼`,
      style: `color:${GOLD};font-size:14px;font-weight:bold;text-align:center;`,
    }));
    const input = _el('input', {
      placeholder: '輸入房間密碼',
      type: 'password',
      style: `padding:8px 12px;background:rgba(255,255,255,0.08);border:1px solid ${GOLD_BORDER};color:${GOLD};font-size:13px;outline:none;`,
    });
    const row = _el('div', { style: 'display:flex;gap:10px;justify-content:center;' });
    const ok = _btn('加入');
    const cancel = _btn('取消');
    const done = (value) => {
      popup.remove();
      resolve(value);
    };
    ok.addEventListener('click', () => done(input.value.trim() || null));
    cancel.addEventListener('click', () => done(false));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null);
      if (e.key === 'Escape') done(false);
    });
    row.append(ok, cancel);
    popup.append(input, row);
    document.body.appendChild(popup);
    input.focus();
  });
}

function _cleanup() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function _el(tag, props = {}) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'style') el.style.cssText = v;
    else if (k === 'textContent') el.textContent = v;
    else el.setAttribute(k, v);
  });
  return el;
}

function _btn(label) {
  const btn = _el('button', {
    textContent: label,
    style: `padding:8px 16px;background:transparent;border:1px solid ${GOLD_BORDER};color:${GOLD_DIM};font-size:12px;letter-spacing:1px;cursor:pointer;outline:none;transition:background 0.2s,border-color 0.2s;`,
  });
  btn.addEventListener('mouseover', () => { btn.style.background = GOLD_BG; btn.style.borderColor = GOLD; });
  btn.addEventListener('mouseout', () => { btn.style.background = 'transparent'; btn.style.borderColor = GOLD_BORDER; });
  return btn;
}
