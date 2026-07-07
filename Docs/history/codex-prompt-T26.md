# Codex Prompt — T26：多人遊戲中 heartbeat 延續保活

> **版本目標：v0.0.39.0**（沿用專案 T 任務 `v0.0.N.0` 慣例）

---

## 背景（前提已由 Claude 驗證屬實）

多人房在「等待室」有 `heartbeatRoom()` 每 10 秒保活（`waitingRoom.js:229-233`），但進遊戲時 `_launchGame()`（line 253-255）先設 `netSession._keepAlive = true` 保住連線，接著呼叫 `_cleanup()`（line 359-361）——**把 `heartbeatTimer` 一起清掉了**。

結果鏈：

1. 等待室中：房間每 10 秒保活 ✅
2. 進入遊戲後：房間**不再保活** ❌
3. 背景排程 `cleanup-rooms` 看到 60 秒內沒有 recent online member → 把房間標成 `status='completed'`
4. 房間變 `completed` 後：`issue-room-join-token` 失敗 → **遊戲中斷線重連必定失敗** → 測試會被誤判成 PeerJS / T24 reconnect 的 bug

T26 修的是：**多人遊戲中也要持續 heartbeat，直到玩家 EXIT / GameOver 離開 / 頁面關閉。**

---

## 邊界（不改的東西）

- 不改 Supabase Edge Functions（`cleanup-rooms` 60 秒規則、`room-heartbeat` 都維持現狀）
- 不改 PeerJS protocol / reconnect token 結構
- 不動 `waitingRoom.js`（等待室 heartbeat 邏輯本來就是對的）
- 不新增 `roomManager.js` API，直接用既有 `heartbeatRoom(roomId, cfg)`
- 不新增 main.js 的 `pagehide` handler（等待室已有 best-effort leave；遊戲中目標是「保持 active」不是「退出時可靠 leave」；EXIT 已清 timer + close netSession，夠了）
- 工作區裡 Claude 未 commit 的 `.claude/launch.json` 與 `Docs/game-architecture-plan.md` 修改**不要混進 T26**

---

## 修改檔案（共 2 個）

### 1. `src/main.js`

**A. import（line 43 附近）加：**
```js
import { heartbeatRoom } from './net/roomManager.js';
```

**B. game heartbeat state（`netSession` 相關變數附近，約 line 190-196）：**
```js
let gameHeartbeatTimer = null;
let gameHeartbeatWarned = false;

const stopGameHeartbeat = () => {
  if (gameHeartbeatTimer) {
    clearInterval(gameHeartbeatTimer);
    gameHeartbeatTimer = null;
  }
};

const startGameHeartbeat = () => {
  if (cfg.mode !== 'multi' || !netRoomId || gameHeartbeatTimer) return;

  const beat = () => {
    heartbeatRoom(netRoomId, cfg)
      .then(() => { gameHeartbeatWarned = false; })
      .catch((err) => {
        if (!gameHeartbeatWarned) {
          gameHeartbeatWarned = true;
          console.warn('[net] game heartbeat failed', err);
        }
      });
  };

  beat(); // 立即先跳一次，不等第一個 interval
  gameHeartbeatTimer = setInterval(beat, 10_000);
};
```
> 失敗 warning 用 `gameHeartbeatWarned` 節流：連續失敗只警告一次，成功後重置 flag——避免網路不穩時每 10 秒刷爆 console。

**C. 在多人 session setup 的整個 if/else-if 鏈之後（約 line 252，`consumeDebugActions` 定義之前）呼叫：**
```js
startGameHeartbeat();
```
> 放在 if/else 鏈之外呼叫一次即可——`startGameHeartbeat` 內部的 guard（`cfg.mode !== 'multi' || !netRoomId`）會讓單人模式自動 no-op；host「新建 session」「重用 waitingRoom session」兩條路徑都會覆蓋到。heartbeat 不依賴 PeerJS 是否已連上，只依賴 Supabase user 是房間 member，所以不用等 `createNetSession` 的 promise resolve。

**D. EXIT button handler（line 271-277）加清理：**
```js
if (controls.pendingUiClick === 'exitButton') {
  controls.pendingUiClick = null;
  stopGameHeartbeat();
  loop.stop?.();
  netSession?.close?.();
  window.location.reload();
  return;
}
```

**E. GameOver Escape handler（約 line 498-503）加清理：**
```js
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (world.phase !== 'gameover') return;
  stopGameHeartbeat();
  loop.stop?.();
  netSession?.close?.();
  window.location.reload();
});
```

**F. `app.stop`（約 line 507）加清理：**
```js
stop: () => { stopGameHeartbeat(); controls.detach(); loop.stop(); },
```

**G.** header `@version` 更新為 `v0.0.39.0`。

### 2. `config/gameConfig.js`

`@version` 與 `GAME_CONFIG.version` → `v0.0.39.0`（canonical source）。

---

## 測試

`main.js` 是 browser lifecycle 入口，本專案沒有對它做單元測試的基礎設施——**不要為了這個修改硬塞難維護的 browser lifecycle 測試**。既有 `node tests/index.js` 必須全過（不應該有任何測試因此壞掉）即可。

---

## 完成標準

```
node --check src/main.js
node tests/index.js        → 全通過
git diff --check           → 通過
rg -n "heartbeatRoom|gameHeartbeat|stopGameHeartbeat|startGameHeartbeat" src/main.js
rg -n "v0\.0\.39\.0" src/main.js config/gameConfig.js
```

- 多人模式（host 與 client）進入遊戲後，每 10 秒持續呼叫 `heartbeatRoom`，房間不會因為 60 秒無心跳被 `cleanup-rooms` 標成 `completed`。
- 單人模式完全不受影響（guard 直接 return，不發任何請求）。
- EXIT / GameOver Escape / `app.stop()` 三條離開路徑都會清掉 heartbeat timer。
- heartbeat 失敗時 console 警告有節流（連續失敗只警告一次）。

## Sync 報告格式

```
T26 Sync Report
- [x] main.js：多人遊戲中新增 heartbeatRoom 延續保活
- [x] main.js：EXIT / GameOver Escape / app.stop 清理 heartbeat timer
- [x] config/gameConfig.js：版本同步 v0.0.39.0
- 測試：node --check src/main.js 通過
- 測試：node tests/index.js 通過
- 備註：真瀏覽器長時間 reconnect 測試（遊戲中等 70 秒以上 → 斷線 → 重連成功）是否完成 / 是否受工具權限限制
```
