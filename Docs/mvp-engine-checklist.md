# MVP 引擎開工 Checklist
> 建立：2026-06-30
> 用途：追蹤遊戲引擎（src/game/ + src/logic/）已實作的系統，與 MVP 可玩前還缺的部分。
> 基準文件：waveplan.md、bosscard.md、mvp-validation.md

---

## 已實作 ✅

### 核心 Loop
| 系統 | 檔案 | 說明 |
|---|---|---|
| 固定步進 Game Loop | `src/game/gameLoop.js` | RAF + 固定 dt，update/render 分離 |
| 階段狀態機 | `src/game/phaseRuntime.js` | prep→day→night→overtime→gameover/waveClear |
| 出怪排程 | `src/game/phaseRuntime.js` | _buildPendingSpawns，0~5 秒 5 批 |
| 加時賽每 5 秒翻倍 | `src/game/phaseRuntime.js` | overtimeMultiplier 正確實作 |

### 波次與成長
| 系統 | 檔案 | 說明 |
|---|---|---|
| 波次定義 | `config/waves.js` | 1-30 關波次表 |
| 敵人基礎數值 | `config/enemies.js` | hp/attack/moveSpeed 已填（Codex A/B ✅）|
| 波次生成（成長/多人倍率/Boss 規則） | `src/logic/waveGen.js` | hpGrowthMultiplier、flatAttackAdd、21-30 blocker band |
| 多人怪物 ×N 倍率 | `src/logic/waveGen.js` | isBoss ? playerCount : count×N |

### 戰鬥
| 系統 | 檔案 | 說明 |
|---|---|---|
| 敵人移動 + 攻核心 | `src/game/combatRuntime.js` | updateEnemies：追最近核心格 |
| 核心普攻 + 連鎖 | `src/game/combatRuntime.js` | updateCoreCombat：chain hit，VFX bolts |
| 核心傷害計算 | `src/logic/combat.js` | computeHit、selectPrimaryTarget |
| 死亡清除 | `src/game/combatRuntime.js` | pruneDeadEnemies（hp ≤ 0 → 過濾） |
| 核心 HP 管理 | `src/logic/coreHealth.js` | damageCoreHp、repairCoreHp |

### 玩家行動
| 系統 | 檔案 | 說明 |
|---|---|---|
| 挖礦（長按/離散敲擊） | `src/game/actions.js` | updateMining，進度持久化 |
| 卸貨（站核心地基自動） | `src/game/actions.js` | tryDeposit |
| 建造放置/拆除 + 連通性 | `src/game/actions.js` | tryPlace / tryRemove + BFS 驗證 |
| 矩形建造/拆除 | `src/game/actions.js` | tryPlaceRect / tryRemoveRect |
| 修復核心 | `src/game/actions.js` | updateRepair（站地基 + 消耗疲勞）|
| 掉落撿取 | `src/game/actions.js` | collectDrops |

### 卡片系統
| 系統 | 檔案 | 說明 |
|---|---|---|
| 18 張 MVP 卡池定義 | `config/cards.js` | tier / type / effect 全填 |
| 出卡規則（3 槽位 + 類型保護）| `config/cards.js` + `src/logic/cardOffer.js` | CARD_OFFER_RULES，偏強上限 1，三張同類型重抽第 3 |
| 卡片 effect 套用 | `src/logic/cardEffect.js` | coreStat / playerStat / resource / modifier 4 種全實作 |
| 王關觸發 / 卡片進入 | `src/game/phaseRuntime.js` | BOSS_STAGES = {10,20,30}，_enterCardOffer |
| 卡片選擇後套用 | `src/game/phaseRuntime.js` | resolveCardOffer → applyCardEffect → refreshCoreSnapshot |
| 資源型卡片（Codex C 換算）| `config/cards.js` | grant 已填（土/沙/石等方塊數量）✅ |

### 帳號 / 經濟（UI 層）
| 系統 | 檔案 | 說明 |
|---|---|---|
| 錢包讀寫 | `src/account/walletService.js` | creditWallet / spendWallet / canAfford |
| 裝備庫存 | `src/account/equipmentService.js` | getInventory / appendItem / replaceItemsWithResult |
| 合成 UI | `src/ui/synthesisPanel.js` | T13 ✅ v0.0.26.0 |
| 技能點 UI | `src/ui/skillPanel.js` | v0.0.23.0 ✅ |
| 抽獎盤 UI | `src/ui/gachaPanel.js` | v0.0.21.0 ✅ |

---

## 缺少 / 未實作 ⬜（MVP 必要）

### P0 — 遊戲可玩的最低限度

| 項目 | 說明 | 對應任務 |
|---|---|---|
| ~~怪物擊殺掉落銀幣~~ | ~~pruneDeadEnemies 後呼叫 WalletService.creditWallet~~ | ✅ **T14 已完成 v0.0.27.0**；⚠️ idempotencyKey = `kill:${enemy.id}`，跨局 enemy.id 可能重複，T15 加 sessionId 修正 |
| ~~關卡結算獎勵~~ | ~~_waveClear 後呼叫 creditWallet 給金幣+票券~~ | ✅ **T15 已完成 v0.0.28.0**；Boss 關漏領 bug 已修；sessionId idempotency 修正 |
| **遊戲場景 → 帳號 wallet 橋接** | 遊戲結束後，local game session 的獎勵要怎麼結算進帳號？目前不清楚 lobby.js / game.js 如何連接 | 架構確認 |

### P1 — 功能完整性

| 項目 | 說明 | 優先 |
|---|---|---|
| **cardModifiers 消費** | cards.js 有 modifier effect（nightRepairPct、nightMiningPct、heightCostPct 等），但 actions.js / phaseRuntime.js 沒有讀取並套用它們 | P1 |
| **Boss door attack** | enemies.js 有 `doorAttack: true`，但 combatRuntime.js 沒有判斷建築高度 ≥ 5 格後讓 Boss 從門口攻擊 | P1（模擬驗證前可暫不實作，純數值模擬不影響）|
| **卡片顯示標籤** | bosscard.md 已定義類型標籤/流派標籤/風險標籤，UI 目前是否顯示？ | P1 |
| **多人卡片投票 UI** | 多人房要讓所有玩家看到同一組卡、各自點選後多數決 | P1（P2P 架構已有，UI 需確認）|

### P2 — 非 MVP 必要

| 項目 | 說明 |
|---|---|
| **多人 kill drop 廣播** | 目前每個玩家各自 credit 本機 wallet，多人房 host 廣播 kill event 給 peer 是未來任務 |
| **銀幣技能點 × 收入交叉驗證** | 合成曲線 + 怪物掉落已定案，但未對照 gacha 收入總量跑完整模擬 |
| **第 20/30 關高階卡** | bosscard.md 已定放大規則，具體卡片值待模擬 |
| **加時賽 30 秒後強制 GameOver** | phaseRuntime 已實作；UI 需確認有顯示結算畫面 |

---

## T14 + T15 任務摘要（Codex 可直接執行）

### T14：怪物擊殺掉落銀幣
- **Prompt**：`Docs/codex-prompt-T14.md`
- **檔案**：`src/game/combatRuntime.js` 只改這一個
- **核心改動**：`pruneDeadEnemies` 回傳 killed；新增 `_awardKillSilver(killed)` 呼叫 WalletService
- **版本**：v0.0.27.0

### T15：關卡結算獎勵（待 Claude 寫 prompt）
- **檔案**：`src/game/phaseRuntime.js`
- **核心改動**：`_waveClear(world, cfg)` 在 `world.stage += 1` 之後呼叫：
  ```js
  WalletService.creditWallet({
    source: 'stage',
    reason: 'stage_clear',
    reward: {
      gold: ECONOMY.session.goldPerStage,
      ticket: ECONOMY.session.ticketsPerStage,
    },
    idempotencyKey: `stage_clear:${world.stage}:${sessionId}`,
  });
  ```
- **注意**：需要 `sessionId`（用 `Date.now()` 或 `world.sessionId` 防跨場次重複）
- **版本**：v0.0.28.0

---

## MVP 通過條件（摘自 mvp-validation.md）

玩一局需要：
1. ✅ 新手 10 分鐘內理解挖礦、建塔、修復、核心扣血
2. ✅ 熟手能說出第 10 關前至少 2 個風險選擇
3. ✅ 死亡後能說出主要死亡原因
4. ✅ 第 10 關卡片讓打法有變化
5. ✅ 第 20 關作為硬門檻，不被 50/100 抽穩定打穿
6. ✅ 多人測試中 Emoji 至少被自然使用一次
7. ✅ 測試者能指出想再玩一次或想調整策略
