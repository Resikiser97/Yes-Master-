# design-patterns.md — 設計模式與跨功能一致性規則

> 類型：**文件優先**（發現不一致時，以本檔規則為準去修代碼）
> 用途：記錄「凡對 X 生效的功能，也必須對 Y 生效」這類跨功能原則，避免日後重複踩坑

---

## 1. 核心格視同連通地基（Core = Foundation）

**原則**：  
任何對「與核心連通的泥土格」生效的功能，**同樣必須對「核心格本身」生效**。

**適用範圍（現有功能）**：

| 功能 | 觸發條件 | 實作位置 |
|---|---|---|
| 背包自動卸貨 | 站在連通泥土 or 核心格 | `actions.js` `tryDeposit` → `isOnFoundation()` |
| R 鍵修復 | 站在連通泥土 or 核心格 | `actions.js` `isOnRepairSurface` → `isOnFoundation()` |

**共用函式**（`src/game/actions.js`）：
```js
function isOnFoundation(world, px, py) {
  if (world.core.some(([x, y]) => x === px && y === py)) return true;
  return computeConnected(world.dirt, world.core).has(key(px, py));
}
```

**未來新增功能時的 checklist**：  
- [ ] 如果功能的觸發條件涉及「站在連通地基上」→ 一律用 `isOnFoundation()`，不要自己再寫一份  
- [ ] 如果功能的判斷涉及「連通面積/數量」→ 核心格是否應該計入？請明確決定並記錄

**為什麼會踩到這個坑**：  
`computeConnected(dirt, core)` 返回的 Set 只包含**泥土格**，核心格是 BFS 的起點但不在 Set 裡。  
所以所有「站在 connected.has(key)」判斷，如果忘了加核心格，都會出現「核心旁邊有效但核心上無效」的 bug。

---

## 2. 版本號與文件同步（sync-docs 鐵則）

> 見 `.claude/instructions.md` 第 2 節，不在本檔重複。

---

## 3. 純邏輯不碰 DOM / 世界狀態（鐵則 9）

> 見 `Docs/game-architecture-plan.md`「程式碼分層原則」。

---

## 4. 隨機注入（不用 Math.random()）

> 純邏輯內禁止直接呼叫 `Math.random()`；一律注入 `createRng(seed)` 的 rng 物件，見 `src/logic/rng.js`。

---

## 使用說明

每次發現「A 功能有效但 B 功能忘了」的問題時：
1. 在此新增一條規則，說明「凡對 X 生效必須也對 Y 生效」
2. 在對應的代碼加 `// ⚠️ 設計原則：見 Docs/design-patterns.md` 的提示
3. 更新 QUICKREF.md 陷阱表加一行
