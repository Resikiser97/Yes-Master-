/**
 * @file        world.js
 * @module      game（狀態/orchestration 層，非純邏輯、非渲染）
 * @summary     建立並持有 MVP 世界狀態（地圖/核心/兩深度層/核心數值/鏡頭/玩家），供渲染層讀取
 * @exports     DEFAULT_PLAYER_ID, coreCells, coreCenterTile, createPlayerState, attachPlayerAlias, ensurePlayer, playerCount, createSessionId, createWorld, updateCameraFollow, focusCamera
 * @depends     config/gameConfig.js、config/mines.js、src/game/coreSnapshot.js、src/logic/connectivity.js、src/logic/rng.js、src/logic/mineGen.js
 * @sourceOfTruth Docs/game-architecture-plan.md「核心地基系統」、game-design-plan.md「建築維度」
 * @version     v0.0.28.0
 *
 * 座標：tile (col x, row y)。x 0..widthTiles-1（左→右）；y 0..heightTiles-1（0=上、大=下）。
 * 兩深度層（Z）：dirt = 背景泥土地基（Set<"x,y">）；fore = 前景第二層方塊（Map<"x,y", blockKey>）。
 */

import { GAME_CONFIG } from '../../config/gameConfig.js';
import { MINES, MINE_SEED, INITIAL_RESOURCE_PACK } from '../../config/mines.js';
import { key } from '../logic/connectivity.js';
import { createRng } from '../logic/rng.js';
import { createMine } from '../logic/mineGen.js';
import { refreshCoreSnapshot } from './coreSnapshot.js';

export const DEFAULT_PLAYER_ID = 'p1';

export function createSessionId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

export function createPlayerState(id = DEFAULT_PLAYER_ID, cfg = GAME_CONFIG, pos = null) {
  const center = coreCenterTile(cfg);
  const x = pos?.x ?? center.x + 2;
  const y = pos?.y ?? cfg.map.groundY - 1;
  return {
    id,
    x, y, moveSpeed: cfg.player.moveSpeed,
    prevX: x, prevY: y,
    renderX: x, renderY: y,
    inventory: {},
    capacity: cfg.player.carry,
    slots: cfg.player.backpackSlots,
    fatigue: cfg.player.fatigue,
    online: true,
    intent: null,
    intentAt: 0,
    intentManual: false,
  };
}

export function attachPlayerAlias(world) {
  if (!world || Object.getOwnPropertyDescriptor(world, 'player')?.get) return world;
  Object.defineProperty(world, 'player', {
    enumerable: true,
    configurable: true,
    get() {
      return this.players?.get(this.localPlayerId) ?? this.players?.values?.().next?.().value ?? null;
    },
    set(nextPlayer) {
      const id = nextPlayer?.id ?? this.localPlayerId ?? DEFAULT_PLAYER_ID;
      this.localPlayerId = id;
      if (!this.players) this.players = new Map();
      this.players.set(id, { ...nextPlayer, id });
    },
  });
  return world;
}

export function ensurePlayer(world, playerId = world?.localPlayerId ?? DEFAULT_PLAYER_ID, cfg = GAME_CONFIG) {
  if (!world.players) world.players = new Map();
  if (!world.players.has(playerId)) {
    const offset = Math.min(6, world.players.size * 2);
    world.players.set(playerId, createPlayerState(playerId, cfg, {
      x: world.coreCenter.x + 2 + offset,
      y: world.groundY - 1,
    }));
  }
  attachPlayerAlias(world);
  return world.players.get(playerId);
}

export function playerCount(world) {
  return Math.max(1, world?.players?.size ?? 1);
}

export function createWorld(cfg = GAME_CONFIG) {
  const core = coreCells(cfg);
  const center = coreCenterTile(cfg);
  const mineRng = createRng(MINE_SEED);
  const gy = cfg.map.groundY;
  const localPlayerId = DEFAULT_PLAYER_ID;
  const players = new Map([[localPlayerId, createPlayerState(localPlayerId, cfg)]]);

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
    localPlayerId,
    players,
    playerRuntime: {},
    storage: {},             // 塔內共享資源欄：{ blockKey: qty }
    blockCounts: {},         // 已放置方塊數量快照：{ dirt, sand, ... }
    coreStats: null,         // 核心當前數值快照（由 coreStats.js 計算）
    coreHp: null,            // 核心目前血量；hpMax 由 coreStats.hpMax 給
    enemies: [],             // debug / 後續波次敵人
    combat: { attackCooldown: 0, lastHits: [], lastHitTimer: 0, nextEnemyId: 0, rng: createRng(MINE_SEED + 600),
              overtimeMultiplier: 1 },
    phaseTimer: cfg.phases.prepSeconds, // 當前 phase 剩餘秒數（prep=30s / night=60s / overtime=30s）
    nightElapsed: 0,                    // 本夜已過秒數（出怪分批用）
    pendingSpawns: [],                  // [{atSecond:N, defs:[{...enemy+x,y}]}]（由 phaseRuntime 填入）
    mining: { targetKey: null, damage: 0, full: false, dropFull: false }, // 當前挖礦目標、累積傷害、背包滿/地面滿旗標
    mineProgress: {},  // 礦格已累積傷害存檔：targetKey → damage（停手/換格時寫入）
    repair: { active: false, canRepair: false, reason: null, healed: 0 },
    mineRng,                 // 續用同一隨機流做補位（可重現）
    camera: { x: 0, y: 0 },
    clock: { elapsedSeconds: 0, fixedStepSeconds: cfg.time.fixedStepSeconds, updateTick: 0 },
    syncTick: 0,
    pendingCardOffer: null,  // generateOffer() 結果（phase='cardOffer' 時非 null）
    cardBonuses: {},         // 累積卡片 coreStat 加值 → computeCoreStats opts.cardAdd
    cardModifiers: [],       // 流派型修飾器列表 [{ stat, pct?, add? }]
    phase: 'prep', // prep | night | overtime | gameover | cardOffer
    stage: 0,
    sessionId: createSessionId(),
    firstGame: false,  // 無存檔首次遊玩 → 顯示新手提示
    tutorialTimer: 0,  // 提示剩餘秒數（> 0 時顯示）
    drops: [],         // 掉落物列表 [{ blockKey, x, y, qty }]（背包滿時溢出，同格同物品合併 qty）
    vfx: { timer: 0, bolts: [] }, // 視覺特效：攻擊閃電（攻擊時固定生成路徑，renderer 只負責繪製）
    hotbarTooltip: { blockKey: null, timer: 0 }, // 快捷列切換方塊時短暫顯示的 tooltip
    cardHoverIndex: null, // 卡片面板滑鼠懸停索引（null | 0 | 1 | 2）
    buildPlanMode: false, // B 鍵切換：站在核心地基上時開啟，無距離限制+拖拽建造
    buildDestroyMode: false, // 拆除子模式：選材料後拖拽只拆該種方塊
    buildPlanDrag: null,  // { startX, startY, endX, endY } 拖拽矩形（tile 座標）
    showDebug: false,  // ` 鍵切換 debug 浮層（不影響遊戲進程）
    debugPaused: false, // T debug 暫停：停止 gameplay update，但保留 render/input 方便恢復
    testMode: false,   // 由 splash 傳入；true = 測試難度 1~30
    uiState: {
      playerExpanded: false,
      backpackExpanded: true,
      coreExpanded: false,
    },
    uiHitRects: [],
  };
  attachPlayerAlias(world);

  // 第 0 關初始資源包：直接入塔內共享資源欄（shared、不依人數放大、只給一次）
  for (const [k, qty] of Object.entries(INITIAL_RESOURCE_PACK.items)) {
    world.storage[k] = (world.storage[k] ?? 0) + qty;
  }

  if (cfg.debug?.seedDemoStructure) seedDemoStructure(world); // 預設關；建造已接，避免右鍵拆 demo 退免費材料
  refreshCoreSnapshot(world);
  focusCamera(world, world.player); // 開場鏡頭對準玩家
  return world;
}

// 每幀（render 前）更新鏡頭：插值玩家位置 → deadzone → 指數平滑 → 邊界夾取
// alpha ∈ [0,1]（固定步進累積比例，補間上一步與這一步）；dt = 真實 frame 秒數（平滑用）
// 純呈現：只改 world.camera / player.renderX/Y，不碰任何 gameplay 位置（p.x/p.y 不變）
export function updateCameraFollow(world, alpha = 1, dt = 0) {
  const cfg = world.cfg;
  const t = cfg.render.tilePx;
  const cc = cfg.camera;
  const cam = world.camera;
  const p = world.player;
  if (!p) return;

  // 插值後的玩家繪製位置（render 讀）
  for (const player of world.players?.values?.() ?? [p]) {
    const px = player.prevX ?? player.x;
    const py = player.prevY ?? player.y;
    player.renderX = px + (player.x - px) * alpha;
    player.renderY = py + (player.y - py) * alpha;
  }

  // deadzone：玩家在畫面中央 deadzone 框內移動時鏡頭不追，超出才推 target
  const playerPxX = p.renderX * t + t / 2;
  const playerPxY = p.renderY * t + t / 2;
  const targetX = deadzoneTarget(cam.x, playerPxX, cfg.map.viewportPx.width, cc.deadzonePx.x);
  const targetY = deadzoneTarget(cam.y, playerPxY, cfg.map.viewportPx.height, cc.deadzonePx.y);

  // 指數平滑（frame-rate independent）；dt=0（初始/直接呼叫）→ 直接貼上 target
  const k = dt > 0 ? 1 - Math.exp(-cc.followSharpness * dt) : 1;
  cam.x += (targetX - cam.x) * k;
  cam.y += (targetY - cam.y) * k;

  clampCamera(world);
}

// 玩家螢幕位置超出中央 deadzone 才回傳新的鏡頭 target，否則維持原位（鏡頭不動）
function deadzoneTarget(camPos, playerPx, viewSize, halfDead) {
  const screen = playerPx - camPos; // 玩家在畫面上的座標
  const center = viewSize / 2;
  if (screen < center - halfDead) return playerPx - (center - halfDead);
  if (screen > center + halfDead) return playerPx - (center + halfDead);
  return camPos;
}

// 鏡頭夾在世界邊界內（到邊緣就停，不露出地圖外）
function clampCamera(world) {
  const t = world.cfg.render.tilePx;
  const maxX = Math.max(0, world.cols * t - world.cfg.map.viewportPx.width);
  const maxY = Math.max(0, world.rows * t - world.cfg.map.viewportPx.height);
  world.camera.x = Math.max(0, Math.min(world.camera.x, maxX));
  world.camera.y = Math.max(0, Math.min(world.camera.y, maxY));
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
