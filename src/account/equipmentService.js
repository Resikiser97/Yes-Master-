/**
 * @file        equipmentService.js
 * @module      account
 * @summary     裝備碎片庫存唯一讀寫入口（localStorage mock；後端化時只替換本檔底層）
 *              注意：此檔管理的是「抽到的裝備碎片」，
 *              和 src/game/equipmentSystem.js（Supabase 裝備等級/數值層）是不同職責。
 * @exports     equipmentService, deterministicEquipmentType
 * @depends     config/economyConfig.js, config/equipmentConfig.js
 * @version     v0.0.22.0
 */

import { ECONOMY } from '../../config/economyConfig.js';
import { EQUIPMENT_SLOTS } from '../../config/equipmentConfig.js';

const MAX_FRAGMENT_LEVEL = 4;

export const equipmentService = {
  getInventory,
  appendItem,
  findItemById,
  resetInventory,
  countByType,
};

export function deterministicEquipmentType(seed) {
  const text = String(seed ?? '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0;
  }
  return EQUIPMENT_SLOTS[hash % EQUIPMENT_SLOTS.length];
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
  const counts = EQUIPMENT_SLOTS.reduce((result, type) => {
    result[type] = { total: 0, maxLevel: 0 };
    return result;
  }, {});

  for (const item of getInventory()) {
    const bucket = counts[item.type];
    bucket.total += 1;
    bucket.maxLevel = Math.max(bucket.maxLevel, item.level);
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

  const level = Number(item.level);
  if (!Number.isInteger(level) || level < 0 || level > MAX_FRAGMENT_LEVEL) {
    warnInvalid(warn, 'invalid equipment level', item);
    return null;
  }

  return {
    id: item.id,
    type: item.type,
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
