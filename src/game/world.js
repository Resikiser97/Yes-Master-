/**
 * @file        world.js
 * @module      game（狀態/orchestration 層，非純邏輯、非渲染）
 * @summary     建立並持有 MVP 世界狀態（地圖/核心/兩深度層/鏡頭/玩家），供渲染層讀取
 * @exports     createWorld, coreCenterTile, focusCamera
 * @depends     config/gameConfig.js、src/logic/connectivity.js
 * @sourceOfTruth Docs/game-architecture-plan.md「核心地基系統」、game-design-plan.md「建築維度」
 * @version     v0.0.2.0
 *
 * 座標：tile (col x, row y)。x 0..widthTiles-1（左→右）；y 0..heightTiles-1（0=上、大=下）。
 * 兩深度層（Z）：dirt = 背景泥土地基（Set<"x,y">）；fore = 前景第二層方塊（Map<"x,y", blockKey>）。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { key } from '../logic/connectivity.js';

// 核心 2x2 佔的格：水平置中、底部貼地面（groundY 的上方兩列）
export function coreCells(cfg = GAME_CONFIG) {
  const cx = Math.floor(cfg.map.widthTiles / 2); // 160 → 80，核心佔 79,80
  const { groundY } = cfg.map;
  const cells = [];
  for (let x = cx - 1; x <= cx; x++) {
    for (let y = groundY - 2; y <= groundY - 1; y++) cells.push([x, y]);
  }
  return cells;
}

// 核心中心（tile 單位，給鏡頭/距離用）
export function coreCenterTile(cfg = GAME_CONFIG) {
  const cx = Math.floor(cfg.map.widthTiles / 2);
  return { x: cx, y: cfg.map.groundY - 1 };
}

export function createWorld(cfg = GAME_CONFIG) {
  const core = coreCells(cfg);
  const center = coreCenterTile(cfg);

  const world = {
    cfg,
    cols: cfg.map.widthTiles,
    rows: cfg.map.heightTiles,
    groundY: cfg.map.groundY,
    core,
    coreCenter: center,
    dirt: new Set(),        // 背景泥土地基
    fore: new Map(),        // 前景第二層方塊：key -> blockKey
    mines: {
      A: { cols: [15, 24], rows: [cfg.map.groundY - 3, cfg.map.groundY - 1] },
      B: { cols: [135, 144], rows: [cfg.map.groundY - 3, cfg.map.groundY - 1] },
    },
    player: { x: center.x + 2, y: cfg.map.groundY - 1, moveSpeed: cfg.player.moveSpeed }, // 出生在核心旁地面
    camera: { x: 0, y: 0 },
    clock: { elapsedSeconds: 0, fixedStepSeconds: cfg.time.fixedStepSeconds, updateTick: 0 },
    phase: 'prep', // prep | day | night | overtime | gameover
    stage: 0,
  };

  seedDemoStructure(world); // TODO(步驟3)：建造輸入接上後移除這段 demo
  focusCamera(world, center);
  return world;
}

// 暫時 demo：在核心周圍放一小段連通泥土 + 幾個前景方塊，讓兩層渲染可被肉眼驗證
function seedDemoStructure(world) {
  const { groundY } = world;
  const cx = Math.floor(world.cols / 2);
  const dirtCells = [
    [cx - 2, groundY - 1], [cx - 3, groundY - 1], [cx - 3, groundY - 2],
    [cx + 1, groundY - 1], [cx + 2, groundY - 1], [cx + 2, groundY - 2], [cx + 2, groundY - 3],
  ];
  for (const [x, y] of dirtCells) world.dirt.add(key(x, y));
  world.fore.set(key(cx + 2, groundY - 2), 'stone');
  world.fore.set(key(cx + 2, groundY - 3), 'iron');
  world.fore.set(key(cx - 3, groundY - 2), 'sand');
}

// 鏡頭聚焦某 tile，置中於視窗並夾在世界邊界內
export function focusCamera(world, focusTile) {
  const t = world.cfg.render.tilePx;
  const vw = world.cfg.map.viewportPx.width;
  const vh = world.cfg.map.viewportPx.height;
  const worldW = world.cols * t;
  const worldH = world.rows * t;
  const cx = focusTile.x * t - vw / 2;
  const cy = focusTile.y * t - vh / 2;
  world.camera.x = Math.max(0, Math.min(cx, Math.max(0, worldW - vw)));
  world.camera.y = Math.max(0, Math.min(cy, Math.max(0, worldH - vh)));
}
