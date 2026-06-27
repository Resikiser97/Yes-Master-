/**
 * @file        coreSnapshot.js
 * @module      game（狀態/orchestration 層，非渲染）
 * @summary     從 world 已放置方塊刷新核心數值快照，供 renderer / 後續戰鬥只讀
 * @exports     refreshCoreSnapshot
 * @depends     src/logic/coreStats.js
 * @sourceOfTruth Docs/game-design-plan.md「方塊屬性加成（堆疊到核心）」
 * @version     v0.0.15.0
 */

import { countPlacedBlocks, computeCoreStats } from '../logic/coreStats.js';
import { applyHpMaxDelta, clampCoreHp } from '../logic/coreHealth.js';

export function refreshCoreSnapshot(world, opts = {}) {
  const prevHpMax = world.coreStats?.hpMax;
  world.blockCounts = countPlacedBlocks(world.dirt, world.fore);
  world.coreStats = computeCoreStats(world.blockCounts, { base: world.cfg?.core?.base, cardAdd: world.cardBonuses ?? {} });
  if (world.coreHp == null) world.coreHp = world.coreStats.hpMax;
  else if (opts.applyHpMaxDelta && prevHpMax != null) {
    world.coreHp = applyHpMaxDelta(world.coreHp, world.coreStats.hpMax - prevHpMax, world.coreStats.hpMax);
  } else {
    world.coreHp = clampCoreHp(world.coreHp, world.coreStats.hpMax);
  }
  return world.coreStats;
}

