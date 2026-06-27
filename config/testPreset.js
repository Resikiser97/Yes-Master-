/**
 * @file        testPreset.js
 * @module      config
 * @summary     測試難度 preset：覆蓋 phases 時長、給玩家初始強化（等效 50 抽），不動原始數值
 * @summary     等效 50 抽：以核心 attack/attackSpeed/hp 補足測試模式跳過的前期裝備與第 10 關強卡基準
 * @exports     TEST_PRESET_SAVE_KEY, buildTestConfig
 * @depends     config/gameConfig.js
 * @sourceOfTruth Docs/claude-codex-worklist.md、Docs/waveplan.md（難度與卡片基準值）
 * @version     v0.0.15.0
 */

export const TEST_PRESET_SAVE_KEY = 'yesmaster.save.test.v1';

const TEST_OVERRIDES = {
  testMode: true,
  save: { storageKey: TEST_PRESET_SAVE_KEY },
  phases: {
    prepSeconds: 30,
    nightSeconds: 60,
    overtimeSeconds: 30,
  },
  // 玩家初始強化（等效 50 抽裝備加成）；只在無存檔新局時注入
  _testInit: {
    cardBonuses: { attack: 2, attackSpeed: 0.2, hp: 25 },
    storage: { dirt: 70, sand: 45, stone: 45, iron: 20, gold: 12, diamond: 5 },
  },
};

// 回傳以 base 為底、測試覆蓋值疊加的新 config 物件（不修改原始 GAME_CONFIG）
export function buildTestConfig(base) {
  return {
    ...base,
    testMode: true,
    save: { ...base.save, storageKey: TEST_PRESET_SAVE_KEY },
    phases: { ...base.phases, ...TEST_OVERRIDES.phases },
    _testInit: TEST_OVERRIDES._testInit,
  };
}

