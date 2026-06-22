# QUICKREF.md — 每次啟動速查表

> 版本：v0.0.1.0
> 類型：**代碼優先**（文件描述錯了，以代碼為準去改本檔）。
> ⚠️ 本專案目前在 **Planning 階段，尚無程式碼**，多數欄位為 TODO，開工後逐步填入。

---

## 1. 技術架構摘要

- 1–4 人合作塔防；HTML+JS / PeerJS（P2P）/ Supabase / Vercel
- Multiplayer：Star（房主中心）拓撲，房主端權威
- TODO：補一段「目前程式碼長怎樣」的摘要（開工後）

---

## 2. 檔案地圖

> TODO：開工後填入「哪個檔做什麼」的速查。

| 檔案 / 目錄 | 用途 |
|---|---|
| TODO | TODO |

---

## 3. 持久化 key 一覽表（防止誤刪 / 重複造 key）

> 列出所有 localStorage / 存檔欄位 / DB 欄位的 key 與用途。每新增一個就加一行。
> TODO：開工後填入。

| 儲存位置 | key / 欄位 | 用途 | 備註 |
|---|---|---|---|
| localStorage | TODO | TODO | |
| Supabase（存檔） | TODO | TODO | |
| Supabase（帳號） | TODO | TODO | |

> 設計參考：`Docs/game-architecture-plan.md`「Save File 資料結構」「玩家帳號資料結構」
> 「Schema Versioning」章節（含 schema_version / data_revision 等頂層欄位）。

---

## 4. 關鍵技術陷阱表（每踩一個坑加一行）

> 把每個踩過的坑寫成一行「陷阱 → 規則」，避免重蹈覆轍。

| 陷阱 | 規則 |
|---|---|
| TODO | TODO |

> 已知的設計面注意點（可在開工時轉成具體陷阱）：
> - 建築是三維度（背景泥土 = 地基；前景第二層蓋在泥土前方），連通性在背景平面判定。
> - 核心 2x2x2、貼地、正前方 Z 不可蓋。
> - 反作弊：玩家送輸入不送結果；過期判定用 host_received_at 不採信 client timestamp。
> - 多人 active save 走 Edge Function（驗 current_host_uid），不可只靠 owner_id=uid。
