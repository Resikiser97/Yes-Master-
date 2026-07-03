# Codex Prompt — T23：ShopPanel state 防壞資料修復

> **版本目標：v0.0.35.0**

---

## 背景

T22（測試補強任務）在審核階段發現一個**已知但刻意沒修**的風險，當時範圍是「只補測試，不改 src 邏輯」，寫進了 `Docs/history/codex-prompt-T22.md` 的審核備註，現在正式開一個任務修掉：

`src/ui/shopPanel.js` 的 `isValidState()`（約 line 104-114）目前只檢查：

```js
isValidState(value) {
  return Boolean(
    value
      && Array.isArray(value.slots)
      && value.slots.length === ECONOMY.shop.slotsPerDay
      && value.slots.every((id) => this.itemMap.has(id))
      && Array.isArray(value.purchases)
      && value.purchases.length === ECONOMY.shop.slotsPerDay
      && typeof value.refreshCount === 'number',
  );
}
```

`typeof value.refreshCount === 'number'` 這個檢查對 `NaN`、負數、超過 `ECONOMY.shop.maxRefreshesPerDay` 的數字**全部放行**（`NaN` 的 `typeof` 也是 `'number'`）。`loadTodayState()`（line 90-102）用 `isValidState()` 決定要不要信任 `localStorage` 裡讀出來的舊資料——如果玩家（或任何寫壞 localStorage 的來源，例如舊版本殘留資料、手動編輯）把 `refreshCount` 改成 `999` 或 `NaN`，這個壞資料會被當成合法 state 直接使用，`refreshSlots()` 的 `if (this.state.refreshCount >= ECONOMY.shop.maxRefreshesPerDay) return;` 防呆看似正常，但如果初始值本身就是壞的（例如 `NaN >= 3` 恆為 `false`），玩家可以無限刷新，繞過「每日最多 3 次」的設計上限。

---

## 任務要求

**第一步：重新審查整個 `isValidState()`，不要只修 `refreshCount` 這一項。** 依同樣的邏輯檢查 `value.purchases` 陣列內每個元素是否真的是 `boolean`（目前只驗證了陣列長度，沒驗證元素型別，同一類問題）。如果還發現其他欄位有類似的「型別檢查不等於值域檢查」漏洞，一併列出來，不要假設只有這兩處。

**第二步：修正 `src/ui/shopPanel.js` 的 `isValidState()`**，建議修法（可依你重新審查的結果調整，但邏輯方向要一致）：

```js
isValidState(value) {
  return Boolean(
    value
      && Array.isArray(value.slots)
      && value.slots.length === ECONOMY.shop.slotsPerDay
      && value.slots.every((id) => this.itemMap.has(id))
      && Array.isArray(value.purchases)
      && value.purchases.length === ECONOMY.shop.slotsPerDay
      && value.purchases.every((flag) => typeof flag === 'boolean')
      && Number.isInteger(value.refreshCount)
      && value.refreshCount >= 0
      && value.refreshCount <= ECONOMY.shop.maxRefreshesPerDay,
  );
}
```

**不要改變 `loadTodayState()` 的呼叫方式或既有行為**——`isValidState()` 回傳 `false` 時，`loadTodayState()` 本來就會走「產生全新 state」的分支（line 95-101），這個 fallback 邏輯已經是對的，不用動。

---

## 修改檔案（共 2 個）

### 1. `src/ui/shopPanel.js`
如上，修正 `isValidState()`。同時把 file header `@version`（line 7）更新為 `v0.0.35.0`。

### 2. `tests/shopPanel.test.js`（擴充既有檔案，不要新建檔案）

在既有的 `testIsValidStateRejectsMalformed()` 測試裡補上新的壞資料案例（不要新開一個測試函式，延續同一個測試涵蓋同一主題即可，除非你認為拆開更清楚也可以，但要確保 `tests/index.js` 的 import 不用變動）：

```js
// 在既有 testIsValidStateRejectsMalformed() 內，原本的斷言之後追加：
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

  // T23 新增：refreshCount 值域防呆（NaN / 負數 / 超過每日上限）
  const validSlots = Array(ECONOMY.shop.slotsPerDay).fill('gold_pack_s');
  const validPurchases = Array(ECONOMY.shop.slotsPerDay).fill(false);

  assert.equal(
    panel.isValidState({ slots: validSlots, purchases: validPurchases, refreshCount: NaN }),
    false,
    'NaN refreshCount must be rejected',
  );
  assert.equal(
    panel.isValidState({ slots: validSlots, purchases: validPurchases, refreshCount: -1 }),
    false,
    'negative refreshCount must be rejected',
  );
  assert.equal(
    panel.isValidState({ slots: validSlots, purchases: validPurchases, refreshCount: ECONOMY.shop.maxRefreshesPerDay + 1 }),
    false,
    'refreshCount above maxRefreshesPerDay must be rejected',
  );
  assert.equal(
    panel.isValidState({ slots: validSlots, purchases: validPurchases, refreshCount: ECONOMY.shop.maxRefreshesPerDay }),
    true,
    'refreshCount exactly at maxRefreshesPerDay is still valid (boundary, not yet over)',
  );

  // T23 新增：purchases 陣列元素型別防呆（非 boolean 值也曾被 typeof 檢查漏放行）
  assert.equal(
    panel.isValidState({
      slots: validSlots,
      purchases: [1, 0, 'true', null, undefined, {}].slice(0, ECONOMY.shop.slotsPerDay).concat(
        Array(Math.max(0, ECONOMY.shop.slotsPerDay - 6)).fill(false),
      ),
      refreshCount: 0,
    }),
    false,
    'purchases array with non-boolean entries must be rejected',
  );
}
```

> 如果你重新審查後發現 `purchases` 陣列型別檢查的最佳寫法跟上面草稿不同（上面那個 `.slice/.concat` 拼法只是為了湊出跟 `slotsPerDay` 等長、且混入非法值的陣列，寫法笨拙），可以自己改寫得更乾淨，只要斷言的意圖（「陣列長度符合但元素型別不對，應該被拒絕」）不變即可。

---

## 架構約束

1. 這次**可以**改 `src/ui/shopPanel.js` 的邏輯（跟 T22 不同，T22 明確禁止動 src，這次就是要修 src）。
2. 不要動 `loadTodayState()`／`purchase()`／`refreshSlots()` 的邏輯，只修 `isValidState()` 這個驗證函式本身。
3. 沿用 T22 已經修好的測試環境慣例（`tests/shopPanel.test.js` 開頭的 `if (typeof globalThis.localStorage === 'undefined')` + `panel.render = () => {}` + `panel.toast = () => {}`），不要改動這些既有 helper。
4. 不要新增測試檔案，直接擴充 `tests/shopPanel.test.js` 既有的 `testIsValidStateRejectsMalformed()`。

---

## 版本號

`src/ui/shopPanel.js` 與 `config/gameConfig.js` 的 `@version` / `GAME_CONFIG.version` 更新為 `v0.0.35.0`（canonical source 是 `config/gameConfig.js`）。

---

## 完成標準

```
node tests/index.js   → 全通過（含 shopPanel.test.js 擴充後的新斷言）
```
- `isValidState()` 對 `refreshCount` 做完整值域檢查（整數、`>=0`、`<= maxRefreshesPerDay`），`NaN`/負數/超過上限一律視為不合法狀態。
- `isValidState()` 對 `purchases` 陣列元素做型別檢查（每個都必須是 `boolean`）。
- 若審查中發現其他類似漏洞（型別檢查不等於值域檢查），一併修正並在 sync 報告列出多修了什麼、為什麼。
- 玩家無法透過寫壞 localStorage 的 `refreshCount`/`purchases` 繞過每日刷新次數上限。
