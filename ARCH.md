# ARCH.md — 架構全貌

> 版本：v0.0.14.1
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> 用途：給任何新 AI 30 秒建立系統全貌；細節以 `src/` / `config/` 與 `Docs/game-architecture-plan.md` 為準。

---

## 1. 專案概述

**Yes, Master!** 是一款 1–4 人合作塔防瀏覽器遊戲，世界觀副標「哥布林的信仰」（lore subtitle，勿作主標題；英文勿寫 Goblin's Faith）。

玩家扮演哥布林，白天挖礦收集資源、建塔蓋防線；夜晚人族怪物來襲攻打核心（Core）。每波結束後可選強化卡片。

- 核心玩法：挖礦 → 建塔（泥土地基 + 第二層方塊）→ 扛波次 → 卡片強化 → 循環
- 目前狀態：MVP 單機可動 + 多人大廳（Auth / Lobby / WaitingRoom / PeerJS 聊天）
- 下一步：PeerJS 聯機戰鬥、sprite 動畫整合

---

## 2. 技術選型

| 項目 | 技術 | 備註 |
|---|---|---|
| 前端 | HTML + JavaScript（ES Module），無框架 | Canvas 主畫面 + HTML overlay（splash / 觸控 / auth / lobby） |
| 換行符號 | LF | `.gitattributes` 強制 |
| Multiplayer | PeerJS（WebRTC P2P） | Star 拓撲，房主中心；房主端為邏輯權威 |
| 雲端 / 帳號 | Supabase（Auth + RLS + Edge Functions） | Google OAuth + 匿名登入；RLS 保護正式存檔 |
| 部署 | Vercel | Push → 自動部署，ES Module 免設定 |
| 開發輔助 | Claude Code + Codex | 分工見 `Docs/source-map.md` |

---

## 3. 分層架構（可測試性核心原則）

```
純邏輯層（src/logic/*）
  ↑ 只回傳結果，不碰 canvas / DOM / 全域狀態 / 存檔 IO
  ↑ 隨機以 seed 注入（rng.js）；時間以 tick 注入
  ↑ 可在 Node 環境單元測試

遊戲狀態層（src/game/*）
  ↑ 封裝 world 狀態、呼叫純邏輯、驅動遊戲循環

渲染層（src/render/*）
  只讀 world 狀態，畫到 Canvas，不寫遊戲邏輯

輸入層（src/input/*）
  把玩家操作轉成事件，交給 game 層處理

存檔 IO 層（src/storage/*）
  localStorage（MVP）；多人走 Supabase（Edge Function 寫入）

UI / Overlay 層（src/ui/*）
  Auth / Lobby / WaitingRoom / Splash 等 HTML overlay

網路層（src/net/*）
  Auth（Supabase）、好友、房間 CRUD、PeerJS 連線管理
```

> 鐵則：render / input / storage / ui / net 只能「呼叫」純邏輯，不可把規則邏輯黏死在這幾層。  
> 詳見 `.claude/instructions.md` 開發鐵則 9 與 `Docs/game-architecture-plan.md`「程式碼分層原則」。

---

## 4. 模組清單

### config/（靜態設定，被 logic 層 import）

| 檔案 | 職責 |
|---|---|
| `config/gameConfig.js` | 全域設定 + **版本號**（版本同步 canonical source） |
| `config/testPreset.js` | 測試難度 preset：`buildTestConfig(base)` + `TEST_PRESET_SAVE_KEY` |
| `config/blocks.js` | 方塊耐久 / 重量 / 核心加成（土=血、沙=範圍、石=防、鐵=攻、金=速、鑽=連鎖） |
| `config/enemies.js` | 敵人基礎數值（1-10 base，Codex 維護） |
| `config/waves.js` | 1-30 波次 / 成長曲線 / Boss / 加時 / 21-30 阻擋區 |
| `config/cards.js` | 18 張卡池 + 出卡規則 |
| `config/mines.js` | 礦山機率表 + 第 0 關初始資源包 |
| `config/sprites.js` | Spritesheet 定義：`SPRITE_SHEETS` + `getFrameRect()` 切幀工具 |
| `config/levelConfig.js` | 等級 / 經驗值曲線 |
| `config/equipmentConfig.js` | 五項裝備加成與升級成本 |
| `config/achievements.js` | 成就定義表 |
| `config/seasonConfig.js` | 排行榜賽季 ID 格式與稱號門檻 |

### src/logic/（純邏輯，無副作用）

| 模組 | 職責 |
|---|---|
| `rng.js` | Seed-based 隨機序列；所有隨機由此注入 |
| `connectivity.js` | 泥土連通性 BFS（放置 / 拆除合法性） |
| `coreStats.js` | 方塊計數 → 核心攻擊 / 攻速 / 血量 / 範圍 / 防禦 / 魔法 / 連鎖 |
| `coreHealth.js` | 核心血量計算與修復 |
| `damageDefense.js` | 防禦減傷公式 `N/(100+N)` |
| `combat.js` | 普攻鎖定最近 + 連鎖去重（seed 注入） |
| `waveGen.js` | 關卡 → 波次組成、多人 xN 倍率、分批出怪（seed 注入） |
| `cardOffer.js` | 固定 3 槽出卡 + 類型保護 + 同名/同類重抽（seed 注入） |
| `building.js` | 建造 / 拆除邏輯（連通性 + 範圍限制） |
| `mining.js` | 挖礦進度計算 |
| `inventory.js` | 背包增減、容量計算 |
| `drops.js` | 掉落物生成與自動撿取 |
| `playerMovement.js` | 玩家移動計算（固定 timestep） |
| `mineGen.js` | 礦山格位生成 |
| `migration.js` | Save File schema migration chain（idempotent） |
| `cardEffect.js` | 套用卡片 effect 到 world 狀態（各 handler 由 Codex 填入） |
| `spawnPosition.js` | 計算每批出怪座標（核心 Hitbox 外 10~20 格，不進礦山，不出地圖邊界） |

### src/game/（遊戲狀態與循環）

| 檔案 | 職責 |
|---|---|
| `world.js` | world 狀態樹、核心 / 玩家 / 鏡頭 / phase 初始值；`updateCameraFollow()` |
| `gameLoop.js` | Fixed timestep（16ms）更新驅動；`requestAnimationFrame` 只排 render |
| `actions.js` | 挖礦 / 掉落物 / 卸貨 / 建造 / 拆除 orchestration |
| `phaseRuntime.js` | 晝夜波次、卡片選擇觸發 |
| `combatRuntime.js` | 敵人 AI、核心攻擊、戰鬥結算 |
| `coreSnapshot.js` | 核心數值快照（緩存計算結果） |
| `levelSystem.js` | `expToNextLevel` / `calcLevel` / `addExp` / `calcExpReward` |
| `equipmentSystem.js` | `getEquipment` / `upgradeEquipment` / `applyEquipBonus` |
| `achievementSystem.js` | 成就檢查與解鎖 |
| `leaderboardSystem.js` | 排行榜提交 / 查詢 / 賽季稱號 |

### src/render/（Canvas 渲染，只讀 world）

| 檔案 | 職責 |
|---|---|
| `renderer.js` | 地圖 / 方塊 / 玩家 / 敵人 / 掉落物 / 建造預覽 / HUD / 卡片面板 / debug overlay / gameover。插值（alpha）平移，整數像素避免 judder。攻擊範圍圈（lazy OffscreenCanvas）+ 電擊 VFX（固定 bolt points） |
| `imageLoader.js` | 批量異步載入圖片：`loadImages(manifest)` → `Promise<Map<key, HTMLImageElement>>` |

### src/input/（輸入層）

| 檔案 | 職責 |
|---|---|
| `controls.js` | 桌面鍵盤 / 滑鼠：移動 / 挖礦 / 修復 / 建造 / 拆除 / 卡片點選 |
| `touchControls.js` | 手機三欄觸控 UI（左 HUD+D-pad、中 1~0 快捷列、右 Debug Tool+動作鍵），與 Controls 介面相容 |

### src/storage/（存檔 IO）

| 檔案 | 職責 |
|---|---|
| `saveLocal.js` | localStorage 底層 get/set/clear；讀取時跑 schema migration |
| `saveManager.js` | 封裝 saveLocal：world serialize / deserialize / key 管理 |

### src/ui/（HTML Overlay）

| 檔案 | 職責 |
|---|---|
| `splash.js` | 開始畫面：正式 / 測試難度、鍵盤 / 手機輸入模式、「多人模式」按鈕 |
| `mobileLayout.js` | 輸入模式存取、觸控偵測、直向遮罩、動態 tilePx、三欄 layout |
| `authScreen.js` | 登入 overlay：Google OAuth / 訪客匿名模式 |
| `lobby.js` | 多人大廳 UI（三 tab、房間列表、建房 popup、3 秒 polling） |
| `waitingRoom.js` | 等待室 UI（玩家 slot 卡片、PeerJS 聊天、Host 開始遊戲） |
| `characterPopup.js` | 角色面板 popup（等級 / 裝備 / 稱號） |
| `pwaTutorial.js` | PWA 安裝引導畫面（iOS / Android） |
| `uiState.js` | world.uiState 初始化與面板展開/收合切換（playerPanel / corePanel） |

### src/net/（網路層）

| 檔案 | 職責 |
|---|---|
| `supabaseClient.js` | Lazy Supabase browser client 單例；`getSupabaseClient()` / `ensureSupabaseUser()` |
| `authManager.js` | Auth：Google OAuth / 匿名登入 / player_profiles CRUD |
| `friendManager.js` | 好友邀請 / 接受 / 刪除 / 列表 |
| `roomManager.js` | 房間 CRUD + Edge Function 呼叫（含 `getRoomMembers` / `startRoom` / `kickPlayer` / `leaveRoom` / `issueRoomJoinToken`） |
| `protocol.js` | 訊息類型常數（MSG.*）與 encode / decode / makeMessage |
| `peerRuntime.js` | PeerJS 動態載入（esm.sh lazy singleton）+ `createPeer` / `waitForPeerOpen` |
| `peerHost.js` | PeerJS 房主端：連線管理、auth handshake、Input 接收、MSG.CHAT 轉發 |
| `peerClient.js` | PeerJS 客戶端（非房主）：連線 + auth handshake + send/receive |
| `netSession.js` | 多人會話入口：依 role 啟動 peerHost / peerClient，回傳統一 session 介面 |
| `inputBuffer.js` | 房主端 Input buffer：佇列 + drain() 路由至 actions；`serializeControls`（client 打包） |
| `stateSync.js` | 狀態序列化：`serializeSnapshot` / `serializeDelta` / `applySnapshot` / `applyDelta` |
| `syncScheduler.js` | 同步排程：每幀決定廣播 delta 或 full snapshot（5s 強制全量） |
| `validation.js` | Input 驗證：sequenceId 防重放、速率限制、建造/拆除合法性 |
| `strikeTracker.js` | 反作弊 Strike 計數（key = uid+room_id+slot_id；達上限回傳 kicked:true） |
| `reconnect.js` | 斷線重連 controller：grace 期後自動申請 reconnect token 並重連 |
| `hostMigration.js` | Host Migration controller：偵測房主斷線、CAS 更新 current_host_peer_id |

---

## 5. 跨模組依賴（啟動流程）

```
index.html (type=module)
  └─ src/main.js  boot()
       ├─ config/gameConfig.js          // 版本號 + 全域設定
       ├─ src/ui/splash.js              // 難度 + 輸入模式選擇 + 多人模式入口
       │    ├─ src/ui/authScreen.js     // 進 Lobby 前登入
       │    ├─ src/ui/lobby.js          // 房間列表 + 建房
       │    │    └─ src/net/roomManager.js / authManager.js / friendManager.js
       │    └─ src/ui/waitingRoom.js    // 等待室 + PeerJS 聊天
       │         └─ src/net/peerHost.js / protocol.js
       ├─ src/ui/mobileLayout.js        // 觸控偵測 + 動態 tilePx
       ├─ src/game/world.js             // create / load world
       ├─ src/render/renderer.js        // Canvas render
       ├─ src/input/controls.js         // 桌面鍵盤 / 滑鼠
       ├─ src/input/touchControls.js    // 手機觸控
       ├─ src/game/gameLoop.js          // fixed timestep（16ms）
       ├─ src/game/actions.js           // 挖礦 / 建造 / 卸貨 / 掉落物
       ├─ src/game/phaseRuntime.js      // 晝夜 / 波次 / 卡片
       ├─ src/game/combatRuntime.js     // 敵人 AI + 核心戰鬥
       └─ src/storage/saveManager.js    // localStorage 存取

src/logic/*（純邏輯）
  ← 被 game / actions / phaseRuntime / combatRuntime 按需 import
  ← 不依賴 canvas / DOM / 全域狀態

config/*（靜態設定）
  ← 被 logic / game 層 import；版本號 canonical source 在 config/gameConfig.js
```

---

## 6. Multiplayer 架構摘要

- **拓撲**：Star（房主中心），非 Full Mesh；4 人房 3 條 WebRTC 連線
- **邏輯權威**：房主端計算怪物 AI / 傷害；房員送 Input Event，房主驗證後廣播
- **State Sync**：Event-driven；衝突以房主狀態為準
- **Host Migration**：房主斷線 → 最早加入者（candidate_host）接任，CAS 防雙寫；小幅倒退設計上接受
- **身份驗證**：後端短效 `room_join_token`（nonce 一次性）；不傳 Supabase JWT 給房主
- **Slot 定義**：P1~P4，房間席位，獨立於 auth.uid 和 PeerJS Peer ID

> 詳細規格見 `Docs/game-architecture-plan.md`「Multiplayer 架構」、「P2P 安全限制」、「反作弊 / 輸入驗證機制」章節。

---

## 7. 存檔架構摘要

- **單機 MVP**：localStorage（`yesmaster.save.v1`）
- **多人 active save**：走 Edge Function 驗 `current_host_uid`，不信任 owner_id = auth.uid（Host Migration 後新房主也需能寫）
- **正式 save_files**：房主選「存檔退出」時產生，綁定 `owner_id = auth.uid()`，受 RLS 保護
- **Schema Versioning**：頂層 `schema_version`，Migration chain（idempotent）+ 條件式回寫防並發

> 詳見 `Docs/game-architecture-plan.md`「存檔系統」、「Schema Versioning」章節。

---

## 8. 安全架構摘要

| 面向 | 做法 |
|---|---|
| 帳號密碼 | Supabase Auth 內建 bcrypt |
| 房間密碼 | Hash 儲存，可覆蓋不可解密 |
| 身份驗證（連線） | 後端核發短效 `room_join_token`（nonce 一次性，一次原子 consumed）；絕不傳 JWT 給房主 |
| 存檔寫入（多人） | Edge Function 驗 current_host_uid + room active + data_revision 條件式回寫 |
| 反作弊 | 玩家送 Input 不送結果；Sliding Window Rate Limit；三級違規（丟棄 / Strike / 踢出）；Strike key = auth.uid + room_id + slot_id |
| XSS | 所有玩家輸入一律用 `textContent` / DOM API，禁 `innerHTML` |
| 封包防重放 | connection_epoch + sequence_id；舊 epoch 一律廢棄 |

> 詳見 `Docs/game-architecture-plan.md`「安全架構」、「P2P 安全限制」章節。

---

## 9. 資料架構摘要

| 層次 | 說明 |
|---|---|
| 玩家帳號（跟人走） | 等級 / 六項數值 / 裝備庫存 / 累計進度 / 抽獎盤狀態；Supabase `player_profiles` |
| Save File（跟房間走） | 地圖層 / 進度層 / 玩家層 / 共享資源層 / 房間層；Supabase `save_files` |
| 本地快取 | localStorage（單機 MVP 存檔 + 輸入模式偏好 + PWA skip 計數） |

> 詳見 `Docs/game-architecture-plan.md`「玩家帳號資料結構」、「Save File 資料結構」章節。  
> localStorage key 一覽見 `QUICKREF.md` 第 3 節「持久化 key 一覽表」。

---

## 10. 未完成 / 仍有 TODO 的部分

| 項目 | 狀態 |
|---|---|
| PeerJS 聯機戰鬥（遊戲內 Event 收發） | 📝 規格已定，大廳/等待室已接，戰鬥層待實作 |
| Supabase Edge Function（token issue/verify、active save 寫入） | 📝 規格已定，未實作 |
| Sprite 動畫（哥布林走路/挖礦、敵人走路、核心受擊） | 🔲 基礎設施已備，動畫幀待整合 |
| 帳號密碼 + 正式 RLS Policy SQL | 📝 規格已定，未撰寫 |
| TURN Server 設定 | 🔲 STUN-only MVP，NAT 穿透問題已知 |
| 金流（Stripe / ECPay） | ⏸ MVP 封測期不接真金流 |
| 隱私權政策 / 服務條款 | 🔲 台灣上線前必做 |

> 詳見 `Docs/game-architecture-plan.md`「待決定 / 待設計」、`Docs/integration-plan.md`、`Docs/claude-codex-worklist.md`。
