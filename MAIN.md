# MAIN.md — 函式級參考

> 版本：v0.0.2.0
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ MVP 單機骨架已開工；純邏輯層完成，渲染/輸入層多為 TODO。
> 規則：新增 / 刪除函式必須同步本檔（見 `.claude/instructions.md` 開發鐵則）。
>
> 註：原本的「planning 進入點 / source map」已移至 `Docs/source-map.md`。
> 規劃決策總索引：`Docs/planning-dashboard.md`。

---

## 1. 模組載入順序

```
index.html (type=module)
  └─ src/main.js  boot()  ← DOMContentLoaded 觸發
       ├─ config/gameConfig.js（角標/版本）
       ├─ src/render/renderer.js  new Renderer(canvas)
       └─ src/input/controls.js   new Controls(canvas)
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

### `src/storage/saveLocal.js`（IO 層）

| 函式 | 職責 |
|---|---|
| `loadSave()` / `writeSave(data)` / `clearSave()` | localStorage 讀寫；讀取跑 migration |

### `src/render/renderer.js` `src/input/controls.js` `src/main.js`

| 函式 | 職責 |
|---|---|
| `Renderer.render(state)` | TODO：步驟 2 鏡頭/三維度繪製 |
| `Controls.attach/detach` | TODO：步驟 3 WASD/挖礦輸入轉資料事件 |
| `boot()` | 入口：掛角標/版本、初始化各層 |
