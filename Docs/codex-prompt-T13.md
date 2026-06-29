# Codex Task: T13 — 裝備合成 UI（v0.0.26.0）

> 本文件是自完備的實作指令。Codex 只需讀本文件 + 下方列出的現有檔案，
> 不需要讀其他文件。如果本文件與現有程式碼有衝突，以本文件為準並留言說明。

---

## 1. 背景

專案是純 HTML + ES Module 的 SPA，無 build pipeline，部署在 Vercel。
localStorage 是資料層（無後端），所有常數集中在 `config/`。

### 已完成的基礎（你不需要修改這些，只需要 import）

| 檔案 | 提供的 API |
|---|---|
| `config/economyConfig.js` | `ECONOMY.synthesis.silverCostPerSynth`（Array[10]，index 0 = Lv0→1 費用）|
| `config/equipmentConfig.js` | `EQUIPMENT_CONFIG.maxLevel`（= 10）、`EQUIPMENT_SLOTS`（5 個槽位）、`EQUIPMENT_STYLES`（A~J 共 10 款）|
| `src/account/equipmentService.js` | `equipmentService.getInventory()`、`appendItem(item)`、`findItemById(id)` |
| `src/account/walletService.js` | `WalletService.canAfford({silver})`、`WalletService.spendWallet({silver}, reason)` |

---

## 2. 本次要改動的檔案（共 4 個）

```
修改  src/account/equipmentService.js   ← 加 2 個函式、修 1 個驗證
新增  src/ui/synthesisPanel.js          ← 合成 overlay（新檔案）
修改  src/ui/uiManager.js               ← 加 openSynthesis()
修改  src/ui/lobby.js                   ← 加「⚗️ 合成」按鈕
```

---

## 3. 修改 `src/account/equipmentService.js`

### 3-A. 必讀現有內容（先讀再改）

讀 `src/account/equipmentService.js`，注意：

- 第 15 行：`const MAX_FRAGMENT_LEVEL = 4`（只限制抽獎盤來源）
- `normalizeItem()` 的等級驗證目前：
  ```js
  if (!Number.isInteger(level) || level < 0 || level > MAX_FRAGMENT_LEVEL) {
  ```
  **問題：這會擋掉合成產物 Lv5~10，必須修改。**
- `equipmentService` 物件目前 export 清單：
  ```js
  export const equipmentService = {
    getInventory, appendItem, findItemById, resetInventory, countByType,
  };
  ```

### 3-B. 修改 1：修正 `normalizeItem()` 的等級驗證

找到這一段（大約在檔案中段）：
```js
const level = Number(item.level);
if (!Number.isInteger(level) || level < 0 || level > MAX_FRAGMENT_LEVEL) {
  warnInvalid(warn, 'invalid equipment level', item);
  return null;
}
```

**替換成：**
```js
const level = Number(item.level);
const maxAllowed = item.source === 'synthesis'
  ? EQUIPMENT_CONFIG.maxLevel
  : MAX_FRAGMENT_LEVEL;
if (!Number.isInteger(level) || level < 0 || level > maxAllowed) {
  warnInvalid(warn, 'invalid equipment level', item);
  return null;
}
```

同時確認 `EQUIPMENT_CONFIG` 已從 `../../config/equipmentConfig.js` import。
現有的 import 是：
```js
import { EQUIPMENT_SLOTS, EQUIPMENT_STYLES } from '../../config/equipmentConfig.js';
```
改成：
```js
import { EQUIPMENT_CONFIG, EQUIPMENT_SLOTS, EQUIPMENT_STYLES } from '../../config/equipmentConfig.js';
```

### 3-C. 修改 2：新增 `removeItemById`

在 `findItemById` 函式之後、`resetInventory` 之前加入：

```js
function removeItemById(id) {
  if (!isNonEmptyString(id)) return false;
  const inventory = getInventory();
  const next = inventory.filter((item) => item.id !== id);
  if (next.length === inventory.length) return false;
  writeJson(ECONOMY.inventory.storageKey, next);
  return true;
}
```

### 3-D. 修改 3：新增 `synthesizeItems`

在 `removeItemById` 之後加入（注意需要 import walletService）：

```js
/**
 * 原子合成：驗證 → 扣銀幣 → 移除 2 件材料 → 加入 1 件產物
 * @param {{ materialIds: [string, string], resultItem: object }} params
 * @returns {{ ok: true, item: object } | { ok: false, reason: string }}
 */
function synthesizeItems({ materialIds, resultItem }) {
  const [a, b] = materialIds.map(findItemById);
  if (!a || !b) return { ok: false, reason: '找不到材料' };
  if (a.type !== b.type) return { ok: false, reason: '材料槽位不同' };
  if (a.style !== b.style) return { ok: false, reason: '材料款式不同' };
  if (a.level !== b.level) return { ok: false, reason: '材料等級不同' };
  if (a.level >= EQUIPMENT_CONFIG.maxLevel) return { ok: false, reason: '已達最高等級' };

  const cost = ECONOMY.synthesis.silverCostPerSynth[a.level];
  if (!WalletService.canAfford({ silver: cost })) return { ok: false, reason: '銀幣不足' };

  WalletService.spendWallet({ silver: cost }, 'synthesis');
  removeItemById(a.id);
  removeItemById(b.id);
  appendItem(resultItem);

  return { ok: true, item: resultItem };
}
```

**`WalletService` 的 import（加到檔案最上方的 import 區塊）：**
```js
import { WalletService } from './walletService.js';
```

### 3-E. 修改 4：更新 export 清單

```js
export const equipmentService = {
  getInventory,
  appendItem,
  findItemById,
  removeItemById,   // ← 新增
  resetInventory,
  countByType,
  synthesizeItems,  // ← 新增
};
```

### 3-F. 更新版本號

file header 的 `@version` 改為 `v0.0.26.0`，`@exports` 補上 `removeItemById, synthesizeItems`。

---

## 4. 新增 `src/ui/synthesisPanel.js`

這是全新檔案。完整寫出，**不要用 innerHTML**，全部用 `document.createElement`。

### File Header
```js
/**
 * @file        synthesisPanel.js
 * @module      ui
 * @summary     裝備合成 overlay：選槽位與款式，列出可合成組合，顯示費用，執行合成
 * @exports     SynthesisPanel
 * @depends     config/economyConfig.js, config/equipmentConfig.js,
 *              src/account/equipmentService.js, src/account/walletService.js
 * @version     v0.0.26.0
 */
```

### Imports
```js
import { ECONOMY } from '../../config/economyConfig.js';
import { EQUIPMENT_CONFIG, EQUIPMENT_SLOTS, EQUIPMENT_STYLES } from '../../config/equipmentConfig.js';
import { equipmentService } from '../account/equipmentService.js';
import { WalletService } from '../account/walletService.js';
```

### 常數（複製 equipmentPanel.js 的設計語言）
```js
const OVERLAY_ID = 'synthesis-overlay';
const GOLD = '#D4A017';
const LEVEL_COLORS = { 0: '#888', 1: '#eee', 2: '#4caf50', 3: '#2196f3', 4: '#D4A017' };
```

### 類別結構

```js
export class SynthesisPanel {
  constructor(container) {
    this.container = container ?? document.body;
    this.overlay = null;
    this._selectedType = EQUIPMENT_SLOTS[0];
    this._selectedStyle = null; // null = 全部顯示
  }

  show() {
    this._ensureOverlay();
    this._render();
    this.overlay.style.display = 'flex';
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
  }

  _ensureOverlay() {
    if (document.getElementById(OVERLAY_ID)) {
      this.overlay = document.getElementById(OVERLAY_ID);
      return;
    }

    this.overlay = el('div', { id: OVERLAY_ID });
    this.overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.92);',
      'display:none;align-items:center;justify-content:center;',
      'z-index:10004;font-family:sans-serif;color:#eee;',
    ].join('');
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    const panel = el('div');
    panel.style.cssText = [
      'width:min(660px,96vw);max-height:90vh;overflow:auto;',
      'background:#101010;color:#eee;',
      'border:1px solid rgba(212,160,23,0.55);',
      'box-shadow:0 18px 48px rgba(0,0,0,0.5);',
      'border-radius:6px;padding:20px;box-sizing:border-box;',
    ].join('');

    // 標題列
    const titleRow = el('div');
    titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
    const title = el('h2', { textContent: '⚗️ 裝備合成' });
    title.style.cssText = `margin:0;color:${GOLD};font-family:Georgia,serif;font-size:22px;letter-spacing:2px;`;
    const closeBtn = el('button', { textContent: '✕' });
    closeBtn.style.cssText = btnStyle();
    closeBtn.addEventListener('click', () => this.hide());
    titleRow.append(title, closeBtn);

    // 狀態欄（顯示訊息）
    this._statusEl = el('div');
    this._statusEl.style.cssText = 'min-height:20px;font-size:13px;color:#f4d37b;text-align:center;margin-bottom:10px;';

    // 槽位 Tab
    const typeRow = el('div');
    typeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;';
    for (const type of EQUIPMENT_SLOTS) {
      const btn = el('button', { textContent: EQUIPMENT_CONFIG.slots[type]?.name ?? type });
      btn.style.cssText = tabStyle(type === this._selectedType);
      btn.addEventListener('click', () => {
        this._selectedType = type;
        typeRow.querySelectorAll('button').forEach((b, i) => {
          b.style.cssText = tabStyle(EQUIPMENT_SLOTS[i] === type);
        });
        this._renderList();
      });
      typeRow.appendChild(btn);
    }

    // 款式篩選
    const styleRow = el('div');
    styleRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;align-items:center;';
    const styleLabel = el('span', { textContent: '款式：' });
    styleLabel.style.cssText = 'color:#aaa;font-size:12px;';
    styleRow.appendChild(styleLabel);
    const allStyleBtn = el('button', { textContent: '全部' });
    allStyleBtn.style.cssText = styleTabStyle(this._selectedStyle === null);
    allStyleBtn.addEventListener('click', () => {
      this._selectedStyle = null;
      styleRow.querySelectorAll('button').forEach((b, i) => {
        // i=0 是「全部」，i=1~10 是 A~J
        b.style.cssText = styleTabStyle(i === 0);
      });
      this._renderList();
    });
    styleRow.appendChild(allStyleBtn);
    for (const style of EQUIPMENT_STYLES) {
      const btn = el('button', { textContent: style });
      btn.style.cssText = styleTabStyle(false);
      btn.addEventListener('click', () => {
        this._selectedStyle = style;
        const allBtns = styleRow.querySelectorAll('button');
        allBtns[0].style.cssText = styleTabStyle(false);
        EQUIPMENT_STYLES.forEach((s, i) => {
          allBtns[i + 1].style.cssText = styleTabStyle(s === style);
        });
        this._renderList();
      });
      styleRow.appendChild(btn);
    }

    // 列表區
    this._listEl = el('div');
    this._listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:12px;';

    // 關閉按鈕（底部）
    const bottomRow = el('div');
    bottomRow.style.cssText = 'display:flex;justify-content:flex-end;';
    const closeBtn2 = el('button', { textContent: '關閉' });
    closeBtn2.style.cssText = btnStyle();
    closeBtn2.addEventListener('click', () => this.hide());
    bottomRow.appendChild(closeBtn2);

    panel.append(titleRow, this._statusEl, typeRow, styleRow, this._listEl, bottomRow);
    this.overlay.appendChild(panel);
    this.container.appendChild(this.overlay);
  }

  _render() {
    this._renderList();
  }

  _renderList() {
    const inventory = equipmentService.getInventory();
    const options = getSynthesisOptions(inventory, this._selectedType, this._selectedStyle);

    this._listEl.replaceChildren();

    if (options.length === 0) {
      const msg = el('div', { textContent: '目前沒有可合成的裝備組合' });
      msg.style.cssText = 'color:#888;font-size:13px;text-align:center;padding:20px 0;';
      this._listEl.appendChild(msg);
      return;
    }

    for (const opt of options) {
      this._listEl.appendChild(this._renderOption(opt));
    }
  }

  _renderOption({ type, style, level, items }) {
    const cost = ECONOMY.synthesis.silverCostPerSynth[level];
    const typeName = EQUIPMENT_CONFIG.slots[type]?.name ?? type;
    const canAfford = WalletService.canAfford({ silver: cost });

    const row = el('div');
    row.style.cssText = [
      'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;',
      'padding:10px 12px;border-radius:5px;',
      'border:1px solid rgba(212,160,23,0.3);background:rgba(255,255,255,0.04);',
    ].join('');

    // 左側：裝備資訊
    const info = el('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    const nameEl = el('span', { textContent: `${typeName}－款式 ${style}` });
    nameEl.style.cssText = 'font-size:14px;color:#fff;font-weight:bold;';

    const matEl = el('span');
    matEl.textContent = `Lv${level} × ${items.length} 件  →  Lv${level + 1} × 1 件`;
    matEl.style.cssText = 'font-size:12px;color:#aaa;';

    const costEl = el('span');
    costEl.textContent = `費用：${cost.toLocaleString('en-US')} 銀幣`;
    costEl.style.cssText = `font-size:12px;color:${canAfford ? '#f4d37b' : '#e57373'};`;

    info.append(nameEl, matEl, costEl);

    // 右側：合成按鈕
    const synthBtn = el('button', { textContent: '合成' });
    synthBtn.style.cssText = synthBtnStyle(canAfford);
    synthBtn.disabled = !canAfford;
    synthBtn.addEventListener('click', () => {
      this._doSynthesize({ type, style, level, items });
    });

    row.append(info, synthBtn);
    return row;
  }

  _doSynthesize({ type, style, level, items }) {
    const [matA, matB] = items;
    const resultId = `synth:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const resultItem = {
      id: resultId,
      type,
      style,
      level: level + 1,
      acquiredAt: new Date().toISOString(),
      source: 'synthesis',
    };

    const res = equipmentService.synthesizeItems({
      materialIds: [matA.id, matB.id],
      resultItem,
    });

    if (res.ok) {
      const typeName = EQUIPMENT_CONFIG.slots[type]?.name ?? type;
      this._setStatus(`✅ 合成成功：${typeName}－款式 ${style} Lv${level + 1}`);
    } else {
      this._setStatus(`❌ 合成失敗：${res.reason}`);
    }

    this._renderList(); // 重新整理列表
  }

  _setStatus(msg) {
    this._statusEl.textContent = msg;
    // 3 秒後清除
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => {
      this._statusEl.textContent = '';
    }, 3000);
  }
}
```

### 輔助函式（在 class 之外）

```js
/**
 * 找出庫存中所有可合成的組合
 * 條件：同 type + 同 style + 同 level，且數量 ≥ 2，且 level < maxLevel
 */
function getSynthesisOptions(inventory, filterType, filterStyle) {
  const grouped = {};

  for (const item of inventory) {
    if (item.type !== filterType) continue;
    if (filterStyle !== null && item.style !== filterStyle) continue;
    const key = `${item.type}|${item.style}|${item.level}`;
    grouped[key] = grouped[key] ?? { type: item.type, style: item.style, level: item.level, items: [] };
    grouped[key].items.push(item);
  }

  return Object.values(grouped)
    .filter((g) => g.items.length >= 2 && g.level < EQUIPMENT_CONFIG.maxLevel)
    .sort((a, b) => a.level - b.level || a.style.localeCompare(b.style));
}

function el(tag, props = {}) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'textContent') node.textContent = value;
    else if (key === 'id') node.id = value;
    else node.setAttribute(key, value);
  }
  return node;
}

function btnStyle() {
  return 'padding:7px 14px;border:1px solid rgba(212,160,23,0.55);background:rgba(212,160,23,0.12);color:#f4d37b;border-radius:4px;font-size:13px;cursor:pointer;';
}

function tabStyle(active) {
  return active
    ? `padding:6px 12px;border:1px solid ${GOLD};background:rgba(212,160,23,0.22);color:${GOLD};border-radius:4px;font-size:13px;cursor:pointer;font-weight:bold;`
    : 'padding:6px 12px;border:1px solid rgba(212,160,23,0.3);background:transparent;color:#aaa;border-radius:4px;font-size:13px;cursor:pointer;';
}

function styleTabStyle(active) {
  return active
    ? `padding:4px 9px;border:1px solid ${GOLD};background:rgba(212,160,23,0.22);color:${GOLD};border-radius:3px;font-size:12px;cursor:pointer;font-weight:bold;`
    : 'padding:4px 9px;border:1px solid rgba(212,160,23,0.2);background:transparent;color:#888;border-radius:3px;font-size:12px;cursor:pointer;';
}

function synthBtnStyle(enabled) {
  return enabled
    ? 'padding:8px 16px;border:1px solid rgba(212,160,23,0.7);background:rgba(212,160,23,0.2);color:#f4d37b;border-radius:4px;font-size:13px;cursor:pointer;white-space:nowrap;'
    : 'padding:8px 16px;border:1px solid #444;background:#1a1a1a;color:#555;border-radius:4px;font-size:13px;cursor:not-allowed;white-space:nowrap;';
}
```

---

## 5. 修改 `src/ui/uiManager.js`

### 必讀現有內容

讀 `src/ui/uiManager.js`，你會看到 4 個 lazy-singleton export 函式。

### 修改

**在 import 區塊加：**
```js
import { SynthesisPanel } from './synthesisPanel.js';
```

**在 `let skillPanel = null;` 之後加：**
```js
let synthesisPanel = null;
```

**在 `openSkills()` 之後加：**
```js
export function openSynthesis() {
  synthesisPanel ??= new SynthesisPanel(document.body);
  synthesisPanel.show();
  return synthesisPanel;
}
```

**更新 file header：**
- `@exports` 補上 `openSynthesis`
- `@depends` 補上 `src/ui/synthesisPanel.js`
- `@version` 改為 `v0.0.26.0`

---

## 6. 修改 `src/ui/lobby.js`

### 必讀現有內容

讀 `src/ui/lobby.js`，你會看到：

```js
import { openEquipment, openGacha, openShop, openSkills } from './uiManager.js';
```

以及建立 header 按鈕的區塊（約第 50-60 行）：
```js
const shopBtn = _btn('每日商店');
shopBtn.addEventListener('click', openShop);
const gachaBtn = _btn('🎲 抽獎盤');
gachaBtn.addEventListener('click', openGacha);
const equipmentBtn = _btn('🎒 裝備');
equipmentBtn.addEventListener('click', openEquipment);
const skillsBtn = _btn('⚡ 技能');
skillsBtn.addEventListener('click', openSkills);
leftActions.append(shopBtn, gachaBtn, equipmentBtn, skillsBtn);
```

### 修改

**import 行改為：**
```js
import { openEquipment, openGacha, openShop, openSkills, openSynthesis } from './uiManager.js';
```

**在 `skillsBtn` 之後、`leftActions.append(...)` 之前插入：**
```js
const synthesisBtn = _btn('⚗️ 合成');
synthesisBtn.addEventListener('click', openSynthesis);
```

**`leftActions.append(...)` 改為：**
```js
leftActions.append(shopBtn, gachaBtn, equipmentBtn, skillsBtn, synthesisBtn);
```

**更新 file header：**
- `@version` 改為 `v0.0.26.0`

---

## 7. 完成後的 Sync 報告格式

請輸出：

```
## T13 Sync 報告

### 修改的檔案
- src/account/equipmentService.js：[修改內容摘要]
- src/ui/synthesisPanel.js：[新增，行數]
- src/ui/uiManager.js：[修改內容摘要]
- src/ui/lobby.js：[修改內容摘要]

### 驗證清單
- [ ] normalizeItem() 允許 source='synthesis' 的 Lv5~10 裝備
- [ ] synthesizeItems 有做錢夠的檢查再扣款
- [ ] 合成條件需 type + style + level 三項一致
- [ ] Lv10 裝備不出現在合成列表
- [ ] 費用來自 ECONOMY.synthesis.silverCostPerSynth[level]，無硬編數字
- [ ] synthesisPanel 無 innerHTML
- [ ] lobby.js 有 ⚗️ 合成 按鈕
```

---

## 8. 絕對禁止

- **禁止** 寫任何 `innerHTML = ...`（XSS 風險，整個專案的規定）
- **禁止** 在任何 `src/` 檔案硬編銀幣數字（一律 import `ECONOMY.synthesis.silverCostPerSynth`）
- **禁止** 新增 Supabase table 或任何後端呼叫
- **禁止** 修改 `config/economyConfig.js`（費用曲線已定案）
- **禁止** 修改 `config/equipmentConfig.js`
- **禁止** 修改 `src/ui/equipmentPanel.js`（裝備庫存 panel 獨立）
