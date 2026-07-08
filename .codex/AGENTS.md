# Codex Project Instructions

> 本檔是 Codex 的開場守則。**必須先讀 `.claude/instructions.md`（AI 協作最高 SOP）**，
> 再依照下方 Codex 專屬責任範圍執行。
> 最後校準：2026-07-07（文檔重整；sync-docs 流程同步改版）

---

## 0. 最高優先：先讀這個

**每次對話開始，第一件事：讀 `.claude/instructions.md`。**

該檔包含：
- 開場讀取儀式（source-map → dashboard → 任務檔案 → gameConfig 版本 → git log）
- sync-docs 收尾流程（Step 1~6：header 檢查、版本同步、dashboard 更新、prompt 歸檔、sync 報告）
- 版本號規則（哪段可動、如何進位）
- 開發鐵則（Magic Number 禁令、純邏輯分離、5.1 多人四路徑鐵則、5.2 Node 測試鐵則等）
- git 推送規範

讀完 `.claude/instructions.md` 後，再依序讀：

```
1. Docs/source-map.md        ← 專案知識地圖（哪些文件有維護、哪些已凍結）
2. Docs/planning-dashboard.md
3. 任務相關規劃或設計檔（多半是 Docs/history/codex-prompt-Txx.md 的任務規格）
```

> ⚠️ 根目錄 `MAIN.md`/`QUICKREF.md`/`CHANGELOG.md`/`ARCH.md`/`project_summary.md`
> 為**凍結的歷史快照**（v0.0.18~20 時代），不可當現況讀。
> 版本號看 `config/gameConfig.js`；進度看 dashboard；函式看各檔 file header + grep。

---

## 1. Codex 的主要責任範圍

Codex 負責遊戲玩法設計、平衡、波次規劃、模擬紀錄、Must Solve 追蹤，
以及**依 Claude 撰寫的 `Docs/history/codex-prompt-Txx.md` 執行實作任務**。

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

---

## 2. 版本號與收尾同步（Codex 適用版）

> 完整規則在 `.claude/instructions.md` 第 2、4 節與 `VERSION_RULES.md`。

**每次任務完成後，Codex 必須執行：**

1. 版本號同步：`config/gameConfig.js` 的 `@version` + `GAME_CONFIG.version`（兩處）
   → 本次目標版本（`y` 或 `z` 進位，不得動 `v0` 和 `x`）
2. 本次**修改到的**每個 `.js` 檔 header `@version` 同步到同一版本；
   改了 export 必同步 `@exports`，職責變了必同步 `@summary`
3. 跑 `node tests/index.js` 全過 + 任務指定的驗收命令
4. 輸出 sync 報告：改了哪些檔案、解了什麼問題、測試結果、已知風險
5. **未修改的檔案 header 保持原版本號**，不需要全倉庫刷版本

若無法完成上述任一步，必須在回應結尾明確列出「需要開發者手動完成」的清單，
**絕對不能**做完任務卻完全不提版本同步狀態。

---

## 3. 絕對禁止自行 Commit / Push

任何 `git commit` / `git push` 動作**必須等開發者明確同意後才執行**。
完成任務後輸出 sync 報告，等開發者說「可以 commit」才動手。

---

## 4. 不明確就問

遇到任何不明確的規格或數值邊界，先停下來問開發者，不要猜測。
重大決策確認後，同步寫入對應的 `Docs/` 規劃文件。
