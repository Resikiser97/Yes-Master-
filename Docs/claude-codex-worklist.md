# Claude ↔ Codex MVP 開工協作清單
> 狀態：MVP 實作中（v0.0.2.0 起）
> 最後更新：2026-06-22
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

## 2. Claude 任務進度（你不用管，給你對齊用）

| 步驟 | 狀態 |
|---|---|
| 1. config/gameConfig + 版本欄位 | ✅ |
| 2. 地圖/鏡頭/三維度座標 | ✅ 畫面骨架完成（world 狀態 + camera + 兩層 canvas render） |
| 3. 挖礦/背包/塔內資源 | 🟡 已接 WASD/方向鍵移動；挖礦/背包/塔內資源待接 |
| 4. 建造 + 連通性 BFS（`connectivity`） | ✅ 純邏輯完成 |
| 5. 核心數值換算（`coreStats`） | ✅ 純邏輯完成 |
| 6. 核心戰鬥（普攻/連鎖/傷害） | ✅ 純邏輯完成（消費 enemies.js，等 Codex A 填數才能跑） |
| 7. 波次/晝夜/加時（`waveGen`） | 🟡 邏輯完成，等 A/B/D 數值 |
| 8. 王關/卡片（`cardOffer`） | 🟡 邏輯完成，等 C 數值 |
| 9. 教學/localStorage 存檔 | 🔲 |

---

## 3. 交接約定

- Codex 改 `config/` 數值 **不需** 動 `src/`、不需動版本號。
- 填完一項，把本檔第 1 節該項打勾並註明「已填」。
- 若發現結構不夠用（缺欄位）→ 在本檔留言，Claude 調 config 結構，不要自己改 `src/` 邏輯。
- 數值定案後，Codex 同步回 `Docs/waveplan.md` / `Docs/bosscard.md`（數值主檔），本檔只是交接看板。
