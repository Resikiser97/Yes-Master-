# DOC_INTEGRITY.md — 文件優先級與完整性規範

> 類型：**文件優先**（人工維護）。
> 用途：定義「衝突時該改文件還是改代碼」，並說明為什麼文件準確性是嚴重問題。

---

## 1. 為什麼文件準確性是嚴重問題

AI 沒有記憶，每次對話都是從零開始。**文件就是 AI 唯一的記憶體。**

- 文件過期或錯誤 = 對未來所有 AI 工作下毒。
- 錯誤會**累積且不被發現**：下一個 AI 讀到錯誤文件，會在錯誤基礎上繼續工作。
- 因此「文件整備」不是雜務，而是專案能否持續協作的命脈。

唯一解法：一組「**每次必讀 + 每次必同步**」的文件，把專案狀態固化下來，
讓任何一個新 AI 讀完就能接手。

---

## 2. Source of Truth 優先級表

每份文件標明它屬於哪一類，衝突時才知道該改文件還是改代碼。

| 類型 | 意義 | 文件 |
|---|---|---|
| **文件優先** | 代碼行為錯了，以文件為準去改代碼。人工維護。 | `instructions.md`、`VERSION_RULES.md`、`DOC_INTEGRITY.md` |
| **代碼優先** | 文件描述錯了，以代碼為準去改文件，跟著代碼走。 | `ARCH.md`、`MAIN.md`、`QUICKREF.md`、`project_summary.md`、各檔 file header |
| **只增不改** | 歷史紀錄，永遠往上加，不回頭改。 | `CHANGELOG.md` |

> Planning 階段補充：本專案 `Docs/` 下的規劃文件（`game-design-plan.md`、
> `game-architecture-plan.md`、`planning-dashboard.md` 等）目前是**設計決策的 source of truth**，
> 程式碼尚未存在。等開工後，「代碼優先」文件才會以實際程式碼為準。

---

## 3. 衝突處理規則

```
1. 先判斷衝突的文件屬於哪一類（見上表）。
2. 文件優先類 vs 代碼：以文件為準，去修代碼。
3. 代碼優先類 vs 代碼：以代碼為準，去修文件。
4. 任一情況若「文件本身互相矛盾」→ 停下來問開發者，不要自行二選一。
5. 只增不改類（CHANGELOG）永遠不回頭改，只往上加新條目。
```

---

## 4. 文件整備進度

> 本系統剛建立，多數「代碼優先」文件因尚無程式碼而為骨架。

| 文件 | 狀態 |
|---|---|
| `.claude/instructions.md` | 🟡 骨架完成，待填鐵則 / git / 版本清單 |
| `DOC_INTEGRITY.md` | ✅ 本檔 |
| `VERSION_RULES.md` | ✅ 規則完整 |
| `ARCH.md` | 🔲 骨架，待開工填入模組 |
| `MAIN.md` | 🔲 骨架（函式級參考，待開工填入）；原 source map 已移至 `Docs/source-map.md` |
| `QUICKREF.md` | 🔲 骨架，待開工填入 |
| `project_summary.md` | 🟡 骨架，待填現況 |
| `CHANGELOG.md` | ✅ 已有 v0.0.1.0 初始條目 |
| `.claude/skills/file-header.md` | 🟡 待定 header 格式 |
