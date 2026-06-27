/**
 * @file        levelSystem.js
 * @module      game（pure）
 * @summary     玩家經驗值與等級換算純函式，供結算與 profile 寫回前使用
 * @exports     expForLevel, expToNextLevel, calcLevel, addExp, calcExpReward
 * @depends     config/levelConfig.js
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase B、config/levelConfig.js
 * @version     v0.0.18.0
 */

import { LEVEL_CONFIG } from '../../config/levelConfig.js';

function clampExp(exp) {
  return Math.max(0, Math.floor(Number(exp) || 0));
}

function clampLevel(level, cfg = LEVEL_CONFIG) {
  return Math.max(cfg.minLevel, Math.min(cfg.maxLevel, Math.floor(Number(level) || cfg.minLevel)));
}

export function expToNextLevel(level, cfg = LEVEL_CONFIG) {
  const lv = clampLevel(level, cfg);
  if (lv >= cfg.maxLevel) return 0;
  return lv * cfg.expToNextLevel.perLevel;
}

export function expForLevel(level, cfg = LEVEL_CONFIG) {
  const target = clampLevel(level, cfg);
  let total = 0;
  for (let lv = cfg.minLevel; lv < target; lv++) {
    total += expToNextLevel(lv, cfg);
  }
  return total;
}

export function calcLevel(exp, cfg = LEVEL_CONFIG) {
  const totalExp = clampExp(exp);
  let level = cfg.minLevel;
  while (level < cfg.maxLevel && totalExp >= expForLevel(level + 1, cfg)) {
    level += 1;
  }
  return level;
}

export function addExp(currentExp, amount, cfg = LEVEL_CONFIG) {
  const beforeExp = clampExp(currentExp);
  const gained = Math.max(0, Math.floor(Number(amount) || 0));
  const exp = beforeExp + gained;
  const level = calcLevel(exp, cfg);
  const currentLevelExp = expForLevel(level, cfg);
  const nextLevelExp = level >= cfg.maxLevel ? currentLevelExp : expForLevel(level + 1, cfg);
  return {
    exp,
    gained,
    level,
    expIntoLevel: exp - currentLevelExp,
    expToNext: Math.max(0, nextLevelExp - exp),
    leveledUp: level > calcLevel(beforeExp, cfg),
  };
}

export function calcExpReward(summary = {}, cfg = LEVEL_CONFIG) {
  const sources = cfg.sources;
  const wave = Math.max(0, Math.floor(Number(summary.wave ?? summary.stage) || 0));
  const minedBlocks = Math.max(0, Math.floor(Number(summary.minedBlocks) || 0));
  const builtBlocks = Math.max(0, Math.floor(Number(summary.builtBlocks) || 0));
  const repairedCoreHp = Math.max(0, Math.floor(Number(summary.repairedCoreHp) || 0));
  const playerCount = Math.max(1, Math.floor(Number(summary.playerCount) || 1));

  const waveExp = wave > 0 ? sources.waveClearBase + wave * sources.waveClearPerWave : 0;
  const bossExp = wave > 0 && wave % 10 === 0 ? sources.bossWaveBonus : 0;
  const miningExp = minedBlocks * sources.miningPerBlock;
  const buildExp = builtBlocks * sources.buildPerBlock;
  const repairExp = repairedCoreHp * sources.repairPerCoreHp;
  const subtotal = waveExp + bossExp + miningExp + buildExp + repairExp;
  const multiplayerBonus = playerCount > 1 ? Math.floor(subtotal * sources.multiplayerClearBonusPct / 100) : 0;

  return {
    total: subtotal + multiplayerBonus,
    breakdown: { waveExp, bossExp, miningExp, buildExp, repairExp, multiplayerBonus },
  };
}
