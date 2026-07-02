# Codex Prompt — T21：Boss 門口攻擊（doorAttack）實裝

> **版本目標：v0.0.33.0**

---

## 背景與設計釐清（重要，勿照抄 mustsolve.md 字面）

`Docs/mustsolve.md`（第十四輪）與 `Docs/waveplan.md` 描述的「門口攻擊」是**蒙地卡羅模擬用的抽象模型**（用「建築高度 >=5 格才觸發」代表一種簡化的距離保護），但目前的 2D 引擎**完全沒有任何建築阻擋/碰撞機制**——`combatRuntime.js` 的 `updateEnemies` 讓敵人直線走向目標，不受任何方塊阻擋。

開發者已確認實際設計（**以此為準，覆蓋 mustsolve.md 的「建築高度 >=5」門檻字面敘述**）：

> 只要建出去的都是核心的 Hitbox，不需要真正的阻隔和保護，因為任何一個方塊都是可被攻擊的讓核心掉血的方塊。只需要加大 Boss 的攻擊範圍就行。如果玩家蓋高位往外橫飛，Boss 就直接打他的陽台。

翻成實作規則：

1. **任何已放置方塊（`world.dirt` ∪ `world.fore`）都和 `world.core` 一樣是敵人的有效攻擊目標**（打中即扣 `world.coreHp`，沒有額外的「方塊 HP」）。這件事目前**沒有實裝**——`updateEnemies` 的 `nearestCoreCell` 只搜尋 `world.core` 固定格，完全忽略玩家蓋出去的 `dirt`/`fore`。這對**所有敵人**都要修，不是只有 Boss。
2. **`doorAttack: true` 的 Boss（boss20、boss30）攻擊距離 = `height + attackRange`**（對齊 mustsolve「Boss 可攻擊第 6 格」= height4 + attackRange2 = 6）。`doorAttack: false`（boss10）與一般小怪維持原本 `attackRange`，不吃 height 加成。
3. **不需要**「建築高度 >= 5 格」的額外門檻檢查——`doorAttack` 布林值本身已經是門檻（boss10=false 不套用，boss20/30=true 套用），不必再算玩家蓋了多高。

---

## 修改檔案（共 6 個）

### 1. `src/logic/waveGen.js`

`buildWave` 內 push 到 `enemies` 的物件（約 line 90-99），補上 `doorAttack` 欄位（`height` 已經有）：

```js
enemies.push({
  id: `${stage}-${enemyKey}-${idCounter++}`,
  key: enemyKey,
  isBoss,
  hp, attack,
  moveSpeed: def.moveSpeed,
  height: def.height,
  attackRange: def.attackRange,
  defense: def.defense,
  doorAttack: def.doorAttack ?? false,   // ← 新增
});
```

### 2. `src/game/phaseRuntime.js`

`_updateNight` 內出怪時建立的 enemy 物件（約 line 165-179），目前完全沒帶 `height`/`doorAttack` 到 runtime enemy，補上：

```js
const base = ENEMIES[def.key] ?? {};
world.enemies.push({
  id: def.id,
  key: def.key,
  zh: base.zh ?? def.key,
  isBoss: !!def.isBoss,
  x: def.x,
  y: def.y,
  hp: def.hp,
  hpMax: def.hp,
  attack: def.attack,
  defense: def.defense ?? base.defense ?? 0,
  moveSpeed: def.moveSpeed ?? base.moveSpeed ?? 0,
  attackRange: def.attackRange ?? base.attackRange ?? 1,
  height: def.height ?? base.height ?? 0,             // ← 新增
  doorAttack: def.doorAttack ?? base.doorAttack ?? false,  // ← 新增
  attackCooldown: 0,
});
```

同步更新 header 註解（約 line 117）：
```
 *   wave.enemies  — [{ id, key, hp, attack, moveSpeed, attackRange, height, doorAttack, defense, ... }]
```

### 3. `src/game/combatRuntime.js`

**A. debug 用 `createEnemy`（line 24-39）補上 `height`/`doorAttack`（維持 debug spawn 與正式出怪一致）：**
```js
function createEnemy(world, enemyKey, x, y) {
  const def = ENEMIES[enemyKey];
  return {
    id: nextEnemyId(world, enemyKey),
    key: enemyKey,
    zh: def.zh,
    x, y,
    hp: def.hp,
    hpMax: def.hp,
    attack: def.attack,
    defense: def.defense,
    moveSpeed: def.moveSpeed,
    attackRange: def.attackRange,
    height: def.height ?? 0,             // ← 新增
    doorAttack: def.doorAttack ?? false, // ← 新增
    attackCooldown: 0,
  };
}
```

**B. 新增 `_nearestStructureCell`，取代 `nearestCoreCell` 的搜尋範圍（`world.core` ∪ `world.dirt` ∪ `world.fore`）：**

```js
function _nearestStructureCell(world, enemy) {
  let best = null;
  let bestD2 = Infinity;

  for (const [x, y] of world.core ?? []) {
    const d2 = dist2(enemy, { x, y });
    if (d2 < bestD2) { bestD2 = d2; best = { x, y }; }
  }
  for (const k of world.dirt ?? []) {
    const [x, y] = k.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const d2 = dist2(enemy, { x, y });
    if (d2 < bestD2) { bestD2 = d2; best = { x, y }; }
  }
  for (const k of (world.fore ?? new Map()).keys()) {
    const [x, y] = k.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const d2 = dist2(enemy, { x, y });
    if (d2 < bestD2) { bestD2 = d2; best = { x, y }; }
  }
  return best;
}
```

> 保留舊的 `nearestCoreCell` 函式名稱不動的話會混淆語意；**直接改名為 `_nearestStructureCell` 並更新唯一呼叫處**（`updateEnemies` 內，約 line 58）。若專案內其他檔案有 import `nearestCoreCell`，先 grep 確認無外部依賴（目前只在本檔內部用，不是 export）。
>
> **效能備註（非本次 blocker，MVP 可接受）**：`_nearestStructureCell` 每個敵人每 tick 掃 `core + dirt + fore`，複雜度是 `敵人數 × 方塊數`。目前規模下可接受，不需要在本次任務內優化；若後期敵人與建築數量都很大，可考慮快取目標格或加 spatial index，屆時另開任務處理，不要在這次順手改。

**C. `updateEnemies`（約 line 54-83）改用新函式 + doorAttack 攻擊距離公式：**

```js
export function updateEnemies(world, dt) {
  if (world.phase === 'gameover') return;

  for (const enemy of world.enemies) {
    const target = _nearestStructureCell(world, enemy);
    if (!target) continue;

    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const d = Math.hypot(dx, dy);
    const range = enemy.doorAttack
      ? (enemy.height ?? 0) + (enemy.attackRange ?? 1)
      : (enemy.attackRange ?? 1);

    if (d <= range) {
      enemy.isAttacking = true;
      enemy.attackCooldown = (enemy.attackCooldown ?? 0) - dt;
      if (enemy.attackCooldown <= 0) {
        const amount = (enemy.attack ?? 0) * (world.combat?.overtimeMultiplier ?? 1);
        _applyCoreDamage(world, amount);
        enemy.attackCooldown = 2;
      }
      continue;
    }

    enemy.isAttacking = false;
    if (d < 0.001) continue;
    const step = Math.min(enemy.moveSpeed * dt, d);
    enemy.x += (dx / d) * step;
    enemy.y += (dy / d) * step;
  }
}
```

### 4. `config/enemies.js`

**A. 更新 Boss 註解區塊**（放在 `boss10` 定義前即可，不用整份重寫）：

```js
// doorAttack: true 的 Boss 有效攻擊距離 = height + attackRange（見 combatRuntime.js updateEnemies）。
// doorAttack: false 或一般小怪，維持原始 attackRange，不吃 height 加成。
// 任何已放置方塊（dirt/fore）都與 world.core 一樣是敵人的有效攻擊目標，沒有獨立的方塊 HP。
```

**B. 清掉 `boss20` 定義內的舊 inline 註解（line 42）**——目前寫著「建築高度 >=5 格時可門口攻擊核心」，跟本次定案（doorAttack 布林值本身即門檻，不檢查建築高度）矛盾，會誤導未來閱讀者。改為：

```js
boss20:   { zh: 'Boss20', isBoss: true, height: 4, attackRange: 2, defense: 0,
  hp: 650, attack: 6, moveSpeed: 2.8,
  doorAttack: true, // 有效距離 = height + attackRange（不檢查建築高度門檻）
  // 多人門檻：3 人血量 +30%、4 人血量 +50%（waveGen 套用）
  multiHpBonusPct: { 3: 30, 4: 50 } },
```

### 4B. `config/waves.js`（P1，必改）

`BOSS_RULES.doorAttackHeightTiles: 5`（line 61-64）是**舊規則殘留**，與本次定案「不需要建築高度門檻」直接衝突，且**目前零程式引用**（`grep -rn "doorAttackHeightTiles\|BOSS_RULES"` 只在本檔案出現，`phaseRuntime.js`/`waveGen.js`/`renderer.js` 只 import `WAVES`/`GROWTH`/`BLOCKER_BAND`，不 import `BOSS_RULES`）。

**移除整個 `BOSS_RULES` export**：
```js
// 移除以下區塊：
// export const BOSS_RULES = {
//   doorAttackHeightTiles: 5,
// };
```

並更新 file header `@exports`（line 5）：
```
 * @exports     WAVES, GROWTH, OVERTIME, BLOCKER_BAND
```
（移除 `BOSS_RULES`）

### 5. `tests/combatRuntime.test.js`（新建）

```js
import assert from 'node:assert/strict';
import { createWorld } from '../src/game/world.js';
import { updateEnemies, spawnDebugEnemies } from '../src/game/combatRuntime.js';
import { buildWave } from '../src/logic/waveGen.js';
import { createRng } from '../src/logic/rng.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

// 0a. buildWave() 產出的 boss20 要帶 doorAttack/height（否則 combatRuntime 拿到的欄位是 undefined，doorAttack 邏輯形同虛設）
function testBuildWavePassesThroughDoorAttackAndHeight() {
  const wave = buildWave(20, 1, createRng(1));
  const boss = wave.enemies.find((e) => e.key === 'boss20');
  assert.ok(boss, 'stage 20 wave should include boss20');
  assert.equal(boss.doorAttack, true, 'buildWave should pass through doorAttack from ENEMIES config');
  assert.equal(boss.height, 4, 'buildWave should pass through height from ENEMIES config');
}

// 0b. spawnDebugEnemies() 產出的 enemy 也要帶 doorAttack/height（debug 出怪與正式出怪行為要一致）
function testSpawnDebugEnemiesPassesThroughDoorAttackAndHeight() {
  const world = createWorld(GAME_CONFIG);
  spawnDebugEnemies(world, 1, 'boss20', GAME_CONFIG);
  const boss = world.enemies[world.enemies.length - 1];
  assert.equal(boss.doorAttack, true, 'debug-spawned boss20 should carry doorAttack');
  assert.equal(boss.height, 4, 'debug-spawned boss20 should carry height');
}

// 1. 一般敵人只認 world.core，蓋出去的 dirt 方塊若比核心近，敵人應改打該方塊（core 仍掉血，因為沒有獨立方塊 HP）
function testEnemyTargetsNearestPlacedBlock() {
  const world = createWorld(GAME_CONFIG);
  const coreHpBefore = world.coreHp;

  // 在敵人正下方蓋一塊 dirt，比 world.core 近很多
  const enemyX = 40, enemyY = world.groundY - 1;
  world.dirt.add(`${enemyX},${enemyY}`);

  world.enemies = [{
    id: 'e1', key: 'civilian', x: enemyX, y: enemyY,
    hp: 30, hpMax: 30, attack: 5, defense: 0, moveSpeed: 4.5,
    attackRange: 1, height: 2, doorAttack: false, attackCooldown: 0,
  }];

  updateEnemies(world, 0.1);
  assert.equal(world.enemies[0].isAttacking, true, 'enemy should attack the nearby placed block immediately');
  assert.ok(world.coreHp < coreHpBefore, 'attacking a placed block should still cost core HP');
}

// 2. doorAttack Boss 有效攻擊距離 = height + attackRange，可在較遠處直接攻擊
function testDoorAttackBossExtendedRange() {
  const world = createWorld(GAME_CONFIG);
  const coreHpBefore = world.coreHp;

  // Boss 站在離最近核心格 5 格外（一般 attackRange=2 打不到，height4+range2=6 打得到）
  const [cx, cy] = world.core[0];
  const bossX = cx - 5, bossY = cy;

  world.enemies = [{
    id: 'boss1', key: 'boss20', x: bossX, y: bossY,
    hp: 650, hpMax: 650, attack: 6, defense: 0, moveSpeed: 2.8,
    attackRange: 2, height: 4, doorAttack: true, attackCooldown: 0,
  }];

  updateEnemies(world, 0.1);
  assert.equal(world.enemies[0].isAttacking, true, 'doorAttack boss should reach target at distance 5 (height+range=6)');
  assert.ok(world.coreHp < coreHpBefore);
}

// 3. 非 doorAttack 的 boss10 在相同距離不該打到（維持原始 attackRange），且核心血量不得變動
function testNonDoorAttackBossDoesNotReachExtendedRange() {
  const world = createWorld(GAME_CONFIG);
  const coreHpBefore = world.coreHp;

  const [cx, cy] = world.core[0];
  const bossX = cx - 5, bossY = cy;

  world.enemies = [{
    id: 'boss10-1', key: 'boss10', x: bossX, y: bossY,
    hp: 260, hpMax: 260, attack: 3, defense: 0, moveSpeed: 3,
    attackRange: 1, height: 4, doorAttack: false, attackCooldown: 0,
  }];

  updateEnemies(world, 0.1);
  assert.equal(world.enemies[0].isAttacking, false, 'boss10 (doorAttack:false) should not reach distance 5 with attackRange 1');
  assert.equal(world.coreHp, coreHpBefore, 'core HP must not change when boss is out of range (guards against isAttacking=false but still damaging silently)');
}

// 4. 玩家蓋高位往外橫飛（陽台）：doorAttack boss 站在遠處也能直接打到突出的 fore 方塊
function testDoorAttackBossHitsExtendedBalconyBlock() {
  const world = createWorld(GAME_CONFIG);
  const coreHpBefore = world.coreHp;

  // 陽台方塊蓋在離核心很遠、往怪物來向突出的位置
  const balconyX = 20, balconyY = world.groundY - 10;
  world.fore.set(`${balconyX},${balconyY}`, 'stone');

  // Boss 站在陽台附近但超出一般 attackRange，doorAttack 有效距離(height4+range2=6)內
  const bossX = balconyX - 5, bossY = balconyY;
  world.enemies = [{
    id: 'boss2', key: 'boss20', x: bossX, y: bossY,
    hp: 650, hpMax: 650, attack: 6, defense: 0, moveSpeed: 2.8,
    attackRange: 2, height: 4, doorAttack: true, attackCooldown: 0,
  }];

  updateEnemies(world, 0.1);
  assert.equal(world.enemies[0].isAttacking, true, 'doorAttack boss should hit the extended balcony block directly');
  assert.ok(world.coreHp < coreHpBefore);
}

testBuildWavePassesThroughDoorAttackAndHeight();
testSpawnDebugEnemiesPassesThroughDoorAttackAndHeight();
testEnemyTargetsNearestPlacedBlock();
testDoorAttackBossExtendedRange();
testNonDoorAttackBossDoesNotReachExtendedRange();
testDoorAttackBossHitsExtendedBalconyBlock();
console.log('combatRuntime tests passed');
```

### 6. `tests/index.js`

加入：
```js
import './combatRuntime.test.js';
```

---

## 架構約束

1. 純邏輯層（`combatRuntime.js`）不得呼叫 wallet / localStorage IO（現有 `_awardKillSilver` 呼叫 WalletService 是既有行為，不動）。
2. 不新增任何「方塊 HP」概念，攻擊放置方塊一律直接扣 `world.coreHp`（維持現有 `_applyCoreDamage` 邏輯不動）。
3. 隨機與時間一律參數注入，本任務不涉及新的 RNG 使用，不用額外處理。
4. `_nearestStructureCell` 為模組內部函式，不需要 export（除非既有測試需要，本 prompt 的測試都透過 `updateEnemies` 間接驗證）。

---

## 版本號

以下檔案 `@version` 更新為 `v0.0.33.0`：`waveGen.js`、`phaseRuntime.js`、`combatRuntime.js`、`enemies.js`、`waves.js`。
`config/gameConfig.js` 的 `@version` 與 `GAME_CONFIG.version` 同步更新為 `v0.0.33.0`（canonical source）。

---

## 完成標準

```
node tests/index.js   → 全通過（含 combatRuntime.test.js 6 個 cases）
```
- 一般敵人會攻擊離自己最近的任何已放置方塊（dirt/fore），不再只認 `world.core`。
- `doorAttack: true` 的 Boss（boss20/30）有效攻擊距離 = `height + attackRange`。
- `doorAttack: false`（boss10）與一般小怪維持原始 `attackRange`，無回歸。
- 正式波次出怪（`waveGen.js` `buildWave`）與 debug 出怪（`spawnDebugEnemies`）的敵人物件都帶有 `height`/`doorAttack`，且測試直接驗證這個傳遞鏈（不只手工塞 enemy object）。
- `config/waves.js` 不再有 `BOSS_RULES.doorAttackHeightTiles` 舊規則殘留；`config/enemies.js` 的 `boss20` inline 註解不再提「建築高度 >=5」。

**驗收 grep（收尾前執行，確認舊設計沒有殘留在可執行區域）：**
```
rg "doorAttackHeightTiles|BOSS_RULES|建築高度 >=5" src config tests
```
應該只在 `Docs/`（mustsolve.md / waveplan.md / 本 prompt 檔案本身）出現，`src/`、`config/`、`tests/` 不應有任何命中。
