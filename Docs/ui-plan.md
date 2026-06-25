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

## 實作優先順序

### Phase 1 — 核心資訊（最高優先）
1. **C. 波次/計時器**（右上角）— 玩家最需要的進度資訊
2. **E. 核心數值面板** — 取代目前的純文字 HUD
3. **G-3. 快捷列升級** — 在現有 hotbar 基礎上優化

### Phase 2 — 戰鬥資訊
4. **F. 敵人情報面板** — 了解當前/下一波威脅
5. **A. 玩家面板**（HP/疲勞條）— 圖形化取代純文字

### Phase 3 — 背包與資源
6. **D. 背包面板** — 挖礦背包視覺化
7. **G-2. 資源條** — 方塊比例可視化
8. **G-1. 經驗/卡片/金幣** — 累計統計顯示

### Phase 4 — 多人與裝備
9. **B. 隊友列** — PeerJS 多人同步後
10. **A. 裝備槽** — 裝備系統實裝後
11. **H-2. EXIT 按鈕** — 退出功能

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
