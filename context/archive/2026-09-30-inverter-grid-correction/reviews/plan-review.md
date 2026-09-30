<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Inverter Grid Correction

- **Plan**: context/changes/inverter-grid-correction/plan.md
- **Mode**: Deep
- **Date**: 2026-09-30
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 10/10 paths ✓, 6/6 symbols ✓, Progress↔Phase 3/3 phases ✓, brief↔plan ✓. Checked in code:

- The only `inconsistent` switch is in `period-rating.ts` (`:88`, `:102-109`, `:157`), so the new rule can reuse the kind without touching a component.
- `rateDayIn` (`period-rating.ts:149-218`) checks no-use and then import-above-use before building the norm, so the planned insertion point exists.
- `rateMonth` (`:224-273`) rates only from its own days' `rated` results and names the rated range in its basis, so August resting on 18 August onwards follows without extra code.
- There's no import cycle. `grid-sensor.ts` → `calendar/period.ts` → `hourly-usage.ts` only reaches format helpers. `usage-insight.ts`, `period-rating.ts` and `calendar-view.ts` don't come back to `grid-sensor.ts`.
- `usage-insight.ts:207-273` exposes `kind` and `baselineDays`, so `crossesSensorChange` can be computed as planned.

## Findings

### F1 — Gate 1.4 fails against the plan's own negative test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria (1.4) and Changes §2
- **Detail**: Phase 1 adds a test asserting that no exported constant contains "zawyżony od", so `calendar-view.test.ts` will contain that string. The gate `git grep -n "GRID_IMPORT_OVERSTATED\|zawyżony od" -- src` would then always print that test line and fail.
- **Fix**: Exclude tests from the gate: `git grep -n "GRID_IMPORT_OVERSTATED\|zawyżony od" -- src ':!*.test.ts'`.
- **Decision**: FIXED — gate 1.4 excludes test files

### F2 — The bill forecast card is left without the caveat

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2; brief "Out of scope"
- **Detail**: The end state promises the caveat on "every surface that shows grid import or house use". `BillForecastCard.astro` shows a PLN projection built from the inverter's month import (`docs/logic.md:196`). That projection is the most money-relevant figure on the page, and research found it close to PGE in August only by coincidence. Leaving it bare contradicts the end state.
- **Fix**: In Phase 2, add `SENSOR_CAVEAT` to `BillForecastCard.astro` (`data-testid="bill-sensor-caveat"`), and include the card in the 390/1440 px manual check.
- **Decision**: FIXED — SENSOR_CAVEAT on BillForecastCard (Phase 2 §4), included in the 390/1440 px check; removed from Not Doing

### F3 — 3 August is a mixed day but is rated against the July norm

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — the window rule
- **Detail**: The analysis puts the direction change at about 16:00 local on 3 August, with a 4-hour lab gap that day. So 08-03's own value mixes both sides, yet the window starts at 08-04. Today 08-03 is "Poza oceną" only because its import exceeds its use. A mixed day with consistent-looking totals would be rated against the July norm. It enters no later norm that is rated (08-04 to 08-17 are unrated), so the effect is limited to its own badge.
- **Fix**: Treat 08-03 as the change day. The window rule becomes `CHANGE_DAY ≤ D ≤ 08-17`, with 08-03 given the sensor basis. Pin it with a test, and add it to the manual checks (08-02 rated normally).
- **Decision**: FIXED — SENSOR_CHANGE_DAY 2026-08-03 unrated with the sensor basis; window 08-03 – 08-17; tests pin 08-02 rated

### F4 — The docs grep gate misses the stale wording it is meant to catch

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Success Criteria (3.2); Manual steps
- **Detail**: Gate 3.2's phrases ("overstated since 4 August", "over-reports import from 4 August") don't occur in the docs today. Only "largely cancel" matches (`docs/decisions.md:11`, `docs/logic.md:176`, `roadmap.md:451`). The real stale lines use other words:
  - `docs/logic.md:176` "from 2026-08-04 the inverter's grid import is overstated"
  - `docs/logic.md:109` "close to PGE at night"
  - the "10–20%" figure in `docs/decisions.md:24`

  The manual checks also disagree on August's rated range: 1.5 says 18–31 August, Manual Testing step 3 says 18–30.

- **Fix**: Change the gate to `git grep -n -i "largely cancel\|grid import is overstated\|close to PGE at night\|10–20" -- docs context/foundation` (the new decisions entry must quote none of these), and use "18–30 August (08-31 has no totals in production)" consistently.
- **Decision**: FIXED — gate 3.2 greps the real stale wording; August range 18–30 used consistently
