/**
 * @file        shopPanel.js
 * @module      ui
 * @summary     每日商店 overlay：6 格加權隨機品項、金幣/銀幣購買、每日重置、刷新上限
 * @exports     ShopPanel
 * @depends     config/economyConfig.js, src/account/walletService.js, uiManager
 * @version     v0.0.35.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { WalletService } from '../account/walletService.js';

const OVERLAY_ID = 'shop-overlay';
const SLOT_LIST_ID = 'shop-slots';
const WALLET_ID = 'shop-wallet';
const REFRESH_ID = 'shop-refresh-btn';
const CLOSE_ID = 'shop-close-btn';
const HIDDEN_CLASS = 'hidden';
const PURCHASED_CLASS = 'purchased';
const DISABLED_CLASS = 'disabled';
const CURRENCY_LABELS = { silver: '銀幣', gold: '金幣' };
const HOURS_PER_DAY = 24;
const FIRST_ITEM_INDEX = 0;

export class ShopPanel {
  constructor(container) {
    this.container = container ?? document.body;
    this.overlay = null;
    this.state = null;
    this.wallet = null;
    this.itemMap = new Map(ECONOMY.shop.items.map((item) => [item.id, item]));
  }

  show() {
    this.ensureOverlay();
    this.state = this.loadTodayState();
    this.wallet = WalletService.getWallet();
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
    this.overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.68);display:none;align-items:center;justify-content:center;z-index:10003;font-family:sans-serif;';
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.hide();
    });

    const panel = el('div', { class: 'overlay-panel' });
    panel.style.cssText = 'width:min(720px,94vw);max-height:88vh;overflow:auto;background:#101010;color:#eee;border:1px solid rgba(212,160,23,0.55);box-shadow:0 18px 48px rgba(0,0,0,0.45);border-radius:6px;padding:20px;box-sizing:border-box;';

    const title = el('h2', { textContent: '每日商店' });
    title.style.cssText = 'margin:0 0 10px;color:#D4A017;font-size:22px;letter-spacing:2px;';

    const wallet = el('div', { id: WALLET_ID, textContent: '銀幣: 0 ｜ 金幣: 0' });
    wallet.style.cssText = 'margin-bottom:14px;color:#f4d37b;font-size:13px;';

    const slots = el('div', { id: SLOT_LIST_ID });
    slots.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-bottom:14px;';

    const actions = el('div');
    actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;';

    const refresh = el('button', { id: REFRESH_ID, textContent: '刷新' });
    refresh.style.cssText = buttonStyle();
    refresh.addEventListener('click', () => this.refreshSlots());

    const close = el('button', { id: CLOSE_ID, textContent: '關閉' });
    close.style.cssText = buttonStyle();
    close.addEventListener('click', () => this.hide());

    actions.append(refresh, close);
    panel.append(title, wallet, slots, actions);
    this.overlay.appendChild(panel);
    this.container.appendChild(this.overlay);
  }

  loadTodayState() {
    const storageKey = this.todayStorageKey();
    const parsed = readJson(storageKey);
    if (this.isValidState(parsed)) return parsed;

    const state = {
      slots: this.generateSlots(),
      purchases: Array.from({ length: ECONOMY.shop.slotsPerDay }, () => false),
      refreshCount: FIRST_ITEM_INDEX,
    };
    writeJson(storageKey, state);
    return state;
  }

  isValidState(value) {
    return Boolean(
      value
        && Array.isArray(value.slots)
        && value.slots.length === ECONOMY.shop.slotsPerDay
        && value.slots.every((id) => this.itemMap.has(id))
        && Array.isArray(value.purchases)
        && value.purchases.length === ECONOMY.shop.slotsPerDay
        && value.purchases.every((flag) => typeof flag === 'boolean')
        && Number.isInteger(value.refreshCount)
        && value.refreshCount >= 0
        && value.refreshCount <= ECONOMY.shop.maxRefreshesPerDay,
    );
  }

  saveTodayState() {
    writeJson(this.todayStorageKey(), this.state);
  }

  todayStorageKey(now = new Date()) {
    return `${ECONOMY.shop.shopStorageKeyPrefix}${this.todayKey(now)}`;
  }

  todayKey(now = new Date()) {
    const offsetHours = HOURS_PER_DAY - ECONOMY.shop.resetHourUTC;
    const shifted = new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  generateSlots() {
    return Array.from({ length: ECONOMY.shop.slotsPerDay }, () => this.pickWeightedItem().id);
  }

  pickWeightedItem() {
    const totalWeight = ECONOMY.shop.items.reduce((sum, item) => sum + item.weight, FIRST_ITEM_INDEX);
    let roll = Math.random() * totalWeight;
    for (const item of ECONOMY.shop.items) {
      roll -= item.weight;
      if (roll < FIRST_ITEM_INDEX) return item;
    }
    return ECONOMY.shop.items[ECONOMY.shop.items.length - 1];
  }

  render() {
    this.wallet = WalletService.getWallet();
    const wallet = this.overlay.querySelector(`#${WALLET_ID}`);
    wallet.textContent = `銀幣: ${formatNumber(this.wallet.silver)} ｜ 金幣: ${formatNumber(this.wallet.gold)}`;

    const slots = this.overlay.querySelector(`#${SLOT_LIST_ID}`);
    slots.innerHTML = '';
    this.state.slots.forEach((itemId, index) => {
      const item = this.itemMap.get(itemId);
      slots.appendChild(this.renderSlot(item, index));
    });

    const refresh = this.overlay.querySelector(`#${REFRESH_ID}`);
    const remaining = Math.max(FIRST_ITEM_INDEX, ECONOMY.shop.maxRefreshesPerDay - this.state.refreshCount);
    refresh.textContent = `刷新（剩 ${remaining} 次）`;
    refresh.disabled = this.state.refreshCount >= ECONOMY.shop.maxRefreshesPerDay;
    refresh.classList.toggle(DISABLED_CLASS, refresh.disabled);
    refresh.title = refresh.disabled ? '今日刷新次數已用完' : '';
  }

  renderSlot(item, index) {
    const purchased = this.state.purchases[index];
    const slot = el('div', { class: `shop-slot${purchased ? ` ${PURCHASED_CLASS}` : ''}` });
    slot.style.cssText = 'border:1px solid rgba(212,160,23,0.35);background:rgba(255,255,255,0.045);border-radius:6px;padding:12px;min-height:136px;display:flex;flex-direction:column;gap:8px;';
    if (purchased) {
      slot.style.opacity = '0.58';
    }

    const name = el('div', { class: 'shop-item-name', textContent: item.name });
    name.style.cssText = 'font-size:15px;color:#fff;font-weight:bold;';

    const desc = el('div', { class: 'shop-item-desc', textContent: item.desc });
    desc.style.cssText = 'font-size:12px;color:#cfcfcf;line-height:1.35;min-height:32px;';

    const price = el('div', {
      class: 'shop-item-price',
      textContent: `${currencyLabel(item.currency)} ${formatNumber(item.price)}`,
    });
    price.style.cssText = 'font-size:13px;color:#f4d37b;margin-top:auto;';

    slot.append(name, desc, price);
    if (purchased) {
      const badge = el('span', { class: 'purchased-badge', textContent: '✓ 已購買' });
      badge.style.cssText = 'display:inline-block;padding:7px 10px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;color:#ddd;text-align:center;font-size:12px;';
      slot.appendChild(badge);
    } else {
      const canAfford = WalletService.canAfford({ [item.currency]: item.price }, this.wallet);
      const buy = el('button', { class: 'shop-buy-btn', textContent: '購買' });
      buy.style.cssText = buttonStyle();
      buy.disabled = !canAfford;
      buy.classList.toggle(DISABLED_CLASS, !canAfford);
      buy.title = canAfford ? '' : `${currencyLabel(item.currency)}不足`;
      buy.addEventListener('click', () => this.purchase(index));
      slot.appendChild(buy);
    }
    return slot;
  }

  purchase(index) {
    const item = this.itemMap.get(this.state.slots[index]);
    if (!item || this.state.purchases[index]) return;
    const cost = { [item.currency]: item.price };
    if (!WalletService.canAfford(cost, this.wallet)) {
      this.toast(`${currencyLabel(item.currency)}不足`);
      return;
    }

    const purchaseKey = `shop:${this.todayKey()}:${index}:${item.id}`;
    const spend = WalletService.spendWallet({
      source: 'shop',
      reason: `buy:${item.id}`,
      cost,
      idempotencyKey: `${purchaseKey}:spend`,
    });
    if (!spend.ok) {
      this.wallet = spend.wallet ?? WalletService.getWallet();
      this.toast(`${currencyLabel(item.currency)}不足`);
      this.render();
      return;
    }

    const reward = WalletService.grantReward(item.reward, {
      source: 'shop',
      reason: `buy:${item.id}`,
      idempotencyKey: `${purchaseKey}:reward`,
      toast: (message) => this.toast(message),
    });
    this.wallet = reward.wallet ?? spend.wallet ?? WalletService.getWallet();
    this.state.purchases[index] = true;
    this.saveTodayState();
    this.render();
  }

  async refreshSlots() {
    if (this.state.refreshCount >= ECONOMY.shop.maxRefreshesPerDay) return;
    if (this.state.refreshCount > FIRST_ITEM_INDEX) await this.watchAd();

    this.state.refreshCount += 1;
    this.state.slots = this.generateSlots();
    this.state.purchases = Array.from({ length: ECONOMY.shop.slotsPerDay }, () => false);
    this.saveTodayState();
    this.render();
    this.toast('商店已刷新');
  }

  watchAd() {
    console.log('AD_WATCHED');
    return Promise.resolve();
  }

  toast(message) {
    const toast = el('div', { textContent: message });
    toast.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:10004;background:rgba(0,0,0,0.82);color:#fff;border:1px solid rgba(212,160,23,0.55);border-radius:4px;padding:9px 12px;font-size:13px;pointer-events:none;';
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1400);
  }
}

function currencyLabel(currency) {
  return CURRENCY_LABELS[currency] ?? currency;
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
