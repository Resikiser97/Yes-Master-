/**
 * @file        drops.js
 * @module      logic（pure）
 * @summary     掉落物生成與自動撿取純邏輯（背包滿時方塊掉地，走近自動拾取）
 * @exports     createDrop, collectNearbyDrops
 * @depends     src/logic/inventory.js
 * @version     v0.0.6.0
 */

import { canAdd, addItem } from './inventory.js';

// 建立一個掉落物物件（世界 tile 座標）
export function createDrop(blockKey, x, y) {
  return { blockKey, x, y };
}

// 撿取玩家附近的掉落物（距離 ≤ reach tile）；回傳 { drops, inventory }（純函式，不改原物件）
export function collectNearbyDrops(drops, player, inventory, cfg) {
  const reach = cfg?.drops?.pickupReachTiles ?? 1;
  const capacity = player.capacity;
  const slots = player.slots;
  let inv = { ...inventory };
  const remaining = [];

  for (const drop of drops) {
    const dist = Math.max(Math.abs(drop.x - player.x), Math.abs(drop.y - player.y));
    if (dist <= reach && canAdd(inv, drop.blockKey, 1, { capacity, slots })) {
      inv = addItem(inv, drop.blockKey, 1);
    } else {
      remaining.push(drop);
    }
  }

  return { drops: remaining, inventory: inv };
}
