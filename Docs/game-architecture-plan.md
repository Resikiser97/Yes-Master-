# 塔防遊戲架構規劃文件（技術架構）
> 狀態：Planning 階段，尚未開工
> 最後更新：2026-06-22
> 對應文件：`game-design-plan.md`（玩法設計）、`planning-dashboard.md`（進度追蹤）

---

## 專案概述

- **類型**：偽3D 合作塔防遊戲
- **風格**：Minecraft-like，收集資源、放置方塊建塔
- **遊戲節奏**：白天收集資源 → 晚上怪物入侵 → 每晚結束可選擇儲存
- **玩家規模**：2–4 人朋友房間 + 公開房（不限人數，War3 Lobby 式）

---

## MVP 開發範圍（單人測試版）

目的：在做多人連線(PeerJS)/雲端帳號(Supabase)之前，先做純單人版本驗證核心玩法
（挖礦/建塔/晝夜/核心戰鬥）好不好玩、效能如何。

### MVP 簡化規則
```
- 不含 PeerJS 多人連線、不含 Supabase 帳號系統
- 疲勞值：無限（不限制玩家挖礦次數）
- 白天階段：沒有真正運作的倒數計時邏輯，UI計時器元件先放上去（只是不需要真的跑），
  玩家蓋好後手動按按鈕觸發進攻模式
  - 按下按鈕後，畫面仍維持「白天」視覺狀態，差別只是開始有怪物進攻
- 夜晚階段：60秒固定計時 + 30秒加時賽機制照常運作（見 game-design-plan.md 怪物系統）
- 存檔：先用瀏覽器 localStorage，等MVP驗證可玩後才接 Supabase
- 需要在UI加上「單人模式」與「多人模式」的視覺角標，方便之後錄影分辨測試版本
```

### 數值模擬基準（Must Solve 4）

雖然 MVP 先做單人測試版，但波次、多人倍率、Boss20 門檻與 21-30 阻擋區都以 `Docs/waveplan.md` 為唯一基準，方便後續接 PeerJS 多人時不必重訂整段曲線。

```
單人 / 2 人裸裝：第 10 關前必須輸
3 / 4 人裸裝：第 15 關前必須輸
50 抽：應能摸到第 10-15 關區間，但不穩定越過第 20 關
100 抽 + 第 10 關卡片：應能挑戰第 15-20 關，但不應穩定越過第 20 關
第 20 關：MVP 主要硬門檻
第 21-30 關：暫作阻擋區，不做公平通關承諾
```

多人波次與建造範圍規則集中參考：

```
Docs/waveplan.md
```

目前初版規則：

```
N 人房普通怪數量 = 單人基準數量 x N
N 人房王關 = 出 N 隻 Boss
全部 Boss 擊殺後，才進入卡片選擇
核心中心左右最多各蓋 35 格
高度最多 100 格
Boss20：3 人血量 +30%、4 人血量 +50%、攻擊 6
```

後續架構實作模擬工具時，至少要能輸入：

```
玩家數、裝備平均加成、卡片效果、每關波次、核心基礎數值、方塊成長量、修復能力
```

---

## 技術棧

| 項目 | 技術 | 備註 |
|---|---|---|
| 前端 | HTML + JavaScript | ES Module 全模組化 |
| 換行符號 | LF | 統一用 `.gitattributes` 強制 |
| Multiplayer | PeerJS（WebRTC） | P2P，免費 |
| 雲端存檔 / 帳號 | Supabase | 免費額度，含 Auth + RLS |
| 部署 | Vercel | Push 自動部署，ES Module 免設定 |
| 開發輔助 | Claude Code + Codex | 並行輔助 |

---

## 程式碼分層原則（可測試性）

> 對應 `.claude/instructions.md` 開發鐵則 9。ES Module 只解決「檔案如何互相 import」，不保證可測試；可測試性靠「純邏輯與渲染分離」達成。

### 分層

```
純邏輯層（pure）：輸入資料 → 回傳結果，無副作用，不碰 canvas / DOM / 全域狀態 / 存檔 IO
渲染層（render）：讀純邏輯結果畫到畫面
輸入層（input）：把玩家操作轉成資料，丟給純邏輯
存檔 IO 層（storage）：localStorage（MVP）/ 之後 Supabase 讀寫
→ render / input / storage 只能「呼叫」純邏輯，不可把規則邏輯寫在這幾層裡
```

### 隨機與時間必須注入

```
純邏輯內禁止直接呼叫 Math.random() / Date.now()。
隨機：以 seed 建立 RNG 後當參數傳入（對齊 waveplan.md seed 固定隨機序列）。
時間：以 tick / 時間戳當參數傳入。
→ 保證可重現、可在 Node 環境用假資料 assert。
```

### MVP 必須可單獨測試的純邏輯模組（建議切分）

| 模組 | 職責 | 測試重點 |
|---|---|---|
| `connectivity` | 放置/拆除泥土的連通性 BFS | 孤立泥土禁放、拆除致斷連禁拆 |
| `coreStats` | 方塊計數 → 核心攻擊/攻速/血量/範圍/防禦/魔法/連鎖 | 公式換算正確、計數校正 |
| `combat` | 普攻鎖定最近、連鎖取最近 N 隻不重複（一輪用盡可重啟新循環）、物理+魔法傷害合算 | 鎖定優先序、連鎖去重與重啟、減傷 |
| `damageDefense` | 防禦減傷 `N/(100+N)` | 邊界值 |
| `waveGen` | 關卡 → 波次組成、多人 xN 倍率、0~5 秒分批出怪分布 | 組成表、倍率、分批公式（seed 注入） |
| `cardOffer` | 固定 3 槽位出卡 + 類型保護 + 同名/同類重抽 | 保底標準卡、偏強卡上限（seed 注入） |
| `migration` | schema_version Migration chain | idempotent（跑 1 次 = 跑 2 次） |

> 界線：以上數據化規則用單元測試；手感 / UI 清晰度 / 渲染 / 好不好玩靠 MVP 實玩驗證（沿用 `Docs/mustsolve.md` 模擬適用界線）。

---

## 帳號系統

- **強制註冊**，不接受匿名玩家
- 使用 **Supabase Auth**（Email + 密碼）
- 密碼由 Supabase 內建 **bcrypt** 處理，不需要自行實作
- 忘記帳號密碼 → Supabase 內建重設 Email 流程

---

## 玩家帳號資料結構

> 跨房間通用，綁定 `auth.uid()`，不屬於任何單一 Save File。玩家無論加入哪個房間，都帶著這份資料一起進場。

```
1. 角色數值
   - 六項數值：挖掘 / 疲勞 / 靈動 / 背負 / 修復 / 移動速度
   - 玩家等級、技能點分配（每項數值目前點了幾級，最高10級）

2. 裝備庫存
   - 5 大類別：鎬子（挖掘）/ 帽子（靈動）/ 衣服（背負）/ 褲子（修復）/ 鞋子（移動速度）
   - 每個類別底下有 10 種款式（A~J），純外觀不同，效果機制相同
   - 每個款式各自記錄「目前持有的等級＋數量」清單（尚未合成的重複品也要存）
     例：鎬子-E → [{等級2: 持有3個}, {等級5: 持有1個}]
   - 合成規則：只能同款式合成（2個同等級 → 1個高一級），不能跨款式
   - 觸發方式（手動合成 / 自動合成1秒2個 / VIP加速）⚠️ 尚未定案，不影響此資料結構
   - 取得方式：抽獎決定（待抽獎系統章節細談）

3. 屬性加成計算（即時算出，不需另外存）
   核心公式：該類別總加成 = Σ(A~J 共10款式，各自取「目前持有最高等級」的數值)
   例：A~J 全部1級 → 1×10 = 10
   例：A1 B2 C5 D3 E9，其餘0級 → 1+2+5+3+9 = 20
   （同一款式即使持有多個不同等級，只取最高的那個去加總，不會疊加同款式內多個等級）

4. 累計進度
   - 最終累計經驗值、累計金幣（每關結束後從 Save File 的 session counter 推送進來的結果）
   - 銀幣（裝備合成消耗用）、票券（抽獎消耗用）— 由抽獎/合成系統直接增減，非 session counter 推送

5. 快捷鍵偏好順序
   ⚠️ MVP 不做，固定用系統預設順序。「玩家自訂偏好、跨房間帶著走」列為未來功能

6. 抽獎盤狀態
   - 目前這一盤（8x8=64格）各獎品類型的「剩餘數量」清單（不放回抽取，抽中後對應類型 -1）
     例：{少銀幣: 5, 中銀幣: 3, 多銀幣: 1, ..., 4級裝備: 2}
   - 4種大獎類型（多銀幣/多金幣/中票卷/4級裝備，合計7格）全部清空 → 重置成新的一盤（同樣比例重新填滿）
   - 今日抽獎次數：用於首頁「今日最多票王 TOP5」排行榜，每日 GMT+8 08:00 重置

7. 雙倍獎勵充能狀態（取代體力系統，詳見 game-design-plan.md「雙倍獎勵充能系統」章節）
   - 目前充能點數（0~上限；一般玩家上限1，VIP上限3）
   - 上次回復時間戳（用於計算下次回滿時間，每4小時回1點，背景持續回復不需在線）
   - 今日是否已使用過「免廣告那一次」：每日 GMT+8 08:00 重置（VIP 不受此限制，全部免廣告）
```

---

## 私人房系統

### 建立房間
1. 房主登入後建立房間
2. 設定房間名稱 + 房間密碼
3. 系統產生唯一房間碼（綁定房主 `auth.uid()`，不需 SHA-256，直接綁定房主 ID）
4. 房間碼永久有效，直到房主刪除存檔

### 加入房間
1. 房主必須先「開啟等待房間」
2. 朋友輸入房間碼 + 房間密碼
3. 驗證通過 → PeerJS 牽線 → P2P 連線建立

### 房間密碼
- 獨立於帳號密碼，儲存在 Supabase（Hash 處理）
- 房主登入後隨時可覆蓋新密碼，不需要解密舊密碼

---

## 公開房系統

### Lobby 邏輯（War3 式）
```
1. 玩家進入公開房列表，選擇加入空房或新建房間
2. 第一個進入空房間的玩家 → 自動成為房主
3. Lobby 階段：房主可將房主權限轉讓給其他人
4. 房主擁有踢人權限
```

### 遊戲進行中
```
- 觀戰者可隨時加入「觀戰」，不影響遊戲進行
- 每個晝夜循環結束時（與王關判定同步）：
  → 房主選擇「繼續 / 存檔退出」
  → 若選擇繼續：
     a) 房主決定是否讓排隊中的觀戰者「加入遊玩」
     b) 額外給 30 秒 Build Plan 準備時間（期間可聊天）
```

### 公開房存檔歸屬
```
- 房間在 Supabase 上是「活躍狀態」，跟著當下房主走（Host Migration 正常套用）
- 最後一位玩家斷線離開 → 整個房間直接消失，不留存檔
- 房主主動選擇「存檔退出」→ 才正式存成 Save File，綁定當下房主帳號
  → 變成跟私人房一樣的存檔，佔用該房主的私人存檔名額
```

---

## 存檔系統

### 儲存流程
```
多人進行中：每晚結束 → 房主寫入 active save（走 Edge Function 驗 current_host_uid）
房主選擇「存檔退出」→ active save 轉成正式 save_files，綁定當下房主 auth.uid() + RLS 保護
（寫入權限模型詳見下方「存檔寫入權限」章節）
```

### 存檔寫入權限：active save vs 正式 save_files（不分私人房/公開房）
```
統一模型：所有「多人進行中」房間，不分私人房/公開房，都用同一套 active save 寫入。
原因：私人房一樣會發生 Host Migration（新房主 uid ≠ 原 owner_id），
      若只靠 owner_id = auth.uid() 會把合法的新房主擋在門外。

(1) 多人進行中的 active save：
  - 不可只用 owner_id = auth.uid()
  - 一律走 Edge Function 寫入：
      1. 驗 requester 的 auth.uid（Supabase session）
      2. 驗 requester 是否為 room.current_host_uid
      3. 驗 room 狀態為 active
      4. 驗 data_revision（條件式回寫，見 Schema Versioning）
      5. 全部通過 → 由 service role 寫入
  - Host Migration 後，新的 current_host_uid 可繼續寫同一份 active save

(2) 正式 save_files（房主選擇「存檔退出」時才產生）：
  - active save → 轉成正式 save_files，owner_id 綁定當下房主 auth.uid()
  - 此後回到 owner_id = auth.uid() 的 RLS 模型（房主固定，可直接讀寫）

(3) 單機 localStorage MVP：無多人、無 active save，不受此模型影響
```

### 存檔上限
| 情況 | 上限 |
|---|---|
| 一般 | 每位房主最多 3 個存檔 |
| Host Migration 後接收存檔 | 特例允許第 4 個 |
| 出現第 5 個 | 新房主必須先刪除一個才能繼續 |

### 存檔轉移（未來功能）
- 兩位玩家必須同時在線
- 發起方請求 → 對方確認接受 → 轉移成功
- 轉移後存檔歸屬改為對方的 `auth.uid()`

### Save File 資料結構（已定案）

> 與「玩家帳號資料結構」分工：帳號層存「跟著玩家走」的長期進度（屬性/裝備/累計經驗金幣），Save File 只存「跟著這個房間走」的遊戲狀態（核心/塔/塔內資源/卡片/礦山/房間設定）。

```
1. 地圖層
   - 已放置方塊位置與種類（第一層泥土地基、第二層方塊 沙/石/鐵/金/琉璃/鑽、梯子）
   - 礦山 A／B 目前可見的 10x3＝30格內容（哪格是什麼方塊／已挖空，見下方礦山系統）
     → 後面尚未出現的補位 Queue 不存，重新生成即可
   - 核心目前血量：要存（避免重開存檔變成誤判滿血）
   - 核心總血量上限：不存，每次用公式即時算（基礎50 + 土塊數量×1）
   - 核心位置固定（水平置中、貼地坐落地面），大小固定 2x2x2（正面 2x2 面對玩家），不需要存
   - 地圖尺寸：1600×1000px（160×100 格），由難度決定，可能隨難度變動

2. 進度層
   - 第幾個晝夜循環 / 第幾關（0-1, 0-2 ... 1-0 王關）
   - 已選卡片清單：卡片ID、類型、第幾關獲得、加成數值（結算畫面復盤用）
   - 王關紀錄：第幾個10關、擊殺花了幾秒

3. 玩家層（每個 Slot：P1~P4）
   - 背包資源內容（暫存快照；玩家回到核心觸碰泥土/其上第二層方塊時會自動存入塔內資源欄，
     所以新玩家進場時通常看不到上一位玩家的殘留背包）
   - 目前佔用此 Slot 的玩家帳號 auth.uid()
   - 不存快捷鍵設定（MVP 固定預設順序）
   - 不存累計經驗/金幣 counter（純顯示用，每次都從 0 重新累計，跟 Slot 換人無關）

4. 共享資源層
   - 已放置方塊計數器（土塊/鐵塊/金塊...數量，用於核心加成計算）
     → 遊戲中即時用 +1/-1 維護；王關後卡片選擇 checkpoint ＋ 讀檔時，重新掃描地圖層校正一次
       （地圖最大 1.6萬格，掃描成本可忽略，且發生在非戰鬥的 Free Time / Loading 階段）
   - 尚未放置的原料庫存（塔內資源欄 1~0 共10格）

5. 房間層
   - 房主目前帳號 auth.uid()
   - 房間名稱 / 房間密碼(hash) / 建立時間 / 最後存檔時間
   - 難度設定（影響地圖大小／礦山內容／敵人強度，見 game-design-plan.md 難度章節）
   - 各 Slot（P1~P4）目前綁定的玩家帳號：先到先得，可申請換位或自行更換
   - ⚠️ Slot 人數鎖定規則：每次開局都會檢查當下實際進場人數。
     若某個 Slot 在本次開局時是空的，該 Slot 即永久關閉，之後即使有新朋友想加入也無法使用。
     人數只能隨著存檔的開局次數往下鎖定，不能再回升。
     例：第1次4人玩存到10關 → 第2次只有3人存到20關（P4永久關閉）→ 第3次只有2人（P3也永久關閉），
     此存檔之後永遠只能2人玩。
```

---

## Multiplayer 架構

### 連線方式
```
P2P（PeerJS），採用 Star（房主中心）拓撲，非 Full Mesh
房主 ←── WebRTC ──→ 玩家B
                    玩家C
                    玩家D

非房主玩家僅與房主建立 1 條 WebRTC 連線（4人房合計 3 條連線）
玩家操作 → 送給房主 → 房主驗證/處理 → 房主廣播結果給其他玩家
```

### 本機雙分頁測試（單機模擬 host + client）

```
.claude/launch.json 有兩組 dev server 設定：
  mvp   → npx serve . -l 5173（原本就有）
  mvp2  → npx serve . -l 5174（2026-07-06 新增，供本機雙開測試用）

用法：一個分頁跑 mvp（當 host，建房），另一個分頁跑 mvp2（當 client，用房間 ID 加入）。
兩個 port 各自是獨立的瀏覽器 origin，localStorage/Supabase auth session 不會互相污染，
可以用兩個不同的匿名帳號模擬真正的兩位玩家，不需要兩台實體裝置或另外開無痕視窗。

PeerJS 訊令走公用雲端 broker，不依賴哪個本機 port 服務頁面，
所以 5173 和 5174 兩個實例可以直接互連，行為等同兩台不同機器。
```

**已知限制（2026-07-06 實測發現，不是本機測試工具的 bug，是留意事項）**：
```
waitingRoom.js 每 10 秒呼叫一次 heartbeatRoom()，
room-heartbeat 更新 room_memberships.last_seen_at + rooms.last_seen_at。
背景有排程定期呼叫 cleanup-rooms：
  房間若 60 秒內沒有任一成員 online=true 且 last_seen_at 夠新 → 標記 status='completed'
  status != 'active' 之後，start-room / 加入流程都會直接失敗（room not found）

heartbeatRoom() 呼叫失敗時是 best-effort 靜默吞掉（.catch(() => {})），
如果測試環境網路不穩定（例如 Claude Code 沙盒瀏覽器工具偶發 ERR_INTERNET_DISCONNECTED），
心跳可能連續失敗超過 60 秒，房間就會被自動判定為已結束，需要重新建房才能繼續測試。
本機正常網路環境下不會遇到這個問題。
```

### slot_id 正式定義（canonical）
```
slot_id ∈ { P1, P2, P3, P4 }
slot_id 是「房間內席位」，不等於 auth.uid，也不等於 PeerJS Peer ID（三者各自獨立）。
所有用到席位的地方共用同一套值域：
  - Save File 玩家層 / 房間層的 Slot
  - room_join_token / session 綁定的 slot_id
  - 反作弊 Strike key（auth.uid + room_id + slot_id）
```

**拓撲選擇理由**（Star vs Full Mesh，已與 Codex 確認）：
1. 與「房主狀態為權威」模型一致：房主本來就需要收到全部事件才能做判定，由房主兼任轉發角色不需額外設計
2. 反作弊驗證點可集中在「房主收到 Input Event 時」這一個環節
3. 斷線重連只需重建「房員 ↔ 房主」這一條連線，不需處理 N×N 條連線的重建
4. 怪物 AI／傷害判定不受影響，事件來源單一，更容易保持一致
5. Full Mesh 會形成「玩家互相廣播」與「房主權威判定」兩套並存的事件流，複雜度較高且容易產生不一致

### 邏輯分工
| 責任 | 負責端 |
|---|---|
| 怪物 AI、傷害計算 | 房主端 |
| 玩家操作 | 房員送 Input Event 給房主；房主驗證後廣播權威結果 |
| 衝突仲裁 | 房主狀態為權威 |
| 存檔發起 | 只有房主能發起 |

### State Sync
- **方式**：Event-driven State Sync（傳事件，不傳整份狀態）
- **更新**：Optimistic Update（玩家先看到自己的操作）
- **衝突**：以房主狀態為準

### Host Migration
```
觸發：房主斷線
↓
剩餘玩家偵測到斷線
↓
最早加入的玩家自動升為新房主（candidate_host，見下方 token 流程）
↓
強制所有人同步新房主手上的最後狀態
（可能有小幅倒退，設計上接受此行為）
↓
active save 寫入權限轉移到新房主（新 current_host_uid 可繼續寫 active save，見「存檔系統」章節）
```

### Host Migration 的身份與 token 流程（必做，否則新房主收不到合法連線）
```
新房主選擇 = 最早加入者為唯一合法候選人，CAS 只是防雙寫保護（不是誰先搶到誰當）：
1. 系統依 room_memberships.join_order 選出「最早加入且仍在線/可接任」的玩家
   作為 candidate_host
2. 只有 candidate_host 可透過 Edge Function CAS 更新
   current_host_uid / current_host_peer_id / host_epoch
   - CAS 的用途是防止「同時偵測到斷線」造成的雙寫，不是開放搶占
3. 所有存活玩家重新向 Edge Function 申請短效 room_join_token
   （原本手上的 token 60–120s 早已過期，必須重發）
4. 玩家與新房主重新 handshake（走 verify_room_join_token）
5. 舊 host session 的所有 connection_epoch 全部作廢，
   新房主對每位玩家重新分配 epoch
```

### 狀態來源：維持「最早加入者升房主」（Q2，MVP 決議）
```
MVP 維持「最早加入者升房主」，不改成 state_tick 最高者。
原因：state_tick 可被謊報 / 異常，不代表狀態最完整，
      改用 tick 競選會增加 P2P 分區複雜度。
規則：
  - 新房主廣播 full snapshot + 自己的 state_tick
  - 其他玩家若本地 state_tick 更高 → 只記 debug / event log，
    不自動覆蓋新房主狀態
  - 小幅倒退設計上接受（與既有 Host Migration 取捨一致）
```

---

## 安全架構

| 項目 | 做法 | 狀態 |
|---|---|---|
| 帳號密碼 | Supabase Auth 內建 bcrypt | ✅ 確認 |
| 房間密碼 | Hash 儲存，可覆蓋不可解密 | ✅ 確認 |
| 存檔讀寫權限 | 正式 save_files：RLS owner_id = auth.uid()。多人 active save（不分私人房/公開房）：走 Edge Function 驗 current_host_uid（見「存檔系統」章節） | 🟡 正式存檔可行；多人 active save 待實作 |
| 身份驗證（連線） | 連線用後端核發短效 room_join_token，房主呼叫 Edge Function verify（nonce 一次性）；房主身份由 room record 的 current_host_uid/peer_id 反向驗證（見 P2P 章節） | 📝 規格已定，未實作 |
| 公開房踢人機制 | 房主擁有踢人權限 | ✅ 確認 |
| Event Log | 記錄所有 Event，每 30 秒批次上傳 Supabase，供事後查詢 | ✅ 確認 |
| 反作弊／輸入驗證 | 房主端 Sliding Window + 結構合法性驗證 + 三級違規處理（見下方章節） | ✅ 確認 |
| Save File 內容驗證 | 尚未設計 | ⚠️ 已知風險，低優先 |
| JWT Token 過期處理 | 前端用 Supabase `onAuthStateChange` 靜默刷新；Token 過期不等於作弊，僅暫停 Event 處理等刷新完成 | 📝 規格已定，未實作 |
| XSS 防護 | 玩家名稱、房間名稱、聊天等所有玩家輸入，一律用 `textContent` 或 DOM API 設置，禁用 `innerHTML` | 📝 規格已定，未實作 |

---

## 待決定 / 待設計

- [ ] 怪物入侵節奏設計細節（已知後置討論項目）
- [ ] RLS Policy 實際 SQL 撰寫（正式 save_files owner_id=uid 可行；多人 active save 不分公私房需走 Edge Function 驗 current_host_uid，尚未寫程式）
- [ ] Edge Function：issue_room_join_token / verify_room_join_token / active save 寫入 / Host Migration（candidate_host CAS 更新 current_host_uid，CAS 僅防雙寫）
- [x] Save File／玩家帳號資料的版本相容性（Schema Versioning：已設計，見下方章節）
- [x] 金流／儲值串接方案（已設計，見下方章節）
- [x] 隱私權與法規合規（已設計，見下方章節）
- [x] 新手教學 Onboarding 流程（已設計，見下方章節）

---

## P2P（PeerJS）安全限制

> 這些是 PeerJS/WebRTC P2P 架構的已知安全限制，開工時必須逐一處理。

### 已知限制清單

**1. Peer ID ≠ 身份**
```
PeerJS Peer ID 是連線識別符，不是身份憑證
任何人都可以用任意 Peer ID 連線到房間
因此所有身份驗證必須走後端核發的短效 token，不能靠 Peer ID 判斷
```

**2. 連線後第一包必須做 Auth Handshake（用短效 room_join_token，不傳 Supabase JWT）**
```
重要前提：房主是「玩家的瀏覽器」，不是可信 server。
  → 絕對不可把 Supabase JWT 傳給房主（等於把長效身份憑證交給另一個玩家）。
  → 改用後端核發、只在「加入這個房間這個 slot」這件事上有效的短效 token。

Token 申請（連線前，玩家端對後端做）：
  1. 玩家用自己的 Supabase session 呼叫 Edge Function issue_room_join_token
  2. Edge Function 驗證 auth.uid、room_id、join/reconnect 權限
     （該玩家是否真的有資格進這個房間；slot 配發規則見第 7 點）
  3. Edge Function 簽發 room_join_token，內容含：
       { uid, room_id, slot_id, join_type: "join"|"reconnect", exp, nonce }
     有效期 60–120 秒，一次性 nonce 防重用
     slot_id 語意（見第 7 點）：
       - join token：slot_id = null / omitted（由房主權威分配 slot）
       - reconnect token：slot_id 必填，後端驗證該 uid 確為該 slot 原持有者

Handshake 流程（玩家 → 房主 → 後端，nonce 一次性由後端保證）：
  Client → Host: { type: "auth", room_join_token }   （只在 data channel 第一包傳，不可放 URL）
  Host → 呼叫 Edge Function verify_room_join_token（房主本地驗簽「不足夠」，必須走後端）：
       後端在一次原子操作中完成：
         - 驗 token 簽名與 exp
         - 檢查 room_id / uid / join_type 合法
         - 檢查 nonce 未被 consumed
         - 將 nonce 標記為 consumed（一次性，防房主或他人重用）
         - 檢查該玩家未被 kicked / banned
         - 回傳 verified { uid, room_id, slot_id（reconnect 才有）, join_type }
  Host → 一律採用後端回傳的 verified uid（與 reconnect 的 verified slot_id），
         不得信任 client 明文 uid / slot_id 欄位
  join 情境：verify 成功後，房主權威分配 slot，回傳 slot_assignment
  → 之後該 connection/session 綁定 verified uid + assigned slot_id
  Host → Client:
    { type: "auth_ok", session_context: { host_epoch, connection_epoch, slot_assignment }, snapshot }
    或  { type: "auth_fail", reason }
Handshake 超時（例如 5 秒內未收到）→ 斷開連線

為什麼不能只靠房主本地驗簽：
  房主是不可信的玩家瀏覽器，本地驗簽無法強制 nonce 一次性、無法即時撤銷
  （kicked/banned）。一次性與撤銷只能由後端的 consumed-nonce 記錄保證。
```

**3. IP 暴露風險**
```
WebRTC P2P 直連會在 STUN 協商過程中暴露玩家真實 IP 給同房其他玩家
隱私政策必須明確揭露：
  「本遊戲多人模式採用 P2P 連線，其他玩家可能透過技術手段獲取您的 IP 位址。
   若不希望暴露 IP，請勿加入多人房間。」
```

**4. 房主權威的範圍**
```
房主端驗證所有輸入 → 可以防止其他玩家作弊
但房主自己的輸入無法被驗證（房主客戶端可以造假）
這是 P2P Star 拓撲的已知限制，MVP 不處理
後續可考慮：Event Log 上傳 Supabase 供事後審計
```

**4b. 加入者也要驗證房主身份（雙向，不可只信 signaling）**
```
token 只證明「玩家 → 房主」。加入者也必須確認「應答的人是真房主」。
MVP 做法（不做 host_token）：
  - 房主身份以 DB room record 的 current_host_uid / current_host_peer_id / host_epoch 為準
  - 加入者只連 DB 記錄中的 current_host_peer_id，
    不信任 signaling 層或陌生 peer 自稱房主
  - current_host_peer_id 只能由 Edge Function 在「create room」或
    「Host Migration CAS 成功」時更新，客戶端不可自行寫入
  - 連到的 peer 與 DB 記錄不一致 → 加入者中止連線（可能是冒認房主）
  - host_token 留作未來強化（例如要房主主動出示簽章），不列入 MVP
```

**4c. Host Identity Recheck（防 P2P 腦裂，Q1）**
```
CAS 只保證 DB 端單一 current_host_uid，但 P2P 層網路分區時，
兩群玩家可能各自跟錯房主。因此加入者要做身份再核對：
  - handshake 前：從 DB 讀 current_host_uid / current_host_peer_id，只連該 peer_id
  - handshake 成功時：再核對一次 DB 的 current_host_peer_id / host_epoch
  - MVP 觸發重讀 DB 並重連的條件只列三項：
      房主斷線、auth_fail、host_epoch 不一致
MVP 不做固定 heartbeat 輪詢。
可選後續強化：房主 heartbeat 10s、房員 15–30s 檢查一次（heartbeat 異常才納入觸發條件）。
```

**4d. Epoch 定義（host_epoch vs connection_epoch，兩者正交獨立，不可混用）**
```
host_epoch（房間級）：
  - 代表「第幾任房主」
  - 由 Edge Function 在 create room 時初始化，Host Migration CAS 成功時 +1
  - 儲存在 room record
  - 用途：Host Identity Recheck、判斷 current_host_uid / current_host_peer_id 是否仍有效
  - 客戶端不得自行修改

connection_epoch（連線級）：
  - 代表「某玩家與當前房主之間的一條有效 PeerJS connection/session」
  - 由房主在 handshake 成功後分配
  - 每次建立連線 / 重連 / Host Migration 後，重新分配
  - 用途：搭配 sequence_id 丟棄舊連線殘留封包與重放事件

兩者關係：
  - host_epoch +1 時，所有舊 connection_epoch 全部作廢，
    新房主對每位玩家重新分配 connection_epoch
  - connection_epoch 更新不影響 host_epoch
  - 兩者正交獨立，不可混用
```

**5. Per-Connection Event 安全**
```
對每個 PeerJS connection 各自維護：
  - Rate Limit（每種 event type 各自的 Sliding Window）
  - 最大封包大小（例如 16 KB，超出直接斷線）
  - 未知 event type → 丟棄（不回應、不踢，防止探測）
```

**5b. connection_epoch 的封包規則（防舊連線殘留封包）**
```
封包欄位分工：
  - auth_ok / session_context（handshake 成功時房主回傳一次）：
      包含 host_epoch + connection_epoch + snapshot
  - 每個 Game Event 只帶：connection_epoch + sequence_id + type + payload
      → host_epoch 不放進每個 Event（只用於 handshake / recheck / debug）

房主處理規則：
  - connection_epoch 小於該玩家當前 epoch → 丟棄（舊連線殘留封包）
  - 同一 epoch 內 sequence_id 重複或回退 → 丟棄
  - sequence_id 在每個新 epoch 內可從 0 重新計數
  → 重連後不必沿用舊序號，但舊 epoch 的所有封包一律廢棄
  - 新房主不接受任何「未完成新 handshake」的 Event
防重放的主機制 = connection_epoch + sequence_id（不是 client timestamp）。

host_received_at 只用於房主本地處理 queue（不是判斷 client 何時發出）：
  - Event 收到後若在房主處理 queue 中停留超過 5 秒才被驗證 → 直接丟棄
  - 不使用 client timestamp 判斷事件新舊（可偽造，只作 debug / 延遲估算）
```

**6. TURN / Signaling**
```
PeerJS / PeerServer 主要負責 signaling（連線協商），不等於 TURN relay。
  - MVP 使用 PeerJS / PeerServer 做 signaling
  - TURN server 需另行設定，候選方案另行評估：
    Open Relay Project / Cloudflare Realtime TURN / Metered / Twilio / 自架 coturn
  - 未設定 TURN 時：部分 NAT / 行動網路玩家可能無法建立連線
為避免濫用：
  - 每個房間最多 4 名玩家（已有設計）
  - 連線逾時：30 秒無封包 → 視為斷線
```

**7. Slot 配發競態（公開房）**
```
MVP 採用：
  - join token 不綁 slot_id → 由房主權威分配 slot（避免兩玩家拿到同一 slot 的有效 token）
  - reconnect token 必須綁原 slot_id（後端驗證該 slot 原屬此 uid，他人不可頂替）
進階方案（非 MVP 必要）：
  - reservation_id + TTL 預訂機制，但同一 slot 任一時刻只能有一張有效 token
```

**8. 新增 Edge Function 的防濫用**
```
issue_room_join_token / verify_room_join_token 兩個端點都要：
  - Rate Limit（防刷 token / 防探測）
  - consumed-nonce、verification record 設 TTL 自動清理
  - token 不得放 URL query string（會進 log / referrer）
    只能放 POST body 或 PeerJS data channel 第一包

active save 寫入 / 存檔退出 Edge Function（不分公私房，Q3）：
  - Rate Limit by auth.uid + room_id
  - 只允許 current_host_uid 呼叫
  - 檢查 room 狀態為 active
  - 檢查 data_revision（條件式回寫）
  - 同一 room 同時間只允許一個 save_exit processing（防併發重複存）
  - 寫 audit log
```

---

## 核心地基系統（實作規則）

> 對應 game-design-plan.md「建塔規則」章節，補充實作時需要的判定邏輯。

### 三維度模型（實作前必讀：本遊戲不是平面 2D）
```
三個維度：
  X（左右）：水平
  Y（上下）：高度（「高度不限」指這軸）
  Z（內外/深度）：建築由內（背景）往外（玩家面向）蓋

兩個深度層（Z 軸）：
  背景層（第一層）：只放泥土（土塊）= 地基。座標以 (x, y) 表示。
  前景層（第二層）：放在某 (x, y) 背景泥土的「前方」，
    = 沙 / 石 / 鐵 / 金 / 琉璃 / 鑽 + 梯子；前景方塊視覺上覆蓋背後的背景泥土。

資料上每個格位 (x, y) 可同時有：背景方塊（泥土 or 空）+ 前景方塊（第二層 or 空）。

核心本體：
  - 核心是 2x2x2 的立方體（X 寬2 × Y 高2 × Z 深2），正面是 2x2 面對玩家。
  - 核心「貼地」：Y 軸坐落在地面（不是浮空），水平置中。
  - 核心自己佔據的格位不能放泥土，正前方的 Z（前景）也不能蓋第二層方塊。
  - 第二層只能蓋在「核心周圍連出去的泥土」前方，不能蓋在核心本體前面。
```

### 用詞正式定義（第一層地基 vs 第二層方塊）
```
第一層（背景地基）= 泥土（土塊）ONLY。只有泥土能當核心地基。
  → 「泥土格」= 背景層的土塊；地基 / Hitbox / 連通性一律以「泥土格集合」判定。
第二層（前景，蓋在泥土前方）= 沙 / 石 / 鐵 / 金 / 琉璃 / 鑽（+ 梯子）。
  → 沙、石不是地基，是第二層物質，不可放進背景層、不可當連通基底。
方塊加成按種類各自計算（堆疊到核心，見 game-design-plan.md）：
  土=血量、沙=攻擊範圍、石=防禦、鐵=攻擊、金=攻速、琉璃=魔法、鑽=連鎖。
核心 Hitbox = 泥土格（背景）+ 覆蓋在其前方的第二層方塊（同 (x,y)）。
```

### 連通性定義（在背景泥土平面內判定）
```
核心地基 = 與核心 2x2 任一格在「背景平面」連續相鄰（X 左右 + Y 上下，4方向不含斜角）的泥土格集合
判定方式：BFS/DFS 從核心 2x2 格出發，沿背景泥土格擴展，可達的泥土格 = 核心地基
連通性只在背景平面內判定，不穿透深度（前景第二層方塊不參與連通性）
放置原則（核心貼著蓋）：一格能放泥土 = 它相鄰的是核心，或相鄰泥土能一路追溯回核心（源頭是核心）。
  不需要正下方有支撐：例如核心在 (x0~x1, y0~y1)，(x2,y1) 緊鄰核心可放泥土，
  即使 (x2,y0) 是空的也合法。核心本身貼地（不浮空），延伸出去的泥土才靠連通成立。
孤立泥土格（未與核心連通）= 不生效，不提供攻擊覆蓋，不計入 Hitbox
```

### 放置/拆除的連通性檢查
```
放置泥土（第一層，只有土塊）：
  - 新格放置後，若與核心連通 → 允許
  - 放置後仍孤立（不與核心連通）→ 禁止放置

拆除泥土：
  - 移除目標格後，重新跑一次 BFS
  - 若有任何原本連通的泥土格變成孤立 → 禁止拆除
  - 否則允許拆除
```

### 攻擊覆蓋合併邏輯
```
每個核心地基格各自以「核心攻擊範圍」為半徑產生攻擊覆蓋圓（或覆蓋區）
  核心攻擊範圍 = 基礎50 + 沙塊數量×1（單位 px，公式來源見 game-design-plan.md「核心攻擊與防禦機制」）
  注意：是全域單一的「核心攻擊範圍」值，不是每格各算一次；每格只是用同一個半徑各畫一個覆蓋圓
所有泥土格的覆蓋區合併（聯集）= 核心當前可攻擊區
怪物進入此合併區域 → 核心可攻擊怪物
```

### 怪物攻擊距離判定
```
怪物可攻擊高度 = 怪物身高（格）+ 怪物攻擊距離（格）
判定：怪物位置 + 可攻擊高度 範圍內，若有任一核心 Hitbox 格 → 造成核心扣血
（核心 Hitbox = 所有核心地基格，包含背景泥土格與覆蓋在其前方的第二層方塊，同 (x,y)）
```

### 效能注意
```
連通性 BFS 在地圖最大 160×100 格，每次操作觸發一次，成本可接受
但建議快取當前連通地基格集合，只在放置/拆除時重算，不要每幀跑
```

---

## 反作弊／輸入驗證機制

### 核心原則
玩家送「輸入」，不送「結果」。座標、數量、傷害值永遠由房主推算，不信任玩家回報的任何計算結果。

### 房主維護的權威狀態（每位玩家各一份）
```
- 當前位置（房主根據時間差×移動速度推算，不接受玩家回報座標）
- 背包內容（挖到方塊才加入，放置/存入才扣除）
- 最近挖礦時間戳列表（Sliding Window，用於 Rate Limit）
- 違規計數（累積 Strike）
```

### 各 Event 驗證規則

**移動 Event**
```
{ type: "move", direction: "WASD", timestamp }
- 只接受方向輸入，座標由房主推算
- 不接受任何「我現在在座標 (x,y)」類型的 Event
Rate Limit：每 50ms 最多 1 次移動 Event；超出丟棄，不計 Strike（屬輕微抖動）
```

**挖礦 Event**
```
{ type: "mine", target: {x, y}, mode: "click"|"hold", timestamp }
Rate Limit（Sliding Window，看最近 1 秒內累積筆數）：
  - click 模式：1秒內超過 10 筆 → 非法
  - hold 模式：1秒內超過 5 筆 → 非法
其他驗證：
  - 目標格距玩家位置 ≤ 2格
  - 目標格在礦山可見範圍內（30格）且尚未被挖空
  - 挖礦傷害由房主根據玩家「挖掘能力數值」計算，不信任玩家回報
```

**放置方塊 Event**
```
{ type: "place", blockType: "iron", position: {x, y} }
驗證：
  - 玩家背包有這個方塊（對照房主維護的背包狀態）
  - 玩家與目標格距離 ≤ 2格（以玩家當前位置計算，站在梯子/平台上同樣適用）
  - 結構合法性：
    → 第一層（背景泥土，只有土塊）：必須與現有連續泥土在背景平面相鄰（X/Y 四方向）
    → 第二層（前景 沙/石/鐵/金/琉璃/鑽 + 梯子）：同 (x,y) 的背景必須已是連通泥土
       （第二層蓋在泥土前方，會覆蓋背景泥土；不是「正下方」要有泥土）
  - 目標格目前為空、在地圖範圍內（x: 0~1600, y: 0~1000）
  - 若目標是核心地基 / 連通泥土，必須在最大建造範圍內：
    - 從核心中心往左最多 35 格、往右最多 35 格
    - 高度最多 100 格
    - 超出範圍的核心地基放置直接拒絕
```

**存入塔內資源欄 Event**
```
{ type: "deposit", items: [{blockType: "stone", qty: 3}, ...] }
驗證：
  - 玩家位置在有泥土的背景層上方（觸發條件）
  - 背包有足夠數量
  - 目標欄位存在且合法（快捷鍵 1~0，共10格）
  - 防重複提交：同一 sequence_id 只處理一次
```

**Event 完整性**
```
每個 Event 必須帶：
  - connection_epoch（房主於每次建立連線時分配）：房主丟棄舊 epoch 殘留封包
  - sequence_id（該 epoch 內遞增整數）：房主偵測跳號/重複/回退
player_uid 不放進每個 Event 作判斷：
  - player_uid 由 handshake（room_join_token verify）驗證後，綁定在 connection/session 上
  - 房主處理 Event 時，從該 connection/session 取得 player_uid
  - 若封包 payload 內含 player_uid，只能作 debug，不得作權限判斷
在房主處理 queue 中停留超過 5 秒才被驗證的 Event 直接丟棄（以 host_received_at 計，不採信 client timestamp）
詳見「P2P 安全限制」章節 4d Epoch 定義 / 5b 封包規則
```

### 違規分級處理

| 等級 | 觸發條件 | 處理 |
|---|---|---|
| 輕微（Low） | 時序抖動/網路延遲可能正常產生 | 丟棄 Event + 修正廣播，不計 Strike |
| 可疑（Medium） | 正常遊戲少見，不排除 UI 連點或封包重傳 | 丟棄 + 修正廣播 + 計 1 Strike；累積 5 Strike → 踢出 |
| 明顯作弊（High） | 正常遊戲絕對不可能發生（例：背包沒有卻放置） | 立即踢出 |

> Strike 以 `auth.uid + room_id + slot_id` 為 key，保留到該場遊戲結束。重連不清零，防止惡意玩家用「作弊→被踢→重連」循環繞過限制。

---

## 斷線重連機制

### 分流
```
房主斷線 → Host Migration（已設計，見 Multiplayer 架構章節）
房員斷線 → 本節的重連流程
```

### 斷線偵測
```
PeerJS 連線斷開後，房主等待 3 秒確認（防瞬斷誤判）
3 秒內重連 → 直接進重連流程
3 秒後仍未連入 → 正式標記該 Slot 為 disconnected，開始保留計時
```

### Slot 保留時間
```
保留到「本場遊戲結束」為止（核心陣亡 or 房主選擇存檔退出）
遊戲結束前：原玩家隨時可重連回原 Slot
遊戲結束後：Slot 釋放，不觸發永久鎖定規則
  （Slot 鎖定只在「開局時某 Slot 從未有人進入」時觸發，斷線後遊戲結束不算）
```

### 重連身份驗證（與加入一致，用後端短效 room_join_token，不傳 Supabase JWT）
```
1. 玩家用自己的 Supabase session 呼叫 Edge Function issue_room_join_token
   申請 join_type = "reconnect" 的 token
   - reconnect token 必須綁原 slot_id
   - Edge Function 驗證該 uid 確為該 disconnected Slot 的原持有者
2. 玩家把 room_join_token 在 data channel 第一包送給房主（不放 URL）
3. 房主呼叫 Edge Function verify_room_join_token：
   - 驗簽 + exp + nonce 一次性 consumed + 未被 kicked/banned
   - 回傳 verified { uid, room_id, slot_id, join_type }
4. 房主一律採用後端 verified uid / slot_id，不信任 client 明文欄位
5. 房主再確認：該 slot 仍處 disconnected 且 Slot 保留期未結束（遊戲進行中）
全部通過 → 允許重連回原 Slot
任一失敗 → 視為新玩家，走正常加入流程
```

### 斷線期間角色狀態
```
- 角色凍結在最後位置，不移動
- 背包內容凍結，不被清除
- 靈動能力對核心的 buff 暫停計算（不讓不在線的玩家繼續加成）
- 遊戲繼續進行（怪物 AI、傷害計算不暫停）
```

### 重連後狀態同步
```
房主廣播 Full Snapshot 給重連玩家（含地圖層/進度層/玩家層/共享資源層/房間層）
房主對該重連連線分配新的 connection_epoch
重連玩家收到後：
  - 在新 connection_epoch 下，sequence_id 從 0 重新計數
  - 舊 epoch 殘留封包一律廢棄
  - 靈動能力 buff 恢復計算
```

### 遊戲結束時斷線 Slot 的資源處理
```
背包內資源 → 轉入塔內資源欄（有空位就放）
塔內資源欄放不下的部分 → 遺失
```

---

## Schema Versioning（存檔版本相容性）

> Save File 和玩家帳號資料各自獨立版本化，開工時就在頂層加版本欄位。

### 資料頂層欄位

```json
{
  "schema_version": 1,
  "data_revision": "2026-06-21T00:00:00Z",
  "migrated_from_version": null,
  "migrated_at": null,
  "client_build_version": "0.1.0"
}
```

| 欄位 | 用途 |
|---|---|
| `schema_version` | 判定是否需要 Migration |
| `data_revision` | 條件式回寫用（防並發覆蓋） |
| `migrated_from_version` | 記錄這份資料從哪個版本升上來 |
| `migrated_at` | Migration 完成時間 |
| `client_build_version` | 執行 Migration 的遊戲版本 |

### 讀取時的版本判定

```
schema_version > CURRENT_VERSION
  → 拒絕讀取，拒絕任何寫回，提示玩家重新整理頁面
  （不讓舊版遊戲覆蓋新版資料）

schema_version === CURRENT_VERSION
  → 直接使用

schema_version < CURRENT_VERSION
  → 進入 Migration chain（見下方）
```

### Migration Chain

```
每個 migration 函數只負責「vN → vN+1」，串接跑完所有需要的升級：

function migrate(data) {
  if (data.schema_version < 2) data = migrate_v1_to_v2(data)
  if (data.schema_version < 3) data = migrate_v2_to_v3(data)
  // ...
  return data
}
```

**Migration 必須是 Idempotent：**
```
跑 1 次、跑 2 次、跑到一半重跑 → 結果相同
✅ data.attack_range = Math.round(data.attack_range_px / 10)  // 覆寫，安全
❌ data.attack_range += data.attack_range_px / 10             // 累加，重跑會爆
```

### 升版規則

| 變更類型 | 做法 |
|---|---|
| 新增純 optional 欄位（缺少時所有邏輯仍正常） | 補預設值，**不升版本號** |
| 新增欄位但會影響戰鬥/抽獎/存檔判定/玩家收益 | **升版 + 寫 Migration** |
| 欄位改名 / 刪除 | **升版 + 寫 Migration** |
| 欄位語意改變（例如單位從 px 改成格） | **升版 + 寫 Migration** |

### 條件式回寫（防並發覆蓋）

```sql
UPDATE save_files
SET data = $new_data,
    schema_version = $new_version,
    data_revision = now()
WHERE id = $save_id
  AND schema_version = $old_version
  AND data_revision = $old_revision

-- 如果更新 0 行（條件不符）：
--   重新讀取最新資料 → 重新判斷是否還需要 Migration → 重新跑（idempotent 安全）
```

### 並發與舊版客戶端保護

| 情境 | 處理方式 |
|---|---|
| 同一玩家開兩個分頁同時跑 Migration | 條件式回寫：後跑的撞條件失敗 → 重讀 → 已是新版 → 跳過 |
| Migration 中途關閉瀏覽器 | 下次開啟重跑，idempotent 保證安全 |
| Migration 成功但回寫失敗 | 下次開啟重跑（DB 仍是舊版，重新觸發） |
| 舊版遊戲讀到新版存檔 | 拒絕讀取 + 拒絕寫回 |
| Save File + 帳號資料同時需要升版 | 兩份都 Migration 成功才回寫，任一失敗皆不寫 |

---

## 金流／儲值架構

### MVP 階段（不接真金流）
```
Admin 手動開通 VIP / 發放鑽石給測試帳號
先建好以下三張表，上線時直接接，不需重做：
  - orders：每筆購買意圖（建立 Checkout Session 時寫入）
  - payment_logs：每個 Webhook 事件記錄（只存必要欄位，見下方欄位規範）
  - entitlements：玩家實際獲得的權益（VIP 到期時間、鑽石數量）
```

### 第一版真金流流程（Stripe）
```
前端 → 呼叫 Edge Function（只傳商品 ID）
→ Edge Function 查 server 端商品表（price / currency / product_id 全由 server 決定，不信任前端傳入）
→ 建立 Stripe Checkout Session → 回傳 session_url → 前端跳轉付款頁

Stripe Webhook（Edge Function 處理）：
  - 驗證 Stripe signature（必做，防偽造）
  - 只在以下事件後發貨：
      payment_intent.succeeded / invoice.paid / checkout.session.completed
  - Idempotency：以 stripe_session_id / payment_intent_id / invoice_id 去重
      （同一 ID 第二次進來 → 直接回 200，不重複發貨）
  - 寫入 payment_logs（只存必要欄位，見下方規範）
  - 發貨成功 → 更新 entitlements
  - 發貨失敗（DB 錯誤等）→ 保留 pending_fulfillment，允許後台補發
```

### payment_logs 欄位規範（不長期保存完整 raw payload）
```
預設只保存必要欄位：
  provider、event_id、event_type、order_id、amount、currency、
  status、received_at、processed_at、error_code
理由：完整 webhook raw payload 可能含個資 / 卡片相關敏感欄位，
      長期原樣保存會擴大資料外洩與合規風險。

若仍需保存 raw payload（例如爭議調查）：
  - 必須遮罩敏感欄位（PII、卡號相關、email 等）
  - 必須設定保存期限（到期自動清除），不可無限期保留
```

### 台灣玩家金流分工

| 金流 | 支援付款方式 | 目標族群 |
|---|---|---|
| Stripe | 信用卡、Apple Pay、Google Pay | 習慣海外付款、海外玩家 |
| ECPay / NewebPay | 超商代碼、ATM 轉帳、台灣信用卡 | 學生、沒信用卡、小額儲值、不想綁卡 |
| Payoneer | 跨境收款備用 | 非玩家儲值主流程 |

> ECPay / NewebPay 於台灣正式上線前加入，Stripe 先作為第一版。

### 付款 UX 必要提示（點付款前顯示）
```
- 「將前往安全付款頁」
- 商品內容、價格、幣別
- 鑽石不可兌現、道具不可換現金
- 退款規則、預計發貨時間
- 付款失敗 / 未發貨時的客服聯絡方式
```

### 避免被定義為賭博的設計規則
```
- 鑽石不可兌現
- 道具不可換現金
- 不提供玩家間現金交易
- 抽獎機率公開（遊戲內明顯入口）
- 付款前明確顯示商品內容、價格、退款規則
```

---

## 隱私權與法規合規

### 台灣上線前必做

```
1. 隱私權政策
2. 服務條款 / 使用者契約
3. 付款與退款規則
4. 抽獎機率公開（遊戲內明顯入口，不能只放在服務條款裡）
5. 未成年人消費提醒 / 家長同意條款
6. 客服與申訴聯絡方式
7. 帳號停權 / 作弊處理規則
8. 虛擬商品不可兌現聲明
```

### 抽獎機率公開規格

**揭露位置：**
- 抽獎畫面必須有明顯「機率」入口（玩家抽之前就能看到）
- 購買鑽石頁也必須能連到機率頁

**機率頁必須包含：**
```
- 每個獎項 / 獎項類別的機率
- 稀有度總機率與單品機率
- 8×8 盤面規則說明
- 抽到後是否清格
- 盤面重置條件（4種大獎全清空才重置）
- 是否有保底（目前設計：無保底，需明確寫出）
- 不同活動池各自的機率（若未來有活動池）
- 機率版本號與更新日期
```

### 上線後補
```
- GDPR 資料刪除請求流程
- 帳號刪除自助流程（帳號設定頁加「刪除帳號」按鈕）
```

### 暫不做
```
- CCPA / PIPEDA / SOC 2（除非明確進入美國加州、加拿大或企業客戶市場）
```

---

## 新手教學 Onboarding

### 設計原則
```
新玩家註冊後必須先完成一次強制新手教學
完成前不能進入單人模式、多人模式、房間列表或正常抽獎
教學任務未完成時，遊戲時間不推進，流程不進入下一步
玩家中途退出或未完成教學，下次進入遊戲必須從頭重新跑完整教學
教學打完第 1 關後，自動退出教學房
完成教學後，解鎖單人 / 多人模式
完成教學後出現第一個任務：通關第 5 關
通關第 5 關任務獎勵：20 抽
操作失敗原因提示：不限次數，每次失敗都顯示
設定頁 / 選單：提供「重看教學」入口
```

### 第 0 關初始資源包

教學與新開局使用同一包第 0 關初始資源：

```md
土 x5
沙 x5
石 x5
鐵 x1
金 x1
鑽 x1
```

規則：

```md
房間共享一包。
單人 / 多人都是同一包，不依玩家數放大。
直接放入塔內共享資源欄。
只在新開局給一次。
讀取既有存檔不重複給。
```

### 強制教學內容

教學至少要介紹：

```md
核心是什麼：核心血量歸零就輸。
方塊用途：土加血、沙加範圍、石加防禦、鐵加攻擊、金加攻速、鑽加連鎖。
怎麼建造：泥土必須連接核心，孤立泥土不能放。
怎麼挖礦：去礦山、敲方塊、背包滿了回家。
怪物是什麼：人族晚上進攻，只會打核心。
怎麼修復：站在核心地基上按 R / 手機修復鍵。
撐過第 1 關後結束教學。
```

### MVP 必做觸發點

| 觸發時機 | 提示內容 | 類型 |
|---|---|---|
| 開局後第一次白天 | 「往左/右走去礦山挖礦吧」 | 情境教學（一次） |
| 第一次放置泥土 | 「泥土是核心地基，讓核心能攻擊更遠的範圍」 | 情境教學（一次） |
| 第一次放置孤立泥土失敗 | 「泥土必須連接既有地基才能放置」 | 失敗原因（每次） |
| 第一次背包滿 | 「背包已滿，靠近核心可以自動卸貨」 | 情境教學（一次） |
| 第一次晚上開始 | 「怪物要來了！先回家守護核心」 | 情境教學（一次） |
| 第一次核心受傷 | 「核心受傷了！站在地基上按 R 可以修復」 | 情境教學（一次） |
| 第一次王關 | 「打倒 Boss 後可以選一張強化卡片」 | 情境教學（一次） |

### 教學結束後抽獎 / 裝備升級流程

教學第 1 關完成後：

```md
1. 自動退出教學房。
2. 獎勵玩家 5 抽。
3. 強制帶玩家進入抽獎教學。
4. 抽獎教學固定結果：
   - 3 件相同款式 0 級裝備
   - 1 個銀幣
   - 1 件 4 級裝備（大獎）
5. 介紹掉落、機率入口、大獎效果與抽獎盤換盤。
6. 強制帶玩家進入裝備升級教學。
7. 使用教學銀幣完成一次 0 級 → 1 級合成。
8. 完成後才解鎖正常單人 / 多人模式。
```

注意：

```md
教學 5 抽使用固定結果，不使用正式隨機。
教學銀幣只保證完成第一次合成教學。
正式抽獎盤「少 / 中 / 多」銀幣、金幣、票券數值仍待後續設計。
```

### 常見錯誤提示樣板（每次操作失敗都顯示）
```
- 泥土放置失敗：「泥土必須連接既有地基」
- 背包滿無法挖礦：「背包已滿，先回核心卸貨」
- 修復失敗（不在地基上）：「需要站在泥土地基上才能修復核心」
```

---

## 已知風險記錄

| 風險 | 說明 | 決策 |
|---|---|---|
| Save File 篡改 | 前端 Request 理論上可被攔截篡改 | 低優先，進階攻擊，暫不處理 |
| Host Migration 狀態倒退 | 新房主狀態可能比其他人舊 | 設計上接受小幅倒退 |
| Event Log 上傳間隔遺失 | 批次上傳間隔內斷線，最後不到30秒的 Event 會遺失 | 小風險，暫不處理 |
