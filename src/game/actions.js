/**
 * @file        actions.js
 * @module      game（狀態/orchestration 層，非純邏輯、非渲染）
 * @summary     挖礦累積與破塊、回核心自動存入塔內資源欄；呼叫純邏輯、改 world 狀態
 * @exports     updateMining, tryDeposit
 * @depends     config/gameConfig.js、src/logic/mining.js、src/logic/mineGen.js、src/logic/inventory.js、src/logic/connectivity.js
 * @sourceOfTruth Docs/game-design-plan.md「操作輸入方式」「方塊系統」「遊戲內 UI 設計」
 * @version     v0.0.2.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { selectNearestMineCell, miningDamagePerSecond, durabilityToBreak } from '../logic/mining.js';
import { digMineCell } from '../logic/mineGen.js';
import { canAdd, addItem, depositAll } from '../logic/inventory.js';
import { computeConnected, key } from '../logic/connectivity.js';

// 挖礦：長按時鎖定最近礦格，依「挖掘能力 × 每秒敲擊數 × dt」累積傷害，達耐久即出塊進背包
export function updateMining(world, isMining, dt, cfg = GAME_CONFIG) {
  const m = world.mining;
  if (!isMining) { m.targetKey = null; m.damage = 0; m.full = false; return; }

  const reach = cfg.buildLimits.placeReachTiles;
  const target = selectNearestMineCell(world.player, world.mines, reach);
  if (!target) { m.targetKey = null; m.damage = 0; m.full = false; return; }

  const tk = `${target.mineId},${target.col},${target.row},${target.blockKey}`;
  if (tk !== m.targetKey) { m.targetKey = tk; m.damage = 0; m.full = false; }

  const hitsPerSec = cfg.player.mineClicksPerSec.hold;
  m.damage += miningDamagePerSecond(cfg.player.mining, hitsPerSec) * dt;

  const need = durabilityToBreak(target.blockKey);
  if (m.damage < need) return;

  // 破塊：背包放得下才挖出，否則卡住等卸貨
  if (!canAdd(world.player.inventory, target.blockKey, 1, {
    capacity: world.player.capacity, slots: world.player.slots,
  })) {
    m.full = true;
    m.damage = need; // 卡在臨界，不繼續累積
    return;
  }
  const dug = digMineCell(world.mines[target.mineId].mine, target.col, target.row, world.mineRng);
  if (dug) world.player.inventory = addItem(world.player.inventory, dug, 1);
  m.damage -= need;
  m.full = false;
  m.targetKey = null; // 下一 tick 重新鎖定最近格（補位後可能換塊）
}

// 站在「與核心連通的泥土格」上 → 自動把背包倒入塔內資源欄
export function tryDeposit(world) {
  if (Object.keys(world.player.inventory).length === 0) return;
  const connected = computeConnected(world.dirt, world.core);
  const px = Math.round(world.player.x);
  const py = Math.round(world.player.y);
  if (!connected.has(key(px, py))) return;
  const out = depositAll(world.player.inventory, world.storage);
  world.player.inventory = out.inventory;
  world.storage = out.storage;
}
