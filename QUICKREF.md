# QUICKREF.md — 每次啟動速查表

> 版本：v0.0.4.0
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ MVP 單機可動：移動/挖礦/背包/塔內資源/跟隨鏡頭/初版建造/核心數值回饋/核心 HP 與修復/debug 核心戰鬥/正式波次/晝夜/卡片選擇已成循環。

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
| `config/blocks.js` | 方塊耐久/重量/核心加成 |
| `config/enemies.js` | 敵人基礎數值（Codex 維護） |
| `config/waves.js` | 1-30 波次/成長/Boss/加時/21-30 阻擋區 |
| `config/cards.js` | 18 張卡池 + 出卡規則 |
| `config/mines.js` | 礦山機率表 + 初始資源包 |
| `src/logic/*`（純函式） | rng / damageDefense / coreStats / coreHealth / connectivity / building / combat / waveGen / cardOffer / migration / playerMovement / mineGen / inventory / mining |
| `src/game/*` | world（狀態 + 鏡頭跟隨 updateCameraFollow）/ coreSnapshot（核心數值快照）/ combatRuntime（debug 敵人 + 核心攻擊）/ gameLoop（fixed timestep）/ actions（挖礦/卸貨/建造 orchestration） |
| `src/render` `src/input` `src/storage` | 渲染（只讀 world、插值 + 整數平移 + 建造預覽 + 核心數值 HUD）/ 輸入（WASD + 滑鼠長按挖礦 + 快捷列建造/拆除）/ 存檔層 |
| `Docs/claude-codex-worklist.md` | Claude↔Codex 交接看板 |

> 函式級細節見 `MAIN.md`。

---

## 3. 持久化 key 一覽表（防止誤刪 / 重複造 key）

> 列出所有 localStorage / 存檔欄位 / DB 欄位的 key 與用途。每新增一個就加一行。

| 儲存位置 | key / 欄位 | 用途 | 備註 |
|---|---|---|---|
| localStorage | `yesmaster.save.v1` | MVP 單機存檔（見 `config/gameConfig.js` save.storageKey） | schemaVersion=1，讀取時跑 migration |
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

> Debug hotkeys（`config/gameConfig.js debug.enabled && debug.hotkeys`）：H 扣核心血、J 回核心血、K 補塔內測試資源、L 生成 1 敵人、P 生成 5 敵人、C 直接開抽卡面板。

> 已知的設計面注意點（可在開工時轉成具體陷阱）：
> - 建築是三維度（背景泥土 = 地基；前景第二層蓋在泥土前方），連通性在背景平面判定。
> - 核心 2x2x2、貼地、正前方 Z 不可蓋。
> - 反作弊：玩家送輸入不送結果；過期判定用 host_received_at 不採信 client timestamp。
> - 多人 active save 走 Edge Function（驗 current_host_uid），不可只靠 owner_id=uid。
