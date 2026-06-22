# QUICKREF.md — 每次啟動速查表

> 版本：v0.0.2.0
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ MVP 單機骨架已開工；純邏輯層可單測，畫面骨架與 WASD/方向鍵移動已接，挖礦/背包/建造/戰鬥待接。

---

## 1. 技術架構摘要

- 1–4 人合作塔防；HTML+JS / PeerJS（P2P）/ Supabase / Vercel
- Multiplayer：Star（房主中心）拓撲，房主端權威
- 目前單機骨架：`main.js` 建立 world、renderer、controls，並用 fixed timestep loop 更新遊戲進程；render 可畫核心/地面/兩層方塊/玩家，input 已接 WASD/方向鍵。

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
| `src/logic/*`（純函式） | rng / damageDefense / coreStats / connectivity / combat / waveGen / cardOffer / migration / playerMovement |
| `src/game/*` | world 狀態建立與 fixed timestep game loop |
| `src/render` `src/input` `src/storage` | 渲染/輸入/存檔層（渲染只讀 world；輸入轉資料/狀態） |
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

> 已知的設計面注意點（可在開工時轉成具體陷阱）：
> - 建築是三維度（背景泥土 = 地基；前景第二層蓋在泥土前方），連通性在背景平面判定。
> - 核心 2x2x2、貼地、正前方 Z 不可蓋。
> - 反作弊：玩家送輸入不送結果；過期判定用 host_received_at 不採信 client timestamp。
> - 多人 active save 走 Edge Function（驗 current_host_uid），不可只靠 owner_id=uid。
