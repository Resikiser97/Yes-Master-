/**
 * @file        equipmentConfig.js
 * @module      config
 * @summary     五項玩家裝備的每級加成與升級成本（單一數值來源）
 * @exports     EQUIPMENT_CONFIG, EQUIPMENT_SLOTS
 * @depends     （無）
 * @sourceOfTruth Docs/lobby-waitingroom-plan.md Phase D、config/gameConfig.js player 區塊
 * @version     v0.0.15.0
 */

export const EQUIPMENT_CONFIG = {
  maxLevel: 10,
  slots: {
    mining: {
      stat: 'mining',
      name: '挖掘鎬',
      bonusPerLevel: 2,
      upgradeCosts: [
        { stone: 20 }, { stone: 35, iron: 5 }, { stone: 50, iron: 10 }, { iron: 20, gold: 5 },
        { iron: 35, gold: 8 }, { gold: 15, diamond: 2 }, { gold: 25, diamond: 4 },
        { diamond: 8, glass: 6 }, { diamond: 12, glass: 10 }, { diamond: 20, glass: 16 },
      ],
    },
    fatigue: {
      stat: 'fatigue',
      name: '耐力護符',
      bonusPerLevel: 6,
      upgradeCosts: [
        { dirt: 30 }, { dirt: 50, sand: 20 }, { dirt: 70, sand: 35 }, { stone: 40, sand: 50 },
        { stone: 70, iron: 8 }, { iron: 18, gold: 6 }, { iron: 30, gold: 10 },
        { gold: 18, glass: 8 }, { gold: 28, glass: 14 }, { gold: 40, diamond: 8 },
      ],
    },
    spirit: {
      stat: 'spirit',
      name: '靈動面具',
      bonusPerLevel: 3,
      upgradeCosts: [
        { glass: 2, gold: 4 }, { glass: 4, gold: 8 }, { glass: 7, gold: 12 }, { glass: 10, diamond: 2 },
        { glass: 14, diamond: 3 }, { glass: 20, diamond: 5 }, { glass: 28, diamond: 8 },
        { glass: 38, diamond: 12 }, { glass: 50, diamond: 16 }, { glass: 64, diamond: 22 },
      ],
    },
    carry: {
      stat: 'carry',
      name: '背包扣帶',
      bonusPerLevel: 8,
      upgradeCosts: [
        { dirt: 20, sand: 20 }, { dirt: 35, sand: 35 }, { dirt: 55, stone: 20 }, { stone: 45, iron: 6 },
        { stone: 70, iron: 10 }, { iron: 20, gold: 5 }, { iron: 32, gold: 8 },
        { gold: 16, diamond: 4 }, { gold: 25, diamond: 7 }, { gold: 35, diamond: 12 },
      ],
    },
    repair: {
      stat: 'repair',
      name: '修補工具',
      bonusPerLevel: 4,
      upgradeCosts: [
        { dirt: 25, stone: 10 }, { dirt: 40, stone: 20 }, { stone: 45, iron: 4 }, { stone: 65, iron: 8 },
        { iron: 18, glass: 4 }, { iron: 28, glass: 8 }, { gold: 12, glass: 14 },
        { gold: 20, glass: 22 }, { diamond: 6, glass: 32 }, { diamond: 10, glass: 48 },
      ],
    },
  },
};

export const EQUIPMENT_SLOTS = Object.keys(EQUIPMENT_CONFIG.slots);
