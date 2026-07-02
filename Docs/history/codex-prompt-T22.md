# Codex Prompt — T22：商店 / 技能升級 測試補強

> **版本目標：v0.0.34.0**

---

## 背景

`Docs/planning-dashboard.md` 追蹤的「每日商店規則」「銀幣/金幣技能點交叉驗證」在數值設計層面**已經完成**：

- `Docs/simulation/economy-sim-log.md`（2026-06-28 執行）任務 5/6 已模擬定案商店定價與機率權重
- `config/economyConfig.js` 的 `shop`（定價/機率/每日重置/廣告刷新上限）、`skillGoldCost`（技能升級曲線）都已寫死，且都指回模擬 log 作為定案來源
- 引擎面也已 wiring 完成：`src/ui/shopPanel.js`（每日重置含時區偏移、廣告刷新次數限制、加權抽取、購買扣款+發獎走 `WalletService`）、`src/account/skillService.js`（技能升級成本讀 `ECONOMY.skillGoldCost`）都是完整可動的程式碼

**唯一缺口**：這兩個檔案完全零測試覆蓋（`tests/` 目錄沒有 `shopPanel.test.js`/`skillService.test.js`）。本任務只補測試，**不改動任何 `src/ui/shopPanel.js`、`src/account/skillService.js`、`src/account/walletService.js` 的邏輯**（除非測試過程中發現真正的 bug，發現的話先回報，不要直接改邏輯再補測試蓋過去）。

---

## 環境限制（重要，務必遵守）

1. **本專案測試用純 Node（`node tests/`），沒有 jsdom，`document` 全域物件不存在。**
2. `ShopPanel` 建構子有 `this.container = container ?? document.body;`——**測試時必須傳入非 null/undefined 的 `container` 參數（例如 `{}`）**，否則 `??` 右側會求值到 `document.body` 而在 Node 直接噴 `ReferenceError: document is not defined`。
3. `ShopPanel.render()`／被它呼叫的 `purchase()`／`refreshSlots()` 內部會操作 `this.overlay.querySelector(...)`（DOM），但 `this.overlay` 只有呼叫過 `ensureOverlay()`（DOM-only，測試不會呼叫）才會存在。**測試呼叫 `purchase()`/`refreshSlots()` 前，必須先把 `panel.render = () => {};` monkey-patch 成空函式**，避免測試在沒有 DOM 的環境跑爆。這不是修改原始碼，只是替換測試中該 instance 的方法。
4. `ShopPanel.toast()` 也會操作 `document.body` 與 `window.setTimeout()`。**只短路 `render()` 不夠**：購買成功時 `WalletService.grantReward(...toast)` 會觸發 toast，餘額不足與刷新成功也會觸發 toast。測試 instance 必須同時設 `panel.toast = () => {};`，否則純 Node 測試會 `ReferenceError: document is not defined`。
5. `localStorage` 在 Node 沒有原生實作，必須比照 `tests/saveManager.test.js` 的既有慣例，在檔案最上方用 `Map` mock `globalThis.localStorage`，並在 mock 設定好之後才用 `await import(...)` 動態載入依賴 `localStorage` 的模組（`walletService.js`／`skillService.js`／`shopPanel.js`／`equipmentService.js` 都透過它們間接依賴）。
6. 測試不得硬編經濟數字。即使只是在測試 `gold_pack_s`，也必須從 `ECONOMY.shop.items` 找該 item 後使用 `item.price` / `item.reward.gold`，避免測試和 config Single Source of Truth 分叉。

---

## 修改檔案（共 3 個）

### 1. `tests/shopPanel.test.js`（新建）

```js
import assert from 'node:assert/strict';

// Mock localStorage for Node environment（比照 tests/saveManager.test.js 慣例）
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => _store.get(k) ?? null,
  setItem: (k, v) => _store.set(k, v),
  removeItem: (k) => _store.delete(k),
};

const { ShopPanel } = await import('../src/ui/shopPanel.js');
const { WalletService } = await import('../src/account/walletService.js');
const { ECONOMY } = await import('../config/economyConfig.js');

function freshPanel() {
  _store.clear();
  WalletService.resetWallet();
  const panel = new ShopPanel({}); // 傳非 null container，避開建構子的 document.body fallback
  panel.render = () => {}; // 沒有 DOM，purchase()/refreshSlots() 內部呼叫 render() 前先短路
  panel.toast = () => {};  // 沒有 DOM/window，purchase()/refreshSlots() 可能觸發 toast，也必須短路
  return panel;
}

function shopItem(id) {
  const item = ECONOMY.shop.items.find((entry) => entry.id === id);
  assert.ok(item, `missing ECONOMY.shop item: ${id}`);
  return item;
}

// 1. todayKey() 依 resetHourUTC 換日邊界（GMT+8 00:00 = UTC 16:00 前一天）
function testTodayKeyRollsOverAtResetHour() {
  const panel = freshPanel();
  // UTC 15:59 → 換算 GMT+8 為當日 23:59，尚未跨日
  const before = new Date(Date.UTC(2026, 0, 1, 15, 59));
  // UTC 16:00 → 換算 GMT+8 為次日 00:00，應視為新的一天
  const after = new Date(Date.UTC(2026, 0, 1, 16, 0));
  const keyBefore = panel.todayKey(before);
  const keyAfter = panel.todayKey(after);
  assert.notEqual(keyBefore, keyAfter, 'crossing resetHourUTC boundary should change todayKey');
}

// 2. isValidState() 拒絕格式錯誤的舊資料
function testIsValidStateRejectsMalformed() {
  const panel = freshPanel();
  assert.equal(panel.isValidState(null), false);
  assert.equal(panel.isValidState({}), false);
  assert.equal(panel.isValidState({ slots: ['not_a_real_item_id'], purchases: [false], refreshCount: 0 }), false);
  assert.equal(
    panel.isValidState({
      slots: Array(ECONOMY.shop.slotsPerDay).fill('gold_pack_s'),
      purchases: Array(ECONOMY.shop.slotsPerDay).fill(false),
      refreshCount: 0,
    }),
    true,
  );
}

// 3. generateSlots() 一律產出 slotsPerDay 個合法品項 id
function testGenerateSlotsProducesValidItemIds() {
  const panel = freshPanel();
  const slots = panel.generateSlots();
  assert.equal(slots.length, ECONOMY.shop.slotsPerDay);
  for (const id of slots) {
    assert.ok(panel.itemMap.has(id), `generated slot id "${id}" should exist in ECONOMY.shop.items`);
  }
}

// 4. loadTodayState() 首次呼叫建立新狀態並持久化，第二次呼叫回傳同一份（同一天內冪等）
function testLoadTodayStateIsIdempotentWithinSameDay() {
  const panel = freshPanel();
  const first = panel.loadTodayState();
  assert.equal(first.slots.length, ECONOMY.shop.slotsPerDay);
  assert.equal(first.refreshCount, 0);

  const second = panel.loadTodayState();
  assert.deepEqual(second.slots, first.slots, 'second load on the same day should return the persisted slots, not regenerate');
}

// 5. purchase() 扣款、發獎、標記已購買（用固定 slot 品項，避免隨機性）
function testPurchaseDeductsWalletAndMarksSlotPurchased() {
  const panel = freshPanel();
  panel.state = panel.loadTodayState();
  panel.state.slots[0] = 'gold_pack_s'; // price/reward 由 ECONOMY.shop.items 讀，不在測試硬編數字
  panel.wallet = WalletService.getWallet();
  const item = shopItem('gold_pack_s');

  const silverBefore = panel.wallet.silver;
  const goldBefore = panel.wallet.gold;

  panel.purchase(0);

  const wallet = WalletService.getWallet();
  assert.equal(wallet.silver, silverBefore - item.price, 'silver should be deducted by item price');
  assert.equal(wallet.gold, goldBefore + item.reward.gold, 'gold reward should be credited');
  assert.equal(panel.state.purchases[0], true, 'slot should be marked purchased');
}

// 6. purchase() 餘額不足時不扣款、不標記已購買
function testPurchaseInsufficientFundsDoesNothing() {
  const panel = freshPanel();
  WalletService.setWallet({ silver: 0, gold: 0, ticket: 0 });
  panel.state = panel.loadTodayState();
  panel.state.slots[0] = 'gold_pack_s'; // 錢包是 0，價格從 ECONOMY.shop.items 讀
  panel.wallet = WalletService.getWallet();

  panel.purchase(0);

  const wallet = WalletService.getWallet();
  assert.equal(wallet.silver, 0, 'insufficient funds should not deduct anything');
  assert.equal(panel.state.purchases[0], false, 'slot should remain unpurchased');
}

// 7. purchase() 同一格重複購買是 no-op（已標記 purchased 就直接 return）
function testPurchaseTwiceOnSameSlotIsNoop() {
  const panel = freshPanel();
  panel.state = panel.loadTodayState();
  panel.state.slots[0] = 'gold_pack_s';
  panel.wallet = WalletService.getWallet();

  panel.purchase(0);
  const walletAfterFirst = WalletService.getWallet();

  panel.purchase(0); // 第二次應該直接被 `if (!item || this.state.purchases[index]) return;` 擋掉
  const walletAfterSecond = WalletService.getWallet();

  assert.deepEqual(walletAfterSecond, walletAfterFirst, 'second purchase on an already-purchased slot must not charge again');
}

// 8. refreshSlots() 累計次數、重置購買狀態、達上限後不可再刷新
async function testRefreshSlotsRespectsMaxRefreshesPerDay() {
  const panel = freshPanel();
  panel.state = panel.loadTodayState();
  panel.state.purchases[0] = true; // 模擬已買過一格

  await panel.refreshSlots();
  assert.equal(panel.state.refreshCount, 1);
  assert.equal(panel.state.purchases[0], false, 'refresh should reset all purchase flags');

  for (let i = 1; i < ECONOMY.shop.maxRefreshesPerDay; i++) {
    await panel.refreshSlots();
  }
  assert.equal(panel.state.refreshCount, ECONOMY.shop.maxRefreshesPerDay);

  const refreshCountBefore = panel.state.refreshCount;
  await panel.refreshSlots(); // 超過上限，應該直接 return，不再累加
  assert.equal(panel.state.refreshCount, refreshCountBefore, 'refreshSlots should be a no-op once maxRefreshesPerDay is reached');
}

testTodayKeyRollsOverAtResetHour();
testIsValidStateRejectsMalformed();
testGenerateSlotsProducesValidItemIds();
testLoadTodayStateIsIdempotentWithinSameDay();
testPurchaseDeductsWalletAndMarksSlotPurchased();
testPurchaseInsufficientFundsDoesNothing();
testPurchaseTwiceOnSameSlotIsNoop();
await testRefreshSlotsRespectsMaxRefreshesPerDay();
console.log('shopPanel tests passed');
```

### 2. `tests/skillService.test.js`（新建）

```js
import assert from 'node:assert/strict';

// Mock localStorage for Node environment
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => _store.get(k) ?? null,
  setItem: (k, v) => _store.set(k, v),
  removeItem: (k) => _store.delete(k),
};

const { skillService } = await import('../src/account/skillService.js');
const { ECONOMY } = await import('../config/economyConfig.js');
const { GAME_CONFIG } = await import('../config/gameConfig.js');

function reset() {
  _store.clear();
  skillService.resetSkills();
}

// 1. getLevels() 初始全 0
function testGetLevelsDefaultsToZero() {
  reset();
  const levels = skillService.getLevels();
  for (const attr of ECONOMY.skills.attributes) {
    assert.equal(levels[attr.key], 0, `${attr.key} should default to 0`);
  }
}

// 2. setLevel() 合法值會持久化；非法 key/超出範圍的 level 會被拒絕且不影響既有值
function testSetLevelValidatesKeyAndRange() {
  reset();
  const key = ECONOMY.skills.attributes[0].key;
  const maxLevel = GAME_CONFIG.skill.maxLevel;

  skillService.setLevel(key, 3);
  assert.equal(skillService.getLevel(key), 3);

  skillService.setLevel(key, maxLevel + 1); // 超出上限，應被拒絕
  assert.equal(skillService.getLevel(key), 3, 'out-of-range level should be rejected, keeping previous value');

  skillService.setLevel(key, -1); // 負數，應被拒絕
  assert.equal(skillService.getLevel(key), 3);

  skillService.setLevel('not_a_real_attribute', 5); // 非法 key，應被忽略
  assert.equal(skillService.getLevel('not_a_real_attribute'), 0);
}

// 3. getUpgradeCost() 對齊 ECONOMY.skillGoldCost，滿級回傳 null
function testGetUpgradeCostMatchesConfigCurveAndCapsAtMaxLevel() {
  reset();
  const key = ECONOMY.skills.attributes[0].key;
  const maxLevel = GAME_CONFIG.skill.maxLevel;

  assert.equal(skillService.getUpgradeCost(key), ECONOMY.skillGoldCost[0], 'Lv0→1 cost should read skillGoldCost[0]');

  skillService.setLevel(key, maxLevel);
  assert.equal(skillService.getUpgradeCost(key), null, 'no upgrade cost once at max level');
}

// 4. canUpgrade() 依錢包金幣門檻正確判斷
function testCanUpgradeChecksWalletGold() {
  reset();
  const key = ECONOMY.skills.attributes[0].key;
  const cost = ECONOMY.skillGoldCost[0];

  assert.equal(skillService.canUpgrade(key, { gold: cost - 1 }), false, 'insufficient gold should not allow upgrade');
  assert.equal(skillService.canUpgrade(key, { gold: cost }), true, 'exact gold amount should allow upgrade');
}

// 5. resetSkills() 把所有屬性歸零
function testResetSkillsClearsAllAttributes() {
  reset();
  for (const attr of ECONOMY.skills.attributes) {
    skillService.setLevel(attr.key, 2);
  }
  skillService.resetSkills();
  const levels = skillService.getLevels();
  for (const attr of ECONOMY.skills.attributes) {
    assert.equal(levels[attr.key], 0);
  }
}

testGetLevelsDefaultsToZero();
testSetLevelValidatesKeyAndRange();
testGetUpgradeCostMatchesConfigCurveAndCapsAtMaxLevel();
testCanUpgradeChecksWalletGold();
testResetSkillsClearsAllAttributes();
console.log('skillService tests passed');
```

### 3. `tests/index.js`

加入（放在既有 import 區塊最後即可，順序不影響結果）：
```js
import './shopPanel.test.js';
import './skillService.test.js';
```

---

## 架構約束

1. **本任務不修改 `src/` 下任何檔案的邏輯**，只新增測試。若測試過程中發現 `shopPanel.js`/`skillService.js`/`walletService.js` 有真正的邏輯 bug，先在 sync 報告中列出來，不要順手改掉——由開發者決定是否要開下一個任務處理。
2. 測試檔案不得使用 `document`／jsdom；`ShopPanel` 相關測試一律走 `panel.render = () => {}` + `panel.toast = () => {}` 短路，並傳入非 null container 的方式繞開 DOM 依賴（見上方「環境限制」）。
3. 每個測試案例之間要靠 `_store.clear()` + `WalletService.resetWallet()` / `skillService.resetSkills()` 重置狀態，避免案例互相污染（既有慣例，`saveManager.test.js` 也是這樣做）。
4. 不要新增任何 devDependency（例如 jsdom）；純 Node 環境即可完成本任務。

### 審核備註（執行時要回報，不在 T22 偷修）

`ShopPanel.isValidState()` 目前只檢查 `typeof value.refreshCount === 'number'`，因此 localStorage 若被寫入 `NaN`、負數、或大於 `ECONOMY.shop.maxRefreshesPerDay` 的值，仍可能被視為合法 state。這是現有邏輯的防呆風險，會影響刷新上限可信度；但本任務範圍是「補既有行為測試，不改 src 邏輯」，所以請在 sync report 的「已知風險 / 建議後續」列出，不要在 T22 直接修改 `shopPanel.js` 或加入必然失敗的測試。

---

## 版本號

`config/gameConfig.js` 的 `@version` 與 `GAME_CONFIG.version` 更新為 `v0.0.34.0`（canonical source）。新增的兩個測試檔案本身不需要 `@version` header（其他 `tests/*.test.js` 慣例上也沒有）。

---

## 完成標準

```
node tests/index.js   → 全通過（含 shopPanel.test.js 8 個 cases + skillService.test.js 5 個 cases）
```
- `shopPanel.js` 的每日重置換日邏輯、狀態驗證、購買扣款發獎、重複購買防呆、刷新次數上限都有測試覆蓋。
- `skillService.js` 的預設值、合法性驗證、升級成本曲線、滿級防呆、重置都有測試覆蓋。
- 未修改任何 `src/` 下的既有邏輯。
