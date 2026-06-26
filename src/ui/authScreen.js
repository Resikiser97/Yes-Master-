/**
 * @file        authScreen.js
 * @module      ui
 * @summary     登入/訪客 overlay — Google OAuth + 匿名登入
 * @exports     showAuthScreen
 * @depends     src/net/authManager.js
 * @version     v0.0.14.0
 */

import { signInWithGoogle, signInAnonymously, getCurrentUser, ensureProfile, onAuthStateChange } from '../net/authManager.js';

const GOLD = '#D4A017';
const GOLD_DIM = 'rgba(212,160,23,0.7)';
const GOLD_BORDER = 'rgba(212,160,23,0.45)';
const GOLD_BG = 'rgba(212,160,23,0.12)';

export async function showAuthScreen(onAuthed) {
  const existing = await getCurrentUser();
  if (existing) {
    await ensureProfile(existing);
    onAuthed(existing);
    return;
  }

  const overlay = _el('div', {
    id: 'auth-overlay',
    style: 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10001;opacity:0;transition:opacity 0.5s ease;font-family:sans-serif;',
  });

  const box = _el('div', {
    style: `display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px 40px;border:2px solid ${GOLD_BORDER};background:rgba(0,0,0,0.8);min-width:280px;`,
  });

  box.appendChild(_el('div', {
    textContent: 'GOBLIN NEST',
    style: `font-family:Georgia,serif;font-size:24px;font-weight:bold;letter-spacing:4px;color:${GOLD};text-shadow:2px 2px 0px #7a5500;`,
  }));
  box.appendChild(_el('div', {
    textContent: '登入以進入多人大廳',
    style: `color:${GOLD_DIM};font-size:12px;letter-spacing:2px;margin-bottom:8px;`,
  }));

  const statusEl = _el('div', {
    style: `color:${GOLD_DIM};font-size:11px;min-height:16px;text-align:center;`,
  });

  const googleBtn = _btn('Google 登入');
  googleBtn.style.borderColor = GOLD;
  googleBtn.style.color = GOLD;
  googleBtn.style.fontSize = '14px';
  googleBtn.style.padding = '12px 32px';
  googleBtn.addEventListener('click', async () => {
    statusEl.textContent = '跳轉至 Google...';
    try {
      await signInWithGoogle();
    } catch (err) {
      statusEl.textContent = '登入失敗: ' + (err.message || err);
    }
  });

  const guestBtn = _btn('訪客模式');
  guestBtn.addEventListener('click', async () => {
    statusEl.textContent = '建立訪客帳號...';
    guestBtn.disabled = true;
    try {
      const user = await signInAnonymously();
      await ensureProfile(user);
      _dismiss(overlay, () => onAuthed(user));
    } catch (err) {
      statusEl.textContent = '失敗: ' + (err.message || err);
      guestBtn.disabled = false;
    }
  });

  const backBtn = _btn('← 返回');
  backBtn.style.marginTop = '8px';
  backBtn.addEventListener('click', () => {
    _dismiss(overlay);
  });

  box.append(googleBtn, guestBtn, statusEl, backBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  const sub = await onAuthStateChange(async (user) => {
    if (user) {
      sub.unsubscribe();
      await ensureProfile(user);
      _dismiss(overlay, () => onAuthed(user));
    }
  });
}

function _dismiss(overlay, cb) {
  overlay.style.opacity = '0';
  setTimeout(() => { overlay.remove(); cb?.(); }, 500);
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
    style: `padding:8px 24px;background:transparent;border:1px solid ${GOLD_BORDER};color:${GOLD_DIM};font-size:12px;letter-spacing:1px;cursor:pointer;outline:none;transition:background 0.2s,border-color 0.2s;`,
  });
  btn.addEventListener('mouseover', () => { btn.style.background = GOLD_BG; btn.style.borderColor = GOLD; });
  btn.addEventListener('mouseout', () => { btn.style.background = 'transparent'; btn.style.borderColor = GOLD_BORDER; });
  return btn;
}
