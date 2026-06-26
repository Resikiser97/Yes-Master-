/**
 * @file        building.js
 * @module      logic（pure）
 * @summary     建造放置/拆除合法性判定（reach + 分段範圍 + 高度 + 連通性 + 兩層規則），純函式
 * @exports     blockLayer, buildHalfWidth, validatePlacement, validateRemoval
 * @depends     config/blocks.js、src/logic/connectivity.js
 * @sourceOfTruth Docs/game-architecture-plan.md「核心地基系統」、Docs/waveplan.md「建造範圍」
 * @version     v0.0.14.0
 *
 * 兩層（Z）：dirt = 背景泥土（第一層地基）；fore = 前景第二層方塊（蓋在連通泥土前方）。
 * 純函式：只讀傳入的 dirt/fore/core 等資料判斷，不碰 DOM/world 狀態。
 */

import { BLOCKS } from '../../config/blocks.js';
import { computeConnected, canPlaceDirt, canRemoveDirt, key } from './connectivity.js';

export function blockLayer(blockKey, defs = BLOCKS) {
  return defs[blockKey]?.layer;
}

// 依目前關卡取水平半徑上限（分段建造範圍）
export function buildHalfWidth(stage, limits) {
  for (const seg of limits.horizontalByStage) {
    if (stage <= seg.maxStage) return seg.halfWidthTiles;
  }
  return limits.horizontalByStage[limits.horizontalByStage.length - 1].halfWidthTiles;
}

function outOfReach(ctx, x, y) {
  if (!ctx.player || ctx.reach == null) return false;
  return Math.hypot(x - ctx.player.x, y - ctx.player.y) > ctx.reach;
}

/**
 * 放置合法性。
 * ctx: { dirt:Set, fore:Map, core:[[x,y]], coreCenter:{x,y}, groundY, stage, limits, player?, reach?, defs? }
 * @returns {{ ok:boolean, reason?:string, layer?:string }}
 */
export function validatePlacement(ctx, blockKey, x, y) {
  const { dirt, fore, core, coreCenter, groundY, stage, limits, defs = BLOCKS } = ctx;
  const layer = blockLayer(blockKey, defs);
  if (!layer) return { ok: false, reason: 'unknown_block' };

  if (outOfReach(ctx, x, y)) return { ok: false, reason: 'out_of_reach' };
  if (core.some(([cx, cy]) => cx === x && cy === y)) return { ok: false, reason: 'on_core' };
  if (y >= groundY) return { ok: false, reason: 'underground' };              // 地面以下不可蓋
  if (Math.abs(x - coreCenter.x) > buildHalfWidth(stage, limits)) return { ok: false, reason: 'out_of_range' };
  if ((groundY - 1) - y >= limits.heightMaxTiles) return { ok: false, reason: 'too_high' };

  if (layer === 'background') {
    if (dirt.has(key(x, y))) return { ok: false, reason: 'occupied' };
    if (!canPlaceDirt(dirt, core, x, y)) return { ok: false, reason: 'not_connected' };
  } else {
    if (fore.has(key(x, y))) return { ok: false, reason: 'occupied' };
    if (!computeConnected(dirt, core).has(key(x, y))) return { ok: false, reason: 'no_dirt_backing' };
  }
  return { ok: true, layer };
}

/**
 * 拆除合法性。前景優先（覆蓋在前），其次背景泥土。
 * ctx: { dirt:Set, fore:Map, core:[[x,y]], player?, reach? }
 * @returns {{ ok:boolean, reason?:string, blockKey?:string, layer?:string }}
 */
export function validateRemoval(ctx, x, y) {
  const { dirt, fore, core } = ctx;
  if (outOfReach(ctx, x, y)) return { ok: false, reason: 'out_of_reach' };
  const k = key(x, y);
  if (fore.has(k)) return { ok: true, blockKey: fore.get(k), layer: 'foreground' };
  if (dirt.has(k)) {
    if (!canRemoveDirt(dirt, core, x, y)) return { ok: false, reason: 'would_disconnect' };
    return { ok: true, blockKey: 'dirt', layer: 'background' };
  }
  return { ok: false, reason: 'nothing_here' };
}

