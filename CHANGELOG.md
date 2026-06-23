# CHANGELOG.md — 版本歷史

> 版本：v0.0.3.0
> 類型：**只增不改**（歷史紀錄，永遠往上加，最新在最上方，不回頭改舊條目）。
> 條目格式：`## vX.Y.Z.W - YYYY-MM-DD`，下分「新增 / 修復 / 調整」。

---

## v0.0.3.0 - 2026-06-23

### 新增
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
