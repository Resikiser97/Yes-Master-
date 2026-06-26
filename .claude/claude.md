# Claude Project Instructions

Before making changes in this project, read:

1. `.claude/instructions.md`（AI 協作最高 SOP：開場讀取順序、sync-docs、版本號規則）
2. `Docs/source-map.md`（專案知識 source map；原 `MAIN.md`）
3. `Docs/planning-dashboard.md`
4. The task-specific planning or architecture file

Claude's main responsibility is architecture, implementation planning, technical risk checks, and cross-file consistency.

For architecture work, read:

- `Docs/game-architecture-plan.md`
- `Docs/claude-code-handoff.md`
- `Docs/planning-dashboard.md`

For gameplay or balance-sensitive work, also read:

- `Docs/mustsolve.md`
- `Docs/waveplan.md`
- `Docs/simulation/README.md`

Do not rely only on chat history. Use `Docs/source-map.md` as the source map for where project knowledge lives.

## Commit 規則

**絕對禁止自行 Commit。** 任何 git commit / push 動作必須等開發者明確同意後才執行。
完成工作後，輸出 sync 報告，等開發者說「可以 commit」才執行。
