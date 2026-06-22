# MAIN.md — 函式級參考

> 版本：v0.0.2.0
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ MVP 單機骨架已開工；純邏輯層完成，畫面骨架 + fixed timestep + WASD/方向鍵移動已接。
> 規則：新增 / 刪除函式必須同步本檔（見 `.claude/instructions.md` 開發鐵則）。
>
> 註：原本的「planning 進入點 / source map」已移至 `Docs/source-map.md`。
> 規劃決策總索引：`Docs/planning-dashboard.md`。

---

## 1. 模組載入順序

```
index.html (type=module)
  └─ src/main.js  boot()  ← DOMContentLoaded 或 module late-load 後立即觸發
       ├─ config/gameConfig.js（角標/版本）
       ├─ src/game/world.js      createWorld()
       ├─ src/game/gameLoop.js   startGameLoop()
       ├─ src/render/renderer.js  new Renderer(canvas)
       ├─ src/input/controls.js   new Controls(canvas)
       └─ src/logic/playerMovement.js（固定 timestep 移動）
純邏輯層（src/logic/*）為無副作用模組，由各層按需 import，無全域初始化順序需求。
config/* 為靜態資料，被 logic 層 import。
```

---

## 2. 各模組函式列表與職責

> 純邏輯層（pure）：輸入資料 → 回傳結果，無 DOM/隨機/時間副作用（隨機/時間注入）。

### `src/logic/rng.js`

| 函式 | 職責 |
|---|---|
| `createRng(seed)` | 回傳 seeded RNG（next/int/pct/pick/bernoulli），可重現 |

### `src/logic/damageDefense.js`

| 函式 | 職責 |
|---|---|
| `defenseReduction(defense, k?)` | 減傷% = N/(K+N) |
| `computeDamage(attacker, target, k?)` | 物理(受防禦)+魔法(無視防禦)合算 |

### `src/logic/coreStats.js`

| 函式 | 職責 |
|---|---|
| `computeCoreStats(blockCounts, opts?)` | 方塊計數 → 核心六大數值（倍率讀 BLOCKS.bonus） |

### `src/logic/connectivity.js`

| 函式 | 職責 |
|---|---|
| `key(x,y)` | 格座標 → "x,y" 字串 |
| `computeConnected(dirtCells, coreCells)` | BFS 找與核心連通的泥土格集合 |
| `canPlaceDirt(dirtCells, coreCells, x, y)` | 放置後須與核心連通 |
| `canRemoveDirt(dirtCells, coreCells, x, y)` | 拆除不得使原連通格孤立 |

### `src/logic/combat.js`

| 函式 | 職責 |
|---|---|
| `dist2(a,b)` | 平方距離 |
| `selectPrimaryTarget(enemiesInRange, coreCenter)` | 普攻鎖最近核心目標 |
| `chainHitCount(chain, rng)` | 連鎖命中數=整數+小數機率 |
| `selectChainTargets(primary, others, count)` | 以主目標為中心取最近 N、不重複、用盡可重啟 |
| `computeHit(coreStats, target, k?)` | 單次命中傷害（委派 damageDefense） |

### `src/logic/waveGen.js`

| 函式 | 職責 |
|---|---|
| `hpGrowthMultiplier(stage)` | 普通怪血量成長倍率 |
| `flatAttackAdd(stage, enemyKey)` | 跑者/工兵攻擊加法成長 |
| `buildSpawnSchedule(total)` | 0~5 秒分批出怪 |
| `buildWave(stage, playerCount, rng)` | 產生整關敵人實例（含倍率/成長/阻擋區增壓） |

### `src/logic/cardOffer.js`

| 函式 | 職責 |
|---|---|
| `generateOffer(rng, bossStage?, pool?)` | 固定 3 槽位出卡（類型保護/偏強上限/去重） |

### `src/logic/migration.js`

| 函式 | 職責 |
|---|---|
| `needsMigration(data)` | 是否需升版 |
| `migrate(data)` | idempotent migration chain；新版存檔拒讀 |

### `src/logic/playerMovement.js`

| 函式 | 職責 |
|---|---|
| `moveSpeedToTilesPerSecond(moveSpeed, cfg?)` | 移動能力值換算；基準 50 = 5 格/秒 |
| `normalizeMoveInput(input)` | WASD/方向鍵向量正規化，避免斜走比直走快 |
| `movePlayer(player, input, dt, bounds, cfg?)` | 固定 timestep 位移並夾在地圖邊界內 |

### `src/game/world.js`

| 函式 | 職責 |
|---|---|
| `coreCells(cfg?)` | 回傳核心 2x2 佔用格 |
| `coreCenterTile(cfg?)` | 回傳核心中心 tile 座標 |
| `createWorld(cfg?)` | 建立 MVP world 狀態（核心、地面、礦山、demo 兩層方塊、玩家、鏡頭、clock） |
| `focusCamera(world, focusTile)` | 鏡頭聚焦指定 tile 並夾在世界邊界內 |

### `src/game/gameLoop.js`

| 函式 | 職責 |
|---|---|
| `createGameLoop(options)` | 建立 fixed timestep loop；update 固定步進，render 跟螢幕 Hz 分離 |
| `startGameLoop(options)` | 建立並啟動 loop，回傳可 stop 的 loop 物件 |

### `src/storage/saveLocal.js`（IO 層）

| 函式 | 職責 |
|---|---|
| `loadSave()` / `writeSave(data)` / `clearSave()` | localStorage 讀寫；讀取跑 migration |

### `src/render/renderer.js` `src/input/controls.js` `src/main.js`

| 函式 | 職責 |
|---|---|
| `Renderer.render(world)` | 畫地面、網格、礦山、背景泥土、前景方塊、核心、玩家；同步 canvas debug dataset |
| `Controls.attach/detach` | 綁/解 WASD 與方向鍵；canvas 自動 focus |
| `Controls.getMoveVector()` | 回傳目前移動向量 |
| `boot()` | 入口：掛角標/版本、建 world、初始化 render/input、啟動 fixed timestep loop |
