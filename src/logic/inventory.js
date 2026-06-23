/**
 * @file        inventory.js
 * @module      logic（pure）
 * @summary     背包承重/格數規則、加入/扣除、以及存入塔內共享資源欄（純函式）
 * @exports     blockWeight, inventoryWeight, distinctCount, canAdd, addItem, removeItem, depositAll
 * @depends     config/blocks.js
 * @sourceOfTruth Docs/game-design-plan.md「遊戲內 UI 設計」（背包/塔內資源欄）
 * @version     v0.0.2.0
 *
 * inventory / storage 皆為 { blockKey: qty } 物件。背包受「承重(carry)」與「格數(slots)」雙重限制。
 */

import { BLOCKS } from '../../config/blocks.js';

export function blockWeight(blockKey, defs = BLOCKS) {
  return defs[blockKey]?.weight ?? 0;
}

export function inventoryWeight(inv, defs = BLOCKS) {
  let w = 0;
  for (const [k, qty] of Object.entries(inv)) w += blockWeight(k, defs) * qty;
  return w;
}

export function distinctCount(inv) {
  let n = 0;
  for (const qty of Object.values(inv)) if (qty > 0) n++;
  return n;
}

// 能否再放 qty 個 blockKey：承重不超過 capacity，且不超過 slots 種類數
export function canAdd(inv, blockKey, qty, { capacity, slots, defs = BLOCKS }) {
  if (inventoryWeight(inv, defs) + blockWeight(blockKey, defs) * qty > capacity) return false;
  const isNewType = !(inv[blockKey] > 0);
  if (isNewType && distinctCount(inv) >= slots) return false;
  return true;
}

export function addItem(inv, blockKey, qty) {
  return { ...inv, [blockKey]: (inv[blockKey] ?? 0) + qty };
}

export function removeItem(inv, blockKey, qty) {
  const next = { ...inv };
  const left = (next[blockKey] ?? 0) - qty;
  if (left > 0) next[blockKey] = left; else delete next[blockKey];
  return next;
}

// 把整個背包倒進塔內資源欄；回傳新的 { inventory, storage }（背包清空）
export function depositAll(inv, storage) {
  const merged = { ...storage };
  for (const [k, qty] of Object.entries(inv)) {
    if (qty > 0) merged[k] = (merged[k] ?? 0) + qty;
  }
  return { inventory: {}, storage: merged };
}
