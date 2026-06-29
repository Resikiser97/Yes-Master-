# Codex 任務 T14：怪物擊殺掉落銀幣 Engine Wiring

> 狀態：就緒（v0.0.27.0）
> 建立：2026-06-30
> 負責：Codex 實作 / Claude 架構設計
> 前置任務：T13 已完成（v0.0.26.0），config 端 `ECONOMY.session.monsterSilverDrop` 已在 v0.0.25.0 定案

---

## 背景

`config/economyConfig.js` 的 `ECONOMY.session.monsterSilverDrop` 已定案（候選 C）：

```js
monsterSilverDrop: {
  平民: 4,
  跑者: 6,
  猛男: 10,
  盾兵: 12,
  工兵: 15,
  Boss: 40,
},
```

目前 `src/game/combatRuntime.js` 的 `pruneDeadEnemies(world)` 只過濾死亡敵人，沒有任何掉落/獎勵邏輯。本任務把掉落銀幣接上去。

---

## 任務範圍

**只改一個檔案**：`src/game/combatRuntime.js`

其他檔案（economyConfig.js、walletService.js、enemies.js）**不需要改動**。

---

## 架構說明

### 敵人 key → 中文名 → monsterSilverDrop 的映射

`config/enemies.js` 的每個敵人定義都有 `zh` 欄位（中文名），以及 `isBoss` 布林值（Boss 才有）：

```js
civilian:  { zh: '平民', ... }
runner:    { zh: '跑者', ... }
brute:     { zh: '猛男', ... }
shielder:  { zh: '盾兵', ... }
sapper:    { zh: '工兵', ... }
boss10:    { zh: '小隊長', isBoss: true, ... }
boss20:    { zh: 'Boss20', isBoss: true, ... }
boss30:    { zh: 'Boss30', isBoss: true, ... }
```

映射規則：
- 有 `isBoss: true` 的敵人 → 查 `ECONOMY.session.monsterSilverDrop['Boss']`
- 其他 → 查 `ECONOMY.session.monsterSilverDrop[ENEMIES[enemy.key]?.zh]`

### 多人說明（本任務不需處理）

設計上：N 人房怪物 ×N → 每關掉落 ×N → 平分後與單人等值。
目前 MVP 為本機 wallet，每個玩家各自跑 `updateCoreCombat` 並信用自己的 wallet，此行為正確。
多人 P2P 房主廣播 kill event 是未來任務，T14 **不需處理**。

---

## 修改細節

### 1. 新增 imports（在 combatRuntime.js 頂部）

```js
import { ECONOMY } from '../../config/economyConfig.js';
import { WalletService } from '../account/walletService.js';
```

注意路徑：combatRuntime.js 在 `src/game/`，所以：
- `economyConfig.js` → `'../../config/economyConfig.js'`
- `walletService.js` → `'../account/walletService.js'`

### 2. 修改 `pruneDeadEnemies(world)` — 讓它回傳死亡列表

**現況**（第 116-118 行）：
```js
function pruneDeadEnemies(world) {
  world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);
}
```

**改成**：
```js
function pruneDeadEnemies(world) {
  const killed = world.enemies.filter((enemy) => enemy.hp <= 0);
  world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);
  return killed;
}
```

### 3. 新增 `_awardKillSilver(killed)` — 純計算 + wallet 呼叫

在 `pruneDeadEnemies` 下方新增：

```js
function _awardKillSilver(killed) {
  for (const enemy of killed) {
    const isBoss = ENEMIES[enemy.key]?.isBoss;
    const dropKey = isBoss ? 'Boss' : (ENEMIES[enemy.key]?.zh ?? null);
    const silver = dropKey != null ? (ECONOMY.session.monsterSilverDrop[dropKey] ?? 0) : 0;
    if (silver <= 0) continue;
    WalletService.creditWallet({
      source: 'combat',
      reason: 'monster_kill',
      reward: { silver },
      idempotencyKey: `kill:${enemy.id}`,
    });
  }
}
```

### 4. 在 `updateCoreCombat` 使用回傳值

**現況**（第 169 行）：
```js
  pruneDeadEnemies(world);
```

**改成**：
```js
  const killed = pruneDeadEnemies(world);
  _awardKillSilver(killed);
```

### 5. 更新版本號

第 9 行：
```js
 * @version     v0.0.20.0
```
→
```js
 * @version     v0.0.27.0
```

---

## WalletService.creditWallet API 參考

```js
// src/account/walletService.js, 第 49 行
function creditWallet({
  source = 'unknown',
  reason = 'credit',
  reward = {},
  idempotencyKey = '',
} = {}) { ... }
```

- `source`: 來源標籤（使用 `'combat'`）
- `reason`: 原因標籤（使用 `'monster_kill'`）
- `reward`: `{ silver: number }`（只給 silver，不給 gold/ticket）
- `idempotencyKey`: `kill:${enemy.id}`（enemy.id 在每場遊戲內唯一，格式如 `1-civilian-0`）

---

## 不需要動的檔案

| 檔案 | 原因 |
|---|---|
| `config/economyConfig.js` | 數值已定案，不改 |
| `src/account/walletService.js` | API 已實作，不改 |
| `config/enemies.js` | zh / isBoss 欄位已有，不改 |
| `src/game/phaseRuntime.js` | T14 不處理關卡結算獎勵（T15 任務）|

---

## 驗證清單

完成後請確認：

- [ ] `pruneDeadEnemies` 回傳 killed 陣列，且 `world.enemies` 仍只包含存活敵人
- [ ] `_awardKillSilver` 對空陣列不做任何事（無 forEach / forEach 空 pass）
- [ ] boss10 / boss20 / boss30 都走 `'Boss'` key → 40 銀幣
- [ ] 找不到 `ENEMIES[enemy.key]` 的敵人（debug 敵人或未知 key）→ `silver = 0`，不呼叫 wallet
- [ ] 瀏覽器 console 可看到 `WALLET_TRANSACTION` log 含 `source:'combat', reason:'monster_kill'`
- [ ] 殺 1 隻平民 → 銀幣 +4；殺 1 隻 Boss → 銀幣 +40
- [ ] 沒有 circular import（walletService 不 import combatRuntime）

---

## Sync 報告格式

完成後請回：

```
T14 Sync Report
- [x] import ECONOMY, WalletService 加入 combatRuntime.js
- [x] pruneDeadEnemies 回傳 killed
- [x] _awardKillSilver 實作
- [x] updateCoreCombat 調用 _awardKillSilver(killed)
- [x] 版本號 → v0.0.27.0
- 測試：殺平民 → +4 銀；殺 Boss → +40 銀（console log 確認）
```
