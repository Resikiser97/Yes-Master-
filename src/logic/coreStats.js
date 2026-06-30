/**
 * @file        coreStats.js
 * @module      logic（pure）
 * @summary     由「已放置方塊計數」即時換算核心六大數值（純函式，config 驅動）
 * @exports     countPlacedBlocks, computeCoreStats, computeSpiritBonusPct, computeHeightBonus
 * @depends     config/gameConfig.js、config/blocks.js
 * @sourceOfTruth Docs/game-design-plan.md「核心攻擊與防禦機制」
 * @version     v0.0.30.0
 *
 * 不寫死任何加成倍率：倍率全部來自 BLOCKS[block].bonus（Magic Number 禁令）。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { BLOCKS } from '../../config/blocks.js';

// bonus 欄位 → 核心輸出欄位的對應（土的 hp 加成歸到 hpMax）
const BONUS_TO_STAT = {
  hp: 'hpMax', range: 'range', defense: 'defense',
  attack: 'attack', attackSpeed: 'attackSpeed', magicPct: 'magicPct', chain: 'chain',
};

/**
 * 把 world 的兩層建築資料轉成核心加成用的方塊數量。
 * 泥土在背景層仍提供 hp 加成；前景第二層照種類加成。
 */
export function countPlacedBlocks(dirtCells = new Set(), foreBlocks = new Map()) {
  const counts = {};
  const dirtCount = dirtCells?.size ?? 0;
  if (dirtCount > 0) counts.dirt = dirtCount;

  for (const blockKey of foreBlocks?.values?.() ?? []) {
    counts[blockKey] = (counts[blockKey] ?? 0) + 1;
  }
  return counts;
}

/**
 * @param {Object} blockCounts 例：{ dirt: 30, iron: 10, gold: 5, ... }
 * @param {Object} [opts]
 * @param {Object} [opts.cardAdd] 卡片/固定加值，例：{ attack: 2, hpMax: 25 }
 * @param {Object} [opts.blockDefs] 方塊定義（預設 config BLOCKS，測試可注入）
 * @param {Object} [opts.base] 核心基礎值（預設 config core.base）
 * @returns {{attack,attackSpeed,hpMax,defense,range,magicPct,chain}}
 */
export function computeCoreStats(blockCounts = {}, opts = {}) {
  const base = opts.base ?? GAME_CONFIG.core.base;
  const blockDefs = opts.blockDefs ?? BLOCKS;
  const cardAdd = opts.cardAdd ?? {};

  const stats = {
    attack: base.attack,
    attackSpeed: base.attackSpeed,
    hpMax: base.hp,
    defense: base.defense,
    range: base.range,
    magicPct: base.magicPct,
    chain: base.chain,
  };

  for (const [blockKey, count] of Object.entries(blockCounts)) {
    const def = blockDefs[blockKey];
    if (!def || !count) continue;
    for (const [bonusKey, perBlock] of Object.entries(def.bonus ?? {})) {
      const statKey = BONUS_TO_STAT[bonusKey];
      if (statKey) stats[statKey] += perBlock * count;
    }
  }

  for (const [statKey, add] of Object.entries(cardAdd)) {
    if (statKey in stats) stats[statKey] += add;
  }

  return stats;
}

export function computeSpiritBonusPct(players = [], cfg = GAME_CONFIG) {
  const gameCfg = cfg ?? GAME_CONFIG;
  const list = [...(players ?? [])].filter(Boolean);
  if (list.length === 0) return 0;
  const totalSpirit = list.reduce((sum, player) => {
    const spirit = Number(player?.spirit ?? gameCfg.player?.spirit ?? 0);
    return Number.isFinite(spirit) ? sum + spirit : sum;
  }, 0);
  const singleBonus = gameCfg.mode === 'single'
    ? Number(gameCfg.player?.spiritSinglePlayerBonusPct ?? 0)
    : 0;
  return totalSpirit / 100 * 10 + (Number.isFinite(singleBonus) ? singleBonus : 0);
}

/**
 * 計算「高塔工法」加成：高於地面指定格數的前景方塊額外貢獻 bonusPct% 的數值。
 * 回傳的物件格式與 computeCoreStats 的 stats 相同，直接加算至 coreStats 即可。
 */
export function computeHeightBonus(fore, groundY, bonusPct, blockDefs = BLOCKS, aboveGroundTiles = GAME_CONFIG.core.heightBonusAboveGroundTiles) {
  const ground = Number(groundY ?? GAME_CONFIG.map.groundY);
  const height = Number(aboveGroundTiles ?? GAME_CONFIG.core.heightBonusAboveGroundTiles);
  const pct = Number(bonusPct ?? 0);
  if (!Number.isFinite(ground) || !Number.isFinite(height) || !Number.isFinite(pct) || pct === 0) return {};
  const threshold = ground - height;
  const extra = {};
  for (const [key, blockKey] of fore ?? new Map()) {
    const y = Number(String(key).split(',')[1]);
    if (!Number.isFinite(y)) continue;
    if (y >= threshold) continue;
    const def = blockDefs[blockKey];
    if (!def?.bonus) continue;
    for (const [bonusKey, perBlock] of Object.entries(def.bonus)) {
      const statKey = BONUS_TO_STAT[bonusKey];
      const value = Number(perBlock);
      if (statKey && Number.isFinite(value)) extra[statKey] = (extra[statKey] ?? 0) + value * (pct / 100);
    }
  }
  return extra;
}
