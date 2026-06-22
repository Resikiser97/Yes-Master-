# source-map.md（原 MAIN.md）
> Project entrypoint / source map for Claude, Codex, and human collaborators.
> Start here before editing planning, architecture, simulation, or balance files.
> 註：本檔原為根目錄 `MAIN.md`，因 `MAIN.md` 改作「函式級參考」而移來此處改名。

---

## Required Reading Order

1. `Docs/source-map.md`（本檔）
2. `Docs/planning-dashboard.md`
3. Task-specific files:
   - Game design rules: `Docs/game-design-plan.md`
   - Technical architecture: `Docs/game-architecture-plan.md`
   - Must Solve tracking: `Docs/mustsolve.md`
   - Wave / multiplayer scaling plan: `Docs/waveplan.md`
   - Boss card and card value plan: `Docs/bosscard.md`
   - MVP validation criteria: `Docs/mvp-validation.md`
   - Simulation records: `Docs/simulation/`
   - Claude handoff context: `Docs/claude-code-handoff.md`

---

## Responsibility Split

### Codex

Codex owns gameplay planning, balance, wave logic, and simulation records.

Primary files:

- `Docs/mustsolve.md`
- `Docs/waveplan.md`
- `Docs/simulation/`
- Relevant design sections in `Docs/game-design-plan.md`

### Claude

Claude owns architecture, implementation planning, file dependency cleanup, and technical risk checks.

Primary files:

- `Docs/game-architecture-plan.md`
- `Docs/claude-code-handoff.md`
- Technical sections in `Docs/planning-dashboard.md`

---

## Current Must Solve Focus

Current focus: `MVP implementation readiness / remaining MS2-MS3 verification`

Key current rules:

- Multiplayer normal waves scale by player count: N players means each normal enemy count is multiplied by N.
- Multiplayer boss waves spawn N bosses for N players.
- Card selection starts only after all bosses are defeated.
- Must Solve 4 MVP difficulty is closed: 1-20 is the playable calibration target; 21-30 is a temporary blocker band with randomized HP/damage growth so players do not reliably pass it during MVP.
- Core post-10 card baselines: 鐵牙核心 +2 attack, 金輪核心 +0.20 attack speed, 厚土外殼 +25 max HP and heal 25.
- Must Solve 5 MVP card system is closed: see `Docs/bosscard.md` for 18-card pool, card value points, offer rules, strength tiers, and display labels.
- Must Solve 6 MVP multiplayer cooperation is closed: no forced roles or extra punishment; players use intent Emoji (⛏️/🧱/🦵/🔧/⚠️) shown above player and in member bar for 30s.
- Must Solve 7 MVP validation is closed: see `Docs/mvp-validation.md` for test targets, success criteria, observation sheet, and failure triage.
- Must Solve 2 and 3 remain partially open for later verification: enemy roles and building strategy still need implementation/playtest validation.
- Building range is limited horizontally to 35 tiles left/right from the core center.
- Building height limit is 100 tiles.
- Monster spawn space must reserve room for mines and spawn distance.

See `Docs/waveplan.md` for the canonical wave and multiplayer scaling rules.

---

## Canonical Source Map

Use these files as the source of truth:

- Current progress and open/closed Must Solve status: `Docs/mustsolve.md`
- 1-30 waves, multiplayer scaling, Boss20 rules, build range, spawn safety: `Docs/waveplan.md`
- Boss cards, card value points, card offer rules, card tiers: `Docs/bosscard.md`
- MVP test targets, success criteria, failure triage: `Docs/mvp-validation.md`
- Equipment draw averages: `Docs/simulation/simulationinfo.md`
- Historical simulation reasoning only: `Docs/simulation/simulation-log.md`, `Docs/simulation/simulation-log-2.md`

Do not treat old simulation candidates as current rules unless the canonical file above repeats them.

---

## Documentation Rules

- Do not rely only on conversation memory.
- Before changing a planning document, read `Docs/source-map.md` and the relevant file listed above.
- If a Must Solve item is only partially decided, keep it unchecked and record confirmed / pending items.
- Balance changes that can be simulated should be recorded in `Docs/simulation/`.
- If a temporary handoff plan is used, archive it under `Docs/history/` after completion.
