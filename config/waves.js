/**
 * @file        waves.js
 * @module      config
 * @summary     1-30 關單人基準波次組成、成長規則、加時與 21-30 阻擋區
 * @exports     WAVES, GROWTH, OVERTIME, BLOCKER_BAND
 * @depends     enemies.js（敵人 key）
 * @sourceOfTruth Docs/waveplan.md（唯一波次主檔）
 * @version     v0.0.33.0
 */

// 單人基準波次：每關各敵人數量。多人倍率由 waveGen 套（普通怪 xN、Boss N 隻）
export const WAVES = {
  1:  { civilian: 3 },
  2:  { civilian: 4 },
  3:  { civilian: 4, runner: 1 },
  4:  { civilian: 5, brute: 1 },
  5:  { civilian: 5, brute: 1, runner: 1 },
  6:  { civilian: 5, brute: 2 },
  7:  { civilian: 5, brute: 2, shielder: 1 },
  8:  { civilian: 6, brute: 2, runner: 1 },
  9:  { civilian: 5, brute: 3, runner: 1, shielder: 1 },
  10: { civilian: 4, brute: 2, runner: 2, shielder: 1, boss10: 1 },
  11: { civilian: 5, brute: 2, runner: 2, shielder: 1 },
  12: { civilian: 5, brute: 3, runner: 2, shielder: 1 },
  13: { civilian: 5, brute: 3, runner: 2, shielder: 2 },
  14: { civilian: 6, brute: 3, runner: 3, shielder: 2 },
  15: { civilian: 5, brute: 4, runner: 3, shielder: 2, sapper: 1 },
  16: { civilian: 6, brute: 4, runner: 3, shielder: 2, sapper: 1 },
  17: { civilian: 7, brute: 4, runner: 3, shielder: 3, sapper: 1 },
  18: { civilian: 7, brute: 5, runner: 4, shielder: 3, sapper: 1 },
  19: { civilian: 8, brute: 5, runner: 4, shielder: 3, sapper: 1 },
  20: { civilian: 6, brute: 4, runner: 4, shielder: 3, sapper: 2, boss20: 1 },
  21: { civilian: 8,  brute: 5, runner: 4, shielder: 3, sapper: 1 },
  22: { civilian: 9,  brute: 5, runner: 4, shielder: 3, sapper: 1 },
  23: { civilian: 10, brute: 6, runner: 4, shielder: 3, sapper: 1 },
  24: { civilian: 11, brute: 6, runner: 5, shielder: 4, sapper: 1 },
  25: { civilian: 12, brute: 7, runner: 5, shielder: 4, sapper: 2 },
  26: { civilian: 13, brute: 7, runner: 5, shielder: 4, sapper: 2 },
  27: { civilian: 14, brute: 8, runner: 6, shielder: 5, sapper: 2 },
  28: { civilian: 15, brute: 8, runner: 6, shielder: 5, sapper: 2 },
  29: { civilian: 16, brute: 9, runner: 6, shielder: 5, sapper: 3 },
  30: { civilian: 10, brute: 7, runner: 6, shielder: 5, sapper: 3, boss30: 1 },
};

// 普通怪成長（Boss 不吃；以敵人 base 為 1.0 起算）
export const GROWTH = {
  hp: {
    noGrowthMaxStage: 10,                  // 1-10 不成長
    stage11to20: { base: 1.05, fromStage: 11 }, // base^(stage-11)
  },
  attack: {
    // 11-15 跑者/工兵 +1；16-20 跑者/工兵 +2（加法）
    flat: [
      { fromStage: 11, toStage: 15, targets: ['runner', 'sapper'], add: 1 },
      { fromStage: 16, toStage: 20, targets: ['runner', 'sapper'], add: 2 },
    ],
  },
};

// 夜晚加時賽（狂暴）：60 秒未清完 → 30 秒加時，每 5 秒攻擊 x2；30 秒結束仍未清 → 強制 GameOver
export const OVERTIME = {
  triggerAfterSeconds: 60,
  durationSeconds: 30,
  attackDoubleEverySeconds: 5,
  failIsGameOver: true,
};

// 21-30 MVP 阻擋區：每關額外隨機增壓（逐關累乘），seed 固定以求可重現
export const BLOCKER_BAND = {
  fromStage: 21,
  hpRandomPct: { min: 15, max: 25 },     // 每關血量 +15~25%
  attackRandomPct: { min: 10, max: 20 }, // 每關攻擊 +10~20%
  minAttackPressureEvery2Stages: 1,      // 最低每 2 關至少等效 +1 攻擊壓力
  seed: 20260622,
};
