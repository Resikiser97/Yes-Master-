# 串接計劃：Lobby + WaitingRoom ↔ Phase B-F 模組

> 最後更新：2026-06-26 | 對應 worklist M0g-M0j + Phase G 補強

## Context

Lobby (`src/ui/lobby.js`) 和 WaitingRoom (`src/ui/waitingRoom.js`) 已有 UI 骨架，Phase B-F 的後端模組（等級/好友/裝備/成就/排行榜）也已完成。現在需要把兩邊接起來，並補上缺失的登入 UI、PeerJS 聊天、角色面板、踢人功能。

---

## 分工

| 項目 | 負責人 | 說明 |
|------|--------|------|
| 1. authScreen.js | Claude | 登入畫面 + lobby 登入檢查 |
| 2. lobby.js 朋友 tab | Claude | 串接 listFriends 過濾房間 |
| 3. waitingRoom.js 大改 | Claude | PeerJS 聊天 + 加好友 + 踢人 UI + 開始遊戲 |
| 4. characterPopup.js | Claude | 角色面板 popup |
| 5. peerHost.js 路由 | Claude | CHAT/GAME_START/KICK 訊息處理 |
| 6. main.js 整合 | Claude | netSession 傳遞避免重複建立連線 |
| 7. Edge Function 更新 | **Codex** | create-room/join-room 加密碼/等級/人數檢查 |
| 8. roomManager.js 新增 | **Codex** | getRoomMembers, kickPlayer |

---

## 前置：SQL（用戶手動執行）

```sql
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS password TEXT DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS min_level INT DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'normal';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS game_started BOOLEAN DEFAULT false;
ALTER TABLE room_memberships ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT 'Goblin';
ALTER TABLE room_memberships ADD COLUMN IF NOT EXISTS player_level INT DEFAULT 1;
```

---

## 1. 登入畫面 — `src/ui/authScreen.js`（Claude・新建）

進 Lobby 前檢查登入狀態，未登入則彈出 overlay：
- Google OAuth 按鈕 → `signInWithGoogle()`
- 訪客模式按鈕 → `signInAnonymously()`
- 登入後 → `ensureProfile(user)` → 進 Lobby

**觸發點**：修改 `src/ui/lobby.js` 的 `showLobby()` 開頭，`getCurrentUser()` 若為 null → 先 `showAuthScreen(callback)` → callback 裡再跑原本的 Lobby 邏輯。

---

## 2. 朋友 Tab 篩選 — `src/ui/lobby.js:150`（Claude）

替換 `rooms = []` 為：
```js
const friends = await listFriends();
const friendIds = new Set(friends.map(f => f.user_a === myId ? f.user_b : f.user_a));
rooms = rooms.filter(r => friendIds.has(r.owner_id));
```
Import `listFriends` from `src/net/friendManager.js`。

---

## 3. 聊天串接 PeerJS — `src/ui/waitingRoom.js`（Claude）

**問題**：WaitingRoom 階段 PeerJS 連線還沒建立（目前是遊戲開始後才 createNetSession）。

**方案**：在 WaitingRoom 啟動時就建立 PeerJS 連線（host 呼叫 `startPeerHost`，client 呼叫 `startPeerClient`）。這樣聊天和 GAME_START 都走 data channel。

具體改動：
- `waitingRoom.js` 的 `showWaitingRoom()` 接收或建立 `netSession`（host/client）
- Host: `peerHost.js` 的 `conn.on('data')` 加 `MSG.CHAT` 路由 → `broadcast()` 轉發給所有人
- Client: `onMessage` callback 處理 `MSG.CHAT` → `_addChat()`
- 送出聊天：host 用 `broadcast(makeMessage(MSG.CHAT, ...))`, client 用 `client.send(makeMessage(MSG.CHAT, ...))`
- Host 按「開始遊戲」→ `broadcast(makeMessage(MSG.GAME_START, { diffMode }))` → 所有人 `onStart()`
- **netSession 傳遞**：WaitingRoom 建好的 netSession 傳入 `onStart(diffMode, inputMode, netInfo)` 的 `netInfo` 裡，`main.js` 直接使用，不再重複建立 PeerJS 連線

---

## 4. 角色面板 Popup — `src/ui/characterPopup.js`（Claude・新建）

點藍色圓 🔵 呼叫 `showCharacterPopup(userId)`：
- `getProfile(userId)` → 等級、經驗值
- `getEquipment(userId)` → 五項裝備等級（mining/fatigue/spirit/carry/repair）
- `getPlayerRank(userId)` + `getSeasonTitle()` → 賽季稱號
- 顯示為 modal overlay，金色邊框 Art Bible 風格
- 關閉按鈕

---

## 5. 加好友按鈕 — `src/ui/waitingRoom.js:187`（Claude）

綠色圓 🟢 → `sendFriendRequest(m.user_id)` → 成功提示 "已送出好友邀請" / 失敗提示。
Import `sendFriendRequest` from `src/net/friendManager.js`。

---

## 6. 踢人修復 — `src/ui/waitingRoom.js:195`（Claude）

修復 bug：目前 `.eq('room_id', '')` 是空字串。改為用閉包裡的 `roomId`。
踢人後 broadcast `MSG.KICK` 給被踢玩家，被踢 client 收到後自動回到 Lobby。

需要修改 `peerHost.js` 加入 KICK 處理 — host 主動 `sendTo(slotId, makeMessage(MSG.KICK))` + `conn.close()`。

---

## 7. Edge Function 更新（Codex）

### `supabase/functions/create-room/index.ts`
- 接受新欄位：`password, min_level, difficulty, visibility`
- 寫入 rooms 表
- membership 帶 `display_name, player_level`（從 player_profiles 查）

### `supabase/functions/join-room/index.ts`
- 接受 `password` 參數
- 檢查 `max_players`（COUNT membership vs room.max_players，滿員拒絕 403）
- 檢查 `min_level`（查 player_profiles.level，不足拒絕 403）
- 檢查 `password`（比對 room.password，錯誤拒絕 403）
- membership 帶 `display_name, player_level`

---

## 8. roomManager.js 新增（Codex）

```js
export async function getRoomMembers(roomId, cfg) {
  // SELECT * FROM room_memberships WHERE room_id = roomId
}

export async function kickPlayer(roomId, userId, cfg) {
  // DELETE FROM room_memberships WHERE room_id AND user_id
  // 更新 rooms.current_players
}
```

---

## 9. main.js 整合 netSession 傳遞（Claude）

修改 `main.js` 的 `onStart` — 如果 `netInfo.netSession` 存在，直接用它（跳過 `createNetSession`），避免重複建立 PeerJS 連線。

---

## 實作順序

1. **SQL**（輸出給用戶跑）
2. **Claude**: `authScreen.js` + `lobby.js` 登入檢查
3. **Codex**: Edge Function 更新 + `roomManager.js` 新增（同步進行）
4. **Claude**: `characterPopup.js`
5. **Claude**: `waitingRoom.js` 大改 — PeerJS 連線 + 聊天 + 加好友 + 踢人 + 開始遊戲
6. **Claude**: `peerHost.js` 加 CHAT/GAME_START/KICK 路由
7. **Claude**: `lobby.js` 朋友 tab 串接
8. **Claude**: `main.js` netSession 傳遞

---

## 驗證

1. 開瀏覽器 → Splash → 多人模式 → 彈出登入畫面 → Google 登入 → 進 Lobby
2. 建房 → 進 WaitingRoom → 看到自己的玩家卡片（等級、稱號）
3. 第二個瀏覽器加入 → 卡片出現 → 聊天互傳訊息
4. 點藍色圓 → 彈出角色面板（六數值+五裝備）
5. 點綠色圓 → 好友邀請送出
6. Host 點紅色圓 → 踢出玩家 → 被踢者回到 Lobby
7. Host 按開始 → 全員進遊戲
8. 朋友 tab 顯示好友建的房間
9. 單人模式完全不受影響
