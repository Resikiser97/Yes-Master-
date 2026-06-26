# CHANGELOG.md — 版本歷史

> 版本：v0.0.14.1
> 類型：**只增不改**（歷史紀錄，永遠往上加，最新在最上方，不回頭改舊條目）。
> 條目格式：`## vX.Y.Z.W - YYYY-MM-DD`，下分「新增 / 修復 / 調整」。

---

## v0.0.14.1 - 2026-06-26

### 修復
- **多人 Lobby / WaitingRoom P0+P1 修復**：房間 ID 加入會傳遞密碼；公開列表密碼房加入前會要求輸入密碼；建房 popup 補齊密碼、最低等級、公開性與難度傳遞。
- **WaitingRoom → 遊戲 netSession 傳遞**：開始遊戲前保留已建立的 PeerJS session，進遊戲後重新掛接 host input / client state sync callback，避免重複建連線或 client 本地跑權威邏輯。
- **房間資料一致性**：新增 `start-room`、`kick-player`、`leave-room` Edge Functions；開始遊戲寫入 `game_started`，踢人/退出改走後端並同步 `current_players`。
- **房間密碼與 token 安全**：新建房間改寫入 `password_hash` / `has_password`，join-room 支援 hash 驗證並保留舊明文欄位 fallback；`issue-room-join-token` / `verify-room-join-token` 必須確認玩家仍是房間成員。
- **訪客模式本地設定**：`supabase/config.toml` 開啟 anonymous sign-in 以符合現有訪客 UI。
- **實機驗收修補**：訪客登入避免 auth callback / button flow 雙重進入 Lobby；WaitingRoom member list 支援舊 DB 缺 `role/is_host` 欄位 fallback；缺欄位 fallback 會 cache 已降級欄位，避免輪詢持續噴 400。

### 調整
- `supabase/alter_rooms_phase_g.sql` / `supabase/migrations/20260626_phase_g_room_columns.sql`：補齊並部署 live Supabase 需要的 `rooms.current_players`、`room_memberships.role`、`room_memberships.is_host` 欄位，避免 WaitingRoom / start-room 在線上舊 schema 下失敗。
- `src/net/roomManager.js`：房間列表只查安全欄位並過濾已開始、滿房、非公開房；新增 `startRoom()`，`kickPlayer()` / `leaveRoom()` 改呼叫 Edge Function。
- `src/main.js`：多人角色判斷統一使用 Lobby/URL 合併後的 `netRole`，`world.roomId` 使用 Lobby 傳入的 room id。
- `tests/roomManager.test.js`：新增房間列表安全欄位、join payload、列表過濾純函式測試。

## v0.0.14.0 - 2026-06-26

### 新增
- **多人大廳 UI（Lobby）**：Splash 新增「多人模式」按鈕 → 全螢幕大廳；三個 tab（公開/朋友/房間號碼）；建房 popup 支援名稱/人數/難度選擇；3 秒 polling 自動刷新房間列表。
- **等待室 UI（Waiting Room）**：玩家 slot 卡片（皇冠/頭像/等級）；PeerJS data channel 即時聊天；操作圓（🔵 角色面板 / 🟢 加好友 / 🔴 踢人）；Host「開始遊戲」按鈕廣播 GAME_START。
- **登入畫面（Auth Screen）**：進 Lobby 前自動檢查登入狀態；Google OAuth 一鍵登入 + 訪客匿名模式；登入後自動建立 player_profiles。
- **角色面板 Popup**：查看玩家等級、經驗值、五項裝備等級、賽季稱號。
- **等級系統**：經驗值曲線、calcLevel、addExp、遊戲結算經驗計算（`config/levelConfig.js` + `src/game/levelSystem.js`）。
- **好友系統**：好友邀請/接受/刪除、好友列表、待處理邀請（`src/net/friendManager.js`）。
- **裝備系統**：五項裝備（挖掘鎬/耐力護符/靈動面具/背負袋/修復錘）+ 每級加成 + 升級成本（`config/equipmentConfig.js` + `src/game/equipmentSystem.js`）。
- **成就系統**：成就定義表 + 解鎖記錄（`config/achievements.js` + `src/game/achievementSystem.js` + `supabase/seed_achievements.sql`）。
- **排行榜 + 賽季稱號**：賽季 ID 格式、稱號門檻（金冠/銀冠）、排名查詢（`config/seasonConfig.js` + `src/game/leaderboardSystem.js`）。
- **房間 DB 補強**：rooms 表新增 password/min_level/difficulty/visibility/game_started；room_memberships 新增 display_name/player_level。
- **Edge Function 更新**：create-room 接受新欄位；join-room 加入密碼/等級/滿員檢查。
- **roomManager 新增**：`getRoomMembers()`、`kickPlayer()`。
- **PeerJS 聊天路由**：peerHost.js 加入 MSG.CHAT 轉發；protocol.js 新增 CHAT/GAME_START/PLAYER_INFO 訊息類型。
- **netSession 傳遞**：WaitingRoom 建立的 PeerJS 連線直接傳入遊戲，避免重複建立。

### 調整
- `src/ui/splash.js`：新增「多人模式」按鈕，import lobby.js。
- `src/main.js`：onStart 接受第三參數 netInfo，優先使用 Lobby/WaitingRoom 流程的多人設定。
- `src/net/protocol.js`：新增 CHAT、GAME_START、PLAYER_INFO 訊息類型。
- `src/net/peerHost.js`：新增 MSG.CHAT 路由，host 收到後呼叫 `_onChat` callback。
- `src/net/roomManager.js`：createRoom/joinRoom 支援新欄位傳遞。

---

## v0.0.13.0 - 2026-06-25

### 新增
- **規劃模式（Build Plan Mode）**：
  - 站在核心上按 B 鍵進入規劃模式，可無視距離限制在任何連通位置建造。
  - 拖拽放置：左鍵拖拽畫出矩形，一次放置整個區域的方塊。
  - 資源預檢：拖拽範圍所需資源不足時，整批拒絕放置（防止大範圍誤操作）。
  - 拖拽預覽：綠色虛線框顯示建造區域，紅色表示資源不足或拆除模式，中央顯示所需/可用數量。
- **拆除模式（Destroy Mode）**：
  - 規劃模式內按 V 鍵切換拆除模式。
  - 材質選擇性拆除：選擇快捷欄材料後拖拽，僅拆除該類型方塊（如選沙只清沙）。
  - 拆除的材料自動退回塔內資源欄。
- **快捷列擴充至 10 格**：
  - 鍵盤 1~9 + 0 對應 10 個槽位；最後一格（鍵 0）顯示 ⚙️ 作為背包預留按鈕。
  - 手機觸控版同步支援 10 格。
- **快捷列滑鼠點擊**：
  - 電腦版快捷列可直接用滑鼠點擊選擇/取消材料，不限於鍵盤快捷鍵。
  - `Controls._hitTestHotbar()` 根據 viewport 尺寸計算槽位碰撞。
- **梯子設為無限功能性方塊**：
  - `config/blocks.js` 梯子新增 `infinite: true`，放置不消耗資源。
  - 快捷列顯示 `∞` 代替數量（桌面+手機）。
  - 選中梯子時不會因 storage 為 0 被自動取消。
- **挖礦進度條持久化**：
  - 所有被部分挖過的方塊都會持續顯示進度條，讓玩家知道上次挖到哪裡。

### 調整
- `src/game/world.js`：新增 `buildPlanMode`、`buildDestroyMode`、`buildPlanDrag` 狀態欄位。
- `src/game/actions.js`：新增 `toggleBuildPlanMode`、`tryPlaceRect`、`tryRemoveRect`、`previewPlaceRect`；`tryPlace`/`computeBuildPreview` 支援 infinite 方塊。
- `src/input/controls.js`：新增 B/V 鍵、拖拽追蹤、`_hitTestHotbar`、`viewport` 同步。
- `src/render/renderer.js`：`_drawMiningProgress` 改為迭代所有 `world.mineProgress`；`_drawBuildPreview` 增加拖拽矩形預覽；`_drawDesktopHotbar` 擴展至 10 格並支援 ∞ 顯示。
- `src/main.js`：整合 Build Plan / Destroy Mode 控制流、拖拽消費、infinite 方塊自動取消跳過。
- `config/gameConfig.js`：hotbar 擴充為 10 元素陣列。

---

## v0.0.12.0 - 2026-06-24

### 新增
- **Debug 暫停鍵**：
  - 新增 `T` debug 鍵與觸控 debug 面板按鈕：切換 `world.debugPaused`，暫停 gameplay update、保留 render/input 以便再次恢復。
  - 暫停時畫面顯示 `DEBUG PAUSED` 提示；`restartStage` 會解除暫停。
- **電擊攻擊 VFX**：
  - `src/game/world.js`：新增 `vfx: { timer, bolts }` 狀態欄位（攻擊時固定生成的閃電路徑快照）。
  - `src/game/combatRuntime.js`：攻擊觸發時填入 `world.vfx.bolts`（每條 bolt 含固定 zigzag points + chainIdx）；每幀遞減 `vfx.timer`，歸零時清空 bolts。
  - `src/render/renderer.js`：新增 `_drawVFX()` + `_drawLightningBolt()`；只讀取已生成的 bolt points 並繪製；主目標：粗藍白閃電；連鎖目標：細淡藍閃電；最後 0.2s 淡出。
- **攻擊範圍圈（lazy offscreen cache）**：
  - `src/render/renderer.js`：新增 `_drawRangeCircle()`；cache key 為 `${range}:${tilePx}:${anchors}`，range、縮放或正式攻擊 anchor 改變才重建 OffscreenCanvas；畫面內顯示正式攻擊範圍聯集；無 OffscreenCanvas 支援時自動 fallback 為直接填色。
- **素材整理**：
  - `assets/` 下 13 張 ChatGPT 生成 PNG 全部重新命名（依內容：spritesheet_*/bg_*/ui_screen_*），原始 `ChatGPT Image...` 命名全部消除。
  - 新增 `assets/icon-status.md`：追蹤每張素材的裁剪/整合狀態（✅ / 🔲 / ⏸ / ❌）。
- **Sprite 圖示基礎設施**：
  - 新增 `src/render/imageLoader.js`：`loadImages(manifest)` 非同步批量載入圖片，回傳 `Map<key, HTMLImageElement>`，載入失敗不中斷遊戲。
  - 新增 `config/sprites.js`：`SPRITE_SHEETS`（blocksNoFrame / blocksSlotFrame 定義）+ `getFrameRect(img, sheet, keyOrIndex)` 切幀工具。
  - `src/main.js`：splash callback 內非同步載入 blocksNoFrame + blocksSlotFrame；完成後注入 `renderer.setSprites()` 和 `controls.setSprites?.()`。
  - 新增 `assets/spritesheet_blocks_9tiles_hotbar.png`：由原始 noframe sheet 去背、去除假透明棋盤格、重打包為 9 格正方形，供手機 hotbar 與鍵盤 HUD 使用。
- **快捷列方塊圖示（手機觸控模式）**：
  - `src/input/touchControls.js`：`_buildHotbar()` 改為每個 slot 包含 `<canvas>`（方塊圖示）+ `<span>`（熱鍵角標，右下角小字）；新增 `setSprites(imgs)` 方法（sprites 注入後呼叫）；新增 `_paintHotbarIcons()` 以 `drawImage + getFrameRect` 從 sprite sheet 切幀繪製；無 sprites 時 fallback 為半透明色塊。
  - 7 個啟用 slot 分別對應 sand/dirt/stone/iron/gold/glass/diamond，與 `config/gameConfig.js hotbar` 順序一致。
  - `src/render/renderer.js`：鍵盤模式 HUD 在選中建材時繪製 16×16 方塊小圖示；sprites 未載入時維持純文字。
- **Codex 任務交接**：
  - `Docs/claude-codex-worklist.md`：新增 1C 節「Spritesheet 裁剪」任務，指定 Python PIL 裁剪敵人/哥布林/核心/平民/UI 圖示 5 張 spritesheet 的詳細規格。

### 調整
- `src/render/renderer.js`：`render()` 中 `_drawDirt()` 後插入 `_drawRangeCircle()`、`_drawEnemies()` 後插入 `_drawVFX()`；`resize()` 重設 `_rangeCacheKey`。
- `src/render/renderer.js`：constructor 加入 `_sprites`、`_rangeCacheKey`、`_rangeCanvas` 欄位；新增 `setSprites(imgs)` 方法。

---

## v0.0.11.0 - 2026-06-24

### 新增
- **掉落物合併與上限機制**：
  - `src/logic/drops.js`：掉落物加入 `qty` 欄位支援堆疊；新增 `addDrop(drops, blockKey, x, y, maxStacks)` 同格同物品自動合併 qty，受 `maxStacks` 上限控制。
  - `config/gameConfig.js`：新增 `drops.maxStacks: 128`（地面掉落物 stack 上限）。
  - `src/game/actions.js`：背包滿且地面滿時不呼叫 `digMineCell`，`m.damage` clamp 在 `need`，新增 `m.dropFull` 旗標；`collectDrops` 清空時同步重置 `dropFull`。
  - `src/render/renderer.js`：`_drawDrops` 掉落物 qty > 1 時顯示數量標籤。
  - `src/storage/saveManager.js`：反序列化舊格式 drops（無 `qty`）自動補 `qty: 1`。
- **測試覆蓋大幅擴充**（v0.0.6.0–v0.0.10.0 核心新增）：
  - `tests/drops.test.js`：createDrop qty、addDrop 合併/新建/cap、collectNearbyDrops reach/qty/partial pickup/舊格式。
  - `tests/actions-mining.test.js`：mineProgress 停手保存→恢復→破塊清除、背包滿產生 drops、dropFull cap 旗標、collectDrops 重置旗標。
  - `tests/saveManager.test.js`：drops+mineProgress round-trip、舊格式 compat、test preset 獨立 storageKey。
  - `tests/mobileLayout.test.js`：computeThreeColumnLayout 多種螢幕尺寸不產生負數。
  - `tests/import-smoke.test.js`：Node 環境下 import pwaTutorial.js / splash.js 不報錯。
  - `tests/index.js`：匯入上述 5 個新測試檔，輸出更新。
- **HUD 新增「地面已滿」提示**：`src/render/renderer.js`、`src/input/touchControls.js` 在 `mining.dropFull` 時顯示。

### 修復
- **pwaTutorial.js Node 環境 import 炸**：top-level `window.addEventListener('beforeinstallprompt', ...)` 加 `typeof window !== 'undefined' && typeof window.addEventListener === 'function'` guard，瀏覽器行為不變。
- **TouchControls 越過輸入層邊界**：移除對 `src/game/actions.js`（applyDebugAction）與 `src/storage/saveLocal.js`（clearSave）的直接 import；debug panel 按鈕全部改為 `this.pendingDebug.push(action)`，由 `main.js` consume 管線統一處理；`resetSave` 在 main.js 中 special-case（不混進 `applyDebugAction`）。
- **drops.js `addDrop` 違反純函式分層**：改為不 mutate 傳入陣列，回傳 `{ drops, added }`；`actions.js` 同步改接新介面。
- **world.js `mining` 缺少 `dropFull` 初始化**：`createWorld` 的 `mining` 補 `dropFull: false`；`drops` 註解同步 `qty` 欄位。

### 調整
- **QUICKREF.md 陷阱表**：新增「部署前必修」風險記錄（debug 預設開啟、`window.__YES_MASTER__` 全域暴露、手機 debug panel），記錄正式 build 應關閉的項目。

## v0.0.10.0 - 2026-06-24

### 新增
- **手機觸控放置方向選擇器（3×3 Placing Selector）**：
  - `src/input/touchControls.js`：新增 `this.placeOffset = { dx, dy }`（預設中心 {0,0}）；新增 `_buildPlacingSelector()` 在右側欄 Debug Tool 下方、動作鍵上方插入 3×3 方向 grid（每格 40×40px，金色高亮選中格）；新增 `_refreshSelector()` 更新按鈕高亮；選擇持續保留，不因移動重置。
  - `src/main.js`：touch 模式 mouse 同步時加入 `controls.placeOffset` 偏移（`(player.x + off.dx) * t`、`(player.y + off.dy) * t`）；build preview、tryPlace、tryRemove 全部自動跟著偏移，桌面端行為完全不變。

## v0.0.9.0 - 2026-06-24

### 新增
- **PWA 安裝引導畫面**（iOS/Android 玩家教學）：
  - `manifest.json`（根目錄）：PWA 宣告（standalone、landscape、theme-color #D4A017、圖示 192/512）。
  - `src/ui/pwaTutorial.js`（新檔）：`showPwaTutorial(onDone)` / `shouldShowPwaTutorial()`；全螢幕引導覆蓋層（z-index 9998）；iOS/Android 分頁切換，自動偵測平台；Android `beforeinstallprompt` 攔截，可一鍵觸發原生安裝 prompt；跳過計數（`yesmaster.pwaSkip`，最多 3 次後不再顯示）；淡入/淡出 0.4s 動畫。
  - `src/ui/mobileLayout.js`：新增 `isStandalone()` export（`window.navigator.standalone` + `matchMedia display-mode:standalone` 雙檢）。
  - `src/ui/splash.js`：整合教學判斷——`isTouchDevice() && !isStandalone() && shouldShowPwaTutorial()` 成立時先顯示教學再進 splash；現有 splash DOM 建立邏輯抽成 `_buildSplashDOM(onStart)` 私有函式。
  - `index.html`：加入 6 條 PWA meta/link tag（manifest、theme-color、apple-mobile-web-app-capable/status-bar-style/title、apple-touch-icon）；修正版本角標初始值 v0.0.3.0 → v0.0.9.0。
  - `tools/generate-icons.html`（新檔）：瀏覽器工具，開啟後自動產生並下載 icon-192.png / icon-512.png（金色背景 + YM 文字），需放入 `icons/` 目錄。

## v0.0.8.0 - 2026-06-24

### 新增
- **Step 12A 動態 Canvas 縮放**：
  - `src/ui/mobileLayout.js`（新檔）：`computeTilePx / applyTilePx / isTouchDevice / getSavedInputMode / saveInputMode / setupOrientationGuard`；首次呼叫快取 baseViewCols/baseViewRows 避免 resize 後漂移；`visualViewport` + `window resize` 雙監聽；直向偵測遮罩（z-index 9998）。
  - `src/render/renderer.js`：新增 `resize(cfg)` 方法，視窗縮放後重設 canvas 尺寸。
  - `src/main.js`：renderer / controls 移至 splash callback 內（需 inputMode 才能選類型）；`applyTilePx` 初始化；掛 resize 監聽；touch 模式每幀把 `controls.mouse` 同步玩家位置供 build preview。
- **Step 12B 觸控輸入層**：
  - `src/input/touchControls.js`（新檔）：`TouchControls` class，public 介面與 `Controls` 完全相容；HTML overlay（z-index 200）；8 方向 D-pad（3×3，中心空）、挖礦/修復長按、放置/拆除 tap、快捷列 1~7、canvas `touchstart` 卡片選擇偵測（座標按 canvas scale 換算）。
- **Step 12C 手機 overlay 與直向守衛**：`setupOrientationGuard` 直向時顯示「請轉橫向遊玩」全螢幕遮罩（只在 touch 模式呼叫）。
- **Step 12D Debug 按鈕整合**：
  - `src/input/touchControls.js`：`debug.hotkeys=true` 時 `attach()` 建立 HTML debug 面板（`#debug-panel-touch`），H/J/K/L/P/C/N/Q/X 九個 tap 按鈕（透過 `window.__YES_MASTER__` 取 world/config）。
  - `src/main.js`：keyboard + touch 兩模式都在右上角加 `⚙` 固定按鈕（z-index 300），click → toggle `world.showDebug` + HTML debug 面板。
- **Splash 輸入模式選擇**（`src/ui/splash.js`）：第二排按鈕「⌨ 電腦鍵盤 / 📱 手機觸控」；auto-detect 預設；選中金色高亮；callback 改為 `onStart(diffMode, inputMode)`；儲存至 `localStorage yesmaster.inputMode`（不進遊戲存檔）。
- **index.html 響應式**：移除 `width:800px; height:600px` 硬碼；canvas 尺寸全交 JS 控制；viewport 增 `maximum-scale=1, user-scalable=no`；body 加 `overflow:hidden`。

### 調整
- **手機三欄觸控 UI 精修**：
  - `src/ui/mobileLayout.js`：新增三欄 layout 計算；手機橫向時左右保留灰色操作區，中間 canvas 以桌面比例等比縮小置中；手機模式不再用 bottom reserve 壓縮 canvas。
  - `src/input/touchControls.js`：overlay 改為左/中/右三欄容器；左欄上方顯示核心/關卡/HUD 狀態、左下固定 D-pad；右欄上方放 Debug Tool、右下固定挖礦/修復/放置/拆除；按鈕加入 `-webkit-tap-highlight-color: transparent`、`user-select: none`、`touch-action: none`，降低手機原生 highlight 干擾。
  - `src/render/renderer.js` / `src/main.js`：手機模式設定 `cfg.render.drawCanvasHud = false`，桌面仍照常畫 canvas 底部 HUD；canvas debug overlay 保留。
  - 手機快捷列固定顯示 `1 2 3 4 5 6 7 8 9 0`；目前 `1-7` 對應 `config.hotbar` 可用，`8-0` 顯示 disabled，未來 hotbar 擴到 10 格可直接啟用。
  - Debug Tool 修正 pointer events 與 scroll 區域，讓手機右欄面板按鈕與 scrollbar 可點擊/拖動。

## v0.0.7.2 - 2026-06-24

### 新增
- **挖礦進度持久化**：
  - `src/game/world.js`：新增 `mineProgress: {}`，以 targetKey 為 key 存每格的累積傷害。
  - `src/game/actions.js`：`updateMining` 停手/換格時把 `m.damage` 存入 `mineProgress`；切回同一格時恢復；方塊破掉後清除該格記憶。玩家可以打 5 下走掉，下次只需再打剩餘傷害即可出塊。
  - `src/storage/saveManager.js`：`mineProgress` 加入序列化/反序列化（關閉遊戲後進度不丟失）。
- **Debug overlay 加挖礦資訊**：
  - `src/render/renderer.js`：`_drawDebugOverlay` 新增兩行：`挖礦: Xpwr × Y/s = Zdps` 和 `礦格: 當前進度/耐久 (記憶格N)`；panel 寬度從 192→210 容納新行。

## v0.0.7.1 - 2026-06-24

### 新增
- **Step 11A HUD 左右分欄（Codex）**：
  - `src/render/renderer.js`：`_drawHud` 改為左右雙欄佈局；左欄：核心 HP/ATK/攻速/DEF、範圍/魔法/連鎖、背包、塔內資源、已放置方塊；右欄：phase/計時、操作提示、疲勞/修復、敵人/命中、狀態行（背包滿/修復中/修復失敗）；中間加細分隔線；高度由 ~160px 縮至 ~86px；lineH 改 14px。

## v0.0.7.0 - 2026-06-24

### 新增
- **Step 11B Debug 浮層**：
  - `src/game/world.js`：`createWorld` 新增 `showDebug: false`、`testMode: false`。
  - `src/render/renderer.js`：新增 `_drawDebugOverlay(world)`，半透明金邊浮層疊在畫布右上角，顯示 debug hotkeys + tick/phase/drops/enemies/coreHp 即時數值；從 `render()` 在 `world.showDebug` 為 true 時呼叫；同時移除 HUD 底部的 DEBUG 熱鍵提示行。
  - `src/main.js`：在 debug.hotkeys 模式下，` 鍵（Backquote）切換 `world.showDebug`；X 鍵改傳 `cfg.save.storageKey` 給 `clearSave`。
- **Step 11C 測試難度 preset**：
  - `config/testPreset.js`（新檔）：`TEST_PRESET_SAVE_KEY = 'yesmaster.save.test.v1'`；`buildTestConfig(base)` 回傳以 base 為底的測試 config（phases.prepSeconds=15、nightSeconds=45、overtimeSeconds=20；`_testInit` 提供初始強化）。
  - `src/ui/splash.js`：點擊任意處改為兩個按鈕（正式難度 / 測試模式 1~30 關）；callback 改為 `onStart(mode: 'normal'|'test')`。
  - `src/main.js`：world/renderer/controls 建立時機移至 splash callback 內（需知道 mode 才能選 cfg）；測試模式下注入 `_testInit.cardBonuses + storage`（只在無存檔新局）並設 badge 為「測試模式」。
  - `src/storage/saveLocal.js`：`loadSave / writeSave / clearSave` 改接受可選 `storageKey` 參數（預設 DEFAULT_KEY）。
  - `src/storage/saveManager.js`：`saveWorld(world, cfg?)` 和 `loadWorld(cfg?)` 皆透過 `cfg.save?.storageKey` 傳對應 key。

## v0.0.6.0 - 2026-06-24

### 新增
- **Step 10A 掉落物系統**：
  - `src/logic/drops.js`（新檔）：`createDrop(blockKey,x,y)` 建立掉落物；`collectNearbyDrops(drops, player, inventory, cfg)` Chebyshev 距離 ≤ pickupReachTiles 時自動撿取（純函式）。
  - `config/gameConfig.js`：新增 `drops.pickupReachTiles: 1`。
  - `src/game/world.js`：`createWorld` 新增 `drops: []`；`firstGame / tutorialTimer` 欄位繼承自 v0.0.5.0。
  - `src/game/actions.js`：`updateMining` 背包滿時改為掉落到玩家腳下並繼續挖；新增 `collectDrops(world, cfg)` 每 tick 呼叫，pickup 後若 drops 清空則清除 `mining.full`。
  - `src/storage/saveManager.js`：序列化 / 反序列化 `drops` 陣列。
  - `src/main.js`：update loop 每幀呼叫 `collectDrops`；`cardHoverIndex` 每幀由滑鼠 vs cardOfferRects 計算後寫入 world。
  - `src/render/renderer.js`：新增 `_drawDrops(world)`，以方塊顏色 + 白色輪廓繪製掉落物。
- **Step 10B 卡片 UI polish（Codex）**：
  - `src/render/renderer.js`：`_drawCardPanel(card, rect, hovered)` 加 hover 參數，hover 時背景亮色 + 邊框加粗 + tier 顏色 glow；tier label 中文化（稀有/普通/基礎）；卡名 bold 16px；`type・tier` 副標；效果文字柔和色；底部細分隔線 + 價值欄位。

### 修復
- `src/render/renderer.js` `_drawCardPanel`：Codex 寫的 `tierLabelMap/tierColorMap` key 用 `normal`，實際 cards.js tier 值為 `standard`，修正為 `standard`。

## v0.0.5.0 - 2026-06-24

### 新增
- **Step 9A localStorage 存檔接入**：
  - `src/storage/saveManager.js`（新檔）：`serializeWorld` / `deserializeWorld` / `saveWorld` / `loadWorld`；序列化 stage/storage/dirt/fore/player/coreHp/cardBonuses/cardModifiers/mines，還原時透過 `createWorld` 基礎設施 + patch 存檔值 + `refreshCoreSnapshot`。
  - `src/main.js`：開機優先 `loadWorld()`，失敗才 `createWorld()`；wave clear 進入 prep 時自動 `saveWorld()`；debug X 鍵清除 localStorage 並重新整理回新局。
- **Step 9B 新手教學提示**：
  - `src/game/world.js`：`createWorld` 新增 `firstGame / tutorialTimer` 欄位。
  - `src/main.js`：無存檔首次啟動設旗標與計時器；phase 切入 night 時重置計時器；每幀遞減。
  - `src/render/renderer.js`：新增 `_drawTutorialHint`，prep/night 各顯示對應黃色提示框，最後 1 秒淡出；僅首次遊玩顯示。
- Debug hotkey `X`：清除存檔並 reload。

### 修復
- `config/gameConfig.js`：版本號誤寫為 `v0.0.3.0`，修正為 `v0.0.4.0`（本次 sync 升為 v0.0.5.0）。

## v0.0.4.0 - 2026-06-24

### 新增
- **Step 8 王關卡片系統接入**：
  - `src/logic/cardEffect.js`（新檔）：4 種 effect 純函式實作（`coreStat` / `playerStat` / `resource` / `modifier`），消費 `world.cardBonuses / world.cardModifiers / world.storage / world.player`。
  - `src/game/phaseRuntime.js`：`_waveClear` 於 stage=10/20/30 轉入 `cardOffer` phase；新增 `_enterCardOffer`（呼叫 `generateOffer`）、`resolveCardOffer`（套用 effect + 刷新快照 + 回 prep）。
  - `src/game/world.js`：world 新增 `pendingCardOffer`、`cardBonuses`、`cardModifiers` 三欄位；phase 說明加 `cardOffer`。
  - `src/game/coreSnapshot.js`：`refreshCoreSnapshot` 將 `world.cardBonuses` 傳入 `computeCoreStats` opts.cardAdd，使卡片加值反映到核心數值快照。
  - `src/render/renderer.js`：`_drawCardOffer` 完整卡片面板（3 張水平排列，顯示名稱/類型/tier/效果文字），寫入 `world.cardOfferRects`；`_phaseLine` 新增 `cardOffer` case；`cardEffectText` / `wrapText` 工具函式。
  - `src/input/controls.js`：`cardOfferMode` flag、`cardOfferRects`（由 main.js 每幀同步）、`pendingCardChoice` 與 `consumeCardChoice()`；`_handlePointerDown` 在 cardOffer 模式下偵測點選卡片座標。
  - `src/main.js`：import `resolveCardOffer`，每幀同步 `controls.cardOfferMode / controls.cardOfferRects`，消費 `consumeCardChoice()` 並呼叫 `resolveCardOffer`。
  - `src/game/actions.js`：新增 debug action `showCardOffer`，C 鍵直接開抽卡面板（prep phase 有效）。
  - Debug hotkey C 新增至 `config/gameConfig.js`（debug hotkeys）與 `QUICKREF.md` 陷阱/hotkey 表。
  - `tests/cardEffect.test.js`：測 4 種 card effect 套用。
  - `tests/cardOffer.test.js`：測出卡規則、boss 清關進 cardOffer、debug C、rect 點選、resolveCardOffer 回 prep。
  - `tests/index.js`：匯入以上兩個新測試檔。
  - `package.json`：補 `npm test`/`node tests/` 跑測試腳本。
  - `index.html`：標題改為 `Yes, Master! — MVP`。
  - 多份文件（`ARCH.md`、`Docs/`、`assets/`）統一強調正式遊戲名 **Yes, Master!**，哥布林的信仰為副標 / lore。

## v0.0.3.0 - 2026-06-23

### 新增
- **Step 6B debug 核心戰鬥接入**：
  - 新增 `src/game/combatRuntime.js`：debug 敵人生成、敵人追逐玩家、核心攻擊覆蓋 anchor、核心普攻/連鎖 tick。
  - Debug hotkeys 新增 `L` 生成 1 隻敵人、`P` 生成 5 隻敵人；敵人暫時追玩家但不攻擊。
  - 核心攻擊使用現有 `src/logic/combat.js`：普攻鎖最近核心目標、連鎖選目標、傷害套防禦/魔法。
  - `Renderer` 繪製敵人與小血條，HUD 顯示敵人數與最近命中傷害。
- **Step 6A 核心 HP / 修復 / Debug 測試鍵**：
  - 新增 `src/logic/coreHealth.js`：核心目前 HP 夾取、扣血、hpMax 變化同步 current HP、修復量換算與疲勞消耗。
  - world 新增 `coreHp`、玩家目前 `fatigue`、`repair` 狀態；HUD 顯示 `HP current/max`、疲勞與修復狀態。
  - 建土時 current/max HP 一起增加；拆土時 current/max HP 一起扣，若會讓核心歸零則回傳 `would_destroy_core` 並禁止拆除。
  - R 長按修復：需站在核心或 connected dirt 上，每秒消耗 1 疲勞，回復 `repair/60`（向下取小數 2 位）。
  - `config.gameConfig.debug` 新增 H/J/K hotkeys：扣核心血、回核心血、補塔內測試資源。
- **Step 5 核心數值顯示 / 方塊加成回饋**：
  - `src/logic/coreStats.js` 新增 `countPlacedBlocks`，把背景泥土與前景方塊統一轉成核心加成計數；泥土每格仍提供 hpMax +1。
  - 新增 `src/game/coreSnapshot.js`，集中刷新 `world.blockCounts` / `world.coreStats`。
  - `createWorld` 初始化核心數值快照；`tryPlace` / `tryRemove` 成功後即時刷新。
  - `Renderer` HUD 顯示核心 HP 上限、攻擊、防禦、攻速、範圍、魔法、連鎖與已放置方塊數。
- **Step 4 初版建造 / 拆除**：
  - 新增 `src/logic/building.js`：放置/拆除合法性判定（建造 reach、分段水平範圍、高度、核心佔用、地底、連通泥土、前景背板）。
  - `src/game/actions.js` 接 `tryPlace` / `tryRemove` / `computeBuildPreview`；放置消耗塔內資源，拆除退回塔內資源欄。
  - `src/input/controls.js` 接快捷列選材、左鍵放置、右鍵拆除；空快捷格不會進入建造模式，pointerdown 會同步滑鼠座標。
  - `src/render/renderer.js` 顯示建造預覽與建造/挖礦模式 HUD。
  - `config/gameConfig.js` 新增 hotbar、建造 reach 3 格與 debug demo gate；demo 結構預設關閉，避免拆除免費退料。
- **Step 3 挖礦 / 背包 / 塔內資源**：
  - 純邏輯（無 DOM）：`src/logic/mineGen.js`（礦山 10x3 生成 + 重力補位，seeded）、`src/logic/inventory.js`（背包承重/格數雙限、存入塔內）、`src/logic/mining.js`（破塊敲擊數、選最近礦格）。
  - orchestration：`src/game/actions.js`（挖礦累積/破塊、站連通泥土自動卸貨）。
  - `config/mines.js` 加 `MINE_SEED`、`config/gameConfig.js` 加 `player.backpackSlots`。
  - 完整循環：移動 → 長按挖最近礦格 → 進背包（滿了提示）→ 回核心站連通泥土自動入塔內資源欄；第 0 關初始資源包開局入塔內。
  - `Renderer` 畫礦山實際方塊 + HUD（背包承重/內容、塔內資源、背包滿提示）。
- **跟隨鏡頭（smooth、防 flicker/judder）**：`world.updateCameraFollow` 依插值後玩家位置居中跟隨 + 邊界夾取；`renderer` 整數像素平移（防 pixelated 邊緣抖）；`main.js` 存上一步位置、render 吃 gameLoop 的 alpha 做插值。背景（天空）畫在螢幕座標保持固定。
- 純邏輯/整合測試：mineGen/inventory/mining 17 項、整合（挖礦→背包→卸貨→塔內、背包滿旗標）6 項、鏡頭插值/夾取 5 項，全過。

### 調整
- 設計決定（尚未實作，記錄待辦）：背包滿可繼續挖、溢出塊掉地上（Minecraft 式掉落物）；挖礦一律就近、不做滑鼠瞄準。

### 修復
- （無）

## v0.0.2.0 - 2026-06-23

### 新增
- **MVP 單機骨架開工**（四層架構，遵守開發鐵則）：
  - `config/`：gameConfig（含版本欄位，第 5 個版本同步點）、blocks、mines、enemies、waves、cards。
  - `src/logic/`（純函式，無 DOM）：rng（seeded）、damageDefense、coreStats、connectivity、combat、waveGen、cardOffer、migration。
  - `src/render`/`input`/`storage` 分層佔位 + `src/main.js` + `index.html`（ES Module 入口）。
- 接上 Step 2 畫面骨架：`src/game/world.js` 建立 world/camera/核心/兩層方塊狀態，`src/render/renderer.js` 可畫地面、網格、礦山、背景泥土、前景方塊、核心與玩家。
- 新增 `src/game/gameLoop.js` fixed timestep loop：update 固定 60Hz，render 與螢幕刷新率分離，避免高 Hz 讓遊戲進程變快。
- 新增 `src/logic/playerMovement.js` 與 WASD/方向鍵調試版移動；移動能力值 50 換算為 5 格/秒。
- 新增 `.claude/launch.json` 本地啟動設定。
- 新增開發鐵則 9「純邏輯與渲染分離（可測試性）」，並在 `game-architecture-plan.md` 補「程式碼分層原則」。
- 建立 `Docs/claude-codex-worklist.md`：Claude↔Codex 交接看板（config 即交接介面）。
- 純邏輯層 22 項 Node smoke test 全過；Codex 填表後 waveGen 跑 10/20/21/30 關無 NaN。

### 調整
- 定案核心普攻鎖定「離核心最近」、連鎖「以主目標為中心取最近 N、不重複、用盡可重啟循環」、加時 30 秒未清完「強制 GameOver」，同步進 `game-design-plan.md`、`waveplan.md`、`planning-dashboard.md`。
- Codex 填入敵人基礎數值/移速（工兵 attackRange=3）、5 張資源卡 grant、21-30 阻擋區 seed=20260622。

### 修復
- 修正 ES Module late-load 時可能錯過 `DOMContentLoaded`，導致 boot 沒有執行的問題。
- 修正 canvas 沒焦點時鍵盤輸入無效的問題；目前 canvas 會自動 focus，點畫面也會重新 focus。

## v0.0.1.0 - 2026-06-22

### 新增
- 建立「AI 協作 Handover 文件系統」：
  `.claude/instructions.md`、`DOC_INTEGRITY.md`、`VERSION_RULES.md`、
  `ARCH.md`、`QUICKREF.md`、`project_summary.md`、`CHANGELOG.md`、
  `.claude/skills/file-header.md`。
- 確立開場讀取儀式、收尾 `sync-docs` 流程（Step 1~7）與版本號同步鐵則。

### 調整
- 原根目錄 `MAIN.md`（planning 進入點 / source map）移至 `Docs/source-map.md`；
  根目錄 `MAIN.md` 改作「函式級參考」。同步更新 `.claude/CLAUDE.md`、`.codex/AGENTS.md`、
  `Docs/planning-dashboard.md` 的引用路徑。

### 修復
- （無）
