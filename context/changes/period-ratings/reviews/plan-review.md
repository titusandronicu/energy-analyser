<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Period Ratings

- **Plan**: context/changes/period-ratings/plan.md
- **Mode**: Deep
- **Date**: 2026-09-30
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 8/8 paths ✓, 5/5 symbols ✓, Progress↔Phase 2/2 phases and 11/11 rows ✓, brief↔plan ✓. Checked in code:

- `periodTotals` reads only the period's own days (`calendar-view.ts:309-321`), so the widened rows can't leak into totals.
- `edgePercentLabel` always appends "%" (`edge-percent.ts:12-17`).
- `TotalsPanel` is used by both MonthView and QuarterView.

## Findings

### F1 — Month rating words are undefined

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 (`rateMonth`), Desired End State
- **Detail**: The plan defines "Dobry / Przeciętny / Słaby dzień" only. A month rating using the day words would read "Dobry dzień" on a month.
- **Fix**: Give `rateMonth` its own words ("Dobry / Przeciętny / Słaby miesiąc") and pin them in a test.
- **Decision**: FIXED — month words in rateMonth, pinned by a test

### F2 — "September not rated" only holds on the day the plan was written

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Desired End State; manual checks 2.6 and 2.8
- **Detail**: The plan says September 2026 isn't rated because it is the current month on 2026-09-30. Implementation and deploy will happen in October, when September is complete and must be rated. The manual check would then fail, or be ticked against the wrong expectation.
- **Fix**: Word the check as "the current month says it isn't rated yet; September 2026, once finished, shows a month rating with its basis".
- **Decision**: FIXED — end state and checks 2.6 say the current month isn't rated and September is rated once finished

### F3 — The gap label needs points, not percent

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 (delta printed "with edgePercentLabel semantics")
- **Detail**: `edgePercentLabel` always appends "%" (`edge-percent.ts:12-17`). The rating needs "27,4 punktu poniżej normy", and exactly ±10 must print as "10,0" on the neutral side.
- **Fix**: Add a points variant next to `edgePercentLabel` (same edge rule, unit "punktu"; one decimal always takes "punktu"), with tests at 10.0 and 10.1.
- **Decision**: FIXED — points variant next to edgePercentLabel, tested at 10.0 and 10.1

### F4 — TotalsPanel is shared with the quarter view

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 ("TotalsPanel.astro (or MonthView.astro)")
- **Detail**: `TotalsPanel` renders both the month and the quarter totals. Putting the rating inside it would either leak to the quarter, which is out of scope, or need a flag.
- **Fix**: Render `RatingPanel` in `MonthView.astro` beside the `TotalsPanel`, and leave `TotalsPanel` unchanged.
- **Decision**: FIXED — RatingPanel in MonthView beside TotalsPanel; TotalsPanel unchanged
