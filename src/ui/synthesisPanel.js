/**
 * @file        synthesisPanel.js
 * @module      ui
 * @summary     裝備合成 overlay：選槽位與款式，列出可合成組合，顯示費用，執行合成
 * @exports     SynthesisPanel
 * @depends     config/economyConfig.js, config/equipmentConfig.js,
 *              src/account/equipmentService.js, src/account/walletService.js
 * @version     v0.0.26.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { EQUIPMENT_CONFIG, EQUIPMENT_SLOTS, EQUIPMENT_STYLES } from '../../config/equipmentConfig.js';
import { equipmentService } from '../account/equipmentService.js';
import { WalletService } from '../account/walletService.js';

const OVERLAY_ID = 'synthesis-overlay';
const GOLD = '#D4A017';

export class SynthesisPanel {
  constructor(container) {
    this.container = container ?? document.body;
    this.overlay = null;
    this._selectedType = EQUIPMENT_SLOTS[0];
    this._selectedStyle = null;
    this._statusEl = null;
    this._listEl = null;
    this._statusTimer = null;
    this._processing = false;
  }

  show() {
    this._ensureOverlay();
    this._renderList();
    this.overlay.style.display = 'flex';
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
  }

  _ensureOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      this.overlay = existing;
      this._statusEl = existing.querySelector('[data-synthesis-status]');
      this._listEl = existing.querySelector('[data-synthesis-list]');
      return;
    }

    this.overlay = el('div', { id: OVERLAY_ID });
    this.overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.92);' +
      'display:none;align-items:center;justify-content:center;' +
      'z-index:10004;font-family:sans-serif;color:#eee;';
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.hide();
    });

    const panel = el('div');
    panel.style.cssText =
      'width:min(660px,96vw);max-height:90vh;overflow:auto;' +
      'background:#101010;color:#eee;' +
      'border:1px solid rgba(212,160,23,0.55);' +
      'box-shadow:0 18px 48px rgba(0,0,0,0.5);' +
      'border-radius:6px;padding:20px;box-sizing:border-box;';

    const titleRow = el('div');
    titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    const titleEl = el('h2', { textContent: '⚗️ 裝備合成' });
    titleEl.style.cssText = `margin:0;color:${GOLD};font-family:Georgia,serif;font-size:22px;letter-spacing:2px;`;
    const closeTop = el('button', { textContent: '✕' });
    closeTop.style.cssText = btnStyle();
    closeTop.addEventListener('click', () => this.hide());
    titleRow.append(titleEl, closeTop);

    this._statusEl = el('div', { 'data-synthesis-status': 'true' });
    this._statusEl.style.cssText =
      'min-height:20px;font-size:13px;color:#f4d37b;text-align:center;margin-bottom:10px;';

    const typeRow = el('div');
    typeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;';
    for (const type of EQUIPMENT_SLOTS) {
      const btn = el('button', { textContent: EQUIPMENT_CONFIG.slots[type]?.name ?? type });
      btn.dataset.type = type;
      btn.style.cssText = tabStyle(type === this._selectedType);
      btn.addEventListener('click', () => {
        this._selectedType = type;
        typeRow.querySelectorAll('button').forEach((button) => {
          button.style.cssText = tabStyle(button.dataset.type === type);
        });
        this._renderList();
      });
      typeRow.appendChild(btn);
    }

    const styleFilterRow = el('div');
    styleFilterRow.style.cssText =
      'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;align-items:center;';
    const styleLabel = el('span', { textContent: '款式：' });
    styleLabel.style.cssText = 'color:#aaa;font-size:12px;flex-shrink:0;';
    styleFilterRow.appendChild(styleLabel);

    const allStyleBtn = el('button', { textContent: '全部' });
    allStyleBtn.dataset.style = '';
    allStyleBtn.style.cssText = styleTabStyle(true);
    allStyleBtn.addEventListener('click', () => {
      this._selectedStyle = null;
      styleFilterRow.querySelectorAll('button').forEach((button) => {
        button.style.cssText = styleTabStyle(button.dataset.style === '');
      });
      this._renderList();
    });
    styleFilterRow.appendChild(allStyleBtn);

    for (const style of EQUIPMENT_STYLES) {
      const btn = el('button', { textContent: style });
      btn.dataset.style = style;
      btn.style.cssText = styleTabStyle(false);
      btn.addEventListener('click', () => {
        this._selectedStyle = style;
        styleFilterRow.querySelectorAll('button').forEach((button) => {
          button.style.cssText = styleTabStyle(button.dataset.style === style);
        });
        this._renderList();
      });
      styleFilterRow.appendChild(btn);
    }

    this._listEl = el('div', { 'data-synthesis-list': 'true' });
    this._listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:12px;';

    const bottomRow = el('div');
    bottomRow.style.cssText = 'display:flex;justify-content:flex-end;';
    const closeBot = el('button', { textContent: '關閉' });
    closeBot.style.cssText = btnStyle();
    closeBot.addEventListener('click', () => this.hide());
    bottomRow.appendChild(closeBot);

    panel.append(titleRow, this._statusEl, typeRow, styleFilterRow, this._listEl, bottomRow);
    this.overlay.appendChild(panel);
    this.container.appendChild(this.overlay);
  }

  _renderList() {
    if (!this._listEl) return;
    const inventory = equipmentService.getInventory();
    const options = getSynthesisOptions(inventory, this._selectedType, this._selectedStyle);
    this._listEl.replaceChildren();

    if (options.length === 0) {
      const msg = el('div', { textContent: '目前沒有可合成的裝備組合' });
      msg.style.cssText = 'color:#888;font-size:13px;text-align:center;padding:20px 0;';
      this._listEl.appendChild(msg);
      return;
    }

    for (const option of options) {
      this._listEl.appendChild(this._renderOption(option));
    }
  }

  _renderOption({ type, style, level, items }) {
    const cost = ECONOMY.synthesis.silverCostPerSynth[level];
    const costValid = Number.isFinite(cost) && cost > 0;
    const typeName = EQUIPMENT_CONFIG.slots[type]?.name ?? type;
    const canAfford = costValid && WalletService.canAfford({ silver: cost });

    const row = el('div');
    row.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;' +
      'padding:10px 12px;border-radius:5px;' +
      'border:1px solid rgba(212,160,23,0.3);background:rgba(255,255,255,0.04);';

    const info = el('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    const nameEl = el('span', { textContent: `${typeName}－款式 ${style}` });
    nameEl.style.cssText = 'font-size:14px;color:#fff;font-weight:bold;';

    const matEl = el('span', {
      textContent: `Lv${level} × ${items.length} 件  →  Lv${level + 1} × 1 件`,
    });
    matEl.style.cssText = 'font-size:12px;color:#aaa;';

    const costText = costValid
      ? `費用：${cost.toLocaleString('en-US')} 銀幣`
      : '費用：設定錯誤';
    const costEl = el('span', { textContent: costText });
    costEl.style.cssText = `font-size:12px;color:${canAfford ? '#f4d37b' : '#e57373'};`;

    info.append(nameEl, matEl, costEl);

    const synthBtn = el('button', { textContent: '合成' });
    synthBtn.style.cssText = synthBtnStyle(canAfford);
    synthBtn.disabled = !canAfford;
    synthBtn.addEventListener('click', () => {
      this._doSynthesize({ type, style, level, items });
    });

    row.append(info, synthBtn);
    return row;
  }

  _doSynthesize({ type, style, level, items }) {
    if (this._processing) return;
    this._processing = true;

    try {
      const cost = ECONOMY.synthesis.silverCostPerSynth[level];
      if (!Number.isFinite(cost) || cost <= 0) {
        this._setStatus('❌ 合成費用設定錯誤');
        return;
      }

      if (!WalletService.canAfford({ silver: cost })) {
        this._setStatus('❌ 銀幣不足');
        return;
      }

      const [matA, matB] = items;
      const precheck = equipmentService.validateSynthesisMaterials({
        materialIds: [matA.id, matB.id],
      });
      if (!precheck.ok) {
        this._setStatus(`❌ ${precheck.reason}`);
        return;
      }

      const sortedIds = [matA.id, matB.id].sort();
      const idempotencyKey =
        `synth:local:${type}:${style}:lv${level}:` +
        encodeURIComponent(sortedIds.join('|'));

      const spendResult = WalletService.spendWallet({
        source: 'synthesis',
        reason: 'synth',
        cost: { silver: cost },
        idempotencyKey,
      });
      if (!spendResult.ok && !spendResult.duplicate) {
        this._setStatus(`❌ 扣款失敗：${spendResult.reason}`);
        return;
      }

      const invResult = equipmentService.replaceItemsWithResult({
        materialIds: [matA.id, matB.id],
        idempotencyKey,
      });
      if (!invResult.ok) {
        console.error('SYNTH_INVENTORY_FAIL', { idempotencyKey, reason: invResult.reason });
        this._setStatus(`❌ 庫存更新失敗：${invResult.reason}`);
        return;
      }

      const typeName = EQUIPMENT_CONFIG.slots[type]?.name ?? type;
      this._setStatus(`✅ 合成成功：${typeName}－款式 ${style} Lv${level + 1}`);
      this._renderList();
    } finally {
      this._processing = false;
    }
  }

  _setStatus(msg) {
    if (!this._statusEl) return;
    this._statusEl.textContent = msg;
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => {
      this._statusEl.textContent = '';
    }, 3000);
  }
}

function getSynthesisOptions(inventory, filterType, filterStyle) {
  const grouped = {};
  for (const item of inventory) {
    if (item.type !== filterType) continue;
    if (filterStyle !== null && item.style !== filterStyle) continue;
    const key = `${item.type}|${item.style}|${item.level}`;
    if (!grouped[key]) {
      grouped[key] = { type: item.type, style: item.style, level: item.level, items: [] };
    }
    grouped[key].items.push(item);
  }
  return Object.values(grouped)
    .filter((group) => group.items.length >= 2 && group.level < EQUIPMENT_CONFIG.maxLevel)
    .sort((a, b) => a.level - b.level || a.style.localeCompare(b.style));
}

function el(tag, props = {}) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'textContent') node.textContent = value;
    else if (key === 'id') node.id = value;
    else node.setAttribute(key, value);
  }
  return node;
}

function btnStyle() {
  return 'padding:7px 14px;border:1px solid rgba(212,160,23,0.55);background:rgba(212,160,23,0.12);color:#f4d37b;border-radius:4px;font-size:13px;cursor:pointer;';
}

function tabStyle(active) {
  return active
    ? `padding:6px 12px;border:1px solid ${GOLD};background:rgba(212,160,23,0.22);color:${GOLD};border-radius:4px;font-size:13px;cursor:pointer;font-weight:bold;`
    : 'padding:6px 12px;border:1px solid rgba(212,160,23,0.3);background:transparent;color:#aaa;border-radius:4px;font-size:13px;cursor:pointer;';
}

function styleTabStyle(active) {
  return active
    ? `padding:4px 9px;border:1px solid ${GOLD};background:rgba(212,160,23,0.22);color:${GOLD};border-radius:3px;font-size:12px;cursor:pointer;font-weight:bold;`
    : 'padding:4px 9px;border:1px solid rgba(212,160,23,0.2);background:transparent;color:#888;border-radius:3px;font-size:12px;cursor:pointer;';
}

function synthBtnStyle(enabled) {
  return enabled
    ? 'padding:8px 16px;border:1px solid rgba(212,160,23,0.7);background:rgba(212,160,23,0.2);color:#f4d37b;border-radius:4px;font-size:13px;cursor:pointer;white-space:nowrap;'
    : 'padding:8px 16px;border:1px solid #444;background:#1a1a1a;color:#555;border-radius:4px;font-size:13px;cursor:not-allowed;white-space:nowrap;';
}
