/**
 * @file        rng.js
 * @module      logic（pure）
 * @summary     可重現的 seeded 亂數產生器（讓所有含隨機的純邏輯可注入、可測試）
 * @exports     createRng
 * @depends     （無）
 * @sourceOfTruth 開發鐵則 9：純邏輯內禁止直接呼叫 Math.random()，一律注入此 RNG
 * @version     v0.0.20.0
 */

// mulberry32：同一 seed → 同一序列，純函式可重現
export function createRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,                                   // () => [0, 1)
    int: (min, max) => min + Math.floor(next() * (max - min + 1)), // 含端點整數
    pct: (min, max) => min + next() * (max - min),                 // [min, max) 浮點
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    bernoulli: (p) => next() < p,           // p 機率回 true
  };
}

