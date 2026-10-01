<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Period summaries (S-18) Implementation Plan

- **Plan**: context/changes/period-summaries/plan.md
- **Mode**: Deep
- **Date**: 2026-10-01
- **Verdict**: SOUND (all findings resolved in the plan)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

14/14 paths ✓, 7/7 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (23 rows, one per criterion). A verification agent confirmed the reserved-slot spread, the importers of the view builders, the history page branches, the loader pattern and the docs locations.

## Findings

### F1 — Smoke fixtures can't exercise the new surfaces

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §3, Phase 3 §2 (smoke)
- **Detail**: `freshSummaries()` (`scripts/smoke.mjs:66-73`) pushes a `today` row dated 2026-09-23, a `day` row 2026-09-22 with null narration and a `month` row 2026-08. No row matches yesterday or the current month, and the dashboard card would only ever show the "another day" state.
- **Fix A ⭐ Recommended**: Smoke builds its own dated entries from the clock; `example-v1.json` stays untouched.
- **Fix B**: Edit the example fixture (touches contract tests, schema export, lab handoff doc).
- **Decision**: FIXED — via Fix A (Phase 2 §3 and Phase 3 §2 rewritten)

### F2 — A stale-day `today` row with no text has no defined state

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1, Phase 3 §1
- **Detail**: After midnight the newest `today` row is yesterday's; with no narration it would say the text "has not appeared yet" about a finished day.
- **Fix**: Treat an earlier-day row without narration as `empty`; pin with a Phase 1 test.
- **Decision**: FIXED (precedence added to Phase 1 contract and the unit-test list)

### F3 — The plan says to reuse a status function that isn't exported

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 (staleness and status)
- **Detail**: `recommendationStatus` is private and advice-worded. `isStaleRecommendation`, `STALE_AFTER_MS` (recommendation.ts) and `formatAge` (live-state.ts) are exported; other services define their own `STALE_AFTER_MS`.
- **Fix**: Name the exact imports and say the service builds its own status mapping.
- **Decision**: FIXED

### F4 — Docs rows are named differently in the plan

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §3 (docs)
- **Detail**: `architecture.md` rows are Pages (:48), History (:49) and Database (:54, "not shown yet, S-18").
- **Fix**: Name those rows in Phase 3.
- **Decision**: FIXED

### F5 — A failed summary load looks like a missing summary on the calendar

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2
- **Detail**: The history panel is simply absent on a failed load, while the dashboard card shows a load-failed state; `MonthView` is also null when the daily rows failed.
- **Fix**: Accept the silent absence and state it in the plan.
- **Decision**: FIXED (choice recorded in Phase 2 §2 and the brief)
