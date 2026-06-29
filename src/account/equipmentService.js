/**
 * @file        equipmentService.js
 * @module      account
 * @summary     裝備碎片庫存唯一讀寫入口（localStorage mock；後端化時只替換本檔底層）
 *              注意：此檔管理的是「抽到的裝備碎片」，
 *              和 src/game/equipmentSystem.js（Supabase 裝備等級/數值層）是不同職責。
 * @exports     equipmentService, deterministicEquipment
 * @depends     config/economyConfig.js, config/equipmentConfig.js
 * @version     v0.0.24.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { EQUIPMENT_SLOTS, EQUIPMENT_STYLES } from '../../config/equipmentConfig.js';

const MAX_FRAGMENT_LEVEL = 4;

export const equipmentService = {
  getInventory,
  appendItem,
  findItemById,
  resetInventory,
  countByType,
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
  if (!Number.isInteger(level) || level < 0 || level > MAX_FRAGMENT_LEVEL) {
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
