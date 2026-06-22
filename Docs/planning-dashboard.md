# Planning 進度 Dashboard
> 最後更新：2026-06-22（補第0關初始資源包、強制新手教學+5抽抽獎/裝備升級教學、自動Emoji；修正AI開場讀取流程納入 Docs/source-map.md）
> 用途：追蹤所有討論過的問題狀態，避免長對話導致脈絡遺失
> 對應文件：`game-architecture-plan.md`（技術架構）、`game-design-plan.md`（玩法設計）

---

## 圖例
✅ 已解決並寫入文件　|　📝 規格已定，尚未實作（寫程式時才落實）　|　🟡 處理中 / 部分確認　|　🔲 待討論　|　⚠️ 已知風險（暫不處理）

---

## 技術架構（對應 game-architecture-plan.md）

| 項目 | 狀態 | 備註 |
|---|---|---|
| 技術棧選定 | ✅ | HTML+JS / PeerJS / Supabase / Vercel |
| 部署平台選擇 | ✅ | Vercel（優於 GitHub Pages，自動部署） |
| 換行符號規範 | ✅ | LF，用 .gitattributes 強制 |
| 帳號系統 | ✅ | Supabase Auth，強制註冊，不接受匿名 |
| 密碼處理方式 | ✅ | Supabase Auth 內建 bcrypt，不用 SHA-256 |
| 忘記密碼流程 | ✅ | Supabase 內建重設 Email |
| 私人房建立/加入流程 | ✅ | 房間碼綁定房主 uid，密碼可覆蓋不可解密 |
| 私人房存檔上限 | ✅ | 3個，Migration特例4個，第5個需先刪除 |
| 存檔轉移功能 | ✅ | 雙方同時在線+確認，未來功能 |
| Multiplayer 架構 | ✅ | P2P（PeerJS）+ Event-driven State Sync，採用 Star／房主中心拓撲（非Full Mesh），已與Codex確認 |
| 邏輯權威分工 | ✅ | 怪物AI/傷害計算在房主端；房員送 Input Event 給房主，房主驗證後廣播權威結果 |
| Host Migration 流程 | ✅ | 最早加入者(candidate_host)為唯一合法候選，CAS 僅防雙寫；小幅倒退可接受 |
| 公開房 Lobby 邏輯 | ✅ | War3式，第一人進房自動房主，可轉讓 |
| 公開房中途加入機制 | ✅ | 每晝夜循環結束時房主決定+30秒準備 |
| 公開房存檔歸屬 | ✅ | active save 跟著當下 current_host_uid（走 Edge Function）；最後一人離開房間即消失；存檔退出才轉正式 save_files |
| 房主身份驗證機制 | 📝 規格已定，未實作 | 連線用後端短效 room_join_token（不傳Supabase JWT）+ Edge Function verify（nonce一次性）；房主身份由 room record current_host_uid/peer_id 反向驗證；已寫入 game-architecture-plan.md |
| Event Log 記錄範圍 | ✅ | 全部記錄，30秒批次上傳 Supabase，房主統一上傳；player_uid 由房主從 session 補上標記操作者（非 client 自報，見 game-architecture-plan.md Event 完整性） |
| 玩家帳號資料結構 | ✅ | 六大屬性/裝備庫存/技能點/抽獎盤狀態/雙倍獎勵充能，跨房間通用，獨立於Save File |
| Save File 資料結構 | ✅ | 5層定案：地圖/進度/玩家(背包)/共享資源/房間，含Slot鎖定規則 |
| RLS 權限設計 | 🟡 | 正式 save_files owner_id=uid 可行；多人 active save（不分私人房/公開房）需走 Edge Function 驗 current_host_uid + room active + data_revision，不能只靠 owner_id=uid。**P0 開工第一件事**（沒有 RLS = 任何登入玩家可讀所有人存檔） |
| P2P（PeerJS）安全限制 | 📝 規格已定，未實作 | room_join_token handshake（後端 verify、nonce 一次性、不傳JWT）/ 房主反向身份驗證 / Host Migration token 重發+CAS / connection_epoch+sequence_id 防重放 / host_received_at queue timeout / slot 由房主分配 / Edge Function rate limit / IP暴露揭露 / 封包大小限制 / signaling≠TURN，已寫入 game-architecture-plan.md，待開工實作 |
| JWT Token 過期與 refresh | 📝 規格已定，未實作 | onAuthStateChange 靜默刷新；過期不等於作弊，已寫入文件，待實作 |
| XSS 防護規範 | 📝 規格已定，未實作 | 玩家輸入只用 textContent，禁用 innerHTML，已寫入文件，待開工落實 |
| Save File 內容驗證（防篡改） | ⚠️ | 已知風險，低優先，暫不處理 |
| MVP 開發範圍 | ✅ | 先做單人版，localStorage存檔，無PeerJS/Supabase，白天無真實倒數 |
| 反作弊／輸入驗證機制 | ✅ | 房主端 Sliding Window（點擊100ms/長按200ms）+ 移動50ms Rate Limit + 互動距離≤2格+結構合法性 + 三級違規（輕微不計/可疑累積5Strike/明顯立即踢）+ Event序號防重放 + Strike以uid+room_id+slot_id保留到場結束（重連不清零），已同步進 game-architecture-plan.md |
| 斷線重連機制 | ✅ | Slot保留到遊戲結束；reconnect 用綁原slot_id的 room_join_token（後端 verify）；斷線期間角色凍結、靈動buff暫停；重連後Full Snapshot+新connection_epoch；遊戲結束時背包轉塔內資源欄，已同步進 game-architecture-plan.md |
| Save File／帳號資料版本相容性 | ✅ | Schema Versioning 已定案：schema_version+data_revision+idempotent Migration chain+條件式回寫+並發保護，已同步進 game-architecture-plan.md |
| 金流／儲值串接方案 | ✅ | MVP不接真金流（刪檔封測階段玩家無法付費）；架構已設計（Stripe+Edge Function+Webhook idempotency+ECPay/NewebPay）；訂閱失敗降級/退款chargeback處理在接真金流前補完 |
| 隱私權／法規合規 | ✅ | 上線前8項必做（含抽獎機率公開規格、未成年保護、客服聯絡等）；上線後補GDPR刪除流程；暫不做CCPA/SOC2，已同步進 game-architecture-plan.md |

---

## 玩法設計（對應 game-design-plan.md）

| 項目 | 狀態 | 備註 |
|---|---|---|
| 世界觀/核心玩法 | ✅ | 來自 project_summary.md 原始草稿 |
| 哥布林角色數值 | ✅ | 六大數值已列出公式 |
| 技能點數系統 | ✅ | 每級1點，每點+10%，最高10級 |
| 梯子與多層建築 | ✅ | 無限梯子道具，可蓋多層結構 |
| 裝備系統（款式與合成） | ✅ | 5類別×10款式(A~J)，各取最高等級加總；只能同款式合成 |
| 核心建築基礎數值 | ✅ | 攻擊/血量/防禦/範圍公式確認 |
| 方塊系統（耐久/重量/加成） | ✅ | 沙土石鐵金琉璃鑽 7種已列出 |
| 礦山系統 | ✅ | 左右2座礦山，10x3可見格+機率表，存檔只存當下可見內容 |
| 核心攻擊/傷害公式 | ✅ | 物理+魔法傷害合算，連鎖機制確認 |
| 核心血量歸零規則 | ✅ | 血量歸零＝遊戲結束 |
| 王關+卡片投票機制 | ✅ | 投票規則、卡片3分類確認 |
| 遊戲節奏（晝夜時長） | ✅ | 白天1分/晚上1分/開局30秒準備；第0關初始資源包=房間共享土5/沙5/石5/鐵1/金1/鑽1，不隨人數放大 |
| 公開房準備時間 | ✅ | 繼續挑戰時額外30秒可聊天 |
| 遊戲內 UI 佈局 | ✅ | 完整列出（來自原始草稿） |
| 房間系統 UI 流程 | ✅ | 建房Popup/房間列表/等待房間，含可見性與密碼邏輯 |
| 難度系統影響範圍 | ✅ | Must Solve 4 MVP 版收尾：1-20 為主要校準區；N 人普通怪 xN、N 人出 N 隻 Boss；正式加時為 60 秒後每 5 秒攻擊翻倍；21-30 暫作隨機血量/傷害增壓阻擋區 |
| 首頁 UI 佈局 | ✅ | 完整列出（來自原始草稿） |
| 王關編號與晝夜計數對齊 | ✅ | 個位數=關卡數，逢10=王關 |
| 霸體觸發條件 | ✅ | 常駐被動，玩家永不被攻擊，只有核心會被攻擊 |
| 建築策略（Must Solve 3） | 🟡 | 核心規則已確認（三維度深度模型：第一層背景泥土=地基、第二層前景=沙石鐵金琉璃鑽蓋在泥土前方/連通性在背景平面判定/Hitbox/第二層非防禦牆/怪物攻擊高度/修復觸發/3種策略方向），待格子化模擬驗證生存率差異，已同步進 game-design-plan.md + game-architecture-plan.md + mustsolve.md |
| 新方塊擴充設計原則 | 🔲 | 尚未討論 |
| 抽獎系統機制 | ✅ | 8x8盤/64格，固定組成比例，4大獎合計7格清空換盤，1票券1抽 |
| 資源經濟設計錨點（票券發放率） | ✅ | Top-down反推：1張票券/關，極限玩家2個月可全裝滿10級 |
| 雙倍獎勵充能系統 | ✅ | 取代體力系統；F2P上限1/VIP上限3，4hr回1點，整場獎勵翻倍，結算後選用；正常玩家實際使用模式＝4場各1hr，頭尾2場x2、中間1倍(非整天x2) |
| 成就系統 | 🔲 | 僅在首頁UI提及，無細節 |
| 好友/私聊系統 | 🔲 | 僅在首頁UI提及，無細節 |
| 商店系統 | 🔲 | 僅在首頁UI提及，無細節；「每日商店」規則已有初步描述，待細談 |
| 30關官方結算 / Endless Mode | ✅ | 無上限可無限玩，30關後怪物數值可爆炸式提升，曲線細節未定 |
| 怪物生成/移動/分批邏輯 | 🟡 | 落點(攻擊範圍+10~20格)/分批公式/組成公式已定，移動速度仍是假設(5格/秒)待確認 |
| 怪物攻擊機制(攻速/加時賽) | ✅ | 攻速2秒1次，60秒未清完進入30秒加時賽(每5秒攻擊力翻倍)，加時賽後處理方式待補 |
| 怪物攻擊力/血量數值 | ✅ | MS4 MVP 版已定：1-20 以 `Docs/waveplan.md` 為主；11-15 跑者/工兵攻擊+1、16-20 +2；第20為硬門檻；21-30 暫作隨機血量/傷害增壓阻擋區 |
| 卡片系統與局內流派（Must Solve 5） | ✅ | 18張第10關MVP卡池、100/150/200價值點、固定3槽位出卡、偏弱/標準/偏強分層、卡片顯示標籤已定；詳見 `Docs/bosscard.md` |
| 多人合作分工（Must Solve 6） | ✅ | MVP版定案：不強制分工、不額外懲罰；多人意圖Emoji/ping wheel，⛏️挖礦、🧱建築、🦵搬運、🔧修復、⚠️危險回防；房員欄與角色頭上顯示30秒；系統可依玩家行為自動顯示Emoji，手動選擇覆蓋30秒 |
| MVP 驗證標準（Must Solve 7） | ✅ | 已建立 `Docs/mvp-validation.md`：測試對象、流程、成功標準、觀察表、失敗歸因與 MVP 通過標準 |
| 核心攻擊範圍單位 | ✅ | 確認=px(50px=5格)，與地圖10px/格換算一致 |
| 操作輸入方式 | ✅ | WASD+滑鼠點擊/長按，手機搖桿+專屬挖礦鍵，挖掘能力只影響傷害量不影響次數上限 |
| 玩家等級XP曲線 | ✅ | 錨點7天Lv20/30天Lv30/180天Lv60，兩段power law拼接 |
| 銀幣技能點花費曲線 | 🟡 | Lv1~10曲線已定，尚未跟抽獎"少中多"銀幣收入對過 |
| 新手教學／Onboarding流程 | ✅ | 新玩家註冊後強制完成教學，未完成則下次重頭；教學第1關結束送5抽並強制抽獎/裝備升級教學；完成後解鎖單人/多人並出現通關第5關任務獎勵20抽 |

---

## 下一步建議討論順序

### 玩法數值／模擬（Codex 負責，見 mustsolve.md + simulation/）
1. 🟡 Must Solve 2：怪物職能與敵人設計（半成品；MVP 可先實作目前敵人表，後續依實玩補職能）
2. 🟡 Must Solve 3：建築策略與方塊取捨（核心規則已確認，待格子化模擬與實玩驗證）
3. 🔲 MVP 實作前整理：把 `Docs/source-map.md`、`Docs/waveplan.md`、`Docs/bosscard.md`、`Docs/mvp-validation.md` 轉成開工 checklist
4. 🔲 每日商店規則細節（廣告刷新3次/6樣商品/銀幣金幣購買邏輯）— 已有初步描述，需要收尾
5. 🔲 「少中多」實際數值 + 銀幣合成消耗數值 — 連帶要驗證銀幣技能點經濟夠不夠用
6. 🔲 商店 / 成就 / 好友系統 — 非核心玩法
7. 🔲 新方塊種類擴充設計原則 — 暫不急
8. 🔲 加時賽30秒結束後仍未清完怪的處理方式

### 架構審查（Claude 負責，與Codex交叉確認後同步文件）
1. ✅ PeerJS 連線拓撲（Star／房主中心，已與Codex確認，已同步文件）
2. ✅ 反作弊／輸入驗證機制（已定案，同步進 game-architecture-plan.md）
3. ✅ 斷線重連機制（已定案，同步進 game-architecture-plan.md）
4. ✅ Save File／帳號資料版本相容性（Schema Versioning，已定案）
5. ✅ 金流／儲值串接方案、隱私權與法規合規、新手教學流程（已全部定案）

### 其他
- 🟡 RLS Policy SQL 撰寫 — P0，開始接 Supabase 資料表/帳號功能時第一件事；單機 localStorage MVP 可暫不需要

---

## 使用說明

每次重大決策確認後，請提醒我同步更新此 Dashboard + 對應文件，避免討論內容只存在對話紀錄中遺失。
