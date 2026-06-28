/**
 * @file        walletService.js
 * @module      account
 * @summary     貨幣讀寫唯一入口（封測 localStorage mock；後端化時只替換本檔底層）
 * @exports     WalletService
 * @depends     config/economyConfig.js, config/equipmentConfig.js, src/account/equipmentService.js, src/account/skillService.js
 * @version     v0.0.23.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { EQUIPMENT_SLOTS } from '../../config/equipmentConfig.js';
import { equipmentService, deterministicEquipmentType } from './equipmentService.js';
import { skillService } from './skillService.js';

// 此 wallet 是刪檔封測用 local mock。
// 正式後端 wallet 上線時，不會信任或遷移 localStorage 數值。
// 正式補償會用固定 tester grant，不讀取玩家本機餘額。

const CURRENCY_KEYS = ['silver', 'gold', 'ticket'];
const TRANSACTION_STORAGE_KEY = ECONOMY.shop.walletTransactionsKey;

// TODO: 封測 local log 可接受；正式版需改後端 ledger，或至少限制 localStorage 交易紀錄保留筆數。

export const WalletService = {
  getWallet,
  setWallet,
  creditWallet,
  spendWallet,
  grantReward,
  canAfford,
  resetWallet,
  getInventory: () => equipmentService.getInventory(),
  getTransactions,
};

function getWallet() {
  const stored = readJson(ECONOMY.shop.walletStorageKey, null);
  const wallet = normalizeWallet(stored);
  writeJson(ECONOMY.shop.walletStorageKey, wallet);
  return wallet;
}

function setWallet(wallet) {
  const normalized = normalizeWallet(wallet);
  writeJson(ECONOMY.shop.walletStorageKey, normalized);
  return normalized;
}

function creditWallet({ source = 'unknown', reason = 'credit', reward = {}, idempotencyKey = '' } = {}) {
  const delta = rewardToDelta(reward);
  return applyWalletDelta({ source, reason, delta, idempotencyKey });
}

function spendWallet({ source = 'unknown', reason = 'spend', cost = {}, idempotencyKey = '' } = {}) {
  const current = getWallet();
  if (idempotencyKey && hasTransaction(idempotencyKey)) {
    return { ok: true, duplicate: true, wallet: current };
  }
  if (!canAfford(cost, current)) {
    return { ok: false, reason: 'insufficient_funds', wallet: current };
  }

  return applyWalletDelta({
    source,
    reason,
    delta: costToDelta(cost),
    idempotencyKey,
    wallet: current,
  });
}

function grantReward(reward = {}, context = {}) {
  const source = context.source ?? 'reward';
  const reason = context.reason ?? 'grant';
  const idempotencyKey = context.idempotencyKey ?? '';
  const current = getWallet();

  if (idempotencyKey && hasTransaction(idempotencyKey)) {
    let equipment = null;
    if (reward?.equipment) {
      const equipId = `${idempotencyKey}:equip`;
      equipment = equipmentService.findItemById(equipId);
      if (!equipment) {
        equipment = {
          id: equipId,
          type: deterministicEquipmentType(idempotencyKey),
          level: reward.equipment.level,
          acquiredAt: new Date().toISOString(),
          source,
        };
        equipmentService.appendItem(equipment);
        console.log('WALLET_EQUIP_RECOVERY', { idempotencyKey, equipment });
      }
    }
    return { ok: true, duplicate: true, wallet: current, equipment };
  }

  const delta = rewardToDelta(reward);
  const result = applyWalletDelta({ source, reason, delta, idempotencyKey, wallet: current });
  if (!result.ok) return { ...result, equipment: null };

  emitCurrencyToasts(reward, context);

  let equipment = null;
  if (reward?.equipment) {
    const equipId = idempotencyKey
      ? `${idempotencyKey}:equip`
      : createTransactionId();
    const equipType = idempotencyKey
      ? deterministicEquipmentType(idempotencyKey)
      : randomEquipmentType();
    equipment = {
      id: equipId,
      type: equipType,
      level: reward.equipment.level,
      acquiredAt: new Date().toISOString(),
      source,
    };
    equipmentService.appendItem(equipment);
    console.log('WALLET_REWARD_EQUIPMENT', { source, reason, equipment });
    notify(context, `獲得 ${equipmentLabel(equipment.type)} Lv${equipment.level} 裝備`);
  }

  return { ...result, equipment };
}

function canAfford(cost = {}, wallet = getWallet()) {
  return CURRENCY_KEYS.every((key) => (wallet[key] ?? 0) >= positiveAmount(cost[key]));
}

function resetWallet() {
  const wallet = normalizeWallet(ECONOMY.shop.walletDefault);
  writeJson(ECONOMY.shop.walletStorageKey, wallet);
  writeJson(TRANSACTION_STORAGE_KEY, []);
  // MVP resetWallet = 重置整個 mock account economy（錢包＋裝備庫存＋技能）。
  // 正式後端上線後此函數不再使用。
  equipmentService.resetInventory();
  skillService.resetSkills();
  return wallet;
}

function getTransactions() {
  const value = readJson(TRANSACTION_STORAGE_KEY, []);
  return Array.isArray(value) ? value : [];
}

function applyWalletDelta({ source, reason, delta, idempotencyKey = '', wallet = getWallet() }) {
  if (idempotencyKey && hasTransaction(idempotencyKey)) {
    return { ok: true, duplicate: true, wallet };
  }

  const next = normalizeWallet(wallet);
  for (const key of CURRENCY_KEYS) {
    next[key] = Math.max(0, next[key] + (delta[key] ?? 0));
  }

  writeJson(ECONOMY.shop.walletStorageKey, next);
  appendTransaction({
    id: createTransactionId(),
    createdAt: new Date().toISOString(),
    source,
    reason,
    delta: normalizeDelta(delta),
    balanceAfter: next,
    idempotencyKey,
  });
  console.log('WALLET_TRANSACTION', { source, reason, delta: normalizeDelta(delta), balanceAfter: next, idempotencyKey });

  return { ok: true, duplicate: false, wallet: next };
}

function appendTransaction(transaction) {
  const transactions = getTransactions();
  transactions.push(transaction);
  writeJson(TRANSACTION_STORAGE_KEY, transactions);
}

function hasTransaction(idempotencyKey) {
  return getTransactions().some((entry) => entry?.idempotencyKey === idempotencyKey);
}

function normalizeWallet(wallet = {}) {
  const defaults = ECONOMY.shop.walletDefault ?? {};
  return CURRENCY_KEYS.reduce((normalized, key) => {
    normalized[key] = finiteNumber(wallet?.[key], finiteNumber(defaults[key], 0));
    return normalized;
  }, {});
}

function rewardToDelta(reward = {}) {
  return normalizeDelta({
    silver: positiveAmount(reward.silver),
    gold: positiveAmount(reward.gold),
    ticket: positiveAmount(reward.ticket),
  });
}

function costToDelta(cost = {}) {
  return normalizeDelta({
    silver: -positiveAmount(cost.silver),
    gold: -positiveAmount(cost.gold),
    ticket: -positiveAmount(cost.ticket),
  });
}

function normalizeDelta(delta = {}) {
  return CURRENCY_KEYS.reduce((normalized, key) => {
    const value = finiteNumber(delta[key], 0);
    normalized[key] = Object.is(value, -0) ? 0 : value;
    return normalized;
  }, {});
}

function positiveAmount(value) {
  return Math.max(0, finiteNumber(value, 0));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function emitCurrencyToasts(reward, context) {
  if (reward?.gold) notify(context, `獲得 ${formatNumber(reward.gold)} 金幣`);
  if (reward?.silver) notify(context, `獲得 ${formatNumber(reward.silver)} 銀幣`);
  if (reward?.ticket) notify(context, `獲得 ${formatNumber(reward.ticket)} 張票券`);
}

function notify(context, message) {
  if (typeof context.toast === 'function') context.toast(message);
}

function randomEquipmentType() {
  const index = Math.floor(Math.random() * EQUIPMENT_SLOTS.length);
  return EQUIPMENT_SLOTS[index];
}

function equipmentLabel(type) {
  return type;
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-US');
}

function createTransactionId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readJson(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}
