/**
 * @file        blocks.js
 * @module      config
 * @summary     方塊耐久/重量與「堆疊到核心」的屬性加成（單一數值來源）
 * @exports     BLOCKS, BLOCK_KEYS
 * @depends     （無）
 * @sourceOfTruth Docs/game-design-plan.md「方塊系統」
 * @version     v0.0.17.0
 */

// layer：'background' = 第一層地基（只有泥土）；'foreground' = 第二層（蓋在泥土前方）
// bonus：每一顆該方塊對核心的加成欄位與數值（coreStats.js 消費）
export const BLOCKS = {
  dirt:   { zh: '土',   durability: 50,   weight: 5,  layer: 'background', bonus: { hp: 1 } },
  sand:   { zh: '沙',   durability: 50,   weight: 5,  layer: 'foreground', bonus: { range: 1 } },
  stone:  { zh: '石',   durability: 50,   weight: 5,  layer: 'foreground', bonus: { defense: 0.1 } },
  iron:   { zh: '鐵',   durability: 100,  weight: 10, layer: 'foreground', bonus: { attack: 0.1 } },
  gold:   { zh: '金',   durability: 150,  weight: 10, layer: 'foreground', bonus: { attackSpeed: 0.01 } },
  glass:  { zh: '琉璃', durability: 500,  weight: 20, layer: 'foreground', bonus: { magicPct: 0.1 } }, // 0.1% 穿透
  diamond:{ zh: '鑽',   durability: 1000, weight: 50, layer: 'foreground', bonus: { chain: 0.1 } },
  ladder: { zh: '梯子', durability: 0,    weight: 0,  layer: 'foreground', bonus: {}, infinite: true }, // 無限功能性方塊，不消耗不加成
};

export const BLOCK_KEYS = Object.keys(BLOCKS);

