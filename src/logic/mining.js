/**
 * @file        mining.js
 * @module      logic（pure）
 * @summary     挖礦：破塊所需敲擊數、每秒挖掘傷害、選離玩家最近的可挖礦格（純函式）
 * @exports     hitsToBreak, durabilityToBreak, miningDamagePerSecond, selectNearestMineCell
 * @depends     config/blocks.js
 * @sourceOfTruth Docs/game-design-plan.md「方塊系統」「操作輸入方式」
 * @version     v0.0.18.0
 *
 * 挖掘能力 = 每下傷害；次數上限由輸入方式決定（點擊 10/s、長按 10/s）。
 * 例：沙/土/石 耐久 50、挖掘 10 → 5 下出塊。
 */

import { BLOCKS } from '../../config/blocks.js';

// 破塊所需敲擊次數
export function hitsToBreak(blockKey, miningPower, defs = BLOCKS) {
  const dur = defs[blockKey]?.durability ?? 0;
  if (dur <= 0 || miningPower <= 0) return Infinity; // 0 耐久（如梯子）不可挖
  return Math.ceil(dur / miningPower);
}

// 破塊所需總傷害（= 耐久）
export function durabilityToBreak(blockKey, defs = BLOCKS) {
  return defs[blockKey]?.durability ?? 0;
}

// 每秒挖掘傷害 = 挖掘能力 × 每秒敲擊數
export function miningDamagePerSecond(miningPower, hitsPerSecond) {
  return miningPower * hitsPerSecond;
}

// 選離玩家最近、且在 reach 內的可挖礦格
// mines: { A:{cols:[c0,c1], rows:[r0,r1], mine:{columns}}, B:{...} }
export function selectNearestMineCell(player, mines, reach) {
  let best = null;
  let bestD = Infinity;
  for (const [mineId, m] of Object.entries(mines)) {
    const [c0] = m.cols;
    const [r0] = m.rows;
    const cols = m.mine.columns;
    const displayRows = m.mine.displayRows ?? cols[0]?.length ?? 3;
    for (let ci = 0; ci < cols.length; ci++) {
      for (let ri = 0; ri < displayRows; ri++) {
        const blockKey = cols[ci][ri];
        if (!blockKey) continue;
        const x = c0 + ci;
        const y = r0 + ri;
        const dx = x - player.x;
        const dy = y - player.y;
        const d = Math.hypot(dx, dy);
        if (d <= reach && d < bestD) {
          bestD = d;
          best = { mineId, col: ci, row: ri, x, y, blockKey, dist: d };
        }
      }
    }
  }
  return best;
}

