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
import { MINES, MINE_SEED, INITIAL_RESOURCE_PACK } from '../../config/mines.js';
import { key } from '../logic/connectivity.js';
import { createRng } from '../logic/rng.js';
import { createMine } from '../logic/mineGen.js';

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
  const mineRng = createRng(MINE_SEED);
  const gy = cfg.map.groundY;

  const world = {
    cfg,
    cols: cfg.map.widthTiles,
    rows: cfg.map.heightTiles,
    groundY: gy,
    core,
    coreCenter: center,
    dirt: new Set(),        // 背景泥土地基
    fore: new Map(),        // 前景第二層方塊：key -> blockKey
    mines: {
      // cols/rows = 可見格在世界中的範圍；mine.columns = 實際方塊（mineGen 生成）
      A: { cols: [15, 24], rows: [gy - 3, gy - 1], mine: createMine(MINES.A, mineRng) },
      B: { cols: [135, 144], rows: [gy - 3, gy - 1], mine: createMine(MINES.B, mineRng) },
    },
    player: {
      x: center.x + 2, y: gy - 1, moveSpeed: cfg.player.moveSpeed,
      prevX: center.x + 2, prevY: gy - 1,  // 上一固定步位置（渲染插值用）
      renderX: center.x + 2, renderY: gy - 1, // 插值後的繪製位置（render 讀）
      inventory: {},                       // 背包：{ blockKey: qty }
      capacity: cfg.player.carry,          // 承重上限
      slots: cfg.player.backpackSlots,     // 格數上限
    },
    storage: {},             // 塔內共享資源欄：{ blockKey: qty }
    mining: { targetKey: null, damage: 0, full: false }, // 當前挖礦目標、累積傷害、背包滿旗標
    mineRng,                 // 續用同一隨機流做補位（可重現）
    camera: { x: 0, y: 0 },
    clock: { elapsedSeconds: 0, fixedStepSeconds: cfg.time.fixedStepSeconds, updateTick: 0 },
    phase: 'prep', // prep | day | night | overtime | gameover
    stage: 0,
  };

  // 第 0 關初始資源包：直接入塔內共享資源欄（shared、不依人數放大、只給一次）
  for (const [k, qty] of Object.entries(INITIAL_RESOURCE_PACK.items)) {
    world.storage[k] = (world.storage[k] ?? 0) + qty;
  }

  seedDemoStructure(world); // TODO(步驟4)：建造輸入接上後移除這段 demo 泥土
  focusCamera(world, world.player); // 開場鏡頭對準玩家
  return world;
}

// 每幀（render 前）依插值後的玩家位置更新鏡頭：smooth 跟隨 + 邊界夾取
// alpha ∈ [0,1] 來自 gameLoop（固定步進累積比例），用於補間上一步與這一步之間
export function updateCameraFollow(world, alpha = 1) {
  const p = world.player;
  const px = p.prevX ?? p.x;
  const py = p.prevY ?? p.y;
  p.renderX = px + (p.x - px) * alpha;
  p.renderY = py + (p.y - py) * alpha;
  focusCamera(world, { x: p.renderX, y: p.renderY });
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
