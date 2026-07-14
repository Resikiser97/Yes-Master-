# Codex Prompt — T27：15/30 秒重連與重新開頁返回原 Slot

> 版本目標：v0.0.42.0
> 狀態：實作方自測完成；待不同驗收方追加「驗收記錄」

## 背景（目標 Goal）

T24 已完成 PeerJS reconnect chain，但實機測試發現兩個缺口：Client 只依賴 DataConnection `close`，Host 頁面消失時可能超過 30 秒仍未開始重連；原頁面停止重試後，也沒有重新開頁返回原 membership / Slot 的入口。

目標流程：15 秒 Host 靜默判定、最後 Host 訊息起 30 秒停止原頁自動重試但保留 Slot；重新開頁後顯示「返回進行中的房間」，後端以原帳號 membership 核發綁原 slotId 的 reconnect token，Host 傳 Full Snapshot，玩家回到原角色。

## 修改檔案（範圍 Scope）

- `config/gameConfig.js`：集中 reconnect timing（3 秒 retry、15 秒 silent detection、30 秒總窗口）。
- `src/net/reconnect.js`：deadline window、剩餘 handshake 時間、可注入 clock/timer、silent 判定純函式。
- `src/net/peerClient.js`：Client Host-silence watchdog、deadline-aware reconnect。
- `src/net/peerHost.js`：Host health check 改讀 config。
- `src/net/roomManager.js`：查詢所有合法 resumable memberships，排除死 Host / host role。
- `src/net/netSession.js`、`src/main.js`：把預先核發 reconnect token 傳入 Client session，直接建立 clientSync 接 Full Snapshot。
- `src/ui/lobby.js`、`src/ui/i18n.js`：顯示一至多個「返回進行中的房間」入口。
- `supabase/functions/issue-room-join-token/index.ts`：reconnect token 的 slotId 一律取後端 membership。
- `tests/reconnect.test.js`、`tests/roomManager.test.js`、`tests/roomJoinTokenContract.test.js`、`tests/index.js`：deadline、silent threshold、resume filter、Edge Function contract。
- `Docs/game-architecture-plan.md`、`Docs/planning-dashboard.md`、`Docs/source-map.md`、`Docs/history/README.md`：同步設計、進度與證據。

## 完成標準（指標 Metric）

機器驗證：

```text
node --check src/net/reconnect.js
node --check src/net/peerClient.js
node --check src/net/peerHost.js
node --check src/net/roomManager.js
node --check src/net/netSession.js
node --check src/ui/lobby.js
node --check src/ui/i18n.js
node --check src/main.js
npm test
git diff --check
```

行為驗證：

1. 明確 Client 斷線時，正常重連約 4-5 秒完成，仍為 p2。
2. Host 頁消失但 WebRTC 未發 close 時，Client 約 15 秒主動判定失聯。
3. 從最後 Host 訊息起約 30 秒觸發 reconnect failed，停止重試但 DB membership / Slot 保留。
   瀏覽器明確 offline 時也從 offline 當下固定 deadline，恢復網路不會重開另一個 30 秒窗口。
4. Client 關頁超過 30 秒後重新開啟：大廳只顯示仍有 fresh Host heartbeat 的返回入口；舊死房不顯示。
5. 點擊返回後，線上 Edge Function 核發綁原 membership slot 的 token；Client 日誌為 `client ready p2`。
6. Host / Client 畫面回到同一進行中關卡，Party Bar 互相可見，Full Snapshot 生效。
7. `supabase functions deploy issue-room-join-token --project-ref mezidygnycqtlinoeyml` 成功。

實作方於 2026-07-13 已逐條自測以上行為；正式驗收仍須由不同驗收方獨立複跑並在下方追加記錄。

## 驗收記錄

- 驗收方：5.6 SOL xhigh（獨立驗收；一次性 local-only hook）
- 驗收日：2026-07-14
- 完成標準：Client 原頁面未重新載入；由 hook 關閉 PeerJS connection 後，console 於 `2026-07-14T00:26:29.760Z` 顯示 `[net] waiting room disconnected, attempting reconnect...`，並於 `2026-07-14T00:26:34.047Z` 顯示 `[net] waiting room reconnected`，耗時 4.287 秒；原頁面 URL 不變，仍為 p2，Host／Client 同一進行中房間與 Party Bar 畫面保持；未走一般 join-room 流程。
- 獨立複跑：Host `127.0.0.1:5173`、Client `127.0.0.1:5174/?testReconnectHook=1`；Host／Client 截圖已於驗收回合擷取；`npm test` → `All tests passed (v0.0.42.0)`；`git diff --check` → 通過。
- 備註：測試 hook 只在本次 local-only 驗收期間加入，僅呼叫 `netSession.conn.close()`；測試完成後已完全移除，正式功能與正式行為未保留 hook。

## 邊界（Boundaries）

- 不刪除 30 秒後的 membership / Slot；保留到本場結束或明確 leave / kick。
- 不讓重新開頁走一般 `join-room`，避免已開始房間被拒絕或分配新 Slot。
- 不假設帳號只有一筆 active membership；合法項目逐筆顯示。
- 不顯示死 Host 的舊房間；Host membership heartbeat 必須在 30 秒內。
- 房主重新開頁不走本流程；屬 Host Migration / candidate_host 任務。
- 不調整 Supabase cleanup 60 秒規則、不實作正式多人存檔、不修改玩法數值。
- 遵守多人四路徑、Magic Number、UI 語言包、file header 與 T27 獨立驗收規則。
