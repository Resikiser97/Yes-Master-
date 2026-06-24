# Codex Prompt — Step 11A：HUD 底部左右分欄

> 版本目標：v0.0.7.x（fix 位，你只動 y 以下）
> 唯一要改的檔案：`src/render/renderer.js`
> 改動範圍：`_drawHud(world)` 方法（約 202~250 行）

---

## 任務目標

目前底部黑框 HUD 高度約 160px（9 行），擋住遊戲畫面。
**目標：改成左右兩欄，高度縮至約 80px（5 行），黑框全寬不變。**

---

## 現在的樣子（可先閱讀現有程式碼）

```
// 整個寬度、單欄、~9 行文字
lines = [
  phaseLine,           // 第 N 關 · 準備中 / 夜晚 ...
  mode,                // 建造模式 或 挖礦模式操作提示
  coreLine,            // 核心 HP/ATK/攻速/DEF
  coreLine2,           // 範圍/魔法/連鎖
  fatigueLine,         // 疲勞/修復
  blockLine,           // 已放置方塊
  enemyLine,           // 敵人數/最近命中
  inventoryLine,       // 背包承重/內容
  storageLine,         // 塔內資源
]
+ 可能多一行 mining.full / repair 狀態
```

---

## 改完的樣子

黑框維持全寬（`vw - 16`），**中間畫一條細分隔線**，左半畫左欄、右半畫右欄。

```
┌─────────────────────────────────────┬──────────────────────────────────┐
│ 核心 HP 50/50  ATK 5  攻速 1/s  DEF 0    │ 第 1 關 · 準備中（29.5s）  N 開始 │
│ 範圍 50  魔法 0%  連鎖 0               │ 挖礦模式（左鍵長按挖最近）         │
│ 背包 20/50 — 石x1 沙x1              │ 疲勞 60/120  修復 0.83/s         │
│ 塔內 土5 沙5 石5 鐵1 金1 鑽1         │ 敵人 0  最近命中 0               │
│ 已放置（空）                           │ [狀態行：背包滿/修復/修復失敗]     │
└─────────────────────────────────────┴──────────────────────────────────┘
```

高度：5 行 × 14px + 上下 padding 8px×2 = **86px**

---

## 具體實作指引

### 1. 行高與 padding 調整

```js
const lineH = 14;   // 原本 16，改小一點
const padY  = 8;    // 上下 padding，與原本相同
```

### 2. 左欄內容（核心/背包/資源）

```js
const leftLines = [
  coreLine,    // 核心 HP/ATK/攻速/DEF
  coreLine2,   // 範圍/魔法/連鎖（cs 有值才加）
  `背包 ${inventoryWeight(inv)}/${world.player.capacity}　${fmtItems(inv)}`,
  `塔內 ${fmtItems(world.storage)}`,
  blockLine,   // 已放置 ...
].filter(Boolean);
```

### 3. 右欄內容（狀態/行為）

```js
const rightLines = [
  phaseLine,   // 第 N 關 · 準備中/夜晚/加時...
  mode,        // 建造模式 或 挖礦模式
  fatigueLine, // 疲勞/修復
  enemyLine,   // 敵人/最近命中
].filter(Boolean);

// 狀態行（放在右欄最後一行）
if (world.mining?.full)                              rightLines.push('⚠ 背包已滿');
else if (world.repair?.active)                       rightLines.push('修復中');
else if (world.repair?.reason === 'not_on_foundation') rightLines.push('需站在核心或連通地基上');
else if (world.repair?.reason === 'no_fatigue')      rightLines.push('疲勞不足');
```

### 4. 繪製邏輯

```js
// 黑框高度：取兩欄最大行數
const rows = Math.max(leftLines.length, rightLines.length);
const panelH = padY * 2 + rows * lineH;
const panelTop = vh - panelH - 8;
const halfW = Math.floor((vw - 16) / 2);

// 黑底
ctx.fillStyle = 'rgba(0,0,0,0.55)';
ctx.fillRect(8, panelTop, vw - 16, panelH);

// 中間細分隔線
ctx.fillStyle = 'rgba(255,255,255,0.08)';
ctx.fillRect(8 + halfW, panelTop + 4, 1, panelH - 8);

// 左欄文字（起點 x = 14）
ctx.fillStyle = '#eee';
leftLines.forEach((ln, i) => ctx.fillText(ln, 14, panelTop + padY + i * lineH));

// 右欄文字（起點 x = 8 + halfW + 8）
rightLines.forEach((ln, i) => ctx.fillText(ln, 8 + halfW + 8, panelTop + padY + i * lineH));
```

---

## 注意事項

1. **不要加任何 debug 相關行**（舊的 `DEBUG H扣血 J回血...` 已被 Claude 移除，不要加回去）。
2. `coreLine2` 只在 `cs` 有值時才有內容，`filter(Boolean)` 已處理空字串。
3. 右欄的「狀態行」數量不定（0 或 1 行），讓右欄行數動態，不硬限。
4. `ctx.font` 維持 `'12px sans-serif'`，lineH 改 14px（不需要改 font size）。
5. 改完後 `panelH` 應約 86px（5 行時），比原本 ~160px 小很多。
6. 改完 `_drawHud` 後，在同檔案頂部的 `@version` 行改成 `v0.0.7.1`（fix 位加 1）。

---

## 驗收

- 黑框高度明顯縮小（≤ 90px）
- 左欄顯示核心/背包/塔內/已放置
- 右欄顯示 phase/模式/疲勞/敵人
- 中間有細分隔線
- 無 JavaScript 報錯
