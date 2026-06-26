# MAIN.md — 函式級參考

> 版本：v0.0.14.3
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ MVP 單機可動 + 多人大廳：移動/挖礦/背包/塔內資源/掉落物自動撿取/跟隨鏡頭/初版建造/核心數值回饋/核心 HP 與修復/核心戰鬥/正式波次晝夜/卡片選擇（hover+tier中文）/localStorage 存檔/新手教學提示/**debug 浮層（` 鍵）+ T 暫停**/**測試難度 preset（1~30 關）**/**手機觸控 UI + 動態 canvas 縮放**/**固定 bolt 電擊 VFX + 正式攻擊範圍可視化**/**快捷列圖示（手機 + 鍵盤 HUD）**/**sprite 基礎設施**/**規劃模式（B 鍵拖拽建造+資源預檢）+ 拆除模式（V 鍵材質選擇性拆除）**/**快捷列 10 格（1~0）+ 滑鼠點擊**/**梯子無限方塊**/**挖礦進度條持久化**/**多人大廳（Auth + Lobby + WaitingRoom + PeerJS 聊天）+ 等級/好友/裝備/成就/排行榜系統**已成完整循環。
> 規則：新增 / 刪除函式必須同步本檔（見 `.claude/instructions.md` 開發鐵則）。
>
> 註：原本的「planning 進入點 / source map」已移至 `Docs/source-map.md`。
> 規劃決策總索引：`Docs/planning-dashboard.md`。

---

## 1. 模組載入順序

```
index.html (type=module)
  └─ src/main.js  boot()  ← DOMContentLoaded 或 module late-load 後立即觸發
       ├─ config/gameConfig.js（角標/版本）
       ├─ src/game/world.js      createWorld()
       ├─ src/game/gameLoop.js   startGameLoop()
       ├─ src/render/renderer.js  new Renderer(canvas)
       ├─ src/input/controls.js   new Controls(canvas)
       └─ src/logic/playerMovement.js（固定 timestep 移動）
純邏輯層（src/logic/*）為無副作用模組，由各層按需 import，無全域初始化順序需求。
config/* 為靜態資料，被 logic 層 import。
```

---

## 2. 各模組函式列表與職責

> 純邏輯層（pure）：輸入資料 → 回傳結果，無 DOM/隨機/時間副作用（隨機/時間注入）。

### `src/logic/rng.js`

| 函式 | 職責 |
|---|---|
| `createRng(seed)` | 回傳 seeded RNG（next/int/pct/pick/bernoulli），可重現 |

### `src/logic/damageDefense.js`

| 函式 | 職責 |
|---|---|
| `defenseReduction(defense, k?)` | 減傷% = N/(K+N) |
| `computeDamage(attacker, target, k?)` | 物理(受防禦)+魔法(無視防禦)合算 |

### `src/logic/coreStats.js`

| 函式 | 職責 |
|---|---|
| `countPlacedBlocks(dirtCells, foreBlocks)` | 從背景泥土與前景方塊統計核心加成用方塊數（泥土也算 hp 加成） |
| `computeCoreStats(blockCounts, opts?)` | 方塊計數 → 核心六大數值（倍率讀 BLOCKS.bonus） |

### `src/logic/coreHealth.js`

| 函式 | 職責 |
|---|---|
| `clampCoreHp(current, hpMax)` | 將核心目前血量夾在 0..hpMax |
| `applyHpMaxDelta(current, delta, nextMax)` | hpMax 因建造/拆除變化時，同步調整目前 HP |
| `damageCoreHp(current, amount)` | 扣核心血量，不低於 0 |
| `repairPerSecond(repairPower)` | 修復能力換算每秒回血，無條件捨去到小數 2 位 |
| `repairCoreHp(current, hpMax, fatigue, dt, repairPower)` | 消耗疲勞修復核心，目前血量不超過 hpMax |

### `src/logic/connectivity.js`

| 函式 | 職責 |
|---|---|
| `key(x,y)` | 格座標 → "x,y" 字串 |
| `computeConnected(dirtCells, coreCells)` | BFS 找與核心連通的泥土格集合 |
| `canPlaceDirt(dirtCells, coreCells, x, y)` | 放置後須與核心連通 |
| `canRemoveDirt(dirtCells, coreCells, x, y)` | 拆除不得使原連通格孤立 |

### `src/logic/building.js`

| 函式 | 職責 |
|---|---|
| `blockLayer(blockKey, defs?)` | 查方塊位於背景泥土層或前景第二層 |
| `buildHalfWidth(stage, limits)` | 依關卡段落取得可建造水平半徑 |
| `validatePlacement(ctx, blockKey, x, y)` | 判定放置是否合法（reach/核心/地底/範圍/高度/連通/背板） |
| `validateRemoval(ctx, x, y)` | 判定拆除是否合法（前景優先；泥土不得斷開原連通地基） |

### `src/logic/combat.js`

| 函式 | 職責 |
|---|---|
| `dist2(a,b)` | 平方距離 |
| `selectPrimaryTarget(enemiesInRange, coreCenter)` | 普攻鎖最近核心目標 |
| `chainHitCount(chain, rng)` | 連鎖命中數=整數+小數機率 |
| `selectChainTargets(primary, others, count)` | 以主目標為中心取最近 N、不重複、用盡可重啟 |
| `computeHit(coreStats, target, k?)` | 單次命中傷害（委派 damageDefense） |

### `src/logic/waveGen.js`

| 函式 | 職責 |
|---|---|
| `hpGrowthMultiplier(stage)` | 普通怪血量成長倍率 |
| `flatAttackAdd(stage, enemyKey)` | 跑者/工兵攻擊加法成長 |
| `buildSpawnSchedule(total)` | 0~5 秒分批出怪 |
| `buildWave(stage, playerCount, rng)` | 產生整關敵人實例（含倍率/成長/阻擋區增壓） |

### `src/logic/cardOffer.js`

| 函式 | 職責 |
|---|---|
| `generateOffer(rng, bossStage?, pool?)` | 固定 3 槽位出卡（類型保護/偏強上限/去重） |

### `src/logic/migration.js`

| 函式 | 職責 |
|---|---|
| `needsMigration(data)` | 是否需升版 |
| `migrate(data)` | idempotent migration chain；新版存檔拒讀 |

### `src/logic/playerMovement.js`

| 函式 | 職責 |
|---|---|
| `moveSpeedToTilesPerSecond(moveSpeed, cfg?)` | 移動能力值換算；基準 50 = 5 格/秒 |
| `normalizeMoveInput(input)` | WASD/方向鍵向量正規化，避免斜走比直走快 |
| `movePlayer(player, input, dt, bounds, cfg?)` | 固定 timestep 位移並夾在地圖邊界內 |

### `src/logic/mineGen.js`

| 函式 | 職責 |
|---|---|
| `weightedSample(weights, rng)` | 依權重表抽一個 block key |
| `createMine(mineCfg, rng)` | 生成礦山可見 colCount x rowCount 方塊 |
| `digMineCell(mine, col, row, rng)` | 挖出該格、上方下掉、最上層補新塊 |

### `src/logic/inventory.js`

| 函式 | 職責 |
|---|---|
| `blockWeight/inventoryWeight/distinctCount` | 重量與種類數計算 |
| `canAdd(inv, key, qty, {capacity,slots})` | 承重 + 格數雙重檢查 |
| `addItem/removeItem(inv, key, qty)` | 背包加/扣（回傳新物件） |
| `depositAll(inv, storage)` | 背包全倒入塔內資源欄 |

### `src/logic/drops.js`

| 函式 | 職責 |
|---|---|
| `createDrop(blockKey, x, y)` | 建立掉落物物件 `{ blockKey, x, y }` |
| `collectNearbyDrops(drops, player, inventory, cfg)` | 撿取 Chebyshev ≤ pickupReachTiles 內的掉落物（純函式，回傳 `{ drops, inventory }`） |

### `src/logic/mining.js`

| 函式 | 職責 |
|---|---|
| `hitsToBreak(blockKey, miningPower, defs?)` | 破塊敲擊數（梯子=Infinity 不可挖） |
| `durabilityToBreak(blockKey, defs?)` | 破塊所需總傷害 |
| `miningDamagePerSecond(miningPower, hitsPerSec)` | 每秒挖掘傷害 |
| `selectNearestMineCell(player, mines, reach)` | 選 reach 內離玩家最近的礦格 |

### `src/game/world.js`

| 函式 | 職責 |
|---|---|
| `coreCells(cfg?)` | 回傳核心 2x2 佔用格 |
| `coreCenterTile(cfg?)` | 回傳核心中心 tile 座標 |
| `createWorld(cfg?)` | 建立 MVP world 狀態（核心、目前 HP、地面、礦山方塊、背包、疲勞、塔內資源、初始包、玩家、核心數值快照、鏡頭、clock；demo 結構僅 debug gate 開啟時 seeded） |
| `focusCamera(world, focusTile)` | 鏡頭聚焦指定 tile 並夾在世界邊界內 |
| `updateCameraFollow(world, alpha?)` | 依插值後玩家位置居中跟隨（render 前每幀呼叫） |

### `src/game/actions.js`

| 函式 | 職責 |
|---|---|
| `updateMining(world, isMining, dt, cfg?)` | 長按鎖最近礦格、累積傷害破塊進背包；背包滿改掉落到玩家腳下 |
| `collectDrops(world, cfg?)` | 每 tick 自動撿取玩家附近（Chebyshev ≤ pickupReachTiles）的掉落物 |
| `tryDeposit(world)` | 站在連通泥土上 → 背包自動倒入塔內資源欄 |
| `tryPlace(world, blockKey, x, y, cfg?)` | 消耗塔內資源，放置背景泥土或前景方塊 |
| `tryRemove(world, x, y, cfg?)` | 拆除目標格，前景優先，材料退回塔內資源欄；拆土若會讓核心 HP 歸零則禁止 |
| `computeBuildPreview(world, blockKey, x, y, cfg?)` | 回傳 render 用建造預覽資料與合法性 |
| `damageCore(world, amount)` / `healCore(world, amount)` | 扣除 / 回復核心目前 HP（debug 與後續戰鬥共用） |
| `updateRepair(world, isRepairing, dt, cfg?)` | R 長按修復：站在核心或連通泥土地基上，消耗疲勞回復核心 |
| `toggleBuildPlanMode(world)` | 切換規劃模式（需站在核心地基上）；離開時重置拆除模式 |
| `tryPlaceRect(world, blockKey, x1, y1, x2, y2, cfg?)` | 規劃模式矩形放置：收集合法格→資源預檢→全部放置或全部拒絕；infinite 方塊跳過資源檢查 |
| `tryRemoveRect(world, blockKey, x1, y1, x2, y2, cfg?)` | 規劃模式矩形拆除：僅拆除指定材質的方塊，材料退回塔內 |
| `previewPlaceRect(world, blockKey, x1, y1, x2, y2, cfg?)` | 回傳 `{needed, available, enough}` 供拖拽預覽顯示 |
| `applyDebugAction(world, action, cfg?)` | 開發 debug hotkeys：扣血、回血、補建材、生成敵人 |

### `src/game/coreSnapshot.js`

| 函式 | 職責 |
|---|---|
| `refreshCoreSnapshot(world)` | 從 world.dirt/world.fore 統計方塊並刷新 world.blockCounts / world.coreStats |

### `src/game/combatRuntime.js`

| 函式 | 職責 |
|---|---|
| `spawnDebugEnemies(world, count, enemyKey, cfg?)` | Debug 生成敵人到玩家附近，供核心戰鬥測試 |
| `updateEnemies(world, dt)` | Debug 敵人直線追逐玩家（暫不攻擊） |
| `coreAttackAnchors(world)` | 核心本體 + connected dirt 轉成核心攻擊覆蓋 anchor |
| `updateCoreCombat(world, dt, cfg?)` | 核心按 attackSpeed 普攻/連鎖命中範圍內敵人，死亡移除 |

### `src/game/gameLoop.js`

| 函式 | 職責 |
|---|---|
| `createGameLoop(options)` | 建立 fixed timestep loop；update 固定步進，render 跟螢幕 Hz 分離 |
| `startGameLoop(options)` | 建立並啟動 loop，回傳可 stop 的 loop 物件 |

### `src/storage/saveLocal.js`（IO 層）

| 函式 | 職責 |
|---|---|
| `loadSave(storageKey?)` | localStorage 讀取；預設 GAME_CONFIG.save.storageKey，可傳入測試 key；跑 migration |
| `writeSave(data, storageKey?)` | localStorage 寫入；key 可覆蓋 |
| `clearSave(storageKey?)` | 清除指定 key 的存檔 |

### `src/storage/saveManager.js`（IO 層）

| 函式 | 職責 |
|---|---|
| `saveWorld(world, cfg?)` | 序列化 world 並呼叫 writeSave；透過 `cfg.save?.storageKey` 選正式或測試 key |
| `loadWorld(cfg?)` | 呼叫 loadSave（傳 cfg key）→ migration → deserializeWorld；失敗或無存檔回傳 null |

### `src/render/renderer.js` `src/input/controls.js` `src/input/touchControls.js` `src/ui/mobileLayout.js` `src/main.js`

| 函式 | 職責 |
|---|---|
| `Renderer.render(world)` | 畫地面/網格/礦山方塊/兩層方塊/核心/玩家(插值位置)/敵人小血條/範圍圈/VFX 閃電/建造預覽/核心 HP/疲勞/核心數值 HUD；整數像素平移；同步 debug dataset；`firstGame && tutorialTimer > 0` 時疊加教學提示框；`showDebug` 時疊加 debug 浮層 |
| `Renderer.resize(cfg)` | 視窗縮放後由外部呼叫；更新 `this.t / viewport`；重設 canvas.width/height/style；清除 `_rangeCacheKey` 強制重建範圍圈 cache |
| `Renderer.setSprites(imgs)` | 注入 `Map<key, HTMLImageElement>`（由 main.js 非同步載入後呼叫） |
| `Renderer._drawRangeCircle(world)` | 以 `${range}:${tilePx}:${anchors}` 為 cache key，讀 `coreAttackAnchors(world)` 畫正式攻擊範圍聯集；無 OffscreenCanvas 時 fallback 直接填色 |
| `Renderer._drawVFX(world)` | 讀 `world.vfx.bolts`（攻擊時固定生成的 zigzag points）並繪製；主目標粗藍白，連鎖目標細淡藍；最後 0.2s 淡出 |
| `Renderer._drawLightningBolt(ctx, x1, y1, x2, y2, isPrimary)` | 生成 zigzag 點並雙重描邊（外層光暈 + 內層白核） |
| `Renderer._drawTutorialHint(world)` | 首次遊玩顯示黃色操作提示（prep/night 各顯不同文字，最後 1 秒依 tutorialTimer 淡出） |
| `Renderer._drawDebugOverlay(world)` | 半透明金邊浮層疊在畫布右上角；顯示 debug hotkeys + 即時狀態（tick/phase/stage/testMode/drops/enemies/coreHp）；` 鍵關閉 |
| `loadImages(manifest)` (imageLoader.js) | 非同步批量載入圖片；回傳 `Promise<Map<key, HTMLImageElement>>`；失敗只警告不中斷 |
| `getFrameRect(img, sheet, keyOrIndex)` (sprites.js) | 從 spritesheet 取單幀 `{sx,sy,sw,sh}`，等寬等高均分切割 |
| `Controls.attach/detach` | 綁/解 WASD/方向鍵、滑鼠長按挖礦、快捷列選材（鍵盤+滑鼠點擊）、左鍵放置、右鍵拆除、R 修復、B 規劃模式、V 拆除模式、拖拽放置/拆除、debug hotkeys；canvas 自動 focus |
| `Controls.getMoveVector()` / `Controls.isMining()` / `Controls.getSelectedSlot()` / `Controls.isRepairing()` | 回傳移動向量 / 是否長按挖礦中 / 目前快捷列 / 是否長按修復 |
| `Controls.consumeBuildPlanToggle()` / `consumeDestroyToggle()` / `consumeDragRect()` | 消費規劃模式切換 / 拆除模式切換 / 拖拽矩形（一次性事件） |
| `Controls._hitTestHotbar(mx, my)` | 根據 viewport 尺寸判斷滑鼠是否點擊在快捷列槽位上，回傳槽位索引或 null |
| `TouchControls.attach/detach` | 建立/移除 HTML overlay（D-pad + 動作鍵 + 快捷列 + HTML debug 面板）；canvas touchstart 監聽卡片選擇 |
| `TouchControls.*`（public 介面） | 與 `Controls` 完全相容：`getMoveVector / isMining / isRepairing / getSelectedSlot / setSelectedSlot / consumePlace / consumeRemove / consumeDebugActions / consumeCardChoice` |
| `computeTilePx(cfg, reserveBottomPx?)` | 根據 `window.innerWidth/Height` 和可見格數（首次快取）算出最佳 tilePx；最小 4 |
| `applyTilePx(cfg, tilePx)` | 把 tilePx 寫入 cfg.render.tilePx 並更新 cfg.map.viewportPx（by reference） |
| `isTouchDevice()` | 偵測觸控裝置（ontouchstart / maxTouchPoints） |
| `getSavedInputMode()` / `saveInputMode(mode)` | 讀/寫 `yesmaster.inputMode` localStorage key |
| `setupOrientationGuard()` | 直向時顯示「請轉橫向遊玩」全螢幕遮罩；只在 touch 模式呼叫 |
| `showSplashScreen(onStart)` | 顯示 GOBLIN NEST splash；三排按鈕：難度（正式/測試/多人模式）+ 輸入模式（鍵盤/觸控）；callback `onStart(diffMode, inputMode, netInfo?)` |
| `showAuthScreen(onAuthed)` | 登入 overlay：Google OAuth + 訪客匿名模式；登入後自動建立 profile 並回呼 |
| `showLobby(inputMode, onStart)` | 多人大廳：登入檢查 → 房間列表（公開/朋友/房間號碼 tab）+ 建房 popup + 3 秒 polling |
| `showWaitingRoom(opts)` | 等待室：PeerJS 連線 + 玩家卡片 + 聊天 + 加好友/踢人 + 開始遊戲廣播 |
| `showCharacterPopup(userId)` | 角色面板 popup：查看等級/裝備/賽季稱號 |
| `boot()` | 入口：掛版本號；showSplashScreen(diffMode, inputMode, netInfo?) 後：applyTilePx → new Renderer → 選 Controls/TouchControls → touch 才 setupOrientationGuard → resize 監聽 → 建 world → 掛 ⚙ debug 按鈕 → 啟動 fixed timestep loop；netInfo 存在時重用 WaitingRoom 的 PeerJS session |

### `config/levelConfig.js`

| 函式 | 職責 |
|---|---|
| `LEVEL_CONFIG` | 等級經驗值曲線設定（minLevel/maxLevel/expToNextLevel） |

### `src/game/levelSystem.js`

| 函式 | 職責 |
|---|---|
| `expToNextLevel(level, cfg?)` | 該等級升級所需經驗值 |
| `expForLevel(level, cfg?)` | 到達該等級的累計經驗值 |
| `calcLevel(exp, cfg?)` | 累計經驗值 → 等級 |
| `addExp(currentExp, amount, cfg?)` | 加經驗並回傳新等級/經驗 |
| `calcExpReward(summary, cfg?)` | 遊戲結算經驗計算 |

### `src/game/equipmentSystem.js`

| 函式 | 職責 |
|---|---|
| `getEquipment(userId?, cfg?)` | 查詢玩家五項裝備等級 |
| `upgradeEquipment(userId, slot, cfg?)` | 升級指定裝備（回傳 cost，不扣資源） |
| `applyEquipBonus(baseStats, equipment, cfg?)` | 純函式：裝備加成後的數值 |

### `src/game/achievementSystem.js`

| 函式 | 職責 |
|---|---|
| `checkAchievements(world, profile, defs?)` | 檢查已達成但未解鎖的成就 |
| `unlockAchievement(userId, achievementId, cfg?)` | 解鎖成就寫入 DB |

### `src/game/leaderboardSystem.js`

| 函式 | 職責 |
|---|---|
| `submitScore(wave, score, cfg?)` | 提交排行榜成績 |
| `getLeaderboard(season?, limit?, cfg?)` | 查詢排行榜 |
| `getPlayerRank(userId, season?, cfg?)` | 查詢玩家排名 |
| `getSeasonTitle(rank, totalPlayers, cfg?)` | 依排名百分比回傳賽季稱號 |

### `src/net/authManager.js`

| 函式 | 職責 |
|---|---|
| `signInWithGoogle(cfg?)` | Google OAuth 登入（跳轉） |
| `signInAnonymously(cfg?)` | 匿名訪客登入 |
| `signOut(cfg?)` | 登出 |
| `getCurrentUser(cfg?)` | 取得目前登入使用者 |
| `onAuthStateChange(callback, cfg?)` | 監聽登入狀態變化 |
| `getProfile(userId, cfg?)` | 查詢玩家 profile；用 `.maybeSingle()`，不存在回 `null` 不噴 406 |
| `ensureProfile(user, cfg?)` | 確保 profile 存在；Google 使用者缺失或仍是 `Goblin/default` 時建立/補齊名稱與頭像 |
| `updateProfile(updates, cfg?)` | 更新 profile |

### `src/net/friendManager.js`

| 函式 | 職責 |
|---|---|
| `sendFriendRequest(targetUserId, cfg?)` | 送出好友邀請 |
| `acceptFriendRequest(fromUserId, cfg?)` | 接受好友邀請 |
| `removeFriend(userId, cfg?)` | 刪除好友 |
| `listFriends(cfg?)` | 列出已接受的好友 |
| `listPendingRequests(cfg?)` | 列出待處理的好友邀請（sent + received） |

### `src/net/roomManager.js`（補充）

| 函式 | 職責 |
|---|---|
| `issueRoomJoinToken(params, cfg?)` | 呼叫 Edge Function 申請 join / reconnect 短效 token |
| `verifyRoomJoinToken(token, cfg?)` | 呼叫 Edge Function 驗證 token（nonce consumed） |
| `getRoomMembers(roomId, cfg?)` | 查詢房間成員列表 |
| `kickPlayer(roomId, slotId, cfg?)` | 踢出玩家 |
| `updateHostPeer(roomId, peerId, cfg?)` | Host Migration 後更新 current_host_peer_id |

### `src/net/supabaseClient.js`

| 函式 | 職責 |
|---|---|
| `getSupabaseClient(cfg?)` | 取得 lazy singleton Supabase client（browser only） |
| `ensureSupabaseUser(cfg?)` | 確保已登入（否則匿名登入）；僅用於允許訪客 fallback 的舊功能 |
| `requireSupabaseUser(cfg?)` | 要求已有登入 session；多人房間 / 好友流程使用，沒有登入則丟 `not signed in` |

### `src/net/protocol.js`

| 匯出 | 職責 |
|---|---|
| `MSG` | 訊息類型常數（AUTH / AUTH_OK / AUTH_FAIL / INPUT / SNAPSHOT / DELTA / CHAT / GAME_START / PLAYER_INFO / PING / PONG 等） |
| `makeMessage(type, payload)` | 建立標準訊息物件 |
| `encode(message)` / `decode(raw)` | 序列化 / 反序列化（JSON） |

### `src/net/peerRuntime.js`

| 函式 | 職責 |
|---|---|
| `loadPeerCtor()` | 動態 import PeerJS（esm.sh），lazy singleton |
| `createPeer(cfg?)` | 建立 Peer 實例（套用 cfg.net peerJs 設定） |
| `waitForPeerOpen(peer)` | Promise：等待 peer.open 事件 |

### `src/net/netSession.js`

| 函式 | 職責 |
|---|---|
| `createNetSession(options)` | 依 role（host/client）啟動 peerHost 或 peerClient，回傳統一 session 介面 |
| `parseNetLaunch(search?)` | 解析 URL 參數：mode / role / roomId / token |

### `src/net/peerClient.js`

| 函式 | 職責 |
|---|---|
| `startPeerClient(options)` | 連線到房主 Peer、完成 auth handshake，回傳 client session |

### `src/net/inputBuffer.js`

| 函式 | 職責 |
|---|---|
| `createInputBuffer(options)` | 建立 per-player Input queue；`push(playerId, input)` / `drain(world, dt, onReject)` |
| `serializeControls(controls, world, cfg, sequenceId, extra?)` | Client 端：把 controls 狀態打包成 Input Event |
| `applyInput(world, playerId, input, dt, cfg)` | 單步套用已驗證的 Input 到 world |

### `src/net/stateSync.js`

| 函式 | 職責 |
|---|---|
| `serializeSnapshot(world)` | 全量序列化 world 狀態 |
| `serializeDelta(prevSnapshot, world)` | 差量序列化（玩家 / 敵人 / phase / 戰鬥等動態欄位） |
| `applySnapshot(world, snapshot, cfg?)` | 套用全量 snapshot 到 world |
| `applyDelta(world, delta, cfg?)` | 套用差量（syncTick 舊的自動忽略） |

### `src/net/syncScheduler.js`

| 函式 | 職責 |
|---|---|
| `createHostSyncScheduler(options)` | 回傳 `{ afterHostTick(world) }`：每幀廣播 delta，每 5s 強制 full snapshot |
| `createClientSyncApplier(options)` | 回傳 `{ handle(message) }`：處理 SNAPSHOT / DELTA 訊息 |

### `src/net/validation.js`

| 函式 | 職責 |
|---|---|
| `createInputValidator(options)` | 回傳驗證函式：檢查 sequenceId / move / action 合法性（place/remove/deposit 等） |

### `src/net/strikeTracker.js`

| 函式 | 職責 |
|---|---|
| `createStrikeTracker(options?)` | 回傳 `{ add(key, reason), get(key), reset(key) }`；add 達 maxStrikes 回傳 `kicked:true` |

### `src/net/reconnect.js`

| 函式 | 職責 |
|---|---|
| `createReconnectController(options)` | 回傳 `{ schedule(), cancel(), reconnect() }`：grace 期後自動申請 reconnect token |

### `src/net/hostMigration.js`

| 函式 | 職責 |
|---|---|
| `createHostMigrationController(options)` | 回傳 `{ check() }`：偵測到房主斷線後執行 CAS 更新 |

### `src/ui/uiState.js`

| 函式 | 職責 |
|---|---|
| `ensureUiState(world)` | 初始化 world.uiState（各面板 expanded 狀態） |
| `applyUiClick(world, uiClick)` | 處理 playerPanel / corePanel 點擊切換 |
