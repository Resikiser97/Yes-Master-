/**
 * @file        mineGen.js
 * @module      logic（pure）
 * @summary     礦山可見 10x3 方塊生成與挖空後的重力補位（依機率表，隨機注入）
 * @exports     weightedSample, createMine, digMineCell
 * @depends     config/mines.js
 * @sourceOfTruth Docs/game-design-plan.md「礦山系統」
 * @version     v0.0.5.0
 *
 * columns[col] = [row0, row1, ...]（row0 = 最上層）。挖掉某格 → 上方往下掉、最上層補新塊。
 * 隨機一律注入 rng（rng.next() ∈ [0,1)），可重現、可單測。
 */

// 依權重表（key -> 整數權重）抽一個 block key
export function weightedSample(weights, rng) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r < 0) return key;
  }
  return entries[entries.length - 1][0];
}

// 建立一座礦山的可見方塊（colCount x rowCount）
export function createMine(mineCfg, rng) {
  const colCount = mineCfg.visible.cols;
  const rowCount = mineCfg.visible.rows;
  const columns = [];
  for (let c = 0; c < colCount; c++) {
    const col = [];
    for (let r = 0; r < rowCount; r++) col.push(weightedSample(mineCfg.weights, rng));
    columns.push(col);
  }
  return { columns, colCount, rowCount, weights: mineCfg.weights };
}

// 挖掉 (col,row)：回傳被挖出的 block key；上方下掉、最上層補新塊
export function digMineCell(mine, col, row, rng) {
  const column = mine.columns[col];
  if (!column || row < 0 || row >= column.length) return null;
  const extracted = column[row];
  for (let r = row; r > 0; r--) column[r] = column[r - 1];
  column[0] = weightedSample(mine.weights, rng);
  return extracted;
}
