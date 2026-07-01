/**
 * @file        gameConfig.js
 * @module      config
 * @summary     全域遊戲設定與專案版本號（單一數值來源，遵守 Magic Number 禁令）
 * @exports     GAME_CONFIG
 * @depends     （無）
 * @sourceOfTruth Docs/game-design-plan.md、Docs/game-architecture-plan.md、Docs/waveplan.md
 * @version     v0.0.32.0
 */

export const GAME_CONFIG = {
  // 版本同步點之一（見 .claude/instructions.md 版本號同步鐵則）
  version: 'v0.0.32.0',

  // MVP 模式角標（單人 / 多人），方便錄影分辨測試版本
  mode: 'single', // 'single' | 'multi'

  // 除錯開關（開發階段可開；正式遊戲一律關閉）
  debug: {
    seedDemoStructure: false, // 開局塞 demo 泥土/方塊（已接建造後關閉，避免右鍵拆 demo 退免費材料）
    enabled: true,
    hotkeys: true,            // H/J/K/L/P/C/N/Q/X/T debug 操作（T=暫停/恢復）
    damageAmount: 10,
    healAmount: 10,
    resourceGrant: { dirt: 10, sand: 10, stone: 10 },
    enemySpawnDistanceTiles: 8,
  },

  // 地圖（1600x1000px，10px/格 → 160x100 格）
  map: {
    pxPerTile: 10,
    widthPx: 1600,
    heightPx: 1000,
    widthTiles: 160,
    heightTiles: 100,
    viewportPx: { width: 800, height: 600 }, // 視窗 < 地圖 → 需鏡頭捲動
    groundY: 92,        // 地面表層列（row >= groundY 為地底實土）；核心貼此地面而坐
  },

  // 渲染（純呈現；設定頁未來可調 UI/地圖縮放）
  render: {
    tilePx: 16,         // 螢幕每格像素（含縮放）
    showGrid: true,
  },

  // 鏡頭跟隨（純呈現；只影響 world.camera，不影響 gameplay 位置）
  camera: {
    deadzonePx: { x: 80, y: 60 }, // 玩家在畫面中央此半寬/半高內移動，鏡頭不追
    followSharpness: 10,          // 平滑銳度：每幀 1-exp(-sharpness*dt)，越大越快貼上
    snapToPixel: true,            // render 時整數像素對齊（可切換測試 pixel art 抖動取捨）
  },

  // 塔內資源欄快捷列：快捷鍵 1~9 對應方塊，0 = 背包（見 game-design-plan「塔內資源欄」）
  // index 0~8 = 鍵 1~9（方塊），index 9 = 鍵 0（⚙️ 背包）；null = 空格或特殊按鈕
  hotbar: ['sand', 'dirt', 'stone', 'iron', 'gold', 'glass', 'diamond', 'ladder', null, null],

  // 遊戲時間步進：遊戲進程固定更新，避免螢幕 Hz 越高進程越快
  time: {
    fixedStepSeconds: 1 / 60,
    maxFrameDeltaSeconds: 0.25, // 分頁卡住/切回時最多補 0.25 秒，避免一次追太多步
  },

  // 晝夜節奏（秒）。流程：prep(30s) → day(60s) → night(60s) → [overtime] → waveClear → prep...
  phases: {
    prepSeconds: 30,        // 開局/卡片後準備
    daySeconds: 60,         // 白天（可建造/挖礦，無敵人）
    nightSeconds: 60,       // 晚上固定 60 秒
    overtimeSeconds: 30,    // 加時賽 30 秒
    overtimeDoubleEvery: 5, // 加時每 5 秒攻擊力 x2（5=x2…30=x64）
    // 加時 30 秒結束仍未清完怪 → 強制 GameOver（定案，見 game-design-plan.md）
    overtimeFailIsGameOver: true,
  },

  // 核心建築基礎數值（公式：見 coreStats.js / game-design-plan.md）
  core: {
    size: { w: 2, h: 2, depth: 2 }, // 2x2x2，正面 2x2 面對玩家，貼地置中
    base: {
      attack: 5,
      attackSpeed: 1,   // 次/秒
      hp: 50,
      defense: 0,
      range: 50,        // px（50 = 5 格）
      magicPct: 0,      // 魔法傷害 %（穿透防禦）
      chain: 0,         // 連鎖人數
    },
    // 防禦減傷公式係數：reduction = N / (defenseK + N)
    defenseK: 100,
    // 高塔工法：高於地面此格數以上的前景方塊才吃高度加成
    heightBonusAboveGroundTiles: 50,
  },

  // 玩家（哥布林）基礎六數值
  player: {
    mining: 10,        // 挖掘能力（每下傷害；次數上限由輸入方式決定）
    fatigue: 60,       // 疲勞值（恢復量=當前值；上限固定 120）
    fatigueMax: 120,
    spirit: 50,        // 靈動（每 100 點核心攻擊/攻速 +10%；單人額外固定 +15%）
    spiritSinglePlayerBonusPct: 15,
    carry: 50,         // 背負（承重上限）
    backpackSlots: 6,  // 背包格數（2x3，依方塊種類堆疊）
    repair: 50,        // 修復（每秒回血 = 值/60，無條件捨去到小數 2 位；每秒耗 1 疲勞）
    miningFatigueCost: 5, // 每挖出一塊礦石消耗的疲勞值
    moveSpeed: 50,     // 移動能力值；基準 50 = 5 格/秒
    moveSpeedPerTilePerSecond: 10, // 格/秒 = moveSpeed / 10
    // 挖礦輸入次數上限（與挖掘數值無關）
    mineClicksPerSec: { click: 10, hold: 10 },
  },

  // 技能點：每點 +10%，最高 10 級
  skill: { perLevelPct: 10, maxLevel: 10 },

  // 分段建造範圍（核心中心往左/右最多格數；高度上限）
  buildLimits: {
    heightMaxTiles: 100,
    // 依「目前關卡數」決定水平上限（見 waveplan.md 建造範圍）
    horizontalByStage: [
      { maxStage: 10, halfWidthTiles: 14 },
      { maxStage: 20, halfWidthTiles: 20 },
      { maxStage: 30, halfWidthTiles: 27 },
      { maxStage: Infinity, halfWidthTiles: 35 },
    ],
    placeReachTiles: 2, // 挖礦：玩家與目標格互動距離上限
    buildReachTiles: 3, // 建造/拆除：玩家與目標格互動距離上限
  },

  // 網路設定（多人連線用）
  net: {
    supabaseUrl: 'https://mezidygnycqtlinoeyml.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lemlkeWdueWNxdGxpbm9leW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzODk3NDMsImV4cCI6MjA5Nzk2NTc0M30.zYtblFee5kPKOO-1vqKmkeo5-s06ULbRVusneKz8m0c',
    peerJsHost: '0.peerjs.com',
    peerJsPort: 443,
    peerJsSecure: true,
    iceServers: [
      { urls: 'stun:openrelay.metered.ca:80' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'TURN_USERNAME', credential: 'TURN_CREDENTIAL' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'TURN_USERNAME', credential: 'TURN_CREDENTIAL' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'TURN_USERNAME', credential: 'TURN_CREDENTIAL' },
    ],
  },

  // 多人波次倍率（MVP）
  multiplayer: {
    normalCountMultiplierPerPlayer: 1, // N 人 = 普通怪 xN
    bossCountEqualsPlayers: true,      // N 人 = N 隻 Boss
    fourPlayerNormalHpBonusPct: 20,    // 4 人房普通怪血量 +20%（Boss 不吃）
  },

  // 掉落物
  drops: {
    pickupReachTiles: 1, // 玩家與掉落物的自動撿取距離（Chebyshev，1 = 相鄰格即撿）
    maxStacks: 128,      // 地面掉落物 stack 上限；滿時停止出塊
  },

  // localStorage 存檔
  save: {
    schemaVersion: 1,
    storageKey: 'yesmaster.save.v1',
  },
};
