# file-header — 原始碼檔頂部 File Header 規範

> 類型：**文件優先**（人工維護的規範）。
> 用途：規範「每個原始碼檔（如 .js）頂部註解要寫什麼」，讓任何 AI 打開檔案就懂它的職責。
> 何時用：新增原始碼檔時必加；**每次 `sync-docs` 的 Step 1.5 都會檢查**（不限新增/刪除）。

---

## 1. 為什麼需要 File Header

- 新 AI 打開一個檔案，header 是它**第一眼的記憶**：這檔做什麼、export 什麼、屬於哪個模組。
- 沒有 header，AI 得整檔讀完才懂職責，容易誤改 / 重複造輪子。

---

## 2. Header 格式（已採用）

> 開發者已採用以下格式（開工後若要微調再更新本檔）：

```js
/**
 * @file        <檔名>
 * @module      <所屬模組 / 層>
 * @summary     <一句話：這個檔做什麼>
 * @exports     <對外 export 的主要函式 / 物件>
 * @depends     <主要依賴的其他模組>
 * @sourceOfTruth <若數值來自 config，註明來源；遵守 Magic Number 禁令>
 * @version     <對應的專案版本號 v0.x.y.z；必須與 config/gameConfig.js 的 GAME_CONFIG.version 一致>
 */
```

---

## 3. 維護規則

- 新增原始碼檔 → 必須加 header。
- 改變檔案職責 / export → 同步更新 header（代碼優先）。
- **`sync-docs` 不只在新增/刪除檔案時檢查 header**：每次 sync-docs 的 Step 1.5 都要檢查 source/config header。
- 任何「**版本升級、功能完成、函式職責變更**」→ 都要掃描 header 是否同步（`@summary` / `@exports` / `@depends` / `@version`）。
- `@version`：本專案採同步版本號，**必須填寫**，且必須與 `config/gameConfig.js` 的 `GAME_CONFIG.version` 一致。
- 檢查殘留的「已完成步驟的過期 TODO」描述，發現就改成符合現況（例：步驟做完了還寫「TODO：步驟 X 實作…」）。

---

## 待確認

- [x] Header 欄位與格式：已採用第 2 節格式。
- [x] 適用副檔名範圍：`.js`（含 `src/**/*.js` 與 `config/**/*.js`）。目前專案無 `.ts` / `.css`；若日後新增，規則類比 `.js` 適用，屆時補本檔。
