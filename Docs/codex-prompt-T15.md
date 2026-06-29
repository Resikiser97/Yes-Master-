# Codex 任務 T15：關卡結算獎勵 + sessionId idempotency 修正

> 狀態：就緒（v0.0.28.0）
> 建立：2026-06-30（第二版，修正架構錯誤）
> 前置任務：T14 已完成（v0.0.27.0）

---

## 背景與問題

### 問題 1：Boss 關獎勵漏領
`main.js` 目前的條件：

```js
if (world.stage !== stageBefore && world.phase !== 'cardOffer') {
  claimStageReward(stageBefore, world);
}
```

第 10 / 20 / 30 關清完後 `world.phase` 變成 `'cardOffer'`，`&& world.phase !== 'cardOffer'` 為 false，所以 Boss 關清完後**永遠不入帳**。

### 問題 2：idempotencyKey 跨局碰撞
目前 `stageRewardService.js` 用 `stage-reward:local:${completedStage}`，T14 用 `kill:${enemy.id}`。
Enemy.id 每局從 0 重新計數；stage 號碼也會重複。wallet 跨局保留時，新局同關卡/同怪不入帳。

### 架構原則（不能違反）
`src/main.js:444` 已有明確架構注解：
```
// 鐵則9：phaseRuntime 是純邏輯，不得從內部呼叫 wallet/localStorage IO。
```
**絕對不能** 把 WalletService 放進 phaseRuntime.js。
stageRewardService.js 已存在且是正確的呼叫位置，沿用它。

---

## 任務範圍

**改四個檔案**：
1. `src/game/world.js` — 新增 `createSessionId()` + 在 `createWorld` 使用；export
2. `src/main.js` — 修 Boss 關漏領 + 補 sessionId fallback（老存檔）
3. `src/account/stageRewardService.js` — 改 idempotencyKey 帶 sessionId；`reason` 統一為 `stage_clear`
4. `src/game/combatRuntime.js` — kill key 帶 sessionId

**不改**：`src/game/phaseRuntime.js`（純邏輯，不碰 wallet）

---

## 修改細節

---

### 檔案 1：`src/game/world.js` → v0.0.28.0

#### 1-a. 新增 `createSessionId()` 函式（加在檔案頂部或 `coreCells` 之前，然後 export）

```js
export function createSessionId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
```

#### 1-b. 在 `createWorld()` 的 `world = { ... }` 中加入 `sessionId`

緊接 `stage: 0` 旁加入：

```js
stage: 0,
sessionId: createSessionId(),
```

**只加這個欄位，其他 world 屬性不動。**

---

### 檔案 2：`src/main.js` → 只改兩處，不升版本號

#### 2-a. import `createSessionId`（在現有 world.js import 行修改）

**現況**（約第 26 行）：
```js
import { createWorld, ensurePlayer, updateCameraFollow } from './game/world.js';
```

**改成**：
```js
import { createWorld, createSessionId, ensurePlayer, updateCameraFollow } from './game/world.js';
```

#### 2-b. 在 world 建立/載入後補 sessionId fallback（約第 117-121 行）

**現況**：
```js
const savedWorld = netRole === 'client' ? null : loadWorld(cfg);
let world = savedWorld ?? createWorld(cfg);
world.roomId = netRoomId ?? null;
ensureUiState(world);
world.uiHitRects ??= [];
```

**改成**：
```js
const savedWorld = netRole === 'client' ? null : loadWorld(cfg);
let world = savedWorld ?? createWorld(cfg);
world.sessionId ??= createSessionId();   // 老存檔或 createWorld 已設則 no-op
world.roomId = netRoomId ?? null;
ensureUiState(world);
world.uiHitRects ??= [];
```

#### 2-c. 修正 Boss 關漏領（約第 447 行）

**現況**：
```js
if (world.stage !== stageBefore && world.phase !== 'cardOffer') {
  claimStageReward(stageBefore, world);
}
```

**改成**：
```js
if (world.stage !== stageBefore) {
  claimStageReward(stageBefore, world);
}
```

說明：stage 已遞增就代表那關確實清完了，claimStageReward 自己有 idempotency key 防重複，不需要再用 phase 過濾。

---

### 檔案 3：`src/account/stageRewardService.js` → v0.0.28.0

**現況**：
```js
const idempotencyKey = `stage-reward:local:${completedStage}`;
const result = WalletService.creditWallet({
  source: 'stage',
  reason: 'stage-clear',
  reward: { ... },
  idempotencyKey,
});
```

**改成**：
```js
const sessionId = world?.sessionId ?? '';
const idempotencyKey = `stage_clear:${sessionId}:${completedStage}`;
const result = WalletService.creditWallet({
  source: 'stage',
  reason: 'stage_clear',
  reward: {
    ticket: ECONOMY.session.ticketsPerStage,
    gold:   ECONOMY.session.goldPerStage,
  },
  idempotencyKey,
});
```

兩處改動：
1. `idempotencyKey`：`stage-reward:local:N` → `stage_clear:${sessionId}:N`
2. `reason`：`'stage-clear'` → `'stage_clear'`（統一 snake_case）

其他邏輯（try/catch、console.log、return）不動。

---

### 檔案 4：`src/game/combatRuntime.js` → v0.0.28.0

#### 4-a. 修改 `_awardKillSilver` 函式加 `sessionId` 參數

**現況**：
```js
function _awardKillSilver(killed) {
  for (const enemy of killed) {
    ...
    WalletService.creditWallet({
      ...
      idempotencyKey: `kill:${enemy.id}`,
    });
  }
}
```

**改成**：
```js
function _awardKillSilver(killed, sessionId) {
  for (const enemy of killed) {
    const isBoss = ENEMIES[enemy.key]?.isBoss;
    const dropKey = isBoss ? 'Boss' : (ENEMIES[enemy.key]?.zh ?? null);
    const silver = dropKey != null ? (ECONOMY.session.monsterSilverDrop[dropKey] ?? 0) : 0;
    if (silver <= 0) continue;
    WalletService.creditWallet({
      source: 'combat',
      reason: 'monster_kill',
      reward: { silver },
      idempotencyKey: `kill:${sessionId ?? ''}:${enemy.id}`,
    });
  }
}
```

#### 4-b. 呼叫端帶入 `world.sessionId`

**現況**：
```js
const killed = pruneDeadEnemies(world);
_awardKillSilver(killed);
```

**改成**：
```js
const killed = pruneDeadEnemies(world);
_awardKillSilver(killed, world.sessionId);
```

---

## 不需要動的檔案

| 檔案 | 原因 |
|---|---|
| `src/game/phaseRuntime.js` | 純邏輯層，不碰 wallet/localStorage（架構鐵則 9）|
| `config/economyConfig.js` | 數值已定案 |
| `src/account/walletService.js` | API 不變 |

---

## 驗證清單

- [ ] `world.sessionId` 在 `createWorld()` 後為 non-empty string
- [ ] `loadWorld()` 取回的 old save（無 sessionId）→ `world.sessionId ??= createSessionId()` 補上
- [ ] 過非 Boss 關後 console 出現 `STAGE_REWARD_CREDIT`，`duplicate: false`，含 `stage_clear:<uuid>:<stage>` key
- [ ] 過 Boss 關（stage 10）後**同樣出現** `STAGE_REWARD_CREDIT`（現在不再被 cardOffer phase 過濾）
- [ ] 新開一局 sessionId 改變，舊局同 stage 不觸發 duplicate
- [ ] kill key 格式為 `kill:<uuid>:1-civilian-0`（帶 sessionId）
- [ ] stageRewardService 的 `reason` 已統一為 `stage_clear`（檢查 WALLET_TRANSACTION log）
- [ ] `node --check` 四個改動檔案全過
- [ ] `npm test` 通過

---

## Sync 報告格式

```
T15 Sync Report
- [x] world.js：export createSessionId()；createWorld 加 sessionId → v0.0.28.0
- [x] main.js：import createSessionId；world.sessionId ??= 補 fallback；移除 && world.phase !== 'cardOffer'
- [x] stageRewardService.js：idempotencyKey → stage_clear:${sessionId}:${stage}；reason → stage_clear → v0.0.28.0
- [x] combatRuntime.js：_awardKillSilver(killed, sessionId)；kill key 帶 sessionId → v0.0.28.0
- 測試：過非 Boss 關 → STAGE_REWARD_CREDIT duplicate:false
- 測試：過第 10 關（Boss）→ STAGE_REWARD_CREDIT 出現（不被跳過）
- 測試：kill key 格式確認含 sessionId
```
