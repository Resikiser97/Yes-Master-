# Claude ↔ Codex MVP 開工協作清單
> 狀態：MVP 實作中（v0.0.19.0）
> 最後更新：2026-06-28
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

### Step 7A（出怪 + 晝夜狀態機）✅ 已實作完成 — 全部先做完再測

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

### Step 7B（HUD + gameover/waveClear 畫面）✅ 已實作完成 — 7A 完成後做

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
| 14. UI / 意圖 / 核心戰鬥收尾 | ✅ v0.0.15.0 完成：手機 📣 意圖選單、manualIntent 同步、波次情報展開、核心 magicPct 站位限制、核心優先打攻擊中的低血敵人、HUD 密度整理 |

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
| M0A-1 | Google OAuth 登入 | `src/ui/authScreen.js` 有 Google 登入按鈕；Supabase Auth `site_url` 已對齊 Vercel；live Vercel 已驗證 Google callback 可回正式站 | ✅ 已可用 | 後續補正式 sign-out / account menu |
| M0A-2 | 訪客模式 | UI 仍有「訪客模式」並呼叫 anonymous sign-in；但多人房間 / 好友流程已改用 `requireSupabaseUser()`，不再底層靜默建立 anonymous guest | 🟡 部分完成 | 決定正式版是否保留手動訪客入口，或只允許單機/測試使用 |
| M0A-3 | Email 註冊 / 登入 | `lobby-waitingroom-plan.md` Phase A 要求 Email 登入/註冊；目前沒有 `signUp` / `signInWithPassword` UI | 🔲 未做 | 新增 email/password 註冊、登入、錯誤提示、回到 Lobby |
| M0A-4 | player_profiles 自動建立 | `ensureProfile(user)` 已在登入後呼叫；`getProfile()` 改 `.maybeSingle()`；Google 使用者缺 profile 或仍是 `Goblin/default` 時會建立/補齊名稱與頭像 | ✅ 已可用 | 補 automated auth/profile regression test（需 mock Supabase client） |
| M0A-5 | Profile DB migration / RLS | 線上 DB 已確認 `player_profiles` 欄位與 RLS policy（select true / insert auth.uid=user_id / update auth.uid=user_id）可用；repo 仍缺正式完整 migration | 🟡 部分完成 | 補正式 migration：`player_profiles` + RLS policy，避免只靠線上既有狀態 |

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
| M0G-1 | rooms / memberships 基礎表 | `alter_rooms_phase_g.sql` 與 `supabase/migrations/20260626_phase_g_room_columns.sql` 已部署到線上；Lobby / WaitingRoom 所需欄位已驗證存在；完整 `consumed_nonces`、索引、RLS 仍屬 P2 | 🟡 部分完成 | 後續補完整 P2 migration/RLS |
| M0G-2 | create-room Edge Function | 已部署並 live 驗證 name/max_players/password/password_hash/has_password/min_level/difficulty/visibility/current_players payload；新建房不再寫明文 password | ✅ 已可用 | 後續補 visibility constraint / private-friends 規則 |
| M0G-3 | join-room Edge Function | 已檢查 hash/舊明文密碼 fallback、等級、人數上限、game_started，並 upsert membership | 🟡 部分完成 | 補 private/friends visibility 邏輯；🧪 需 Supabase 驗錯密碼/滿房/等級不足 |
| M0G-4 | 房間密碼安全 | SQL + Edge Functions 已部署；新建密碼房 live 驗證 `has_password=true`，join-room 支援 hash 驗證與舊明文 fallback | 🟡 部分完成 | 🧪 仍需雙瀏覽器驗正確/錯誤密碼加入 |
| M0G-5 | room_join_token 安全 | `issue-room-join-token` / `verify-room-join-token` 已要求 membership 存在 | 🟡 部分完成 | 🧪 需 Supabase 實測非成員不能取 token |
| M0G-6 | kick-player Edge Function | 已新增 `kick-player`，UI 改呼叫 roomManager `kickPlayer()` | 🟡 部分完成 | 🧪 需雙瀏覽器驗 host 踢人與人數同步 |
| M0G-7 | leave-room / current_players | 已新增 `leave-room`，WaitingRoom 退出改呼叫 roomManager `leaveRoom()` | 🟡 部分完成 | 🧪 需驗 host/client 退出與房間狀態 |
| M0G-8 | start-room / game_started | `start-room` 已部署；host live 驗證開始遊戲成功，response `game_started=true` 並進入遊戲 | ✅ 已可用 | 🧪 雙瀏覽器 GAME_START 廣播仍待驗 |

> 2026-06-26 live test note: frontend flow can reach Auth, Lobby, create-room, WaitingRoom, and PeerJS host setup. Online Supabase is not yet deployed with this round's SQL / Edge Functions: missing `rooms.current_players`, `rooms.has_password`, `room_memberships.role`, `room_memberships.is_host`; `start-room` preflight fails. Frontend fallbacks are in place for old schema, but full P0/P1 acceptance requires deploying SQL + Edge Functions.
>
> 2026-06-26 deploy prep note: local SQL now includes the missing `rooms.current_players`, `room_memberships.role`, and `room_memberships.is_host` columns in both `supabase/alter_rooms_phase_g.sql` and the formal migration `supabase/migrations/20260626_phase_g_room_columns.sql`. Remaining work is Supabase CLI deploy, secrets setup, live Playwright acceptance, and cleanup of `Codex Live Test` / `Codex Start Test` active rooms.
>
> 2026-06-26 deploy acceptance note: Supabase CLI deployed Phase G migration, `ROOM_PASSWORD_SECRET` / `ROOM_TOKEN_SECRET`, and Edge Functions (`create-room`, `join-room`, `issue-room-join-token`, `verify-room-join-token`, `start-room`, `kick-player`, `leave-room`, `update-host-peer`). Playwright live acceptance on `http://127.0.0.1:5500/` passed Splash → Auth → anonymous session → Lobby → create password room → WaitingRoom → start game. Google OAuth redirects to Google Accounts. `rooms` and `room_memberships` missing-column 400s are gone. Cleaned active `Codex Live Test%` / `Codex Start Test%` rooms and memberships. Still needs double-browser client join/chat/kick/leave/GAME_START acceptance.
>
> 2026-06-26 Auth/Profile hotfix note: Supabase Auth `site_url` / redirect allow-list 已改為 Vercel 正式站優先並保留 localhost 測試網址；修正 Google OAuth 新玩家缺 `player_profiles` 時 `.single()` 406 導致疑似訪客狀態；`roomManager` / `friendManager` 改用 `requireSupabaseUser()`，多人與好友流程不再靜默 anonymous sign-in。Live Vercel 已確認新版 `authManager.js` / `roomManager.js` 部署。

### M0H. Lobby UI

| # | 項目 | 實作現況 | 狀態 | 下一步 |
|---|---|---|---|---|
| M0H-1 | Splash 多人入口 | `src/ui/splash.js` 已新增「多人模式」按鈕 | ✅ 已做 | 🧪 瀏覽器檢查入口與返回流程 |
| M0H-2 | Lobby overlay / 三 tab | `src/ui/lobby.js` 有公開/朋友/房間號碼 tab 與 3 秒 polling；`listRooms()` 已只列 public、未開始、未滿房 | 🟡 部分完成 | 🧪 瀏覽器驗 tab 切換與輪詢；後續改掉 alert 錯誤提示 |
| M0H-3 | 朋友 tab | 已用 `listFriends()` 過濾 owner_id | 🟡 部分完成 | 依 friendships/RLS 實測；若未有接受好友 UI，朋友 tab 很難形成資料 |
| M0H-4 | 房間 ID 加入 | 已改為傳 `joinRoom({ room_id, password })` | 🟡 部分完成 | 🧪 需 Supabase 驗正確/錯誤密碼 |
| M0H-5 | 公開列表加入密碼房 | 已依 `has_password` 彈出密碼輸入，並顯示 lock 標記 | 🟡 部分完成 | 🧪 需部署 `has_password` 欄位後驗證 |
| M0H-6 | 建房 popup | 已補密碼、最低等級、visibility、difficulty 並傳給 createRoom；live Playwright 已驗 payload | ✅ 已可用 | 後續補錯誤提示不使用 alert |
| M0H-7 | 房間列表資訊 | 顯示人數、名稱、等級限制、難度 | 🟡 部分完成 | 補房主名稱、鎖房、已開始/滿房 disable、錯誤提示不用 alert |

### M0I. Waiting Room UI

| # | 項目 | 實作現況 | 狀態 | 下一步 |
|---|---|---|---|---|
| M0I-1 | 玩家 slot 卡片 | `waitingRoom.js` 已依 `max_players` render slot、host crown、等級；live Playwright 已驗 2 人房 slot | 🟡 部分完成 | 🧪 仍需 3/4 人房 slot 檢查 |
| M0I-2 | PeerJS 聊天 | WaitingRoom 建 host/client session，CHAT host relay | 🟡 部分完成 | 🧪 需雙瀏覽器測聊天；避免 host 自己重複顯示訊息 |
| M0I-3 | 角色面板 | `characterPopup.js` 已讀 profile/equipment/rank | 🟡 部分完成 | 補六數值顯示；DB/RLS 實測 |
| M0I-4 | 加好友 | 綠色按鈕呼叫 `sendFriendRequest()` | 🟡 部分完成 | 補自加好友防呆、已是好友/已 pending 顯示、接受好友流程 |
| M0I-5 | 踢人 | UI 已改走 `kickPlayer()` Edge Function，仍會透過 PeerJS 發 KICK | 🟡 部分完成 | 🧪 需雙瀏覽器驗證 |
| M0I-6 | 退出房間 | UI 已改走 `leaveRoom()` Edge Function；host 退出會關閉房間 | 🟡 部分完成 | 🧪 需驗 host/client 退出 |
| M0I-7 | 開始遊戲 | host 已先呼叫 `startRoom()`，成功後才 broadcast GAME_START；單瀏覽器 host start live 驗證通過 | 🟡 部分完成 | 🧪 仍需雙瀏覽器 GAME_START 驗證 |
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
| M1 | Supabase 房間自動清理 | `cleanup-rooms` Edge Function 已部署並以 `CLEANUP_SECRET` 手動呼叫驗收：stale memberships（>60s → offline）、empty active rooms → completed、completed >24h → 刪除。尚未接外部 cron | 🟡 部分完成 |
| M2 | consumed_nonces 定期清理 | 免費方案無 pg_cron，需 Edge Function 或手動清 `consumed_at` 超過 5 分鐘的 nonce | 🔲 待做 |
| M3 | 拆除模式僅限房主 | 多人連線後需加權限策略；目前規劃模式/拆除模式仍需確認誰可用 | 🔲 待做 |
| M4 | Host Migration + 斷線重連 | Phase 6：偵測 host 掉線 → join_order 選候選 → CAS 更新 DB → 新 host 初始化；3 秒 grace timer + reconnect token 綁 slot | 🔲 待做 |
| M5 | 反作弊驗證 | Phase 7：方向制移動、rate limit、sequence_id 單調、庫存檢查、連通性 BFS、距離檢查、strike 系統 | 🟡 部分完成 |
| M6 | 多人存檔改為 Supabase | 目前多人仍偏 localStorage / host 本地；正式版需 Supabase active save 或結算存檔策略 | 🔲 待討論 |
| M7 | Anonymous Auth 改正式帳號 | 目前 UI 有 Anonymous，但正式身份仍應支援 email/OAuth 綁定 | 🔲 待討論 |

> M0 的具體修復以本節為準；舊 `Docs/integration-plan.md` 目前只能視為歷史整合草稿，不再代表完成狀態。

### Data Retention Policy（v0.0.14.3）

| 資料表 | 保留規則 | 說明 |
|---|---|---|
| `player_profiles` | 正式帳號永久保留；anonymous guest profile 可後續清理 `last_seen` 超過 7-30 天 | 清理邏輯待實作 |
| `rooms` | active：只保留有近期 online member 的房（cleanup-rooms 處理）；completed：保留 24h 後刪除 | cleanup-rooms 已實作 |
| `room_memberships` | active room 使用中保留；completed/deleted room 連帶刪除 | cleanup-rooms 刪房時一併刪 |
| `consumed_nonces` | 後續需定期清理 `consumed_at` 超過 5-10 分鐘的 token nonce | 🔲 待實作 |

### 已完成單瀏覽器 / Supabase 驗收項目（v0.0.14.3）

| 項目 | 說明 |
|---|---|
| ✅ Supabase migration | `rooms.last_seen_at`、`rooms.completed_at`、`room_memberships.last_seen_at` 已部署並查驗存在 |
| ✅ Edge Functions | `room-heartbeat`、`cleanup-rooms`、`leave-room`、`create-room`、`join-room` 已部署；`cleanup-rooms` 使用 `--no-verify-jwt` 並由 `CLEANUP_SECRET` 保護 |
| ✅ heartbeat request 200 | 建房 → WaitingRoom → 等 10-15 秒，確認 `room-heartbeat` 多次返回 200 |
| ✅ cleanup-rooms 手動呼叫 | Playwright 關閉後等待 stale 門檻，手動呼叫 cleanup；測試房轉為 `completed`、`current_players=0` |
| ✅ stale / empty 狀態 | live DB 查驗 `active_empty_rooms=0`、`online_stale_memberships=0` |

### 仍待人工 / 雙瀏覽器驗收項目（v0.0.14.3）

| 項目 | 說明 |
|---|---|
| 🧪 client 加入密碼房 | 雙瀏覽器 |
| 🧪 chat | 雙瀏覽器 |
| 🧪 kick | 雙瀏覽器 |
| 🧪 client leave | 雙瀏覽器 |
| 🧪 client 關 tab → cleanup 後 current_players 正確下降 | 雙瀏覽器 |
| 🧪 host 關 tab → cleanup 後 room completed | 雙瀏覽器 |
| 🧪 GAME_START 廣播 | 雙瀏覽器 |

---

## M_BE. Backend Security + Active Save 基礎建設

> 最後更新：2026-06-27
> 優先級：P0（RLS）→ P1（active save）→ P2（TURN）→ P3（Friend UI）→ P4（Shop UI）
>
> **速讀：為什麼要做這些？**
> 1. Supabase 資料表目前**沒有 Row Level Security**——任何登入用戶可讀寫所有人資料（P0 安全漏洞）。
> 2. 多人遊戲中存檔**不能只靠 `owner_id = auth.uid()`**——Host Migration 後新房主的 uid 變了，RLS 會把合法房主擋掉。解法：開一張 `active_saves` 表，全部寫入走 Edge Function + service_role，完全繞過 RLS。
> 3. WebRTC 在部分 NAT 環境打洞失敗，加 TURN relay 可覆蓋 95%+ 的網路。

---

### 分工總覽

| 任務 | 誰做 | 狀態 |
|---|---|---|
| T1：RLS Policy SQL（rooms / memberships / profiles / save_files） | Claude Code | ✅ 已完成 |
| T2：active_saves + save_files DB Migration | Claude Code | ✅ 已完成 |
| T3：Edge Function `save-active` | Claude Code | ✅ 已完成 |
| T4：Edge Function `save-exit` | **Codex** | ✅ 已完成並部署 |
| T5：TURN Server 設定 | **Codex** | ✅ 已接入 runtime credential 模板（credential 不進 git） |
| T6：好友 UI（`friendsPanel.js`） | **Codex** | ✅ 已完成 |
| T7：商店 UI | **Codex** | ✅ 已完成 |
| T8：貨幣過渡層（WalletService + StageRewardService） | **Codex** | ✅ 已完成 |
| T9：抽獎盤 UI（gachaPanel.js） | **Codex** | ✅ 已完成 |
| T10：Email 登入（authScreen + authManager） | **Codex** | ❌ 放棄（Supabase free tier 3封/天上限，不適合測試） |
| T11：裝備庫存（equipmentService + equipmentPanel） | **Codex** | ✅ 已完成 |
| T11b：裝備款式補丁（加入 style A~J 維度） | **Codex** | ✅ 已完成 |
| T12：技能點 UI（skillService + skillPanel） | **Codex** | ✅ 已完成 |

> **B 系列手動項目**（開發者在 Supabase Dashboard 執行，不需 Codex）：
> - B1：`friendships` migration — SQL 已在 `supabase/migrations/20260627_friendships.sql`，直接貼進 Dashboard SQL Editor 執行
> - B2：`player_equipment` / `player_achievements` / `leaderboard` migration — 視需求補

---

### T12. 技能點 UI（✅ 已完成 v0.0.23.0）

**版本目標**：v0.0.23.0

#### 問題

`ECONOMY.skillGoldCost` 曲線已定案，`GAME_CONFIG.skill` 已存在，但沒有任何地方儲存玩家的技能等級，也沒有 UI 可以花金幣升技能。金幣目前只有商店一個消費出口，技能是第二條。

#### 必讀檔案

1. `config/economyConfig.js` — `ECONOMY.skillGoldCost`（10 級費用曲線）、`ECONOMY.skills`（storageKey + 六屬性定義，已加入）
2. `config/gameConfig.js` — `GAME_CONFIG.skill`（`perLevelPct: 10, maxLevel: 10`）
3. `src/account/walletService.js` — `WalletService.spendWallet()` / `canAfford()`
4. `src/account/equipmentService.js` — 架構參考（localStorage service 模式）
5. `src/ui/equipmentPanel.js` — overlay 風格參考（DOM builder、textContent 規則）
6. `src/ui/uiManager.js` — 加入 `openSkills()` 入口

#### 新增檔案：`src/account/skillService.js`

File header（照抄）：
```js
/**
 * @file        skillService.js
 * @module      account
 * @summary     技能等級唯一讀寫入口（localStorage mock；後端化時只替換本檔底層）
 *              注意：本檔儲存「玩家投資的技能等級」，不負責套用屬性加成到 gameplay。
 * @exports     skillService
 * @depends     config/economyConfig.js, config/gameConfig.js
 * @version     v0.0.23.0
 */
```

資料格式（localStorage）：
```js
// key = ECONOMY.skills.storageKey
{ mining: 0, fatigue: 0, spirit: 0, carry: 0, repair: 0, moveSpeed: 0 }
```
- 每個 key 對應 `ECONOMY.skills.attributes[i].key`
- 值為 0（未投點）到 `GAME_CONFIG.skill.maxLevel`（10）的整數

Export 的 `skillService` 物件：
```js
export const skillService = {
  getLevels,      // () => Record<key, number> — 所有屬性當前等級
  getLevel,       // (key: string) => number
  setLevel,       // (key: string, level: number) => void — 內部用，不暴露給 UI
  resetSkills,    // () => void — 清空（配合 resetWallet）
  getUpgradeCost, // (key: string) => number | null — 升到下一級的金幣費用；已滿等回 null
  canUpgrade,     // (key: string, wallet) => boolean
};
```

`getLevels()` 從 localStorage 讀出後驗證：
- 每個 key 必須存在且為 0~10 整數；壞資料補 0（不炸 UI）
- 多餘 key 忽略；缺少 key 補 0

`getUpgradeCost(key)`:
- 當前 level = `getLevel(key)`
- 若 level >= maxLevel → return null
- 否則 return `ECONOMY.skillGoldCost[level]`（index = 當前等級，即升至 level+1 的費用）

#### 新增檔案：`src/ui/skillPanel.js`

File header（照抄）：
```js
/**
 * @file        skillPanel.js
 * @module      ui
 * @summary     技能點升級 overlay：六屬性技能等級、金幣費用、一鍵升級
 * @exports     SkillPanel
 * @depends     config/economyConfig.js, config/gameConfig.js, src/account/walletService.js, src/account/skillService.js
 * @version     v0.0.23.0
 */
```

UI 規格：
```
overlay（position:fixed, inset:0, z-index:10003）
  ├─ 標題「⚡ 技能點」（金色，Georgia serif）
  ├─ 金幣餘額「💰 金幣：N」（每次 render 讀 WalletService.getWallet()）
  ├─ 6 個屬性欄（依 ECONOMY.skills.attributes 順序）
  │    每欄：屬性名稱 / Lv N / 10 / 進度條（N/10格）
  │           升級費用（「升至 Lv{N+1}：{cost} 金幣」）或「已滿等」
  │           「升級」按鈕
  └─ 「關閉」按鈕
```

升級流程（每次點「升級」按鈕）：
1. `skillService.canUpgrade(key, WalletService.getWallet())` → false → 按鈕 disabled（不 toast）
2. `const cost = skillService.getUpgradeCost(key)`
3. idempotencyKey = `skill-upgrade:local:{key}:lv{currentLevel+1}`
4. `WalletService.spendWallet({ source:'skill', reason:'upgrade', cost:{ gold: cost }, idempotencyKey })`
   - ok:false → showToast('金幣不足') → return
   - duplicate:true → 視為已升級（繼續 setLevel）
5. `skillService.setLevel(key, currentLevel + 1)`
6. re-render

**安全規則**：全程 DOM / `textContent`，不用 `innerHTML` 顯示任何 localStorage 資料。

#### 修改：`src/account/walletService.js`

在 `resetWallet()` 中，`equipmentService.resetInventory()` 後再加：
```js
skillService.resetSkills();
```
加 import：`import { skillService } from './skillService.js';`
`@version` header → v0.0.23.0

#### 修改：`src/ui/uiManager.js`

```js
import { SkillPanel } from './skillPanel.js';
let skillPanel = null;
export function openSkills() {
  skillPanel ??= new SkillPanel(document.body);
  skillPanel.show();
  return skillPanel;
}
```
`@version` → v0.0.23.0

#### 修改：`src/ui/lobby.js`

加 import `openSkills`，在「🎒 裝備」按鈕旁加「⚡ 技能」按鈕，呼叫 `openSkills()`。
`@version` → v0.0.23.0

#### 版本同步

`config/gameConfig.js` → `v0.0.23.0`
`config/economyConfig.js` → `@version v0.0.23.0`（header 只改版本）

#### 不要做的事

- 不讓技能等級影響 gameplay 屬性（那是之後與 game loop 整合的工作）
- 不修改 `config/economyConfig.js` 的 skillGoldCost 數值
- 不新增 Supabase table
- 不修改 `src/game/equipmentSystem.js`

#### 驗收

1. `node --check src/account/skillService.js` 通過
2. `node --check src/ui/skillPanel.js` 通過
3. 金幣不足 → 升級按鈕 disabled 或 toast 顯示金幣不足
4. 金幣足夠 → 點升級 → 金幣扣除、等級 +1、費用顯示更新
5. 同一 idempotencyKey 重複 spendWallet → duplicate:true，金幣不重複扣
6. Lv10 → 顯示「已滿等」，按鈕 disabled
7. `WalletService.resetWallet()` → 技能全部歸 0
8. 存檔竄改（level 設為 99）→ `getLevels()` 補回 0，UI 不爆炸
9. `npm test` 全過

---

### T11. 裝備庫存（✅ 已完成 v0.0.22.0）

**版本目標**：v0.0.22.0

#### 問題

`walletService.grantReward()` 目前會隨機生成裝備並 console.log，但回傳值被呼叫方丟棄，裝備從未寫入任何儲存。玩家抽到裝備 → toast 說恭喜 → 刷新頁面裝備不見。

#### 必讀檔案

1. `config/economyConfig.js` — `ECONOMY.inventory.storageKey`（新增）
2. `src/account/walletService.js` — `grantReward()` 要改為呼叫 equipmentService
3. `config/equipmentConfig.js` — `EQUIPMENT_SLOTS`、5 個裝備類型

#### 新增檔案：`src/account/equipmentService.js`

File header：
```js
/**
 * @file        equipmentService.js
 * @module      account
 * @summary     裝備庫存唯一讀寫入口（localStorage mock；後端化時只替換本檔底層）
 * @exports     equipmentService
 * @depends     config/economyConfig.js
 * @version     v0.0.22.0
 */
```

資料格式（每件裝備）：
```js
{ id: string, type: string, level: number, acquiredAt: string, source: string }
```
- `id`：由 idempotencyKey 衍生（`idempotencyKey + ':equip'`）；若無 key 則 `crypto.randomUUID()` fallback
- `type`：`'mining' | 'fatigue' | 'spirit' | 'carry' | 'repair'`（從 EQUIPMENT_SLOTS）
- `level`：0~4（對應抽獎盤 equip0~equip4）
- `source`：`'gacha' | 'reward' | ...`（context.source）

Export 的 `equipmentService` 物件：
```js
export const equipmentService = {
  getInventory,   // () => Item[]
  appendItem,     // (item) => void — 若 id 已存在則靜默略過（idempotent）
  resetInventory, // () => void — 清空（配合 WalletService.resetWallet）
  countByType,    // () => Record<string, { total: number, maxLevel: number }>
};
```

`appendItem` 必須先檢查陣列中是否已有相同 `id`（idempotency），有則 return（不重複寫入）。

#### 修改：`src/account/walletService.js`

1. 加 import：`import { equipmentService } from './equipmentService.js';`
2. 修改 `grantReward()` 中裝備生成的區塊：
   ```js
   if (reward?.equipment) {
     const equipId = idempotencyKey ? `${idempotencyKey}:equip` : createTransactionId();
     equipment = {
       id: equipId,
       type: randomEquipmentType(),
       level: reward.equipment.level,
       acquiredAt: new Date().toISOString(),
       source: source,
     };
     equipmentService.appendItem(equipment);  // ← 新增這行
     console.log('WALLET_REWARD_EQUIPMENT', { source, reason, equipment });
     notify(context, `獲得 ${equipmentLabel(equipment.type)} Lv${equipment.level} 裝備`);
   }
   ```
3. 修改 `resetWallet()`：在原有邏輯後加 `equipmentService.resetInventory();`
4. 在 `WalletService` export 物件加 `getInventory: equipmentService.getInventory`

#### 新增檔案：`src/ui/equipmentPanel.js`

File header：
```js
/**
 * @file        equipmentPanel.js
 * @module      ui
 * @summary     裝備庫存 overlay：顯示持有裝備清單，按類型分組，顯示等級與件數
 * @exports     EquipmentPanel
 * @depends     config/economyConfig.js, config/equipmentConfig.js, src/account/walletService.js
 * @version     v0.0.22.0
 */
```

UI 規格：
```
overlay（position:fixed, inset:0, z-index:10003）
  ├─ 標題「🎒 裝備庫存」（金色，Georgia serif）
  ├─ 摘要「共 N 件」
  ├─ 按類型分 5 組（mining/fatigue/spirit/carry/repair）
  │    每組：EQUIPMENT_CONFIG.slots[type].name + 件數
  │    每件：等級標籤（Lv0~Lv4），按等級由高到低排列
  │    若該類型為 0 件：顯示「尚無裝備」（灰色）
  └─ 「關閉」按鈕
```
- 不做任何操作（裝備/升級/合成 是之後的任務）
- 不做分頁（MVP，直接全列）
- 樣式參考 shopPanel.js / gachaPanel.js 金色主題

#### 修改：`src/ui/uiManager.js`

```js
import { EquipmentPanel } from './equipmentPanel.js';
let equipmentPanel = null;
export function openEquipment() {
  equipmentPanel ??= new EquipmentPanel(document.body);
  equipmentPanel.show();
  return equipmentPanel;
}
```

#### 修改：`src/ui/lobby.js`

加 import：`import { openEquipment, openGacha, openShop } from './uiManager.js';`
在「🎲 抽獎盤」按鈕旁加「🎒 裝備」按鈕，呼叫 `openEquipment()`。

#### 版本同步

`config/gameConfig.js` version → `v0.0.22.0`
`config/economyConfig.js` header @version → `v0.0.22.0`
`src/account/walletService.js` header @version → `v0.0.22.0`

#### 不要做的事

- 不做裝備裝備/升級/合成（那是 T12/T13）
- 不做裝備影響數值（那是之後實作）
- 不新增 Supabase table（localStorage 就夠）
- 不修改 gachaPanel.js（已正確呼叫 grantReward，只是 grantReward 沒存）

#### 驗收

1. `node --check src/account/equipmentService.js` 通過
2. `node --check src/ui/equipmentPanel.js` 通過
3. 抽獎得到裝備 → `localStorage.getItem('yesmaster.inventory')` 裡有該筆資料
4. 同一 idempotencyKey 重複呼叫 `grantReward` → 庫存不重複寫入（`appendItem` idempotent）
5. `WalletService.resetWallet()` → 庫存清空
6. 打開「🎒 裝備」面板 → 顯示正確件數與等級，零件類型顯示「尚無裝備」

---

### T8. 貨幣過渡層（🔴 開工）

> 設計決策：封測期全部維持 client-side mock wallet。
> 目標不是防作弊，而是把貨幣讀寫集中在一層，降低未來後端化的重構風險。
> 正式後端 wallet 上線時，localStorage 餘額不遷移；測試者以固定補償方案處理。

#### 必讀檔案（開工前全部讀完）

1. `config/economyConfig.js` — 所有常數 Single Source of Truth（wallet key、default、匯率等）
2. `src/ui/shopPanel.js` — 目前直接操作 localStorage wallet 的現有程式，T8 要把它改走 WalletService
3. `src/game/phaseRuntime.js` — `_waveClear` 流程（line 209）；注意 `world.stage` 在 `_waveClear` 內已 +1
4. `src/main.js` — line 442：`updatePhase(world, dt, cfg)` 是 stageReward 的掛載位置（見下方說明）
5. `.claude/instructions.md` 鐵則 9 — phaseRuntime.js 是純邏輯層，不得碰 localStorage IO

---

#### 新增檔案

**`src/account/walletService.js`**（需新建 `src/account/` 目錄）

所有貨幣讀寫的唯一入口。UI、商店、抽獎盤、技能、合成、關卡獎勵都不得直接讀寫 localStorage wallet。

```
import { ECONOMY } from '../../config/economyConfig.js';

// 此 wallet 是刪檔封測用 local mock。
// 正式後端 wallet 上線時，不會信任或遷移 localStorage 數值。
// 正式補償會用固定 tester grant，不讀取玩家本機餘額。

export const WalletService = {
  getWallet(),
  setWallet(wallet),
  creditWallet({ source, reason, reward, idempotencyKey }),
  spendWallet({ source, reason, cost, idempotencyKey }),
  grantReward(reward, context),
  canAfford(cost),
  resetWallet(),
  getTransactions(),
};
```

- `walletStorageKey`、`walletDefault` 從 `ECONOMY.shop.*` 讀，不得硬編
- `idempotencyKey` 重複時不重複入帳或扣款（log 裡已有同 key → 直接 return）
- `reward` 支援 `{ silver, gold, ticket, equipment: { level } }`
- `cost` 支援 `{ silver, gold, ticket }`
- `equipment` reward：隨機 `EQUIPMENT_SLOTS` 類型，僅 `console.log + toast`（不寫存檔，同現行 shopPanel 行為）
- `ticket` credit/spend：更新 wallet，不另外處理（票券系統後續接上）

**本地交易 log**（debug 用，不作為可信資料）

localStorage key：`yesmaster.wallet.transactions`

每筆包含：`{ id, createdAt, source, reason, delta, balanceAfter, idempotencyKey }`

---

**`src/account/stageRewardService.js`**

每通關一關的 MVP 收入：
- `+ ECONOMY.session.ticketsPerStage`（tickets）
- `+ ECONOMY.session.goldPerStage`（gold）

```js
export function claimStageReward(completedStage, world) {
  // idempotencyKey: 'stage-reward:local:{completedStage}'
  // TODO: 多人後端版需改為 `stage-reward:{roomId}:{userId}:{stage}`
  walletService.creditWallet({ ... });
}
```

入帳失敗不中斷遊戲流程，最多 `console.warn`。

---

#### 修改檔案

**`src/ui/shopPanel.js`**

- 移除所有直接 `localStorage.getItem/setItem` wallet 操作
- 改用 `WalletService.getWallet()`、`WalletService.spendWallet()`、`WalletService.grantReward()`
- 每日商店的 `slots/purchases/refreshCount` 仍可繼續直接存 localStorage（非 wallet 資料）

**`src/main.js`**（最小改動）

stageReward 掛載點在 `updatePhase` 呼叫前後，不要改動 phaseRuntime.js：

```js
// ⚠️ 鐵則9：phaseRuntime 是純邏輯，不得從內部呼叫 IO
// stageReward 必須在 main.js 這層觸發
const stageBefore = world.stage;
updatePhase(world, dt, cfg);
if (world.stage !== stageBefore && world.phase !== 'cardOffer') {
  claimStageReward(stageBefore, world);   // stageBefore = 剛通過的那關
}
```

---

#### 不要做的事

- 不新增 Supabase migration 或 Edge Function
- 不修改 `config/economyConfig.js`
- 不把 localStorage 數值遷移到 DB
- 不做 server-authoritative gameplay
- 不修改 `phaseRuntime.js` 的純邏輯（stageReward 掛在 main.js，不在 _waveClear 內）

---

#### 未來替換方向（TODO 標記，不要現在做）

```
WalletService.getWallet()     → GET /api/wallet
WalletService.creditWallet()  → POST /api/wallet/credit  (by server after stage clear)
WalletService.spendWallet()   → POST /api/wallet/debit   (atomic, balance check in DB)
WalletService.grantReward()   → server-side decided reward, client only displays
```

---

#### File Header（兩個新檔案都需要）

```js
/**
 * @file        walletService.js
 * @module      account
 * @summary     貨幣讀寫唯一入口（封測 localStorage mock；後端化時只替換本檔底層）
 * @exports     WalletService
 * @depends     config/economyConfig.js
 * @version     v0.0.20.0
 */
```

```js
/**
 * @file        stageRewardService.js
 * @module      account
 * @summary     關卡通關入帳（MVP mock；idempotencyKey 防重複領取）
 * @exports     claimStageReward
 * @depends     src/account/walletService.js, config/economyConfig.js
 * @version     v0.0.20.0
 */
```

---

#### 驗收項目

1. `node --check src/account/walletService.js src/account/stageRewardService.js`：語法通過
2. `shopPanel.js` 裡搜尋 `localStorage`：只剩 shop 狀態（slots/purchases/refreshCount），零筆 wallet 直存
3. 打一關 → console 出現 stage reward creditWallet log
4. 重複通關同一關（刷新）→ idempotencyKey 防止重複入帳
5. `npm test`：全過

---

### T9. 抽獎盤 UI（✅ 已完成 v0.0.21.0）

**版本目標**：v0.0.21.0

#### 必讀檔案

1. `config/economyConfig.js` — `ECONOMY.gacha.*`（boardSize / rewards / equipFairValue）、`ECONOMY.shop.walletDefault`
2. `src/account/walletService.js` — `WalletService.spendWallet()` / `grantReward()`
3. `config/equipmentConfig.js` — `EQUIPMENT_SLOTS`（裝備類型清單）
4. `src/ui/shopPanel.js` — overlay 結構與風格參考
5. `src/ui/uiManager.js` — 加入 `openGacha()` 入口（參考 `openShop()` 模式）

#### 新增檔案：`src/ui/gachaPanel.js`

File header：
```js
/**
 * @file        gachaPanel.js
 * @module      ui
 * @summary     抽獎盤 overlay：64格不放回抽樣、大獎高亮、盤面持久化、票券消費
 * @exports     GachaPanel
 * @depends     config/economyConfig.js, src/account/walletService.js, config/equipmentConfig.js
 * @version     v0.0.21.0
 */
```

#### 盤面初始化（每次新盤）

1. 依 `ECONOMY.gacha.rewards` 建立 64 格陣列，每格記 `{ type, amount?, level?, isBigPrize }`
   - `silverSmall` × 7、`silverMedium` × 3 …（完整組成見 rewards）
2. Fisher-Yates shuffle（使用 `Math.random()`）
3. 盤面持久化到 localStorage，key：`'yesmaster.gacha.board'`
   - 格式：`{ slots: [...], pulled: [bool×64], bigPrizesCleared: N, createdAt }`
4. **重置條件**：`bigPrizesCleared >= 7`（全部 7 格大獎抽完）→ 下一次 show() 時自動生成新盤

#### 每次抽獎

1. 確認錢包有 ≥ 1 票券：`WalletService.canAfford({ ticket: 1 })`；不足 → toast「票券不足」，不抽
2. 扣票：`WalletService.spendWallet({ source: 'gacha', reason: 'pull', cost: { ticket: 1 }, idempotencyKey: \`gacha-pull:local:${boardId}:${slotIndex}\` })`
3. 從未抽格隨機選一格（`Math.random()`）→ 標記 `pulled[i] = true`
4. 若該格 `isBigPrize` → `bigPrizesCleared += 1`
5. 發放獎勵：`WalletService.grantReward(reward, { source: 'gacha', reason: type, toast })`
   - 裝備：`grantReward({ equipment: { level } }, ...)` → WalletService 內部隨機 EQUIPMENT_SLOTS
6. 儲存盤面、重新 render

#### UI 規格

```
overlay（position:fixed, z-index:10003）
  ├─ 標題「抽獎盤」
  ├─ 票券餘額顯示（從 WalletService.getWallet() 讀）
  ├─ 8×8 格子（64格）
  │    ├─ 未抽：金色邊框方格，hover 變亮，cursor:pointer
  │    ├─ 已抽-普通：灰暗，顯示獎品名（少銀幣、中金幣…）
  │    └─ 已抽-大獎：金色背景，顯示獎品名 + ✦ 標記
  ├─ 進度「已抽 N / 64（大獎 M / 7）」
  ├─ 「抽一次（-1票）」按鈕
  └─ 「關閉」按鈕
```

- 點格子 = 抽那一格（視覺好看但邏輯上等同隨機，不給玩家真正選擇）
  → 實作簡化：點任意未抽格都觸發同一個 `_pull()` 隨機邏輯
- 點已抽格：無動作
- 盤面全抽完（64格）或大獎清空（7格）→ 顯示「本盤結束，下次開啟自動重置」提示

#### 修改檔案

**`src/ui/uiManager.js`**：加入 `openGacha()`（參考 `openShop()`）

```js
import { GachaPanel } from './gachaPanel.js';
let gachaPanel = null;
export function openGacha() {
  gachaPanel ??= new GachaPanel(document.body);
  gachaPanel.show();
  return gachaPanel;
}
```

**`src/ui/lobby.js`**：在「每日商店」按鈕旁加「🎲 抽獎盤」按鈕（呼叫 `openGacha()`）
- import `{ openGacha } from './uiManager.js'`
- 按鈕放在 header 右側（好友按鈕左邊）或另一區域，不要擠掉現有按鈕

**`config/economyConfig.js`**：`ECONOMY.gacha` 裡加一行 key：
```js
boardStorageKey: 'yesmaster.gacha.board',
```

#### 不要做的事

- 不做動畫（MVP，靜態 reveal 即可）
- 不新增 Supabase migration
- 不修改 `economyConfig.js` 的其他數值
- 不修改 `phaseRuntime.js`
- 不讓玩家真正「選」格子（點任意格 = 隨機一格）

#### 驗收

1. `node --check src/ui/gachaPanel.js`：通過
2. `npm test`：全過
3. 票券 0 → 點抽獎 → toast「票券不足」，錢包不動
4. 票券 ≥ 1 → 抽獎 → 票券 -1，格子翻開，獎品顯示，console log WALLET_TRANSACTION
5. 重複送同一 `idempotencyKey` → 不重複扣票

---

### T10. Email 登入（❌ 放棄）

> **放棄原因**：Supabase free tier 每日僅能送 3 封驗證信，完全不敷多人封測使用。
> 目前登入維持 Google OAuth + 訪客模式兩條路。日後若升 Supabase Pro 或改用 SendGrid / Resend 自訂 SMTP，可重新開啟。

**版本目標**：v0.0.22.0（已取消）

#### 修改檔案

**`src/net/authManager.js`**：新增兩個 export function

```js
export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await ensureProfile(data.user);
  return data.user;
}
```

**`src/ui/authScreen.js`**：在現有 Google OAuth 按鈕下方加 Email 區塊
- Email input + Password input + 「登入」/ 「註冊」toggle
- 錯誤訊息顯示（不用 alert，用 overlay 內 inline 文字）
- 登入成功 → 呼叫 `onAuthed(user)`（與 Google 流程相同）
- 不移除現有 Google 按鈕，兩種方式並存

#### 不要做的事

- 不做「忘記密碼」（Supabase 內建，後續再加入口）
- 不做 Email 驗證 confirmation（Supabase Dashboard 可設定是否強制，MVP 關閉）
- 不修改 Supabase 設定（那是 Dashboard 操作，不在程式碼內）

---

### T4. Edge Function: `save-exit`（Codex 完成）

**檔案**：`supabase/functions/save-exit/index.ts`

照 `save-active/index.ts` 的 pattern，但多「轉正式存檔」步驟：

```
POST body: { room_id, slot (1-3), data_revision }
```

1. `requireUser()` → 取 `auth.uid()`
2. 查 `rooms`：確認 `current_host_uid = uid` AND `status = 'active'`
3. 讀 `active_saves WHERE room_id = ?`（取 data + data_revision）
4. 比對 `data_revision`（409 Conflict 時前端重讀再送）
5. UPSERT `save_files`：`owner_id = uid, slot = slot, data = active_save.data, data_revision = now()`
6. 把 room `status = 'completed'`，寫 `completed_at`
7. 刪除 `active_saves WHERE room_id = ?`
8. 回傳 `{ ok: true, save_file_id }`

**錯誤碼規則**（同 T3）：
- 401 unauthorized、403 not current host、404 room not found
- 409 room not active / revision_conflict（附 `latest_revision` 給前端重試）
- 500 其他

---

### T5. TURN Server 設定（Codex 完成）

**難度**：極低（5 行 config，無邏輯）

步驟：
1. 在 [Metered.ca](https://www.metered.ca/tools/openrelay/) 建立免費帳號，取得 `hostname / username / credential`。
2. `GAME_CONFIG.net.iceServers`（`config/gameConfig.js`）新增陣列：
```js
iceServers: [
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'YOUR_USER', credential: 'YOUR_CRED' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'YOUR_USER', credential: 'YOUR_CRED' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'YOUR_USER', credential: 'YOUR_CRED' },
],
```
3. `peerRuntime.js` 的 `createPeer()` 加入 `config: { iceServers: GAME_CONFIG.net.iceServers }`。
4. **不要**把真實 credential 寫進 git：Vercel Dashboard 加 env var `TURN_USERNAME` / `TURN_CREDENTIAL`；`peerRuntime.js` 讀取（或由 Edge Function 動態發 short-lived TURN credential）。

---

### T6. 好友 UI（Codex 完成）

**前置條件**：需要 `friendships` 資料表 migration + RLS（Claude Code 第二輪補，見 T6-DB 備注）。
Codex 可以先做 UI 骨架 + mock data，DB 接上後取消 mock。

**新檔案**：`src/ui/friendsPanel.js`

功能清單：
- 好友列表（`listFriends()`，顯示 display_name + 線上狀態 dot）
- 待處理邀請（`listPendingRequests()`，接受 / 拒絕按鈕）
- 傳送好友邀請（輸入框 + 送出，呼叫 `sendFriendRequest(targetUserId)`）
- 刪除好友按鈕

API（全部在 `src/net/friendManager.js`，可直接呼叫）：
- `listFriends()` / `listPendingRequests()` / `sendFriendRequest(id)` / `acceptFriendRequest(id)` / `declineFriendRequest(id)` / `deleteFriend(id)`

**入口**：`src/ui/lobby.js` 頂部加「👥 好友」按鈕，點開 friendsPanel overlay（z-index 同 characterPopup）。

**File Header 必填**（見 `.claude/skills/file-header.md`）：
```js
/**
 * @file        friendsPanel.js
 * @module      ui（HTML overlay）
 * @summary     好友列表、邀請、接受/拒絕 HTML overlay
 * @exports     showFriendsPanel, hideFriendsPanel
 * @depends     src/net/friendManager.js
 * @version     v0.0.16.0
 */
```

> T6-DB 備注：`friendships` 資料表 schema（Claude Code 第二輪建）：
> `id UUID PK, user_id_1 UUID, user_id_2 UUID, status TEXT ('pending'|'accepted'), requester_id UUID, created_at TIMESTAMPTZ`
> RLS：SELECT where user_id_1 = uid OR user_id_2 = uid；INSERT/UPDATE via Edge Function。

---

### T13. 裝備合成 UI（⬜ 待實作 v0.0.26.0）

**版本目標**：v0.0.26.0

#### 問題

裝備庫存（`equipmentService`）與費用曲線（`ECONOMY.synthesis.silverCostPerSynth`）都已定案，但玩家無法在 UI 操作合成。合成邏輯（`synthesizeItems`）也尚未實作。

#### 必讀檔案

1. `config/economyConfig.js` — `ECONOMY.synthesis.silverCostPerSynth`（10 級費用曲線）
2. `config/equipmentConfig.js` — `EQUIPMENT_SLOTS`、`EQUIPMENT_STYLES`、`EQUIPMENT_CONFIG.maxLevel`（= 10）
3. `src/account/equipmentService.js` — `countByType()`、`appendItem()`（架構參考；需新增 `removeItemById`、`synthesizeItems`）
4. `src/account/walletService.js` — `spendWallet()`、`canAfford()`
5. `src/ui/equipmentPanel.js` — overlay 樣式參考（`el()` 工具函式、textContent 規則）
6. `src/ui/uiManager.js` — 加入 `openSynthesis()` 入口
7. `src/ui/lobby.js` — 大廳 header 加入「⚗️ 合成」按鈕

#### 重要風險（必須遵守）

**風險 1：MAX_FRAGMENT_LEVEL 封頂問題**

`equipmentService.js` 第 15 行：`const MAX_FRAGMENT_LEVEL = 4`

`normalizeItem()` 目前用此值擋掉所有 Lv5~10，導致合成產物（Lv5~10）永遠無法存入庫存。

修法：在 `normalizeItem()` 的等級驗證改為依 source 區分：

```js
import { EQUIPMENT_CONFIG } from '../../config/equipmentConfig.js';

const maxAllowed = item.source === 'synthesis'
  ? EQUIPMENT_CONFIG.maxLevel   // 10，合成產物可達
  : MAX_FRAGMENT_LEVEL;         // 4，抽獎盤掉落上限
if (level > maxAllowed) { ... reject ... }
```

**風險 2：費用必須從 config 讀取**

合成費用 = `ECONOMY.synthesis.silverCostPerSynth[materialLevel]`

- `materialLevel` = 投入材料的等級（0~9）；index 0 = Lv0→1 費用 3,760 銀
- 嚴禁硬編任何數字

**風險 3：synthesizeItems 必須是原子操作**

順序：① 驗證 → ② 確認錢夠 → ③ 扣銀幣 → ④ 移除 2 件材料 → ⑤ 加入 1 件產物
如果任何步驟失敗，必須不寫入（整體 abort），不能出現「扣了錢但材料未消耗」的狀態。

**風險 4：合成條件必須三項同時成立**

- 同 `type`（槽位）
- 同 `style`（款式 A~J）
- 同 `level`（等級）
- `level < EQUIPMENT_CONFIG.maxLevel`（Lv10 不能再合成）

**風險 5：synthesizeItems 的產物 id 格式**

```js
const resultId = `synth:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
```

產物 source 必須是 `'synthesis'`（這樣 normalizeItem 才允許 Lv5~10）。

---

#### 修改：`src/account/equipmentService.js`

**新增 export：`removeItemById`、`synthesizeItems`**

```js
export const equipmentService = {
  getInventory,
  appendItem,
  findItemById,
  removeItemById,   // ← 新增
  resetInventory,
  countByType,
  synthesizeItems,  // ← 新增
};
```

**`removeItemById(id)`**

```js
function removeItemById(id) {
  if (!isNonEmptyString(id)) return false;
  const inventory = getInventory();
  const next = inventory.filter((item) => item.id !== id);
  if (next.length === inventory.length) return false;
  writeJson(ECONOMY.inventory.storageKey, next);
  return true;
}
```

**`synthesizeItems({ materialIds, resultItem })`**

```js
/**
 * @param {{ materialIds: [string, string], resultItem: object }} params
 * @returns {{ ok: true, item: object } | { ok: false, reason: string }}
 */
function synthesizeItems({ materialIds, resultItem }) {
  // 1. 找材料
  const [a, b] = materialIds.map(findItemById);
  if (!a || !b) return { ok: false, reason: 'material_not_found' };

  // 2. 驗條件
  if (a.type !== b.type || a.style !== b.style || a.level !== b.level) {
    return { ok: false, reason: 'material_mismatch' };
  }
  if (a.level >= EQUIPMENT_CONFIG.maxLevel) {
    return { ok: false, reason: 'already_max_level' };
  }

  // 3. 驗費用
  const cost = ECONOMY.synthesis.silverCostPerSynth[a.level];
  if (!walletService.canAfford({ silver: cost })) {
    return { ok: false, reason: 'insufficient_silver' };
  }

  // 4. 原子執行
  walletService.spendWallet({ silver: cost }, 'synthesis');
  removeItemById(a.id);
  removeItemById(b.id);
  appendItem(resultItem);

  return { ok: true, item: resultItem };
}
```

---

#### 新增檔案：`src/ui/synthesisPanel.js`

File header：
```js
/**
 * @file        synthesisPanel.js
 * @module      ui
 * @summary     裝備合成 overlay — 選槽位 + 款式，列出可合成組合，顯示費用與結果
 * @exports     openSynthesisPanel, closeSynthesisPanel
 * @depends     config/economyConfig.js, config/equipmentConfig.js,
 *              src/account/equipmentService.js, src/account/walletService.js
 * @version     v0.0.26.0
 */
```

**UI 結構（純 DOM，禁止 innerHTML）**

```
[overlay 全螢幕遮罩]
  └─ [panel 容器，金色主題，同 equipmentPanel 風格]
       ├─ [標題列] ⚗️ 裝備合成  [✕ 關閉]
       ├─ [槽位 Tab]  頭盔 | 上衣 | 下裝 | 手套 | 靴子  （5 個按鈕）
       ├─ [款式篩選列] 款式 A | B | C ... J  （10 個按鈕，預設全選）
       └─ [合成列表區]
            對每個 type+style 組合，若有可合成選項：
            顯示「[類型名稱-款式]  Lv N × 數量  →  Lv N+1  費用: X 銀幣  [合成]」
            若該槽位 + 款式完全無材料 → 顯示「尚無可合成材料」
```

**合成列表邏輯**

```js
// 對每個 (type, style) 組合，找出所有等級中擁有 ≥ 2 件的
function getSynthesisOptions(inventory) {
  const options = [];
  for (const type of EQUIPMENT_SLOTS) {
    for (const style of EQUIPMENT_STYLES) {
      const items = inventory.filter((i) => i.type === type && i.style === style);
      // 按等級分組
      const byLevel = {};
      for (const item of items) {
        byLevel[item.level] = byLevel[item.level] ?? [];
        byLevel[item.level].push(item);
      }
      for (const [lvStr, group] of Object.entries(byLevel)) {
        const lv = Number(lvStr);
        if (group.length >= 2 && lv < EQUIPMENT_CONFIG.maxLevel) {
          options.push({ type, style, level: lv, items: group });
        }
      }
    }
  }
  return options;
}
```

**合成按鈕 onClick**

```js
function onSynthesisClick({ type, style, level, items }) {
  const [matA, matB] = items; // 取前 2 件
  const resultId = `synth:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const result = {
    id: resultId,
    type,
    style,
    level: level + 1,
    acquiredAt: new Date().toISOString(),
    source: 'synthesis',
  };
  const res = equipmentService.synthesizeItems({ materialIds: [matA.id, matB.id], resultItem: result });
  if (res.ok) {
    showToast(`合成成功：${typeName}-${style} Lv${level + 1}`);
    refreshPanel(); // 重新渲染列表
  } else {
    showToast(`合成失敗：${res.reason}`);
  }
}
```

`showToast` 可 reuse `walletService` 或 `equipmentPanel` 現有的 toast 實作，不要新建。

---

#### 修改：`src/ui/uiManager.js`

新增 `openSynthesis()`，參考 `openEquipment()` 的寫法。

---

#### 修改：`src/ui/lobby.js`

在大廳 header 的裝備按鈕旁新增「⚗️ 合成」按鈕，點擊呼叫 `uiManager.openSynthesis()`。

---

#### 不要做的事

- 不新增任何 Supabase table（localStorage 即可）
- 不做合成動畫（MVP，toast 即可）
- 不做材料「手動選擇」UI（自動取前 2 件同 level 同 type 同 style）
- 不硬編任何銀幣數字，全部從 `ECONOMY.synthesis.silverCostPerSynth` 讀

---

### T7. 商店 UI（✅ 已完成 v0.0.19.0）

**新增檔案**：`src/ui/shopPanel.js`、`src/ui/uiManager.js`
**修改檔案**：`src/ui/lobby.js`（大廳 header 左側加「每日商店」按鈕）

實作摘要：
- 6 格加權隨機品項，從 `ECONOMY.shop.items` 讀取（8 種池，各有 weight）
- 金幣 / 銀幣購買扣款，購買後灰出防重複
- 每日 UTC 16:00 重置（GMT+8 00:00），localStorage 持久化
- 刷新：首次免費，第 2/3 次看廣告（MVP placeholder `console.log('AD_WATCHED')`），上限 3 次
- 裝備獎勵 → 隨機 `EQUIPMENT_SLOTS` 類型 + log toast（MVP，不寫存檔）
- 票券獎勵 → log + toast（票券系統後續接上）
- 所有數值從 `config/economyConfig.js` import，無硬編數字

---

## 3. 交接約定

- Codex 改 `config/` 數值 **不需** 動 `src/`、不需動版本號。
- 填完一項，把本檔第 1 節該項打勾並註明「已填」。
- 若發現結構不夠用（缺欄位）→ 在本檔留言，Claude 調 config 結構，不要自己改 `src/` 邏輯。
- 數值定案後，Codex 同步回 `Docs/waveplan.md` / `Docs/bosscard.md`（數值主檔），本檔只是交接看板。
