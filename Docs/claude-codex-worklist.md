# Claude ↔ Codex MVP 開工協作清單
> 狀態：MVP 實作中（v0.0.5.0）
> 最後更新：2026-06-24
> 用途：單一交接看板。Claude 負責架構/純邏輯/骨架；Codex 負責數值/平衡填表。
> 規則：**config/ 檔案就是雙方的交接介面**。Codex 把數值填進 config，Claude 的純邏輯層消費，互不踩線。

---

## 0. 一眼看懂分工

| 方 | 負責 | 產出位置 |
|---|---|---|
| **Claude** | 三維度地圖、連通性、核心戰鬥、波次/卡片邏輯、存檔、渲染/輸入 | `src/` + `config/` 的「結構」 |
| **Codex** | 敵人基礎數值、怪物移速、資源卡換算、21-30 seed | 把數字填進 `config/` 已留好的 TODO 欄位 |

> Codex 不需要碰 `src/`。只要把 `config/` 裡標 `// TODO(Codex)` 的 `null` 填成數字即可。
> 純邏輯規則見 `.claude/instructions.md` 鐵則 9 與 `Docs/game-architecture-plan.md`「程式碼分層原則」。

---

## 1. Codex 任務清單（標 🔴 = 擋實作，先做）

### A. 敵人基礎數值正式表 ✅ 已填

**檔案**：`config/enemies.js`
**現況**：結構已建好；`身高 / 攻擊距離 / 防禦` 我已依設計文件預填，**`hp / attack / moveSpeed` 是 `null`，等你填**。

要填的欄位（每種敵人都要）：

| 敵人 key | 待填 | 已預填（勿改，除非要改設計） |
|---|---|---|
| `civilian`（平民） | `hp` `attack` `moveSpeed` | height 2, attackRange 1, defense 0 |
| `runner`（跑者） | `hp` `attack` `moveSpeed` | height 3, attackRange 1, defense 0 |
| `brute`（猛男） | `hp` `attack` `moveSpeed` | height 3, attackRange 1, defense 0 |
| `shielder`（盾兵） | `hp` `attack` `moveSpeed` | height 3, attackRange 1, defense 30 |
| `sapper`（工兵） | `hp` `attack` `moveSpeed` `attackRange` | height 3（遠程，attackRange 可能 >1，請一併定） |
| `boss10`（小隊長） | `hp` `attack` `moveSpeed` | height 4, attackRange 1 |
| `boss20` | `hp` `moveSpeed` | height 4, attackRange 2, attack 6（已定，多人門檻見 waveplan） |
| `boss30` | `hp` `attack` `moveSpeed` | height 4, attackRange 2 |

**唯一基準**：`Docs/waveplan.md` 的「敵人成長規則」+ `Docs/simulation/simulation-log-2.md` 的測試基準。
**注意**：請給「**第 1-10 關不成長**」的基礎值；11-20 成長、21-30 增壓由我的 `waveGen` 程式自動套（你只給 base，不要把成長乘進去）。

### B. 怪物移動速度定案 ✅ 已填

**檔案**：同上 `config/enemies.js` 每隻的 `moveSpeed`（格/秒）。
**現況**：設計文件目前假設 5 格/秒（玩家基礎移速），標 ⚠️ 未定案。請逐隻確認（跑者應該比平民快）。

### C. 資源型卡片「挖掘量數」→ 實際方塊數量 ✅ 已填

**檔案**：`config/cards.js`，8 張資源型卡片的 `effect.grant` 目前是 `null`。
**要做**：把「2000 挖掘量數」換算成各方塊實際給幾顆（例：土耐久 50 → 2000/50 = 40 顆土？換算公式由你定）。
**牽涉卡片**：老礦工手感、右礦通行證、土倉補給、鐵石補強、沙眼備料（含偏向的方塊種類比例）。

### D. 21-30 阻擋區固定 seed ✅ 已填

**檔案**：`config/waves.js` 的 `blockerBand.seed`（目前 `null`）。
**要做**：釘一個固定整數 seed，讓 +15~25% 血、+10~20% 攻的隨機序列可重現（waveplan.md:192 要求）。

---

---

## 1B. Step 7 Codex 任務（🔴 = 必做，可動 `src/`）

> 與 1 不同：Step 7 任務需要修改 `src/`。架構/骨架 Claude 已建好，Codex 填入實作。

### Step 7A（出怪 + 晝夜狀態機）— 全部先做完再測

#### ① `_buildPendingSpawns`（`src/game/phaseRuntime.js`）
把 `buildWave` 的 `{ enemies, schedule }` 組成出怪佇列：
- `schedule` 是 `[{ second: N, count: M }]`（0~4 秒分 5 批）
- 依 schedule 把 `wave.enemies` 切成批次，每批取 `count` 隻
- 用 `spawnPositions(count, world, cfg, rng)` 取得每隻的 `{ x, y }`
- 把 `x, y` 合入 enemy def，組成 `{ atSecond, defs: [{...enemy, x, y}] }`
- 函式簽名、骨架、TODO 註解見 phaseRuntime.js 中的 `_buildPendingSpawns`

#### ② 夜晚分批出怪（`src/game/phaseRuntime.js`，`_updateNight` 內）
- 每幀取 `world.pendingSpawns` 中 `atSecond <= world.nightElapsed` 的批次
- 把 def push 成完整 enemy 物件到 `world.enemies`（格式見 phaseRuntime.js TODO 範例）
- 取出後從 `world.pendingSpawns` 刪除
- 骨架 + 偽碼已在 `_updateNight` 的 TODO 註解內

#### ③ 礦山避讓（`src/logic/spawnPosition.js`）
- 若 x 落在任一 mineZone `[min, max]` 內 → 往外推到 `min-1` 或 `max+1`
- TODO 位置與偽碼已在 `spawnPositions` 的 TODO 註解內

#### ④ 怪物改追核心（`src/game/combatRuntime.js`，`updateEnemies`）
目前怪追 `world.player`，要改成追最近核心格（`world.core` 陣列，每格 `[cx, cy]`）：
- 找 `world.core` 中距離 enemy 最近的格
- 移向該格；到達 `enemy.attackRange` 格內時停止移動、轉為攻擊

#### ⑤ 怪物攻擊核心（`src/game/combatRuntime.js`，`updateEnemies`）
- 每隻 enemy 在 `createEnemy` 初始化時加 `attackCooldown: 0`
- `updateEnemies` 中若距最近核心格 `<= enemy.attackRange` → 不移動
  - `enemy.attackCooldown -= dt`
  - `<= 0` 時呼叫 `_applyCoreDamage(world, enemy.attack * (world.combat?.overtimeMultiplier ?? 1))`
  - 重設 `enemy.attackCooldown = 2`（2 秒攻一次，見 waveplan.md）
- 需在 combatRuntime.js 頂部加：
  ```js
  import { damageCoreHp } from '../logic/coreHealth.js';
  function _applyCoreDamage(world, amount) {
    world.coreHp = damageCoreHp(world.coreHp ?? world.coreStats?.hpMax ?? 0, amount);
    if (world.coreHp <= 0) world.phase = 'gameover';
  }
  ```

### Step 7B（HUD + gameover/waveClear 畫面）— 7A 完成後做

#### ⑥ Phase / 波次 HUD（`src/render/renderer.js`，`_drawHud`）
在 HUD 最上方加一行，例：
- prep：`第 N 關　準備中（N.N s）　按 N 鍵開始夜晚`
- night：`第 N 關　夜晚 N.N s　敵人剩 M 隻`
- overtime：`加時 N.N s ⚠️　攻擊 xM 倍　敵人剩 M 隻`
- gameover：`GAME OVER　第 N 關　按 Q 重試`
- waveClear：只靠 phase=prep + stage 更新自動顯示，不需額外狀態

#### ⑦ gameover 全畫面遮罩（`src/render/renderer.js`，`render` 主函式）
- `world.phase === 'gameover'` 時，正常渲染後疊加半透明黑底 + 大字「GAME OVER」
- 不需要 HTML/CSS，直接用 canvas ctx 畫

---

### 完成後驗收（Codex 自查）

1. N 鍵 → 立即開始夜晚，怪物從地圖左右兩側出現、走向核心
2. 怪抵達核心附近 → 核心 HP 下降（HUD 可見）
3. 打完敵人 → stage++ → 回到 prep（HUD 顯示新關卡）
4. 核心 HP 歸零 → GAME OVER 遮罩
5. Q 鍵 → 清敵人、reset 到 prep、stage 不變（debug restart）
6. 加時賽期間 HUD 顯示 overtimeMultiplier 倍數
7. `node tests/` 全過（新加 spawnPosition / phaseRuntime 的 Node 測試）

---

## 2. Claude 任務進度（你不用管，給你對齊用）

| 步驟 | 狀態 |
|---|---|
| 1. config/gameConfig + 版本欄位 | ✅ |
| 2. 地圖/鏡頭/三維度座標 | ✅ 畫面骨架完成（world 狀態 + camera + 兩層 canvas render） |
| 3. 挖礦/背包/塔內資源 | ✅ 移動+滑鼠長按挖最近礦格→背包(承重/格數雙限)→站連通泥土自動入塔內；初始資源包入塔內；礦山10x3生成+補位；HUD 顯示。純邏輯：mineGen/inventory/mining |
| 4. 建造 + 連通性 BFS（`connectivity`） | ✅ 純邏輯完成 |
| 5. 核心數值換算（`coreStats`） | ✅ 純邏輯完成 |
| 6. 核心戰鬥（普攻/連鎖/傷害） | ✅ 純邏輯完成（消費 enemies.js，等 Codex A 填數才能跑） |
| 7. 波次/晝夜/加時（`waveGen`） | ✅ phaseRuntime / spawnPosition / waveGen / combatRuntime 全實作完成（v0.0.3.0） |
| 8. 王關/卡片（`cardOffer`） | ✅ cardOffer / cardEffect / resolveCardOffer 全實作完成（v0.0.4.0） |
| 9. 教學/localStorage 存檔 | ✅ saveManager / 新手教學提示 / GOBLIN NEST splash 完成（v0.0.5.0） |
| 10A. 掉落物系統（Claude） | ✅ drops.js 純函式 / collectDrops / updateMining 掉落邏輯 / renderer _drawDrops / saveManager 序列化（v0.0.6.0） |
| 10B. 卡片 UI polish（Codex） | ✅ _drawCardPanel hover glow + tier 中文化（稀有/普通/基礎）+ 版面精調（v0.0.6.0） |

---

## 3. 交接約定

- Codex 改 `config/` 數值 **不需** 動 `src/`、不需動版本號。
- 填完一項，把本檔第 1 節該項打勾並註明「已填」。
- 若發現結構不夠用（缺欄位）→ 在本檔留言，Claude 調 config 結構，不要自己改 `src/` 邏輯。
- 數值定案後，Codex 同步回 `Docs/waveplan.md` / `Docs/bosscard.md`（數值主檔），本檔只是交接看板。
