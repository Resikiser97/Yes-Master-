/**
 * @file        mines.js
 * @module      config
 * @summary     左右礦山補位機率表（內部 40 塊 / 顯示 30 塊）與第 0 關初始資源包
 * @exports     MINES, INITIAL_RESOURCE_PACK, MINE_SEED
 * @depends     （無）
 * @sourceOfTruth Docs/game-design-plan.md「礦山系統」「第 0 關初始資源包」
 * @version     v0.0.17.0
 */

// 礦山補位隨機序列固定 seed（每場可重現；Loading 時預生成 Queue 的概念）
export const MINE_SEED = 20260623;

// 每座礦山內部儲存 10 格 x 4 層 = 40 格；前 3 層（30 格）對玩家可見，第 4 層為隱藏緩衝。
// 挖空後上方掉落補位，新方塊依下表機率（分母 40）生成。
export const MINES = {
  A: { // 左礦山：偏建材 / 防禦 / 鑽
    side: 'left',
    visible: { cols: 10, rows: 3, totalRows: 4 },
    weights: { sand: 7, stone: 7, iron: 5, diamond: 3, dirt: 16, gold: 1, glass: 1 },
  },
  B: { // 右礦山：偏土 / 高價（金、琉璃）
    side: 'right',
    visible: { cols: 10, rows: 3, totalRows: 4 },
    weights: { dirt: 24, gold: 5, glass: 4, sand: 2, stone: 2, iron: 2, diamond: 1 },
  },
};

// 第 0 關初始資源包：房間共享一包，不依人數放大，直接入塔內資源欄，只在新開局給一次
export const INITIAL_RESOURCE_PACK = {
  shared: true,
  scaleByPlayers: false,
  items: { dirt: 5, sand: 5, stone: 5, iron: 1, gold: 1, diamond: 1 },
};

