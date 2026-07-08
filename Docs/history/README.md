# Docs/history/ — 已完結文件歸檔

> 本目錄存放**已完結**的實作計劃、任務 prompt、交接文件與測試截圖。
> 全部內容僅供考古/追溯，**不可當現況讀**——現況一律看 `Docs/source-map.md` → `Docs/planning-dashboard.md`。
> 歸檔規則：任務完成並 commit 後，該任務的 codex-prompt 移入本目錄；
> 實作計劃在對應功能上線後移入本目錄（引用它的 src header `@sourceOfTruth` 路徑同步加上 `history/` 前綴）。

## 任務實作紀錄（codex-prompt-*.md）

每個 T 任務的完整規格、驗收標準與架構約束——是專案最詳細的變更紀錄。
T13 合成 UI、T14 擊殺掉落、T15 關卡結算、T16 cardModifiers、T18 卡片標籤、
T19(+T20) 多人投票+GameOver 結算、T21 Boss 門口攻擊、T22 商店/技能測試、
T23 ShopPanel 防壞資料、T24 P2P 重連鏈、T25 EXIT 按鈕、T26 遊戲中 heartbeat。
（T17 spirit wiring 由 Claude 直接實作，無獨立 prompt；T20 併入 T19。）

## 已完結的實作計劃（2026-07-07 歸檔）

| 檔案 | 說明 |
|---|---|
| `multiplayer-implementation-plan.md` | PeerJS P2P 多人實作計劃（已上線） |
| `lobby-waitingroom-plan.md` | 大廳+等待室完整實作計劃（已上線；src header Phase B~F 編號指向此檔） |
| `integration-plan.md` | Lobby/WaitingRoom ↔ 後端模組串接計劃（已完成） |
| `mvp-engine-checklist.md` | MVP 引擎缺口清單（所列缺口已於 T14~T21 全數完成） |
| `ui-plan.md` | 遊戲內 HUD 1:1 mockup 還原計劃（已實作；佈局現況真相在 `src/render/renderer.js`） |
| `claude-codex-worklist.md` | 舊 Claude↔Codex 協作看板（凍結於 v0.0.19，被 planning-dashboard 取代） |
| `claude-code-handoff.md` | 2026-06-21 網頁版→Claude Code 交接摘要（安全章節已被後續審計取代） |
| `tempPlan-mustsolve3-2026-06-21.md` | Must Solve 3 臨時計劃 |
| `codex-prompt-11A.md` / `codex-prompt-step12-mobile.md` | 早期任務 prompt |

## 測試截圖

`mobile-*.png` — v0.0.11.0 手機版檢查截圖。
