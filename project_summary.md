# project_summary.md — 專案現況快照

> 版本：v0.0.2.0
> 類型：**代碼優先**（隨專案現況更新）。
> ⚠️ 與 `Docs/project_summary.md`（原始設計草稿）不同：本檔是**版本化的現況快照**。

---

## 快速定位

- **這是什麼**：哥布林的信仰 — 1–4 人合作塔防瀏覽器遊戲（哥布林守核心、人族來襲）。
- **現在版本**：v0.0.2.0
- **當前狀態**：MVP 單機骨架已開工。純邏輯層完成且可單測；畫面骨架、fixed timestep game loop、WASD/方向鍵調試版移動已接上。
- **下一步（最多 4 條）**：
  1. 步驟 3：背包 + 塔內資源欄資料結構（含第 0 關初始資源包）。
  2. 步驟 3：礦山可見 10x3 方塊狀態 + 挖礦輸入。
  3. 步驟 7：波次/晝夜/加時接 game loop（waveGen 已就緒）。
  4. 步驟 9：新手教學觸發點 + localStorage 存檔串接。

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
- Step 3 起步：`Controls` 已接 WASD/方向鍵，`playerMovement` 將移動能力值 50 換算為 5 格/秒，玩家可在畫面中移動。

### 已知問題
- 🔴 緊急：（無）
- 🟡 待修：挖礦、背包、塔內資源欄、建造輸入、波次/戰鬥尚未接成完整可玩循環。
- 🔵 觀察中：怪物移速、敵人職能手感、建築策略生存率差異等待 MVP 實玩校準（見 mustsolve.md）。

---

## 四、Roadmap

> TODO：里程碑式列出（範例：單機 MVP → PeerJS 多人 → Supabase 帳號/存檔 → 上線合規）。
- [ ] TODO
- [ ] TODO
