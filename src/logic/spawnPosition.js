/**
 * @file        spawnPosition.js
 * @module      logic（pure）
 * @summary     計算每批出怪座標（核心 Hitbox 外 10~20 格，不進礦山，不出地圖邊界），純函式
 * @exports     spawnPositions
 * @depends     src/logic/building.js（buildHalfWidth）
 * @sourceOfTruth Docs/waveplan.md「怪物生成安全規則」「建造範圍與生成安全區」
 * @version     v0.0.3.0
 *
 * 生成原則（waveplan.md）：
 *   - x = 核心中心 ± (當關 halfWidth + 10~20 格隨機偏移)
 *   - y = groundY - 1（地面層）
 *   - 不得落在礦山列範圍（cols[0]..cols[1]）
 *   - 不得超出地圖邊界
 *   - 左右交替分配（i=偶數→右，奇數→左）
 */

import { buildHalfWidth } from './building.js';

/**
 * 為 count 隻怪分配出生座標。
 *
 * @param {number}  count  要生成的數量
 * @param {Object}  world  { coreCenter:{x,y}, groundY, cols, stage, cfg, mines }
 * @param {Object}  cfg    GAME_CONFIG（含 buildLimits / map / mines 礦山 cols 範圍）
 * @param {Object}  rng    注入的 seeded RNG（rng.next() ∈ [0,1)）
 * @returns {Array<{x: number, y: number}>}
 */
export function spawnPositions(count, world, cfg, rng) {
  const positions = [];
  const half = buildHalfWidth(world.stage, cfg.buildLimits);
  const y    = world.groundY - 1;
  const cx   = world.coreCenter.x;

  // 礦山禁區：從 world.mines 取出所有礦山的列範圍 [colMin, colMax]
  const mineZones = Object.values(world.mines ?? {}).map((m) => m.cols); // [[15,24],[135,144]]

  for (let i = 0; i < count; i++) {
    const side   = i % 2 === 0 ? 1 : -1; // 右、左交替
    const jitter = 10 + Math.floor(rng.next() * 11); // 10~20 格

    let x = cx + side * (half + jitter);

    // TODO(Codex-7A-③) 礦山避讓
    // 若 x 落在任一 mineZone [min, max] 內，往外推到 min-1 或 max+1：
    //   for (const [zMin, zMax] of mineZones) {
    //     if (x >= zMin && x <= zMax) {
    //       x = side > 0 ? zMax + 1 : zMin - 1;
    //     }
    //   }

    // 夾在地圖邊界內
    x = Math.max(0, Math.min(world.cols - 1, x));

    positions.push({ x, y });
  }
  return positions;
}
