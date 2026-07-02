import assert from 'node:assert/strict';

import { ECONOMY } from '../config/economyConfig.js';
import { ShopPanel } from '../src/ui/shopPanel.js';
import { WalletService } from '../src/account/walletService.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
}

function clearShopStorage(panel = null) {
  localStorage.removeItem(ECONOMY.shop.walletStorageKey);
  localStorage.removeItem(ECONOMY.shop.walletTransactionsKey);
  localStorage.removeItem(ECONOMY.inventory.storageKey);
  localStorage.removeItem(ECONOMY.skills.storageKey);
  if (panel) localStorage.removeItem(panel.todayStorageKey());
}

function freshPanel() {
  clearShopStorage();
  WalletService.resetWallet();
  const panel = new ShopPanel({});
  clearShopStorage(panel);
  WalletService.resetWallet();
  panel.render = () => {};
  panel.toast = () => {};
  return panel;
}

function shopItem(id) {
  const item = ECONOMY.shop.items.find((entry) => entry.id === id);
  assert.ok(item, `missing ECONOMY.shop item: ${id}`);
  return item;
}

function testTodayKeyRollsOverAtResetHour() {
  const panel = freshPanel();
  const before = new Date(Date.UTC(2026, 0, 1, 15, 59));
  const after = new Date(Date.UTC(2026, 0, 1, 16, 0));
  assert.notEqual(
    panel.todayKey(before),
    panel.todayKey(after),
    'crossing resetHourUTC boundary should change todayKey',
  );
}

function testIsValidStateRejectsMalformed() {
  const panel = freshPanel();
  assert.equal(panel.isValidState(null), false);
  assert.equal(panel.isValidState({}), false);
  assert.equal(panel.isValidState({ slots: ['not_a_real_item_id'], purchases: [false], refreshCount: 0 }), false);
  assert.equal(
    panel.isValidState({
      slots: Array(ECONOMY.shop.slotsPerDay).fill('gold_pack_s'),
      purchases: Array(ECONOMY.shop.slotsPerDay).fill(false),
      refreshCount: 0,
    }),
    true,
  );
}

function testGenerateSlotsProducesValidItemIds() {
  const panel = freshPanel();
  const slots = panel.generateSlots();
  assert.equal(slots.length, ECONOMY.shop.slotsPerDay);
  for (const id of slots) {
    assert.ok(panel.itemMap.has(id), `generated slot id "${id}" should exist in ECONOMY.shop.items`);
  }
}

function testLoadTodayStateIsIdempotentWithinSameDay() {
  const panel = freshPanel();
  const first = panel.loadTodayState();
  assert.equal(first.slots.length, ECONOMY.shop.slotsPerDay);
  assert.equal(first.refreshCount, 0);

  const second = panel.loadTodayState();
  assert.deepEqual(second.slots, first.slots, 'second load on the same day should return persisted slots');
}

function testPurchaseDeductsWalletAndMarksSlotPurchased() {
  const panel = freshPanel();
  const item = shopItem('gold_pack_s');
  panel.state = panel.loadTodayState();
  panel.state.slots[0] = item.id;
  panel.wallet = WalletService.getWallet();

  const silverBefore = panel.wallet.silver;
  const goldBefore = panel.wallet.gold;
  panel.purchase(0);

  const wallet = WalletService.getWallet();
  assert.equal(wallet.silver, silverBefore - item.price, 'silver should be deducted by item price');
  assert.equal(wallet.gold, goldBefore + item.reward.gold, 'gold reward should be credited');
  assert.equal(panel.state.purchases[0], true, 'slot should be marked purchased');
}

function testPurchaseInsufficientFundsDoesNothing() {
  const panel = freshPanel();
  const item = shopItem('gold_pack_s');
  WalletService.setWallet({ silver: 0, gold: 0, ticket: 0 });
  panel.state = panel.loadTodayState();
  panel.state.slots[0] = item.id;
  panel.wallet = WalletService.getWallet();

  panel.purchase(0);

  const wallet = WalletService.getWallet();
  assert.equal(wallet.silver, 0, 'insufficient funds should not deduct anything');
  assert.equal(panel.state.purchases[0], false, 'slot should remain unpurchased');
}

function testPurchaseTwiceOnSameSlotIsNoop() {
  const panel = freshPanel();
  panel.state = panel.loadTodayState();
  panel.state.slots[0] = shopItem('gold_pack_s').id;
  panel.wallet = WalletService.getWallet();

  panel.purchase(0);
  const walletAfterFirst = WalletService.getWallet();
  panel.purchase(0);
  const walletAfterSecond = WalletService.getWallet();

  assert.deepEqual(walletAfterSecond, walletAfterFirst, 'second purchase on an already-purchased slot must not charge again');
}

async function testRefreshSlotsRespectsMaxRefreshesPerDay() {
  const panel = freshPanel();
  panel.state = panel.loadTodayState();
  panel.state.purchases[0] = true;

  await panel.refreshSlots();
  assert.equal(panel.state.refreshCount, 1);
  assert.equal(panel.state.purchases[0], false, 'refresh should reset all purchase flags');

  for (let i = 1; i < ECONOMY.shop.maxRefreshesPerDay; i += 1) {
    await panel.refreshSlots();
  }
  assert.equal(panel.state.refreshCount, ECONOMY.shop.maxRefreshesPerDay);

  const refreshCountBefore = panel.state.refreshCount;
  await panel.refreshSlots();
  assert.equal(panel.state.refreshCount, refreshCountBefore, 'refreshSlots should be a no-op once maxRefreshesPerDay is reached');
}

testTodayKeyRollsOverAtResetHour();
testIsValidStateRejectsMalformed();
testGenerateSlotsProducesValidItemIds();
testLoadTodayStateIsIdempotentWithinSameDay();
testPurchaseDeductsWalletAndMarksSlotPurchased();
testPurchaseInsufficientFundsDoesNothing();
testPurchaseTwiceOnSameSlotIsNoop();
await testRefreshSlotsRespectsMaxRefreshesPerDay();

console.log('shopPanel tests passed');
