/**
 * @file        characterPopup.js
 * @module      ui
 * @summary     角色面板 popup — 顯示等級、裝備、賽季稱號
 * @exports     showCharacterPopup
 * @depends     src/net/authManager.js, src/game/equipmentSystem.js, src/game/leaderboardSystem.js
 * @version     v0.0.20.0
 */

import { getProfile } from '../net/authManager.js';
import { getEquipment } from '../game/equipmentSystem.js';
import { getPlayerRank, getSeasonTitle } from '../game/leaderboardSystem.js';
import { EQUIPMENT_CONFIG } from '../../config/equipmentConfig.js';

const GOLD = '#D4A017';
const GOLD_DIM = 'rgba(212,160,23,0.7)';
const GOLD_BORDER = 'rgba(212,160,23,0.45)';

export async function showCharacterPopup(userId) {
  const existing = document.getElementById('character-popup');
  if (existing) existing.remove();

  const overlay = _el('div', {
    id: 'character-popup',
    style: 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10002;opacity:0;transition:opacity 0.3s ease;font-family:sans-serif;',
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) _dismiss(overlay); });

  const box = _el('div', {
    style: `min-width:300px;max-width:400px;background:#111;border:2px solid ${GOLD};padding:20px 24px;display:flex;flex-direction:column;gap:12px;`,
  });

  box.appendChild(_el('div', { textContent: '載入中...', style: `color:${GOLD_DIM};font-size:12px;text-align:center;` }));
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  try {
    const [profile, equipment, rankData] = await Promise.all([
      getProfile(userId),
      getEquipment(userId).catch(() => null),
      getPlayerRank(userId).catch(() => null),
    ]);

    box.innerHTML = '';

    // Header
    const name = profile?.display_name || 'Goblin';
    box.appendChild(_el('div', {
      textContent: name,
      style: `color:${GOLD};font-family:Georgia,serif;font-size:18px;font-weight:bold;letter-spacing:2px;text-align:center;`,
    }));

    // Season title
    if (rankData) {
      const title = getSeasonTitle(rankData.rank, rankData.totalPlayers);
      if (title && title.id !== 'none') {
        box.appendChild(_el('div', {
          textContent: title.name,
          style: `color:${GOLD_DIM};font-size:11px;letter-spacing:2px;text-align:center;`,
        }));
      }
    }

    // Level + Exp
    const level = profile?.level ?? 1;
    const exp = profile?.exp ?? 0;
    box.appendChild(_row('等級', `Lv.${level}`));
    box.appendChild(_row('經驗值', `${exp}`));

    // Divider
    box.appendChild(_el('div', { style: `height:1px;background:${GOLD_BORDER};margin:4px 0;` }));

    // Equipment
    box.appendChild(_el('div', {
      textContent: '裝備',
      style: `color:${GOLD};font-size:13px;font-weight:bold;letter-spacing:1px;`,
    }));

    const slots = EQUIPMENT_CONFIG.slots;
    for (const [key, slot] of Object.entries(slots)) {
      const lv = equipment?.[`${key}_level`] ?? 0;
      box.appendChild(_row(slot.name, `Lv.${lv}`));
    }

    // Close button
    const closeBtn = _el('button', {
      textContent: '關閉',
      style: `margin-top:8px;padding:8px 20px;background:transparent;border:1px solid ${GOLD_BORDER};color:${GOLD_DIM};font-size:12px;cursor:pointer;align-self:center;outline:none;transition:background 0.2s;`,
    });
    closeBtn.addEventListener('mouseover', () => { closeBtn.style.background = 'rgba(212,160,23,0.12)'; });
    closeBtn.addEventListener('mouseout', () => { closeBtn.style.background = 'transparent'; });
    closeBtn.addEventListener('click', () => _dismiss(overlay));
    box.appendChild(closeBtn);
  } catch (err) {
    box.innerHTML = '';
    box.appendChild(_el('div', { textContent: '載入失敗: ' + (err.message || err), style: 'color:#f44;font-size:12px;text-align:center;' }));
    const closeBtn = _el('button', { textContent: '關閉', style: `margin-top:8px;padding:8px 20px;background:transparent;border:1px solid ${GOLD_BORDER};color:${GOLD_DIM};font-size:12px;cursor:pointer;align-self:center;outline:none;` });
    closeBtn.addEventListener('click', () => _dismiss(overlay));
    box.appendChild(closeBtn);
  }
}

function _row(label, value) {
  const row = _el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' });
  row.appendChild(_el('span', { textContent: label, style: `color:${GOLD_DIM};font-size:12px;` }));
  row.appendChild(_el('span', { textContent: value, style: `color:#eee;font-size:12px;` }));
  return row;
}

function _dismiss(overlay) {
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 300);
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
