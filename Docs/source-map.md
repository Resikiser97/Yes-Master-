# source-map.md — 專案知識地圖

> Project entrypoint / source map for Claude, Codex, and human collaborators.
> **每次開場第一份讀的檔案。** 這裡回答：哪個知識在哪個檔案、哪些檔案有維護、哪些已凍結。
> 最後全面校準：2026-07-14（T27 斷線重連 / 重新開頁返回原 Slot；對應版本 v0.0.42.0）

---

## 開場讀取順序

```
1. Docs/source-map.md            ← 本檔
2. Docs/planning-dashboard.md    ← 進度總表（T 任務狀態、已知風險、下一步）
3. 任務相關檔案（見下方「知識分區」）
4. 當前版本：config/gameConfig.js 的 GAME_CONFIG.version（canonical）
5. 近期變更：git log --oneline -15
```

---

## 知識分區（有維護的活文件）

### 進度與決策
| 檔案 | 內容 |
|---|---|
| `Docs/planning-dashboard.md` | 所有任務/決策的狀態總表；每次任務完成後更新。**查「做到哪了」看這裡** |
| `Docs/history/codex-prompt-T*.md` | 每個 T 任務的完整實作規格與驗收標準（T13~T26+），是最詳細的變更紀錄 |
| git log | v0.0.21.0 起的版本歷史（commit message 帶版本號） |

### 技術架構（Claude 主責）
| 檔案 | 內容 |
|---|---|
| `Docs/game-architecture-plan.md` | 多人架構（PeerJS Star 拓撲/epoch/重連）、安全（RLS/token/反作弊）、存檔、Schema Versioning、本機雙分頁測試方法。**技術問題先查這裡** |
| `.claude/instructions.md` | AI 協作最高 SOP：開場儀式、sync-docs、版本號規則、開發鐵則（5.1 多人四路徑、5.2 Node 測試）、任務規格模板 G/M/B（§8）、檔案組織原則（§9）、偏移矯正協議（§10）、機器可驗證回饋契約（§11） |
| `tests/docIntegrity.test.js` | 文件完整性機器檢查（8 類）：版本同步、header 覆蓋、logic 層純度、循環依賴、歸檔斷鏈、凍結橫幅守衛、@exports 語意比對（防 header 說謊）、T27+ 任務規格 G/M/B 四段與驗收記錄格式——違規輸出固定格式 `DOC_INTEGRITY_VIOLATION` |
| `.github/workflows/ci.yml` | push/PR 自動跑語法檢查 + 全套測試；AI 用 `gh run list` 讀結果 |
| `Docs/design-patterns.md` | 跨功能一致性規則（「對 X 生效必須對 Y 生效」類原則） |
| `Docs/cloud-infra-cost-plan.md` | 雲端成本粗估（Planning 草稿，未定案，待真實流量校準） |

### 玩法設計與數值（Codex 主責）
| 檔案 | 內容 |
|---|---|
| `Docs/game-design-plan.md` | 玩法規則總綱：角色數值、方塊、核心公式、經濟錨點、商店、技能點、雙倍充能 |
| `Docs/waveplan.md` | 1-30 關波次、多人倍率、Boss 規則、加時賽的唯一主檔 |
| `Docs/bosscard.md` | 卡片系統：18 張 MVP 卡池、價值分層、出卡規則、顯示標籤 |
| `Docs/mustsolve.md` | Must Solve 1~7 的模擬推導過程與定案（推導脈絡；結論已落地 config，勿把舊候選當現行規則） |
| `Docs/mvp-validation.md` | MVP 成功/失敗判準、測試對象與觀察表 |
| `Docs/simulation/` | 模擬腳本 + log（economy/monster-drop/equipment-drop）；**定案數值一律已寫入 config/，下游 import config，不重算** |
| `Docs/project_summary.md` | 世界觀/玩法**原始草稿**（源頭文件，仍有效；注意：根目錄同名檔是已凍結的舊快照，兩者不同） |

### 程式碼（最終真相）
| 位置 | 內容 |
|---|---|
| `config/` | 所有數值的 Single Source of Truth（gameConfig/economyConfig/enemies/waves/cards/blocks…）；**Magic Number 禁令：邏輯層不准寫死數字** |
| `src/logic/` | 純函式（可單獨測試；隨機/時間一律參數注入） |
| `src/game/` | orchestration 層（world 狀態、phase 狀態機、戰鬥、核心快照） |
| `src/net/` | 多人（peerHost/peerClient/validation/stateSync/reconnect/roomManager/netSession） |
| `src/ui/` `src/render/` `src/input/` | DOM overlay / canvas 渲染 / 鍵鼠與觸控輸入 |
| `src/account/` | wallet/skill/equipment/stageReward（localStorage mock；後端化時只換底層，不信任本機數值） |
| `supabase/functions/` | 已部署的 Edge Functions 原始碼；`supabase/migrations/` RLS 與 schema |
| `tests/` | `node tests/index.js` 全套測試（純 Node，無 jsdom；localStorage 用 Map mock，慣例見 saveManager.test.js） |
| file header | 每檔頂部 `@version`/`@summary`/`@exports`/`@depends`——每任務維護。**查函式先看 header 再 grep，不要看 MAIN.md** |

---

## 已凍結文件（歷史快照，不可當現況讀）

| 檔案 | 凍結於 | 說明 |
|---|---|---|
| 根目錄 `MAIN.md` | v0.0.20.0 | 函式級參考；之後 19+ 版的函式不在內。查函式 → file header + grep src/ |
| 根目錄 `QUICKREF.md` | v0.0.20.0 | 速查表；版本號/檔案地圖已過期 |
| 根目錄 `CHANGELOG.md` | v0.0.20.0 | 之後的版本歷史在 git log |
| 根目錄 `ARCH.md` | v0.0.18.0 | 分層概念仍對；檔案清單缺 account/ 等 v0.0.19 後的新模組 |
| 根目錄 `project_summary.md` | v0.0.20.0 | 現況快照（≠ `Docs/project_summary.md` 原始草稿） |
| `Docs/history/*` | 各檔標註 | 已完結的實作計劃、交接文件、全部任務 prompt |

> 仍有效的根目錄規則檔：`DOC_INTEGRITY.md`（文件優先級規範）、`VERSION_RULES.md`（版本號格式）。

### Docs/history/ 內容（已完結，僅供考古）

- `codex-prompt-*.md` — 全部任務實作紀錄（最詳細的考古材料）
- `claude-codex-worklist.md` — 舊協作看板（被 planning-dashboard 取代，凍結於 v0.0.19）
- `claude-code-handoff.md` — 2026-06-21 舊交接摘要（安全章節已被後續審計取代）
- `lobby-waitingroom-plan.md` / `integration-plan.md` / `multiplayer-implementation-plan.md` — 已實作上線的計劃（src header @sourceOfTruth 仍指向這些檔的 Phase 編號，屬正常）
- `mvp-engine-checklist.md` — MVP 引擎缺口清單（所列缺口已於 T14~T21 全數完成）
- `ui-plan.md` — 遊戲內 HUD 1:1 還原計劃（已實作；佈局現況真相在 `src/render/renderer.js`）

---

## Responsibility Split

- **Codex**：玩法數值、平衡、波次、模擬（`mustsolve.md`、`waveplan.md`、`simulation/`、config 數值表）；依 Claude 寫的 codex-prompt 執行實作任務。
- **Claude**：架構、實作規劃（寫 codex-prompt）、技術風險檢查、跨檔一致性、審核 Codex 產出與獨立驗收。
- **交接介面**：`config/` 檔案——Codex 填數值，純邏輯層消費，互不踩線。
- **開發者**：版本號 `v0.x` 的前兩段、commit/push 授權（AI 絕對禁止自行 commit/push）、產品決策。

---

## 目前狀態（2026-07-14 快照，詳情以 dashboard 為準）

- 版本 v0.0.42.0；T13~T26 完成；T27 已由不同驗收方完成雙 origin 獨立驗收並追加正式驗收記錄
- T27：15 秒 Host 靜默偵測、最後 Host 訊息起 30 秒停止自動重試、重新開頁返回原 membership / p2 / Full Snapshot
- 多人聯機上線：PeerJS P2P + Supabase Auth + 房間系統 + connection_epoch 防重放 + 自動重連
- 經濟系統定案並 wiring：模擬定案 → economyConfig → 引擎 → 測試覆蓋
- 主要待辦：RLS / 正式多人存檔鏈對帳、怪物移動速度實玩確認（目前 5格/秒是假設）、Endless 曲線細節

---

## 高風險注意事項（每個 AI 都該知道）

1. **絕對禁止自行 commit / push**——等開發者明確授權。
2. **批次替換只能用 Bash `sed -i`**——PowerShell foreach 曾一次清空 71 個檔案（v0.0.19 事故）。
3. **多人改動必做四路徑檢查**（instructions.md 5.1）：main.js host 本機路徑 + inputBuffer remote 路徑 + stateSync 三件套 + validation 防壞資料。
4. **禁止 innerHTML**（XSS）；UI 文字走語言包；純邏輯不碰 DOM / IO / `Date.now()`（時間注入）。
5. **凍結文件不可當現況讀**——版本號看 gameConfig、進度看 dashboard、函式看 file header + grep。
6. **模擬定案必落 config**——不得只留在 chat / simulation log；下游一律 import，不重算。
7. **任務規格必含 目標/範圍/指標/邊界 四段**（instructions.md §8）；驗收方逐條執行完成標準，不憑報告文字採信。
8. **偏移了就走矯正協議**（instructions.md §10）：停 → 判（本次造成 vs 歷史遺留）→ 記 dashboard → 續。不順手修歷史遺留。
