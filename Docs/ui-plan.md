# Yes, Master! — 遊戲內 UI 計劃書
> 對應 mockup：`Docs/Gameplay UI.png`
> 目標：1:1 還原 mockup 所有資訊區塊
> 狀態：Planning
> 最後更新：2026-06-25
> 版本：v0.0.12.0

---

## 總覽

UI 分為 **7 大區塊**，覆蓋整個遊戲畫面四個角落與底部中央。
所有 HUD 繪製在 canvas 上方的固定位置（不隨鏡頭移動）。

```
┌─────────────────────────────────────────────────────────────┐
│ [A] 玩家面板      [B] 隊友列     　　　　 [C] 波次/計時器   │
│                                                             │
│                                                             │
│                    （遊戲世界畫面）                           │
│                                                             │
│                                                             │
│ [D] 背包面板    [E] 核心數值面板         [F] 敵人情報面板     │
│                 [G] 資源條 + 快捷列                          │
│                 [累計經驗/卡片/金幣]     [開發者+版本] [EXIT] │
└─────────────────────────────────────────────────────────────┘
```

---

## A. 玩家面板（左上角）

### 位置
- 左上角，padding 8px

### 內容

| 元素 | 說明 | 數據來源 |
|---|---|---|
| 玩家頭像 | 大圓形（~64px），顯示角色頭像 sprite 或預設哥布林圖示 | 角色選擇（MVP 固定） |
| HP 條（綠色） | 核心目前血量 / 最大血量，例：`40/120` | `world.coreHp` / `world.coreStats.hpMax` |
| 靈力條（藍色） | 靈動能力值，影響核心攻擊/攻速增幅 | `world.player.spirit`（未來） |
| 疲勞條（紅色） | 目前疲勞 / 最大疲勞 | `world.player.fatigue` / `cfg.player.fatigueMax` |
| 裝備槽 ×3 | 三個彩色矩形（黃/橘/粉），顯示已裝備的裝備圖示 | `world.player.equipment`（未來） |

### 繪製規格

```
頭像圓：cx=40, cy=40, r=32, stroke=#333 2px
HP 條：x=80, y=16, w=120, h=14, 背景=#333, 前景=#4CAF50
       文字：白色 bold 10px，置中顯示 "目前/最大"
靈力條：x=80, y=34, w=56, h=10, 背景=#333, 前景=#2196F3
疲勞條：x=142, y=34, w=56, h=10, 背景=#333, 前景=#F44336

裝備槽：y=56, 各 40×20, gap=6
  槽 1（鎬子）：border=#FFD700（黃）
  槽 2（帽子）：border=#FF9800（橘）
  槽 3（衣服）：border=#E91E63（粉）
```

---

## B. 隊友列（上方中央）

### 位置
- 頂部水平置中，y=8

### 內容
- 最多顯示 3 位其他隊友（1-4 人合作，自己在 A 區，其餘最多 3 人）
- 每位隊友：小圓頭像 + HP 條（綠）+ 靈力條（藍）+ 疲勞條（紅）
- 單人模式時此區域隱藏

### 繪製規格

```
每位隊友面板寬 160px, 高 40px, gap=12
小頭像圓：r=16
HP 條：w=100, h=10, 前景=#4CAF50, 文字顯示 "目前/最大"
靈力條：w=46, h=8, 前景=#2196F3
疲勞條：w=46, h=8, 前景=#F44336

上方顯示意圖 Emoji（⛏️🧱🦵🔧⚠️），30 秒後自動消失
```

### 數據來源
- `world.players[]`（多人模式；MVP 單人不顯示）
- PeerJS 同步封包中的 hp/fatigue/intent

---

## C. 波次 / 計時器（右上角）

### 位置
- 右上角，padding 8px，右對齊

### 內容

| 元素 | 說明 | 數據來源 |
|---|---|---|
| 波次進度點 | `【・・・・・・・・・\|🔵】` 共 10 個點，每清一關填一點，第 10 點 = Boss | `world.stage % 10` |
| 倒數計時器 | `[分分:秒秒]` 格式，顯示當前 phase 剩餘時間 | `world.phaseTimer` |
| 階段文字 | `時間倒數` + phase 名稱（準備/夜晚/加時） | `world.phase` |
| 關卡編號 | `關卡 X-Y`（十位-個位） | `world.stage` → `Math.floor(s/10)-${s%10}` |

### 繪製規格

```
外框：stroke=#666 1px, fill=rgba(0,0,0,0.7), borderRadius=4
padding: 8px

進度點行：
  每個點 = 12px 圓，gap=4
  未通過：fill=#555（暗灰）
  已通過：fill=#4CAF50（綠）
  Boss 位（第 10 點）：fill=#FF9800（橘）或 🔵
  分隔線「|」在第 9 與第 10 點之間

計時器：font bold 16px monospace, fill=#FFF
  格式：[MM:SS]
  prep → 白色
  night → #FF6B6B（紅）
  overtime → #FF0000 閃爍

階段文字：font 12px, fill=#AAA
關卡編號：font 12px, fill=#FFD700
```

### 波次進度邏輯
```
stageInSet = world.stage % 10   // 0~9
dots[i] 狀態：
  i < stageInSet    → filled（已通過）
  i === stageInSet  → current（目前關）
  i > stageInSet    → empty（未到）
  i === 9           → Boss 關特殊標記
```

---

## D. 背包面板（左下角）

### 位置
- 左下角，padding 8px

### 內容

| 元素 | 說明 | 數據來源 |
|---|---|---|
| 標題 | `背包承重：X/Y` | 已用重量 / `cfg.player.carry` |
| 格子 | 2×3 = 6 格，顯示方塊 sprite + 數量 | `world.player.inventory` |

### 繪製規格

```
外框：stroke=#CD7F32（銅色）2px, fill=rgba(0,0,0,0.7)
面板寬 160px, 高 200px

標題行：font 12px, fill=#CD7F32
  "背包承重：" + currentWeight + "/" + maxWeight

格子 2 列 × 3 行（每格 60×52, gap=4）：
  空格：fill=rgba(60,40,20,0.5), stroke=#8B6914
  有物品：
    方塊 sprite 置中 32×32
    右下角數量文字：font bold 10px, fill=#FFF, shadow
  重量已滿時邊框閃紅

承重計算：
  currentWeight = Σ(inventory[blockKey] × BLOCKS[blockKey].weight)
```

### 數據來源
- `world.player.inventory`：`{ blockKey: qty }`
- `BLOCKS[blockKey].weight`：每塊重量
- `cfg.player.carry`：承重上限（50）
- `cfg.player.backpackSlots`：格數上限（6）

---

## E. 核心數值面板（下方中央偏左）

### 位置
- 底部中央偏左，在背包右側、快捷列上方

### 內容

顯示核心建築的即時數值（由方塊堆疊加成計算）。

| 顯示行 | 格式 | 數據來源 |
|---|---|---|
| 第 1 行 | `攻擊力：X　攻速(每秒)：Y` | `coreStats.attack`, `coreStats.attackSpeed` |
| 第 2 行 | `攻擊範圍：X` | `coreStats.range` |
| 第 3 行 | `防禦力：X (抵擋Y%)` | `coreStats.defense`, 減傷公式 |
| 第 4 行 | `靈力增幅：X%` | 靈動能力換算（spirit / 100 × 10%） |
| 第 5 行 | `魔法攻擊：X` | `coreStats.magicPct` |
| 第 6 行 | `連鎖：X` | `coreStats.chain` |

### 繪製規格

```
外框：stroke=#999 1px, fill=rgba(0,0,0,0.75)
面板寬 260px, 高 ~110px
padding: 6px

第 1 行分兩段：
  左段 "攻擊力：{attack}"  font bold 12px #FFF
  右段 "攻速(每秒):{attackSpeed}" font 12px #CCC
  中間用空格分開

第 2-6 行：font 12px #CCC, lineHeight=16px
  防禦減傷% = defense / (defenseK + defense) × 100（defenseK=100）
  靈力增幅% = (spirit / 100) × 10 + (singlePlayer ? 15 : 0)
```

### 防禦減傷公式
```javascript
const reductionPct = (defense / (cfg.core.defenseK + defense)) * 100;
// 顯示：防禦力：{defense} (抵擋{reductionPct.toFixed(0)}%)
```

---

## F. 敵人情報面板（右下角）

### 位置
- 右下角，在「開發者+版本」和「EXIT」按鈕上方

### 內容

| 元素 | 說明 | 數據來源 |
|---|---|---|
| 標題 | `進攻人數` | — |
| 當前波 | `當前波 X-Y` + 敵人種類清單 | `world.stage`, `world.enemies` |
| 下一波 | `下一波 X-Y` + 預覽敵人種類 | `world.stage + 1`, `config/waves.js` |

### 繪製規格

```
外框：stroke=#666 1px, fill=rgba(0,0,0,0.75)
面板寬 260px, 高 ~80px
padding: 6px

標題：font bold 12px #F44336（紅）
  "進攻人數"

當前波：font 11px #FFF
  "當前波{十位}-{個位} {怪種}x{數量} [血量{hp}]"
  多種怪以空格分隔

下一波：font 11px #AAA
  "下一波{十位}-{個位} {怪種}x{數量} [血量{hp}]"
```

### 敵人顯示格式
```
每種敵人格式：{zh}x{count} [血量{hpMax}]
範例：平民x5 [血量30] 猛男x1 [血量50]

當前波統計：從 world.enemies 按 key group by，計算各種類存活數量
下一波預覽：用 buildWave(stage+2) 預算（純預覽，不影響遊戲狀態）
```

---

## G. 資源條 + 快捷列（底部中央）

### 位置
- 底部水平置中，在核心數值面板下方

### 子元素

#### G-1. 經驗/卡片/金幣 行
```
位置：快捷列上方，左對齊
格式："累計經驗：{xp}XP，累計卡片：{cards}張，累計金幣：{gold}"
字體：font 11px #FFD700
數據：world.totalXP, world.totalCards, world.totalGold（未來實裝）
```

#### G-2. 綠色資源條
```
位置：快捷列正上方
寬度：與快捷列等寬
分段顏色條，每段代表一種已放置方塊的比例
  沙=黃綠 #C8E64E, 土=棕 #8B6914, 石=灰 #9E9E9E
  鐵=深灰 #607D8B, 金=金 #FFD700, 琉璃=青 #00BCD4, 鑽=藍紫 #9C27B0
高度：6px
數據：world.blockCounts（各方塊已放置比例）
```

#### G-3. 快捷列（Item Bar）

即目前已實裝的 hotbar，但需要擴展：

```
目前 7 格（config.hotbar）→ mockup 顯示約 10 格
每格 40×40, gap=4
內容：
  方塊 sprite 32×32 置中
  右下角數量：font bold 12px #FFF（帶陰影）
  左上角快捷鍵：font 10px（桌面模式顯示 1~0）
  選中態：金色邊框 #D4A017 2px + 半透明金色背景

最右側 "..." 按鈕：展開更多物品（未來功能）

數據：world.storage[blockKey]（塔內資源欄）
```

---

## H. 底部固定元素

### H-1. 開發者 + 版本（右下角）
```
位置：右下角 padding 8px，EXIT 按鈕左側
格式："Yes, Master! {version}"
字體：font 11px #666
數據：GAME_CONFIG.version
```

### H-2. EXIT 按鈕（最右下角）
```
位置：最右下角
樣式：紅色邊框矩形，文字 "EXIT"
  border: 2px solid #F44336
  color: #F44336
  font: bold 14px
  padding: 4px 12px
  hover: fill=#F44336, color=#FFF
功能：回到 splash 畫面（退出當前遊戲）
```

---

## Codex 實作任務（分批執行）

> **執行模式**：Codex 5.5 high，每批獨立 commit。
> **共用規則**：
> - 所有繪製加在 `src/render/renderer.js`，作為 `Renderer` 類別的新方法。
> - 不建新檔。通用工具函式（`drawPanel` / `drawBar`）作為 renderer.js 頂部的 module-level helper。
> - **不動** `_drawDesktopHotbar`（快捷列已完成）。
> - **不動手機模式**（touchControls.js / mobileLayout.js 不在本計劃範圍）。
> - 未來才有數據的欄位（spirit / equipment / totalXP / totalGold / totalCards / players[]）：**畫空位佔格，顯示 `—` 或 `0`**，不要跳過不畫。
> - 色碼、字型、尺寸嚴格按本文件「UI 樣式規範」章節。
> - 每個 `_draw*` 方法開頭必須 `ctx.save()`，結尾 `ctx.restore()`。
> - 必須 import `BLOCKS` from blocks.js（已有）、`GAME_CONFIG` from gameConfig.js（已有）。
> - 需要 `buildWave` 預覽下一波時，import `{ buildWave }` from `../../src/logic/waveGen.js`。

---

### Batch 1 — 通用工具 + C. 波次計時器

**目標**：建立通用繪製工具 + 右上角波次/計時器面板。

#### Step 1：在 renderer.js 頂部（import 區下方）加入 module-level helper

```javascript
function drawPanel(ctx, x, y, w, h, opts = {}) {
  ctx.fillStyle = opts.bg ?? 'rgba(0,0,0,0.75)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = opts.border ?? '#666';
  ctx.lineWidth = opts.borderWidth ?? 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawBar(ctx, x, y, w, h, pct, color, opts = {}) {
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * Math.min(1, pct)), h);
  if (opts.text) {
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFF';
    ctx.fillText(opts.text, x + w / 2, y + h / 2);
  }
}
```

#### Step 2：新增 `_drawWaveTimer(world)` 方法

**位置**：右上角，padding 8px，右對齊。
**面板尺寸**：約 200×80。

**繪製內容**（從上到下）：

1. **關卡編號**：`關卡 {十位}-{個位}`（font 12px #FFD700）
   ```
   const stage = world.stage ?? 0;
   const set = Math.floor(stage / 10) + 1;
   const num = (stage % 10) + 1;
   → "關卡 {set}-{num}"
   ```

2. **波次進度點**：10 個圓點，gap=4，每個 r=5
   ```
   stageInSet = stage % 10;  // 0~9
   i < stageInSet   → fill=#4CAF50（已通過）
   i === stageInSet  → fill=#FFF 描邊（目前關）
   i > stageInSet    → fill=#555（未到）
   i === 9           → fill=#FF9800（Boss 位），已通過仍用綠
   第 8 與第 9 點之間畫 1px 分隔線
   ```

3. **倒數計時器**：`[MM:SS]`（font bold 16px monospace）
   ```
   const t = world.phaseTimer ?? 0;
   const mm = String(Math.floor(t / 60)).padStart(2, '0');
   const ss = String(Math.floor(t % 60)).padStart(2, '0');
   prep → fill=#FFF
   night → fill=#FF6B6B
   overtime → fill=#FF0000，每 0.5 秒閃爍（用 Date.now() % 1000 < 500 判斷）
   ```

4. **階段文字**：`準備中` / `夜晚` / `加時賽`（font 12px #AAA）

#### Step 3：在 `render(world)` 方法中呼叫

找到 `if (this.cfg.render.drawCanvasHud !== false) this._drawHud(world);` 這行，在它**之後**加：
```javascript
if (this.cfg.render.drawCanvasHud !== false) this._drawWaveTimer(world);
```

#### 驗收
- 右上角出現面板，顯示關卡編號 + 10 個進度點 + 倒數 + 階段
- prep/night/overtime 各階段文字和顏色正確
- 不影響現有 HUD 和快捷列

---

### Batch 2 — E. 核心數值面板 + H-1. 版本標籤

**目標**：底部中央偏左的核心數值面板 + 右下角版本標籤。

#### Step 1：新增 `_drawCoreStatsPanel(world)` 方法

**位置**：底部，x 在快捷列左邊緣對齊，y 在快捷列上方（留 4px gap）。
**面板尺寸**：260×110。

**繪製內容**（6 行，lineHeight=16px）：

```
第 1 行：攻擊力：{attack}　　攻速(每秒)：{attackSpeed}
         左段 bold 12px #FFF，右段 12px #CCC
第 2 行：攻擊範圍：{range}
第 3 行：防禦力：{defense} (抵擋{reductionPct}%)
         reductionPct = defense / (100 + defense) × 100，toFixed(0)
第 4 行：靈力增幅：—%
         （world.player.spirit 尚未實裝，顯示 "—"）
第 5 行：魔法攻擊：{magicPct}%
第 6 行：連鎖：{chain}
```

**數據來源**：全部從 `world.coreStats.*` 讀取，用 `toFixed(1)` 或 `toFixed(2)` 格式化。

#### Step 2：新增 `_drawVersionLabel()` 方法

**位置**：右下角 padding 8px。
**內容**：`Yes, Master! {GAME_CONFIG.version}`
**樣式**：font 11px #666，textAlign=right。

#### Step 3：在 render pipeline 中呼叫

在 `_drawWaveTimer` 呼叫之後加：
```javascript
if (this.cfg.render.drawCanvasHud !== false) {
  this._drawCoreStatsPanel(world);
  this._drawVersionLabel();
}
```

#### Step 4：從舊 `_drawHud` 移除重複資訊

`_drawHud` 的 `leftLines` 中，`coreLine`（核心 HP/ATK/攻速/DEF）和 `coreLine2`（範圍/魔法/連鎖）已被新面板取代。
**移除 `coreLine` 和 `coreLine2`**，只保留背包/塔內/已放置。
同時把 `rightLines` 的 `fatigueLine` 也移除（疲勞將在 Batch 3 的玩家面板顯示）。

#### 驗收
- 快捷列上方出現核心數值面板，6 行數值正確
- 右下角顯示 "Yes, Master! v0.0.13.0"
- 舊 HUD 不再重複顯示核心數值和疲勞

---

### Batch 3 — A. 玩家面板 + F. 敵人情報

**目標**：左上角玩家面板（HP/疲勞條）+ 右下角敵人情報面板。

#### Step 1：新增 `_drawPlayerPanel(world)` 方法

**位置**：左上角 padding 8px。
**面板尺寸**：約 210×80。

**繪製內容**：

1. **頭像佔位圓**：cx=40, cy=40, r=32, stroke=#333 2px, fill=rgba(60,60,60,0.5)
   - 圓內畫一個文字 `👺`（font 28px，textAlign center，textBaseline middle）作為 MVP 哥布林佔位
   - 未來替換為角色 sprite

2. **HP 條**（綠）：x=80, y=16, w=120, h=14
   - pct = `world.coreHp / world.coreStats.hpMax`
   - color = `#4CAF50`
   - text = `{coreHp}/{hpMax}`（取整）

3. **靈力條**（藍）：x=80, y=34, w=56, h=10
   - 尚未實裝，pct=0，color=#2196F3
   - 不顯示文字，條內空白

4. **疲勞條**（紅）：x=142, y=34, w=56, h=10
   - pct = `world.player.fatigue / cfg.player.fatigueMax`
   - color = `#F44336`
   - text = `{fatigue}/{fatigueMax}`（取整）

5. **裝備槽 ×3 佔位**：y=56, 各 40×20, gap=6
   - 3 個空矩形，邊框分別 #FFD700 / #FF9800 / #E91E63
   - 內部 fill=rgba(0,0,0,0.3)
   - 未來裝備系統實裝後填入圖示

#### Step 2：新增 `_drawEnemyInfo(world)` 方法

**位置**：右下角，版本標籤上方。
**面板尺寸**：260×80。

**繪製內容**：

1. **標題**：`進攻人數`（font bold 12px #F44336）

2. **當前波**：統計 `world.enemies` 中存活敵人
   ```javascript
   const counts = {};
   for (const e of world.enemies ?? []) {
     counts[e.key] = (counts[e.key] ?? 0) + 1;
   }
   // 顯示每種：{ENEMIES[key].zh}x{count}
   // 格式：font 11px #FFF
   // 無敵人時顯示 "— 無敵人"
   ```
   需要 import `{ ENEMIES }` from `../../config/enemies.js`。

3. **下一波預覽**：
   ```javascript
   // 用 buildWave 預算下一波組成
   import { buildWave } from '../../src/logic/waveGen.js';
   // 在方法內：
   const nextStage = (world.stage ?? 0) + 1;
   // buildWave(nextStage, cfg, rng) — 但需要 rng，預覽僅顯示怪種和數量
   // 簡化：直接從 WAVES config 讀取 wave.enemies 欄位
   ```
   - 如果取不到下一波資料（超過 30 關），顯示 `— 最終波已過`
   - 格式：font 11px #AAA

#### Step 3：在 render pipeline 中呼叫

```javascript
if (this.cfg.render.drawCanvasHud !== false) {
  this._drawPlayerPanel(world);
  this._drawEnemyInfo(world);
}
```

#### Step 4：從舊 `_drawHud` 移除重複

- `rightLines` 中的 `enemyLine`（敵人數 + 最近命中）已被 F 面板取代，移除。
- `leftLines` 中核心 HP 已被 A 面板的 HP 條取代（Batch 2 已移除 coreLine，此處確認）。

#### 驗收
- 左上角出現玩家面板：頭像圓 + HP 綠條 + 靈力藍條（空）+ 疲勞紅條 + 3 個裝備空格
- 右下角出現敵人情報：當前波怪種統計 + 下一波預覽
- 進入夜晚後敵人數即時更新

---

### Batch 4 — D. 背包 + G-2. 資源條 + G-1. 統計行 + H-2. EXIT

**目標**：左下角背包面板 + 快捷列上方資源條和統計行 + EXIT 按鈕。

#### Step 1：新增 `_drawBackpack(world)` 方法

**位置**：左下角 padding 8px。
**面板尺寸**：160×200，邊框 #CD7F32（銅色）2px。

**繪製內容**：

1. **標題**：`背包承重：{currentWeight}/{maxWeight}`（font 12px #CD7F32）
   ```javascript
   import { inventoryWeight } from '../logic/inventory.js'; // 已有 import
   const currentWeight = inventoryWeight(world.player.inventory);
   const maxWeight = world.player.capacity;
   ```

2. **2×3 格子**：每格 60×52, gap=4
   ```javascript
   const hotbar = this.cfg.hotbar ?? [];
   // 遍歷 world.player.inventory 的 key，按 hotbar 順序排列
   // 每格：
   //   空格 → fill=rgba(60,40,20,0.5), stroke=#8B6914
   //   有物品 → 用 this._drawBlockIcon(blockKey, x, y, 32) 畫方塊 sprite
   //            右下角數量 font bold 10px #FFF
   //   承重已滿（currentWeight >= maxWeight）→ 整個面板邊框閃紅
   ```

#### Step 2：新增 `_drawResourceBar(world)` 方法

**位置**：快捷列正上方，與快捷列等寬。
**高度**：6px。

```javascript
// 讀取 world.blockCounts（各方塊已放置數量）
const total = Object.values(world.blockCounts ?? {}).reduce((s, v) => s + v, 0);
if (total === 0) return; // 沒放方塊不畫
// 顏色表：
const BAR_COLORS = {
  sand: '#C8E64E', dirt: '#8B6914', stone: '#9E9E9E',
  iron: '#607D8B', gold: '#FFD700', glass: '#00BCD4', diamond: '#9C27B0',
};
// 按比例畫分段色條
let offsetX = barStartX;
for (const [key, count] of Object.entries(world.blockCounts ?? {})) {
  if (!count) continue;
  const segW = Math.round((count / total) * barTotalW);
  ctx.fillStyle = BAR_COLORS[key] ?? '#888';
  ctx.fillRect(offsetX, barY, segW, 6);
  offsetX += segW;
}
```

#### Step 3：新增 `_drawXpGoldBar(world)` 方法

**位置**：資源條上方。
**內容**：`累計經驗：{xp}XP，累計卡片：{cards}張，累計金幣：{gold}`
**樣式**：font 11px #FFD700，textAlign=left。
**數據**：`world.totalXP ?? 0` / `world.totalCards ?? 0` / `world.totalGold ?? 0`（目前全部顯示 0）。

#### Step 4：新增 `_drawExitButton()` 方法

**位置**：最右下角，版本標籤右側。
**樣式**：
```
border: 2px solid #F44336
color: #F44336
font: bold 14px sans-serif
padding: 4px 12px
文字: "EXIT"
```
**功能**：目前僅繪製，不接點擊事件（點擊功能留待後續實裝）。

#### Step 5：在 render pipeline 中呼叫

```javascript
if (this.cfg.render.drawCanvasHud !== false) {
  this._drawBackpack(world);
  this._drawResourceBar(world);
  this._drawXpGoldBar(world);
  this._drawExitButton();
}
```

#### Step 6：從舊 `_drawHud` 移除重複

- `leftLines` 中的背包行（`背包 {weight}/{capacity} {items}`）和塔內行（`塔內 {items}`）和已放置行（`已放置 {items}`）已被新面板取代，移除。

#### 驗收
- 左下角出現銅色背包面板，2×3 格子正確顯示背包物品
- 快捷列上方出現分段色條
- 色條上方出現經驗/卡片/金幣行（全部顯示 0）
- 右下角出現紅色 EXIT 按鈕
- 背包滿時邊框閃紅

---

### Batch 5 — 整合清理

**目標**：移除舊 `_drawHud` 中所有已被新面板取代的內容，整理 render pipeline。

#### Step 1：清理 `_drawHud`

經過 Batch 2-4 的移除，`_drawHud` 應該只剩：
- `phaseLine`（階段/波次文字）— 已被 C 面板取代
- `modeLine`（建造/挖礦模式提示）— **保留**，這是操作提示
- 背包/核心/疲勞/敵人 — 全部已移除

**最終 `_drawHud` 只保留 `modeLine`（建造/挖礦模式文字提示）和 plan/destroy 狀態提示。**

如果 `_drawHud` 只剩 modeLine，可以簡化為 `_drawModeHint(world)`，畫在快捷列上方或下方。

#### Step 2：統一 render pipeline 順序

在 `render(world)` 方法的 HUD 區域，按此順序呼叫：
```javascript
if (this.cfg.render.drawCanvasHud !== false) {
  this._drawPlayerPanel(world);     // 左上
  // B 區隊友列：暫不呼叫（多人模式後實裝）
  this._drawWaveTimer(world);       // 右上
  this._drawBackpack(world);        // 左下
  this._drawCoreStatsPanel(world);  // 下中左
  this._drawEnemyInfo(world);       // 右下
  this._drawResourceBar(world);     // 快捷列上方
  this._drawXpGoldBar(world);       // 資源條上方
  this._drawDesktopHotbar(world);   // 下中（已有）
  this._drawModeHint(world);        // 建造/挖礦模式提示
  this._drawVersionLabel();         // 右下角
  this._drawExitButton();           // 最右下
}
```

#### Step 3：移除舊 `_drawHud` 和 `_drawHudLine`

如果 `_drawHud` 已完全清空（所有內容轉移到新面板），刪除 `_drawHud` 和 `_drawHudLine` 方法。
保留 `_phaseLine` helper 如果仍被其他地方使用。

#### 驗收
- 遊戲畫面無任何重複資訊
- 所有面板正確顯示在對應位置，無重疊
- 建造模式/挖礦模式提示文字仍正確顯示
- 手機模式（touchControls）不受影響

---

### 暫不實作（佔位空格，未來加入）

| 區塊 | 原因 | 實裝時機 |
|---|---|---|
| **B. 隊友列** | 需要 PeerJS 多人連線 `world.players[]` | 多人連線骨架完成後 |
| **A. 裝備槽內容** | 需要裝備系統 `world.player.equipment` | 裝備系統實裝後 |
| **A. 靈力條數值** | 需要 `world.player.spirit` 接入 | 靈動系統實裝後 |
| **G-1. 經驗/卡片/金幣實際數據** | 需要 `world.totalXP` 等累計欄位 | 累計統計系統後 |
| **H-2. EXIT 點擊事件** | 需要回到 splash 的流程 | 退出功能實裝後 |

---

## 技術實作方案

### 渲染方式：Canvas HUD（維持目前架構）

所有 UI 繪製在 `renderer.js` 的 HUD 繪製流程中，使用 `ctx` 直接繪製。
好處：不需 DOM 覆蓋層，效能最佳，與現有 `_drawHudLine` / `_drawDesktopHotbar` 一致。

### 新增方法結構

```javascript
// renderer.js 新增
_drawPlayerPanel(world)      // A 區
_drawPartyBar(world)         // B 區（多人模式）
_drawWaveTimer(world)        // C 區
_drawBackpack(world)         // D 區
_drawCoreStatsPanel(world)   // E 區
_drawEnemyInfo(world)        // F 區
_drawResourceBar(world)      // G-2
_drawXpGoldBar(world)        // G-1
_drawExitButton()            // H-2
_drawVersionLabel()          // H-1
```

### 渲染 pipeline 整合

```javascript
// 在 _renderHud(world) 中按順序呼叫：
_drawPlayerPanel(world);     // 左上
_drawPartyBar(world);        // 上中
_drawWaveTimer(world);       // 右上
_drawBackpack(world);        // 左下
_drawCoreStatsPanel(world);  // 下中左
_drawEnemyInfo(world);       // 右下
_drawResourceBar(world);     // 快捷列上方
_drawXpGoldBar(world);       // 資源條上方
_drawDesktopHotbar(world);   // 下中（已有）
_drawVersionLabel();         // 右下角
_drawExitButton();           // 最右下
```

### 數據需求（world 新增欄位）

| 欄位 | 類型 | 說明 | 階段 |
|---|---|---|---|
| `world.totalXP` | number | 累計經驗值 | Phase 3 |
| `world.totalCards` | number | 累計獲得卡片數 | Phase 3 |
| `world.totalGold` | number | 累計金幣 | Phase 3 |
| `world.player.spirit` | number | 靈動能力值 | Phase 2 |
| `world.player.equipment` | object | 裝備插槽 | Phase 4 |
| `world.players[]` | array | 多人玩家列表 | Phase 4 |
| `world.nextWavePreview` | object | 下一波預覽資料 | Phase 2 |

### 已可直接使用的數據

| 數據 | 來源 | 對應 UI |
|---|---|---|
| 核心 HP | `world.coreHp` / `world.coreStats.hpMax` | A 區 HP 條 |
| 疲勞 | `world.player.fatigue` / `cfg.player.fatigueMax` | A 區疲勞條 |
| 核心數值 | `world.coreStats.*` | E 區全部 |
| 已放置方塊 | `world.blockCounts` | G-2 資源條 |
| 背包 | `world.player.inventory` | D 區 |
| 塔內資源 | `world.storage` | G-3 快捷列 |
| 階段/波次 | `world.phase` / `world.stage` / `world.phaseTimer` | C 區 |
| 敵人列表 | `world.enemies` | F 區 |
| 版本號 | `GAME_CONFIG.version` | H-1 |

---

## UI 樣式規範

### 色彩系統

| 用途 | 色碼 | 說明 |
|---|---|---|
| HP 綠 | `#4CAF50` | 血量條 |
| 靈力藍 | `#2196F3` | 靈動/魔法條 |
| 疲勞紅 | `#F44336` | 疲勞條 |
| 金色高亮 | `#FFD700` | 選中態、金幣、經驗 |
| 面板背景 | `rgba(0,0,0,0.75)` | 統一半透明黑底 |
| 面板邊框 | `#666` / `rgba(255,180,0,0.25)` | 統一灰/暗金 |
| 銅色（背包） | `#CD7F32` | 背包面板專用 |
| 危險紅 | `#FF0000` | 加時閃爍、EXIT |
| 文字主色 | `#FFFFFF` | 主要資訊 |
| 文字副色 | `#AAAAAA` | 次要資訊 |
| 文字暗色 | `#666666` | 版本號等不重要文字 |

### 字型規範

| 用途 | 規格 |
|---|---|
| 數值標題 | `bold 12px sans-serif` |
| 數值內容 | `12px sans-serif` |
| 條上文字 | `bold 10px sans-serif` |
| 小標籤 | `10px sans-serif` |
| 計時器 | `bold 16px monospace` |
| 快捷鍵 | `bold 10px sans-serif` |

### 通用面板樣式

```javascript
function drawPanel(ctx, x, y, w, h, opts = {}) {
  ctx.fillStyle = opts.bg ?? 'rgba(0,0,0,0.75)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = opts.border ?? '#666';
  ctx.lineWidth = opts.borderWidth ?? 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawBar(ctx, x, y, w, h, pct, color, opts = {}) {
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * Math.min(1, pct)), h);
  if (opts.text) {
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFF';
    ctx.fillText(opts.text, x + w / 2, y + h / 2 + 3);
  }
}
```

---

## 響應式考量

### 桌面模式（800×600 viewport）
- 所有面板使用固定像素定位（如上述規格）
- 面板之間保持至少 8px 間距，避免重疊

### 手機模式
- 手機已有 DOM overlay（touchControls.js / mobileLayout.js）
- Canvas HUD 可透過 `cfg.render.drawCanvasHud` 開關
- 手機 UI 獨立處理，不在本計劃範圍（另建 mobile-ui-plan）

### 面板重疊防護
```
viewport 800×600 分區：
  左上 200×100  → A 玩家面板
  上中 360×50   → B 隊友列
  右上 200×80   → C 波次計時器
  左下 170×210  → D 背包
  下中 270×120  → E 核心數值
  下中 全寬×70  → G 快捷列+資源條
  右下 270×90   → F 敵人情報
  右下角 固定    → H 版本+EXIT
```

---

## Mockup 參照對照表

| Mockup 元素 | 計劃區塊 | 實作 Phase |
|---|---|---|
| 大圓頭像 + HP/藍/紅條 | A. 玩家面板 | Phase 2 |
| 黃/橘/粉三格 | A. 裝備槽 | Phase 4 |
| 上方三人小頭像+條 | B. 隊友列 | Phase 4 |
| 【・・・・|🔵】+ 倒數 | C. 波次計時器 | Phase 1 |
| 背包承重 0/50 + 2×3 格 | D. 背包面板 | Phase 3 |
| 攻擊力/攻速/防禦/靈力/魔攻/連鎖 | E. 核心數值面板 | Phase 1 |
| 累計經驗/卡片/金幣 | G-1. 統計行 | Phase 3 |
| 綠黃資源條 | G-2. 資源條 | Phase 3 |
| 底部物品列 + 數量 | G-3. 快捷列 | Phase 1 |
| 進攻人數 + 當前波/下一波 | F. 敵人情報 | Phase 2 |
| 開發者+版本 | H-1. 版本標籤 | Phase 1 |
| EXIT 紅色按鈕 | H-2. EXIT 按鈕 | Phase 3 |
