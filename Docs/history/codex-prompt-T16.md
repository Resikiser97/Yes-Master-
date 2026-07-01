# Codex 任務 T16：cardModifiers 消費 + playerStat 基準值修正

> 狀態：就緒（v0.0.29.0）
> 建立：2026-06-30（第五版，最終版）
> 前置任務：T15 已完成（v0.0.28.0）

---

## 背景與問題

### 問題 1：cardModifiers 未被消費（主任務）

三張流派型卡片（archetype）選牌後把 mod 推入 `world.cardModifiers[]`，效果全部失效：

| 卡片 | mods |
|---|---|
| 夜修班（nightRepairShift） | `[{ stat:'nightRepairPct', pct:20 }, { stat:'nightMiningPct', pct:-10 }]` |
| 貪礦契約（greedyMinePact） | `[{ stat:'nightMiningPct', pct:20 }, { stat:'coreHpMax', pct:null, add:-10 }]` |
| 高塔工法（towerCraft） | `[{ stat:'heightCostPct', pct:-10 }, { stat:'repairPct', pct:-10 }]` |

`heightCostPct` 延後至 T17（building.js 無高度成本模型）。

---

### 問題 2：playerStat fallback 用 0，能力型卡片反效果（P0）

`_applyPlayerStat` fallback 是 `0`，但 `createPlayerState` 未初始化 `player.mining`/`player.repair`。
選 `repairInstinct`（add:25）後 `player.repair = 0 + 25 = 25`；
`updateRepair` 再用 `player.repair ?? cfg` 取到 25，正確應是 `cfg + 25 = 75`。
**縫補本能讓修復力從 50 降到 25，嚴重反效果。**

---

### 問題 3：carryBoost 欄位 mismatch（P1）

`carryBoost` 寫 `stat:'carry'`，但 `canAdd` 讀 `player.capacity`；`tests/cardEffect.test.js:24` 也驗 `player.carry`。兩個欄位必須同步維護。

---

### 問題 4：delta 不同步 cardBonuses/cardModifiers（P1）

`serializeDelta`（line 62）沒帶 `cardBonuses`/`cardModifiers`；`applyPartialState`（line 110）也不套。Full snapshot 5 秒才一次，中間 client 端本地跑 `updateMining()`/`updateRepair()` 會讀到舊的 `cardModifiers = []`，行為錯誤。

---

### 問題 5：多人 player 能力值不同步（P1）

`stateSync.js:serializePlayer` 沒有 `mining`/`repair`/`spirit`/`carry`，delta 後 client 能力值是 cfg 預設。

---

### 已知限制（不在 T16 範圍，prompt 明確標注）

- **舊 bug 污染的存檔不遷移**：若舊存檔已有 `player.repair = 25`（被錯誤 `0` 基底累積），T16 不修復它——下次選卡會從 25 繼續累積而非從 cfg 基底。MVP 可刪檔解決；正式遷移另開任務。
- **spiritBeat gameplay 消費延後**：`player.spirit` 已初始化，但全專案無消費點，戰鬥效果延後至 T17+。

---

## 任務範圍

**改 7 個檔案**：
1. `src/game/world.js` → v0.0.29.0
2. `src/logic/cardEffect.js` → v0.0.29.0
3. `src/game/actions.js` → v0.0.29.0
4. `src/game/coreSnapshot.js` → v0.0.29.0
5. `src/net/stateSync.js` → v0.0.29.0
6. `tests/cardEffect.test.js` → 修改（保留既有測試，追加兩個函式）
7. `tests/multiplayerState.test.js` → **修改既有檔案**（保留原有兩個測試，追加三個新測試函式）

---

## 修改細節

---

### 檔案 1：`src/game/world.js` → v0.0.29.0

#### `createPlayerState` 補能力欄位

在 return 物件的 `capacity` / `fatigue` 旁補四行（**其他不動**）：

**現況**（節錄）：
```js
capacity: cfg.player.carry,
slots: cfg.player.backpackSlots,
fatigue: cfg.player.fatigue,
online: true,
```

**改成**：
```js
capacity: cfg.player.carry,
carry:    cfg.player.carry,     // carryBoost 能力值鏡像，與 capacity 同步
slots: cfg.player.backpackSlots,
fatigue: cfg.player.fatigue,
mining: cfg.player.mining,      // miningPower 卡累積基底
repair: cfg.player.repair,      // repairInstinct 卡累積基底
spirit: cfg.player.spirit ?? 0, // spiritBeat 卡累積基底（gameplay 消費 T17）
online: true,
```

---

### 檔案 2：`src/logic/cardEffect.js` → v0.0.29.0

#### 修改 `_applyPlayerStat`（line 48-53）

**現況**：
```js
function _applyPlayerStat(world, effect) {
  const players = world.players?.values?.() ?? [world.player];
  for (const player of players) {
    player[effect.stat] = (player[effect.stat] ?? 0) + effect.add;
  }
}
```

**改成**：
```js
function _applyPlayerStat(world, effect) {
  const players = world.players?.values?.() ?? [world.player];
  for (const player of players) {
    // 'carry' 同步寫 capacity（引擎讀）和 carry（UI/存檔鏡像）
    if (effect.stat === 'carry') {
      const cfgBase = world.cfg?.player?.carry ?? 0;
      const next = (player.capacity ?? player.carry ?? cfgBase) + effect.add;
      player.capacity = next;
      player.carry    = next;
      continue;
    }
    // 其他 playerStat：fallback 改用 cfg 基底，防老存檔從 0 累積
    const cfgBase = world.cfg?.player?.[effect.stat] ?? 0;
    player[effect.stat] = (player[effect.stat] ?? cfgBase) + effect.add;
  }
}
```

---

### 檔案 3：`src/game/actions.js` → v0.0.29.0

#### 3-a. 新增私有 helper（import 區塊下方）

```js
function _sumModifier(mods, stat) {
  return (mods ?? []).reduce((sum, m) => {
    if (m?.stat !== stat) return sum;
    const pct = Number(m.pct ?? 0);
    return Number.isFinite(pct) ? sum + pct : sum;
  }, 0);
}
```

`Number.isFinite` 防存檔/同步資料中 `pct` 為字串或 NaN 污染計算。

---

#### 3-b. 修改 `updateMining`（約第 59-65 行）

**現況**：
```js
if (hits > 0) {
  m.hitTimer -= hits / hitsPerSec;
  m.damage += cfg.player.mining * hits;
}
```

**改成**：
```js
if (hits > 0) {
  m.hitTimer -= hits / hitsPerSec;
  const baseMining = player.mining ?? cfg.player.mining;
  const isNight = world.phase === 'night' || world.phase === 'overtime';
  const nightPct = isNight ? _sumModifier(world.cardModifiers, 'nightMiningPct') : 0;
  const effectiveMining = Math.max(0, baseMining * (1 + nightPct / 100));
  m.damage += effectiveMining * hits;
}
```

---

#### 3-c. 修改 `updateRepair`（約第 233 行）

**現況**：
```js
const out = repairCoreHp(world.coreHp, world.coreStats.hpMax, player.fatigue, dt, cfg.player.repair);
```

**改成**：
```js
const baseRepair = player.repair ?? cfg.player.repair;
const isNight = world.phase === 'night' || world.phase === 'overtime';
const repairPct = _sumModifier(world.cardModifiers, 'repairPct')
                + (isNight ? _sumModifier(world.cardModifiers, 'nightRepairPct') : 0);
const effectiveRepair = Math.max(0, baseRepair * (1 + repairPct / 100));
const out = repairCoreHp(world.coreHp, world.coreStats.hpMax, player.fatigue, dt, effectiveRepair);
```

---

### 檔案 4：`src/game/coreSnapshot.js` → v0.0.29.0

**全函式改成**：
```js
export function refreshCoreSnapshot(world, opts = {}) {
  const prevHpMax = world.coreStats?.hpMax;
  world.blockCounts = countPlacedBlocks(world.dirt, world.fore);

  // 貪礦契約的 coreHpMax add 透過 cardModifiers 傳入，其餘 coreStat 加值走 cardBonuses
  const hpMaxMod = (world.cardModifiers ?? [])
    .filter((m) => m?.stat === 'coreHpMax' && m.add != null)
    .reduce((acc, m) => {
      const add = Number(m.add ?? 0);
      return Number.isFinite(add) ? acc + add : acc;
    }, 0);
  const cardAdd = { ...(world.cardBonuses ?? {}) };
  if (hpMaxMod !== 0) cardAdd.hpMax = (cardAdd.hpMax ?? 0) + hpMaxMod;

  world.coreStats = computeCoreStats(world.blockCounts, { base: world.cfg?.core?.base, cardAdd });
  if (world.coreHp == null) world.coreHp = world.coreStats.hpMax;
  else if (opts.applyHpMaxDelta && prevHpMax != null) {
    world.coreHp = applyHpMaxDelta(world.coreHp, world.coreStats.hpMax - prevHpMax, world.coreStats.hpMax);
  } else {
    world.coreHp = clampCoreHp(world.coreHp, world.coreStats.hpMax);
  }
  return world.coreStats;
}
```

`m.add` 也套 `Number()` + `Number.isFinite()` 防污染（與 `_sumModifier` 的 `pct` 防護一致）。

---

### 檔案 5：`src/net/stateSync.js` → v0.0.29.0

#### 5-a. `serializePlayer`（line 164）—— 加四行

```js
function serializePlayer(player) {
  return {
    id: player.id,
    x: player.x,
    y: player.y,
    prevX: player.prevX,
    prevY: player.prevY,
    renderX: player.renderX,
    renderY: player.renderY,
    moveSpeed: player.moveSpeed,
    inventory: { ...(player.inventory ?? {}) },
    capacity: player.capacity ?? GAME_CONFIG.player.carry,
    carry:    player.carry ?? player.capacity ?? GAME_CONFIG.player.carry, // carryBoost 鏡像
    slots: player.slots,
    fatigue: player.fatigue,
    mining: player.mining ?? GAME_CONFIG.player.mining,              // miningPower
    repair: player.repair ?? GAME_CONFIG.player.repair,              // repairInstinct
    spirit: player.spirit ?? GAME_CONFIG.player.spirit ?? 0,         // spiritBeat（gameplay T17）
    online: player.online !== false,
    intent: player.intent ?? null,
    intentAt: player.intentAt ?? 0,
    intentManual: player.intentManual ?? false,
  };
}
```

#### 5-b. `serializeDelta`（line 62）—— 補 cardBonuses/cardModifiers

在 return 物件中補兩行（位置不限，建議放 `vfx` 旁）：

```js
cardBonuses:   snapshot.cardBonuses,
cardModifiers: snapshot.cardModifiers,
```

#### 5-c. `applyPartialState`（line 110）—— 套 cardBonuses/cardModifiers

在函式尾端（`if (state.vfx) { ... }` 之後）補兩行：

```js
if ('cardBonuses' in state) world.cardBonuses = { ...(state.cardBonuses ?? {}) };
if ('cardModifiers' in state) world.cardModifiers = (state.cardModifiers ?? []).map(m => ({ ...m }));
```

`'cardBonuses' in state`：delta 沒帶時不覆蓋本地，有帶時才套。

---

### 檔案 6：`tests/cardEffect.test.js` —— 修改既有檔案，保留所有原有測試

#### 6-a. 修改 `testPlayerStatEffect`（line 18-25）

**現況**：
```js
function testPlayerStatEffect() {
  const world = createWorld(GAME_CONFIG);
  applyCardEffect(world, 'carry', {
    carry: { effect: { kind: 'playerStat', stat: 'carry', add: 25 } },
  });
  assert.equal(world.player.carry, 25);
}
```

**改成**（驗增量 + 雙欄位一致）：
```js
function testPlayerStatEffect() {
  const world = createWorld(GAME_CONFIG);
  const baseCap = world.player.capacity;
  applyCardEffect(world, 'carry', {
    carry: { effect: { kind: 'playerStat', stat: 'carry', add: 25 } },
  });
  assert.equal(world.player.capacity, baseCap + 25); // capacity 提升
  assert.equal(world.player.carry, baseCap + 25);    // carry 鏡像同步
}
```

#### 6-b. 新增 `testRepairMiningFallback`（追加在 testPlayerStatEffect 下方）

```js
function testRepairMiningFallback() {
  // 模擬老存檔：player 有 repair/mining fallback 問題
  const world = createWorld(GAME_CONFIG);
  const player = world.player;
  delete player.repair;
  delete player.mining;

  applyCardEffect(world, 'repairInstinct');
  applyCardEffect(world, 'miningPower');

  // fallback 應從 cfg 基底累積，不從 0 開始
  assert.equal(player.repair, GAME_CONFIG.player.repair + 25);
  assert.equal(player.mining, GAME_CONFIG.player.mining + 25);
}
```

#### 6-c. 在測試執行區補呼叫

```js
testCoreStatEffect();
testPlayerStatEffect();
testRepairMiningFallback();   // ← 新增
testResourceEffect();
testModifierEffect();
```

---

### 檔案 7：`tests/multiplayerState.test.js` —— **修改既有檔案**

> ⚠️ 此檔已存在，有兩個測試不能刪：`testPlayerAliasUpdatesLocalPlayer` 和 `testSnapshotRoundTripKeepsPlayers`。
> 只追加 import、新增三個測試函式、並在尾端加呼叫。原有函式和呼叫**一字不改**。

#### 7-a. 在現有 import 區塊追加（原有 import 不動，只加這三行）

```js
import { serializeDelta, applyDelta } from '../src/net/stateSync.js';
import { applyCardEffect } from '../src/logic/cardEffect.js';
import { refreshCoreSnapshot } from '../src/game/coreSnapshot.js';
```

#### 7-b. 在既有兩個函式之後追加三個新函式

```js
// ── T16 新增測試 ─────────────────────────────────────────────────────────────

function testSnapshotPlayerStats() {
  const world = createWorld(GAME_CONFIG);
  applyCardEffect(world, 'miningPower');
  applyCardEffect(world, 'repairInstinct');
  applyCardEffect(world, 'carryBoost');
  applyCardEffect(world, 'spiritBeat');

  const snap = serializeSnapshot(world);
  const restored = applySnapshot(null, snap, GAME_CONFIG);
  const p = restored.player;

  assert.equal(p.mining,   world.player.mining);
  assert.equal(p.repair,   world.player.repair);
  assert.equal(p.carry,    world.player.carry);
  assert.equal(p.spirit,   world.player.spirit);
  assert.equal(p.spirit,   GAME_CONFIG.player.spirit + 20);
  assert.equal(p.capacity, world.player.capacity);
}

function testSnapshotCardState() {
  const world = createWorld(GAME_CONFIG);
  applyCardEffect(world, 'nightRepairShift'); // pushes to cardModifiers
  world.cardBonuses.hpMax = 25;              // simulate coreStat card

  const snap = serializeSnapshot(world);
  const restored = applySnapshot(null, snap, GAME_CONFIG);

  assert.deepEqual(restored.cardModifiers, world.cardModifiers);
  assert.deepEqual(restored.cardBonuses,   world.cardBonuses);
}

function testDeltaCardModifiers() {
  // Part A：cardModifiers + player.mining 透過 delta 同步
  {
    const world = createWorld(GAME_CONFIG);
    const prevSnap = serializeSnapshot(world);
    applyCardEffect(world, 'nightRepairShift');
    applyCardEffect(world, 'miningPower');
    const delta = serializeDelta(prevSnap, world);

    assert.ok('cardModifiers' in delta, 'delta missing cardModifiers');
    assert.ok('cardBonuses' in delta,   'delta missing cardBonuses');

    const client = createWorld(GAME_CONFIG);
    applyDelta(client, delta, GAME_CONFIG);

    assert.deepEqual(client.cardModifiers, world.cardModifiers);
    assert.equal(client.player.mining, world.player.mining);
  }

  // Part B：greedyMinePact → coreHpMax -10 透過 delta 同步
  {
    const world2 = createWorld(GAME_CONFIG);
    const baseHpMax = world2.coreStats.hpMax;
    const prevSnap2 = serializeSnapshot(world2);

    applyCardEffect(world2, 'greedyMinePact');
    refreshCoreSnapshot(world2, { applyHpMaxDelta: true }); // 同 resolveCardOffer

    const delta2 = serializeDelta(prevSnap2, world2);
    const client2 = createWorld(GAME_CONFIG);
    applyDelta(client2, delta2, GAME_CONFIG);

    assert.deepEqual(client2.cardModifiers, world2.cardModifiers);
    assert.equal(client2.coreStats.hpMax, baseHpMax - 10,
      'coreHpMax should decrease by 10 after greedyMinePact');
  }
}
```

#### 7-c. 在尾端的呼叫區追加（原有兩行不動）

```js
testPlayerAliasUpdatesLocalPlayer();      // 既有
testSnapshotRoundTripKeepsPlayers();      // 既有
testSnapshotPlayerStats();                // T16 新增
testSnapshotCardState();                  // T16 新增
testDeltaCardModifiers();                 // T16 新增

console.log('multiplayer state tests passed');
```

---

## 不需要動的檔案

| 檔案 | 原因 |
|---|---|
| `src/game/phaseRuntime.js` | 純邏輯層，鐵則 9 |
| `src/logic/coreHealth.js` | pure function，API 不變 |
| `config/cards.js` | 卡片定義不變（carry→capacity 對應在 cardEffect.js）|
| `heightCostPct` 相關 | 延後 T17 |
| `spiritBeat` 戰鬥消費 | 延後 T17+ |

---

## 驗證清單

- [ ] `npm test` 全部通過（cardEffect + multiplayerState，含 5 個既有測試）
- [ ] `repairInstinct` 老存檔 fallback：`player.repair = cfg.player.repair + 25`
- [ ] `miningPower` 老存檔 fallback：`player.mining = cfg.player.mining + 25`
- [ ] `carryBoost`：`player.capacity === player.carry === cfg.player.carry + 25`
- [ ] 夜修班：夜間修復 ×1.20，夜間挖礦 ×0.90
- [ ] 貪礦契約：`world.coreStats.hpMax` 減 10；夜間挖礦 ×1.20
- [ ] 高塔工法：修復速率 ×0.90（日夜皆適用）
- [ ] delta roundtrip：`cardModifiers`、`player.mining`、`coreStats.hpMax` 均正確同步
- [ ] `node --check` 七個改動檔案全過

---

## Sync 報告格式

```
T16 Sync Report
- [x] world.js：createPlayerState 加 carry/mining/repair/spirit → v0.0.29.0
- [x] cardEffect.js：_applyPlayerStat carry→capacity+carry 同步；fallback 改 cfg base → v0.0.29.0
- [x] actions.js：_sumModifier（Number.isFinite 防污染）；updateMining/updateRepair 套 modifier + clamp → v0.0.29.0
- [x] coreSnapshot.js：coreHpMax modifier → cardAdd.hpMax；m.add 同樣防污染 → v0.0.29.0
- [x] stateSync.js：serializePlayer 加 4 欄位；serializeDelta 補 cardBonuses/cardModifiers；
      applyPartialState 補套 cardBonuses/cardModifiers → v0.0.29.0
- [x] tests/cardEffect.test.js：testPlayerStatEffect 驗 baseCap+25；補 testRepairMiningFallback
- [x] tests/multiplayerState.test.js：保留既有 2 個測試；追加 testSnapshotPlayerStats /
      testSnapshotCardState / testDeltaCardModifiers（含 greedyMinePact coreHpMax roundtrip）
- npm test：PASS（全部，含既有）
- 備註：舊 bug 污染存檔不遷移（reset save）；heightCostPct T17；spiritBeat 戰鬥消費 T17+
```
