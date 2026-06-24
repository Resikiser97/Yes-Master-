/**
 * @file        phaseRuntime.js
 * @module      game（orchestration 層，非純邏輯）
 * @summary     晝夜階段狀態機：prep→night→overtime→gameover/waveClear；正式波次出怪與加時賽
 * @exports     initPhaseState, updatePhase
 * @depends     config/gameConfig.js、config/waves.js、src/logic/waveGen.js、src/logic/spawnPosition.js、src/logic/rng.js
 * @sourceOfTruth Docs/waveplan.md「晝夜節奏」「怪物生成安全規則」「夜晚加時賽/狂暴模式」
 * @version     v0.0.12.0
 *
 * phase 轉換：
 *   prep（30s 或按 N）→ night（60s，分批出怪）
 *   night 結束有怪殘留 → overtime（30s，每 5s 攻擊翻倍）
 *   overtime 結束有怪 → gameover
 *   怪全滅（night 或 overtime 中）→ waveClear → stage++ → prep
 *   world.coreHp <= 0 → gameover（任何 phase 皆可觸發）
 */

import { buildWave } from '../logic/waveGen.js';
import { spawnPositions } from '../logic/spawnPosition.js';
import { createRng } from '../logic/rng.js';
import { BLOCKER_BAND } from '../../config/waves.js';
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { ENEMIES } from '../../config/enemies.js';
import { generateOffer } from '../logic/cardOffer.js';
import { applyCardEffect } from '../logic/cardEffect.js';
import { refreshCoreSnapshot } from './coreSnapshot.js';

// 出怪隨機序列 seed（與礦山 RNG 獨立，固定可重現）
const WAVE_RNG_SEED = 20260624;

// 清完第幾關（stage 1-indexed）後進入卡片選擇（10/20/30）
const BOSS_STAGES = new Set([10, 20, 30]);

/**
 * 初始化 / 重設 world 的波次狀態（createWorld 呼叫；restartStage debug 也呼叫）。
 */
export function initPhaseState(world, cfg = GAME_CONFIG) {
  world.phaseTimer      = cfg.phases.prepSeconds;
  world.nightElapsed    = 0;
  world.pendingSpawns   = []; // [{ atSecond: N, defs: [{key, hp, attack, moveSpeed, ...x, y}] }]
  world.combat.overtimeMultiplier = 1;
}

/**
 * 每固定步進呼叫（dt = fixedStepSeconds）。
 * 更新 world.phase / world.phaseTimer / world.stage / world.enemies。
 */
export function updatePhase(world, dt, cfg = GAME_CONFIG) {
  if (world.phase === 'gameover') return;
  if (world.phase === 'cardOffer') return; // 等玩家選牌，由 resolveCardOffer 推進

  // 核心血量歸零 → 立即 gameover（優先於計時）
  if ((world.coreHp ?? 1) <= 0) {
    world.phase = 'gameover';
    return;
  }

  if (world.phase === 'prep')     _updatePrep(world, dt, cfg);
  else if (world.phase === 'night')    _updateNight(world, dt, cfg);
  else if (world.phase === 'overtime') _updateOvertime(world, dt, cfg);
}

// ─── prep ────────────────────────────────────────────────────────────────────

function _updatePrep(world, dt, cfg) {
  world.phaseTimer = Math.max(0, world.phaseTimer - dt);
  if (world.phaseTimer <= 0) _startNight(world, cfg);
}

// ─── night ───────────────────────────────────────────────────────────────────

function _startNight(world, cfg) {
  world.phase        = 'night';
  world.phaseTimer   = cfg.phases.nightSeconds;
  world.nightElapsed = 0;
  world.combat.overtimeMultiplier = 1;

  // buildWave 產生有 hp/attack/moveSpeed 的敵人實例（純邏輯）
  const waveRng   = createRng(WAVE_RNG_SEED + world.stage * 1000);
  const spawnRng  = createRng(WAVE_RNG_SEED + world.stage * 1000 + 500);
  const wave      = buildWave(world.stage + 1, 1 /* playerCount：MVP 單人固定 1 */, waveRng);

  world.pendingSpawns = _buildPendingSpawns(wave, world, cfg, spawnRng);
}

/**
 * Codex-7A-① _buildPendingSpawns
 *
 * 將 buildWave 回傳的 { enemies, schedule } 拆成分批出怪佇列。
 *
 * 輸入：
 *   wave.enemies  — [{ id, key, hp, attack, moveSpeed, attackRange, defense, ... }]
 *   wave.schedule — [{ second: N, count: M }, ...]（buildSpawnSchedule 產生，0~4 秒分 5 批）
 *
 * 輸出：
 *   [{
 *     atSecond: N,               // 在 nightElapsed >= N 時出怪
 *     defs: [{ ...enemy, x, y }] // 加入 spawnPositions() 計算的出生座標
 *   }]
 *
 * 注意：
 *   - 用 spawnPositions(count, world, cfg, rng) 取得座標（見 src/logic/spawnPosition.js）。
 *   - 每批次從 wave.enemies 依序取 count 筆；要保留原有 id/key/hp 等欄位，只加 x/y。
 *   - world.stage 從 0 開始（第 0 關），但 WAVES 從 1 開始；buildWave 已用 `stage || 1`。
 *
 * @param {{ enemies: Array, schedule: Array }} wave
 * @param {Object} world
 * @param {Object} cfg
 * @param {Object} rng
 * @returns {Array}
 */
function _buildPendingSpawns(wave, world, cfg, rng) {
  const pending = [];
  let cursor = 0;

  for (const item of wave.schedule ?? []) {
    const count = Math.max(0, item.count ?? 0);
    const defs = (wave.enemies ?? []).slice(cursor, cursor + count);
    cursor += count;
    if (defs.length === 0) continue;

    const positions = spawnPositions(defs.length, world, cfg, rng);
    pending.push({
      atSecond: item.second ?? 0,
      defs: defs.map((enemy, i) => ({ ...enemy, ...positions[i] })),
    });
  }

  return pending;
}

function _updateNight(world, dt, cfg) {
  world.phaseTimer   = Math.max(0, world.phaseTimer - dt);
  world.nightElapsed += dt;

  while (world.pendingSpawns.length && world.pendingSpawns[0].atSecond <= world.nightElapsed) {
    const batch = world.pendingSpawns.shift();
    for (const def of batch.defs) {
      const base = ENEMIES[def.key] ?? {};
      world.enemies.push({
        id: def.id,
        key: def.key,
        zh: base.zh ?? def.key,
        isBoss: !!def.isBoss,
        x: def.x,
        y: def.y,
        hp: def.hp,
        hpMax: def.hp,
        attack: def.attack,
        defense: def.defense ?? base.defense ?? 0,
        moveSpeed: def.moveSpeed ?? base.moveSpeed ?? 0,
        attackRange: def.attackRange ?? base.attackRange ?? 1,
        attackCooldown: 0,
      });
    }
  }

  // 夜晚計時到 + 還有怪 → overtime
  if (world.phaseTimer <= 0 && world.enemies.length > 0) {
    world.phase      = 'overtime';
    world.phaseTimer = cfg.phases.overtimeSeconds;
    return;
  }
  // 夜晚計時到 + 沒怪 → 過關
  if (world.phaseTimer <= 0) { _waveClear(world, cfg); return; }
  // 出怪佇列清空 + 怪全滅 → 提前過關
  if (world.pendingSpawns.length === 0 && world.enemies.length === 0) _waveClear(world, cfg);
}

// ─── overtime ────────────────────────────────────────────────────────────────

function _updateOvertime(world, dt, cfg) {
  world.phaseTimer = Math.max(0, world.phaseTimer - dt);

  // 每 5 秒攻擊翻倍（waveplan.md「夜晚加時賽/狂暴模式」）
  const elapsed = cfg.phases.overtimeSeconds - world.phaseTimer;
  world.combat.overtimeMultiplier = Math.pow(2, Math.floor(elapsed / 5));

  if (world.phaseTimer <= 0)        { world.phase = 'gameover'; return; } // 加時終結 → gameover
  if (world.enemies.length === 0)   { _waveClear(world, cfg); }           // 加時清怪 → 過關
}

// ─── wave clear ──────────────────────────────────────────────────────────────

function _waveClear(world, cfg) {
  world.stage += 1;
  world.pendingSpawns = [];
  world.nightElapsed  = 0;
  world.combat.overtimeMultiplier = 1;

  if (BOSS_STAGES.has(world.stage)) {
    _enterCardOffer(world);
    return;
  }

  world.phase      = 'prep';
  world.phaseTimer = cfg.phases.prepSeconds;
}

function _enterCardOffer(world) {
  const offerRng = createRng(WAVE_RNG_SEED + world.stage * 7919);
  world.phase           = 'cardOffer';
  world.phaseTimer      = 0;
  world.pendingCardOffer = generateOffer(offerRng, world.stage);
}

/**
 * 玩家點選卡片後呼叫：套用 effect、刷新快照、轉回 prep。
 * @param {Object} world
 * @param {number} chosenIndex  0/1/2（pendingCardOffer 的索引）
 * @param {Object} cfg
 */
export function resolveCardOffer(world, chosenIndex, cfg = GAME_CONFIG) {
  const offer = world.pendingCardOffer;
  if (!offer || chosenIndex < 0 || chosenIndex >= offer.length) return;
  const chosen = offer[chosenIndex];
  if (!chosen) return;

  applyCardEffect(world, chosen.key);
  refreshCoreSnapshot(world, { applyHpMaxDelta: true });

  world.pendingCardOffer = null;
  world.phase      = 'prep';
  world.phaseTimer = cfg.phases.prepSeconds;
}

