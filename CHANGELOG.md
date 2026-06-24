# CHANGELOG.md — 版本歷史

> 版本：v0.0.4.0
> 類型：**只增不改**（歷史紀錄，永遠往上加，最新在最上方，不回頭改舊條目）。
> 條目格式：`## vX.Y.Z.W - YYYY-MM-DD`，下分「新增 / 修復 / 調整」。

---

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
