# project_summary.md — 專案現況快照

> 版本：v0.0.10.0
> 類型：**代碼優先**（隨專案現況更新）。
> ⚠️ 與 `Docs/project_summary.md`（原始設計草稿）不同：本檔是**版本化的現況快照**。

---

## 快速定位

- **正式遊戲名**：**Yes, Master!**
- **副標 / 世界觀名**：哥布林的信仰（只能作為 subtitle / lore，不是主遊戲標題；英文名不要寫成 Goblin's Faith）。
- **這是什麼**：Yes, Master! — 1–4 人合作塔防瀏覽器遊戲（哥布林守核心、人族來襲）。
- **現在版本**：v0.0.8.0
- **當前狀態**：MVP 單機可動。移動 / 挖礦 / 背包 / 塔內資源 / 掉落物自動撿取 / 跟隨鏡頭 / 初版建造 / 核心數值回饋 / 核心 HP 與修復 / 核心戰鬥 / 正式波次晝夜 / 卡片選擇（hover + tier 中文化）/ localStorage 存檔 / 新手教學提示 / debug 浮層（` 鍵）/ 測試難度 preset（1~30 關強化開局）/ **動態 canvas 縮放（動態 tilePx）** / **手機三欄觸控 UI（左 HUD+D-pad、中 canvas+1~0 快捷列、右 Debug Tool+動作鍵）** / **⚙ debug 按鈕（鍵盤+觸控皆有）** / **PWA manifest + iOS/Android 安裝引導畫面** / **手機 3×3 放置方向選擇器** 已成完整循環。
- **下一步（最多 4 條）**：
  1. 怪物職能擴充（Must Solve 2）。
  2. 建築策略格子化模擬驗證（Must Solve 3）。
  3. 多人連線骨架（PeerJS Star 拓撲）。
  4. PWA / 加入主畫面支援（manifest、icon、iOS meta、Android install prompt）。

---

## 一、核心設計

> 摘要即可，細節指向 `Docs/`。
- TODO：3–6 條核心玩法（晝夜循環 / 挖礦建塔 / 核心防守 / 三維度建築 / 卡片 / 多人）。
- 來源：`Docs/game-design-plan.md`、`Docs/game-architecture-plan.md`。

---

## 二、設計決策

> 記錄「為什麼這樣決定」的關鍵決策，避免重複討論。
- TODO：列出已定案的重大決策（範例：P2P 用 Star 拓撲、MVP 不接真金流、核心貼地 2x2x2…）。
- 規劃總索引：`Docs/planning-dashboard.md`。

---

## 三、最近完成的工作 ＋ 已知問題

### 最近完成
- 建立「AI 協作 Handover 文件系統」（本套文件）。
- v0.0.2.0：MVP 單機骨架開工——config 六檔 + src/logic 八個純函式模組 + 渲染/輸入/存檔分層 + ES Module 入口；新增開發鐵則 9（純邏輯/渲染分離）；建立 Claude↔Codex 交接看板，Codex 已填敵人/資源卡/seed 數值；純邏輯 22 項 smoke test 全過、waveGen 全關無 NaN。
- Step 2 畫面骨架完成：`src/game/world.js` 建立 world/camera/核心/兩層方塊狀態，`Renderer` 可畫地面、網格、礦山、背景泥土、前景方塊、核心、玩家。
- 接上 `src/game/gameLoop.js` fixed timestep：遊戲 update 固定 60Hz，render 跟螢幕 Hz 分離，避免高刷新率讓遊戲進程變快。
- v0.0.3.0 Step 3：挖礦/背包/塔內資源純邏輯（mineGen/inventory/mining）+ orchestration（actions）；長按挖最近礦格→背包（承重/格數雙限）→站連通泥土自動入塔內；第 0 關初始資源包；HUD 顯示。
- v0.0.3.0 跟隨鏡頭：插值（render 吃 gameLoop alpha）+ 整數像素平移 + 邊界夾取，背景固定；消 judder/flicker。
- v0.0.3.0 Step 4 初版建造：`src/logic/building.js` 接放置/拆除合法性；快捷列 1~7 選材，左鍵放置、右鍵拆除；建造/拆除 reach 3 格；建造預覽顯示可放/不可放；demo 結構預設關閉避免免費拆料。
- v0.0.3.0 Step 5 核心數值回饋：`countPlacedBlocks` 統計背景泥土與前景方塊，`refreshCoreSnapshot` 刷新 `world.blockCounts/world.coreStats`；放置/拆除後 HUD 即時顯示核心 HP 上限、攻擊、防禦、攻速、範圍、魔法、連鎖與方塊數。
- v0.0.3.0 Step 6A 核心 HP / 修復基礎：新增 `coreHealth` 純邏輯；world 持有 `coreHp` 與玩家目前疲勞；建土/拆土同步調整 current/max HP，拆到會讓核心歸零則禁止；R 長按站核心或連通泥土地基消耗疲勞修復；H/J/K debug hotkeys 便於測試。
- v0.0.3.0 Step 6B debug 核心戰鬥：新增 `combatRuntime`，L/P 生成 debug 敵人；敵人直線追逐玩家但暫不攻擊；核心用 `combat.js` 的普攻/連鎖/傷害打範圍內敵人；renderer 顯示敵人與小血條、HUD 顯示敵人數與最近命中。
- v0.0.8.0 手機 UX 調整：手機橫向改成三欄 layout；左側灰欄顯示核心/關卡/HUD 資訊並保留 D-pad，右側灰欄放 Debug Tool 與動作鍵，中間 canvas 保持桌面比例等比縮放並保留 1~0 快捷列；手機模式關閉 canvas 底部 HUD，避免虛擬按鈕遮擋遊戲/debug 文字。
- v0.0.10.0 手機 3×3 放置方向選擇器：右側操作欄新增 3×3 方向 grid（↖↑↗ / ←●→ / ↙↓↘），預設中心，選擇持續保留；main.js touch 模式 mouse 同步加入 placeOffset，build preview + tryPlace + tryRemove 全部自動跟著偏移，桌面端不受影響。
- v0.0.9.0 PWA 支援：新增 manifest.json（standalone/landscape）+ 6 條 iOS/Android PWA meta tag；新增 `src/ui/pwaTutorial.js` 安裝引導畫面（iOS/Android 分頁切換、Android install prompt 攔截、跳過計數 ≤3 次）；mobileLayout.js 新增 `isStandalone()` 偵測；splash 整合：觸控裝置且非 standalone 時先顯示教學再進 splash；tools/generate-icons.html 圖示產生工具。

### 已知問題
- 🔴 緊急：（無）
- 🟡 待修：（無重大待修）
- 🟡 待測：手機三欄 layout 實機手感、快捷列 1~0 尺寸與左右灰欄資訊密度仍需 iOS/Android 橫向實測校準。
- 🟡 未來風險：目前核心血量用 `world.dirt.size` 計算，依賴建造流程保證泥土全連通；接存檔/debug/migration 外部載入時，要改成只統計 `computeConnected(world.dirt, world.core)`。
- 🔵 觀察中：怪物移速、敵人職能手感、建築策略生存率差異等待 MVP 實玩校準（見 mustsolve.md）。

---

## 四、Roadmap

> TODO：里程碑式列出（範例：單機 MVP → PeerJS 多人 → Supabase 帳號/存檔 → 上線合規）。
- [ ] TODO
- [ ] TODO
