# QUICKREF.md — 每次啟動速查表

> 版本：v0.0.14.7
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ MVP 單機可動 + 多人大廳：移動/挖礦/背包/塔內資源/掉落物自動撿取/跟隨鏡頭/初版建造/核心數值回饋/核心 HP 與修復/debug 核心戰鬥/正式波次/晝夜/卡片選擇（hover+tier中文）/localStorage 存檔/新手教學提示/**debug 浮層（` 鍵）/測試難度 preset（1~30 關）/手機三欄觸控 UI（左 HUD+D-pad、中 canvas+1~0 快捷列、右 Debug Tool+動作鍵）/動態 canvas 縮放/**PWA manifest + iOS/Android 安裝引導畫面**/**手機 3×3 放置方向選擇器**/**電擊攻擊 VFX + 範圍圈**/**快捷列方塊圖示（手機+鍵盤 HUD）**/**sprite 載入基礎設施 + 素材整理**/**規劃模式（B 鍵拖拽建造+資源預檢）+ 拆除模式（V 鍵材質選擇性拆除）**/**快捷列 10 格（1~0）+ 滑鼠點擊**/**梯子無限方塊**/**挖礦進度條持久化**/**多人大廳（Lobby + Auth + Waiting Room + PeerJS 聊天）+ 等級/好友/裝備/成就/排行榜系統**已成完整循環。

---

## 1. 技術架構摘要

- 1–4 人合作塔防；HTML+JS / PeerJS（P2P）/ Supabase / Vercel
- Multiplayer：Star（房主中心）拓撲，房主端權威
- 目前單機骨架：`main.js` 建立 world、renderer、controls，並用 fixed timestep loop 更新遊戲進程；render 可畫核心/地面/兩層方塊/玩家/敵人小血條/建造預覽/核心 HP/疲勞/核心數值 HUD，input 已接 WASD/方向鍵、長按挖礦、快捷列建造、右鍵拆除、R 修復與 debug 敵人生成。

---

## 2. 檔案地圖

> 啟動：本機需走 HTTP（ES Module 不能 file://）。`npx serve . -l 5173` → http://localhost:5173/

| 檔案 / 目錄 | 用途 |
|---|---|
| `index.html` / `src/main.js` | ES Module 入口、掛模式角標與版本號 |
| `config/gameConfig.js` | 全域設定 + **版本號**（版本同步點之一） |
| `config/testPreset.js` | 測試難度 preset：`buildTestConfig(base)` + `TEST_PRESET_SAVE_KEY` |
| `config/blocks.js` | 方塊耐久/重量/核心加成 |
| `config/enemies.js` | 敵人基礎數值（Codex 維護） |
| `config/waves.js` | 1-30 波次/成長/Boss/加時/21-30 阻擋區 |
| `config/cards.js` | 18 張卡池 + 出卡規則 |
| `config/mines.js` | 礦山機率表 + 初始資源包 |
| `src/logic/*`（純函式） | rng / damageDefense / coreStats / coreHealth / connectivity / building / combat / waveGen / cardOffer / migration / playerMovement / mineGen / inventory / mining / **drops**（掉落物撿取） |
| `src/game/*` | world（狀態 + 鏡頭跟隨 updateCameraFollow）/ coreSnapshot（核心數值快照）/ combatRuntime（debug 敵人 + 核心攻擊）/ gameLoop（fixed timestep）/ actions（挖礦/卸貨/建造/掉落物 orchestration） |
| `src/render` `src/input` `src/storage` `src/ui` | 渲染（只讀 world、插值 + 整數平移 + 建造預覽 + 掉落物 + 核心數值 HUD + 卡片面板 hover + 教學提示；手機模式可關閉 canvas HUD；**_drawRangeCircle 正式攻擊 anchors 的範圍聯集（lazy OffscreenCanvas）**；**_drawVFX 電擊閃電（讀取攻擊時固定生成的 bolt points）**；**debugPaused 暫停提示**；**setSprites 注入 sprite 圖示**）/ 輸入（Controls 鍵盤/滑鼠 + **TouchControls 三欄手機 UI：左 HUD+D-pad、中 1~0 快捷列（圖示+角標）、右 Debug Tool+動作鍵**）/ 存檔層（saveLocal + saveManager）/ UI（splash 難度+輸入模式選擇、**mobileLayout** 動態 tilePx + 三欄 layout + 直向守衛 + isStandalone、**pwaTutorial** PWA 安裝引導畫面） |
| `src/render/imageLoader.js` | 非同步批量載入圖片：`loadImages(manifest)` → `Promise<Map<key, HTMLImageElement>>` |
| `config/sprites.js` | Spritesheet 定義：`SPRITE_SHEETS`（blocksNoFrame 指向去背重打包 hotbar sheet / blocksSlotFrame）+ `getFrameRect(img, sheet, keyOrIndex)` 切幀工具 |
| `assets/icon-status.md` | 素材裁剪/整合狀態追蹤表（✅已整合或已裁剪 / 🔲待裁剪 / ⏸暫緩 / ❌尚未製作） |
| `manifest.json` | PWA 宣告（standalone/landscape/theme-color/#D4A017/icons） |
| `tools/generate-icons.html` | 瀏覽器工具：產生並下載 icons/icon-192.png + icon-512.png |
| `config/levelConfig.js` | 等級經驗值曲線 |
| `config/equipmentConfig.js` | 五項裝備加成與升級成本 |
| `config/achievements.js` | 成就定義表 |
| `config/seasonConfig.js` | 排行榜賽季 ID 格式與稱號門檻 |
| `src/game/levelSystem.js` | 等級計算：expToNextLevel / calcLevel / addExp / calcExpReward |
| `src/game/equipmentSystem.js` | 裝備 CRUD：getEquipment / upgradeEquipment / applyEquipBonus |
| `src/game/achievementSystem.js` | 成就檢查與解鎖 |
| `src/game/leaderboardSystem.js` | 排行榜提交/查詢/賽季稱號 |
| `src/net/supabaseClient.js` | Lazy Supabase browser client 單例；`requireSupabaseUser()` 用於正式多人，不會自動匿名 |
| `src/net/authManager.js` | Auth：Google OAuth / 匿名登入 / profile CRUD；Google profile 缺失時自動建立/補齊 |
| `src/net/friendManager.js` | 好友系統：邀請/接受/刪除/列表；必須已有登入 session |
| `src/net/roomManager.js` | 房間 CRUD + Edge Function 呼叫（含 getRoomMembers / startRoom / kickPlayer / leaveRoom / heartbeatRoom / issueRoomJoinToken）；必須已有登入 session |
| `src/net/protocol.js` | MSG.* 常數 + encode / decode / makeMessage |
| `src/net/peerRuntime.js` | PeerJS lazy 載入 + createPeer / waitForPeerOpen |
| `src/net/peerHost.js` | PeerJS 房主端：連線管理 / auth handshake / Input 接收 / CHAT 轉發 |
| `src/net/peerClient.js` | PeerJS 客戶端：連線 + auth handshake |
| `src/net/netSession.js` | 多人會話入口（role → host 或 client） |
| `src/net/inputBuffer.js` | Input buffer + drain() 路由；serializeControls（client 打包） |
| `src/net/stateSync.js` | serializeSnapshot / serializeDelta / applySnapshot / applyDelta |
| `src/net/syncScheduler.js` | 排程廣播 delta / full snapshot（5s 強制全量） |
| `src/net/validation.js` | Input 驗證：sequenceId / 速率 / 建造合法性 |
| `src/net/strikeTracker.js` | 反作弊 Strike 計數（uid+room+slot） |
| `src/net/reconnect.js` | 斷線重連 controller（grace 期 + reconnect token） |
| `src/net/hostMigration.js` | Host Migration controller（CAS 更新 current_host_peer_id） |
| `src/ui/uiState.js` | world.uiState 初始化 + 面板展開/收合切換 |
| `src/ui/authScreen.js` | 登入/訪客 overlay |
| `src/ui/lobby.js` | 多人大廳 UI（房間列表 + 建房 + 三 tab） |
| `src/ui/waitingRoom.js` | 等待室 UI（玩家卡片 + PeerJS 聊天 + 開始遊戲） |
| `src/ui/characterPopup.js` | 角色面板 popup（等級/裝備/稱號） |
| `Docs/integration-plan.md` | Lobby↔Phase B-F 串接計劃 |
| `Docs/claude-codex-worklist.md` | Claude↔Codex 交接看板 |

> 函式級細節見 `MAIN.md`。

---

## 3. 持久化 key 一覽表（防止誤刪 / 重複造 key）

> 列出所有 localStorage / 存檔欄位 / DB 欄位的 key 與用途。每新增一個就加一行。

| 儲存位置 | key / 欄位 | 用途 | 備註 |
|---|---|---|---|
| localStorage | `yesmaster.save.v1` | 正式難度單機存檔（`config/gameConfig.js` save.storageKey） | schemaVersion=1，讀取時跑 migration |
| localStorage | `yesmaster.save.test.v1` | 測試難度存檔（`config/testPreset.js` TEST_PRESET_SAVE_KEY） | 獨立 key，不污染正式存檔 |
| localStorage | `yesmaster.inputMode` | 輸入模式（`'keyboard'` / `'touch'`）（`src/ui/mobileLayout.js` getSavedInputMode/saveInputMode） | 不進遊戲存檔；splash 選完後存 |
| localStorage | `yesmaster.pwaSkip` | PWA 安裝教學跳過次數（整數 0~3，≥3 不再顯示）（`src/ui/pwaTutorial.js` PWA_SKIP_KEY） | 不進遊戲存檔 |
| Supabase `rooms` | `last_seen_at` | 房間最後活動時間（heartbeat 更新） | v0.0.14.2 新增 |
| Supabase `rooms` | `completed_at` | 房間完成/關閉時間（leave-room / cleanup 寫入） | v0.0.14.2 新增 |
| Supabase `room_memberships` | `last_seen_at` | 成員最後 heartbeat 時間 | v0.0.14.2 新增 |
| Supabase `player_profiles` | `user_id` / `display_name` / `avatar_id` | Google OAuth 後的遊戲 profile；缺失時由 `ensureProfile()` 建立或補齊 | v0.0.14.3 修補 |
| Supabase（存檔） | TODO | TODO | 接多人時填 |
| Supabase（帳號） | TODO | TODO | 接多人時填 |

> 設計參考：`Docs/game-architecture-plan.md`「Save File 資料結構」「玩家帳號資料結構」
> 「Schema Versioning」章節（含 schema_version / data_revision 等頂層欄位）。

---

## 4. 關鍵技術陷阱表（每踩一個坑加一行）

> 把每個踩過的坑寫成一行「陷阱 → 規則」，避免重蹈覆轍。

| 陷阱 | 規則 |
|---|---|
| ES Module 從 file:// 開會被 CORS 擋、整頁不動 | 一律走 HTTP（`npx serve` / live server / 預覽面板） |
| 純邏輯裡寫 `Math.random()`/`Date.now()` 會變不可重現、不可測 | 隨機/時間一律注入（rng.js / 傳 tick），鐵則 9 |
| 把加成倍率寫死在邏輯層 | 倍率全放 `config/`（BLOCKS.bonus 等），coreStats 只讀 config |
| 把 11-20 成長/21-30 增壓乘進 enemies.js base | enemies.js 只放「1-10 不成長 base」，成長由 waveGen 套 |
| 用 frame count 推進遊戲會讓 144Hz/240Hz 玩家變快 | 遊戲進程一律走 `src/game/gameLoop.js` fixed timestep；`requestAnimationFrame` 只排 render |
| `DOMContentLoaded` 可能在 ES module late-load 前已觸發 | `main.js` 必須檢查 `document.readyState`；loading 時監聽，否則立即 boot |
| Canvas 沒焦點會吃不到鍵盤 | `Controls.attach()` 設 `tabindex=0` 並 focus canvas；點畫面也會重新 focus |
| 固定步進不插值 → 移動 judder/暈 | render 吃 gameLoop 的 alpha，移動體用 `prev+(cur-prev)*alpha` 畫；鏡頭整數像素平移防 pixelated 邊緣抖 |
| pixel art camera 如果每幀 `Math.round(camera)`，在 5格/秒 × 16px/格 = 80px/s 時會出現 1px/2px 不均勻跳動 | 鏡頭跟隨應使用 deadzone + follow smoothing；是否保留整數像素對齊需依實測取捨 |
| 無頭預覽 rAF 被節流，沒法 live 驅動 loop | 動態行為靠 Node 整合測試確定性驗證；瀏覽器只驗渲染/無 error |
| 背包 carry 50 時承重先綁死（裝不到 6 種） | 格數規則要 carry 被加成後才生效；別誤以為 6 格能裝滿 |
| 建造快捷列有空格時，按到空格會卡住不能挖也不能蓋 | 輸入層必須用 hotbar 長度限制可選數字；主迴圈也要遇到無效 slot 時自動退出 |
| 滑鼠座標只在 pointermove 更新，第一次點擊會用舊座標 | pointerdown 必須同步 offsetX/offsetY，再產生放置/拆除事件 |
| 只統計前景方塊會漏掉泥土血量加成 | 核心加成計數必須包含 `world.dirt.size`；泥土每格 +1 hpMax |
| 未來存檔 / debug / migration 若帶入孤立泥土，`world.dirt.size` 會多算核心血量 | 接存檔或外部載入世界時，核心統計要改成只計 `computeConnected(world.dirt, world.core)` 的泥土 |
| 拆土同步扣 current/max HP 時可能把自己拆死 | `tryRemove` 必須先檢查拆除後 `coreHp > 0`，否則回傳 `would_destroy_core` 禁止拆除 |
| 修復如果不檢查站位會變成免費遠端回血 | R 修復必須站在核心或 connected dirt 上，且每秒消耗 1 fatigue |
| `computeConnected()` 返回 Set 不含核心格，判斷「站在地基上」若只用 `connected.has()` 會漏掉核心 | 凡對連通泥土生效的功能（卸貨/修復/…）一律用 `isOnFoundation()`；規則見 `Docs/design-patterns.md` |
| 手機虛擬按鈕蓋在 canvas 上會遮擋 HUD/debug，且 iOS/Android 可能叫出原生 tap highlight | 手機橫向使用三欄 layout：左右灰色操作區放 HUD/D-pad/Debug Tool/動作鍵，中間只放 canvas 與快捷列；所有 touch button 要加 `preventDefault()`、`touch-action:none`、`-webkit-tap-highlight-color:transparent` |
| 手機模式若直接改全域 `GAME_CONFIG.render.drawCanvasHud` 會污染桌面模式 | `main.js` 進 touch mode 時 clone cfg/render/map，再設 `drawCanvasHud=false`；桌面 renderer 仍照常畫 `_drawHud` |
| **[部署前必修]** debug 功能預設開啟，全域暴露 app 狀態 | 正式 build 前必須：① `debug.enabled=false`、`debug.hotkeys=false`；② `window.__YES_MASTER__` 只在 `debug.enabled` 時掛載；③ 手機 debug panel（`_buildDebugPanel`）只在 debug 下建立。未來若導入 build pipeline 再做 build-time strip，目前開發期維持開啟 |
| Supabase `.single()` 查不到資料會回 406，容易把「尚未建立 profile」誤判成登入失敗 | 對可能不存在的單筆資料用 `.maybeSingle()`；登入後一律 `ensureProfile(user)`，必要時建立/補齊 `player_profiles` |
| 多人流程底層若呼叫 `ensureSupabaseUser()`，沒有 session 時會靜默建立 anonymous guest | 多人房間與好友流程一律用 `requireSupabaseUser()`；沒有登入就回登入流程，不要自動訪客化 |
| Supabase Auth `site_url` 若留 localhost，Vercel OAuth 成功後會回跳錯誤網址 | 線上 `site_url` 用 `https://yes-master-delta.vercel.app`；localhost/127.0.0.1 只放 redirect allow-list |

> Debug hotkeys（`config/gameConfig.js debug.enabled && debug.hotkeys`）：H 扣核心血、J 回核心血、K 補塔內測試資源、L 生成 1 敵人、P 生成 5 敵人、C 直接開抽卡面板、T 暫停/恢復 gameplay update、X 清除 localStorage 存檔並重新整理（回新局）、**` 鍵切換 debug 浮層**（右上角疊加，顯示 tick/phase/drops/coreHp 等即時狀態）。手機模式另有右上 ⚙ Debug Tool，掛在右側灰欄，與 canvas debug overlay 可同時存在。

> 已知的設計面注意點（可在開工時轉成具體陷阱）：
> - 建築是三維度（背景泥土 = 地基；前景第二層蓋在泥土前方），連通性在背景平面判定。
> - 核心 2x2x2、貼地、正前方 Z 不可蓋。
> - 反作弊：玩家送輸入不送結果；過期判定用 host_received_at 不採信 client timestamp。
> - 多人 active save 走 Edge Function（驗 current_host_uid），不可只靠 owner_id=uid。
