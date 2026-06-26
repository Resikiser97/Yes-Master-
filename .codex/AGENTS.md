# Codex Project Instructions

> 本檔是 Codex 的開場守則。**必須先讀 `.claude/instructions.md`（AI 協作最高 SOP）**，
> 再依照下方 Codex 專屬責任範圍執行。

---

## 0. 最高優先：先讀這個

**每次對話開始，第一件事：讀 `.claude/instructions.md`。**

該檔包含：
- 完整開場讀取儀式（8 個必讀文件的順序）
- sync-docs 收尾流程（Step 1~8）
- 版本號規則（哪段可動、如何進位）
- 開發鐵則（Magic Number 禁令、純邏輯分離等）
- git 推送規範

讀完 `.claude/instructions.md` 後，再依序讀：

```
1. .claude/instructions.md   ← 最高 SOP（版本號規則、sync-docs、鐵則）
2. Docs/source-map.md        ← 專案知識 source map
3. Docs/planning-dashboard.md
4. 任務相關規劃或設計檔
```

---

## 1. Codex 的主要責任範圍

Codex 負責遊戲玩法設計、平衡、波次規劃、模擬紀錄、Must Solve 追蹤。

主要維護文件：

- `Docs/mustsolve.md`
- `Docs/waveplan.md`
- `Docs/simulation/`
- `Docs/game-design-plan.md`（設計章節）
- `config/enemies.js`（敵人基礎數值）
- `config/waves.js`（波次設定）
- `config/cards.js`（卡池）

架構相關工作，也需讀：

- `Docs/game-architecture-plan.md`
- `Docs/claude-code-handoff.md`

---

## 2. 版本號與 sync-docs（Codex 適用版）

> 完整規則在 `.claude/instructions.md` 第 2、4 節與 `VERSION_RULES.md`。

**每次任務完成後，Codex 必須執行以下其中一項（不可跳過）：**

### 選項 A：Codex 自行更新文件
按 `.claude/instructions.md` sync-docs Step 1~8 執行：
- 更新版本號（`y` 或 `z`，不得動 `v0` 和 `x`）
- 更新 `CHANGELOG.md`、`QUICKREF.md`、`MAIN.md`、`project_summary.md`
- 更新所有 `src/**/*.js` 與 `config/**/*.js` 的 file header `@version`
- 輸出 sync-docs 報告

### 選項 B：Codex 無法完成更新時
必須在回應結尾明確列出：

```
── 版本提醒 ──
本次變更建議版本號：v0.x.Y.Z（[功能版本 / 修復版本]）
原因：[一句話說明做了什麼]
需要開發者手動完成：
  □ config/gameConfig.js GAME_CONFIG.version 改為 v0.x.Y.Z
  □ CHANGELOG.md 頂部版本號 + 新增條目
  □ QUICKREF.md 頂部版本號
  □ MAIN.md 頂部版本號
  □ project_summary.md 頂部版本號
  □ 所有 src/config file header @version
  □ git commit + push
──────────────
```

**絕對不能** 做完任務卻完全不提版本——版本文件是 AI 唯一記憶體，不更新等於讓下一個 AI 拿到錯誤的狀態。

---

## 3. 不明確就問

遇到任何不明確的規格或數值邊界，先停下來問開發者，不要猜測。
重大決策確認後，同步寫入對應的 `Docs/` 規劃文件。
