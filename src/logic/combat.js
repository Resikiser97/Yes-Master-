/**
 * @file        combat.js
 * @module      logic（pure）
 * @summary     核心普攻鎖定、連鎖目標選擇、單次命中傷害（純函式，隨機注入）
 * @exports     dist2, selectPrimaryTarget, chainHitCount, selectChainTargets, computeHit
 * @depends     src/logic/damageDefense.js
 * @sourceOfTruth Docs/game-design-plan.md「核心攻擊與防禦機制」（目標選擇 / 連鎖定案）
 * @version     v0.0.3.0
 *
 * 定案規則：
 *  - 普攻：鎖定「離核心最近」的目標。
 *  - 連鎖：以普攻主目標為中心，往外取「最近的 N 隻」，同次不重複；
 *    若範圍內對象已全部選過一輪、連鎖數仍有剩 → 重啟新一輪循環，可再重複命中。
 */

import { computeDamage } from './damageDefense.js';

// 平方距離（比大小用，省開根號）。點：{x,y}
export const dist2 = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};

// 普攻主目標：攻擊範圍內離核心最近的敵人（enemiesInRange 已過濾在範圍內）
export function selectPrimaryTarget(enemiesInRange, coreCenter) {
  let best = null, bestD = Infinity;
  for (const e of enemiesInRange) {
    const d = dist2(e, coreCenter);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// 連鎖額外命中數 = 整數部分（保證）+ 小數部分（機率，注入 rng）
// chain 例：1.1 → 保證 1，10% 再 +1
export function chainHitCount(chain, rng) {
  const guaranteed = Math.floor(chain);
  const frac = chain - guaranteed;
  return guaranteed + (frac > 0 && rng.bernoulli(frac) ? 1 : 0);
}

/**
 * 連鎖目標（不含主目標本身）：以主目標為中心由近到遠取，count 隻。
 * 同一輪不重複；count > 可選對象數時，重啟循環允許重複。
 * @returns {Array} 命中對象陣列（長度 = count，可能含重複的循環）
 */
export function selectChainTargets(primary, others, count, /* rng 保留供未來同距離隨機 */) {
  if (count <= 0 || others.length === 0) return [];
  const sorted = [...others].sort((a, b) => dist2(a, primary) - dist2(b, primary));
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(sorted[i % sorted.length]); // i 超過長度即進入新一輪循環
  }
  return result;
}

// 單次命中傷害（物理+魔法），coreStats: {attack, magicPct}
export function computeHit(coreStats, target, k) {
  return computeDamage(coreStats, target, k);
}
