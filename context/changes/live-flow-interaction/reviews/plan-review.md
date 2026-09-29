<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Live Flow Interaction

> Triage complete 2026-09-29: F1-F6 fixed in plan.md and plan-brief.md.

- **Plan**: context/changes/live-flow-interaction/plan.md
- **Mode**: Deep
- **Date**: 2026-09-29
- **Verdict**: REVISE
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

14/14 paths ✓ (src/components/hooks/ is new, as the plan expects), 12/12 lucide icons installed ✓, Progress↔criteria 35/35 ✓, brief↔plan ✓

## Findings

### F1 — Fixture scenarios collide with the ingest rules

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 5 — Reproducible states
- **Detail**: The plan lets `--captured-at` be "a future time", but the contract rejects a capture more than 5 minutes ahead and older than 14 days (`contract.ts:8-9,168-171`). `live_state` is the newest push by `captured_at` (`live_state_view.sql:16-23`) and a daily row is replaced only by a push with an equal or later `captured_at` (`daily_forecast.sql:75`), so a stale scenario pushed after a fresh one is invisible. PV verdicts need a capture at or after 15:00 Warsaw that is also under 15 minutes old, so PV scenarios can only be pushed between about 15:05 and midnight.
- **Fix**: State the real rules in Phase 5: fresh states need a capture time within ±5 minutes of now, PV scenarios run after 15:05, the script header says to reset `ingest_pushes` and `daily_energy` on the local DB between scenarios (or push in a fixed order); drop "future time" from the flag description.
  - Strength: Screenshots become reproducible on a known procedure.
  - Tradeoff: PV screenshots must be taken in the afternoon or evening.
  - Confidence: HIGH — bounds and ordering are in the cited code.
  - Blind spot: A dev-only fake "now" would remove the afternoon limit; deliberately not proposed (prod-adjacent switch).
- **Decision**: FIXED (Fix in plan)

### F2 — The preference hook trips the repo's lint rule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Gate, pause and preferences
- **Detail**: The plan reads `localStorage` "in an effect after mount". eslint applies react-hooks 7.x recommended (`eslint.config.js:44`), whose `set-state-in-effect` rule flags synchronous setState in an effect; `npm run lint` is a Phase 3 gate. (Rule presence in the preset was not confirmed by running lint.)
- **Fix**: Specify `usePreference` on `useSyncExternalStore` with the default as the server snapshot and a `storage` event subscription, all in try/catch.
- **Decision**: FIXED (Fix in plan)

### F3 — PV numerator comes from a different source than the snapshot

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — PV and consumption rules
- **Detail**: The plan divides today's `pv_kwh` from the daily row by the forecast, but the snapshot already carries `state.pv_today_kwh` for the same capture (`contract.ts:26`). The lab omits today's daily entry entirely when it has no usable samples (`homelab-2 push-energy-analyser.py:287-289`), so the row can be absent or lag while the live total is present.
- **Fix**: Use `state.pv_today_kwh` as the PV numerator; take the forecast and today's `load_kwh` from the daily row. A missing row gives "Bez oceny · brak danych".
- **Decision**: FIXED (Fix in plan)

### F4 — Contrast is checked only in the last phase

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 tokens vs Phase 5 item 5.7
- **Detail**: The tone tokens and tints are defined in Phase 1, but the 4.5:1 check (`docs/logic.md`, Readability) happens only in Phase 5, after the squares exist; a failing colour would mean rework across phases.
- **Fix**: Add a Phase 1 manual item: verify text and chip contrast of each `--tone-*` on its surface composited over `--card`, and adjust the token values there; keep 5.7 as the final check.
- **Decision**: FIXED (Fix in plan)

### F5 — Fixture parsing is not automatic

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 — Reproducible states
- **Detail**: `contract.test.ts` reads only `docs/ingest/example-v1.json` (`contract.test.ts:8,14`); no test opens `scripts/fixtures/`, so the existing bill-forecast fixtures are unchecked too.
- **Fix**: Say the test globs `scripts/fixtures/live-flow/*.json` and parses each with the strict schema.
- **Decision**: FIXED (Fix in plan)

### F6 — Verification wording and one file location

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 5 item 5.4; Phase 2 geometry file
- **Detail**: `npm run contract:export` regenerates the schema, so "produces no diff" is not a passing command; `npm test` already fails on drift. `flow-geometry.ts` is geometry, not formatting, and its neighbours in `src/lib/format/` are display helpers.
- **Fix**: Use `npm test` for 5.4 or add `git diff --exit-code docs/ingest/contract-v1.schema.json`; place the module at `src/lib/flow-geometry.ts`.
- **Decision**: FIXED (Fix in plan)
