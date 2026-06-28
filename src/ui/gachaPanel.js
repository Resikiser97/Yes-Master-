/**
 * @file        gachaPanel.js
 * @module      ui
 * @summary     抽獎盤 overlay：64格不放回抽樣、大獎高亮、盤面持久化、票券消費
 * @exports     GachaPanel, buildBoard
 * @depends     config/economyConfig.js, src/account/walletService.js, config/equipmentConfig.js
 * @version     v0.0.21.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { EQUIPMENT_SLOTS } from '../../config/equipmentConfig.js';
import { WalletService } from '../account/walletService.js';

const OVERLAY_ID = 'gacha-overlay';
const GRID_ID = 'gacha-grid';
const WALLET_ID = 'gacha-wallet';
const PROGRESS_ID = 'gacha-progress';
const TOAST_ID = 'gacha-toast';
const PULL_BTN_ID = 'gacha-pull-btn';
const CLOSE_BTN_ID = 'gacha-close-btn';
const HIDDEN_CLASS = 'hidden';

export function buildBoard(rng = Math.random) {
  const cells = [];
  for (const [type, reward] of Object.entries(ECONOMY.gacha.rewards)) {
    for (let index = 0; index < reward.slots; index += 1) {
      cells.push(cellFromReward(type, reward));
    }
  }

  if (cells.length !== ECONOMY.gacha.boardSize) {
    throw new Error(`gacha board size mismatch: expected ${ECONOMY.gacha.boardSize}, got ${cells.length}`);
  }

  return shuffle(cells, rng);
}

export class GachaPanel {
  constructor(container) {
    this.container = container ?? document.body;
    this.overlay = null;
    this.state = null;
    this.isPulling = false;
    this.toastTimer = null;
  }

  show() {
    this.ensureOverlay();
    this.state = this.loadOrInit();
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
    panel.style.cssText = 'width:min(560px,94vw);max-height:92vh;overflow:auto;background:#101010;border:1px solid rgba(212,160,23,0.62);border-radius:6px;box-shadow:0 18px 48px rgba(0,0,0,0.55);padding:18px;box-sizing:border-box;position:relative;';

    const toast = el('div', { id: TOAST_ID });
    toast.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.88);border:1px solid rgba(212,160,23,0.6);border-radius:4px;color:#fff;padding:8px 12px;font-size:13px;opacity:0;pointer-events:none;transition:opacity 180ms ease;z-index:1;white-space:nowrap;';

    const title = el('h2', { textContent: '✦ 抽獎盤 ✦' });
    title.style.cssText = 'margin:0 0 10px;color:#D4A017;font-family:Georgia,serif;font-size:24px;letter-spacing:3px;text-align:center;';

    const wallet = el('div', { id: WALLET_ID });
    wallet.style.cssText = 'color:#f4d37b;font-size:13px;text-align:center;margin-bottom:6px;';

    const progress = el('div', { id: PROGRESS_ID });
    progress.style.cssText = 'color:#cfcfcf;font-size:12px;text-align:center;margin-bottom:12px;';

    const grid = el('div', { id: GRID_ID });
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px;margin-bottom:14px;';

    const actions = el('div');
    actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;';

    const pull = el('button', { id: PULL_BTN_ID, textContent: '抽一次（-1票）' });
    pull.style.cssText = buttonStyle();
    pull.addEventListener('click', () => this.pull());

    const close = el('button', { id: CLOSE_BTN_ID, textContent: '關閉' });
    close.style.cssText = buttonStyle();
    close.addEventListener('click', () => this.hide());

    actions.append(pull, close);
    panel.append(toast, title, wallet, progress, grid, actions);
    this.overlay.appendChild(panel);
    this.container.appendChild(this.overlay);
  }

  loadOrInit() {
    const parsed = readJson(ECONOMY.gacha.boardStorageKey);
    const normalized = normalizeStoredState(parsed);
    if (normalized && normalized.bigPrizesCleared < bigPrizeTarget() && normalized.pulled.includes(false)) {
      writeJson(ECONOMY.gacha.boardStorageKey, normalized);
      return normalized;
    }

    const state = createNewBoardState();
    writeJson(ECONOMY.gacha.boardStorageKey, state);
    return state;
  }

  saveState() {
    writeJson(ECONOMY.gacha.boardStorageKey, this.state);
  }

  render() {
    const wallet = WalletService.getWallet();
    this.overlay.querySelector(`#${WALLET_ID}`).textContent = `🎫 票券：${formatNumber(wallet.ticket ?? 0)} 張`;

    const pulledCount = this.state.pulled.filter(Boolean).length;
    const target = bigPrizeTarget();
    this.overlay.querySelector(`#${PROGRESS_ID}`).textContent = `已抽 ${pulledCount} / ${ECONOMY.gacha.boardSize}　大獎 ${this.state.bigPrizesCleared} / ${target}`;

    const grid = this.overlay.querySelector(`#${GRID_ID}`);
    grid.innerHTML = '';
    this.state.slots.forEach((cell, index) => {
      grid.appendChild(this.renderCell(cell, index));
    });

    const ended = this.isEnded();
    const pull = this.overlay.querySelector(`#${PULL_BTN_ID}`);
    pull.textContent = ended ? '本盤已結束' : '抽一次（-1票）';
    pull.disabled = ended;
    pull.style.opacity = ended ? '0.55' : '1';
    pull.style.cursor = ended ? 'not-allowed' : 'pointer';
  }

  renderCell(cell, index) {
    const pulled = this.state.pulled[index];
    const slot = el('button', { class: 'gacha-cell', type: 'button' });
    slot.style.cssText = cellStyle(cell, pulled);
    slot.textContent = pulled
      ? `${cell.isBigPrize ? '✦ ' : ''}${cellLabel(cell)}`
      : '';
    slot.title = pulled ? cellTitle(cell) : '未抽';
    slot.disabled = pulled || this.isEnded();
    if (!pulled) {
      slot.addEventListener('mouseover', () => {
        slot.style.background = 'rgba(212,160,23,0.18)';
        slot.style.borderColor = 'rgba(244,211,123,0.95)';
      });
      slot.addEventListener('mouseout', () => {
        slot.style.background = 'rgba(255,255,255,0.035)';
        slot.style.borderColor = 'rgba(212,160,23,0.48)';
      });
      slot.addEventListener('click', () => this.pull());
    }
    return slot;
  }

  pull() {
    if (this.isPulling) return;
    if (this.isEnded()) return;

    if (!WalletService.canAfford({ ticket: 1 })) {
      this.showToast('票券不足');
      return;
    }

    this.isPulling = true;
    try {
      const available = this.state.pulled
        .map((pulled, index) => (pulled ? null : index))
        .filter((index) => index != null);
      if (available.length === 0) return;

      const slotIndex = available[Math.floor(Math.random() * available.length)];
      const cell = this.state.slots[slotIndex];
      const pullKey = `gacha-pull:local:${this.state.boardId}:${slotIndex}`;
      const spend = WalletService.spendWallet({
        source: 'gacha',
        reason: 'pull',
        cost: { ticket: 1 },
        idempotencyKey: `${pullKey}:spend`,
      });

      if (!spend.ok && !spend.duplicate) {
        this.showToast('扣票失敗，請重試');
        return;
      }

      WalletService.grantReward(cellToReward(cell), {
        source: 'gacha',
        reason: cell.type,
        idempotencyKey: `${pullKey}:reward`,
        toast: (message) => this.showToast(message),
      });

      this.state.pulled[slotIndex] = true;
      this.state.bigPrizesCleared = countClearedBigPrizes(this.state);
      this.saveState();
      this.render();
    } finally {
      this.isPulling = false;
    }
  }

  isEnded() {
    return this.state.bigPrizesCleared >= bigPrizeTarget() || !this.state.pulled.includes(false);
  }

  showToast(message) {
    const toast = this.overlay.querySelector(`#${TOAST_ID}`);
    toast.textContent = message;
    toast.style.opacity = '1';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      toast.style.opacity = '0';
    }, 3000);
  }
}

export function cellToReward(cell) {
  if (cell.type.startsWith('silver')) return { silver: cell.amount };
  if (cell.type.startsWith('gold')) return { gold: cell.amount };
  if (cell.type.startsWith('ticket')) return { ticket: cell.amount };
  if (cell.type.startsWith('equip')) return { equipment: { level: cell.level } };
  return {};
}

function createNewBoardState() {
  return {
    boardId: createBoardId(),
    slots: buildBoard(),
    pulled: Array.from({ length: ECONOMY.gacha.boardSize }, () => false),
    bigPrizesCleared: 0,
    createdAt: new Date().toISOString(),
  };
}

function normalizeStoredState(value) {
  if (!isObject(value)) return null;
  if (typeof value.boardId !== 'string' || !value.boardId) return null;
  if (!Array.isArray(value.slots) || value.slots.length !== ECONOMY.gacha.boardSize) return null;
  if (!Array.isArray(value.pulled) || value.pulled.length !== ECONOMY.gacha.boardSize) return null;
  if (!value.pulled.every((entry) => typeof entry === 'boolean')) return null;
  if (typeof value.createdAt !== 'string') return null;
  if (!isValidBoardComposition(value.slots)) return null;

  const slots = value.slots.map((cell) => cellFromReward(cell.type, ECONOMY.gacha.rewards[cell.type]));
  const state = {
    boardId: value.boardId,
    slots,
    pulled: value.pulled.slice(),
    bigPrizesCleared: 0,
    createdAt: value.createdAt,
  };
  state.bigPrizesCleared = countClearedBigPrizes(state);
  return state;
}

function isValidBoardComposition(slots) {
  const counts = new Map();
  for (const cell of slots) {
    if (!isValidStoredCell(cell)) return false;
    counts.set(cell.type, (counts.get(cell.type) ?? 0) + 1);
  }
  return Object.entries(ECONOMY.gacha.rewards).every(([type, reward]) => counts.get(type) === reward.slots);
}

function isValidStoredCell(cell) {
  if (!isObject(cell) || typeof cell.type !== 'string') return false;
  const reward = ECONOMY.gacha.rewards[cell.type];
  if (!reward) return false;
  if (cell.isBigPrize !== !!reward.isBigPrize) return false;
  if ('amount' in reward && cell.amount !== reward.amount) return false;
  if ('level' in reward && cell.level !== reward.level) return false;
  return true;
}

function countClearedBigPrizes(state) {
  return state.slots.filter((cell, index) => state.pulled[index] && cell.isBigPrize).length;
}

function bigPrizeTarget() {
  return Object.values(ECONOMY.gacha.rewards)
    .reduce((sum, reward) => sum + (reward.isBigPrize ? reward.slots : 0), 0);
}

function cellFromReward(type, reward) {
  const cell = { type, isBigPrize: !!reward.isBigPrize };
  if ('amount' in reward) cell.amount = reward.amount;
  if ('level' in reward) cell.level = reward.level;
  return cell;
}

function shuffle(cells, rng) {
  const shuffled = cells.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function cellLabel(cell) {
  if (cell.type.startsWith('silver')) return `銀幣 ×${formatNumber(cell.amount)}`;
  if (cell.type.startsWith('gold')) return `金幣 ×${formatNumber(cell.amount)}`;
  if (cell.type.startsWith('ticket')) return `票券 ×${formatNumber(cell.amount)}`;
  if (cell.type.startsWith('equip')) return `裝備 Lv${cell.level}`;
  return cell.type;
}

function cellTitle(cell) {
  if (cell.type.startsWith('equip')) return `${cellLabel(cell)}（${EQUIPMENT_SLOTS.length}種隨機款式）`;
  return cellLabel(cell);
}

function createBoardId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-US');
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function cellStyle(cell, pulled) {
  const base = 'aspect-ratio:1/1;min-width:0;border-radius:4px;box-sizing:border-box;font-size:10px;line-height:1.18;text-align:center;display:flex;align-items:center;justify-content:center;padding:3px;word-break:break-word;transition:background 160ms ease,border-color 160ms ease,color 160ms ease;';
  if (!pulled) {
    return `${base}border:1px solid rgba(212,160,23,0.48);background:rgba(255,255,255,0.035);color:#f4d37b;cursor:pointer;`;
  }
  if (cell.isBigPrize) {
    return `${base}border:1px solid rgba(244,211,123,0.88);background:rgba(212,160,23,0.3);color:#fff;cursor:default;font-weight:bold;`;
  }
  return `${base}border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);color:#cfcfcf;cursor:default;`;
}

function buttonStyle() {
  return 'padding:8px 12px;border:1px solid rgba(212,160,23,0.55);background:rgba(212,160,23,0.12);color:#f4d37b;border-radius:4px;font-size:12px;cursor:pointer;';
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
