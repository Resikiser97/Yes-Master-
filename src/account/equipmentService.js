/**
 * @file        equipmentService.js
 * @module      account
 * @summary     裝備碎片庫存唯一讀寫入口（localStorage mock；後端化時只替換本檔底層）
 *              注意：此檔管理的是「抽到的裝備碎片」，
 *              和 src/game/equipmentSystem.js（Supabase 裝備等級/數值層）是不同職責。
 * @exports     equipmentService, deterministicEquipment, validateSynthesisMaterials, replaceItemsWithResult
 * @depends     config/economyConfig.js, config/equipmentConfig.js
 * @version     v0.0.26.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { EQUIPMENT_CONFIG, EQUIPMENT_SLOTS, EQUIPMENT_STYLES } from '../../config/equipmentConfig.js';

const MAX_FRAGMENT_LEVEL = 4;

export const equipmentService = {
  getInventory,
  appendItem,
  findItemById,
  resetInventory,
  countByType,
  validateSynthesisMaterials,
  replaceItemsWithResult,
};

// 同一 seed 加不同 salt，確保 type 與 style 的 hash 結果相互獨立
function deterministicHash(seed, salt) {
  const text = String(seed ?? '') + salt;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function deterministicEquipment(seed) {
  return {
    type: EQUIPMENT_SLOTS[deterministicHash(seed, ':type') % EQUIPMENT_SLOTS.length],
    style: EQUIPMENT_STYLES[deterministicHash(seed, ':style') % EQUIPMENT_STYLES.length],
  };
}

function getInventory() {
  const raw = readJson(ECONOMY.inventory.storageKey, []);
  if (!Array.isArray(raw)) return [];
  const inventory = raw
    .map((item) => normalizeItem(item, { warn: false }))
    .filter(Boolean);
  if (inventory.length !== raw.length) writeJson(ECONOMY.inventory.storageKey, inventory);
  return inventory;
}

function appendItem(item) {
  const normalized = normalizeItem(item, { warn: true });
  if (!normalized) return;

  const inventory = getInventory();
  if (inventory.some((entry) => entry.id === normalized.id)) return;

  inventory.push(normalized);
  writeJson(ECONOMY.inventory.storageKey, inventory);
}

function findItemById(id) {
  if (!isNonEmptyString(id)) return null;
  return getInventory().find((item) => item.id === id) ?? null;
}

function resetInventory() {
  writeJson(ECONOMY.inventory.storageKey, []);
}

function countByType() {
  const counts = EQUIPMENT_SLOTS.reduce((acc, type) => {
    const byStyle = EQUIPMENT_STYLES.reduce((s, style) => {
      s[style] = { total: 0, maxLevel: 0, items: [] };
      return s;
    }, {});
    acc[type] = { total: 0, maxLevel: 0, byStyle };
    return acc;
  }, {});

  for (const item of getInventory()) {
    const bucket = counts[item.type];
    bucket.total += 1;
    bucket.maxLevel = Math.max(bucket.maxLevel, item.level);
    const styleBucket = bucket.byStyle[item.style];
    styleBucket.total += 1;
    styleBucket.maxLevel = Math.max(styleBucket.maxLevel, item.level);
    styleBucket.items.push(item);
  }

  return counts;
}

/**
 * 扣款前預檢：只讀庫存，不寫入。
 * 確認兩件材料存在且符合合成條件，供 synthesisPanel 在 spendWallet 前呼叫。
 * @param {{ materialIds: [string, string] }} params
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateSynthesisMaterials({ materialIds }) {
  if (!Array.isArray(materialIds) || materialIds.length !== 2) {
    return { ok: false, reason: '材料數量錯誤' };
  }
  const [idA, idB] = materialIds;
  if (!isNonEmptyString(idA) || !isNonEmptyString(idB)) {
    return { ok: false, reason: '材料 id 無效' };
  }
  if (idA === idB) {
    return { ok: false, reason: '材料重複' };
  }
  const inventory = getInventory();
  const a = inventory.find((item) => item.id === idA);
  const b = inventory.find((item) => item.id === idB);
  if (!a || !b) return { ok: false, reason: '找不到材料' };
  if (a.type !== b.type) return { ok: false, reason: '材料槽位不同' };
  if (a.style !== b.style) return { ok: false, reason: '材料款式不同' };
  if (a.level !== b.level) return { ok: false, reason: '材料等級不同' };
  if (a.level >= EQUIPMENT_CONFIG.maxLevel) return { ok: false, reason: '已達最高等級' };
  return { ok: true };
}

/**
 * 庫存層一次 read/write（不是 wallet + inventory 的真正原子交易）。
 * 移除兩件材料，加入一件合成產物。不負責扣款，扣款由 synthesisPanel 在呼叫本函式前完成。
 * @param {{ materialIds: [string, string], idempotencyKey: string }} params
 * @returns {{ ok: true, item: object, duplicate?: true } | { ok: false, reason: string }}
 */
function replaceItemsWithResult({ materialIds, idempotencyKey }) {
  if (!Array.isArray(materialIds) || materialIds.length !== 2) {
    return { ok: false, reason: '材料數量錯誤' };
  }
  const [idA, idB] = materialIds;
  if (!isNonEmptyString(idA) || !isNonEmptyString(idB)) {
    return { ok: false, reason: '材料 id 無效' };
  }
  if (idA === idB) {
    return { ok: false, reason: '材料重複' };
  }

  const inventory = getInventory();

  const resultId = isNonEmptyString(idempotencyKey)
    ? `${idempotencyKey}:result`
    : null;
  if (resultId) {
    const existing = inventory.find((item) => item.id === resultId);
    if (existing) return { ok: true, item: existing, duplicate: true };
  }

  const a = inventory.find((item) => item.id === idA);
  const b = inventory.find((item) => item.id === idB);
  if (!a || !b) return { ok: false, reason: '找不到材料' };

  if (a.type !== b.type) return { ok: false, reason: '材料槽位不同' };
  if (a.style !== b.style) return { ok: false, reason: '材料款式不同' };
  if (a.level !== b.level) return { ok: false, reason: '材料等級不同' };
  if (a.level >= EQUIPMENT_CONFIG.maxLevel) return { ok: false, reason: '已達最高等級' };

  const rawResult = {
    id: resultId ?? `synth:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    type: a.type,
    style: a.style,
    level: a.level + 1,
    acquiredAt: new Date().toISOString(),
    source: 'synthesis',
  };

  const normalized = normalizeItem(rawResult, { warn: true });
  if (!normalized) return { ok: false, reason: '合成產物驗證失敗' };

  const next = inventory.filter((item) => item.id !== idA && item.id !== idB);
  next.push(normalized);
  writeJson(ECONOMY.inventory.storageKey, next);

  return { ok: true, item: normalized };
}

function normalizeItem(item, { warn }) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    warnInvalid(warn, 'invalid equipment item', item);
    return null;
  }
  if (!isNonEmptyString(item.id)) {
    warnInvalid(warn, 'invalid equipment id', item);
    return null;
  }
  if (!EQUIPMENT_SLOTS.includes(item.type)) {
    warnInvalid(warn, 'invalid equipment type', item);
    return null;
  }
  if (!EQUIPMENT_STYLES.includes(item.style)) {
    warnInvalid(warn, 'invalid equipment style', item);
    return null;
  }

  const level = Number(item.level);
  const maxAllowed = item.source === 'synthesis'
    ? EQUIPMENT_CONFIG.maxLevel
    : MAX_FRAGMENT_LEVEL;
  if (!Number.isInteger(level) || level < 0 || level > maxAllowed) {
    warnInvalid(warn, 'invalid equipment level', item);
    return null;
  }

  return {
    id: item.id,
    type: item.type,
    style: item.style,
    level,
    acquiredAt: isValidDateString(item.acquiredAt) ? item.acquiredAt : new Date().toISOString(),
    source: isNonEmptyString(item.source) ? item.source : 'unknown',
  };
}

function warnInvalid(shouldWarn, message, item) {
  if (shouldWarn) console.warn('EQUIPMENT_INVENTORY_INVALID', { message, item });
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDateString(value) {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
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
