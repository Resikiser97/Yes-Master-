# Multiplayer PeerJS P2P 實作計劃

## Context

Yes, Master! 目前是單人 canvas 塔防遊戲。用戶要求加入完整多人連線（戰鬥+卡片+存檔），使用 PeerJS WebRTC P2P Star topology + Supabase 做房間/驗證後端。架構設計文件已存在於 `Docs/game-architecture-plan.md`，本計劃將其落地為可執行的分批實作步驟。

**關鍵約束：** 全程保持單人模式正常運作；所有網路代碼以 `mode === 'multi'` 門控。

---

## Phase 1: Supabase 專案 + Auth + 房間 DB

**目標：** 建立後端基礎設施，能建房/加入/發 token。

**建立：**
- 新 Supabase 專案（用戶要求獨立專案）
- DB tables: `rooms`, `room_memberships`, `consumed_nonces`
- Edge Functions: `issue_room_join_token`, `verify_room_join_token`

**新增檔案：**
- `src/net/supabaseClient.js` — Supabase JS client singleton
- `src/net/roomManager.js` — createRoom / joinRoom / leaveRoom / listRooms
- `supabase/migrations/001_rooms.sql` — schema
- `supabase/functions/issue_room_join_token/index.ts`
- `supabase/functions/verify_room_join_token/index.ts`

**修改：**
- `config/gameConfig.js` — 加 `net: { supabaseUrl, supabaseAnonKey }`

**驗收：** 瀏覽器 console 能 auth → 建房 → 第二用戶加入 → Edge Function 發/驗 token 成功。

---

## Phase 2: PeerJS 連線層

**目標：** Host/Client 透過 PeerJS 建立 WebRTC data channel，完成 auth handshake。

**新增檔案：**
- `src/net/peerHost.js` — 建 Peer、寫 peer ID 到 DB、接受連線、驗 token、管理 peers Map
- `src/net/peerClient.js` — 從 DB 讀 host peer ID、連線、送 auth handshake、等 auth_ok
- `src/net/protocol.js` — 訊息類型 enum + encode/decode（AUTH, INPUT, SNAPSHOT, DELTA, PING, PONG）
- `src/net/netSession.js` — 判斷 host/client 角色、統一 `send()`/`onMessage()` 介面

**驗收：** 兩個瀏覽器 tab，一個建房（host）一個加入，console 顯示 handshake 成功 + ping/pong。斷線 3 秒內偵測到。

---

## Phase 3: 多玩家 World State 重構

**目標：** World 支援多玩家資料，輸入抽象為可序列化事件。

**修改：**
- `src/game/world.js` — `world.players` Map（slot → player state）；`world.player` 變成 getter alias 指向 `world.localPlayerId`，單人不受影響
- `src/game/actions.js` — 所有觸及 `world.player` 的函式加 `playerId` 參數；單人呼叫傳 `world.localPlayerId`
- `src/main.js` — multi 模式分支：host 跑完整 update，client 只收 state

**新增：**
- `src/net/inputBuffer.js` — host 端 per-client input ring buffer；client 端序列化 controls 為 input event

**驗收：** 單人模式回歸測試通過。多人模式下第二玩家出現在 host 畫面、可透過遠端 input 移動。

---

## Phase 4: State Sync 協議

**目標：** Host 廣播 snapshot/delta，Client 套用並渲染。

**新增：**
- `src/net/stateSync.js` — `serializeSnapshot(world)`, `serializeDelta(prev, world)`, `applySnapshot()`, `applyDelta()`
- `src/net/syncScheduler.js` — host: 每 tick 發 delta、每 5s 或 join 時發 full snapshot；client: 套用 + 插值

**修改：**
- `src/main.js` — host update 尾端呼叫 `broadcastDelta()`；client update 跳過遊戲邏輯，只套用收到的 state
- `src/game/world.js` — 加 `world.syncTick` 單調遞增

**驗收：** 兩玩家同房：host 蓋牆 → client 看到；host 進夜晚 → client 看到敵人。Delta < 500 bytes，snapshot < 10KB。

---

## Phase 5: 戰鬥 + 卡片 + 存檔（多人版）

**目標：** 所有 gameplay 系統在多人下正常運作。

**修改：**
- `src/game/combatRuntime.js` — 敵人攻擊最近玩家（遍歷 `world.players`）
- `src/game/phaseRuntime.js` — 卡片選擇：host 產生選項、廣播、host 選擇全員生效
- `src/game/actions.js` — 每人獨立挖礦/存放/建造
- `src/storage/saveManager.js` — 多人存檔：host 序列化完整 world（含所有玩家），key 含 room_id
- `config/gameConfig.js` — `multiplayer.normalCountMultiplierPerPlayer` 依 `world.players.size` 生效

**驗收：** 2 人完整遊戲 session：挖礦→建造→夜晚→卡片→存檔觸發。

---

## Phase 6: Host Migration + 斷線重連

**目標：** Host 掉線時自動遷移；玩家掉線可重連回原 slot。

**新增：**
- `src/net/hostMigration.js` — 偵測 host 掉線、依 join_order 選候選、CAS 更新 DB、新 host 初始化
- `src/net/reconnect.js` — 3 秒 grace timer、重連 token 綁 slot_id、full snapshot 恢復

**修改：**
- `src/net/peerHost.js` — `reserveSlot()` grace window
- `src/net/netSession.js` — migration 狀態機
- `src/ui/splash.js` — 重連 UI overlay

**驗收：** 3 人遊戲。關 host tab → P2 5 秒內成為新 host → P3 自動重連。關 P3 tab 3 秒內重開 → 重連成功。

---

## Phase 7: 反作弊驗證

**目標：** Host 驗證所有 client input，防止作弊。

**新增：**
- `src/net/validation.js` — 方向制移動（拒絕絕對座標）、rate limit、sequence_id 單調、庫存檢查、連通性 BFS、距離檢查
- `src/net/strikeTracker.js` — per-connection strike 計數器（0-5），超標踢人

**修改：**
- `src/net/inputBuffer.js` — `processInput` 先呼叫 `validateInput`
- `src/net/protocol.js` — 加 REJECT/STRIKE/KICK 訊息類型

**驗收：** 修改版 client 送非法 input → host 全部拒絕 → strike 累積 → 踢人。正常遊戲 10 分鐘零誤判。

---

## 實作順序與依賴

```
Phase 1 (Supabase) → Phase 2 (PeerJS) → Phase 3 (World 重構) → Phase 4 (State Sync) → Phase 5 (Gameplay) → Phase 6 (Migration) → Phase 7 (Anti-cheat)
```

每個 Phase 完成後單人模式必須回歸測試通過。

## 需要用戶先完成

- 建立新 Supabase 專案，提供 URL + anon key
- 決定 PeerJS 用公共 server 還是自架（建議先用公共 `0.peerjs.com`）
