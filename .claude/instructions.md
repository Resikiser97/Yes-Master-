# instructions.md — AI 協作最高 SOP

> 本檔是給 AI（Claude Code / Codex 等）的最高權威操作守則。
> 類型：**文件優先**（人工維護；代碼若違反這裡的規則，以本檔為準去改代碼）。
> 核心理念：**AI 沒有記憶，文件就是唯一記憶體。過期文件會毒害未來所有 AI 工作。**
> 因此：**每次開場必讀、每次收尾必同步。**

---

## 0. 一句話總結

這個專案用「文件即記憶」的方式協作。你每次開場必須依序讀
`Docs/source-map.md → Docs/planning-dashboard.md → 任務相關檔案`，
工作完必須做收尾同步（版本號 + file header + dashboard + sync 報告）。
版本號 `v0.x.y.z` 你**只能動 y 和 z**。遇到任何不明確的地方**先問，不要猜**。

---

## 1. 開場讀取儀式（每次對話開始，依序讀）

```
1. Docs/source-map.md          ← 專案知識地圖（哪個知識在哪個檔案、誰有維護誰已凍結）
2. Docs/planning-dashboard.md  ← 進度總表 + 任務紀錄（T 任務狀態、已知風險）
3. 任務相關檔案：
   - 架構/多人/安全：Docs/game-architecture-plan.md
   - 玩法/數值/平衡：Docs/game-design-plan.md、Docs/waveplan.md、Docs/bosscard.md、Docs/mustsolve.md
   - 經濟數值：config/economyConfig.js（Single Source of Truth）+ Docs/simulation/
4. 當前版本號：config/gameConfig.js 的 GAME_CONFIG.version（canonical）
5. 近期變更：git log --oneline -15
6. 確認 .claude/skills/ 下有哪些 Skill 可用
```

> ⚠️ **凍結文件警告（2026-07-07 文檔重整定案）**：根目錄的
> `ARCH.md`（凍結於 v0.0.18.0）、`QUICKREF.md` / `CHANGELOG.md` / `MAIN.md` / `project_summary.md`
>（凍結於 v0.0.20.0）皆為歷史快照，**不再維護、不可當現況讀**，各檔頂部有明確凍結橫幅。
> `DOC_INTEGRITY.md` / `VERSION_RULES.md` 的規則本身仍有效（文件優先級、版本號格式）。
> 已完結的實作計劃/交接文件一律歸檔在 `Docs/history/`（含全部 codex-prompt-T*.md 任務紀錄）。

---

## 2. 收尾同步儀式（sync-docs）— 整套架構的心臟

> **2026-07-07 修訂**：原版要求每任務同步 CHANGELOG/QUICKREF/MAIN/project_summary 四份根目錄文件，
> 該儀式自 v0.0.21.0 起實際上已由「planning-dashboard + prompt 歸檔 + git log」取代
>（四份文件凍結為歷史快照，見各檔頂部橫幅）。以下為對齊實際運作的現行版本。

當「任務完成」或開發者輸入 `sync-docs` 時，**固定執行以下 Step 1~6**：

```
Step 1   讀本次變更範圍（git diff / git status）
Step 2   File header 檢查（本次改動涉及的每個 .js）：
         1. 是否有 header
         2. @version 是否更新到本次目標版本
         3. @summary / @exports / @depends 是否與目前檔案職責相符（改了 export 必同步）
         4. 是否殘留「已完成步驟」的過期 TODO 描述
         （規範見 .claude/skills/file-header.md）
Step 3   版本號同步：config/gameConfig.js 的 @version + GAME_CONFIG.version（canonical，
         兩處都要改）+ 本次所有修改檔案的 header @version → 同一版本號
Step 4   更新 Docs/planning-dashboard.md：任務狀態、已知風險、頂部「最後更新」戳記
Step 5   任務 prompt 歸檔：本次任務的 codex-prompt-T*.md 放進 Docs/history/
        （若任務是直接執行沒有 prompt，在 dashboard 記錄即可）
Step 6   輸出 sync 報告（改了哪些檔案、解了什麼問題、測試結果、已知風險）
         → 等開發者說「可以 commit」→ commit（message 帶版本號）→ 等指示 push
Step 7   push 後必查 CI 結果（讀法見第 11 節管道表）：
         綠燈 → 任務閉環；紅燈 → 立即觸發第 10 節偏移矯正協議（本次造成 → 立刻修）。
         沒查 CI 就結束任務 = 收尾未完成。
```

### 版本號同步鐵則

> 完成 commit 時，**所有版本同步點必須同步成同一個版本號**，缺一即視為同步未完成。

- `config/gameConfig.js` 的 `GAME_CONFIG.version` 是**程式版本的 canonical source**（header `@version` 與 `version:` 欄位兩處）
- 本次任務**修改到的** `src/**/*.js`、`config/**/*.js` file header `@version` 同步到同一版本
- 未修改的檔案 header 保持原版本號（代表該檔最後變更的版本），**不需要**全倉庫刷版本

### sync-docs 驗收 grep（建議命令）

```
# A. 版本：確認本次目標版本號已寫入 gameConfig 與本次修改的檔案
rg -n "@version" config/gameConfig.js <本次修改的檔案>

# B. 過期狀態描述 / 舊任務 TODO（應為空或合理保留）
rg -n "待 Claude 寫 prompt|待模擬|待開工|TODO：步驟" src config

# C. 搬移文件後的斷鏈檢查（引用已歸檔文件的路徑必須帶 Docs/history/）
rg -n "Docs/(claude-codex-worklist|claude-code-handoff|mvp-engine-checklist|ui-plan|integration-plan|lobby-waitingroom-plan|multiplayer-implementation-plan)" src config Docs/*.md .claude .codex/AGENTS.md
```

---

## 3. sync 報告固定格式

```
── sync 完成 ──
版本：v0.x.y.z
變更檔案：[清單]
解決問題：[一句話]
測試：node tests/index.js → [結果]
planning-dashboard：[已更新 | 無需變動]
prompt 歸檔：[Docs/history/codex-prompt-Txx.md | 無 prompt]
已知風險：[清單 | 無]
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

1. **絕對禁止自行 Commit / Push**：任何 `git commit` / `git push` 動作必須等開發者明確同意後才執行。完成工作後輸出 sync 報告，等開發者說「可以 commit」才動手。
2. **Magic Number 禁令**：數值只能放在 `config/`，邏輯層不准寫死數字。
2. **不准用名稱字串做邏輯判斷**（如 `name.includes('蠍王')），要在 config 為該對象加專屬欄位來判斷。
3. **UI 文字一律走語言包** `t('key')`，不准硬寫字串。
4. **改函式必同步 file header**（2026-07-07 修訂，原「同步 MAIN.md」已廢止——MAIN.md 凍結為歷史快照）：新增 / 刪除 / 改名 export 的函式，必須同步該檔 header 的 `@exports`；職責變了同步 `@summary`。
5. **新檔必加 file header**：新增原始碼檔必須加檔頭（規範見 `.claude/skills/file-header.md`）。
6. **換行一律 LF**（用 `.gitattributes` 強制）。
7. **前端一律 ES Module**（全模組化）。
8. **MVP 不接真金流**：第一版刪檔封測階段，玩家不可付費；金流架構先備好不啟用。
9. **純邏輯與渲染分離（可測試性）**：核心規則運算（連通性 BFS、傷害/防禦計算、核心數值換算、波次生成、出卡規則、Migration 等）必須是**純函式**——同樣輸入永遠回傳同樣輸出，過程不得碰 `canvas` / `document` / DOM / 全域遊戲狀態 / 存檔 IO。
   - **隨機與時間一律以參數注入**（seed / 傳入 tick），不准在純邏輯內直接呼叫 `Math.random()` / `Date.now()`，以確保可重現與可單獨測試（對齊 `Docs/waveplan.md` 的 seed 固定隨機序列要求）。
   - 渲染、輸入、存檔 IO 各自分層，只能「呼叫」純邏輯，不可把規則邏輯黏死在畫面層。
   - 界線：數據化規則 → 單元測試；手感 / UI 清晰度 / 渲染 / 好不好玩 → MVP 實玩驗證（沿用 `Docs/mustsolve.md` 模擬適用界線）。
10. **重大分析結果必須立刻寫入 `config/` 常數**：任何蒙特卡羅模擬、平衡計算、或數值設計分析的定案結果，**當場**寫入 `config/` 對應常數檔（目前經濟數值 → `config/economyConfig.js`）作為 Single Source of Truth。不得只留在 chat history 或 `Docs/simulation/` 中。原始模擬腳本與 log 保留在 `Docs/simulation/` 作為推導依據，但**一切下游計算（活動、事件、商店、道具設計）必須 import config，不得重新硬編或重複推算**。
11. **批次檔案替換一律用 Bash `sed -i`，絕對禁止用 PowerShell foreach 讀寫檔案**：PowerShell `foreach ($f in $files)` 迴圈內若誤用 `$_` 而非 `$f`，`Get-Content` 會靜默回傳 `$null`，`Set-Content` 隨即將目標檔案**清空為 0 bytes**，且不報任何明顯錯誤（只輸出 Get-Content 參數警告）。此 bug 曾在 v0.0.19.0 升版時一次清空 71 個 src/config 檔案，須 `git restore` 全量還原。**批次文字替換唯一允許的方式：`find src config -name "*.js" -exec sed -i 's/old/new/g' {} +`（Bash 工具執行）**。

### 5.1 多人 / 權威端 / stateSync 防錯鐵則

凡是任務會改到多人遊戲、投票、房主權威、狀態同步、或本局結算顯示，AI 必須先做「四路徑一致性檢查」，不能只改單一入口：

1. **Host 本機路徑 + Remote client input 路徑都要改**：本專案多人架構是 client 送 input，host 套用 input 後廣播 state；但 host 自己的輸入常在 `main.js` 直接處理，不會經過 `src/net/inputBuffer.js`。任何多人動作若只改 `inputBuffer.js`，通常會留下「房主一套、客戶端一套」的 bug。
2. **要被 client 看見的 world state 必須同步三件套**：新增會影響 UI 或 client 行為的 world 欄位時，必須同時檢查 `serializeSnapshot()`、`serializeDelta()`、`applyPartialState()`。只補 delta 會讓 full snapshot / 新加入玩家 / 5 秒全量同步遺漏狀態。
3. **顯示用 state 要先定義是否跨端同步**：若欄位只存在本機（例如 MVP local wallet 結算摘要），不得讓多人 client 誤以為已入帳。要嘛同步為「隊伍摘要」，要嘛標示/限制為「本機/房主摘要」，不能模糊。
4. **多人全員條件必須排除離線玩家**：`world.players` 會保留 `online=false` 的斷線玩家；投票、ready、all-voted 類邏輯不得直接用 `world.players.keys()` 當全員名單，必須過濾 `player.online !== false`。
5. **網路 action 必須防壞資料**：`cardChoice`、投票 index、玩家 id 等網路輸入必須檢查 phase、整數 index、範圍、玩家是否 eligible；不要只靠 UI 不送壞資料。
6. **測試要覆蓋既有路徑，不只新增 happy path**：新增多人機制時，必須更新既有測試（例如原本 first-wins 的測試），並新增 host 本機、remote client、snapshot/delta roundtrip、離線玩家/壞 index 的測試。

### 5.2 Node 測試 / DOM overlay 防錯鐵則

凡是在純 Node 測試中測 `src/ui/*Panel.js` 這類 DOM overlay，AI 必須先做「副作用呼叫鏈檢查」：

1. **不能只 stub 第一個看到的 DOM 方法**：例如 `ShopPanel.purchase()` 不只會呼叫 `render()`，成功發獎與失敗提示還會經由 `toast()` 碰 `document.body` / `window.setTimeout()`。測試前要沿呼叫鏈檢查所有會碰 `document`、`window`、canvas、計時器、localStorage 的方法，逐一 stub 或 mock。
2. **Node 沒有 `document` / jsdom**：除非任務明確新增 DOM 測試環境，測試不得假設瀏覽器全域存在；constructor 若有 `container ?? document.body`，測試必須傳非 null container。
3. **localStorage mock 要看實際 import graph**：若 service 已被其他測試或上層 import module cache 載入，不能假設「本測試 dynamic import 前 mock」一定是首次載入。服務若是在呼叫時讀 `localStorage` 可接受；若在 import-time 捕捉 storage，就必須重構或隔離測試。
4. **測試也要遵守 config Single Source of Truth**：商店價格、技能成本、掉落量等數值不要硬編在測試期望值中；先從 `config/*` 找到對應 item / cost，再用該值斷言行為，除非該測試的目的就是鎖定某個 config 常數本身。

---

## 6. git 推送

```
- Repo：https://github.com/Resikiser97/Yes-Master-
- 唯一分支：main（開發者習慣稱 "Master"；實際分支名為 main）
  → 本專案沒有 stable / 多分支工作流，全部在 main 上。
- 禁止事項：不得 force push。
- commit message 規範：盡量用「一句話說明解決了什麼問題」。
```

> **鐵則：絕對不得自行 commit / push。** 必須等開發者明確說「可以 commit」才執行（見第 5 節第 1 條）。

---

## 7. 溝通原則

- **不明確就問，不要假設。**
- 改檔前先說明「要改什麼、為什麼」，等開發者確認再動手（除非已獲明確授權）。
- 重大決策確認後，同步寫回對應文件。

---

## 8. 任務規格模板（目標 / 指標 / 邊界，2026-07-07 起強制）

任何 AI（Claude / Codex / 未來加入的模型）撰寫或接收任務規格（codex-prompt、直接實作前的計劃）時，
**必須包含以下四段，缺任一段視為規格不完整、不得開工**：

```
1. 背景（目標 Goal）    ：為什麼做、解決什麼問題、前提是否已驗證
2. 修改檔案（範圍 Scope）：逐檔列出改什麼；檔案數與清單明確
3. 完成標準（指標 Metric）：可執行的驗收命令（node tests/index.js、node --check、rg 檢查）
                          + 行為斷言（「X 情況下應 Y」）。不可只寫「功能正常」
4. 邊界（Boundaries）    ：不改哪些檔案、不做哪些事、適用的鐵則編號（如 5.1/5.2）、
                          已知風險與本次刻意不處理的項目
```

歷史範例（結構已驗證有效）：`Docs/history/codex-prompt-T21.md` ~ `T26.md`。
審核方（通常是 Claude）驗收時**逐條對照完成標準執行**，不憑報告文字採信。

---

## 9. 檔案組織與分檔原則（永續協作）

### 分層依賴方向（機器檢查：tests/docIntegrity.test.js）

```
config/     ← 純資料，零依賴（數值的 Single Source of Truth）
src/logic/  ← 純函式；只准 import config/ 與 logic/ 自身
              禁止：import game/render/ui/input/net/account；禁止 DOM/localStorage/
              Math.random()/Date.now()（隨機與時間一律參數注入）
src/game/   ← orchestration；可 import config/logic/account
src/net/    ← 多人傳輸；可 import config/logic/game
src/ui|render|input/ ← 表現層；可 import 下層，彼此之間盡量不依賴
src/account/ ← 持久化 service（localStorage mock）；不可被 logic import；
              equipmentService 禁止 import walletService（防循環）
```

### 新增檔案決策樹

```
是數值/常數？          → config/<領域>Config.js（鐵則 2：Magic Number 禁令）
是規則運算（可純函式）？ → src/logic/（必須可單獨測試）
是遊戲狀態協調？        → src/game/
是網路/多人？          → src/net/
是 DOM overlay？       → src/ui/*Panel.js（測試需遵守鐵則 5.2）
是 canvas 繪製？       → src/render/
是帳號持久化？          → src/account/*Service.js（後端化時只換底層）
是後端邏輯？           → supabase/functions/<name>/index.ts（Edge Function）
```

### 分檔紀律

- 一檔一責：header `@summary` 一句話說不清職責 = 該拆了。
- 新檔案目標 400 行內；既有大檔（如 renderer.js）**不主動重構**，等該檔有實質任務時順勢拆。
- 拆檔/改 export 時：header `@exports` 同步 + 舊引用全改（`rg` 驗證零殘留）+ 測試全過，三者缺一不可。

### 前後端分離預留（未來方向）

- `src/account/*Service.js` 是未來後端 API 的邊界：介面（函式簽名）不變，底層從 localStorage 換成 fetch。
- 純邏輯不碰 IO（鐵則 9）就是為了這一天——後端化時 logic/ 層零改動。
- `supabase/functions/` 已是實際後端程式碼：改動它必須同步部署（`supabase functions deploy`），
  repo 內的 .ts 與線上部署版本的一致性由開發者確認。

---

## 10. 偏移矯正協議（Drift Recovery）

AI 沒有記憶、模型會輪替、任何規則都會被忘記——所以**偏移偵測必須靠機器，矯正必須有固定程序**。

### 偏移訊號（任一觸發即進入矯正程序）

1. `node tests/index.js` 紅（含 docIntegrity 的文件完整性檢查）
2. CI 紅（GitHub Actions，AI 可用 `gh run list --limit 5` 讀結果）
3. file header 與檔案實際內容矛盾（@exports 缺漏、@summary 過期）
4. planning-dashboard 狀態與程式碼現實矛盾（例：標 ✅ 但功能不存在）
5. 發現文件宣稱的規則已連續多個版本沒人遵守（= 規則已死，如 2026-07-07 前的四文件同步儀式）

### 矯正程序（固定四步，不可跳）

```
1. 停：不再擴大當前任務的 scope
2. 判：這是「本次任務造成的」還是「歷史遺留的」？
   - 本次造成 → 立刻修，修完才繼續
   - 歷史遺留 → 不順手修（防 scope 蔓延），記入 planning-dashboard 已知風險，另開任務
3. 記：dashboard 更新（發現了什麼、決定修或延後、理由）
4. 續：訊號源恢復綠 / 已記錄，才回到原任務
```

### 真相優先級（衝突時誰說了算）

```
測試結果 > 程式碼 > config/ 數值 > planning-dashboard > 其他 Docs > chat 記憶
（文件優先的規則檔除外：instructions.md / DOC_INTEGRITY / VERSION_RULES 定義流程，
 代碼違反流程時改代碼）
```

---

## 11. 機器可驗證回饋契約（AI-Readable Feedback）

目標：**任何 AI 不依賴人類操作即可驗證程式正確性**。人類實測只留給「手感/好玩度」這類無法數據化的判斷。

### 現有的機器驗證管道

| 管道 | 指令 | AI 如何讀 |
|---|---|---|
| 全套測試 | `node tests/index.js` | exit code 0 + 最後一行 `All tests passed (vX.Y.Z.W)` |
| 語法檢查 | `node --check <file>` | exit code |
| 文件完整性 | 含在測試套件（docIntegrity） | 失敗時逐條列出違規檔案與原因 |
| CI | GitHub Actions（push 自動跑） | 主要：`gh run list --limit 5` / `gh run view <id> --log-failed`（gh CLI 已安裝，需 `gh auth login` 過一次）。**備用（gh 不可用/未登入時）**：`curl -s "https://api.github.com/repos/Resikiser97/Yes-Master-/actions/runs?per_page=3"` 讀 `"status"`/`"conclusion"` 欄位；再用 `/actions/runs/<id>/jobs` 查失敗步驟。公開 repo 免認證 |
| 斷鏈檢查 | `rg` 命令（見第 2 節驗收 grep） | 輸出為空 = 通過 |

### 交付契約（每個新系統必須遵守）

1. **新功能交付必附機器驗證方式**：任務完成標準必須含可執行指令，輸出可被 AI 解析
   （exit code / 固定格式的最後一行 / 空輸出=通過）。「請人手動開瀏覽器確認」不算完成標準，
   只能作為補充驗證。
2. **測試輸出格式穩定**：每個測試檔最後一行固定 `<名稱> tests passed`；套件最後一行固定
   `All tests passed (版本)`。AI 靠這兩個 pattern 判斷，不要改格式。
3. **無法機器驗證的部分要顯式宣告**：如真實 WebRTC 行為、UI 手感——在 sync 報告的
   「已知風險」列出「本次未經機器驗證的部分與原因」，不可默默略過。
4. **未來後端驗證**：Edge Function 修改應附 curl/CLI 驗證命令（如 RLS 修復用
   `supabase db query` 驗證）；正式後端測試基礎設施建立時，納入本節管道表。

---

## 待確認

- [x] MAIN.md 角色：已定案 — 2026-07-07 凍結為歷史快照；函式查詢改用 file header + grep。
- [x] 版本號同步清單：2026-07-07 修訂 — canonical = gameConfig，僅本次修改檔案的 header 同步。
- [x] 第 5（開發鐵則）、6（git）節：已填。
- [x] `.claude/skills/file-header.md` 的適用副檔名範圍：已確認 `.js`（`src/**/*.js` + `config/**/*.js`），見該檔。
