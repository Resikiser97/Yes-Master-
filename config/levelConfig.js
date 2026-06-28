/**
 * @file        levelConfig.js
 * @module      config
 * @summary     玩家等級經驗曲線與 MVP 經驗來源數值（單一數值來源）
 * @exports     LEVEL_CONFIG
 * @depends     （無）
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase B、Docs/game-design-plan.md「玩家等級與技能點經濟」
 * @version     v0.0.19.0
 */

export const LEVEL_CONFIG = {
  minLevel: 1,
  maxLevel: 60,

  // MVP 線性曲線：從 lv 升到 lv+1 需要 lv * 100 exp。
  // 累計門檻由 levelSystem.expForLevel(lv) 計算。
  expToNextLevel: {
    perLevel: 100,
  },

  sources: {
    waveClearBase: 40,
    waveClearPerWave: 10,
    bossWaveBonus: 80,
    miningPerBlock: 1,
    buildPerBlock: 2,
    repairPerCoreHp: 1,
    multiplayerClearBonusPct: 20,
  },
};
