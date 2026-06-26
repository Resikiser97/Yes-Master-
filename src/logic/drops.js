/**
 * @file        drops.js
 * @module      logic（pure）
 * @summary     掉落物生成（qty 堆疊 + 同格合併）與自動撿取純邏輯
 * @exports     createDrop, addDrop, collectNearbyDrops
 * @depends     src/logic/inventory.js
 * @version     v0.0.14.0
 */

import { canAdd, addItem } from './inventory.js';

export function createDrop(blockKey, x, y, qty = 1) {
  return { blockKey, x, y, qty };
}

// 純函式：同 blockKey + 同座標 → 合併 qty；否則新增 stack（受 maxStacks 限制）。
// 不修改傳入的 drops 或其中物件，回傳 { drops: nextDrops, added: boolean }。
export function addDrop(drops, blockKey, x, y, maxStacks = Infinity) {
  const idx = drops.findIndex(d => d.blockKey === blockKey && d.x === x && d.y === y);
  if (idx !== -1) {
    const nextDrops = drops.map((d, i) => i === idx ? { ...d, qty: d.qty + 1 } : d);
    return { drops: nextDrops, added: true };
  }
  if (drops.length >= maxStacks) {
    return { drops, added: false };
  }
  return { drops: [...drops, createDrop(blockKey, x, y, 1)], added: true };
}

export function collectNearbyDrops(drops, player, inventory, cfg) {
  const reach = cfg?.drops?.pickupReachTiles ?? 1;
  const capacity = player.capacity;
  const slots = player.slots;
  let inv = { ...inventory };
  const remaining = [];

  for (const drop of drops) {
    const dist = Math.max(Math.abs(drop.x - player.x), Math.abs(drop.y - player.y));
    if (dist > reach) { remaining.push({ ...drop }); continue; }

    let qty = drop.qty ?? 1;
    while (qty > 0 && canAdd(inv, drop.blockKey, 1, { capacity, slots })) {
      inv = addItem(inv, drop.blockKey, 1);
      qty -= 1;
    }
    if (qty > 0) remaining.push({ ...drop, qty });
  }

  return { drops: remaining, inventory: inv };
}

