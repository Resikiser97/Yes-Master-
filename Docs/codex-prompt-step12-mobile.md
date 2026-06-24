# Step 12：手機 UI — 新 Chat 完整交接 Prompt

> 版本基準：v0.0.7.2
> 執行者：新的 Claude Code session
> 本檔位置：`Docs/codex-prompt-step12-mobile.md`

---

## 0. 先讀這些檔案（開工前必讀，不要跳過）

按順序讀：

1. `.claude/instructions.md`（AI 協作 SOP、版本號規則、鐵則 9）
2. `Docs/source-map.md`（專案知識地圖）
3. `MAIN.md`（函式列表、模組職責）
4. `QUICKREF.md`（技術陷阱表、架構摘要）
5. `src/main.js`（現有 boot 流程）
6. `src/input/controls.js`（現有鍵盤/滑鼠輸入介面，你要對照它做 TouchControls）
7. `src/render/renderer.js`（現有渲染層）
8. `src/ui/splash.js`（現有 splash，你要修改它）
9. `config/gameConfig.js`（全域設定，特別看 render.tilePx、map.viewportPx、debug.hotkeys）

---

## 1. 專案背景（速覽）

- **遊戲名**：Yes, Master!（哥布林守核心塔防）
- **技術棧**：純 ES Module browser game，HTML + JS，無 bundler。`npx serve . -l 5173` 跑本機。
- **鐵則 9**：純邏輯層（`src/logic/*`）零副作用，渲染層只讀 world 不寫規則，輸入層只產生事件。
- **目前狀態**：v0.0.7.2。單機可動，有 PC 鍵盤/滑鼠輸入、固定 800×480 canvas、底部 HUD 左右分欄、debug 浮層（` 鍵）。
- **Canvas 固定大小問題**：`config/gameConfig.js` 的 `render.tilePx = 16`、`map.viewportPx = { width:800, height:480 }` 都是寫死的，手機無法適配。

---

## 2. Step 12 任務範圍

**Step 12A** — 動態 Canvas 縮放（你要做）
**Step 12B** — 觸控輸入層（你要做）
**Step 12C** — 手機 HTML overlay UI（你要做）
**Step 12D** — Debug 按鈕整合（你要做）

全部由你（Claude Code）處理。Codex 不需介入。

---

## 3. 已確認的設計決策（不要再討論，直接做）

| 決策 | 結論 |
|---|---|
| Canvas 縮放方式 | **方案 C：動態 tilePx**。根據 `window.innerWidth` / `window.innerHeight` 重算 tilePx，直接改 `cfg.render.tilePx` 和 `cfg.map.viewportPx`，renderer 重新 attach。遊戲邏輯全 tile 單位，無需改。 |
| 強制橫向 | CSS `@media (orientation:portrait)` 顯示「請轉橫向」遮罩，遮住遊戲。 |
| 地址欄處理 | 進遊戲時呼叫 `window.scrollTo(0,1)` + 監聽 `visualViewport` resize 重算 tilePx。 |
| 搖桿類型 | **8 方向 D-pad**（不用 analog joystick，格子移動更精確）。 |
| 快捷列位置 | **底部中間一排**（1–7 材料選擇）。 |
| 輸入模式切換 | 玩家可自選。Splash 加第二排按鈕「電腦鍵盤」/「手機觸控」，選擇存 `localStorage` 獨立 key（`yesmaster.inputMode`），不進遊戲存檔。自動偵測作為預設（`'ontouchstart' in window`）。 |
| Debug 按鈕 | `debug.hotkeys=true` 時，右上角永遠顯示小「⚙」按鈕。點/tap → 切換 `world.showDebug`（與 ` 鍵同效）。Debug overlay 裡的每個 hotkey 動作也加對應 tap 按鈕。 |

---

## 4. 詳細實作規格

### 4A. 動態 tilePx 系統

#### 新檔：`src/ui/mobileLayout.js`

```js
// 計算最佳 tilePx，讓遊戲地圖填滿可用空間
// reserveBottomPx：底部留給虛擬按鍵的高度（電腦=0，手機=140）
export function computeTilePx(cfg, reserveBottomPx = 0) {
  const vw = window.innerWidth;
  const vh = window.innerHeight - reserveBottomPx;
  const visibleCols = cfg.map.widthTiles;   // 160，但實際只顯示 viewport 範圍
  const visibleRows = cfg.map.heightTiles;  // 40 之類，看 config

  // 不改變可見格數，只縮小格子大小
  // 目標：viewport 盡量填滿 vw × vh
  // tilePx_x = floor(vw / visibleCols)  → 但這樣太小（整個地圖要放進去）
  // 實際上我們只顯示 viewport，不是整張地圖
  // 正確做法：tilePx = floor(vw / (原 viewportPx.width / 原 tilePx))
  //          = floor(vw / 可見格寬)，可見格寬 = 原 viewportPx.width / 原 tilePx = 800/16 = 50
  const baseViewCols = Math.round(cfg.map.viewportPx.width  / 16); // 50（不用原 tilePx，避免已改過）
  const baseViewRows = Math.round(cfg.map.viewportPx.height / 16); // 30
  const tByW = Math.floor(vw / baseViewCols);
  const tByH = Math.floor(vh / baseViewRows);
  return Math.max(4, Math.min(tByW, tByH)); // 最小 4px，避免太小
}

// 把新的 tilePx 寫回 cfg（cfg 是 GAME_CONFIG，by reference）
// 並更新 viewportPx
export function applyTilePx(cfg, tilePx) {
  const baseViewCols = Math.round(cfg.map.viewportPx.width  / 16);
  const baseViewRows = Math.round(cfg.map.viewportPx.height / 16);
  cfg.render.tilePx = tilePx;
  cfg.map.viewportPx = {
    width:  baseViewCols * tilePx,
    height: baseViewRows * tilePx,
  };
}

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function getSavedInputMode() {
  try { return localStorage.getItem('yesmaster.inputMode') ?? null; } catch { return null; }
}

export function saveInputMode(mode) {
  try { localStorage.setItem('yesmaster.inputMode', mode); } catch {}
}
```

#### 修改：`src/render/renderer.js`

新增 `resize(cfg)` 方法，在 `window` resize 時呼叫：

```js
resize(cfg) {
  this.cfg = cfg; // cfg.render.tilePx 和 cfg.map.viewportPx 已由外部更新
  this.t = cfg.render.tilePx;
  this.viewport = cfg.map.viewportPx;
  if (this.canvas) {
    this.canvas.width  = this.viewport.width;
    this.canvas.height = this.viewport.height;
    this.canvas.style.width  = `${this.viewport.width}px`;
    this.canvas.style.height = `${this.viewport.height}px`;
  }
  this.ctx = this.canvas?.getContext?.('2d') ?? null;
}
```

#### 修改：`src/main.js`

在 splash callback 內（world 建立後），加 resize 監聽：

```js
// 初始化 tilePx
const isMobile = resolvedMode === 'touch'; // resolvedMode 見 Splash 修改說明
const reserve = isMobile ? 140 : 0;
applyTilePx(cfg, computeTilePx(cfg, reserve));
renderer.resize(cfg);

// resize 時重算（地址欄收起/展開也會觸發）
const onResize = () => {
  applyTilePx(cfg, computeTilePx(cfg, reserve));
  renderer.resize(cfg);
};
window.visualViewport?.addEventListener('resize', onResize);
window.addEventListener('resize', onResize);

// 進場時嘗試讓地址欄收起
window.scrollTo(0, 1);
```

**注意**：`main.js` 裡 mouse → tile 的座標換算用的是 `cfg.render.tilePx`，因為 cfg 是 by-reference，resize 後自動生效，不需額外修改。

---

### 4B. Splash 修改（輸入模式選擇）

#### 修改：`src/ui/splash.js`

現在 callback 是 `onStart(mode: 'normal'|'test')`，要改成 `onStart(diffMode, inputMode)`。

第一排按鈕：難度選擇（不變）
```
[正式難度]  [測試模式 1~30 關]
```

第二排按鈕：輸入模式（新增，預設選中 auto-detect 的那個）
```
[電腦鍵盤 ⌨️]  [手機觸控 📱]
```

- 預設選中：`getSavedInputMode()` 或 `isTouchDevice()` 判斷
- 選中狀態：邊框亮金色 + 背景微亮
- 點了另一個就切換選中，但不觸發 `onStart`
- 兩排按鈕都選完後（難度也點了），才觸發 fade + `onStart(diffMode, inputMode)`

改法：難度按鈕點了先記住 `selectedDiff`，等兩個都選了再 onStart。或者難度按鈕依然是「點了就觸發」，inputMode 用 selectedState 記著。後者更簡單：

```
let selectedInput = getSavedInputMode() ?? (isTouchDevice() ? 'touch' : 'keyboard');
難度按鈕 click → saveInputMode(selectedInput); onStart(diffMode, selectedInput);
輸入模式按鈕 click → selectedInput = mode; 更新按鈕外觀（不觸發 onStart）
```

callback 簽名改為：`onStart(diffMode: 'normal'|'test', inputMode: 'keyboard'|'touch')`

---

### 4C. 觸控輸入層

#### 新檔：`src/input/touchControls.js`

實作一個與 `Controls` 介面相容的類別（`main.js` 可以替換使用）。

**需要支援的介面**（對照 `Controls`）：

```js
export class TouchControls {
  constructor(canvas, cfg) // cfg 用於取 hotbar 長度等
  attach()   // 建立 HTML overlay，掛 touch event
  detach()   // 移除 overlay
  getMoveVector()    // { x, y }，依 D-pad 按下格組合，normalize
  isMining()         // bool，挖礦按鈕長按中
  isRepairing()      // bool，修復按鈕長按中
  getSelectedSlot()  // number|null
  setSelectedSlot(n)
  consumePlace()     // bool，放置按鈕被 tap（消耗一次）
  consumeRemove()    // bool，拆除按鈕被 tap（消耗一次）
  consumeDebugActions() // string[]
  consumeCardChoice()   // number|null
  get mouse()        // { x, y }（canvas 座標，供 build preview 用）
  cardOfferMode      // bool，由 main.js 寫入
  cardOfferRects     // array|null，由 main.js 寫入
}
```

**D-pad 8 方向**：上下左右四個方向按鈕，允許同時按兩個（如上+右 = 右上方）。

**overlay HTML 佈局**（CSS `position:fixed`，`z-index:200`）：

```
[底部左側]  8方向 D-pad
  ┌────────────────────┐
  │  ↑                 │
  │ ←  →              │
  │  ↓                 │
  └────────────────────┘
  圓形方向盤，每格 50px，共 3×3 格（中間空）

[底部右側]  動作按鈕
  ┌────────────────────┐
  │  [挖礦]  [修復 R]  │
  │  [放置]  [拆除]    │
  └────────────────────┘

[底部中間]  快捷列（1-7）
  [ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ]
  顯示材料圖示（或文字），選中的格子高亮

[右上角]  ⚙ debug 按鈕（debug.hotkeys=true 時顯示）
```

**挖礦按鈕**：`pointerdown` 開始，`pointerup/pointercancel` 結束。長按即持續 `isMining()=true`。

**滑鼠位置（build preview 用）**：在觸控模式下，`放置` 按鈕 tap 後，使用目前 `world.player` 的正前方格（或固定用玩家面對方向的第 1 格）。具體實現：`mouse` 始終跟著玩家移動方向的前一格。或者暫時固定為玩家正前方（簡單做法）。

**卡片選擇**：`world.phase === 'cardOffer'` 時，直接 tap canvas 上的卡片區域即可（`cardOfferRects` 已有座標），無需額外按鈕。TouchControls 需偵測 canvas 的 `touchstart` 事件，判斷是否在某個 rect 內。

---

### 4D. Debug 按鈕整合

#### 修改：`src/ui/touchControls.js`（或獨立加入 `src/ui/mobileHud.js`）

**⚙ 按鈕**（在 `debug.hotkeys=true` 時建立）：
- 位置：右上角，`position:fixed; top:8px; right:8px; z-index:300`
- 樣式：40×40px，半透明深色背景 + 金色邊框，文字「⚙」
- click/tap → `world.showDebug = !world.showDebug`
- **這個按鈕要在 keyboard 模式也顯示**（桌機 tester 也可以用滑鼠點）

**Debug Overlay 內的 Tap 按鈕**（修改 `src/render/renderer.js` `_drawDebugOverlay`）：

目前 debug overlay 是純 canvas 繪製（renderer.js）。要讓它的 H/J/K/L/P/C/N/Q/X 按鈕可以被點擊，有兩個選擇：

**選擇 1**（建議）：debug overlay 改為 HTML div，不再用 canvas 繪製。
- 在 `touchControls.js` 裡，若 `world.showDebug=true` 則顯示 debug HTML panel；否則隱藏。
- Panel 裡每個 hotkey 都是一個 `<button>`，click → `applyDebugAction(world, action, cfg)`。
- 這樣桌機和手機都能點擊 debug 按鈕。

**選擇 2**：維持 canvas 繪製 overlay，額外偵測 canvas click 座標是否在 overlay 範圍內。

**請用選擇 1**：HTML debug panel 更彈性（可捲動、按鈕大小可調），且不污染純渲染層。

**實作細節**：
- renderer.js 的 `_drawDebugOverlay` 可以保留（給 keyboard 模式用）
- 或改成：`world.showDebug=true` 時，keyboard 模式仍用 canvas overlay；touch 模式用 HTML panel
- 最簡單：統一改成 HTML panel，renderer.js 的 `_drawDebugOverlay` 移除
- 但要注意：HTML panel 不跟著 canvas 縮放，需要獨立定位

建議做法：
1. 保留 renderer.js 的 `_drawDebugOverlay`（keyboard 模式用）
2. `touchControls.attach()` 時，另外建立一個 HTML debug panel（`id="debug-panel-touch"`），`display:none`
3. `⚙` 按鈕 click → `world.showDebug = !world.showDebug`；同時切換 HTML panel 顯示/隱藏 + renderer 的 `showDebug`
4. HTML debug panel 裡的按鈕直接 import/call `applyDebugAction`

---

### 4E. 直向偵測遮罩

#### 修改：`src/ui/mobileLayout.js`（或 `index.html`）

新增一個全螢幕遮罩 div：

```js
export function setupOrientationGuard() {
  const guard = document.createElement('div');
  guard.id = 'orientation-guard';
  guard.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:9998;align-items:center;justify-content:center;color:#D4A017;font-size:18px;letter-spacing:2px;text-align:center;';
  guard.textContent = '請轉橫向遊玩';
  document.body.appendChild(guard);

  const check = () => {
    const isPortrait = window.innerWidth < window.innerHeight;
    guard.style.display = isPortrait ? 'flex' : 'none';
  };
  window.addEventListener('resize', check);
  window.visualViewport?.addEventListener('resize', check);
  check();
}
```

只在 `inputMode === 'touch'` 時呼叫。

---

## 5. main.js 修改摘要

`boot()` 函式要改成接收 `(diffMode, inputMode)` 兩個參數。現在的結構：

```js
showSplashScreen((diffMode) => {
  const cfg = diffMode === 'test' ? buildTestConfig(GAME_CONFIG) : GAME_CONFIG;
  ...
  controls.attach();
  ...
});
```

改後：

```js
// renderer 和 controls/touchControls 建立時機：splash 後才知道 inputMode
showSplashScreen((diffMode, inputMode) => {
  const cfg = diffMode === 'test' ? buildTestConfig(GAME_CONFIG) : GAME_CONFIG;

  // 1. 計算 tilePx，更新 cfg
  const reserveBottom = inputMode === 'touch' ? 140 : 0;
  applyTilePx(cfg, computeTilePx(cfg, reserveBottom));

  // 2. 初始化 renderer（現在用更新後的 cfg）
  const renderer = new Renderer(canvas, cfg);

  // 3. 依模式選輸入器
  const controls = inputMode === 'touch'
    ? new TouchControls(canvas, cfg)
    : new Controls(canvas, { hotbarSlots: cfg.hotbar.length });

  // 4. 手機才設方向守衛
  if (inputMode === 'touch') setupOrientationGuard();

  // 5. resize 監聽
  const onResize = () => { applyTilePx(cfg, computeTilePx(cfg, reserveBottom)); renderer.resize(cfg); };
  window.visualViewport?.addEventListener('resize', onResize);
  window.addEventListener('resize', onResize);
  window.scrollTo(0, 1);

  // 6. ⚙ debug 按鈕（keyboard 和 touch 都加）
  if (cfg.debug?.hotkeys) {
    const debugBtn = document.createElement('button');
    debugBtn.textContent = '⚙';
    debugBtn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:300;width:34px;height:34px;background:rgba(10,16,24,0.82);border:1px solid rgba(255,180,0,0.5);color:#f0b020;font-size:16px;cursor:pointer;';
    debugBtn.addEventListener('click', () => { world.showDebug = !world.showDebug; });
    document.body.appendChild(debugBtn);
    // ⚠️ 注意：world 在下方才建立，debugBtn listener 需要在 world 建立後才 append，或用 getter
    // 做法：先建立 btn，listener 用 () => { if(window.__YES_MASTER__) window.__YES_MASTER__.world.showDebug ^= 1; }
  }

  // 7. 其餘（world 建立 / loop 啟動）不變 ...
  const savedWorld = loadWorld(cfg);
  const world = savedWorld ?? createWorld(cfg);
  ...
  controls.attach();
  ...
});
```

---

## 6. 版本號規則

- 這是 y-level（功能）的新增，應從 v0.0.7.2 → **v0.0.8.0**
- `config/gameConfig.js` 的 `version: 'v0.0.8.0'` 和 `@version v0.0.8.0`
- 所有改到的 `src/**/*.js` 和 `config/**/*.js` 的 `@version` 要同步
- 完成後執行 sync-docs：更新 CHANGELOG.md / MAIN.md / QUICKREF.md / project_summary.md

---

## 7. 完成後的自我驗收清單

電腦模式：
- [ ] 選「電腦鍵盤」→ WASD / 滑鼠長按挖礦正常
- [ ] ⚙ 按鈕可點，效果與 ` 鍵相同
- [ ] Canvas 大小在 resize 瀏覽器視窗後重新計算（不再固定 800×480）
- [ ] 存檔/載入正常

手機模式（或 DevTools 模擬手機）：
- [ ] 選「手機觸控」→ D-pad 出現在左下，動作按鈕出現在右下，快捷列在底部中間
- [ ] D-pad 8 方向移動正常（含斜角）
- [ ] 挖礦按鈕長按 → 開始挖礦
- [ ] 快捷列 tap → 選材料
- [ ] 放置/拆除按鈕正常
- [ ] ⚙ 按鈕 tap → debug overlay 或 HTML debug panel 顯示
- [ ] Debug panel 按鈕（H/J/K/L/P/C/N/Q）可 tap 觸發
- [ ] 直向時出現「請轉橫向遊玩」遮罩
- [ ] Canvas 縮放正確（tilePx 重算，遊戲不變形）

---

## 8. 注意事項 / 陷阱

1. **Controls 介面完全相容**：`TouchControls` 必須實作所有 `Controls` 的 public 方法，讓 `main.js` 的 game loop 不需要判斷是哪種 controls。

2. **mouse 座標**：TouchControls 的 `mouse` property 在 touch 模式下應返回玩家移動方向前方一格的 canvas 座標（`player.x * tilePx + tilePx/2`），讓 build preview 顯示在玩家正前方。如果太複雜，可以先返回玩家正中的座標，讓 buildPreview 失效但不報錯。

3. **overlay z-index 層次**：
   - 遊戲 canvas: `z-index: auto`
   - HUD HTML overlay: `z-index: 200`
   - debug panel: `z-index: 250`
   - ⚙ 按鈕: `z-index: 300`
   - orientation guard: `z-index: 9998`
   - splash: `z-index: 9999`

4. **`visualViewport` 不存在的 fallback**：`window.visualViewport?.addEventListener(...)` 已用 optional chaining，`window.addEventListener('resize', ...)` 作為 fallback，兩個都掛。

5. **不要改 `src/logic/*` 或 `config/gameConfig.js` 的遊戲數值**：只改架構 / 新增 UI 檔案。

6. **saveLocal.js 的 KEY** 已在 v0.0.7.0 改為可選參數，不需再改。

7. **mineProgress** 已在 v0.0.7.2 存在，不要覆蓋掉。

---

## 9. 新增/修改檔案一覽

| 狀態 | 檔案 | 內容 |
|---|---|---|
| 新增 | `src/ui/mobileLayout.js` | computeTilePx / applyTilePx / isTouchDevice / setupOrientationGuard |
| 新增 | `src/input/touchControls.js` | TouchControls class（與 Controls 同介面）|
| 修改 | `src/render/renderer.js` | 新增 resize(cfg) 方法 |
| 修改 | `src/ui/splash.js` | 第二排按鈕選擇輸入模式；callback 改為 onStart(diff, input) |
| 修改 | `src/main.js` | 接收 inputMode；依模式選 controls；resize 監聽；⚙ 按鈕；applyTilePx |
| 修改 | `config/gameConfig.js` | version → v0.0.8.0 |
| 修改 | `MAIN.md` / `QUICKREF.md` / `CHANGELOG.md` / `project_summary.md` | sync-docs |
