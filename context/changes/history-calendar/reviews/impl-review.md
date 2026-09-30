<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: History Calendar

- **Plan**: context/changes/history-calendar/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

The automated criteria were re-run on main at 6050688:

- 797 tests, lint, astro check (0 errors), the build and the docs grep (3 lines) all pass.
- Smoke passed locally (32 steps) and in the PR's CI.
- All 18 Progress rows are ticked with evidence, including 3.10 in production.

## Findings

### F1 — The day view drops the explanation of lower-ranked findings

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/history/DayView.astro:186-203 (vs src/components/RecommendationCard.astro:94-117)
- **Detail**: For findings beyond the first ones, the dashboard card shows `finding.meaning` and `finding.suggestedCheck`. The day view's "Pozostałe ustalenia" list leaves both out, so on a past day those findings lose their explanation and what to check. About 50 lines of the details markup are also copied from `RecommendationCard`, which is how the two drifted apart.
- **Fix**: Extract a shared `RecommendationDetails.astro` (main findings with meaning/check, more findings with meaning/check), used by `RecommendationCard` inside `DisclosureButton` and by `DayView` inside `<details>`.
  - Strength: Fixes the missing content and prevents future drift; both callers keep their own wrapper.
  - Tradeoff: Touches the dashboard card, so the dashboard's recommendation needs a quick look.
  - Confidence: HIGH — the two markups are near-identical apart from the omitted fields.
  - Blind spot: Whether the dashboard's disclosure island needs the markup as a slot rather than a child component.
- **Decision**: FIXED differently (owner): meaning and suggestedCheck added to DayView only; RecommendationCard untouched

### F2 — The default-month choice is untested logic in the page

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/dashboard/history.astro:86-95
- **Detail**: The page counts the current month's complete days from a two-month read and picks the current or previous month, falling back to the current month when the read fails. No unit test covers it, and the smoke step passes either way: it only checks that the current month's label appears somewhere on the page.
- **Fix**: Move it to a pure `defaultPeriodFromRows(rows, today)` next to `defaultMonth`, and test both branches and the fallback.
- **Decision**: FIXED — defaultPeriodFromRows and defaultPeriodRange in calendar-view.ts with tests; page keeps the failed-read fallback

### F3 — Rule values are hard-coded in user copy

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/history/QuarterView.astro:102, HistoryNotes.astro:21, 24-26, 36; MonthView.astro:185
- **Detail**: Three values are written into the copy instead of being taken from the code:
  - "7" instead of `MIN_RANKED_DAYS`;
  - "27 września 2026" instead of `FORECAST_HISTORY_START`;
  - "4 sierpnia", the import-overstatement date, which has no constant at all.
    If a rule changes, the explanation silently goes stale.
- **Fix**: Build these sentences in `calendar-view.ts` from the constants (with a named constant for the 4 August date), with tests.
- **Decision**: FIXED — sentences built in calendar-view.ts from MIN_RANKED_DAYS, FORECAST_HISTORY_START and GRID_IMPORT_OVERSTATED_FROM, wording pinned by tests

### F4 — Two different links carry aria-current="page"

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/history/PeriodNav.astro:45 (with DashboardHeader.astro:36)
- **Detail**: On history pages, both the header "Historia" link and the day/month/quarter switch are marked as the current page, and they point to different URLs.
- **Fix**: Use `aria-current="true"` on the kind switch.
- **Decision**: FIXED — aria-current="true" on the period switch

### F5 — Page helpers are copied instead of shared

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard/history.astro:42-58; DayView, MonthView, TotalsPanel, QuarterView (`NEUTRAL`, `sentence`)
- **Detail**: Two sets of helpers are duplicated:
  - `orLoadError` and `getClient` are copied verbatim from `dashboard.astro`.
  - `NEUTRAL` and `sentence()` are redefined in four components, and DayView's `sentence` adds no full stop while the others do.
- **Fix**: Move `orLoadError` and `getClient` into `src/lib`, and share `NEUTRAL` and `sentence` from one module.
- **Decision**: FIXED — src/lib/page-load.ts (orLoadError, pageClient) used by both pages; NEUTRAL/capitalize/sentence shared from calendar-view.ts

### F6 — Minor loader details

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/calendar-data.ts:45-59; src/pages/dashboard/history.astro:105-110, 137
- **Detail**: Two small issues, both harmless today:
  - `loadRecommendationsForDay` has no limit or truncation flag, so it is silently capped at 1000 rows. That doesn't matter at about 24 a day.
  - When the daily read fails, the month path still runs the recommendation-times query and discards the result.
- **Fix**: Add a comment on the day loader's cap, and skip the times query when the daily rows failed.
- **Decision**: FIXED — cap comment on loadRecommendationsForDay; month path skips the times query when daily rows failed (reads now sequential)

### F7 — Days before the history start look like future days, with no legend entry

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/history/MonthView.astro:52, 110
- **Detail**: In July 2026, days 1–15 render in the "future" style, and neither state has a legend entry. The screen-reader text is correct.
- **Fix**: Add a "przed początkiem historii" legend entry (or a distinct muted style) for days before 16 July.
- **Decision**: FIXED — muted style and legend entry for days before 16 July
