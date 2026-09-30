# History Calendar Implementation Plan

## Overview

Add a protected calendar at `/dashboard/history` where the owner moves, without typing dates, between **day, month and quarter** views of their energy history (roadmap S-15, US-05, FR-021). Each view shows PV production, house use and grid import for the period, stating the period and the number of days behind every figure. Views also show forecast against actual where a trusted forecast exists, and the period's recommendations. Charts are server-rendered SVG. The page leaves room for ratings (S-17), day notes (S-19) and lab summaries (S-18). The year view stays in S-16.

## Current State Analysis

From `context/changes/history-calendar/research.md` (including its 2026-09-30 data-sources follow-up):

- **Data in the app (production, 2026-09-30).** Daily totals and forecasts:
  - `daily_energy` has 67 rows from 2026-07-16. Five of them have null totals: 07-20, 08-31, 09-13, 09-19 and 09-21.
  - Ten days have no row: 07-31, 08-10, 09-14–18 and 09-22–24.
  - `pv_forecast_kwh` is trusted only from 2026-09-27 (`FORECAST_HISTORY_START`, `src/lib/services/recommendation.ts:11`).
- **Recommendations.** 122 rows from 2026-09-25, one per `generated_at`, so there are many per day. They are never pruned.
  - PostgREST caps a response at 1000 rows (`supabase/config.toml:18`).
- **Grid figures.** Grid import is over-reported from 4 August (`docs/logic.md:107`), and inverter export reads 0 from about 2026-08-13 while PGE recorded real export (research follow-up). Export is therefore left out of the calendar.
- **Loaders.**
  - `loadDailyEnergy` reads the last 400 days (`src/lib/services/usage-insight.ts:60-70`).
  - `loadLatestRecommendation` returns one row (`recommendation.ts:84-93`).
  - No range loader exists.
- **Reusable pieces.**
  - Pure helpers:
    - `dailySeries` builds a series with null gaps (`src/lib/services/daily-series.ts:16-30`).
    - `formatPeriod` gives the FR-018 period text (`src/lib/format/period.ts:8`).
    - `warsaw-time.ts` has day-key arithmetic, `formatDayMonth`, `formatMonth`, `formatWeekday` and `warsawMonthKey`.
    - `kwhLabel` and `MISSING` are in `values.ts`.
  - Card components: `StatusBadge` with `lib/format/status.ts`, `TermsExplained` with `glossary.ts`, `Panel`, and `CardHeading` (always h2).
  - `toRecommendationView` relabels "dziś/jutro" for earlier days (`recommendation.ts:160-191`).
- **UI.**
  - The only protected page is `/dashboard`: `PROTECTED_ROUTES = ["/dashboard"]` with a prefix match (`src/middleware.ts:5, 38`).
  - There is no navigation, and nothing puts a date in a URL.
  - `DashboardHeader.astro` holds the brand `h1` and the sign-out form. `DashboardBody.astro` is the page shell and places `<main>`.
  - The only chart primitive is the line/area `Sparkline.astro` over `src/lib/sparkline.ts` (min–max scaling, gaps, at least 3 points).
- **Tests.**
  - Vitest runs in node with no DOM, and all tests are pure `src/lib` tests.
  - `scripts/smoke.mjs:62-72` checks redirects and `<main`/`<h1` on pages.

## Desired End State

A signed-in owner opens "Historia" from the header and lands on the current month, or on the previous month while the current one has fewer than 7 complete days (never before 2026-07-16).

- **Month view.**
  - A Monday-first month grid of day links, plus totals for PV, house use and grid import over complete days with "z N z M dni" and the period text.
  - A daily PV bar chart with a house-use line, and a daily grid-import bar chart.
  - Forecast against actual over the days that have a trusted forecast, and previous/next month links.
- **Day view.**
  - The day's totals, and its forecast against actual or a plain reason why there is none.
  - The day's morning recommendation, with later ones folded.
  - Previous/next day links.
- **Quarter view.** Its three months' totals with day counts, a grouped monthly bar chart, and links to each month.

Missing days are gaps, never zeros. Today is never counted as complete. A period with fewer than 7 complete days says "za mało danych" instead of totals. An unfinished month or quarter says so and is never extrapolated. The URL carries the period (`?day=2026-09-14`, `?month=2026-09`, `?quarter=2026-Q3`). An invalid or out-of-range parameter redirects to the current month. Anonymous visitors are redirected to sign-in.

### Key Discoveries:

- `/dashboard/history` is protected by the existing prefix match (`src/middleware.ts:38`), so no middleware change is needed.
- `dailySeries` already produces the calendar-indexed null-gap series the daily charts need (`daily-series.ts:16-30`).
- `formatPeriod` throws on an empty list (`period.ts:8`), so callers must handle "no complete days" before calling it.
- Recommendation rows per month can approach the 1000-row cap if the lab narrates more often, so month and quarter views read only `generated_at` with an explicit limit, and full texts load for one day at a time.

## What We're NOT Doing

- **No year view.** That is S-16 `calendar-year-view`.
- **No filling of the missing or empty days.** A separate lab change reads Home Assistant hourly statistics and re-sends them with the `--from/--to` push (recorded as a roadmap follow-up in Phase 3).
- **No PGE figures and no inverter export series.** Export is explained in "Co to znaczy?".
- **No hourly chart in the day view**, and no change to the `hourly_energy` retention.
- **No ratings, notes or lab summaries.** They are S-17, S-19 and S-18; the views only reserve their place.
- **No contract, migration, lab or ingest change, and no client-side JavaScript** beyond native `<details>`.
- **No change to the dashboard's cards** other than the header link.

## Implementation Approach

Follow S-14's split: pure period and view-model functions in `src/lib` decide every number, status and label and are unit-tested; thin loaders fetch by range; Astro components only render. Charts get a new pure bar-geometry helper next to `sparkline.ts` and extend its gap model and accessible-label style, so the SVG stays server-rendered with no library. The page is one server-rendered route that reads the period from the URL, loads only that period's rows, and renders the matching view, with per-section load errors like the dashboard's `orLoadError`.

## Critical Implementation Details

- **Timing & lifecycle.** "Today" and "complete" are decided with the Europe/Warsaw day key of the request time, not UTC.
  - A day counts as **complete** when it is before today and its `pv_kwh`, `load_kwh` and `grid_import_kwh` are all non-null.
  - Today and future days are never complete. A day view for today says the day is still going and shows the running totals marked as such.
  - Month and quarter ranges are computed from day keys (`addDays`, `dayKeyToUtcMs`), so DST never shifts a boundary.
  - Recommendation ranges are the half-open instant range `[warsawDayHours(first)[0].startMs, warsawDayHours(addDays(last, 1))[0].startMs)`: the next Warsaw day's start is the exclusive end, the idiom `hourly-usage.ts:86` already uses. A test covers a range ending on a DST-change day.
- **Debug & observability.** The page must render a section with `Problem · nie udało się wczytać` when a loader throws, never a 500, following `dashboard.astro:15-23`.

## Phase 1: Periods and data

### Overview

Pure period helpers, range loaders and view models for day, month and quarter, fully unit-tested, with no UI yet.

### Changes Required:

#### 1. Period model

**File**: `src/lib/calendar/period.ts` (new), `src/lib/calendar/period.test.ts` (new)

**Intent**: One place that parses and validates the URL period, knows each period's day range, and knows the navigation limits. Every view and link derives from it.

**Contract**:

- `type CalendarPeriod = { kind: "day"; day: string } | { kind: "month"; month: string } | { kind: "quarter"; year: number; quarter: 1|2|3|4 }`.
- `parsePeriod(params: URLSearchParams, today: string): CalendarPeriod | "default" | null` accepts exactly one of `day` (`YYYY-MM-DD`), `month` (`YYYY-MM`) or `quarter` (`YYYY-Qn`). It returns null for a malformed or combined parameter, or for a period that ends before `HISTORY_START = "2026-07-16"` or starts after `today`. No parameter returns `"default"`.
- `defaultMonth(today, completeDaysInCurrentMonth): string` returns the current month when it has at least `MIN_RANKED_DAYS` complete days, and otherwise the previous month, never earlier than the month of `HISTORY_START`. The page resolves `"default"` by loading the current and previous month's rows and calling it.
- `periodDays(p): string[]` gives the inclusive day keys in calendar order.
- `periodLabel(p)`: "14 września 2026, poniedziałek", "wrzesień 2026", "III kwartał 2026".
- `adjacent(p, today): { prev: CalendarPeriod | null; next: CalendarPeriod | null }` is bounded by `HISTORY_START` and today.
- `toSearch(p)` builds the URL query.
- `monthGrid(month): (string | null)[][]` returns Monday-first weeks with null padding.
- `quarterMonths(year, q)` gives the quarter's month keys.

#### 2. Range loaders

**File**: `src/lib/services/calendar-data.ts` (new)

**Intent**: Fetch only the period's rows, owner-only through the existing RLS, throwing on error like the other loaders.

**Contract**:

- `loadDailyRange(client, from, to): Promise<DailyEnergyRow[]>` selects the same six columns as `loadDailyEnergy`, with `.gte/.lte` on `day`, ordered ascending.
- `loadRecommendationTimes(client, fromMs, toMs): Promise<{ times: string[]; truncated: boolean }>` selects `generated_at` only, with `.gte/.lt` and `.limit(1000)`. `truncated` is true when exactly 1000 rows come back; the month view then marks the recommendation markers as possibly incomplete ("znaczniki rekomendacji mogą być niepełne").
- `loadRecommendationsForDay(client, fromMs, toMs): Promise<RecommendationRow[]>` selects the full rows for one Warsaw day, ascending.

#### 3. Historical recommendation view

**File**: `src/lib/services/recommendation.ts`, `src/lib/services/recommendation.test.ts`

**Intent**: A past day's advice must not be judged against today. Today the mapper gives it a red "dotyczy innego dnia" status, `isStale`, and neutral finding chips (`recommendation.ts:100-110, 152, 169-179`).

**Contract**: `toRecommendationView(row, now, opts?: { historical?: boolean })`. With `historical: true`: a neutral status "z 27 września, 14:00" (generation time in Warsaw), `isStale = false`, `isCurrent = false`, findings keep their real tones, and the forecast relabelling for earlier days (`isFromEarlierDay`, `RecommendationForecast.astro:28-38`) is kept. Without the option, behaviour is unchanged, so the dashboard and the existing tests stay as they are.

#### 4. View models

**File**: `src/lib/services/calendar-view.ts` (new), `src/lib/services/calendar-view.test.ts` (new)

**Intent**: Decide every figure, status and sentence for the three views, so the components only render.

**Contract**:

- The minimum is `MIN_RANKED_DAYS` (7), imported from `hourly-usage.ts:22`, not a second constant.
- `buildMonthView(month, rows, recTimes, today)` returns:
  - Totals for PV, house use and grid import summed over complete days, with `completeDays` and `calendarDays`, the `formatPeriod` label over the complete days, and `unfinished: boolean`.
  - Or `{ kind: "insufficient", completeDays, needed: 7 }` when `completeDays < 7`.
  - Per-day grid cells `{ day, status: "complete" | "empty" | "missing" | "today" | "future", hasRecommendation }`.
  - Daily chart series from `dailySeries`. Rows for today and later are dropped before calling it, because `dailySeries` filters only by window (`daily-series.ts:25`); a test checks today is a gap.
  - Forecast against actual: the sum of `pv_forecast_kwh` and `pv_kwh` over complete days on or after `FORECAST_HISTORY_START` that have a forecast, with a day count. The same 7-day minimum applies, otherwise "za mało danych — prognozy zbierane od 27 września".
- `buildQuarterView(year, q, rows, today)` gives per-month totals and day counts under the same rules, plus quarter totals over the months' complete days. An unfinished quarter is flagged, and months before `HISTORY_START` show as "brak danych".
- `buildDayView(day, row, recs, today, now)` returns:
  - Totals, or the reason there are none: no row ("brak danych z tego dnia") or null totals ("dane z tego dnia są niepełne").
  - Forecast against actual when the day is at or after `FORECAST_HISTORY_START` and has a forecast. Otherwise "prognoza nie była jeszcze zbierana" or "brak prognozy".
  - The day's advice: the first recommendation with Warsaw time ≥ 06:00, or else the first of the day marked "wygenerowana przed 6:00". It is mapped through `toRecommendationView(row, now, { historical: true })`, and `others` holds the rest in time order.
  - Today yields `inProgress: true` with its partial totals labelled as running.
- Every view carries reserved empty slots `rating: null`, `note: null` and `summary: null` for S-17, S-19 and S-18.

### Success Criteria:

#### Automated Verification:

- Unit tests pass. They cover:
  - Period parsing: valid, malformed, combined, before 2026-07-16, future, no parameter (`"default"`), and `defaultMonth` at 6 and 7 complete days and in July 2026.
  - Month grid for a month starting on a Sunday, and a 23/25-hour DST day in range.
  - Totals over complete days only, and the 7-day minimum at 6 and 7 days.
  - Today and future never complete.
  - Forecast days only from 2026-09-27.
  - Morning-recommendation choice, including a day with only pre-06:00 rows.
  - The historical recommendation view: neutral status, not stale, real finding tones; the default view unchanged.
  - Today's row is a gap in the month series; the recommendation instant range ends at the next Warsaw day's start, including a DST day; `truncated` marks the markers as possibly incomplete.
  - Quarter Q3 2026 starting mid-July.

  Command: `npm test`

- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`

#### Manual Verification:

- Against production data read with the owner's session, or copied into a test fixture of the 2026-09 rows:
  - `buildMonthView("2026-09", …)` reports the missing and empty September days as such.
  - It gives 18 complete days (29 past days minus 8 missing and 3 empty), and forecast against actual over 3 days (09-27 to 09-29) as "za mało danych".

**Implementation Note**: After this phase and its automated checks, pause for the owner's confirmation of the manual check.

---

## Phase 2: Charts

### Overview

A zero-baseline bar geometry helper and two server-rendered SVG chart components with accessible descriptions.

### Changes Required:

#### 1. Bar geometry

**File**: `src/lib/bars.ts` (new), `src/lib/bars.test.ts` (new)

**Intent**: Turn calendar-indexed values (with null gaps) into bar rectangles on a zero baseline, plus an optional line series on the same scale. Grouped bars for the quarter are also supported, so both charts share one tested scale rule.

**Contract**:

- `barGeometry(series: (number|null)[][], opts: { width; height; gap; lineSeries?: (number|null)[] }) → { bars: {x; y; w; h; seriesIndex; slot}[]; line: string | null; max: number } | null`.
- The scale is 0 to the maximum over all bars and the line. Null values leave an empty slot, never a zero-height bar. The result is null when fewer than 3 slots in the chart hold a value, mirroring the sparkline's minimum.
- `describeBars(subject, windowLabel, series, unit)` gives an accessible label naming the window, the highest and lowest day with values, and "dane z X z Y dni" when there are gaps. It never states a trend, following `sparkline.ts:101-115`.

#### 2. Chart components

**File**: `src/components/history/DailyBarsChart.astro` (new), `src/components/history/MonthGroupChart.astro` (new)

**Intent**: Render the month's daily charts (PV bars with a house-use line; grid-import bars) and the quarter's grouped monthly bars. Each uses token colours only.

**Contract**:

- `DailyBarsChart` props: `bars: (number|null)[]`, `line?: (number|null)[]`, `subject`, `windowLabel`, `barTone: "pv"|"grid"`, `lineTone?: "home"`.
- `MonthGroupChart` props: `months: { label; pv; load; import; completeDays; calendarDays }[]`.
- Both render `role="img"` with the `describeBars` label, a small legend with colour plus word, and day or month tick labels readable at 390 px. When the geometry is null they show "za mało dni".
- Colours come from `--flow-pv`, `--flow-home` and `--flow-grid` through the existing tone classes, with no hex values. The surface behind the SVG is opaque (`bg-card`/`bg-inset`), as `Sparkline.astro` requires.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: zero baseline, null gaps kept as empty slots, fewer than 3 values giving null, the line on the bar scale, grouped offsets, and label text with gaps. Command: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`

#### Manual Verification:

- Both charts render in a scratch page or Phase 3's page with September data, and gaps show as missing bars.

**Implementation Note**: Pause for the owner's confirmation before Phase 3.

---

## Phase 3: Page and navigation

### Overview

The `/dashboard/history` page with the three views, header navigation, smoke checks and docs.

### Changes Required:

#### 1. Page

**File**: `src/pages/dashboard/history.astro` (new)

**Intent**: Read the period from the URL and load only its rows with per-section failure handling. Then render the day, month or quarter view inside `AppShell` (below), which supplies the `<main>` and the header `h1`.

**Contract**:

- `parsePeriod` returning null means a 302 to `/dashboard/history`.
- Loaders run in parallel. A failing loader sets that section to the `LOAD_FAILED` status, following `dashboard.astro:15-23`.
- No auto-reload script, since past periods don't change every 5 minutes.
- Title: "Historia — <periodLabel>".

#### 2. Shared page shell

**File**: `src/components/AppShell.astro` (new), `src/components/DashboardBody.astro`, `src/components/DashboardHeader.astro`

**Intent**: `DashboardBody.astro:15-48` is the dashboard's card grid and hard-codes the page layout, so there is no shell to render the history page into. Extract one so both pages share the layout, landmarks and header.

**Contract**: `AppShell` props `email`, `current: "dashboard" | "history"`; it renders the aurora wrapper, `DashboardHeader` (new prop `current`), `<main>` with the default `<slot/>`, and an optional `legend` named slot. `DashboardBody` renders its cards inside `AppShell` with `SourceLegend` in the legend slot, so the dashboard's markup and landmarks stay the same. The dashboard's 5-minute reload stays in `dashboard.astro`.

#### 3. View components

**File**: `src/components/history/PeriodNav.astro`, `MonthView.astro`, `DayView.astro`, `QuarterView.astro` (new)

**Intent**: Render the view models with the existing `Panel`, `CardHeading` (h2), `StatusBadge`, `TermsExplained` and period text.

**Contract**:

- `PeriodNav`: previous/next links (≥ 24 px targets, `aria-label` naming the target period), the current label as the page's h2, and a switch between day, month and quarter.
- `MonthView`: totals card, month grid, two `DailyBarsChart`s, and forecast against actual.
  - The grid uses `<table>` semantics with weekday headers. Each day cell is a link with an accessible name like "14 września, dane pełne" or "…, brak danych", and a small marker for days with a recommendation.
- `DayView`: totals, forecast against actual, and its own advice section headed "Rekomendacja z tego dnia", built from the historical recommendation view: no stale warning, no "Rekomendacja na dziś" heading, so it does not reuse `RecommendationCard`. The later ones sit in "Pozostałe (N)" in a native `<details>`.
- `QuarterView`: per-month rows linking to each month, and `MonthGroupChart`.
- A "Co to znaczy?" block explains the terms, why export is not shown, that grid import has been overstated since 4 August, and that missing days are left empty.
- The reserved rating, note and summary slots render nothing.

#### 4. Header navigation

**File**: `src/components/DashboardHeader.astro`

**Intent**: Give both pages a way between "Pulpit" and "Historia", driven by the `current` prop passed through `AppShell`.

**Contract**:

- A `<nav aria-label="Główna">` with two links, where the current page carries `aria-current="page"`.
- It keeps the existing brand `h1` and sign-out form, and works at 390 px without horizontal scroll.

#### 5. Smoke checks

**File**: `scripts/smoke.mjs`

**Intent**: Guard the new route like the dashboard.

**Contract**:

- New steps:
  - `/dashboard/history` redirects an anonymous user to `/auth/signin`.
  - Signed in, `/dashboard/history` returns 200 and contains `<main`, `<h1` and the current month's label.
  - Signed in, `?month=bad` returns a 302 whose location is exactly `/dashboard/history`. The smoke matcher compares by prefix (`smoke.mjs:295`), so this step compares the full location itself.
- The signed-in steps sit between sign-in (`smoke.mjs:100`) and sign-out (`:132`).

#### 6. Docs and roadmap

**Files**: `docs/logic.md`, `docs/decisions.md`, `docs/architecture.md`, `context/foundation/roadmap.md`

**Intent**: Record the calendar's rules and decisions (lesson: keep the project docs in step).

**Contract**:

- `logic.md` gets a "Historia (kalendarz)" section: complete-day definition, 7-day minimum, sums with day counts, no extrapolation, the forecast-from-2026-09-27 rule, the morning-recommendation rule, and export left out.
- `decisions.md` gets a dated 2026-09-30 entry covering: S-15 is day/month/quarter with the year in S-16; `/dashboard/history` with URL periods; inverter export and PGE figures left out; no hourly chart; gaps not filled in this change.
- `architecture.md` gets the new page and the range loaders.
- `roadmap.md`:
  - The S-15 outcome drops "years".
  - The S-16 row goes into At a glance.
  - A new proposed follow-up item fills the missing and empty days from Home Assistant's hourly statistics with the `--from/--to` push.
  - A parked note covers PGE monthly import/export in the calendar pending a privacy decision.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- Local smoke passes, including the three new history steps: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`
- The docs record the calendar: `git grep -n "Historia" -- docs/logic.md docs/decisions.md` prints at least two lines

#### Manual Verification:

- The dashboard looks and reads the same as before the shell extraction (cards, landmarks, header, legend), now with the "Pulpit / Historia" nav.
- On the local stack with fixture history, at 1440 px and 390 px:
  - Month, day and quarter views render without clipping or horizontal scroll.
  - Previous/next and the grid links move correctly, stopping at 2026-07-16 and today.
  - A missing day, an empty day and today each read correctly.
- Accessibility tree: one `main`, one `h1`, view headings as h2/h3, the `nav` with `aria-current`, chart images with descriptive labels, and grid day links with names.
- In production after deploy, September 2026:
  - It shows the missing days as gaps and totals with their day count.
  - 2026-09-27 shows its morning recommendation.
  - Q3 2026 shows July from the 16th.

---

## Testing Strategy

### Unit Tests:

- Period parsing and navigation bounds (history start, today, quarter boundaries, a month starting on Sunday).
- Complete-day rule, 7-day minimum at the boundary, sums over complete days only, and unfinished periods never extrapolated.
- Forecast against actual only from 2026-09-27, and only on days with a forecast.
- Morning recommendation choice and the pre-06:00 fallback, with other recommendations kept in order.
- Bar geometry: zero baseline, gaps, the 3-value minimum, the line on the bar scale, grouped bars, labels.

### Integration Tests:

- Smoke: anonymous redirect, the signed-in page landmark and label, and the invalid-parameter redirect.

### Manual Testing Steps:

1. Open "Historia" from the dashboard header and step back month by month to July 2026. "Previous" stops at July.
2. Open 2026-09-14 (missing), 2026-09-13 (empty) and today, and read each message.
3. Open 2026-09-27 and check the morning recommendation and the folded others.
4. Open Q3 2026 and check July's day count and the links to months.
5. Repeat on a phone-width viewport.

## Performance Considerations

A month view reads at most 31 daily rows and at most 1000 `generated_at` values. A quarter reads at most 92 daily rows and no recommendation texts. A day reads one daily row and that day's recommendations. The page makes no hourly queries.

## Migration Notes

None. There is no schema or contract change, and rollback is reverting the PR. External prerequisites (lesson: name every prerequisite outside the repo): none new. The page reads only `daily_energy` and `recommendations`, which the lab already fills.

## References

- Research: `context/changes/history-calendar/research.md` (including the data-sources follow-up)
- Requirements: `context/foundation/prd-v3.md` US-05 (116-128), FR-021 (213); roadmap S-15 (`context/foundation/roadmap.md:220-230`), S-16 (232-242)
- Patterns: `src/lib/sparkline.ts`, `src/lib/services/daily-series.ts`, `src/lib/format/period.ts`, `src/pages/dashboard.astro:15-102`, `context/archive/2026-09-26-data-period-transparency/plan-brief.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Periods and data

#### Automated

- [x] 1.1 Unit tests pass, covering period parsing and the default month, month grid, complete-day totals, the 7-day minimum, today/future and today as a gap, forecast days, morning recommendation and its historical view, the instant range on a DST day, truncated markers, and Q3 2026: `npm test` — 5e00c2e
- [x] 1.2 Linting passes: `npm run lint` — 5e00c2e
- [x] 1.3 Type checks pass: `npx astro check` — 5e00c2e

#### Manual

- [ ] 1.4 `buildMonthView("2026-09", …)` on production-shaped September data reports missing and empty days, 18 complete days, and forecast against actual as "za mało danych"

### Phase 2: Charts

#### Automated

- [x] 2.1 Unit tests pass for bar geometry and labels: `npm test` — 11cc71c
- [x] 2.2 Linting passes: `npm run lint` — 11cc71c
- [x] 2.3 Type checks pass: `npx astro check` — 11cc71c

#### Manual

- [ ] 2.4 Both charts render with September data and show gaps as missing bars

### Phase 3: Page and navigation

#### Automated

- [x] 3.1 Unit tests pass: `npm test`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 Type checks pass: `npx astro check`
- [x] 3.4 Production build succeeds: `npm run build`
- [x] 3.5 Local smoke passes, including the three new history steps: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`
- [x] 3.6 The docs record the calendar: `git grep -n "Historia" -- docs/logic.md docs/decisions.md` prints at least two lines

#### Manual

- [ ] 3.7 The dashboard looks and reads the same as before the shell extraction, now with the "Pulpit / Historia" nav
- [ ] 3.8 Local stack at 1440 px and 390 px: views render without clipping or horizontal scroll, navigation stops at 2026-07-16 and today, and missing, empty and today's days read correctly
- [ ] 3.9 Accessibility tree: one main and one h1, h2/h3 view headings, nav with aria-current, labelled chart images and named day links
- [ ] 3.10 Production after deploy: September 2026 shows gaps and day-counted totals, 2026-09-27 shows its morning recommendation, and Q3 2026 shows July from the 16th
