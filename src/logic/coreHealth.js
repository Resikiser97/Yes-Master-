/**
 * @file        coreHealth.js
 * @module      logic（pure）
 * @summary     核心目前血量、受傷、修復與 hpMax 變化的純計算
 * @exports     clampCoreHp, applyHpMaxDelta, damageCoreHp, repairCoreHp, repairPerSecond
 * @depends     （無）
 * @sourceOfTruth Docs/game-design-plan.md「修復能力細節」、Docs/game-design-plan.md「方塊屬性加成」
 * @version     v0.0.18.0
 */

export function clampCoreHp(current, hpMax) {
  return Math.max(0, Math.min(current, hpMax));
}

export function applyHpMaxDelta(current, delta, nextMax) {
  return clampCoreHp(current + delta, nextMax);
}

export function damageCoreHp(current, amount) {
  return Math.max(0, current - Math.max(0, amount));
}

export function repairPerSecond(repairPower) {
  return Math.floor((repairPower / 60) * 100) / 100;
}

export function repairCoreHp(current, hpMax, fatigue, dt, repairPower) {
  if (current >= hpMax || fatigue <= 0 || dt <= 0) {
    return { hp: clampCoreHp(current, hpMax), fatigue, healed: 0, fatigueUsed: 0 };
  }
  const rps = repairPerSecond(repairPower);
  if (rps <= 0) return { hp: clampCoreHp(current, hpMax), fatigue, healed: 0, fatigueUsed: 0 };
  const missing = hpMax - current;
  const activeTime = Math.min(dt, fatigue, missing / rps);
  const fatigueUsed = activeTime;
  const healed = Math.min(missing, rps * activeTime);
  return {
    hp: clampCoreHp(current + healed, hpMax),
    fatigue: Math.max(0, fatigue - fatigueUsed),
    healed,
    fatigueUsed,
  };
}

