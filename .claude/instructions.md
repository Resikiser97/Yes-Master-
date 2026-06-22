# instructions.md — AI 協作最高 SOP

> 本檔是給 AI（Claude Code / Codex 等）的最高權威操作守則。
> 類型：**文件優先**（人工維護；代碼若違反這裡的規則，以本檔為準去改代碼）。
> 核心理念：**AI 沒有記憶，文件就是唯一記憶體。過期文件會毒害未來所有 AI 工作。**
> 因此：**每次開場必讀、每次收尾必同步。**

---

## 0. 一句話總結

這個專案用「文件即記憶」的方式協作。你每次開場必須依序讀
`DOC_INTEGRITY → ARCH → QUICKREF → CHANGELOG → VERSION_RULES → Docs/source-map → MAIN`，
工作完必須跑 `sync-docs`（更新版本號 + 同步所有頂部標版本的文件 + 寫 CHANGELOG + 報告）。
版本號 `v0.x.y.z` 你**只能動 y 和 z**。遇到任何不明確的地方**先問，不要猜**。

---

## 1. 開場讀取儀式（每次對話開始，依序讀）

```
1. DOC_INTEGRITY.md   ← 文件規範與 Source of Truth 優先級
2. ARCH.md            ← 架構全貌、模組清單
3. QUICKREF.md        ← 當前版本號、檔案地圖、持久化 key、技術陷阱表
4. CHANGELOG.md       ← 最新版本與近期變更
5. VERSION_RULES.md   ← 版本號規則
6. Docs/source-map.md ← 專案知識 source map / 規劃文件入口
7. Docs/planning-dashboard.md ← Planning 階段進度總表
8. MAIN.md            ← 只在需要查特定函式/模組時才細讀
9. 確認 .claude/skills/ 下有哪些 Skill 可用
```

> 注意：`MAIN.md` 是「函式級參考」。專案知識 source map 在 `Docs/source-map.md`，
> 規劃決策總索引在 `Docs/planning-dashboard.md`（Planning 階段）。

---

## 2. 收尾同步儀式（sync-docs）— 整套架構的心臟

當「任務完成」或開發者輸入 `sync-docs` 時，**固定執行以下 Step 1~7**：

```
Step 1   讀本次變更範圍（看 CHANGELOG 最新條目 / git diff）
Step 1.5 若有原始碼檔（如 .js）新增或刪除 → 強制檢查所有 file header
         （規範見 .claude/skills/file-header.md），輸出報告等開發者確認
Step 2   更新 CHANGELOG.md：頂部版本號 + 新增本版條目（新增/修復/調整）
Step 3   更新 QUICKREF.md：版本號必做；檔案地圖 / key / 陷阱有變才動
Step 4   更新 MAIN.md：版本號必做；函式 / 模組有變才動
Step 5   更新 project_summary.md：版本號 + 「最近完成的工作」必做
Step 6   判斷是否需要對玩家公告（Patchnote）→ 需要則等開發者確認後才寫
Step 7   輸出 sync 報告 → commit → push
```

### 版本號同步鐵則

> 完成 commit 時，**所有「頂部標版本號的文件」必須全部同步成同一個版本號**，
> 缺一即視為同步未完成。

本專案頂部標版本號的文件清單：

- `CHANGELOG.md`
- `QUICKREF.md`
- `project_summary.md`
- `MAIN.md`
- `config/gameConfig.*` 的 version 欄位 ← **開工建立程式碼後納入**（目前尚無此檔）

> 開工前：以上 4 份 .md 必須同版本。
> 開工後：加入 gameConfig version 欄位，變成 5 個同步點。

---

## 3. sync-docs 收尾報告固定格式

```
── sync-docs 完成 ──
版本：v0.x.y.z
Patchnote      ：[已寫入 | 不影響玩家，跳過]
CHANGELOG.md   ：[已更新 | 無需變動] → 一句話說明
QUICKREF.md    ：[已更新 | 無需變動] → 一句話說明
MAIN.md        ：[已更新 | 無需變動] → 一句話說明
project_summary：[已更新 | 無需變動] → 一句話說明
版本號同步      ：✅ N 個檔案頂部一致
────────────────────
```

---

## 4. 版本號規則（摘要，完整見 VERSION_RULES.md）

- 格式：`v0.x.y.z`
- `v0`（開發階段）、`x`（賽季）：**只有開發者能動，AI 不准碰**
- `y`（功能版本）：AI 可進位（新功能 / 重構，z 歸零）
- `z`（修復版本）：AI 可進位（bug fix）
- 易錯：`v0.1.9.0` 做 y+1 是 `v0.1.10.0`，**不是** `v0.2.0.0`
- 混合情況（同時有新功能與修復）→ 取最高等級（新功能優先）

---

## 5. 不可違反的開發鐵則

1. **Magic Number 禁令**：數值只能放在 `config/`，邏輯層不准寫死數字。
2. **不准用名稱字串做邏輯判斷**（如 `name.includes('蠍王')），要在 config 為該對象加專屬欄位來判斷。
3. **UI 文字一律走語言包** `t('key')`，不准硬寫字串。
4. **改函式必同步 MAIN.md**：新增 / 刪除函式必須同步更新 `MAIN.md`。
5. **新檔必加 file header**：新增原始碼檔必須加檔頭（規範見 `.claude/skills/file-header.md`）。
6. **換行一律 LF**（用 `.gitattributes` 強制）。
7. **前端一律 ES Module**（全模組化）。
8. **MVP 不接真金流**：第一版刪檔封測階段，玩家不可付費；金流架構先備好不啟用。
9. **純邏輯與渲染分離（可測試性）**：核心規則運算（連通性 BFS、傷害/防禦計算、核心數值換算、波次生成、出卡規則、Migration 等）必須是**純函式**——同樣輸入永遠回傳同樣輸出，過程不得碰 `canvas` / `document` / DOM / 全域遊戲狀態 / 存檔 IO。
   - **隨機與時間一律以參數注入**（seed / 傳入 tick），不准在純邏輯內直接呼叫 `Math.random()` / `Date.now()`，以確保可重現與可單獨測試（對齊 `Docs/waveplan.md` 的 seed 固定隨機序列要求）。
   - 渲染、輸入、存檔 IO 各自分層，只能「呼叫」純邏輯，不可把規則邏輯黏死在畫面層。
   - 界線：數據化規則 → 單元測試；手感 / UI 清晰度 / 渲染 / 好不好玩 → MVP 實玩驗證（沿用 `Docs/mustsolve.md` 模擬適用界線）。

---

## 6. git 推送

```
- Repo：https://github.com/Resikiser97/Yes-Master-
- 唯一分支：main（開發者習慣稱 "Master"；實際分支名為 main）
  → 本專案沒有 stable / 多分支工作流，全部在 main 上。
- 禁止事項：不得 force push。
- commit message 規範：盡量用「一句話說明解決了什麼問題」。
```

> 注意：除非開發者明確要求，否則不要 commit / push（先輸出 sync 報告等確認）。

---

## 7. 溝通原則

- **不明確就問，不要假設。**
- 改檔前先說明「要改什麼、為什麼」，等開發者確認再動手（除非已獲明確授權）。
- 重大決策確認後，同步寫回對應文件。

---

## 待確認

- [x] MAIN.md 角色：已定案 — `MAIN.md`=函式級參考；source map 移至 `Docs/source-map.md`。
- [x] 版本號同步清單：已定案（開工前 4 份 .md，開工後加 gameConfig version）。
- [x] 第 5（開發鐵則）、6（git）節：已填。
- [ ] `QUICKREF.md` / `project_summary.md` / `ARCH.md` / `MAIN.md` 的程式碼相關 TODO：**開工後填**。
- [ ] `.claude/skills/file-header.md` 的適用副檔名範圍（目前預設 .js）。
