# Planning 進度 Dashboard
> 最後更新：2026-07-13（v0.0.42.0 T27：15 秒 Host 靜默偵測 + 30 秒總重連窗口 + 重新開頁「返回進行中的房間」+ 後端 membership 綁原 Slot；雙 origin 實測回到 p2 / Full Snapshot；Edge Function 已部署；待獨立驗收方補驗收記錄）
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
| 房主身份驗證機制 | ✅ 已實作 | room_join_token handshake：peerClient.js 呼叫 `issueRoomJoinToken`；peerHost.js 呼叫 `verifyRoomJoinToken`；auth handshake 已上線 |
| Event Log 記錄範圍 | ✅ | 全部記錄，30秒批次上傳 Supabase，房主統一上傳；player_uid 由房主從 session 補上標記操作者（非 client 自報，見 game-architecture-plan.md Event 完整性） |
| 玩家帳號資料結構 | ✅ | 六大屬性/裝備庫存/技能點/抽獎盤狀態/雙倍獎勵充能，跨房間通用，獨立於Save File |
| Save File 資料結構 | ✅ | 5層定案：地圖/進度/玩家(背包)/共享資源/房間，含Slot鎖定規則 |
| RLS 權限設計 | 🟡 | 正式 save_files owner_id=uid 可行；多人 active save（不分私人房/公開房）需走 Edge Function 驗 current_host_uid + room active + data_revision，不能只靠 owner_id=uid。**P0 開工第一件事**（沒有 RLS = 任何登入玩家可讀所有人存檔） |
| P2P（PeerJS）安全限制 | ✅ | ✅ 已做：room_join_token handshake、slot 由房主分配、StrikeTracker 反作弊、connection_epoch+sequence_id 防重放、host_received_at queue timeout、重連 maxAttempts 防轟炸；⚠️ Edge Function rate limit 仍屬後端部署層補強 |
| JWT Token 過期與 refresh | ✅ 已實作 | authManager.js `onAuthStateChange` 已接 Supabase 內建靜默刷新 |
| XSS 防護規範 | ✅ 已實作 | waitingRoom.js 全部玩家輸入用 `textContent`，無 innerHTML 拼接 |
| Save File 內容驗證（防篡改） | ⚠️ | 已知風險，低優先，暫不處理 |
| 多人聯機上線 | ✅ | PeerJS P2P（Star 拓撲）+ Supabase Auth（Google OAuth/匿名）+ 房間系統（建房/列表/踢人/開始）正式上線；localStorage 存檔仍保留作為單人備援 |
| 反作弊／輸入驗證機制 | ✅ | 房主端 Sliding Window（點擊100ms/長按200ms）+ 移動50ms Rate Limit + 互動距離≤2格+結構合法性 + 三級違規（輕微不計/可疑累積5Strike/明顯立即踢）+ Event序號防重放 + Strike以uid+room_id+slot_id保留到場結束（重連不清零），已同步進 game-architecture-plan.md |
| 斷線重連機制 | 🟡 | T24 功能鏈 + T27 v0.0.42.0 實機收口：正常瞬斷約 4.2 秒恢復；Host 靜默 15 秒偵測；最後 Host 訊息起 30 秒停止自動重試但保留 Slot；重新開頁可返回 active room、後端綁原 membership slot、Host Full Snapshot 回到 p2。雙 origin 實作方自測通過，Edge Function 已部署；待不同驗收方補 `Docs/history/codex-prompt-T27.md` 驗收記錄。 |
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
| 遊戲節奏（晝夜時長） | ✅ | prep(30s)→day(60s)→night(60s)循環，卡片後也給prep→day；第0關初始資源包=房間共享土5/沙5/石5/鐵1/金1/鑽1，不隨人數放大 |
| 公開房準備時間 | ✅ | 繼續挑戰時額外30秒可聊天 |
| 遊戲內 UI 佈局 | ✅ | 完整列出（來自原始草稿） |
| 房間系統 UI 流程 | ✅ | 建房Popup/房間列表/等待房間，含可見性與密碼邏輯 |
| 難度系統影響範圍 | ✅ | Must Solve 4 MVP 版收尾：1-20 為主要校準區；N 人普通怪 xN、N 人出 N 隻 Boss；正式加時為 60 秒後每 5 秒攻擊翻倍；21-30 暫作隨機血量/傷害增壓阻擋區 |
| 首頁 UI 佈局 | ✅ | 完整列出（來自原始草稿） |
| 王關編號與晝夜計數對齊 | ✅ | 個位數=關卡數，逢10=王關 |
| 霸體觸發條件 | ✅ | 常駐被動，玩家永不被攻擊，只有核心會被攻擊 |
| 建築策略（Must Solve 3） | ✅ | 連通性 BFS + canPlaceDirt/canRemoveDirt 已上線；格子化 Hitbox、攻擊覆蓋合併已實作；3 種策略方向已確認；MVP 實玩驗證生存率差異留後續 |
| 新方塊擴充設計原則 | 🔲 | 尚未討論 |
| 抽獎系統機制 | ✅ | 8x8盤/64格，固定組成比例，4大獎合計7格清空換盤，1票券1抽 |
| 資源經濟設計錨點（票券發放率） | ✅ | Top-down反推：1張票券/關，極限玩家2個月可全裝滿10級 |
| 雙倍獎勵充能系統 | ✅ | 取代體力系統；F2P上限1/VIP上限3，4hr回1點，整場獎勵翻倍，結算後選用；正常玩家實際使用模式＝4場各1hr，頭尾2場x2、中間1倍(非整天x2) |
| 成就系統 | 🔲 | 僅在首頁UI提及，無細節 |
| 好友/私聊系統 | 🔲 | 僅在首頁UI提及，無細節 |
| 商店系統 | ✅ | 每日商店規則已模擬定案（`economy-sim-log.md` 任務5/6）並寫入 `config/economyConfig.js`、引擎 wiring 進 `src/ui/shopPanel.js`；測試覆蓋 T22 v0.0.34.0 已補齊 |
| 30關官方結算 / Endless Mode | ✅ | 無上限可無限玩，30關後怪物數值可爆炸式提升，曲線細節未定 |
| 怪物生成/移動/分批邏輯 | 🟡 | 落點(攻擊範圍+10~20格)/分批公式/組成公式已定，移動速度仍是假設(5格/秒)待確認 |
| 怪物攻擊機制(攻速/加時賽) | ✅ | 攻速2秒1次，60秒未清完進入30秒加時賽(每5秒攻擊力翻倍)，加時賽30秒結束仍未清完=強制GameOver |
| 核心普攻/連鎖目標選擇 | ✅ | 普攻鎖最近核心目標；連鎖以主目標為中心取最近N隻不重複，一輪用盡可重啟循環；加時30秒終局=強制GameOver，已同步進game-design-plan.md |
| 怪物攻擊力/血量數值 | ✅ | MS4 MVP 版已定：1-20 以 `Docs/waveplan.md` 為主；11-15 跑者/工兵攻擊+1、16-20 +2；第20為硬門檻；21-30 暫作隨機血量/傷害增壓阻擋區 |
| 卡片系統與局內流派（Must Solve 5） | ✅ | 18張第10關MVP卡池、100/150/200價值點、固定3槽位出卡、偏弱/標準/偏強分層、卡片顯示標籤已定；詳見 `Docs/bosscard.md` |
| 多人合作分工（Must Solve 6） | ✅ | 自動偵測 + Alt 輪盤（Alt+左鍵拖方向放開）+ ⚠️ 危險 Emoji + 角色頭上顯示 + Party Bar 全部上線 |
| MVP 驗證標準（Must Solve 7） | ✅ | 已建立 `Docs/mvp-validation.md`：測試對象、流程、成功標準、觀察表、失敗歸因與 MVP 通過標準 |
| 核心攻擊範圍單位 | ✅ | 確認=px(50px=5格)，與地圖10px/格換算一致 |
| 操作輸入方式 | ✅ | WASD+滑鼠點擊/長按，手機搖桿+專屬挖礦鍵，挖掘能力只影響傷害量不影響次數上限 |
| 玩家等級XP曲線 | ✅ | 錨點7天Lv20/30天Lv30/180天Lv60，兩段power law拼接 |
| 技能點花費曲線 | ✅ | 實際為**金幣**曲線（非銀幣，`game-design-plan.md:1034` 定案：技能用金幣、合成用銀幣，兩條線互不干擾）；Lv1~10 已跟「少中多」收入交叉驗證（`economy-sim-log.md` 任務3/6）；`ECONOMY.skillGoldCost` 已 wiring 進 `skillService.js`，測試覆蓋 T22 v0.0.34.0 |
| 裝備合成費用曲線（silverCostPerSynth） | ✅ | 變體 D（仿技能曲線）[3760…37620] 合計 188,000；定案 Docs/simulation/equipment-drop-sim-log.md；v0.0.25.0 |
| 怪物擊殺掉落銀幣（per kill） | ✅ | config 定案候選 C v0.0.25.0；engine wiring v0.0.27.0；⚠️ idempotencyKey 跨局重複風險待 T15 加 sessionId |
| 合成 UI（T13 SynthesisPanel） | ✅ | ⚗️ 合成按鈕、費用顯示、選槽位/款式、spendWallet idempotency；v0.0.26.0 |
| 新手教學／Onboarding流程 | ✅ | 新玩家註冊後強制完成教學，未完成則下次重頭；教學第1關結束送5抽並強制抽獎/裝備升級教學；完成後解鎖單人/多人並出現通關第5關任務獎勵20抽 |
| 靈力（spirit）→ 核心加成 wiring（T17） | ✅ | `computeSpiritBonusPct` 乘進 coreStats.attack/attackSpeed；高塔工法改 heightBonusPct 加成；v0.0.30.0 |
| 卡片 UI 標籤（T18） | ✅ | 卡面顯示 type/lane/risk 標籤 + 效果文字中文化（STAT_ZH）；v0.0.31.0 |
| 多人卡片投票 + GameOver 結算（T19+T20） | ✅ | eligible 玩家多數決投票（排除離線）、host/remote 四路徑一致、sessionRewards 本機摘要顯示；peerHost ping-timeout offline bug 附帶修復；v0.0.32.0 |
| 加時賽收尾規則 | ✅ | 定案維持現況：30 秒加時結束仍未清完怪 → 強制 GameOver（核心判定陣亡），不再另做特殊處理；`waveplan.md` line 137 已載明 |
| Boss 門口攻擊（T21） | ✅ | 任何已放置方塊(dirt/fore)與 world.core 同為敵人有效攻擊目標；doorAttack Boss(20/30) 有效攻擊距離=height+attackRange；boss10 與小怪不吃此加成；`config/waves.js` 舊 `doorAttackHeightTiles` 門檻殘留已清除；v0.0.33.0 |
| 商店/技能點測試覆蓋（T22） | ✅ | `tests/shopPanel.test.js`（8 cases）+ `tests/skillService.test.js`（5 cases）；零 src 邏輯改動；v0.0.34.0 |
| ShopPanel state 防壞資料修復（T23） | ✅ | `isValidState()` 補 `refreshCount` 整數/範圍檢查 + `purchases` 元素型別檢查，防止玩家寫壞 localStorage 繞過每日刷新上限；v0.0.35.0 |
| P2P 重連功能鏈（T24） | ✅ | `reconnect.js` 接入可重試 controller；`validation.js` 改 connectionEpoch-aware；`inputBuffer.js` 加 host_received_at queue timeout；`peerClient.js` 自動重連；`peerHost.js` 指派 epoch 並防 stale close 誤殺新連線；v0.0.36.0 |

---

## 下一步建議討論順序

### 玩法數值／模擬（Codex 負責，見 mustsolve.md + simulation/）
1. ✅ Must Solve 2：怪物職能與敵人設計（數值表已填、波次已實作上線；職能是否逼出不同建築留實玩驗證）
2. ✅ Must Solve 3：建築策略與方塊取捨（連通性 BFS + 格子化 Hitbox 已上線；生存率差異留實玩驗證）
3. ✅ MVP 實作前整理：引擎狀態 + 開工 checklist 已建立 → `Docs/history/mvp-engine-checklist.md`（所列缺口已全數完成，2026-07-07 歸檔）；T14/T15 已完成（見下方）
4. ✅ T14：怪物擊殺掉落銀幣 engine wiring（`combatRuntime.js` v0.0.27.0，`_awardKillSilver` 實裝）
5. ✅ T15：關卡結算獎勵 + sessionId idempotency 修正（v0.0.28.0；Boss 關入帳 bug 修正）
6. ✅ T16：cardModifiers 消費 + playerStat 基準值修正（v0.0.29.0；7 個檔案；delta sync 修正；npm test 全過）
6. ✅ 每日商店規則細節 — `Docs/simulation/economy-sim-log.md`（2026-06-28）任務5/6 已模擬定案商店定價與機率權重，數字已寫入 `config/economyConfig.js` shop 區塊並與引擎 wiring（`src/ui/shopPanel.js` 每日重置/廣告刷新上限/購買扣款發獎；`src/account/skillService.js` 技能升級成本）。測試覆蓋 T22 v0.0.34.0 已補齊（8+5 cases）
7. ✅ 「少中多」銀幣/金幣收入 × 技能點/合成消耗交叉驗證 — 合成曲線 ✅ 變體 D 定案；怪物掉落 ✅ 候選 C 定案；銀幣/金幣技能點交叉驗證 ✅ 已跑（`economy-sim-log.md` 任務3：正常玩家技能單屬性81.5天／扣商店後，極限玩家全屬性84天），與商店機率權重（任務6：裝備加速7.7%/技能加速9.7%，均低於10%上限）一併定案，`skillGoldCost` 已寫入 config 並 wiring 進 `skillService.js`
8. ✅ T21：Boss 門口攻擊（`combatRuntime.js` v0.0.33.0，`_nearestStructureCell` + doorAttack 距離公式實裝）
9. ✅ T22：商店/技能點測試覆蓋（v0.0.34.0）
10. 🔲 商店 / 成就 / 好友系統 — 非核心玩法
11. 🔲 新方塊種類擴充設計原則 — 暫不急

### 架構審查（Claude 負責，與Codex交叉確認後同步文件）
1. ✅ PeerJS 連線拓撲（Star／房主中心，已與Codex確認，已同步文件）
2. ✅ 反作弊／輸入驗證機制（已定案，同步進 game-architecture-plan.md）
3. ✅ 斷線重連機制（已定案，同步進 game-architecture-plan.md）
4. ✅ Save File／帳號資料版本相容性（Schema Versioning，已定案）
5. ✅ 金流／儲值串接方案、隱私權與法規合規、新手教學流程（已全部定案）
6. 🟡 T27：15/30 秒斷線策略 + 30 秒後重新開頁返回原 Slot；實作方雙 origin 實測通過，待獨立驗收

### 其他
- 🟡 RLS Policy SQL 撰寫 — P0，開始接 Supabase 資料表/帳號功能時第一件事；單機 localStorage MVP 可暫不需要

---

## 使用說明

每次重大決策確認後，請提醒我同步更新此 Dashboard + 對應文件，避免討論內容只存在對話紀錄中遺失。

### 條目格式（2026-07-07 起的新條目適用）

新增/更新條目時，備註欄必須含**驗證方式**（三選一），讓任何 AI 能一步追到證據：
- 測試：`tests/xxx.test.js`（機器驗證，最優先）
- 版本 + prompt：`vX.Y.Z.W` + `Docs/history/codex-prompt-Txx.md`（可對 git log 追溯）
- 模擬定案：`Docs/simulation/xxx-log.md` + 對應 config 常數位置

例外：UI 手感/好玩度類條目（本來就靠實玩驗證）標註「實玩驗證」即可。
舊條目不回填（成本不划算）；發現舊條目與程式碼現實矛盾時，依 `.claude/instructions.md` 第 10 節偏移矯正協議處理。
