# ARCH.md — 架構全貌

> 版本：v0.0.11.0
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ MVP 單機版已可動；本檔只記目前程式碼架構快照，細節以 `src/` / `config/` 為準。
> 技術架構的設計決策來源：`Docs/game-architecture-plan.md`。

---

## 1. 專案概述

- 正式遊戲名：Yes, Master!
- 副標 / 世界觀名：哥布林的信仰（只作 subtitle / lore，不是主遊戲標題；英文名不要寫成 Goblin's Faith）
- 類型：1–4 人合作塔防（瀏覽器遊戲）
- TODO：補上更完整的一段話定位（給新 AI 30 秒看懂）

---

## 2. 技術選型

| 項目 | 技術 | 備註 |
|---|---|---|
| 前端 | HTML + JavaScript（ES Module），無框架 | Canvas 主畫面 + 少量 HTML overlay（splash / 手機觸控 / debug tool） |
| Multiplayer | PeerJS（WebRTC P2P） | Star / 房主中心拓撲 |
| 雲端 / 帳號 | Supabase（Auth + RLS） | TODO |
| 部署 | Vercel | TODO |
| TODO | 其他 | TODO |

> 來源：`Docs/game-architecture-plan.md`「技術棧」章節。

---

## 3. 模組清單

| 檔案 | 職責 |
|---|---|
| `src/main.js` | 啟動流程；splash 難度/輸入模式選擇；建立 cfg/world/renderer/controls；fixed timestep update；resize/mobile layout；debug hook。 |
| `config/gameConfig.js` | 全域基礎設定、hotbar、render/map/player/building/debug/save。 |
| `config/testPreset.js` | 測試模式覆寫：測試存檔 key、時間節奏、初始 cardBonuses/storage。 |
| `src/game/world.js` | world 狀態、核心/玩家/鏡頭/phase 初始值。 |
| `src/game/actions.js` | 挖礦、掉落物、卸貨、建造/拆除、debug action orchestration。 |
| `src/game/phaseRuntime.js` / `combatRuntime.js` / `gameLoop.js` | 晝夜波次、敵人/核心戰鬥、固定時間步進。 |
| `src/logic/*` | 純邏輯：rng、礦山、背包、挖礦、連通性、建造、核心數值/血量、戰鬥、波次、卡片、掉落物、migration。 |
| `src/render/renderer.js` | Canvas render：地圖、方塊、玩家、敵人、掉落物、建造預覽、HUD、卡片、debug overlay、gameover。 |
| `src/input/controls.js` | 桌面鍵盤/滑鼠輸入：移動、挖礦、修復、建造/拆除、卡片點選。 |
| `src/input/touchControls.js` | 手機三欄觸控 UI：左 HUD+D-pad、中 1~0 快捷列、右 Debug Tool+動作鍵；與 `Controls` public 介面相容。 |
| `src/ui/mobileLayout.js` | 輸入模式儲存、觸控偵測、直向遮罩、動態 tilePx、手機三欄 layout/canvas 等比縮放。 |
| `src/ui/splash.js` | 開始畫面、正式/測試難度、鍵盤/手機輸入模式選擇。 |
| `src/storage/*` | localStorage 存取與 world serialize/deserialize。 |

---

## 4. 跨模組依賴

```
index.html
  -> src/main.js
    -> config/*                      // 設定與數值
    -> src/ui/splash.js              // 選難度與輸入模式
    -> src/ui/mobileLayout.js        // touch/mobile sizing
    -> src/game/world.js             // create/load world
    -> src/render/renderer.js        // canvas render
    -> src/input/controls.js         // keyboard/mouse
    -> src/input/touchControls.js    // touch controls
    -> src/game/gameLoop.js          // fixed timestep
    -> src/game/actions.js           // mining/building/drop orchestration
    -> src/game/phaseRuntime.js      // day/night/waves/cards
    -> src/game/combatRuntime.js     // enemies/core combat
    -> src/storage/saveManager.js    // local save
```
