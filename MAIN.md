# MAIN.md — 函式級參考

> 版本：v0.0.5.0
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ MVP 單機可動：移動/挖礦/背包/塔內資源/跟隨鏡頭/初版建造/核心數值回饋/核心 HP 與修復/核心戰鬥/正式波次晝夜/卡片選擇/localStorage 存檔/新手教學提示已成完整循環。
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
| `countPlacedBlocks(dirtCells, foreBlocks)` | 從背景泥土與前景方塊統計核心加成用方塊數（泥土也算 hp 加成） |
| `computeCoreStats(blockCounts, opts?)` | 方塊計數 → 核心六大數值（倍率讀 BLOCKS.bonus） |

### `src/logic/coreHealth.js`

| 函式 | 職責 |
|---|---|
| `clampCoreHp(current, hpMax)` | 將核心目前血量夾在 0..hpMax |
| `applyHpMaxDelta(current, delta, nextMax)` | hpMax 因建造/拆除變化時，同步調整目前 HP |
| `damageCoreHp(current, amount)` | 扣核心血量，不低於 0 |
| `repairPerSecond(repairPower)` | 修復能力換算每秒回血，無條件捨去到小數 2 位 |
| `repairCoreHp(current, hpMax, fatigue, dt, repairPower)` | 消耗疲勞修復核心，目前血量不超過 hpMax |

### `src/logic/connectivity.js`

| 函式 | 職責 |
|---|---|
| `key(x,y)` | 格座標 → "x,y" 字串 |
| `computeConnected(dirtCells, coreCells)` | BFS 找與核心連通的泥土格集合 |
| `canPlaceDirt(dirtCells, coreCells, x, y)` | 放置後須與核心連通 |
| `canRemoveDirt(dirtCells, coreCells, x, y)` | 拆除不得使原連通格孤立 |

### `src/logic/building.js`

| 函式 | 職責 |
|---|---|
| `blockLayer(blockKey, defs?)` | 查方塊位於背景泥土層或前景第二層 |
| `buildHalfWidth(stage, limits)` | 依關卡段落取得可建造水平半徑 |
| `validatePlacement(ctx, blockKey, x, y)` | 判定放置是否合法（reach/核心/地底/範圍/高度/連通/背板） |
| `validateRemoval(ctx, x, y)` | 判定拆除是否合法（前景優先；泥土不得斷開原連通地基） |

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

### `src/logic/mineGen.js`

| 函式 | 職責 |
|---|---|
| `weightedSample(weights, rng)` | 依權重表抽一個 block key |
| `createMine(mineCfg, rng)` | 生成礦山可見 colCount x rowCount 方塊 |
| `digMineCell(mine, col, row, rng)` | 挖出該格、上方下掉、最上層補新塊 |

### `src/logic/inventory.js`

| 函式 | 職責 |
|---|---|
| `blockWeight/inventoryWeight/distinctCount` | 重量與種類數計算 |
| `canAdd(inv, key, qty, {capacity,slots})` | 承重 + 格數雙重檢查 |
| `addItem/removeItem(inv, key, qty)` | 背包加/扣（回傳新物件） |
| `depositAll(inv, storage)` | 背包全倒入塔內資源欄 |

### `src/logic/mining.js`

| 函式 | 職責 |
|---|---|
| `hitsToBreak(blockKey, miningPower, defs?)` | 破塊敲擊數（梯子=Infinity 不可挖） |
| `durabilityToBreak(blockKey, defs?)` | 破塊所需總傷害 |
| `miningDamagePerSecond(miningPower, hitsPerSec)` | 每秒挖掘傷害 |
| `selectNearestMineCell(player, mines, reach)` | 選 reach 內離玩家最近的礦格 |

### `src/game/world.js`

| 函式 | 職責 |
|---|---|
| `coreCells(cfg?)` | 回傳核心 2x2 佔用格 |
| `coreCenterTile(cfg?)` | 回傳核心中心 tile 座標 |
| `createWorld(cfg?)` | 建立 MVP world 狀態（核心、目前 HP、地面、礦山方塊、背包、疲勞、塔內資源、初始包、玩家、核心數值快照、鏡頭、clock；demo 結構僅 debug gate 開啟時 seeded） |
| `focusCamera(world, focusTile)` | 鏡頭聚焦指定 tile 並夾在世界邊界內 |
| `updateCameraFollow(world, alpha?)` | 依插值後玩家位置居中跟隨（render 前每幀呼叫） |

### `src/game/actions.js`

| 函式 | 職責 |
|---|---|
| `updateMining(world, isMining, dt, cfg?)` | 長按鎖最近礦格、累積傷害破塊進背包（滿則設 full 旗標） |
| `tryDeposit(world)` | 站在連通泥土上 → 背包自動倒入塔內資源欄 |
| `tryPlace(world, blockKey, x, y, cfg?)` | 消耗塔內資源，放置背景泥土或前景方塊 |
| `tryRemove(world, x, y, cfg?)` | 拆除目標格，前景優先，材料退回塔內資源欄；拆土若會讓核心 HP 歸零則禁止 |
| `computeBuildPreview(world, blockKey, x, y, cfg?)` | 回傳 render 用建造預覽資料與合法性 |
| `damageCore(world, amount)` / `healCore(world, amount)` | 扣除 / 回復核心目前 HP（debug 與後續戰鬥共用） |
| `updateRepair(world, isRepairing, dt, cfg?)` | R 長按修復：站在核心或連通泥土地基上，消耗疲勞回復核心 |
| `applyDebugAction(world, action, cfg?)` | 開發 debug hotkeys：扣血、回血、補建材、生成敵人 |

### `src/game/coreSnapshot.js`

| 函式 | 職責 |
|---|---|
| `refreshCoreSnapshot(world)` | 從 world.dirt/world.fore 統計方塊並刷新 world.blockCounts / world.coreStats |

### `src/game/combatRuntime.js`

| 函式 | 職責 |
|---|---|
| `spawnDebugEnemies(world, count, enemyKey, cfg?)` | Debug 生成敵人到玩家附近，供核心戰鬥測試 |
| `updateEnemies(world, dt)` | Debug 敵人直線追逐玩家（暫不攻擊） |
| `coreAttackAnchors(world)` | 核心本體 + connected dirt 轉成核心攻擊覆蓋 anchor |
| `updateCoreCombat(world, dt, cfg?)` | 核心按 attackSpeed 普攻/連鎖命中範圍內敵人，死亡移除 |

### `src/game/gameLoop.js`

| 函式 | 職責 |
|---|---|
| `createGameLoop(options)` | 建立 fixed timestep loop；update 固定步進，render 跟螢幕 Hz 分離 |
| `startGameLoop(options)` | 建立並啟動 loop，回傳可 stop 的 loop 物件 |

### `src/storage/saveLocal.js`（IO 層）

| 函式 | 職責 |
|---|---|
| `loadSave()` / `writeSave(data)` / `clearSave()` | localStorage 讀寫；讀取跑 migration |

### `src/storage/saveManager.js`（IO 層）

| 函式 | 職責 |
|---|---|
| `saveWorld(world)` | 序列化 world（stage/storage/dirt/fore/player/coreHp/cardBonuses/cardModifiers/mines）並呼叫 writeSave；只在 phase=prep 時呼叫 |
| `loadWorld(cfg?)` | 呼叫 loadSave → migration → deserializeWorld；失敗或無存檔回傳 null |

### `src/render/renderer.js` `src/input/controls.js` `src/main.js`

| 函式 | 職責 |
|---|---|
| `Renderer.render(world)` | 畫地面/網格/礦山方塊/兩層方塊/核心/玩家(插值位置)/敵人小血條/建造預覽/核心 HP/疲勞/核心數值 HUD；整數像素平移；同步 debug dataset；`firstGame && tutorialTimer > 0` 時疊加教學提示框 |
| `Renderer._drawTutorialHint(world)` | 首次遊玩顯示黃色操作提示（prep/night 各顯不同文字，最後 1 秒依 tutorialTimer 淡出） |
| `Controls.attach/detach` | 綁/解 WASD/方向鍵、滑鼠長按挖礦、快捷列選材、左鍵放置、右鍵拆除、R 修復、debug hotkeys；canvas 自動 focus |
| `Controls.getMoveVector()` / `Controls.isMining()` / `Controls.getSelectedSlot()` / `Controls.isRepairing()` | 回傳移動向量 / 是否長按挖礦中 / 目前快捷列 / 是否長按修復 |
| `boot()` | 入口：掛角標/版本；loadWorld 優先，失敗 fallback createWorld；無存檔首次遊玩設 firstGame/tutorialTimer；初始化 render/input；啟動 fixed timestep loop；update 接移動/建造/debug/挖礦/修復/敵人追逐/核心戰鬥/卸貨/phase 轉 prep 自動存檔/tutorialTimer 遞減；render 前跑 updateCameraFollow |
