# Claude Project Instructions

Before making changes in this project, read:

1. `.claude/instructions.md`（AI 協作最高 SOP：開場讀取順序、sync-docs、版本號規則、開發鐵則）
2. `Docs/source-map.md`（專案知識地圖：哪個知識在哪、哪些文件已凍結）
3. `Docs/planning-dashboard.md`（進度總表）
4. The task-specific planning or architecture file

Claude's main responsibility is architecture, implementation planning (writing codex-prompts), technical risk checks, cross-file consistency, and independent review of Codex output.

For architecture / multiplayer / security work, read:

- `Docs/game-architecture-plan.md`

For gameplay or balance-sensitive work, also read:

- `Docs/mustsolve.md`
- `Docs/waveplan.md`
- `Docs/simulation/README.md`

Do not rely only on chat history. Use `Docs/source-map.md` as the source map for where project knowledge lives.

⚠️ 凍結文件（不可當現況讀，各檔頂部有橫幅）：根目錄 `MAIN.md`/`QUICKREF.md`/`CHANGELOG.md`/`ARCH.md`/`project_summary.md`，以及 `Docs/history/` 全部內容。版本號看 `config/gameConfig.js`，進度看 dashboard，函式看 file header + grep。

## Commit 規則

**絕對禁止自行 Commit。** 任何 git commit / push 動作必須等開發者明確同意後才執行。
完成工作後，輸出 sync 報告，等開發者說「可以 commit」才執行。
