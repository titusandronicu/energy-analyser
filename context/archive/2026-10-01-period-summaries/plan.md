# Period summaries (S-18) Implementation Plan

## Overview

Show the home lab's plain-language texts, which `lab-period-summaries` (F-04) already pushes into `public.period_summaries`. The dashboard gets a "today explained" card under the recommendation, and the calendar's day and month views get a summary panel next to the rating. Each text is shown as narrated, with its generation time and the period it covers. This is display only: no migration, no contract change and no lab work.

## Current State Analysis

- **Storage is live in the codebase.** `public.period_summaries` has primary key `(kind, period)`, kinds `today | day | month`, `facts` jsonb, nullable `narration_*` columns and `built_at` (`supabase/migrations/20261001094118_period_summaries.sql:9-21`). Owner-only read: a column grant on eight columns plus an `app_owners` policy (:171-181). `push_id` is unreadable, so `select *` fails; a non-owner gets zero rows, not an error. `PeriodSummaryRow` already exists (`src/types.ts:63-77`). Nothing reads the table yet.
- **A newer entry without narration never replaces a stored narration** (`20261001113911_period_summaries_keep_narration.sql`), so a row with `narration_text` null means the text has never been written for that period.
- **There is no `grid_sensor_reliable` column.** It is a key inside `facts`, always `false` from the lab. The texts never quote grid or house-use figures (`docs/logic.md` "Period summaries"), and the app shows no facts at all, so it cannot leak them.
- **Calendar.** The history page is server-rendered Astro with no client JavaScript; everything loads in the frontmatter through `orLoadError` (`src/pages/dashboard/history.astro:93-150`). Day and month views render `RatingPanel` (`DayView.astro:101`, `MonthView.astro:82`). The view builders already carry a reserved slot: `ReservedSlots.summary: null` (`src/lib/services/calendar-view.ts:193-199`), set from `RESERVED` (:300) and pinned `null` in `buildDayView` (:623) and in the month and quarter builders (:481, :514); tests pin it (`calendar-view.test.ts:282,328,376,391`).
- **Dashboard.** `DashboardBody.astro:29-43` renders `LiveStateCard`, then a `lg:grid-cols-3` grid with `RecommendationCard` in `lg:col-span-2` and `BillForecastCard` plus `UsageInsightCard` on the right, then `HourlyUsageCard`. `dashboard.astro:24-57` loads each card in parallel through `orLoadError` and the page reloads itself every 5 minutes while visible (:71-85).
- **Staleness precedent.** The recommendation is stale after more than 2 hours or when generated on an earlier Warsaw day (`recommendation.ts:9`, `:99-103`), with three badge tones "aktualna", "sprzed X", "z 27 września — dotyczy innego dnia" (:107-115) and a generation time label (:190).
- **Lab cadence** (`docs/logic.md` "Period summaries"): the `today` entry is rebuilt about every 55 minutes and not at all before 00:30 Warsaw; a day gets a text only when complete (a sample at or after 23:00); a month needs at least 7 complete days and is written from the 1st of the next month. Quarters get no text. Rows are kept forever.

### Key Discoveries:

- The slot `summary` is already spread into the day, month and quarter views, so the work is typing it and filling it, not restructuring the views.
- One `today` row exists per Warsaw day (`period` is the date), so "today's text" is the row with the newest `period`, not the only `today` row.
- Texts are untrusted strings from the lab: render them as escaped text only, never as HTML.

## Desired End State

On the dashboard, a card under the recommendation explains today's figures in plain Polish, with a status badge (current, older than 2 hours, or from another day) and the time it was generated. In the calendar, a completed day and a completed month show the lab's summary beneath the rating, with its generation time and the day or month it covers. Where the lab has facts but no text yet, the card or panel says the text has not appeared yet and shows no figures. Verify with the unit tests, the smoke test against local Supabase and, after the app deploy, a look at production.

## What We're NOT Doing

- No migration, contract change or lab change (F-04 owns them).
- No display of `facts`: a period with facts but no narration shows one neutral sentence, not figures (owner's decision).
- No summary on the quarter view and none on today's calendar day, because the lab writes no quarter texts and today's text lives on the dashboard (owner's decisions).
- No panel at all for a period with no row (an incomplete day, a month with fewer than 7 complete days, or a gap): nothing is written for it, so nothing is shown (plan default).
- No model or provider label on the texts (plan default; the roadmap asks only for generation time and covered period).
- No live reload of the history page and no client JavaScript; the dashboard keeps its existing 5-minute reload.
- No app-side check that the text is free of advice or numbers; that stays in the lab (`docs/logic.md`).
- No change to ratings, day notes or the recommendation card.

## Implementation Approach

One service file holds the loaders and the pure view mappers, so both surfaces share one staleness rule and one set of Polish strings. Components only render, as in the calendar today. The calendar's builders take the already-loaded rows and map them through the service, keeping the `summary` slot's shape in one place. Work goes in three phases: service first with tests on synthetic data, then the calendar, then the dashboard card with the docs.

## Phase 1: Loaders and view service

### Overview

Add the read path and the pure mapping from a row to what the surfaces show, fully unit-tested, with no UI yet.

### Changes Required:

#### 1. Period summary service

**File**: `src/lib/services/period-summary.ts` (new), `src/lib/services/period-summary.test.ts` (new)

**Intent**: Load summary rows for the signed-in owner and map each to a view that is safe to render: a narrated text with its generation time and covered period, or a "not written yet" state. Errors are thrown, like the other loaders, so the page shows a load failure instead of an empty state.

**Contract**:

- `loadTodaySummary(client)`: the `kind = 'today'` row with the newest `period`, or `null`. `loadPeriodSummary(client, kind: "day" | "month", period)`: one row by `(kind, period)`, or `null`. Both select exactly the eight granted columns by name, never `*`, and end with `.overrideTypes<…, { merge: false }>()` as in `calendar-data.ts:13-30`.
- A `SummaryView` for the calendar: `{ kind: "narrated"; text; generatedAtLabel; periodLabel } | { kind: "pending"; periodLabel }`. A row whose `narration_text` is null or blank maps to `pending`. `generatedAtLabel` comes from `narration_generated_at`, falling back to `built_at`, through `formatWarsawDateTime`.
- A `TodaySummaryView` for the dashboard: `{ kind: "empty" } | { kind: "pending"; periodLabel } | { kind: "narrated"; text; generatedAtLabel; periodLabel; status; isStale }`. Staleness imports `isStaleRecommendation(generatedAt: Date, now: Date)` and `STALE_AFTER_MS` from `recommendation.ts` (`:100`, `:9`; other services define their own `STALE_AFTER_MS` with other values, so import from there) and `formatAge` from `live-state.ts:340`. The conditions are older than 2 hours by `built_at`, or `period` before today's Warsaw day key. `recommendationStatus` is private to `recommendation.ts` and worded for advice, so the service builds its own status mapping from the generic `Status` tones in `src/lib/format/status.ts` with the same wording ("aktualna", "sprzed X", "z <date> — dotyczy innego dnia"); `now` is a parameter.
- Precedence for the dashboard: a row from an earlier day with no narration maps to `empty` (it would otherwise say a finished day's text has not appeared yet); a row from an earlier day with narration is shown as narrated with the "another day" status; a row from today with no narration is `pending`.
- Invariants, each pinned by a test: `facts` is never read or exposed; the text is returned as given (trimmed); a `today` row from an earlier day reads "z <date> — dotyczy innego dnia"; `built_at` exactly 2 hours old is current, one millisecond over is stale (same boundary as the recommendation).

#### 2. Reserved slot type

**File**: `src/lib/services/calendar-view.ts`

**Intent**: Replace `summary: null` in `ReservedSlots` with `SummaryView | null` so the builders can carry a summary.

**Contract**: `buildDayView` and `buildMonthView` accept an optional summary row (default `null`, like `note`) and fill the slot through the service mapper; `buildQuarterView` keeps `null`. A day view for today or a future day, and a month view for the current month, force `null` whatever row is passed. Update the slot comment (:190-192) to say the summary is filled on the day and month views.

### Success Criteria:

#### Automated Verification:

- Service tests pass, including the eight-column select, the staleness boundary, the earlier-day case, the null and blank narration case and "facts never exposed": `npm test`
- Calendar view tests pass with the summary slot filled on completed days and months and null on today, the current month and the quarter: `npm test`
- Linting passes: `npm run lint`
- Type check passes: `npx astro check`

---

## Phase 2: Calendar display

### Overview

Show the summary beneath the rating on completed days and months.

### Changes Required:

#### 1. Summary panel

**File**: `src/components/history/SummaryPanel.astro` (new), `src/components/history/DayView.astro`, `src/components/history/MonthView.astro`

**Intent**: Render a `Panel` with a `CardHeading` ("Podsumowanie dnia" / "Podsumowanie miesiąca"), the text, and a muted line with when it was written and which day or month it covers. A `pending` view renders one neutral sentence (the text has not appeared yet) and no figures. Place it directly after `RatingPanel` in both views, before the day note panel.

**Contract**: props `{ title; summary: SummaryView; testId }`; test ids `history-day-summary` and `history-month-summary`. The text goes in a plain `<p>` as escaped text (no `set:html`). It adds no heading above `h3` inside the card and no client script. A `null` summary renders nothing.

#### 2. Load on the history page

**File**: `src/pages/dashboard/history.astro`

**Intent**: Load the day's or month's summary row in the frontmatter, only for a completed day or month, through `orLoadError` so a failure leaves the rest of the page intact, and pass it to the view builders.

**Contract**: day branch (:118-144) calls `loadPeriodSummary(client, "day", day)` when `day` is before today; month branch (:93-116) calls it with `"month"` and the month key when the month is before the current Warsaw month; the quarter branch loads nothing. A load failure behaves like a missing summary for that panel (logged by `orLoadError`), not a page error. This is a deliberate choice: the panel is decorative, so the calendar shows no error line for it (unlike the dashboard card), and a month summary also cannot render when the month view itself is `null` because the daily rows failed.

#### 3. Smoke coverage

**File**: `scripts/smoke.mjs` (`example-v1.json` stays untouched: the contract tests and the exported schema depend on it)

**Intent**: Prove end to end that a pushed narrated summary appears on the history page for its day and month.

**Contract**: the fixture's own rows cannot do this (its `day` row 2026-09-22 has `narration: null`, its `month` row is 2026-08, and the note flow opens yesterday), so `freshSummaries()` in `smoke.mjs:66-73` is extended to build its own entries from the clock, as it already rewrites `built_at`: a narrated `day` entry for yesterday's Warsaw day and a narrated `month` entry for the previous Warsaw month, each with a unique text marker. The smoke test asserts the `history-day-summary` and `history-month-summary` ids and the marker on `/dashboard/history?day=…` and `?month=…`, asserts that today's day view has no `history-day-summary`, and keeps the existing fixture rows and their owner-read, anon-denied and keep-narration steps passing. Use the same marker approach so a `pending` day (the fixture's null-narration row, if its date is opened) shows no marker.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`
- Smoke test passes against local Supabase and a running server, never production: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- On a completed day and a completed month with a narrated row, the panel shows the text, "napisane" time and the covered day or month, directly under the rating
- A completed day without a row shows no panel and no gap or error; a row with null narration shows the "has not appeared yet" sentence and no numbers
- Today's day view and the quarter view show no summary panel
- The panel reads well at phone width and in the frosted theme, with the day note panel still beneath it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Dashboard card and docs

### Overview

Add the "today explained" card, then bring the project docs and the roadmap in step.

### Changes Required:

#### 1. Today card

**File**: `src/components/TodaySummaryCard.astro` (new), `src/components/DashboardBody.astro`, `src/pages/dashboard.astro`

**Intent**: Show today's explanation in the `col-span-2` column directly after `RecommendationCard`, using the same card shell, `CardHeading` (`h2`, "Co oznaczają dzisiejsze liczby") and `StatusBadge` as the recommendation. States: no row ("laboratorium jeszcze nic nie przesłało", tone insufficient), row without text ("opis jeszcze się nie pojawił"), narrated and current ("aktualna"), older than 2 hours ("sprzed X"), from an earlier day ("z 27 września — dotyczy innego dnia"), and load failure (the shared `LOAD_FAILED` status and "Spróbuj odświeżyć stronę."). The generation time sits beside the badge as "Wygenerowano …", and the covered day under the text.

**Contract**: `DashboardBody` gains a `todaySummary: TodaySummaryView | null` prop (`null` is the load failure, as for the other cards); `dashboard.astro` loads it in the existing `Promise.all` through `orLoadError`, with `null` when Supabase is not configured giving the empty state. Test ids `today-summary` and `today-summary-status`. The stale-day wording mirrors `recommendationStatus` (`recommendation.ts:107-115`). No heading other than the `h2`, no second `<main>`.

#### 2. Smoke coverage

**File**: `scripts/smoke.mjs`

**Intent**: Assert the card is on the dashboard after a push that carries a `today` entry.

**Contract**: `freshSummaries()` also sets its `today` entry's `period` to the current Warsaw day key (the fixture's is 2026-09-23, which would only ever show the "another day" state), with a unique marker in the text. The smoke test asserts the `today-summary` id, the marker and the "aktualna" status on `/dashboard`; the existing `<main` and `<h1` checks stay. The other states (old, another day, pending, empty) are covered by unit tests and the manual steps.

#### 3. Docs and roadmap

**File**: `docs/logic.md`, `docs/decisions.md`, `docs/architecture.md`, `docs/prerequisites.md`, `context/foundation/roadmap.md`

**Intent**: Per the lessons, record the built behaviour where a reader of the repository will look.

**Contract**:

- `logic.md`: in "Period summaries" replace "does not show them yet (S-18)" with the display rules (which view shows which kind, the staleness rule, pending versus absent, quarter and today's day showing none), and move the "Showing the period texts (S-18)" planned line into the built section.
- `decisions.md`: a dated entry (2026-10-01) for S-18 with the owner's decisions: no facts shown, one neutral sentence for a missing narration, the recommendation's staleness rule, the card under the recommendation, no quarter and no today-in-calendar summary.
- `architecture.md`: the Pages row (:48) names the new card, the History row (:49) the panel, and the Database row (:54, "not shown yet, S-18") drops that remark; the services list names the new service.
- `prerequisites.md` (line ~93, S-18): state that production must hold F-04's rows (lab pushing, backfill run) for the surfaces to show anything; no new secret or job.
- `roadmap.md`: S-18 status follows the skills (`planning` now, `in-progress` at implement, `done` at archive); do not edit it by hand beyond that.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`
- Smoke test shows the card against local Supabase: `BASE_URL=http://localhost:4321 npm run smoke`
- The docs no longer claim the display is missing: `! grep -n "does not show them yet" docs/logic.md`

#### Manual Verification:

- With a current `today` row the card shows "aktualna", the text, the generation time and today's date; with `built_at` set back more than 2 hours and with a row from yesterday the badge shows "sprzed X" and "z <date> — dotyczy innego dnia" (local data)
- With no row and with null narration the card shows its neutral states and no numbers
- The card sits under the recommendation, does not push the right column out of balance and reads well at phone width
- After the app deploy (the owner's protected production run), production shows today's text, a completed day's and a completed month's summary, as F-04's backfill wrote them

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Row mapping: narrated, null narration, blank narration, trimmed text, the generation time fallback to `built_at`.
- Staleness: exactly 2 hours old, one millisecond over, a row from an earlier Warsaw day with and without narration (narrated shows the "another day" status, unnarrated is `empty`), midnight rollover, a future `built_at` (shown as current, not an error).
- Slot rules: summary filled on completed days and months only; null on today, future days, the current month and the quarter.
- Loaders: explicit eight-column selects, `maybeSingle` for a missing row, thrown error text on failure (the `mockClient` pattern in `calendar-data.test.ts`).
- Data is synthetic only; no real lab data is committed.

### Integration Tests:

- `npm run smoke` against local Supabase: a pushed `today`, `day` and `month` entry appears on the dashboard and the history page, and today's day view shows no panel.

### Manual Testing Steps:

1. Run the local stack, push the example, open `/dashboard` and `/dashboard/history` for a completed day and month.
2. Set a row's `built_at` back and null its narration locally to see the stale and pending states.
3. After the app deploy, check production against F-04's backfilled rows.

## Performance Considerations

Each surface adds one indexed single-row read by primary key (the dashboard reads the newest `today` period). A month view reads one row. No extra load on the lab and no LLM call on page view.

## Migration Notes

None. The table, grants and policy ship with F-04. The app deploy is the owner's protected production run, and nothing breaks if it lands before the lab has written rows: the surfaces show their empty states.

## References

- Roadmap: `context/foundation/roadmap.md` S-18
- Upstream plan and research: `context/changes/lab-period-summaries/plan-brief.md`, `research.md`
- Precedents: `context/archive/2026-09-30-period-ratings/` (filling a reserved slot), `context/archive/2026-10-01-day-notes/` (history page without client JavaScript)
- Staleness and status: `src/lib/services/recommendation.ts:9`, `:99-115`, `:190`
- Reserved slot: `src/lib/services/calendar-view.ts:193-199`, `:300`, `:623`
- Loader pattern: `src/lib/services/calendar-data.ts:13-30`, `:64-74`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Loaders and view service

#### Automated

- [x] 1.1 Service tests pass, including the eight-column select, the staleness boundary, the earlier-day case, the null and blank narration case and "facts never exposed" — 2712268
- [x] 1.2 Calendar view tests pass with the summary slot filled on completed days and months and null on today, the current month and the quarter — 2712268
- [x] 1.3 Linting passes — 2712268
- [x] 1.4 Type check passes — 2712268

### Phase 2: Calendar display

#### Automated

- [x] 2.1 Unit tests pass — 2712268
- [x] 2.2 Linting passes — 2712268
- [x] 2.3 Type check passes — 2712268
- [x] 2.4 Production build succeeds — 2712268
- [x] 2.5 Smoke test passes against local Supabase and a running server, never production — 2712268

#### Manual

- [x] 2.6 On a completed day and a completed month with a narrated row, the panel shows the text, the written time and the covered day or month, directly under the rating — 2712268
- [x] 2.7 A completed day without a row shows no panel and no error; a row with null narration shows the "has not appeared yet" sentence and no numbers — 2712268
- [x] 2.8 Today's day view and the quarter view show no summary panel — 2712268
- [x] 2.9 The panel reads well at phone width and in the frosted theme, with the day note panel still beneath it — 2712268

### Phase 3: Dashboard card and docs

#### Automated

- [x] 3.1 Unit tests pass — 2712268
- [x] 3.2 Linting passes — 2712268
- [x] 3.3 Type check passes — 2712268
- [x] 3.4 Production build succeeds — 2712268
- [x] 3.5 Smoke test shows the card against local Supabase — 2712268
- [x] 3.6 The docs no longer claim the display is missing — 2712268

#### Manual

- [x] 3.7 With a current today row the card shows "aktualna", the text, the generation time and today's date; older than 2 hours and from yesterday show "sprzed X" and "z <date> — dotyczy innego dnia" — 2712268
- [x] 3.8 With no row and with null narration the card shows its neutral states and no numbers — 2712268
- [x] 3.9 The card sits under the recommendation, keeps the right column in balance and reads well at phone width — 2712268
- [x] 3.10 After the app deploy, production shows today's text and a completed day's and month's summary as F-04's backfill wrote them — 2712268
