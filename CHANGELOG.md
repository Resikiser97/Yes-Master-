# CHANGELOG.md — 版本歷史

> 版本：v0.0.8.0
> 類型：**只增不改**（歷史紀錄，永遠往上加，最新在最上方，不回頭改舊條目）。
> 條目格式：`## vX.Y.Z.W - YYYY-MM-DD`，下分「新增 / 修復 / 調整」。

---

## v0.0.8.0 - 2026-06-24

### 新增
- **Step 12A 動態 Canvas 縮放**：
  - `src/ui/mobileLayout.js`（新檔）：`computeTilePx / applyTilePx / isTouchDevice / getSavedInputMode / saveInputMode / setupOrientationGuard`；首次呼叫快取 baseViewCols/baseViewRows 避免 resize 後漂移；`visualViewport` + `window resize` 雙監聽；直向偵測遮罩（z-index 9998）。
  - `src/render/renderer.js`：新增 `resize(cfg)` 方法，視窗縮放後重設 canvas 尺寸。
  - `src/main.js`：renderer / controls 移至 splash callback 內（需 inputMode 才能選類型）；`applyTilePx` 初始化；掛 resize 監聽；touch 模式每幀把 `controls.mouse` 同步玩家位置供 build preview。
- **Step 12B 觸控輸入層**：
  - `src/input/touchControls.js`（新檔）：`TouchControls` class，public 介面與 `Controls` 完全相容；HTML overlay（z-index 200）；8 方向 D-pad（3×3，中心空）、挖礦/修復長按、放置/拆除 tap、快捷列 1~7、canvas `touchstart` 卡片選擇偵測（座標按 canvas scale 換算）。
- **Step 12C 手機 overlay 與直向守衛**：`setupOrientationGuard` 直向時顯示「請轉橫向遊玩」全螢幕遮罩（只在 touch 模式呼叫）。
- **Step 12D Debug 按鈕整合**：
  - `src/input/touchControls.js`：`debug.hotkeys=true` 時 `attach()` 建立 HTML debug 面板（`#debug-panel-touch`），H/J/K/L/P/C/N/Q/X 九個 tap 按鈕（透過 `window.__YES_MASTER__` 取 world/config）。
  - `src/main.js`：keyboard + touch 兩模式都在右上角加 `⚙` 固定按鈕（z-index 300），click → toggle `world.showDebug` + HTML debug 面板。
- **Splash 輸入模式選擇**（`src/ui/splash.js`）：第二排按鈕「⌨ 電腦鍵盤 / 📱 手機觸控」；auto-detect 預設；選中金色高亮；callback 改為 `onStart(diffMode, inputMode)`；儲存至 `localStorage yesmaster.inputMode`（不進遊戲存檔）。
- **index.html 響應式**：移除 `width:800px; height:600px` 硬碼；canvas 尺寸全交 JS 控制；viewport 增 `maximum-scale=1, user-scalable=no`；body 加 `overflow:hidden`。

## v0.0.7.2 - 2026-06-24

### 新增
- **挖礦進度持久化**：
  - `src/game/world.js`：新增 `mineProgress: {}`，以 targetKey 為 key 存每格的累積傷害。
  - `src/game/actions.js`：`updateMining` 停手/換格時把 `m.damage` 存入 `mineProgress`；切回同一格時恢復；方塊破掉後清除該格記憶。玩家可以打 5 下走掉，下次只需再打剩餘傷害即可出塊。
  - `src/storage/saveManager.js`：`mineProgress` 加入序列化/反序列化（關閉遊戲後進度不丟失）。
- **Debug overlay 加挖礦資訊**：
  - `src/render/renderer.js`：`_drawDebugOverlay` 新增兩行：`挖礦: Xpwr × Y/s = Zdps` 和 `礦格: 當前進度/耐久 (記憶格N)`；panel 寬度從 192→210 容納新行。

## v0.0.7.1 - 2026-06-24

### 新增
- **Step 11A HUD 左右分欄（Codex）**：
  - `src/render/renderer.js`：`_drawHud` 改為左右雙欄佈局；左欄：核心 HP/ATK/攻速/DEF、範圍/魔法/連鎖、背包、塔內資源、已放置方塊；右欄：phase/計時、操作提示、疲勞/修復、敵人/命中、狀態行（背包滿/修復中/修復失敗）；中間加細分隔線；高度由 ~160px 縮至 ~86px；lineH 改 14px。

## v0.0.7.0 - 2026-06-24

### 新增
- **Step 11B Debug 浮層**：
  - `src/game/world.js`：`createWorld` 新增 `showDebug: false`、`testMode: false`。
  - `src/render/renderer.js`：新增 `_drawDebugOverlay(world)`，半透明金邊浮層疊在畫布右上角，顯示 debug hotkeys + tick/phase/drops/enemies/coreHp 即時數值；從 `render()` 在 `world.showDebug` 為 true 時呼叫；同時移除 HUD 底部的 DEBUG 熱鍵提示行。
  - `src/main.js`：在 debug.hotkeys 模式下，` 鍵（Backquote）切換 `world.showDebug`；X 鍵改傳 `cfg.save.storageKey` 給 `clearSave`。
- **Step 11C 測試難度 preset**：
  - `config/testPreset.js`（新檔）：`TEST_PRESET_SAVE_KEY = 'yesmaster.save.test.v1'`；`buildTestConfig(base)` 回傳以 base 為底的測試 config（phases.prepSeconds=15、nightSeconds=45、overtimeSeconds=20；`_testInit` 提供初始強化）。
  - `src/ui/splash.js`：點擊任意處改為兩個按鈕（正式難度 / 測試模式 1~30 關）；callback 改為 `onStart(mode: 'normal'|'test')`。
  - `src/main.js`：world/renderer/controls 建立時機移至 splash callback 內（需知道 mode 才能選 cfg）；測試模式下注入 `_testInit.cardBonuses + storage`（只在無存檔新局）並設 badge 為「測試模式」。
  - `src/storage/saveLocal.js`：`loadSave / writeSave / clearSave` 改接受可選 `storageKey` 參數（預設 DEFAULT_KEY）。
  - `src/storage/saveManager.js`：`saveWorld(world, cfg?)` 和 `loadWorld(cfg?)` 皆透過 `cfg.save?.storageKey` 傳對應 key。

## v0.0.6.0 - 2026-06-24

### 新增
- **Step 10A 掉落物系統**：
  - `src/logic/drops.js`（新檔）：`createDrop(blockKey,x,y)` 建立掉落物；`collectNearbyDrops(drops, player, inventory, cfg)` Chebyshev 距離 ≤ pickupReachTiles 時自動撿取（純函式）。
  - `config/gameConfig.js`：新增 `drops.pickupReachTiles: 1`。
  - `src/game/world.js`：`createWorld` 新增 `drops: []`；`firstGame / tutorialTimer` 欄位繼承自 v0.0.5.0。
  - `src/game/actions.js`：`updateMining` 背包滿時改為掉落到玩家腳下並繼續挖；新增 `collectDrops(world, cfg)` 每 tick 呼叫，pickup 後若 drops 清空則清除 `mining.full`。
  - `src/storage/saveManager.js`：序列化 / 反序列化 `drops` 陣列。
  - `src/main.js`：update loop 每幀呼叫 `collectDrops`；`cardHoverIndex` 每幀由滑鼠 vs cardOfferRects 計算後寫入 world。
  - `src/render/renderer.js`：新增 `_drawDrops(world)`，以方塊顏色 + 白色輪廓繪製掉落物。
- **Step 10B 卡片 UI polish（Codex）**：
  - `src/render/renderer.js`：`_drawCardPanel(card, rect, hovered)` 加 hover 參數，hover 時背景亮色 + 邊框加粗 + tier 顏色 glow；tier label 中文化（稀有/普通/基礎）；卡名 bold 16px；`type・tier` 副標；效果文字柔和色；底部細分隔線 + 價值欄位。

### 修復
- `src/render/renderer.js` `_drawCardPanel`：Codex 寫的 `tierLabelMap/tierColorMap` key 用 `normal`，實際 cards.js tier 值為 `standard`，修正為 `standard`。

## v0.0.5.0 - 2026-06-24

### 新增
- **Step 9A localStorage 存檔接入**：
  - `src/storage/saveManager.js`（新檔）：`serializeWorld` / `deserializeWorld` / `saveWorld` / `loadWorld`；序列化 stage/storage/dirt/fore/player/coreHp/cardBonuses/cardModifiers/mines，還原時透過 `createWorld` 基礎設施 + patch 存檔值 + `refreshCoreSnapshot`。
  - `src/main.js`：開機優先 `loadWorld()`，失敗才 `createWorld()`；wave clear 進入 prep 時自動 `saveWorld()`；debug X 鍵清除 localStorage 並重新整理回新局。
- **Step 9B 新手教學提示**：
  - `src/game/world.js`：`createWorld` 新增 `firstGame / tutorialTimer` 欄位。
  - `src/main.js`：無存檔首次啟動設旗標與計時器；phase 切入 night 時重置計時器；每幀遞減。
  - `src/render/renderer.js`：新增 `_drawTutorialHint`，prep/night 各顯示對應黃色提示框，最後 1 秒淡出；僅首次遊玩顯示。
- Debug hotkey `X`：清除存檔並 reload。

### 修復
- `config/gameConfig.js`：版本號誤寫為 `v0.0.3.0`，修正為 `v0.0.4.0`（本次 sync 升為 v0.0.5.0）。

## v0.0.4.0 - 2026-06-24

### 新增
- **Step 8 王關卡片系統接入**：
  - `src/logic/cardEffect.js`（新檔）：4 種 effect 純函式實作（`coreStat` / `playerStat` / `resource` / `modifier`），消費 `world.cardBonuses / world.cardModifiers / world.storage / world.player`。
  - `src/game/phaseRuntime.js`：`_waveClear` 於 stage=10/20/30 轉入 `cardOffer` phase；新增 `_enterCardOffer`（呼叫 `generateOffer`）、`resolveCardOffer`（套用 effect + 刷新快照 + 回 prep）。
  - `src/game/world.js`：world 新增 `pendingCardOffer`、`cardBonuses`、`cardModifiers` 三欄位；phase 說明加 `cardOffer`。
  - `src/game/coreSnapshot.js`：`refreshCoreSnapshot` 將 `world.cardBonuses` 傳入 `computeCoreStats` opts.cardAdd，使卡片加值反映到核心數值快照。
  - `src/render/renderer.js`：`_drawCardOffer` 完整卡片面板（3 張水平排列，顯示名稱/類型/tier/效果文字），寫入 `world.cardOfferRects`；`_phaseLine` 新增 `cardOffer` case；`cardEffectText` / `wrapText` 工具函式。
  - `src/input/controls.js`：`cardOfferMode` flag、`cardOfferRects`（由 main.js 每幀同步）、`pendingCardChoice` 與 `consumeCardChoice()`；`_handlePointerDown` 在 cardOffer 模式下偵測點選卡片座標。
  - `src/main.js`：import `resolveCardOffer`，每幀同步 `controls.cardOfferMode / controls.cardOfferRects`，消費 `consumeCardChoice()` 並呼叫 `resolveCardOffer`。
  - `src/game/actions.js`：新增 debug action `showCardOffer`，C 鍵直接開抽卡面板（prep phase 有效）。
  - Debug hotkey C 新增至 `config/gameConfig.js`（debug hotkeys）與 `QUICKREF.md` 陷阱/hotkey 表。
  - `tests/cardEffect.test.js`：測 4 種 card effect 套用。
  - `tests/cardOffer.test.js`：測出卡規則、boss 清關進 cardOffer、debug C、rect 點選、resolveCardOffer 回 prep。
  - `tests/index.js`：匯入以上兩個新測試檔。
  - `package.json`：補 `npm test`/`node tests/` 跑測試腳本。
  - `index.html`：標題改為 `Yes, Master! — MVP`。
  - 多份文件（`ARCH.md`、`Docs/`、`assets/`）統一強調正式遊戲名 **Yes, Master!**，哥布林的信仰為副標 / lore。

## v0.0.3.0 - 2026-06-23

### 新增
- **Step 6B debug 核心戰鬥接入**：
  - 新增 `src/game/combatRuntime.js`：debug 敵人生成、敵人追逐玩家、核心攻擊覆蓋 anchor、核心普攻/連鎖 tick。
  - Debug hotkeys 新增 `L` 生成 1 隻敵人、`P` 生成 5 隻敵人；敵人暫時追玩家但不攻擊。
  - 核心攻擊使用現有 `src/logic/combat.js`：普攻鎖最近核心目標、連鎖選目標、傷害套防禦/魔法。
  - `Renderer` 繪製敵人與小血條，HUD 顯示敵人數與最近命中傷害。
- **Step 6A 核心 HP / 修復 / Debug 測試鍵**：
  - 新增 `src/logic/coreHealth.js`：核心目前 HP 夾取、扣血、hpMax 變化同步 current HP、修復量換算與疲勞消耗。
  - world 新增 `coreHp`、玩家目前 `fatigue`、`repair` 狀態；HUD 顯示 `HP current/max`、疲勞與修復狀態。
  - 建土時 current/max HP 一起增加；拆土時 current/max HP 一起扣，若會讓核心歸零則回傳 `would_destroy_core` 並禁止拆除。
  - R 長按修復：需站在核心或 connected dirt 上，每秒消耗 1 疲勞，回復 `repair/60`（向下取小數 2 位）。
  - `config.gameConfig.debug` 新增 H/J/K hotkeys：扣核心血、回核心血、補塔內測試資源。
- **Step 5 核心數值顯示 / 方塊加成回饋**：
  - `src/logic/coreStats.js` 新增 `countPlacedBlocks`，把背景泥土與前景方塊統一轉成核心加成計數；泥土每格仍提供 hpMax +1。
  - 新增 `src/game/coreSnapshot.js`，集中刷新 `world.blockCounts` / `world.coreStats`。
  - `createWorld` 初始化核心數值快照；`tryPlace` / `tryRemove` 成功後即時刷新。
  - `Renderer` HUD 顯示核心 HP 上限、攻擊、防禦、攻速、範圍、魔法、連鎖與已放置方塊數。
- **Step 4 初版建造 / 拆除**：
  - 新增 `src/logic/building.js`：放置/拆除合法性判定（建造 reach、分段水平範圍、高度、核心佔用、地底、連通泥土、前景背板）。
  - `src/game/actions.js` 接 `tryPlace` / `tryRemove` / `computeBuildPreview`；放置消耗塔內資源，拆除退回塔內資源欄。
  - `src/input/controls.js` 接快捷列選材、左鍵放置、右鍵拆除；空快捷格不會進入建造模式，pointerdown 會同步滑鼠座標。
  - `src/render/renderer.js` 顯示建造預覽與建造/挖礦模式 HUD。
  - `config/gameConfig.js` 新增 hotbar、建造 reach 3 格與 debug demo gate；demo 結構預設關閉，避免拆除免費退料。
- **Step 3 挖礦 / 背包 / 塔內資源**：
  - 純邏輯（無 DOM）：`src/logic/mineGen.js`（礦山 10x3 生成 + 重力補位，seeded）、`src/logic/inventory.js`（背包承重/格數雙限、存入塔內）、`src/logic/mining.js`（破塊敲擊數、選最近礦格）。
  - orchestration：`src/game/actions.js`（挖礦累積/破塊、站連通泥土自動卸貨）。
  - `config/mines.js` 加 `MINE_SEED`、`config/gameConfig.js` 加 `player.backpackSlots`。
  - 完整循環：移動 → 長按挖最近礦格 → 進背包（滿了提示）→ 回核心站連通泥土自動入塔內資源欄；第 0 關初始資源包開局入塔內。
  - `Renderer` 畫礦山實際方塊 + HUD（背包承重/內容、塔內資源、背包滿提示）。
- **跟隨鏡頭（smooth、防 flicker/judder）**：`world.updateCameraFollow` 依插值後玩家位置居中跟隨 + 邊界夾取；`renderer` 整數像素平移（防 pixelated 邊緣抖）；`main.js` 存上一步位置、render 吃 gameLoop 的 alpha 做插值。背景（天空）畫在螢幕座標保持固定。
- 純邏輯/整合測試：mineGen/inventory/mining 17 項、整合（挖礦→背包→卸貨→塔內、背包滿旗標）6 項、鏡頭插值/夾取 5 項，全過。

### 調整
- 設計決定（尚未實作，記錄待辦）：背包滿可繼續挖、溢出塊掉地上（Minecraft 式掉落物）；挖礦一律就近、不做滑鼠瞄準。

### 修復
- （無）

## v0.0.2.0 - 2026-06-23

### 新增
- **MVP 單機骨架開工**（四層架構，遵守開發鐵則）：
  - `config/`：gameConfig（含版本欄位，第 5 個版本同步點）、blocks、mines、enemies、waves、cards。
  - `src/logic/`（純函式，無 DOM）：rng（seeded）、damageDefense、coreStats、connectivity、combat、waveGen、cardOffer、migration。
  - `src/render`/`input`/`storage` 分層佔位 + `src/main.js` + `index.html`（ES Module 入口）。
- 接上 Step 2 畫面骨架：`src/game/world.js` 建立 world/camera/核心/兩層方塊狀態，`src/render/renderer.js` 可畫地面、網格、礦山、背景泥土、前景方塊、核心與玩家。
- 新增 `src/game/gameLoop.js` fixed timestep loop：update 固定 60Hz，render 與螢幕刷新率分離，避免高 Hz 讓遊戲進程變快。
- 新增 `src/logic/playerMovement.js` 與 WASD/方向鍵調試版移動；移動能力值 50 換算為 5 格/秒。
- 新增 `.claude/launch.json` 本地啟動設定。
- 新增開發鐵則 9「純邏輯與渲染分離（可測試性）」，並在 `game-architecture-plan.md` 補「程式碼分層原則」。
- 建立 `Docs/claude-codex-worklist.md`：Claude↔Codex 交接看板（config 即交接介面）。
- 純邏輯層 22 項 Node smoke test 全過；Codex 填表後 waveGen 跑 10/20/21/30 關無 NaN。

### 調整
- 定案核心普攻鎖定「離核心最近」、連鎖「以主目標為中心取最近 N、不重複、用盡可重啟循環」、加時 30 秒未清完「強制 GameOver」，同步進 `game-design-plan.md`、`waveplan.md`、`planning-dashboard.md`。
- Codex 填入敵人基礎數值/移速（工兵 attackRange=3）、5 張資源卡 grant、21-30 阻擋區 seed=20260622。

### 修復
- 修正 ES Module late-load 時可能錯過 `DOMContentLoaded`，導致 boot 沒有執行的問題。
- 修正 canvas 沒焦點時鍵盤輸入無效的問題；目前 canvas 會自動 focus，點畫面也會重新 focus。

## v0.0.1.0 - 2026-06-22

### 新增
- 建立「AI 協作 Handover 文件系統」：
  `.claude/instructions.md`、`DOC_INTEGRITY.md`、`VERSION_RULES.md`、
  `ARCH.md`、`QUICKREF.md`、`project_summary.md`、`CHANGELOG.md`、
  `.claude/skills/file-header.md`。
- 確立開場讀取儀式、收尾 `sync-docs` 流程（Step 1~7）與版本號同步鐵則。

### 調整
- 原根目錄 `MAIN.md`（planning 進入點 / source map）移至 `Docs/source-map.md`；
  根目錄 `MAIN.md` 改作「函式級參考」。同步更新 `.claude/CLAUDE.md`、`.codex/AGENTS.md`、
  `Docs/planning-dashboard.md` 的引用路徑。

### 修復
- （無）
