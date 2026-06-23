/**
 * @file        actions.js
 * @module      game（狀態/orchestration 層，非純邏輯、非渲染）
 * @summary     挖礦/卸貨/建造放置/拆除/核心修復/debug；呼叫純邏輯、改 world 狀態
 * @exports     updateMining, tryDeposit, tryPlace, tryRemove, computeBuildPreview, updateRepair, damageCore, healCore, applyDebugAction
 * @depends     config/gameConfig.js、config/blocks.js、src/game/coreSnapshot.js、src/logic/mining.js、src/logic/mineGen.js、src/logic/inventory.js、src/logic/connectivity.js、src/logic/building.js、src/logic/coreHealth.js
 * @sourceOfTruth Docs/game-design-plan.md「操作輸入方式」「方塊系統」「遊戲內 UI 設計」
 * @version     v0.0.3.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { BLOCKS } from '../../config/blocks.js';
import { selectNearestMineCell, miningDamagePerSecond, durabilityToBreak } from '../logic/mining.js';
import { digMineCell } from '../logic/mineGen.js';
import { canAdd, addItem, removeItem, depositAll } from '../logic/inventory.js';
import { computeConnected, key } from '../logic/connectivity.js';
import { validatePlacement, validateRemoval } from '../logic/building.js';
import { damageCoreHp, repairCoreHp, clampCoreHp } from '../logic/coreHealth.js';
import { refreshCoreSnapshot } from './coreSnapshot.js';

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

function isOnRepairSurface(world) {
  const connected = computeConnected(world.dirt, world.core);
  const px = Math.round(world.player.x);
  const py = Math.round(world.player.y);
  return world.core.some(([x, y]) => x === px && y === py) || connected.has(key(px, py));
}

// 建造 ctx（給 building.js 純函式）
function placeCtx(world, cfg) {
  return {
    dirt: world.dirt, fore: world.fore, core: world.core,
    coreCenter: world.coreCenter, groundY: world.groundY,
    stage: world.stage, limits: cfg.buildLimits,
    player: world.player, reach: cfg.buildLimits.buildReachTiles ?? cfg.buildLimits.placeReachTiles,
  };
}

// 放置：消耗塔內資源欄一個 blockKey，蓋到 (x,y)
export function tryPlace(world, blockKey, x, y, cfg = GAME_CONFIG) {
  if (!blockKey) return { ok: false, reason: 'no_block' };
  if (!(world.storage[blockKey] > 0)) return { ok: false, reason: 'no_material' };
  const res = validatePlacement(placeCtx(world, cfg), blockKey, x, y);
  if (!res.ok) return res;
  const k = key(x, y);
  if (res.layer === 'background') world.dirt.add(k);
  else world.fore.set(k, blockKey);
  world.storage = removeItem(world.storage, blockKey, 1);
  refreshCoreSnapshot(world, { applyHpMaxDelta: true });
  return { ok: true, layer: res.layer };
}

// 拆除：右鍵 (x,y)，材料退回塔內資源欄（前景優先，泥土需通過連通性）
export function tryRemove(world, x, y, cfg = GAME_CONFIG) {
  const ctx = { dirt: world.dirt, fore: world.fore, core: world.core,
    player: world.player, reach: cfg.buildLimits.buildReachTiles ?? cfg.buildLimits.placeReachTiles };
  const res = validateRemoval(ctx, x, y);
  if (!res.ok) return res;
  const hpLoss = BLOCKS[res.blockKey]?.bonus?.hp ?? 0;
  if (hpLoss > 0 && world.coreHp - hpLoss <= 0) {
    return { ok: false, reason: 'would_destroy_core' };
  }
  const k = key(x, y);
  if (res.layer === 'foreground') world.fore.delete(k);
  else world.dirt.delete(k);
  world.storage = addItem(world.storage, res.blockKey, 1);
  refreshCoreSnapshot(world, { applyHpMaxDelta: true });
  return { ok: true, blockKey: res.blockKey };
}

// 放置預覽（render 用）：回 { x, y, valid, blockKey } 或 null（未選方塊）
export function computeBuildPreview(world, blockKey, x, y, cfg = GAME_CONFIG) {
  if (!blockKey) return null;
  const hasMat = world.storage[blockKey] > 0;
  const res = validatePlacement(placeCtx(world, cfg), blockKey, x, y);
  return { x, y, valid: res.ok && hasMat, blockKey };
}

export function damageCore(world, amount) {
  world.coreHp = damageCoreHp(world.coreHp ?? world.coreStats.hpMax, amount);
  if (world.coreHp <= 0) world.phase = 'gameover';
  return { ok: true, coreHp: world.coreHp };
}

export function healCore(world, amount) {
  world.coreHp = clampCoreHp((world.coreHp ?? world.coreStats.hpMax) + Math.max(0, amount), world.coreStats.hpMax);
  return { ok: true, coreHp: world.coreHp };
}

export function updateRepair(world, isRepairing, dt, cfg = GAME_CONFIG) {
  world.repair = { active: false, canRepair: false, reason: null, healed: 0 };
  if (!isRepairing) return world.repair;
  if (!isOnRepairSurface(world)) {
    world.repair.reason = 'not_on_foundation';
    return world.repair;
  }
  if (world.coreHp >= world.coreStats.hpMax) {
    world.repair.reason = 'full';
    return world.repair;
  }
  if (world.player.fatigue <= 0) {
    world.repair.reason = 'no_fatigue';
    return world.repair;
  }

  const out = repairCoreHp(world.coreHp, world.coreStats.hpMax, world.player.fatigue, dt, cfg.player.repair);
  world.coreHp = out.hp;
  world.player.fatigue = out.fatigue;
  world.repair = { active: out.healed > 0, canRepair: true, reason: null, healed: out.healed };
  return world.repair;
}

export function applyDebugAction(world, action, cfg = GAME_CONFIG) {
  if (!cfg.debug?.enabled || !cfg.debug?.hotkeys) return { ok: false, reason: 'debug_disabled' };
  if (action === 'damageCore') return damageCore(world, cfg.debug.damageAmount);
  if (action === 'healCore') return healCore(world, cfg.debug.healAmount);
  if (action === 'grantResources') {
    for (const [blockKey, qty] of Object.entries(cfg.debug.resourceGrant ?? {})) {
      world.storage = addItem(world.storage, blockKey, qty);
    }
    return { ok: true };
  }
  return { ok: false, reason: 'unknown_debug_action' };
}
