/**
 * @file        mines.js
 * @module      config
 * @summary     左右礦山補位機率表（每 30 塊）與第 0 關初始資源包
 * @exports     MINES, INITIAL_RESOURCE_PACK, MINE_SEED
 * @depends     （無）
 * @sourceOfTruth Docs/game-design-plan.md「礦山系統」「第 0 關初始資源包」
 * @version     v0.0.4.0
 */

// 礦山補位隨機序列固定 seed（每場可重現；Loading 時預生成 Queue 的概念）
export const MINE_SEED = 20260623;

// 每座礦山可見 10 格 x 3 層 = 30 格；挖空後上方掉落補位，新方塊依下表機率（分母 30）生成
export const MINES = {
  A: { // 左礦山：偏建材 / 防禦 / 鑽
    side: 'left',
    visible: { cols: 10, rows: 3 },
    weights: { sand: 8, stone: 8, iron: 6, diamond: 3, dirt: 3, gold: 1, glass: 1 },
  },
  B: { // 右礦山：偏土 / 高價（金、琉璃）
    side: 'right',
    visible: { cols: 10, rows: 3 },
    weights: { dirt: 12, gold: 6, glass: 5, sand: 2, stone: 2, iron: 2, diamond: 1 },
  },
};

// 第 0 關初始資源包：房間共享一包，不依人數放大，直接入塔內資源欄，只在新開局給一次
export const INITIAL_RESOURCE_PACK = {
  shared: true,
  scaleByPlayers: false,
  items: { dirt: 5, sand: 5, stone: 5, iron: 1, gold: 1, diamond: 1 },
};
