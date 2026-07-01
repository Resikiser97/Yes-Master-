# Codex Prompt — T19+T20：多人卡片投票 UI + GameOver 結算畫面

> **版本目標：v0.0.32.0**
> **任務組合：T19（多人投票）+ T20（GameOver 結算 + 返回）**

---

## 背景

**T19 — 多人卡片投票：**
`src/net/inputBuffer.js:163` 與 `src/main.js:408`（host 本機路徑）都直接呼叫 `resolveCardOffer`，任何人選牌立即生效（first-wins）。多人模式需改為全體 eligible 玩家投票後多數決。

**T20 — GameOver 結算畫面：**
`renderer.js:1418` 的 `_drawGameOverOverlay` 只顯示 "GAME OVER"。`world.sessionRewards` 欄位不存在，kill / 通關 wallet 入帳後沒有更新顯示計數。

---

## 多人架構鐵則（必讀）

見 `.claude/instructions.md` 5.1。凡多人動作必須四路徑一致：
1. `inputBuffer.js`（remote client）
2. `main.js`（host 本機，不經 inputBuffer）
3. `stateSync.js` 的 `serializeSnapshot` + `serializeDelta` + `applyPartialState` 三件套
4. `validation.js`（防壞資料）

**離線玩家鐵則**：`world.players` 保留 `online=false` 的斷線玩家。全員/投票判定必須排除 `online === false`。UI 顯示也必須用同一套 eligible 名單，否則會顯示「2/3 已投票」卡住的假象。

---

## 修改檔案（共 13 個）

### 0. `config/gameConfig.js`（version canonical）

依專案 SOP，`GAME_CONFIG.version` 是版本 canonical source。更新兩處：
- file header `@version`（line 8）：`v0.0.30.0` → `v0.0.32.0`
- `version:` 欄位（line 13）：`'v0.0.30.0'` → `'v0.0.32.0'`

---

### 1. `src/game/world.js`

`createWorld` 的 world 物件（約 line 171，`uiHitRects: []` 前）加：

```js
cardVotes: {},           // 多人投票暫存：{ [playerId]: cardIndex }；phase='cardOffer' 有效
sessionRewards: { silver: 0, gold: 0, ticket: 0 },  // 本機已入帳摘要（顯示用，不寫 localStorage）
```

---

### 2. `src/game/phaseRuntime.js`

**A0. 更新 file header `@exports`（line 5）** — 目前是 `initPhaseState, updatePhase`（已 stale，連 `resolveCardOffer` 都漏）。改為列出實際 export：
```
 * @exports     initPhaseState, updatePhase, resolveCardOffer, submitCardVote, eligibleCardVotePlayerIds
```

**A1. 檔頭附近加相容 helper**（專案未曾用 `Object.hasOwn`，保守支援舊手機瀏覽器）：
```js
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
```
下方所有 `Object.hasOwn(...)` 一律改用此 `hasOwn(...)`。

**A. `_enterCardOffer`（約 line 225）重置投票：**

```js
function _enterCardOffer(world) {
  const offerRng = createRng(WAVE_RNG_SEED + world.stage * 7919);
  world.phase            = 'cardOffer';
  world.phaseTimer       = 0;
  world.pendingCardOffer = generateOffer(offerRng, world.stage);
  world.cardVotes        = {};
}
```

**B. 新增 `export function eligibleCardVotePlayerIds`**（exported，讓 renderer 共用同一套 eligible 邏輯，單一真相來源）：

```js
export function eligibleCardVotePlayerIds(world) {
  const entries = [...(world?.players ?? new Map()).entries()]
    .filter(([, p]) => p?.online !== false);
  if (entries.length) return entries.map(([id]) => id);
  return [world?.localPlayerId ?? 'local'];
}
```

**C. 新增 `export function submitCardVote`，放在 `resolveCardOffer` 之後：**

```js
export function submitCardVote(world, playerId, index, cfg = GAME_CONFIG) {
  if (world.phase !== 'cardOffer') return;
  if (!world.pendingCardOffer) return;

  const choice = Number(index);
  if (!Number.isInteger(choice) || choice < 0 || choice >= world.pendingCardOffer.length) return;

  const eligibleIds = eligibleCardVotePlayerIds(world);
  if (!eligibleIds.includes(playerId)) return;

  world.cardVotes = world.cardVotes ?? {};
  world.cardVotes[playerId] = choice;

  const allVoted = eligibleIds.every(id => hasOwn(world.cardVotes, id));
  if (!allVoted) return;

  // 多數決：只計 eligible 有效整數票；同票數取索引最小
  const counts = {};
  for (const id of eligibleIds) {
    const v = world.cardVotes[id];
    if (Number.isInteger(v)) counts[v] = (counts[v] ?? 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return;   // 防呆：無有效票不炸
  const winnerIndex = Number(
    entries.sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0][0],
  );

  world.cardVotes = {};
  resolveCardOffer(world, winnerIndex, cfg);
}
```

> `resolveCardOffer` 保持 export，不要移除。

---

### 3. `src/net/inputBuffer.js`

**import（line 12）：**
```js
import { submitCardVote } from '../game/phaseRuntime.js';
```

**`cardChoice` 分支（line 162-163）：**
```js
} else if (action.kind === 'cardChoice') {
  submitCardVote(world, playerId, action.index, cfg);
}
```

---

### 4. `src/main.js`

**A. import（line 34）：**
```js
import { updatePhase, submitCardVote } from './game/phaseRuntime.js';
```

**B. host 本機 cardChoice（約 line 406-408）：**
```js
if (world.phase === 'cardOffer') {
  const cardChoice = controls.consumeCardChoice();
  if (cardChoice != null) submitCardVote(world, world.localPlayerId, cardChoice, cfg);
}
```

**C. GameOver Escape 監聽 — 放在 `const loop = startGameLoop(...)`（line 266）之後、建立 `app` 之前：**
```js
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (world.phase !== 'gameover') return;
  loop.stop?.();
  netSession?.close?.();
  window.location.reload();
});
```
> MVP：reload。多人 URL 帶 query 時可能回到同房，非真正 lobby，故 UI 文案用「返回」不寫「返回大廳」（見 §9B）。

---

### 5. `src/net/stateSync.js`

**A. `serializeSnapshot`（line 49，`pendingCardOffer` 後）：**
```js
cardVotes: { ...(world.cardVotes ?? {}) },
```

**B. `serializeDelta`（line 83，`pendingCardOffer: snapshot.pendingCardOffer` 後）：**
```js
cardVotes: snapshot.cardVotes,
```

**C. `applyPartialState`（`if ('pendingCardOffer' in state)` 附近）：**
```js
if ('cardVotes' in state) world.cardVotes = { ...(state.cardVotes ?? {}) };
```

---

### 6. `src/net/validation.js`

把 `cardChoice` 從 line 85 allowlist 移除，前面加具體驗證：

```js
if (action.kind === 'cardChoice') {
  if (world.phase !== 'cardOffer') return reject('not_card_offer');
  const idx = Number(action.index);
  if (!Number.isInteger(idx)) return reject('bad_card_index');
  const offerLen = world.pendingCardOffer?.length ?? 0;
  if (idx < 0 || idx >= offerLen) return reject('bad_card_index');
  return { ok: true };
}
if (['buildPlanToggle', 'destroyToggle', 'placeRect', 'removeRect'].includes(action.kind)) {
  return { ok: true };
}
```

---

### 7. `src/net/peerHost.js`（P1 bug fix）

**問題**：ping timeout 分支（約 line 111-113）先 `peers.delete(peerKey)`，之後 `conn.close()` 觸發的 `'close'` handler 執行時 `peers.get(conn.peer)` 已是 undefined，line 99 的 `online = false` 永遠不會執行 → 斷線玩家永久卡住投票。

**修改 ping timeout 分支（約 line 110-117）：刪 peer 前明確設 offline：**

```js
for (const [peerKey, session] of peers) {
  if (now - session.lastPongAt > 3000) {
    if (world?.players?.has(session.slotId)) world.players.get(session.slotId).online = false;  // ← 新增
    session.conn.close?.();
    peers.delete(peerKey);
  } else {
    sendConn(session.conn, makeMessage(MSG.PING, { t: now }));
  }
}
```

---

### 8. `src/game/combatRuntime.js`

**A. `_awardKillSilver`（line 124）加第三參數：**
```js
function _awardKillSilver(killed, sessionId, sessionRewards) {
  for (const enemy of killed) {
    const isBoss = ENEMIES[enemy.key]?.isBoss;
    const dropKey = isBoss ? 'Boss' : (ENEMIES[enemy.key]?.zh ?? null);
    const silver = dropKey != null ? (ECONOMY.session.monsterSilverDrop[dropKey] ?? 0) : 0;
    if (silver <= 0) continue;
    const result = WalletService.creditWallet({
      source: 'combat', reason: 'monster_kill',
      reward: { silver },
      idempotencyKey: `kill:${sessionId ?? ''}:${enemy.id}`,
    });
    if (result.ok && !result.duplicate && sessionRewards) {
      sessionRewards.silver = (sessionRewards.silver ?? 0) + silver;
    }
  }
}
```

**B. 呼叫處（約 line 189）：**
```js
_awardKillSilver(killed, world.sessionId, world.sessionRewards);
```

---

### 9. `src/account/stageRewardService.js`

`creditWallet` 後加：
```js
if (result.ok && !result.duplicate && world?.sessionRewards) {
  world.sessionRewards.gold   = (world.sessionRewards.gold   ?? 0) + (ECONOMY.session.goldPerStage   ?? 0);
  world.sessionRewards.ticket = (world.sessionRewards.ticket ?? 0) + (ECONOMY.session.ticketsPerStage ?? 0);
}
```

---

### 10. `src/render/renderer.js`

**10A. `_drawCardOffer` 末尾投票進度 — 用 eligible 名單（P1 fix）：**

在檔頭 import 加 `eligibleCardVotePlayerIds`（從 `phaseRuntime.js`）。若 renderer 目前無 import phaseRuntime，新增：
```js
import { eligibleCardVotePlayerIds } from '../game/phaseRuntime.js';
```

`_drawCardOffer` 末尾（卡片畫完後）：
```js
// 多人投票進度（用 eligible 名單，排除離線玩家）
const eligibleIds = eligibleCardVotePlayerIds(world);
if (eligibleIds.length > 1) {
  const voteCount = eligibleIds.filter(id => Number.isInteger((world.cardVotes ?? {})[id])).length;
  ctx.save();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${voteCount} / ${eligibleIds.length} 玩家已投票`, vw / 2, y - 22);
  ctx.restore();
}
```

畫每張卡的 for loop 中，已投過的卡加綠框：
```js
const myVote = world.cardVotes?.[world.localPlayerId];
if (myVote === i) {
  ctx.save();
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 3;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}
```

**10B. `_drawGameOverOverlay`（line 1418）完整取代：**

```js
_drawGameOverOverlay(world) {
  const ctx = this.ctx;
  const { width: vw, height: vh } = this.viewport;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = vw / 2, cy = vh / 2;

  ctx.fillStyle = '#f87171';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('GAME OVER', cx, cy - 80);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '18px sans-serif';
  ctx.fillText(`第 ${(world.stage ?? 0) + 1} 關`, cx, cy - 36);

  const sr = world.sessionRewards ?? {};
  const hasRewards = (sr.silver ?? 0) > 0 || (sr.gold ?? 0) > 0 || (sr.ticket ?? 0) > 0;
  if (hasRewards) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText('本機已入帳', cx, cy + 4);
    const parts = [];
    if ((sr.gold   ?? 0) > 0) parts.push(`金幣 +${sr.gold}`);
    if ((sr.silver ?? 0) > 0) parts.push(`銀幣 +${sr.silver}`);
    if ((sr.ticket ?? 0) > 0) parts.push(`票券 +${sr.ticket}`);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(parts.join('　'), cx, cy + 26);
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px sans-serif';
  ctx.fillText('按 Q 重試　／　按 Esc 返回', cx, cy + (hasRewards ? 62 : 28));

  ctx.restore();
}
```
> 文案用「返回」不用「返回大廳」（MVP reload 可能回同房，避免誤導）。

---

### 11. `tests/cardVote.test.js`（新建）

真實卡：index 0 = `ironFangCore`（attack+2）、1 = `towerCraft`（heightBonusPct）、2 = `spiritBeat`（spirit+20）。

```js
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/world.js';
import { submitCardVote, eligibleCardVotePlayerIds } from '../src/game/phaseRuntime.js';
import { serializeSnapshot, serializeDelta, applySnapshot, applyDelta } from '../src/net/stateSync.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

function makeCardWorld(playerIds = ['local'], onlineFlags = {}) {
  const world = createWorld(GAME_CONFIG);
  world.phase = 'cardOffer';
  world.pendingCardOffer = [
    { key: 'ironFangCore', effect: { kind: 'coreStat', stat: 'attack', add: 2 } },
    { key: 'towerCraft',   effect: { kind: 'modifier', mods: [{ stat: 'heightBonusPct', pct: 10 }] } },
    { key: 'spiritBeat',   effect: { kind: 'playerStat', stat: 'spirit', add: 20 } },
  ];
  world.cardVotes = {};
  world.players = new Map(
    playerIds.map(id => [id, { id, spirit: 0, online: onlineFlags[id] !== false }])
  );
  world.localPlayerId = playerIds[0];
  return world;
}

// 1. 單人立即 resolve + winner effect（ironFangCore → attack+2）
function testSinglePlayerVoteResolvesImmediately() {
  const world = makeCardWorld(['local']);
  submitCardVote(world, 'local', 0, GAME_CONFIG);
  assert.equal(world.phase, 'prep');
  assert.equal(world.pendingCardOffer, null);
  assert.equal(world.cardBonuses?.attack, 2, 'ironFangCore effect should apply');
}

// 2. 多人第一票不 resolve
function testMultiFirstVoteDoesNotResolve() {
  const world = makeCardWorld(['p1', 'p2']);
  submitCardVote(world, 'p1', 0, GAME_CONFIG);
  assert.equal(world.phase, 'cardOffer');
  assert.notEqual(world.pendingCardOffer, null);
}

// 3. 多數決 winner effect 生效（2票 index 1 towerCraft）
function testMajorityWinsAndEffectApplies() {
  const world = makeCardWorld(['p1', 'p2', 'p3']);
  submitCardVote(world, 'p1', 1, GAME_CONFIG);
  submitCardVote(world, 'p2', 0, GAME_CONFIG);
  submitCardVote(world, 'p3', 1, GAME_CONFIG);
  assert.equal(world.phase, 'prep');
  assert.ok((world.cardModifiers ?? []).some(m => m.stat === 'heightBonusPct'),
    'towerCraft modifier should be applied');
}

// 4. 平手 index 小者勝（0 < 2）
function testTiebreakPrefersLowerIndex() {
  const world = makeCardWorld(['p1', 'p2']);
  submitCardVote(world, 'p1', 2, GAME_CONFIG);
  submitCardVote(world, 'p2', 0, GAME_CONFIG);
  assert.equal(world.phase, 'prep');
  assert.equal(world.cardBonuses?.attack, 2, 'index 0 should win tiebreak');
}

// 5. 離線玩家 online:false 不阻塞
function testOfflinePlayerDoesNotBlockVote() {
  const world = makeCardWorld(['p1', 'p2', 'p3'], { p3: false });
  assert.deepEqual(eligibleCardVotePlayerIds(world), ['p1', 'p2'],
    'offline p3 should be excluded from eligible');
  submitCardVote(world, 'p1', 0, GAME_CONFIG);
  submitCardVote(world, 'p2', 0, GAME_CONFIG);
  assert.equal(world.phase, 'prep', 'offline player should not block resolution');
}

// 6. 壞 index 不改 phase、不清有效票
function testBadIndexIsIgnored() {
  const world = makeCardWorld(['p1', 'p2']);
  submitCardVote(world, 'p1', 0, GAME_CONFIG);
  submitCardVote(world, 'p2', NaN, GAME_CONFIG);
  assert.equal(world.phase, 'cardOffer');
  assert.ok(Object.prototype.hasOwnProperty.call(world.cardVotes, 'p1'), 'valid vote preserved');
  submitCardVote(world, 'p2', 'abc', GAME_CONFIG);
  assert.equal(world.phase, 'cardOffer');
  submitCardVote(world, 'p2', 99, GAME_CONFIG);
  assert.equal(world.phase, 'cardOffer');
  submitCardVote(world, 'p2', 1, GAME_CONFIG);
  assert.equal(world.phase, 'prep', 'valid vote should still resolve');
}

// 7. cardVotes snapshot roundtrip
function testCardVotesSnapshotRoundtrip() {
  const world = makeCardWorld(['p1', 'p2']);
  submitCardVote(world, 'p1', 0, GAME_CONFIG);
  const snap = serializeSnapshot(world);
  assert.ok('cardVotes' in snap, 'cardVotes should be in snapshot');
  assert.equal(snap.cardVotes?.p1, 0);
  const fresh = createWorld(GAME_CONFIG);
  applySnapshot(fresh, snap, GAME_CONFIG);
  assert.equal(fresh.cardVotes?.p1, 0, 'cardVotes should survive snapshot roundtrip');
}

// 8. cardVotes delta roundtrip（host 每幀送 delta，client 要看得到投票進度）
function testCardVotesDeltaRoundtrip() {
  const world = makeCardWorld(['p1', 'p2']);
  const prevSnap = serializeSnapshot(world);
  submitCardVote(world, 'p1', 0, GAME_CONFIG);   // p1 投票，尚未全員
  world.syncTick = (world.syncTick ?? 0) + 1;

  const delta = serializeDelta(prevSnap, world);
  assert.ok('cardVotes' in delta, 'delta should carry cardVotes');
  assert.equal(delta.cardVotes?.p1, 0);

  const client = makeCardWorld(['p1', 'p2']);
  applyDelta(client, delta, GAME_CONFIG);
  assert.equal(client.cardVotes?.p1, 0, 'client should see p1 vote via delta');
}

testSinglePlayerVoteResolvesImmediately();
testMultiFirstVoteDoesNotResolve();
testMajorityWinsAndEffectApplies();
testTiebreakPrefersLowerIndex();
testOfflinePlayerDoesNotBlockVote();
testBadIndexIsIgnored();
testCardVotesSnapshotRoundtrip();
testCardVotesDeltaRoundtrip();
console.log('cardVote tests passed');
```

---

### 12. `tests/index.js`

加入：
```js
import './cardVote.test.js';
```

並修改 `tests/multiplayerInput.test.js` 的 `testClientCanChooseCardsOnHost()`：p2 第一票後 phase 仍為 `cardOffer`；p1 再投後才 resolve；resolve 後驗 `world.cardBonuses?.attack === 2`。

---

## 架構約束

1. `phaseRuntime.js` 純邏輯，`submitCardVote` / `eligibleCardVotePlayerIds` 不得呼叫 wallet / localStorage IO
2. renderer 所有文字用 canvas `fillText`，禁止 `innerHTML`
3. `sessionRewards` 不進 stateSync，wording 用「本機已入帳」
4. `resolveCardOffer` 保持 export
5. 批次替換只能用 Bash `sed -i`，禁止 PowerShell foreach

---

## 版本號

- 所有修改檔案 `@version` → `v0.0.32.0`
- `config/gameConfig.js`：`@version` 與 `GAME_CONFIG.version` 皆更新為 `v0.0.32.0`（canonical source）

## 完成標準

```
node tests/index.js  →  全通過（含 cardVote.test.js 8 個 cases）
```
- GameOver overlay：關卡 + 本機已入帳 gold/silver/ticket + "按 Esc 返回"
- 多人 cardOffer：「X / Y 玩家已投票」（用 eligible 名單，離線玩家不計）
- Esc 在 gameover 觸發 `location.reload()`
- 斷線玩家（ping timeout）明確設 `online=false`，不阻塞投票
- 單人選牌行為與 v0.0.31.0 相同（無回歸）
