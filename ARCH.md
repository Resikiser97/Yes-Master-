# ARCH.md — 架構全貌

> 版本：v0.0.1.0
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ 本專案目前在 **Planning 階段，尚無程式碼**，以下多為 TODO，開工後逐步填入。
> 技術架構的設計決策來源：`Docs/game-architecture-plan.md`。

---

## 1. 專案概述

- 名稱：哥布林的信仰（Goblin's Faith）
- 類型：1–4 人合作塔防（瀏覽器遊戲）
- TODO：補上更完整的一段話定位（給新 AI 30 秒看懂）

---

## 2. 技術選型

| 項目 | 技術 | 備註 |
|---|---|---|
| 前端 | HTML + JavaScript（ES Module） | TODO：框架 / 無框架確認 |
| Multiplayer | PeerJS（WebRTC P2P） | Star / 房主中心拓撲 |
| 雲端 / 帳號 | Supabase（Auth + RLS） | TODO |
| 部署 | Vercel | TODO |
| TODO | 其他 | TODO |

> 來源：`Docs/game-architecture-plan.md`「技術棧」章節。

---

## 3. 模組清單

> TODO：開工後逐檔填入。

| 檔案 | 職責 |
|---|---|
| TODO | TODO |
| TODO | TODO |

---

## 4. 跨模組依賴

> TODO：開工後補依賴關係（誰 import 誰 / 載入順序 / 全域狀態）。

```
TODO
```
