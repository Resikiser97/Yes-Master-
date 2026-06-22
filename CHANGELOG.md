# CHANGELOG.md — 版本歷史

> 版本：v0.0.2.0
> 類型：**只增不改**（歷史紀錄，永遠往上加，最新在最上方，不回頭改舊條目）。
> 條目格式：`## vX.Y.Z.W - YYYY-MM-DD`，下分「新增 / 修復 / 調整」。

---

## v0.0.2.0 - 2026-06-23

### 新增
- **MVP 單機骨架開工**（四層架構，遵守開發鐵則）：
  - `config/`：gameConfig（含版本欄位，第 5 個版本同步點）、blocks、mines、enemies、waves、cards。
  - `src/logic/`（純函式，無 DOM）：rng（seeded）、damageDefense、coreStats、connectivity、combat、waveGen、cardOffer、migration。
  - `src/render`/`input`/`storage` 分層佔位 + `src/main.js` + `index.html`（ES Module 入口）。
- 新增開發鐵則 9「純邏輯與渲染分離（可測試性）」，並在 `game-architecture-plan.md` 補「程式碼分層原則」。
- 建立 `Docs/claude-codex-worklist.md`：Claude↔Codex 交接看板（config 即交接介面）。
- 純邏輯層 22 項 Node smoke test 全過；Codex 填表後 waveGen 跑 10/20/21/30 關無 NaN。

### 調整
- 定案核心普攻鎖定「離核心最近」、連鎖「以主目標為中心取最近 N、不重複、用盡可重啟循環」、加時 30 秒未清完「強制 GameOver」，同步進 `game-design-plan.md`、`waveplan.md`、`planning-dashboard.md`。
- Codex 填入敵人基礎數值/移速（工兵 attackRange=3）、5 張資源卡 grant、21-30 阻擋區 seed=20260622。

### 修復
- （無）

## v0.0.1.0 - 2026-06-22

### 新增
- 建立「AI 協作 Handover 文件系統」：
  `.claude/instructions.md`、`DOC_INTEGRITY.md`、`VERSION_RULES.md`、
  `ARCH.md`、`QUICKREF.md`、`project_summary.md`、`CHANGELOG.md`、
  `.claude/skills/file-header.md`。
- 確立開場讀取儀式、收尾 `sync-docs` 流程（Step 1~7）與版本號同步鐵則。

### 調整
- 原根目錄 `MAIN.md`（planning 進入點 / source map）移至 `Docs/source-map.md`；
  根目錄 `MAIN.md` 改作「函式級參考」。同步更新 `.claude/CLAUDE.md`、`.codex/AGENTS.md`、
  `Docs/planning-dashboard.md` 的引用路徑。

### 修復
- （無）
