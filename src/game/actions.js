/**
 * @file        actions.js
 * @module      game（狀態/orchestration 層，非純邏輯、非渲染）
 * @summary     挖礦/卸貨/建造放置/拆除/核心修復/debug；呼叫純邏輯、改 world 狀態
 * @exports     updateMining, collectDrops, tryDeposit, tryPlace, tryRemove, computeBuildPreview, updateRepair, damageCore, healCore, applyDebugAction, tryPlaceRect, tryRemoveRect, toggleBuildPlanMode, previewPlaceRect
 * @depends     config/gameConfig.js、config/blocks.js、src/game/coreSnapshot.js、src/game/combatRuntime.js、src/logic/mining.js、src/logic/mineGen.js、src/logic/inventory.js、src/logic/connectivity.js、src/logic/building.js、src/logic/coreHealth.js、src/logic/drops.js
 * @sourceOfTruth Docs/game-design-plan.md「操作輸入方式」「方塊系統」「遊戲內 UI 設計」
 * @version     v0.0.19.0
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { BLOCKS } from '../../config/blocks.js';
import { selectNearestMineCell, miningDamagePerSecond, durabilityToBreak } from '../logic/mining.js';
import { digMineCell } from '../logic/mineGen.js';
import { canAdd, addItem, removeItem, depositAll } from '../logic/inventory.js';
import { computeConnected, canRemoveDirt, key, isOnFoundation } from '../logic/connectivity.js';
import { validatePlacement, validateRemoval } from '../logic/building.js';
import { damageCoreHp, repairCoreHp, clampCoreHp } from '../logic/coreHealth.js';
import { refreshCoreSnapshot } from './coreSnapshot.js';
import { spawnDebugEnemies } from './combatRuntime.js';
import { addDrop, collectNearbyDrops } from '../logic/drops.js';
import { generateOffer } from '../logic/cardOffer.js';
import { createRng } from '../logic/rng.js';
import { ensurePlayer } from './world.js';

const DEBUG_CARD_OFFER_SEED = 20260624 + 8888;

// 挖礦：長按時鎖定最近礦格，依「挖掘能力 × 每秒敲擊數 × dt」累積傷害，達耐久即出塊進背包
// 進度持久化：停手或換格時把 m.damage 存入 world.mineProgress[tk]；
// 切回同一格時恢復進度，讓玩家可以分多次完成一個方塊。
export function updateMining(world, isMining, dt, cfg = GAME_CONFIG, playerId = world.localPlayerId) {
  const player = ensurePlayer(world, playerId, cfg);
  const m = playerId === world.localPlayerId ? world.mining : playerRuntime(world, playerId).mining;
  const prog = world.mineProgress ?? (world.mineProgress = {});

  // 停手或找不到目標：儲存當前進度，清空活動狀態
  const _saveAndClear = () => {
    if (m.targetKey && m.damage > 0) prog[m.targetKey] = m.damage;
    m.targetKey = null; m.damage = 0; m.hitTimer = 0; m.full = false;
  };

  if (!isMining) { _saveAndClear(); return; }

  const reach = cfg.buildLimits.placeReachTiles;
  const target = selectNearestMineCell(player, world.mines, reach);
  if (!target) { _saveAndClear(); return; }

  const tk = `${target.mineId},${target.col},${target.row},${target.blockKey}`;
  if (tk !== m.targetKey) {
    // 換目標：存舊進度，讀新目標的舊進度（0 代表全新）
    if (m.targetKey && m.damage > 0) prog[m.targetKey] = m.damage;
    m.targetKey = tk;
    m.damage = prog[tk] ?? 0;
    m.hitTimer = 0;
    m.full = false;
  }

  // 離散敲擊模型：每 1/hitsPerSec 秒觸發一次，每次扣 miningPower 點耐久
  const hitsPerSec = cfg.player.mineClicksPerSec.hold;
  m.hitTimer = (m.hitTimer ?? 0) + dt;
  const hits = Math.floor(m.hitTimer * hitsPerSec);
  if (hits > 0) {
    m.hitTimer -= hits / hitsPerSec;
    m.damage += cfg.player.mining * hits;
  }

  const need = durabilityToBreak(target.blockKey);
  if (m.damage < need) return;

  const px = Math.round(player.x);
  const py = Math.round(player.y);
  const maxStacks = cfg.drops?.maxStacks ?? 128;
  const fatigueCost = cfg.player.miningFatigueCost ?? 5;

  // 背包放得下 → 直接進背包
  if (canAdd(player.inventory, target.blockKey, 1, {
    capacity: player.capacity, slots: player.slots,
  })) {
    const dug = digMineCell(world.mines[target.mineId].mine, target.col, target.row, world.mineRng);
    if (dug) player.inventory = addItem(player.inventory, dug, 1);
    player.fatigue = Math.max(0, (player.fatigue ?? 0) - fatigueCost);
    m.full = false;
    m.dropFull = false;
    delete prog[tk];
    m.damage = 0;
    m.targetKey = null;
    return;
  }

  // 背包滿 → 嘗試掉落
  const dropResult = addDrop(world.drops, target.blockKey, px, py, maxStacks);
  if (dropResult.added) {
    world.drops = dropResult.drops;
    digMineCell(world.mines[target.mineId].mine, target.col, target.row, world.mineRng);
    player.fatigue = Math.max(0, (player.fatigue ?? 0) - fatigueCost);
    m.full = true;
    m.dropFull = false;
    delete prog[tk];
    m.damage = 0;
    m.targetKey = null;
    return;
  }

  // 地面也滿 → 不出塊，clamp damage，標記 dropFull
  m.damage = need;
  m.full = true;
  m.dropFull = true;
}

// 自動撿取玩家附近掉落物（每 tick 呼叫）
export function collectDrops(world, cfg = GAME_CONFIG, playerId = world.localPlayerId) {
  if (!world.drops?.length) return;
  const player = ensurePlayer(world, playerId, cfg);
  const result = collectNearbyDrops(world.drops, player, player.inventory, cfg);
  world.drops = result.drops;
  player.inventory = result.inventory;
  if (world.drops.length === 0) {
    world.mining.full = false;
    world.mining.dropFull = false;
  }
}

// 站在「核心格」或「與核心連通的泥土格」上 → 自動把背包倒入塔內資源欄
// ⚠️ 設計原則：核心格視同連通地基（見 Docs/design-patterns.md），凡對連通泥土生效的功能也對核心生效
export function tryDeposit(world, playerId = world.localPlayerId, cfg = GAME_CONFIG) {
  const player = ensurePlayer(world, playerId, cfg);
  if (Object.keys(player.inventory).length === 0) return;
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  const onFoundation = isOnFoundation(world, px, py);
  if (!onFoundation) return;
  const out = depositAll(player.inventory, world.storage);
  player.inventory = out.inventory;
  world.storage = out.storage;
}

// isOnFoundation 已移至 logic/connectivity.js（共用）

function isOnRepairSurface(world, player = world.player) {
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  return isOnFoundation(world, px, py);
}

// 建造 ctx（給 building.js 純函式）
function placeCtx(world, cfg, player = world.player) {
  return {
    dirt: world.dirt, fore: world.fore, core: world.core,
    coreCenter: world.coreCenter, groundY: world.groundY,
    stage: world.stage, limits: cfg.buildLimits,
    player, reach: cfg.buildLimits.buildReachTiles ?? cfg.buildLimits.placeReachTiles,
  };
}

// 放置：消耗塔內資源欄一個 blockKey，蓋到 (x,y)；infinite 方塊不消耗
export function tryPlace(world, blockKey, x, y, cfg = GAME_CONFIG, playerId = world.localPlayerId) {
  if (!blockKey) return { ok: false, reason: 'no_block' };
  const player = ensurePlayer(world, playerId, cfg);
  const inf = BLOCKS[blockKey]?.infinite;
  if (!inf && !(world.storage[blockKey] > 0)) return { ok: false, reason: 'no_material' };
  const res = validatePlacement(placeCtx(world, cfg, player), blockKey, x, y);
  if (!res.ok) return res;
  const k = key(x, y);
  if (res.layer === 'background') world.dirt.add(k);
  else world.fore.set(k, blockKey);
  if (!inf) world.storage = removeItem(world.storage, blockKey, 1);
  refreshCoreSnapshot(world, { applyHpMaxDelta: true });
  return { ok: true, layer: res.layer };
}

// 拆除：右鍵 (x,y)，材料退回塔內資源欄（前景優先，泥土需通過連通性）
export function tryRemove(world, x, y, cfg = GAME_CONFIG, playerId = world.localPlayerId) {
  const player = ensurePlayer(world, playerId, cfg);
  const ctx = { dirt: world.dirt, fore: world.fore, core: world.core,
    player, reach: cfg.buildLimits.buildReachTiles ?? cfg.buildLimits.placeReachTiles };
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
export function computeBuildPreview(world, blockKey, x, y, cfg = GAME_CONFIG, playerId = world.localPlayerId) {
  if (!blockKey) return null;
  const player = ensurePlayer(world, playerId, cfg);
  const hasMat = BLOCKS[blockKey]?.infinite || world.storage[blockKey] > 0;
  const ctx = world.buildPlanMode
    ? { dirt: world.dirt, fore: world.fore, core: world.core,
        coreCenter: world.coreCenter, groundY: world.groundY,
        stage: world.stage, limits: cfg.buildLimits }
    : placeCtx(world, cfg, player);
  const res = validatePlacement(ctx, blockKey, x, y);
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

export function updateRepair(world, isRepairing, dt, cfg = GAME_CONFIG, playerId = world.localPlayerId) {
  const player = ensurePlayer(world, playerId, cfg);
  const repairState = playerId === world.localPlayerId ? world.repair : playerRuntime(world, playerId).repair;
  Object.assign(repairState, { active: false, canRepair: false, reason: null, healed: 0 });
  if (!isRepairing) return repairState;
  if (!isOnRepairSurface(world, player)) {
    repairState.reason = 'not_on_foundation';
    return repairState;
  }
  if (world.coreHp >= world.coreStats.hpMax) {
    repairState.reason = 'full';
    return repairState;
  }
  if (player.fatigue <= 0) {
    repairState.reason = 'no_fatigue';
    return repairState;
  }

  const out = repairCoreHp(world.coreHp, world.coreStats.hpMax, player.fatigue, dt, cfg.player.repair);
  world.coreHp = out.hp;
  player.fatigue = out.fatigue;
  Object.assign(repairState, { active: out.healed > 0, canRepair: true, reason: null, healed: out.healed });
  return repairState;
}

export function applyDebugAction(world, action, cfg = GAME_CONFIG) {
  if (!cfg.debug?.enabled || !cfg.debug?.hotkeys) return { ok: false, reason: 'debug_disabled' };
  if (action === 'damageCore') return damageCore(world, cfg.debug.damageAmount);
  if (action === 'healCore') return healCore(world, cfg.debug.healAmount);
  if (action === 'togglePause') {
    world.debugPaused = !world.debugPaused;
    return { ok: true, paused: world.debugPaused };
  }
  if (action === 'grantResources') {
    for (const [blockKey, qty] of Object.entries(cfg.debug.resourceGrant ?? {})) {
      world.storage = addItem(world.storage, blockKey, qty);
    }
    return { ok: true };
  }
  if (action === 'spawnEnemy') return spawnDebugEnemies(world, 1, 'civilian', cfg);
  if (action === 'spawnEnemyPack') return spawnDebugEnemies(world, 5, 'civilian', cfg);
  if (action === 'showCardOffer') {
    world.enemies = [];
    world.pendingSpawns = [];
    world.nightElapsed = 0;
    world.combat.overtimeMultiplier = 1;
    world.pendingCardOffer = generateOffer(createRng(DEBUG_CARD_OFFER_SEED + (world.stage ?? 0)), 10);
    world.phase = 'cardOffer';
    world.phaseTimer = 0;
    return { ok: true };
  }
  if (action === 'startNight') {
    // prep → 立即跳白天；day → 立即跳夜晚（phaseTimer 歸零讓 phaseRuntime 自動觸發）
    if (world.phase === 'prep' || world.phase === 'day') world.phaseTimer = 0;
    return { ok: true };
  }
  if (action === 'restartStage') {
    // 清除敵人、重設 phase 回 prep，保留 storage / dirt / fore
    world.enemies = [];
    world.phase   = 'prep';
    world.phaseTimer        = cfg.phases.prepSeconds;
    world.debugPaused       = false;
    world.pendingSpawns     = [];
    world.nightElapsed      = 0;
    world.combat.overtimeMultiplier = 1;
    world.combat.attackCooldown     = 0;
    world.combat.lastHits           = [];
    if (world.vfx) {
      world.vfx.timer = 0;
      world.vfx.bolts = [];
    }
    // 恢復核心 HP（不恢復的話下一幀 updatePhase 看到 coreHp<=0 → 立刻重觸 gameover）
    world.coreHp = world.coreStats?.hpMax ?? cfg.core.base.hp;
    return { ok: true };
  }
  return { ok: false, reason: 'unknown_debug_action' };
}

// Build Plan Mode：站在核心地基上才能開啟
export function toggleBuildPlanMode(world, cfg = GAME_CONFIG, playerId = world.localPlayerId) {
  const player = ensurePlayer(world, playerId, cfg);
  if (world.buildPlanMode) {
    world.buildPlanMode = false;
    world.buildDestroyMode = false;
    world.buildPlanDrag = null;
    return { ok: true, active: false };
  }
  if (!isOnRepairSurface(world, player)) {
    return { ok: false, reason: 'not_on_foundation' };
  }
  world.buildPlanMode = true;
  return { ok: true, active: true };
}

function playerRuntime(world, playerId) {
  world.playerRuntime ??= {};
  world.playerRuntime[playerId] ??= {
    mining: { targetKey: null, damage: 0, full: false, dropFull: false },
    repair: { active: false, canRepair: false, reason: null, healed: 0 },
  };
  return world.playerRuntime[playerId];
}

// 預算矩形放置需要多少資源（renderer 顯示用）
export function previewPlaceRect(world, blockKey, x1, y1, x2, y2, cfg = GAME_CONFIG) {
  if (!blockKey) return { needed: 0, available: 0, enough: false };
  const inf = BLOCKS[blockKey]?.infinite;
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  let needed = 0;
  const ctx = {
    dirt: world.dirt, fore: world.fore, core: world.core,
    coreCenter: world.coreCenter, groundY: world.groundY,
    stage: world.stage, limits: cfg.buildLimits,
  };
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (validatePlacement(ctx, blockKey, x, y).ok) needed++;
    }
  }
  if (inf) return { needed, available: Infinity, enough: true };
  const available = world.storage[blockKey] ?? 0;
  return { needed, available, enough: available >= needed };
}

// Build Plan Mode 矩形放置：資源不足時整批拒絕；infinite 方塊不消耗
export function tryPlaceRect(world, blockKey, x1, y1, x2, y2, cfg = GAME_CONFIG) {
  if (!blockKey) return { ok: false, placed: 0, reason: 'no_block' };
  const inf = BLOCKS[blockKey]?.infinite;
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  const ctx = {
    dirt: world.dirt, fore: world.fore, core: world.core,
    coreCenter: world.coreCenter, groundY: world.groundY,
    stage: world.stage, limits: cfg.buildLimits,
  };
  const validTiles = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const res = validatePlacement(ctx, blockKey, x, y);
      if (res.ok) validTiles.push({ x, y, layer: res.layer });
    }
  }
  if (validTiles.length === 0) return { ok: false, placed: 0, reason: 'no_valid_tiles' };
  if (!inf) {
    const available = world.storage[blockKey] ?? 0;
    if (available < validTiles.length) {
      return { ok: false, placed: 0, reason: 'not_enough', needed: validTiles.length, available };
    }
  }
  for (const tile of validTiles) {
    const k = key(tile.x, tile.y);
    if (tile.layer === 'background') world.dirt.add(k);
    else world.fore.set(k, blockKey);
    if (!inf) world.storage = removeItem(world.storage, blockKey, 1);
  }
  refreshCoreSnapshot(world, { applyHpMaxDelta: true });
  return { ok: true, placed: validTiles.length };
}

// Destroy Mode 矩形拆除：只拆除指定種類的方塊，退回資源
export function tryRemoveRect(world, blockKey, x1, y1, x2, y2, cfg = GAME_CONFIG) {
  if (!blockKey) return { ok: false, removed: 0 };
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  const isDirt = (blockKey === 'dirt');
  let removed = 0;
  // 前景方塊先拆，安全；泥土需要逐個檢查連通性
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const k = key(x, y);
      if (isDirt) {
        if (!world.dirt.has(k)) continue;
        if (world.fore.has(k)) continue; // 上面有前景方塊，不能拆泥土
        if (!canRemoveDirt(world.dirt, world.core, x, y)) continue;
        world.dirt.delete(k);
        world.storage = addItem(world.storage, 'dirt', 1);
        removed++;
      } else {
        if (!world.fore.has(k)) continue;
        if (world.fore.get(k) !== blockKey) continue; // 只拆指定種類
        world.fore.delete(k);
        world.storage = addItem(world.storage, blockKey, 1);
        removed++;
      }
    }
  }
  if (removed > 0) refreshCoreSnapshot(world, { applyHpMaxDelta: true });
  return { ok: true, removed };
}
