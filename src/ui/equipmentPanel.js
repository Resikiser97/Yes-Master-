/**
 * @file        equipmentPanel.js
 * @module      ui
 * @summary     裝備碎片庫存 overlay：持有裝備清單，按類型分組，顯示等級與件數
 * @exports     EquipmentPanel
 * @depends     config/economyConfig.js, config/equipmentConfig.js, src/account/walletService.js
 * @version     v0.0.22.0
 */

import { EQUIPMENT_CONFIG, EQUIPMENT_SLOTS } from '../../config/equipmentConfig.js';
import { WalletService } from '../account/walletService.js';

const OVERLAY_ID = 'equipment-overlay';
const LIST_ID = 'equipment-inventory-list';
const SUMMARY_ID = 'equipment-inventory-summary';
const HIDDEN_CLASS = 'hidden';
const LEVEL_COLORS = {
  0: '#888',
  1: '#eee',
  2: '#4caf50',
  3: '#2196f3',
  4: '#D4A017',
};

export class EquipmentPanel {
  constructor(container) {
    this.container = container ?? document.body;
    this.overlay = null;
  }

  show() {
    this.ensureOverlay();
    this.render();
    this.overlay.style.display = 'flex';
    this.overlay.classList.remove(HIDDEN_CLASS);
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
    this.overlay?.classList.add(HIDDEN_CLASS);
  }

  ensureOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      this.overlay = existing;
      return;
    }

    this.overlay = el('div', { id: OVERLAY_ID, class: `overlay ${HIDDEN_CLASS}` });
    this.overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:none;align-items:center;justify-content:center;z-index:10003;font-family:sans-serif;color:#eee;';
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.hide();
    });

    const panel = el('div', { class: 'overlay-panel' });
    panel.style.cssText = 'width:min(620px,94vw);max-height:88vh;overflow:auto;background:#101010;color:#eee;border:1px solid rgba(212,160,23,0.55);box-shadow:0 18px 48px rgba(0,0,0,0.5);border-radius:6px;padding:20px;box-sizing:border-box;';

    const title = el('h2', { textContent: '🎒 裝備庫存' });
    title.style.cssText = 'margin:0 0 10px;color:#D4A017;font-family:Georgia,serif;font-size:24px;letter-spacing:2px;text-align:center;';

    const summary = el('div', { id: SUMMARY_ID });
    summary.style.cssText = 'margin-bottom:14px;color:#f4d37b;font-size:13px;text-align:center;';

    const list = el('div', { id: LIST_ID });
    list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-bottom:14px;';

    const actions = el('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;';
    const close = el('button', { textContent: '關閉' });
    close.style.cssText = buttonStyle();
    close.addEventListener('click', () => this.hide());
    actions.appendChild(close);

    panel.append(title, summary, list, actions);
    this.overlay.appendChild(panel);
    this.container.appendChild(this.overlay);
  }

  render() {
    const inventory = WalletService.getInventory();
    this.overlay.querySelector(`#${SUMMARY_ID}`).textContent = `共 ${formatNumber(inventory.length)} 件裝備`;

    const list = this.overlay.querySelector(`#${LIST_ID}`);
    list.replaceChildren();
    for (const type of EQUIPMENT_SLOTS) {
      list.appendChild(this.renderTypeBlock(type, inventory.filter((item) => item.type === type)));
    }
  }

  renderTypeBlock(type, items) {
    const block = el('section');
    block.style.cssText = 'border:1px solid rgba(212,160,23,0.35);background:rgba(255,255,255,0.045);border-radius:6px;padding:12px;min-height:104px;box-sizing:border-box;';

    const title = el('div', { textContent: EQUIPMENT_CONFIG.slots[type]?.name ?? type });
    title.style.cssText = 'font-size:15px;color:#fff;font-weight:bold;margin-bottom:8px;';

    const body = el('div');
    body.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;min-height:34px;';

    if (items.length === 0) {
      const empty = el('span', { textContent: '尚無裝備' });
      empty.style.cssText = 'color:#888;font-size:12px;';
      body.appendChild(empty);
    } else {
      for (const [level, count] of levelCounts(items)) {
        body.appendChild(levelBadge(level, count));
      }
    }

    block.append(title, body);
    return block;
  }
}

function levelCounts(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.level, (counts.get(item.level) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
}

function levelBadge(level, count) {
  const badge = el('span', { textContent: `Lv${level} ×${count}` });
  badge.style.cssText = `display:inline-block;border:1px solid ${LEVEL_COLORS[level] ?? '#888'};color:${LEVEL_COLORS[level] ?? '#888'};background:rgba(0,0,0,0.22);border-radius:4px;padding:5px 8px;font-size:12px;font-weight:bold;`;
  return badge;
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-US');
}

function buttonStyle() {
  return 'padding:8px 12px;border:1px solid rgba(212,160,23,0.55);background:rgba(212,160,23,0.12);color:#f4d37b;border-radius:4px;font-size:12px;cursor:pointer;';
}

function el(tag, props = {}) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'textContent') node.textContent = value;
    else node.setAttribute(key, value);
  });
  return node;
}
