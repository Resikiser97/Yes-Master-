/**
 * @file        waveGen.js
 * @module      logic（pure）
 * @summary     由關卡數 + 玩家數產生該關敵人實例（含成長/多人倍率/出怪分批，隨機注入）
 * @exports     hpGrowthMultiplier, flatAttackAdd, buildSpawnSchedule, buildWave
 * @depends     config/waves.js、config/enemies.js、config/gameConfig.js、src/logic/rng.js
 * @sourceOfTruth Docs/waveplan.md（波次/成長/多人倍率/21-30 阻擋區）
 * @version     v0.0.17.0
 *
 * ⚠️ 需 Codex 任務 A/B（enemies.js 的 hp/attack/moveSpeed）填完才能跑出有效數值。
 *    本檔只負責「邏輯」：把 base 值套成長/倍率，不在此寫死敵人數值。
 */

import { WAVES, GROWTH, BLOCKER_BAND } from '../../config/waves.js';
import { ENEMIES } from '../../config/enemies.js';
import { GAME_CONFIG } from '../../config/gameConfig.js';

// 普通怪血量成長倍率（Boss 不吃）
export function hpGrowthMultiplier(stage) {
  if (stage <= GROWTH.hp.noGrowthMaxStage) return 1;
  const g = GROWTH.hp.stage11to20;
  if (stage <= 20) return Math.pow(g.base, stage - g.fromStage);
  return Math.pow(g.base, 20 - g.fromStage); // 21+ 的累乘增壓另由 blocker band 處理
}

// 普通怪攻擊加法成長（跑者/工兵 11-15 +1、16-20 +2）
export function flatAttackAdd(stage, enemyKey) {
  let add = 0;
  for (const rule of GROWTH.attack.flat) {
    if (stage >= rule.fromStage && stage <= rule.toStage && rule.targets.includes(enemyKey)) {
      add += rule.add;
    }
  }
  return add;
}

// 出怪分批：N 隻在 0~5 秒分批；前 remainder 秒每秒多 1 隻
export function buildSpawnSchedule(total) {
  const base = Math.floor(total / 5);
  const remainder = total % 5;
  const schedule = [];
  for (let s = 0; s < 5; s++) {
    const count = base + (s < remainder ? 1 : 0);
    if (count > 0) schedule.push({ second: s, count });
  }
  return schedule;
}

/**
 * 產生整關敵人實例。
 * @param {number} stage 關卡數（1-30）
 * @param {number} playerCount 1-4
 * @param {Object} rng createRng() 注入（21-30 隨機增壓用；seed 來自 BLOCKER_BAND）
 * @returns {{ stage, enemies: Array, schedule: Array }}
 */
export function buildWave(stage, playerCount, rng) {
  const comp = WAVES[stage] ?? {};
  const fourPlayerHpBonus = playerCount === 4
    ? 1 + GAME_CONFIG.multiplayer.fourPlayerNormalHpBonusPct / 100 : 1;

  const enemies = [];
  let idCounter = 0;

  for (const [enemyKey, baseCount] of Object.entries(comp)) {
    const def = ENEMIES[enemyKey];
    if (!def) continue;
    const isBoss = !!def.isBoss;
    // 數量：普通怪 xN；Boss = N 隻
    const count = isBoss
      ? (GAME_CONFIG.multiplayer.bossCountEqualsPlayers ? playerCount : baseCount)
      : baseCount * playerCount;

    for (let i = 0; i < count; i++) {
      let hp = def.hp;
      let attack = def.attack;

      if (!isBoss) {
        hp = def.hp * hpGrowthMultiplier(stage) * fourPlayerHpBonus;
        attack = def.attack + flatAttackAdd(stage, enemyKey);
        if (stage >= BLOCKER_BAND.fromStage) {
          hp *= 1 + rng.pct(BLOCKER_BAND.hpRandomPct.min, BLOCKER_BAND.hpRandomPct.max) / 100;
          attack *= 1 + rng.pct(BLOCKER_BAND.attackRandomPct.min, BLOCKER_BAND.attackRandomPct.max) / 100;
        }
      } else {
        // Boss：獨立數值；boss20 多人血量門檻
        const multiBonus = def.multiHpBonusPct?.[playerCount];
        if (multiBonus) hp = def.hp * (1 + multiBonus / 100);
      }

      enemies.push({
        id: `${stage}-${enemyKey}-${idCounter++}`,
        key: enemyKey,
        isBoss,
        hp, attack,
        moveSpeed: def.moveSpeed,
        height: def.height,
        attackRange: def.attackRange,
        defense: def.defense,
      });
    }
  }

  return { stage, enemies, schedule: buildSpawnSchedule(enemies.length) };
}

