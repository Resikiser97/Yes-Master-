# Codex Prompt T18 — 卡片 UI 標籤補全

> 版本目標：v0.0.31.0
> 只改一個檔案：`src/render/renderer.js`
> 參考文件：`Docs/bosscard.md`「卡片顯示格式」章節

---

## 背景

第 10 / 20 / 30 關出牌畫面（`_drawCardPanel`）目前有以下問題：

1. **效果文字顯示英文 stat 名稱**，玩家看不懂（例如 `玩家 spirit +20`、`nightRepairPct 20%`）
2. **類型標籤**顯示英文（`resource`）且格式不對（bosscard.md 規格是 `[資源]`）
3. **稀有度文字**（基礎/普通/稀有）對玩家顯示，bosscard.md 明確說 MVP 不對玩家顯示稀有度
4. **流派標籤**（`lane` 欄位，例：`高塔/延伸流`）完全沒顯示
5. **風險標籤**（`risk` 欄位，例：`有代價`、`危險`）完全沒顯示
6. **「價值 X」**對玩家顯示，bosscard.md 說不顯示內部價值點

---

## 改動範圍

只改 `src/render/renderer.js`：

1. 在 `cardEffectText` 函式前新增 `STAT_ZH` 對照表
2. 改寫 `cardEffectText` 函式（i18n）
3. 改寫 `_drawCardPanel` 函式（佈局與標籤）

---

## 1. 新增 `STAT_ZH` 常數

在 `cardEffectText` 函式定義（目前約第 72 行）的**正上方**，插入以下常數：

```js
const STAT_ZH = {
  // coreStat 欄位
  hpMax: '血量上限', attack: '攻擊', attackSpeed: '攻速',
  defense: '防禦', range: '範圍', chain: '連鎖', magicPct: '魔法%',
  // playerStat 欄位
  carry: '背負能力', mining: '挖礦力', repair: '修復能力',
  spirit: '靈力', moveSpeed: '移動速度',
  // modifier stat 欄位
  nightRepairPct: '夜間修復', nightMiningPct: '夜間挖礦',
  repairPct: '修復效率', heightBonusPct: '高度加成',
  coreHpMax: '核心血量上限',
};
```

---

## 2. 改寫 `cardEffectText`

**舊版（完整替換）**：
```js
function cardEffectText(effect = {}) {
  if (effect.hint) return effect.hint;
  if (effect.kind === 'coreStat') {
    const heal = effect.heal != null ? `，回復 ${fmt2(effect.heal)}` : '';
    return `核心 ${effect.stat} +${fmt2(effect.add)}${heal}`;
  }
  if (effect.kind === 'playerStat') return `玩家 ${effect.stat} +${fmt2(effect.add)}`;
  if (effect.kind === 'resource') return `獲得 ${fmtItems(effect.grant ?? {})}`;
  if (effect.kind === 'modifier') {
    return (effect.mods ?? []).map((m) => `${m.stat} ${m.pct != null ? `${m.pct}%` : fmt2(m.add)}`).join(' / ');
  }
  return '效果待確認';
}
```

**新版**：
```js
function cardEffectText(effect = {}) {
  if (effect.hint) return effect.hint;
  if (effect.kind === 'coreStat') {
    const statZh = STAT_ZH[effect.stat] ?? effect.stat;
    const heal = effect.heal != null ? `，回復 ${fmt2(effect.heal)}` : '';
    return `核心${statZh} +${fmt2(effect.add)}${heal}`;
  }
  if (effect.kind === 'playerStat') {
    const statZh = STAT_ZH[effect.stat] ?? effect.stat;
    return `${statZh} +${fmt2(effect.add)}`;
  }
  if (effect.kind === 'resource') return `獲得 ${fmtItems(effect.grant ?? {})}`;
  if (effect.kind === 'modifier') {
    return (effect.mods ?? []).map((m) => {
      const statZh = STAT_ZH[m.stat] ?? m.stat;
      if (m.pct != null) return `${statZh} ${m.pct >= 0 ? '+' : ''}${m.pct}%`;
      const add = m.add ?? 0;
      return `${statZh} ${add >= 0 ? '+' : ''}${fmt2(add)}`;
    }).join(' / ');
  }
  return '效果待確認';
}
```

---

## 3. 改寫 `_drawCardPanel`

`_drawCardPanel(card, rect, hovered = false)` 完整替換：

**舊版**（整個函式替換）：
```js
  _drawCardPanel(card, rect, hovered = false) {
    const ctx = this.ctx;
    const tierLabelMap = { strong: '稀有', standard: '普通', weak: '基礎' };
    const tierColorMap = { strong: '#e6c64d', standard: '#7fd0e0', weak: '#8a8a8a' };
    const tierLabel = tierLabelMap[card.tier] ?? card.tier ?? 'tier?';
    const borderColor = tierColorMap[card.tier] ?? tierColorMap.standard;
    ctx.save();
    ctx.fillStyle = hovered ? '#252f3e' : '#1e2630';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = hovered ? 4 : 2;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (hovered) {
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 12;
    }
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f2f2f2';
    ctx.font = 'bold 16px sans-serif';
    wrapText(ctx, card.zh ?? card.key ?? '未知卡片', rect.x + 14, rect.y + 16, rect.w - 28, 22, 2);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = borderColor;
    ctx.fillText(`${card.type ?? 'unknown'}・${tierLabel}`, rect.x + 14, rect.y + 66);

    ctx.fillStyle = '#d4dce8';
    ctx.font = '14px sans-serif';
    wrapText(ctx, cardEffectText(card.effect), rect.x + 14, rect.y + 96, rect.w - 28, 20, 5);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x + 14, rect.y + rect.h - 40);
    ctx.lineTo(rect.x + rect.w - 14, rect.y + rect.h - 40);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.fillText(`價值 ${card.value ?? '-'}`, rect.x + 14, rect.y + rect.h - 28);
    ctx.restore();
  }
```

**新版**：
```js
  _drawCardPanel(card, rect, hovered = false) {
    const ctx = this.ctx;
    const typeZhMap = { resource: '資源', ability: '能力', core: '核心', archetype: '流派' };
    const tierColorMap = { strong: '#e6c64d', standard: '#7fd0e0', weak: '#8a8a8a' };
    const borderColor = tierColorMap[card.tier] ?? tierColorMap.standard;
    const typeZh = typeZhMap[card.type] ?? card.type ?? '?';

    ctx.save();
    ctx.fillStyle = hovered ? '#252f3e' : '#1e2630';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = hovered ? 4 : 2;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (hovered) {
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 12;
    }
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // 卡名
    ctx.fillStyle = '#f2f2f2';
    ctx.font = 'bold 16px sans-serif';
    wrapText(ctx, card.zh ?? card.key ?? '未知卡片', rect.x + 14, rect.y + 16, rect.w - 28, 22, 2);

    // 類型標籤（不顯示稀有度，只用邊框顏色區分）
    ctx.font = '12px sans-serif';
    ctx.fillStyle = borderColor;
    ctx.fillText(`[${typeZh}]`, rect.x + 14, rect.y + 62);

    // 流派標籤
    if (card.lane) {
      ctx.fillStyle = '#7a9ab8';
      ctx.font = '11px sans-serif';
      ctx.fillText(`[${card.lane}]`, rect.x + 14, rect.y + 78);
    }

    // 效果文字
    ctx.fillStyle = '#d4dce8';
    ctx.font = '14px sans-serif';
    wrapText(ctx, cardEffectText(card.effect), rect.x + 14, rect.y + 96, rect.w - 28, 19, 4);

    // 分隔線
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x + 14, rect.y + rect.h - 38);
    ctx.lineTo(rect.x + rect.w - 14, rect.y + rect.h - 38);
    ctx.stroke();

    // 風險標籤（只有帶代價的流派卡才有）
    if (card.risk?.length) {
      ctx.fillStyle = '#e57373';
      ctx.font = '11px sans-serif';
      ctx.fillText(card.risk.map((r) => `[${r}]`).join(' '), rect.x + 14, rect.y + rect.h - 24);
    }

    ctx.restore();
  }
```

---

## 佈局對照（卡片高度 220px 不變）

```
y+16   卡名（bold 16px，最多 2 行）
y+62   [資源] / [能力] / [核心] / [流派]（borderColor，12px）
y+78   [流派標籤]（#7a9ab8，11px，僅當 card.lane 存在）
y+96   效果描述（#d4dce8，14px，最多 4 行 × 19px）
y+182  分隔線（y+rect.h-38）
y+196  [有代價] [危險]（#e57373，11px，僅當 card.risk 存在）
```

---

## 效果文字對照（改後預期輸出）

| 卡片 | 改後效果文字 |
|---|---|
| 鐵牙核心 | `核心攻擊 +2` |
| 金輪核心 | `核心攻速 +0.2` |
| 厚土外殼 | `核心血量上限 +25，回復 25` |
| 沙眼瞭望 | `核心範圍 +15` |
| 鑽光折射 | `核心連鎖 +0.35` |
| 魔法鼓點 | `靈力 +20` |
| 背簍加固 | `背負能力 +25` |
| 老礦工手腕 | `挖礦力 +25` |
| 輕腳步 | `移動速度 +20` |
| 縫補本能 | `修復能力 +25` |
| 夜修班 | `夜間修復 +20% / 夜間挖礦 -10%` |
| 貪礦契約 | `夜間挖礦 +20% / 核心血量上限 -10` |
| 高塔工法 | `高度加成 +10% / 修復效率 -10%` |
| 資源型卡片 | `獲得 土x16 石x12 沙x12`（`hint` 欄位直接輸出，不變） |

---

## 版本號

`renderer.js` header 更新：
```
@version     v0.0.31.0
```

---

## 驗證

1. `node --check src/render/renderer.js` → 無 syntax error
2. `npm test` → All tests passed
3. （人工）啟動遊戲，觸發卡片選擇畫面，確認：
   - 卡名顯示正確
   - `[資源]` / `[能力]` / `[核心]` / `[流派]` 類型標籤顯示（無「稀有/普通/基礎」文字）
   - 流派標籤顯示為藍灰色 `[高塔/延伸流]` 等
   - 效果描述全部是中文
   - 夜修班 / 貪礦契約 / 高塔工法底部有紅色 `[有代價]` 標籤
   - 貪礦契約底部有 `[有代價] [危險]`
   - 沒有「價值 100」文字
