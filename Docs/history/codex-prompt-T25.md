# Codex Prompt — T25：EXIT 按鈕沒有 Function 修復

> **版本目標：v0.0.38.0**（若目前版本已因其他變更超前，接續下一個版本號即可）

---

## 背景

實機多人測試時發現：遊戲畫面右下角的 `EXIT` 按鈕（`src/render/renderer.js` 的 `_drawExitButton()`）**純粹是畫在 canvas 上的裝飾**，從來沒有註冊點擊命中區域，點下去完全沒有反應。

對照同檔案裡其他可互動的 HUD 面板（`_drawPlayerPanel`/`_drawCorePanel`/`_drawWaveTimer` 等），它們都會在畫完之後把自己的矩形範圍 push 進 `world.uiHitRects`（例如 `world.uiHitRects.push({ id: 'playerPanel', x, y, w, h });`），點擊時 `src/input/controls.js` 的 `_hitTest`（約 line 202-206）會用滑鼠座標比對 `uiHitRects`，命中後設 `pendingUiClick = r.id`，`main.js` 再呼叫 `applyUiClick(world, controls.consumeUiClick?.())` 處理。`_drawExitButton()` 完全沒有走這條路，是唯一的例外。

---

## 修改檔案（共 2 個）

### 1. `src/render/renderer.js`

**A. `_drawExitButton()`（約 line 1014-1031）改為接受 `world` 參數並註冊 `uiHitRects`：**

```js
_drawExitButton(world) {
  const ctx = this.ctx;
  const { width: vw, height: vh } = this.viewport;
  const w = 58, h = 24;
  const x = vw - w - 8, y = vh - h - 32;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#F44336';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F44336';
  ctx.fillText('EXIT', x + w / 2, y + h / 2 + 1);
  ctx.restore();

  world.uiHitRects ??= [];
  world.uiHitRects = world.uiHitRects.filter((r) => r.id !== 'exitButton');
  world.uiHitRects.push({ id: 'exitButton', x, y, w, h });
}
```

**B. 呼叫處（約 line 253）加上 `world` 參數：**
```js
this._drawExitButton(world);
```

> 這個函式原本沒有清掉舊的 hit rect 再 push——跟 `playerPanel`/`corePanel`/`waveInfoPanel` 的既有寫法（先 filter 掉同 id 舊項，再 push 新項）保持一致，避免每幀重繪時 `uiHitRects` 陣列裡塞進重複的 `exitButton` 項目。

`@version` header 更新為 `v0.0.38.0`。

---

### 2. `src/main.js`

EXIT 需要做的事跟現有的 GameOver Escape 鍵處理（約 line 490-496）完全一樣：停止遊戲迴圈、關閉多人連線（如果是多人）、reload 頁面。但 Escape 處理只在 `world.phase === 'gameover'` 時生效，EXIT 按鈕要任何時候點都有效。

**在主要的 `update: (dt) => { ... }` callback最開頭（約 line 270，`update: (dt) => {` 這行之後）加上：**

```js
update: (dt) => {
  if (controls.pendingUiClick === 'exitButton') {
    controls.pendingUiClick = null;
    loop.stop?.();
    netSession?.close?.();
    window.location.reload();
    return;
  }
  if (worldRef.current !== world) world = worldRef.current;
  // ...原本的內容不變...
```

> **重要**：`syncLocalInputUi`（`main.js` 約 line 508，模組層級函式，不在 `startGame()` closure 裡）跟 `update` callback 內另一處（約 line 369）都會呼叫 `applyUiClick(world, controls.consumeUiClick?.())`——這兩處都沒有 `loop`/`netSession` 的存取權（`syncLocalInputUi` 完全在 closure 外，拿不到；line 369 那處雖然在 closure 內，但混在 host 專屬的每幀邏輯裡，時機較晚）。**在 `update` callback最開頭攔截並直接 `return`，可以確保無論是 host 模式、client 模式、或單人模式，EXIT 點擊都會在其他每幀邏輯（移動、送 input、同步）跑之前就被處理掉，不需要在 `applyUiClick`/`uiState.js` 裡新增邏輯**（那邊是純函式，拿不到 `loop`/`netSession`，硬要塞會違反這兩個模組的分層原則）。

`@version` header 若有的話一併更新為 `v0.0.38.0`（`main.js` 目前檔頭沒有 `@version` 欄位的話不用新增）。

---

## 架構約束

1. `applyUiClick`/`src/ui/uiState.js` 保持純函式，不要為了處理 EXIT 而讓它碰 `loop`/`netSession`/`window`——這些屬於 `main.js` 才有的生命週期資源，不應該滲透進純邏輯層。
2. EXIT 的行為就是重用現有 Escape-on-gameover 那套（`loop.stop?.()` + `netSession?.close?.()` + `window.location.reload()`），不要另外設計新的「返回大廳」流程——這個專案目前唯一的離開方式就是 reload，維持一致。
3. 不要移除或修改既有的 `playerPanel`/`corePanel`/`waveInfoPanel` 的 hit rect 註冊邏輯，只新增 `exitButton` 這一項。

---

## 測試

這是純 UI/canvas 互動邏輯，`world.uiHitRects` 的內容可以直接用既有 `createWorld` + 手動呼叫 renderer 方法來檢查（不需要真的畫 canvas）。若專案內已有 renderer 相關測試檔案可參考其 mock canvas context 的方式；若沒有，本次不必為了 `_drawExitButton` 特別新增 renderer 測試檔案（renderer.js 目前應該也沒有測試覆蓋，維持現狀，不要為了這個小修復新增測試基礎設施），改成在 sync report 描述你怎麼手動驗證（例如：檢查 `_drawExitButton(world)` 呼叫後 `world.uiHitRects` 有 `id==='exitButton'` 的項目、且座標跟畫出來的矩形一致）。

---

## 完成標準

```
node --check src/render/renderer.js
node --check src/main.js
node tests/index.js   → 全通過（不應該有既有測試因為這個修改而壞掉）
```
- 點擊畫面上的 EXIT 按鈕（座標落在按鈕矩形內）會觸發 `pendingUiClick = 'exitButton'`。
- `main.js` 的 `update` callback 偵測到這個值後，停止遊戲迴圈、關閉多人連線（若有）、reload 頁面。
- 單人模式、host 模式、client 模式點 EXIT 都要有效（不能只在某個模式下生效）。
