/**
 * @file        friendsPanel.js
 * @module      ui（HTML overlay）
 * @summary     好友列表、邀請、接受/拒絕/刪除 HTML overlay
 * @exports     showFriendsPanel, hideFriendsPanel
 * @depends     src/net/friendManager.js
 * @version     v0.0.17.0
 */

import {
  acceptFriendRequest,
  declineFriendRequest,
  deleteFriend,
  listFriends,
  listPendingRequests,
  sendFriendRequest,
} from '../net/friendManager.js';

const OVERLAY_ID = 'friends-panel-overlay';

export function showFriendsPanel() {
  hideFriendsPanel();

  const overlay = _el('div', {
    id: OVERLAY_ID,
    style: 'position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:10002;font-family:sans-serif;',
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideFriendsPanel(); });

  const card = _el('div', {
    style: 'position:relative;width:min(560px,92vw);max-height:86vh;overflow:auto;background:#fff;color:#222;border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,0.35);padding:22px;box-sizing:border-box;',
  });

  const close = _el('button', {
    textContent: '×',
    title: '關閉',
    style: 'position:absolute;top:8px;right:10px;border:0;background:transparent;color:#333;font-size:24px;line-height:1;cursor:pointer;',
  });
  close.addEventListener('click', hideFriendsPanel);

  const title = _el('h2', {
    textContent: '好友',
    style: 'margin:0 0 14px;font-size:20px;color:#111;',
  });

  const inviteRow = _el('form', {
    style: 'display:flex;gap:8px;margin-bottom:18px;',
  });
  const inviteInput = _el('input', {
    placeholder: '輸入 user_id 或 display_name',
    style: 'flex:1;padding:9px 10px;border:1px solid #bbb;border-radius:4px;font-size:13px;',
  });
  const inviteBtn = _btn('送出邀請');
  inviteRow.append(inviteInput, inviteBtn);

  const status = _el('div', {
    style: 'min-height:18px;margin-bottom:10px;font-size:12px;color:#666;',
  });

  const receivedSection = _section('待接受邀請');
  const sentSection = _section('已送出邀請');
  const friendsSection = _section('好友列表');

  inviteRow.addEventListener('submit', async (e) => {
    e.preventDefault();
    const target = inviteInput.value.trim();
    if (!target) return;
    await _run(status, inviteBtn, async () => {
      await sendFriendRequest(target);
      inviteInput.value = '';
      status.textContent = '邀請已送出';
      await refresh();
    });
  });

  card.append(close, title, inviteRow, status, receivedSection.wrap, sentSection.wrap, friendsSection.wrap);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  refresh();

  async function refresh() {
    receivedSection.body.textContent = '載入中...';
    sentSection.body.textContent = '載入中...';
    friendsSection.body.textContent = '載入中...';

    try {
      const [friends, pending] = await Promise.all([listFriends(), listPendingRequests()]);
      _renderReceived(receivedSection.body, pending.received ?? [], status, refresh);
      _renderSent(sentSection.body, pending.sent ?? [], status, refresh);
      _renderFriends(friendsSection.body, friends ?? [], status, refresh);
    } catch (err) {
      status.textContent = err.message || '好友資料載入失敗';
      receivedSection.body.textContent = '載入失敗';
      sentSection.body.textContent = '載入失敗';
      friendsSection.body.textContent = '載入失敗';
    }
  }
}

export function hideFriendsPanel() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function _renderReceived(body, rows, status, refresh) {
  body.innerHTML = '';
  if (!rows.length) {
    body.appendChild(_empty('沒有待接受邀請'));
    return;
  }
  rows.forEach((row) => {
    const accept = _btn('接受');
    const decline = _btn('拒絕');
    accept.addEventListener('click', () => _run(status, accept, async () => {
      await acceptFriendRequest(row.other_user_id);
      await refresh();
    }));
    decline.addEventListener('click', () => _run(status, decline, async () => {
      await declineFriendRequest(row.other_user_id);
      await refresh();
    }));
    body.appendChild(_row(row.display_name, [accept, decline]));
  });
}

function _renderSent(body, rows, status, refresh) {
  body.innerHTML = '';
  if (!rows.length) {
    body.appendChild(_empty('沒有已送出的邀請'));
    return;
  }
  rows.forEach((row) => {
    const cancel = _btn('取消');
    cancel.addEventListener('click', () => _run(status, cancel, async () => {
      await declineFriendRequest(row.other_user_id);
      await refresh();
    }));
    body.appendChild(_row(`${row.display_name}（等待中）`, [cancel]));
  });
}

function _renderFriends(body, rows, status, refresh) {
  body.innerHTML = '';
  if (!rows.length) {
    body.appendChild(_empty('目前沒有好友'));
    return;
  }
  rows.forEach((row) => {
    const remove = _btn('刪除');
    remove.addEventListener('click', () => _run(status, remove, async () => {
      await deleteFriend(row.other_user_id);
      await refresh();
    }));
    body.appendChild(_row(row.display_name, [remove], true));
  });
}

async function _run(status, button, task) {
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = '處理中...';
  status.textContent = '';
  try {
    await task();
  } catch (err) {
    status.textContent = err.message || '操作失敗';
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

function _section(title) {
  const wrap = _el('section', { style: 'margin-top:14px;' });
  const header = _el('h3', {
    textContent: title,
    style: 'margin:0 0 8px;font-size:14px;color:#111;border-bottom:1px solid #ddd;padding-bottom:6px;',
  });
  const body = _el('div', { style: 'display:flex;flex-direction:column;gap:6px;' });
  wrap.append(header, body);
  return { wrap, body };
}

function _row(label, actions, withDot = false) {
  const row = _el('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #eee;',
  });
  const name = _el('div', {
    textContent: label,
    style: 'font-size:13px;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
  });
  if (withDot) {
    const dot = _el('span', {
      style: 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#4caf50;margin-right:8px;vertical-align:middle;',
    });
    name.prepend(dot);
  }
  const actionWrap = _el('div', { style: 'display:flex;gap:6px;flex:0 0 auto;' });
  actionWrap.append(...actions);
  row.append(name, actionWrap);
  return row;
}

function _empty(text) {
  return _el('div', { textContent: text, style: 'font-size:12px;color:#777;padding:6px 0;' });
}

function _btn(label) {
  const btn = _el('button', {
    textContent: label,
    style: 'padding:7px 10px;border:1px solid #999;background:#f7f7f7;color:#222;border-radius:4px;font-size:12px;cursor:pointer;',
  });
  return btn;
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
