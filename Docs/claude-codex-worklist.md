# Claude ↔ Codex MVP 開工協作清單
> 狀態：MVP 實作中（v0.0.14.1）
> 最後更新：2026-06-26
> 用途：單一交接看板。Claude 負責架構/純邏輯/骨架；Codex 負責數值/平衡填表。
> 規則：**config/ 檔案就是雙方的交接介面**。Codex 把數值填進 config，Claude 的純邏輯層消費，互不踩線。

---

## 0. 一眼看懂分工

| 方 | 負責 | 產出位置 |
|---|---|---|
| **Claude** | 三維度地圖、連通性、核心戰鬥、波次/卡片邏輯、存檔、渲染/輸入 | `src/` + `config/` 的「結構」 |
| **Codex** | 敵人基礎數值、怪物移速、資源卡換算、21-30 seed | 把數字填進 `config/` 已留好的 TODO 欄位 |

> Codex 不需要碰 `src/`。只要把 `config/` 裡標 `// TODO(Codex)` 的 `null` 填成數字即可。
> 純邏輯規則見 `.claude/instructions.md` 鐵則 9 與 `Docs/game-architecture-plan.md`「程式碼分層原則」。

---

## 1. Codex 任務清單（標 🔴 = 擋實作，先做）

### A. 敵人基礎數值正式表 ✅ 已填

**檔案**：`config/enemies.js`
**現況**：結構已建好；`身高 / 攻擊距離 / 防禦` 我已依設計文件預填，**`hp / attack / moveSpeed` 是 `null`，等你填**。

要填的欄位（每種敵人都要）：

| 敵人 key | 待填 | 已預填（勿改，除非要改設計） |
|---|---|---|
| `civilian`（平民） | `hp` `attack` `moveSpeed` | height 2, attackRange 1, defense 0 |
| `runner`（跑者） | `hp` `attack` `moveSpeed` | height 3, attackRange 1, defense 0 |
| `brute`（猛男） | `hp` `attack` `moveSpeed` | height 3, attackRange 1, defense 0 |
| `shielder`（盾兵） | `hp` `attack` `moveSpeed` | height 3, attackRange 1, defense 30 |
| `sapper`（工兵） | `hp` `attack` `moveSpeed` `attackRange` | height 3（遠程，attackRange 可能 >1，請一併定） |
| `boss10`（小隊長） | `hp` `attack` `moveSpeed` | height 4, attackRange 1 |
| `boss20` | `hp` `moveSpeed` | height 4, attackRange 2, attack 6（已定，多人門檻見 waveplan） |
| `boss30` | `hp` `attack` `moveSpeed` | height 4, attackRange 2 |

**唯一基準**：`Docs/waveplan.md` 的「敵人成長規則」+ `Docs/simulation/simulation-log-2.md` 的測試基準。
**注意**：請給「**第 1-10 關不成長**」的基礎值；11-20 成長、21-30 增壓由我的 `waveGen` 程式自動套（你只給 base，不要把成長乘進去）。

### B. 怪物移動速度定案 ✅ 已填

**檔案**：同上 `config/enemies.js` 每隻的 `moveSpeed`（格/秒）。
**現況**：設計文件目前假設 5 格/秒（玩家基礎移速），標 ⚠️ 未定案。請逐隻確認（跑者應該比平民快）。

### C. 資源型卡片「挖掘量數」→ 實際方塊數量 ✅ 已填

**檔案**：`config/cards.js`，8 張資源型卡片的 `effect.grant` 目前是 `null`。
**要做**：把「2000 挖掘量數」換算成各方塊實際給幾顆（例：土耐久 50 → 2000/50 = 40 顆土？換算公式由你定）。
**牽涉卡片**：老礦工手感、右礦通行證、土倉補給、鐵石補強、沙眼備料（含偏向的方塊種類比例）。

### D. 21-30 阻擋區固定 seed ✅ 已填

**檔案**：`config/waves.js` 的 `blockerBand.seed`（目前 `null`）。
**要做**：釘一個固定整數 seed，讓 +15~25% 血、+10~20% 攻的隨機序列可重現（waveplan.md:192 要求）。

---

---

## 1B. Step 7 Codex 任務（🔴 = 必做，可動 `src/`）

> 與 1 不同：Step 7 任務需要修改 `src/`。架構/骨架 Claude 已建好，Codex 填入實作。

### Step 7A（出怪 + 晝夜狀態機）— 全部先做完再測

#### ① `_buildPendingSpawns`（`src/game/phaseRuntime.js`）
把 `buildWave` 的 `{ enemies, schedule }` 組成出怪佇列：
- `schedule` 是 `[{ second: N, count: M }]`（0~4 秒分 5 批）
- 依 schedule 把 `wave.enemies` 切成批次，每批取 `count` 隻
- 用 `spawnPositions(count, world, cfg, rng)` 取得每隻的 `{ x, y }`
- 把 `x, y` 合入 enemy def，組成 `{ atSecond, defs: [{...enemy, x, y}] }`
- 函式簽名、骨架、TODO 註解見 phaseRuntime.js 中的 `_buildPendingSpawns`

#### ② 夜晚分批出怪（`src/game/phaseRuntime.js`，`_updateNight` 內）
- 每幀取 `world.pendingSpawns` 中 `atSecond <= world.nightElapsed` 的批次
- 把 def push 成完整 enemy 物件到 `world.enemies`（格式見 phaseRuntime.js TODO 範例）
- 取出後從 `world.pendingSpawns` 刪除
- 骨架 + 偽碼已在 `_updateNight` 的 TODO 註解內

#### ③ 礦山避讓（`src/logic/spawnPosition.js`）
- 若 x 落在任一 mineZone `[min, max]` 內 → 往外推到 `min-1` 或 `max+1`
- TODO 位置與偽碼已在 `spawnPositions` 的 TODO 註解內

#### ④ 怪物改追核心（`src/game/combatRuntime.js`，`updateEnemies`）
目前怪追 `world.player`，要改成追最近核心格（`world.core` 陣列，每格 `[cx, cy]`）：
- 找 `world.core` 中距離 enemy 最近的格
- 移向該格；到達 `enemy.attackRange` 格內時停止移動、轉為攻擊

#### ⑤ 怪物攻擊核心（`src/game/combatRuntime.js`，`updateEnemies`）
- 每隻 enemy 在 `createEnemy` 初始化時加 `attackCooldown: 0`
- `updateEnemies` 中若距最近核心格 `<= enemy.attackRange` → 不移動
  - `enemy.attackCooldown -= dt`
  - `<= 0` 時呼叫 `_applyCoreDamage(world, enemy.attack * (world.combat?.overtimeMultiplier ?? 1))`
  - 重設 `enemy.attackCooldown = 2`（2 秒攻一次，見 waveplan.md）
- 需在 combatRuntime.js 頂部加：
  ```js
  import { damageCoreHp } from '../logic/coreHealth.js';
  function _applyCoreDamage(world, amount) {
    world.coreHp = damageCoreHp(world.coreHp ?? world.coreStats?.hpMax ?? 0, amount);
    if (world.coreHp <= 0) world.phase = 'gameover';
  }
  ```

### Step 7B（HUD + gameover/waveClear 畫面）— 7A 完成後做

#### ⑥ Phase / 波次 HUD（`src/render/renderer.js`，`_drawHud`）
在 HUD 最上方加一行，例：
- prep：`第 N 關　準備中（N.N s）　按 N 鍵開始夜晚`
- night：`第 N 關　夜晚 N.N s　敵人剩 M 隻`
- overtime：`加時 N.N s ⚠️　攻擊 xM 倍　敵人剩 M 隻`
- gameover：`GAME OVER　第 N 關　按 Q 重試`
- waveClear：只靠 phase=prep + stage 更新自動顯示，不需額外狀態

#### ⑦ gameover 全畫面遮罩（`src/render/renderer.js`，`render` 主函式）
- `world.phase === 'gameover'` 時，正常渲染後疊加半透明黑底 + 大字「GAME OVER」
- 不需要 HTML/CSS，直接用 canvas ctx 畫

---

### 完成後驗收（Codex 自查）

1. N 鍵 → 立即開始夜晚，怪物從地圖左右兩側出現、走向核心
2. 怪抵達核心附近 → 核心 HP 下降（HUD 可見）
3. 打完敵人 → stage++ → 回到 prep（HUD 顯示新關卡）
4. 核心 HP 歸零 → GAME OVER 遮罩
5. Q 鍵 → 清敵人、reset 到 prep、stage 不變（debug restart）
6. 加時賽期間 HUD 顯示 overtimeMultiplier 倍數
7. `node tests/` 全過（新加 spawnPosition / phaseRuntime 的 Node 測試）

---

## 2. Claude 任務進度（你不用管，給你對齊用）

| 步驟 | 狀態 |
|---|---|
| 1. config/gameConfig + 版本欄位 | ✅ |
| 2. 地圖/鏡頭/三維度座標 | ✅ 畫面骨架完成（world 狀態 + camera + 兩層 canvas render） |
| 3. 挖礦/背包/塔內資源 | ✅ 移動+滑鼠長按挖最近礦格→背包(承重/格數雙限)→站連通泥土自動入塔內；初始資源包入塔內；礦山10x3生成+補位；HUD 顯示。純邏輯：mineGen/inventory/mining |
| 4. 建造 + 連通性 BFS（`connectivity`） | ✅ 純邏輯完成 |
| 5. 核心數值換算（`coreStats`） | ✅ 純邏輯完成 |
| 6. 核心戰鬥（普攻/連鎖/傷害） | ✅ 純邏輯完成（消費 enemies.js，等 Codex A 填數才能跑） |
| 7. 波次/晝夜/加時（`waveGen`） | ✅ phaseRuntime / spawnPosition / waveGen / combatRuntime 全實作完成（v0.0.3.0） |
| 8. 王關/卡片（`cardOffer`） | ✅ cardOffer / cardEffect / resolveCardOffer 全實作完成（v0.0.4.0） |
| 9. 教學/localStorage 存檔 | ✅ saveManager / 新手教學提示 / GOBLIN NEST splash 完成（v0.0.5.0） |
| 10A. 掉落物系統（Claude） | ✅ drops.js 純函式 / collectDrops / updateMining 掉落邏輯 / renderer _drawDrops / saveManager 序列化（v0.0.6.0） |
| 10B. 卡片 UI polish（Codex） | ✅ _drawCardPanel hover glow + tier 中文化（稀有/普通/基礎）+ 版面精調（v0.0.6.0） |
| 11A. HUD 底部左右分欄（Codex） | ✅ `_drawHud` 左欄（核心/背包/資源/已放置）+ 右欄（phase/操作/疲勞/敵人/狀態），高度縮至 ~86px，中間細分隔線（v0.0.7.1） |
| 11B. Debug 浮層（Claude） | ✅ ` 鍵切換 showDebug → `_drawDebugOverlay` 右上角疊加；hotkeys + 即時狀態（v0.0.7.0） |
| 11C. 測試難度 preset（Claude） | ✅ `config/testPreset.js` + splash 兩按鈕 + saveLocal/saveManager key 參數化 + _testInit 強化注入（v0.0.7.0） |
| 12. 手機操作 UI | ✅ v0.0.8.0 已接入並完成三欄手機 layout：左 HUD+D-pad、中 canvas+1~0 快捷列、右 Debug Tool+動作鍵；仍需實機校準尺寸與手感 |
| 13. PWA / 加入主畫面支援 | 🔲 後排任務：本輪不做。後續再補 manifest、icon、apple mobile web app meta、加入主畫面提示、Android install prompt 檢查 |

---

## 1C. Codex 任務：Spritesheet 裁剪（Python PIL，v0.0.12.0）

> Claude 已完成命名（assets/ 已整理）與程式碼整合（方塊 hotbar 圖示直接讀原始 sheet）。
> Codex 已使用 Python + Pillow 完成裁剪，共輸出 52 張 PNG；方塊 sheet 仍由程式碼直接切幀。

### 裁剪規則

每個 spritesheet 以等寬等高格均分，行列從左上角開始。
輸出路徑需 **創建目錄**（`os.makedirs(..., exist_ok=True)`）。

### 任務清單

#### ① 敵人 spritesheet（3 列 × 4 幀）- ✅ 已完成
```
輸入：assets/spritesheet_enemies_shield-muscle-leader_3row4col.png
輸出目錄：assets/enemies/
裁剪：3 列 × 4 幀，均等切割
  row0 → shield_walk_f0.png ~ shield_walk_f3.png
  row1 → muscle_walk_f0.png ~ muscle_walk_f3.png
  row2 → leader_walk_f0.png ~ leader_walk_f3.png
```

#### ② 哥布林 spritesheet（3 列 × 4 幀）- ✅ 已完成
```
輸入：assets/spritesheet_goblin_3row4col_walk-walk-mine.png
輸出目錄：assets/characters/goblin/
裁剪：3 列 × 4 幀
  row0 → goblin_walk_right_f0.png ~ goblin_walk_right_f3.png
  row1 → goblin_walk_left_f0.png  ~ goblin_walk_left_f3.png
  row2 → goblin_mine_f0.png       ~ goblin_mine_f3.png
```

#### ③ 核心球 spritesheet（3 列 × 4 幀）- ✅ 已完成
```
輸入：assets/spritesheet_core_orb_3row4col_normal-hit-lowhp.png
輸出目錄：assets/core/
裁剪：3 列 × 4 幀
  row0 → core_normal_f0.png ~ core_normal_f3.png
  row1 → core_hit_f0.png    ~ core_hit_f3.png
  row2 → core_lowhp_f0.png  ~ core_lowhp_f3.png
```

#### ④ 平民敵人 spritesheet（2 列 × 2 行 = 4 幀）- ✅ 已完成
```
輸入：assets/spritesheet_enemy_civilian_2x2_walk.png
輸出目錄：assets/enemies/
裁剪：2 列 × 2 行，依橫向順序
  → civilian_walk_f0.png ~ civilian_walk_f3.png
```

#### ⑤ UI 圖示 spritesheet（4 欄 × 3 列 = 12 圖示）- ✅ 已完成
```
輸入：assets/spritesheet_ui_icons_12pack_4x3grid.png
輸出目錄：assets/ui/
裁剪：4 欄 × 3 列，依橫向順序
  row0: icon_gold-coin.png, icon_silver-coin.png, icon_diamond-gem.png, icon_ticket.png
  row1: icon_settings-gear.png, icon_trophy.png, icon_handshake.png, icon_backpack.png
  row2: icon_slot-empty.png, icon_slot-selected.png, icon_crown.png, icon_red-dot.png
```

> **注意**：方塊 spritesheet（`spritesheet_blocks_9tiles_noframe.png` / `_slotframe.png`）
> **不需裁剪**，程式碼直接以 `drawImage + getFrameRect()` 讀原始 sheet。

### 完成狀態

1. 已在本節各任務後標注「✅ 已完成」
2. 已更新 `assets/icon-status.md` 對應欄位狀態 🔲 → ✅

---

## 2B. M0 Multiplayer Lobby / WaitingRoom 整合追蹤 Plan

> 來源整合：`Docs/integration-plan.md`、`Docs/lobby-waitingroom-plan.md`、`Docs/multiplayer-implementation-plan.md`、v0.0.14.0 實作審查。
> 狀態標記：✅ 已可用 / 🟡 部分完成 / 🔴 阻塞或必修 / 🔲 未做 / 🧪 需要瀏覽器或 Supabase 實測。

### M0 總結

目前 v0.0.14.0 已有多人入口、登入 overlay、大廳 UI、等待室 UI、PeerJS 聊天骨架、部分 Supabase Edge Functions 與 Phase B-F 模組；但「正式帳號註冊、房間設定閉環、房間密碼、安全 token、WaitingRoom→遊戲 netSession 傳遞、client 權威同步」仍未完成。M0 不能視為完成，應拆成下列可追蹤項目逐一修。

### M0A. 帳號 / Auth / Profile

| # | 項目 | 實作現況 | 狀態 | 下一步 |
|---|---|---|---|---|
| M0A-1 | Google OAuth 登入 | `src/ui/authScreen.js` 有 Google 登入按鈕；`authManager.signInWithGoogle()` 已接 Supabase OAuth | 🟡 部分完成 | 🧪 需線上 Supabase + Chrome 驗 Google 回跳與 session persist |
| M0A-2 | 訪客模式 | UI 有「訪客模式」並呼叫 anonymous sign-in；本地 `supabase/config.toml` 已開啟 anonymous | 🟡 部分完成 | 🧪 線上 Supabase Dashboard 也需開啟 Anonymous provider |
| M0A-3 | Email 註冊 / 登入 | `lobby-waitingroom-plan.md` Phase A 要求 Email 登入/註冊；目前沒有 `signUp` / `signInWithPassword` UI | 🔲 未做 | 新增 email/password 註冊、登入、錯誤提示、回到 Lobby |
| M0A-4 | player_profiles 自動建立 | `ensureProfile(user)` 已在登入後呼叫，會 insert profile | 🟡 部分完成 | 🧪 需 DB/RLS 驗證 insert/select/update 權限 |
| M0A-5 | Profile DB migration / RLS | 計畫文件有 SQL；repo 目前沒有完整 migration，只看到局部 SQL/seed | 🔴 阻塞 | 補正式 migration：`player_profiles` + RLS policy |

### M0B-F. 等級 / 好友 / 裝備 / 成就 / 排行榜

| # | 項目 | 實作現況 | 狀態 | 下一步 |
|---|---|---|---|---|
| M0B | 等級系統 | `config/levelConfig.js`、`src/game/levelSystem.js` 已存在 | 🟡 部分完成 | 補結算寫回 profile 的整合測試 |
| M0C | 好友系統 | `src/net/friendManager.js`、等待室加好友按鈕已存在 | 🟡 部分完成 | 補 friendships migration/RLS；補接受好友 UI 或流程 |
| M0D | 裝備系統 | `config/equipmentConfig.js`、`src/game/equipmentSystem.js`、角色面板讀取已存在 | 🟡 部分完成 | 補 `player_equipment` migration/RLS；補升級入口或標記為後續功能 |
| M0E | 成就系統 | `config/achievements.js`、`src/game/achievementSystem.js`、`supabase/seed_achievements.sql` 已存在 | 🟡 部分完成 | 補 `achievements/player_achievements` migration/RLS；補解鎖寫回驗證 |
| M0F | 排行榜 + 賽季稱號 | `config/seasonConfig.js`、`src/game/leaderboardSystem.js`、角色面板讀取已存在 | 🟡 部分完成 | 補 leaderboard migration/RLS；補提交分數時機與測試 |

### M0G. 房間 DB / Edge Functions / 安全

| # | 項目 | 實作現況 | 狀態 | 下一步 |
|---|---|---|---|---|
| M0G-1 | rooms / memberships 基礎表 | `Docs/multiplayer-implementation-plan.md` 要求完整 schema；repo 目前只有 `alter_rooms_phase_g.sql` 局部補欄位 | 🔴 阻塞 | 補完整 migration：`rooms`、`room_memberships`、`consumed_nonces`、索引、RLS |
| M0G-2 | create-room Edge Function | 已支援 name/max_players/password_hash/has_password/min_level/difficulty/visibility/current_players，新建房不再寫明文 password | 🟡 部分完成 | 補欄位驗證與 visibility constraint；🧪 需部署後驗 Edge Function payload |
| M0G-3 | join-room Edge Function | 已檢查 hash/舊明文密碼 fallback、等級、人數上限、game_started，並 upsert membership | 🟡 部分完成 | 補 private/friends visibility 邏輯；🧪 需 Supabase 驗錯密碼/滿房/等級不足 |
| M0G-4 | 房間密碼安全 | 新建房間已改寫 `password_hash/has_password`；join-room 支援 hash 驗證與舊明文 fallback | 🟡 部分完成 | 🧪 需部署 Edge Function + SQL 後驗密碼房 |
| M0G-5 | room_join_token 安全 | `issue-room-join-token` / `verify-room-join-token` 已要求 membership 存在 | 🟡 部分完成 | 🧪 需 Supabase 實測非成員不能取 token |
| M0G-6 | kick-player Edge Function | 已新增 `kick-player`，UI 改呼叫 roomManager `kickPlayer()` | 🟡 部分完成 | 🧪 需雙瀏覽器驗 host 踢人與人數同步 |
| M0G-7 | leave-room / current_players | 已新增 `leave-room`，WaitingRoom 退出改呼叫 roomManager `leaveRoom()` | 🟡 部分完成 | 🧪 需驗 host/client 退出與房間狀態 |
| M0G-8 | start-room / game_started | 已新增 `start-room`，host 開始遊戲前寫 `game_started=true` | 🟡 部分完成 | 🧪 需驗開始後房間不再出現在列表 |

> 2026-06-26 live test note: frontend flow can reach Auth, Lobby, create-room, WaitingRoom, and PeerJS host setup. Online Supabase is not yet deployed with this round's SQL / Edge Functions: missing `rooms.current_players`, `rooms.has_password`, `room_memberships.role`, `room_memberships.is_host`; `start-room` preflight fails. Frontend fallbacks are in place for old schema, but full P0/P1 acceptance requires deploying SQL + Edge Functions.

### M0H. Lobby UI

| # | 項目 | 實作現況 | 狀態 | 下一步 |
|---|---|---|---|---|
| M0H-1 | Splash 多人入口 | `src/ui/splash.js` 已新增「多人模式」按鈕 | ✅ 已做 | 🧪 瀏覽器檢查入口與返回流程 |
| M0H-2 | Lobby overlay / 三 tab | `src/ui/lobby.js` 有公開/朋友/房間號碼 tab 與 3 秒 polling；`listRooms()` 已只列 public、未開始、未滿房 | 🟡 部分完成 | 🧪 瀏覽器驗 tab 切換與輪詢；後續改掉 alert 錯誤提示 |
| M0H-3 | 朋友 tab | 已用 `listFriends()` 過濾 owner_id | 🟡 部分完成 | 依 friendships/RLS 實測；若未有接受好友 UI，朋友 tab 很難形成資料 |
| M0H-4 | 房間 ID 加入 | 已改為傳 `joinRoom({ room_id, password })` | 🟡 部分完成 | 🧪 需 Supabase 驗正確/錯誤密碼 |
| M0H-5 | 公開列表加入密碼房 | 已依 `has_password` 彈出密碼輸入，並顯示 lock 標記 | 🟡 部分完成 | 🧪 需部署 `has_password` 欄位後驗證 |
| M0H-6 | 建房 popup | 已補密碼、最低等級、visibility、difficulty 並傳給 createRoom | 🟡 部分完成 | 🧪 需瀏覽器檢查 UI 與 Edge payload |
| M0H-7 | 房間列表資訊 | 顯示人數、名稱、等級限制、難度 | 🟡 部分完成 | 補房主名稱、鎖房、已開始/滿房 disable、錯誤提示不用 alert |

### M0I. Waiting Room UI

| # | 項目 | 實作現況 | 狀態 | 下一步 |
|---|---|---|---|---|
| M0I-1 | 玩家 slot 卡片 | `waitingRoom.js` 已依 `max_players` render slot、host crown、等級 | 🟡 部分完成 | 🧪 需建 2/3/4 人房檢查 slot 數量 |
| M0I-2 | PeerJS 聊天 | WaitingRoom 建 host/client session，CHAT host relay | 🟡 部分完成 | 🧪 需雙瀏覽器測聊天；避免 host 自己重複顯示訊息 |
| M0I-3 | 角色面板 | `characterPopup.js` 已讀 profile/equipment/rank | 🟡 部分完成 | 補六數值顯示；DB/RLS 實測 |
| M0I-4 | 加好友 | 綠色按鈕呼叫 `sendFriendRequest()` | 🟡 部分完成 | 補自加好友防呆、已是好友/已 pending 顯示、接受好友流程 |
| M0I-5 | 踢人 | UI 已改走 `kickPlayer()` Edge Function，仍會透過 PeerJS 發 KICK | 🟡 部分完成 | 🧪 需雙瀏覽器驗證 |
| M0I-6 | 退出房間 | UI 已改走 `leaveRoom()` Edge Function；host 退出會關閉房間 | 🟡 部分完成 | 🧪 需驗 host/client 退出 |
| M0I-7 | 開始遊戲 | host 已先呼叫 `startRoom()`，成功後才 broadcast GAME_START | 🟡 部分完成 | 🧪 需雙瀏覽器驗證 |
| M0I-8 | netSession 傳遞 | `_launchGame()` 已設定 `_keepAlive`，main.js 會 reuse WaitingRoom session | 🟡 部分完成 | 🧪 需雙瀏覽器驗證 session 未重建 |

### M0J. main.js / 多人遊戲內整合

| # | 項目 | 實作現況 | 狀態 | 下一步 |
|---|---|---|---|---|
| M0J-1 | onStart 第三參數 netInfo | `world.roomId` 已改用 `netInfo?.roomId ?? netLaunch.roomId` | 🟡 部分完成 | 🧪 需從 Lobby 進遊戲驗 world.roomId |
| M0J-2 | WaitingRoom netSession reuse | main reuse 分支已重新掛 host input / client state sync callback | 🟡 部分完成 | 🧪 需雙瀏覽器驗不重建 session |
| M0J-3 | Client 更新分支 | client 判斷已改用合併後 `netRole` | 🟡 部分完成 | 🧪 需驗 client 不跑本地權威 update |
| M0J-4 | Host sync / client sync | `syncScheduler`、`stateSync` 已有 | 🟡 部分完成 | 🧪 雙瀏覽器測 host 建造/波次/client 同步 |
| M0J-5 | 多人 gameplay 完整 session | 有 inputBuffer、stateSync、world.players 基礎 | 🟡 部分完成 | 需 2 人實測：移動、挖礦、建造、夜晚、卡片、存檔 |

### M0 修復順序

1. **P0：可進房與可開始遊戲**
   - 修 `joinRoom` 密碼傳遞、建房欄位、`netSession` 保留、`main.js netRole`、`world.roomId`。
   - 新增 `startRoom()` 或最小 Edge Function，開始遊戲時寫 `game_started=true`。

2. **P1：房間安全與資料一致**
   - 修 token 必須檢查 membership。
   - 新增/改用 `kick-player`、`leave-room`，重算 `current_players`。
   - `listRooms()` 過濾已開始、滿房、非 public 房間。

3. **P2：正式帳號與 DB/RLS**
   - 補完整 Supabase migrations：profiles/friendships/equipment/achievements/leaderboard/rooms/memberships/consumed_nonces。
   - 實作 Email 註冊/登入；決定 Anonymous Auth 是否保留。

4. **P3：Phase B-F 實際閉環**
   - 驗證等級/好友/裝備/成就/排行榜 DB 寫回。
   - 補 UI 缺口：接受好友、裝備升級、結算提交。

5. **P4：多人長線功能**
   - Host Migration、斷線重連、房間清理、nonce 清理、多人 Supabase 存檔。

### M0 可測項目

| 測試 | 是否需要 Chrome / Supabase | 目標 |
|---|---|---|
| Node import smoke / unit tests | 否 | 確認新增函式不破壞現有 module import |
| `joinRoom` payload / roomManager API mock | 否 | 確認 password、startRoom、kick/leave payload 正確 |
| Splash → Lobby UI | 是，Chrome | 確認多人入口、返回、三 tab 不報錯 |
| Google OAuth / Anonymous Auth | 是，Chrome + Supabase | 確認 session、profile 建立 |
| 建房 / 密碼房 / 滿房 / 等級不足 | 是，Chrome + Supabase | 驗 Edge Function 行為 |
| WaitingRoom 聊天 / KICK / GAME_START | 是，雙瀏覽器 | 驗 PeerJS 與等待室互動 |
| 遊戲內 state sync | 是，雙瀏覽器 | 驗 client 不跑本地權威邏輯、只套 host state |

### M1-M7 後續多人項目

| # | 項目 | 說明 | 狀態 |
|---|---|---|---|
| M1 | Supabase 房間自動清理 | `active` 超過 24h 沒人連 → 標 `completed`；`completed` 超過 24h → 刪除（CASCADE 帶走 memberships）。可用 Edge Function cron 或 pg_cron 實作 | 🔲 待做 |
| M2 | consumed_nonces 定期清理 | 免費方案無 pg_cron，需 Edge Function 或手動清 `consumed_at` 超過 5 分鐘的 nonce | 🔲 待做 |
| M3 | 拆除模式僅限房主 | 多人連線後需加權限策略；目前規劃模式/拆除模式仍需確認誰可用 | 🔲 待做 |
| M4 | Host Migration + 斷線重連 | Phase 6：偵測 host 掉線 → join_order 選候選 → CAS 更新 DB → 新 host 初始化；3 秒 grace timer + reconnect token 綁 slot | 🔲 待做 |
| M5 | 反作弊驗證 | Phase 7：方向制移動、rate limit、sequence_id 單調、庫存檢查、連通性 BFS、距離檢查、strike 系統 | 🟡 部分完成 |
| M6 | 多人存檔改為 Supabase | 目前多人仍偏 localStorage / host 本地；正式版需 Supabase active save 或結算存檔策略 | 🔲 待討論 |
| M7 | Anonymous Auth 改正式帳號 | 目前 UI 有 Anonymous，但正式身份仍應支援 email/OAuth 綁定 | 🔲 待討論 |

> M0 的具體修復以本節為準；舊 `Docs/integration-plan.md` 目前只能視為歷史整合草稿，不再代表完成狀態。

---

## 3. 交接約定

- Codex 改 `config/` 數值 **不需** 動 `src/`、不需動版本號。
- 填完一項，把本檔第 1 節該項打勾並註明「已填」。
- 若發現結構不夠用（缺欄位）→ 在本檔留言，Claude 調 config 結構，不要自己改 `src/` 邏輯。
- 數值定案後，Codex 同步回 `Docs/waveplan.md` / `Docs/bosscard.md`（數值主檔），本檔只是交接看板。
