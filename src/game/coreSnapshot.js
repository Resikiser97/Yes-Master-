/**
 * @file        coreSnapshot.js
 * @module      game（狀態/orchestration 層，非渲染）
 * @summary     從 world 已放置方塊刷新核心數值快照，供 renderer / 後續戰鬥只讀
 * @exports     refreshCoreSnapshot
 * @depends     src/logic/coreStats.js, src/logic/coreHealth.js
 * @sourceOfTruth Docs/game-design-plan.md「方塊屬性加成（堆疊到核心）」
 * @version     v0.0.30.0
 */

import { countPlacedBlocks, computeCoreStats, computeHeightBonus, computeSpiritBonusPct } from '../logic/coreStats.js';
import { applyHpMaxDelta, clampCoreHp } from '../logic/coreHealth.js';

function _sumModifier(mods, stat) {
  return (mods ?? []).reduce((sum, m) => {
    if (m?.stat !== stat) return sum;
    const pct = Number(m.pct ?? 0);
    return Number.isFinite(pct) ? sum + pct : sum;
  }, 0);
}

export function refreshCoreSnapshot(world, opts = {}) {
  const prevHpMax = world.coreStats?.hpMax;
  world.blockCounts = countPlacedBlocks(world.dirt, world.fore);

  const hpMaxMod = (world.cardModifiers ?? [])
    .filter((m) => m?.stat === 'coreHpMax' && m.add != null)
    .reduce((acc, m) => {
      const add = Number(m.add ?? 0);
      return Number.isFinite(add) ? acc + add : acc;
    }, 0);
  const cardAdd = { ...(world.cardBonuses ?? {}) };
  if (hpMaxMod !== 0) cardAdd.hpMax = (cardAdd.hpMax ?? 0) + hpMaxMod;

  world.coreStats = computeCoreStats(world.blockCounts, { base: world.cfg?.core?.base, cardAdd });

  // 靈力（spirit）→ 核心攻擊力 + 攻速乘算加成
  const players = world.players?.size
    ? [...world.players.values()]
    : world.player ? [world.player] : [];
  if (players.length > 0) {
    const spiritPct = computeSpiritBonusPct(players, world.cfg);
    if (spiritPct > 0) {
      world.coreStats.attack      *= 1 + spiritPct / 100;
      world.coreStats.attackSpeed *= 1 + spiritPct / 100;
    }
  }

  // 高塔工法 → 高於地面指定格數的方塊額外增加 heightBonusPct% 數值貢獻（在靈力乘算之後加算）
  const heightBonusPct = _sumModifier(world.cardModifiers, 'heightBonusPct');
  if (heightBonusPct !== 0 && world.fore?.size) {
    const extra = computeHeightBonus(
      world.fore,
      world.groundY,
      heightBonusPct,
      undefined,
      world.cfg?.core?.heightBonusAboveGroundTiles,
    );
    for (const [stat, add] of Object.entries(extra)) {
      if (stat in world.coreStats) world.coreStats[stat] += add;
    }
  }

  if (world.coreHp == null) world.coreHp = world.coreStats.hpMax;
  else if (opts.applyHpMaxDelta && prevHpMax != null) {
    world.coreHp = applyHpMaxDelta(world.coreHp, world.coreStats.hpMax - prevHpMax, world.coreStats.hpMax);
  } else {
    world.coreHp = clampCoreHp(world.coreHp, world.coreStats.hpMax);
  }
  return world.coreStats;
}
