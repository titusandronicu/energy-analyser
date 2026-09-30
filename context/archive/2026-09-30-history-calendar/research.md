---
date: 2026-09-30T12:20:00+02:00
researcher: Claude (Opus 5.5)
git_commit: baeb1098981f6321c07ed20c61870b9d60959b9a
branch: main
repository: energy-analyser
topic: "What the history calendar (roadmap S-15) can build on: data, read paths, UI patterns and binding decisions"
tags: [research, history-calendar, daily_energy, recommendations, sparkline, period, S-15]
status: complete
last_updated: 2026-09-30
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Follow-up (owner's request): what the lab's other sources hold — PGE connector, the Home Assistant recorder on the UGREEN, Deye Cloud — and how they change the open questions"
---

# Research: What the history calendar (S-15) can build on

**Date**: 2026-09-30T12:20:00+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: baeb1098981f6321c07ed20c61870b9d60959b9a
**Branch**: main
**Repository**: energy-analyser

## Research Question

Roadmap S-15 (US-05, FR-021): the owner moves between days, months, quarters (and years) in a calendar and sees each period's PV production, consumption, grid import/export, forecast against actual, and the recommendations from that period. What data exists for past periods, which read paths and helpers can be reused, which UI and chart patterns apply, and which earlier decisions bind the design?

## Summary

- **Data exists for day and month views; forecast-vs-actual and past recommendations are thin.** Production on 2026-09-30:
  - `daily_energy` has 67 rows, 2026-07-16 to 2026-09-30. Five of them have null totals: 07-20, 08-31, 09-13, 09-19 and 09-21.
  - Ten days of that range have no row: 07-31, 08-10, 09-14 to 09-18, and 09-22 to 09-24.
  - `pv_forecast_kwh` is set on 10 days: 07-16 to 07-20 and 09-26 to 09-30. Only days from 2026-09-27 are trusted (`FORECAST_HISTORY_START`, `src/lib/services/recommendation.ts:11`).
  - `recommendations` has 122 rows spanning 6 Warsaw days, from 2026-09-25 14:13Z.
  - `hourly_energy` has 585 hours from 2026-08-26 11:00Z. Every push prunes it to 35 days.
- **No loader covers a date range for the calendar yet.**
  - `loadDailyEnergy` reads the last 400 days (`src/lib/services/usage-insight.ts:14, 60-70`).
  - The recommendation loader returns the latest row only (`recommendation.ts:84-93`).
  - The pure helpers are reusable:
    - `dailySeries`: gaps stay null (`src/lib/services/daily-series.ts:16-30`).
    - `formatPeriod`: the FR-018 period text (`src/lib/format/period.ts:8`).
    - Warsaw day-key arithmetic and month labels (`src/lib/format/warsaw-time.ts`).
    - Status badge and glossary: `StatusBadge.astro`, `lib/format/status.ts`, `glossary.ts`.
- **The UI is one server-rendered page today.**
  - `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:5`, prefix match). A new top-level page must be added there; a page under `/dashboard/...` is covered by the prefix.
  - The app has no navigation, no dynamic routes and no dates in URLs.
  - Cards are Astro components with `Panel` and `CardHeading` (h2).
  - The only chart component is the line/area `Sparkline.astro` over `sparkline.ts` (the other SVG, `LiveFlow.tsx:244`, is a flow diagram). Bars need a zero-baseline geometry helper that does not exist yet.
- **Decisions constrain the design strongly.**
  - Server-rendered SVG from pure, tested helpers, with no chart library (`docs/decisions.md:12`, 2026-09-30).
  - Missing days are gaps, never zeros; today's partial day is not plotted as complete; at least 3 points before a line is drawn (`docs/decisions.md:19`).
  - Every aggregate states its period and number of days. Status shows as colour plus a word. Copy is in plain Polish (`docs/logic.md:123-146`).
  - Each page owns its `<main>` and `h1`, which the smoke test guards (`scripts/smoke.mjs:65-72`).
- **Scope conflict to settle before planning.**
  - PRD v3.2 (2026-09-28) un-parked the year view as a partial-year view (`context/foundation/prd-v3.md:225-229`), and the roadmap made it its own slice S-16 `calendar-year-view` (`roadmap.md:232-242`).
  - Older text still says it is parked: `roadmap.md:25`, `docs/decisions.md:61`, and this change's first note.
  - S-15's outcome line (`roadmap.md:222`) still lists years.

## Detailed Findings

### Stored data for past periods

- **Access model.** Every table has RLS with client privileges revoked (`supabase/migrations/20260923101001_push_ingestion.sql:59-66`). The owner reads through a grant to `authenticated` plus an `app_owners` policy (`20260923150859_owner_read_recommendations.sql:6-26`).
- **`daily_energy`.** PK `day date`, one row per Europe/Warsaw day (`push_ingestion.sql:34-43`), with nullable `pv_kwh`, `load_kwh`, `grid_import_kwh` and `grid_export_kwh`.
  - `pv_forecast_kwh` was added in `20260925151509_daily_forecast.sql:6`. It is kept through `coalesce` when a later push carries no forecast (`20260930081229_hourly_energy.sql:86`).
  - The owner can read `day`, the four totals, `pv_forecast_kwh` (`20260925162240_owner_read_daily_energy.sql:5-12`) and `captured_at`.
  - The migrations define no delete for `daily_energy`, and `docs/architecture.md:39` says it is kept.
- **`recommendations`.** One row per distinct `generated_at` (unique; `on conflict do nothing`, `hourly_energy.sql:112-125`), so one Warsaw day holds many rows. Production has 122 rows over 6 days.
  - Columns: `text`, `provider`, `model`, `forecast` jsonb (`today_kwh`, `tomorrow_kwh`, optional `confidence`, per `src/lib/ingest/contract.ts:40-51`) and `facts`.
  - Rows are not pruned: `docs/ingest/README.md:61` says so, and none of the migrations checked deletes from `recommendations`.
  - A day view has to choose which rows to show: the last of the day, or all of them.
- **`hourly_energy`.** PK `hour_start`. Every push prunes rows older than 35 days (`hourly_energy.sql:128`). In production the first hour is 2026-08-26 11:00Z.
  - An hourly breakdown is therefore possible only for roughly the last 35 days.
- **Other stores.**
  - `ingest_pushes` is pruned to 14 days (`hourly_energy.sql:127`).
  - The `live_state` and `bill_forecast` views return the newest row only (`20260925123751_live_state_view.sql:16-27`, `20260929101530_bill_forecast_view.sql:8-24`).
  - No stored history exists for past bill forecasts or bills (S-08 is blocked).
- **Forecast vs actual per day.**
  - Primary source: `daily_energy.pv_forecast_kwh`, the first forecast at or after 06:00 local, against `pv_kwh` (`docs/logic.md` "Daily totals", ~line 150).
  - Secondary source: `recommendations.forecast.today_kwh`, as known at each narration.
  - Values before 2026-09-27 are not trusted. The 2026-09-26 value came from Forecast.Solar and overshoots (`docs/logic.md` ~line 121). The five July values also predate the Solcast switch; that they are untrusted is inferred from the same cut-off, not measured.
- **Data-quality caveats that affect what a calendar may claim.**
  - On 07-18, 07-21, 07-23 and 07-24, PV + import and house use + export differ by 8–32 kWh; they are kept as sent (`docs/decisions.md`, 2026-09-30).
  - Rows from 2026-07-26 to 2026-08-03 are inconsistent (`docs/logic.md:84`).
  - The export counter under-reads: 94.7 kWh against PGE's 342 kWh for August (`docs/logic.md:67`).
  - From 4 August the inverter's grid import is over-reported (`docs/logic.md:107`).

### Read paths and pure helpers

- **Loaders.** All of them throw on error; RLS returns nothing to non-owners.
  - `loadDailyEnergy(client, now)`: `.gte(day, today−400)`, descending, no limit (`usage-insight.ts:60-70`).
  - `loadHourlyEnergy` (`hourly-usage.ts:93-104`).
  - `loadLatestRecommendation`: `limit(1)` (`recommendation.ts:84-93`).
  - `loadLiveState`, `loadDailyRowCapturedAt` and `loadBillForecast` each return a single row (`live-state.ts:124-147`, `bill-forecast.ts:112-121`).
  - No loader takes a from/to range or returns recommendations per day.
- **Reusable pure logic.**
  - `dailySeries(rows, field, lastDay, days)` fills a calendar window with null gaps (`daily-series.ts:16-30`).
  - `median`, `dailyLoadNorm` and `selectBaseline` skip null days and never compare today (`usage-insight.ts:87-289`, `:213-222`).
  - `toRecommendationView(row, now)` relabels "dziś/jutro" as dates for an earlier day (`recommendation.ts:160-191`).
  - `nightName` gives "noc z 29 na 30 września" (`hourly-usage.ts:133-138`).
- **Formatting.**
  - `warsaw-time.ts`: `warsawParts`, `dayKeyToUtcMs`/`utcMsToDayKey`/`addDays` (DST-safe, `:34-49`), `formatDayMonth` (genitive, `:54`), `formatMonth` ("wrzesień 2026", `:62`), `warsawMonthKey` (`:67`), `warsawDayHours` (`:95`) and `formatWeekday` (`:108`).
  - `values.ts`: `kwhLabel` → "4,8 kWh", `plnLabel`, `MISSING = "—"`.
  - `period.ts:8`: `formatPeriod(dayKeys, currentYear?)` → "18 dni: 27 sierpnia – 25 września". It throws on an empty list.
  - **Missing helpers:** a month grid (days in month, Monday-first offset), short weekday names, quarter keys and labels, and month/quarter boundaries as day keys. `bill-forecast.ts:290-291` computes days in a month inline.
- **Types**: `DailyEnergyRow`, `RecommendationRow` and `HourlyEnergyRow` are in `src/types.ts:5-52`.

### Pages, routing and components

- **Pages.** Pages today: `dashboard.astro`, the auth pages, and `index.ts`, which redirects signed-in users to `/dashboard` (`src/pages/index.ts:12`; its comment at `:5` reads "The app has one screen").
  - `dashboard.astro` loads its data in parallel with `Promise.all` (`:41-74`). It wraps each card's load in `orLoadError`, so a failure affects that card alone (`:15-23`), and it reloads itself every 5 minutes (`:88-102`).
- **Routing.**
  - Protected pages are matched by prefix (`middleware.ts:5, 38`).
  - `Layout.astro` sets `lang="pl"` and has no `<main>` (`:11-16`).
  - `DashboardHeader.astro` holds the `h1` and a sign-out form. The app has no nav links and nothing uses `aria-current`.
- **Card patterns.**
  - Card shell: `Panel.astro:11`. Title: `CardHeading.astro:25`, always an h2; sub-sections use h3 inside `section[aria-labelledby]` (`HourlyUsageCard.astro:88-98`).
  - Status: `StatusBadge.astro:6-24` with `lib/format/status.ts:2-25` (good / watch / problem / insufficient, "Dobrze · …").
  - Explanations: `TermsExplained.astro`, a native `<details>` needing no JS.
  - Empty and insufficient views are typed unions (`kind: "empty" | "insufficient" | …`), rendered as in `HourlyUsageCard.astro:51-57, 126-127`.
- **Chart primitive.**
  - `Sparkline.astro` (props `values`, `subject`, `windowLabel`, `tone`, `width`, `height`) draws over `sparkline.ts:37` `sparklineGeometry`.
  - The geometry is line and area only, scaled min-to-max. Gaps split the line; with fewer than 3 values it shows "za mało dni", and `values === null` shows "historia niedostępna".
  - Accessible name: `role="img"` with a label built by `describeSeries` (`sparkline.ts:101-115`).
  - Bars need a zero baseline and a new pure helper. The slot and gap model, the label style and the tone classes can be reused.
- **Palette.** Tokens live in `src/styles/global.css`: `--flow-pv #f5c462`, `--flow-home`, `--flow-grid`, `--tone-*`, `--inset` and `--hairline` (`:45-59`), mapped to Tailwind at `:133-147`. Components contain no hex values.
- **Tests.**
  - Vitest runs in node with no DOM (`vitest.config.ts:10-12`). All 22 test files are pure lib/service tests; no component or page render tests exist, and no Playwright.
  - `scripts/smoke.mjs` checks for `<main` and `<h1` on the auth pages (`:65-72`) and checks the dashboard content (`:104-110`).
  - Calendar logic therefore has to live in pure `src/lib` functions to be testable.

### Requirements and dependents

- **US-05** (`prd-v3.md:116-128`). The user moves between days and months without typing dates. Every figure states its period and day count. Ratings and summaries appear only with enough data and never advise.
- **FR-021** (`prd-v3.md:213`). Day, month, quarter and year views. An unfinished quarter or year shows what exists and says it is unfinished, and never extrapolates a full-period figure.
- **Dependents S-15 has to leave room for:**
  - S-17 ratings: completed days and months only; self-sufficiency `1 − import ÷ consumption` (`prd-v3.md:214, 271`).
  - S-19 notes: the month view marks days with notes, and the day view holds the note form (`prd-v3.md:247-250`).
  - S-18 lab summaries per completed day or month (`prd-v3.md:215`).
  - S-20 trends (`prd-v3.md:235-237`).
- **No minimums are set.** The PRD leaves the minimum-data amounts to each slice (`prd-v3.md:302`). The existing rules are:
  - Sparkline: at least 3 values.
  - Usage norm: seasonal ±14 days with at least 20 days, falling back to 30 days with at least 7 (`docs/logic.md:70-87`).
  - Hourly rankings: at least 7 complete days.

## Code References

- `supabase/migrations/20260923101001_push_ingestion.sql:34-66`: `daily_energy`, `recommendations`, RLS baseline.
- `supabase/migrations/20260930081229_hourly_energy.sql:70-128`: `ingest_push` upserts and the pruning of `ingest_pushes` (14 d) and `hourly_energy` (35 d).
- `src/lib/services/usage-insight.ts:14, 60-70`: `HISTORY_DAYS = 400`, `loadDailyEnergy`.
- `src/lib/services/recommendation.ts:11, 84-93, 160-191`: forecast trust start, latest-only loader, view mapping.
- `src/lib/services/daily-series.ts:16-30`: calendar-indexed series with gaps.
- `src/lib/sparkline.ts:37, 101-115`; `src/components/ui/Sparkline.astro`: SVG geometry and accessible label.
- `src/lib/format/period.ts:8`, `src/lib/format/warsaw-time.ts:34-108`, `src/lib/format/values.ts`: period text, Warsaw dates, numbers.
- `src/components/StatusBadge.astro`, `src/lib/format/status.ts`, `src/components/TermsExplained.astro`: status and explanations.
- `src/middleware.ts:5, 38`; `src/pages/dashboard.astro:15-102`; `src/components/DashboardHeader.astro`: routing, page loading pattern, header.
- `scripts/smoke.mjs:62-110`: landmark and dashboard smoke checks.

## Architecture Insights

- **Services** are pure, unit-tested view-model builders with thin Supabase loaders (`docs/architecture.md:48`). Status and period are decided in the service, and cards only render (S-14 plan-brief).
- **Pages** load everything on the server in one pass and keep failures per card, and render no client JS unless interaction needs it. Only two React islands exist (`LiveFlow.tsx` and a disclosure).
- **Dates** are Europe/Warsaw day keys ("YYYY-MM-DD") and month keys ("YYYY-MM"), and `bill-forecast.ts:151, 300` has key regexes. These keys are the natural URL parameters for a calendar (for example `?day=` / `?month=`), but no page uses URL parameters for data today.

## Historical Context (from prior changes)

- `context/archive/2026-09-28-period-selector/change.md:12-14`: the owner's original wish for a day/month/quarter/year control. It was closed as superseded by S-15.
- `context/archive/2026-09-26-data-period-transparency/plan-brief.md`: S-14 exists so that S-15, S-17 and S-20 reuse its badge, `formatPeriod` and glossary. Explanations need no JS. Phone readability was a manual gate.
- `context/archive/2026-09-28-lab-feature-port/research.md:108-116, 234-236`: the Home Assistant reference views.
  - "Dni" covers today, yesterday and the day before.
  - "Miesiąc" is month-to-date plus a 62-day this-versus-last-month chart.
  - "Rok" is a cumulative curve with a data-range note.
  - The month-to-date and month-versus-previous candidate maps to the S-15 month view.
- `homelab-2/infra/homeassistant/lovelace/dashboards/energy-glass.yaml:624-737` (the visual reference): two ApexCharts cards over 30 days, 360 px tall, with the y axis from 0 kWh.
  - One shows PV as columns with house use as a line; the other shows import as columns with export as a line.
  - Three of their settings conflict with the app's rules: `fill: zero` (the app shows gaps), a partial today in the plot, and an export line that rests on the under-reading counter.
- `context/archive/2026-09-29-page-landmarks-headings/plan-brief.md:21-25`: each page owns its `<main>`, with one h1, then h2/h3.
- `docs/decisions.md:12` (no chart library, SVG), `:19` (sparkline rules), `:37` ("daily totals belong to the period selector"), `:16` (landmarks), `:58` (median as the norm statistic), `:67` (plain Polish, colour plus word).

## Related Research

- `context/archive/2026-09-28-lab-feature-port/research.md`: the chart reference and the candidate mapping.
- `context/archive/2026-09-30-history-backfill/plan.md`: the daily history start and its gaps.

## Open Questions

For the owner, before `/10x-plan`:

1. **Year view scope.** Should S-15 ship days, months and quarters and leave the partial-year view to S-16, or absorb S-16? The documents disagree (see Summary).
2. **Which recommendations a past day shows.** The last one of that Warsaw day, the first morning one, or all of them? A day holds up to about 24 rows, and history only starts on 2026-09-25.
3. **Minimum data for a month or quarter total.** For example, show totals only with at least N complete days and otherwise say "za mało danych". Or always show the sum with its day count, e.g. "18 z 30 dni"? No rule is set.
4. **Charts per view.** Which charts the month view has (daily PV vs house use, import vs export, or both), and what a quarter chart shows (weekly or monthly bars). Also whether the export series appears at all, given the under-reading counter.
5. **Entry point and URL.** A header link or tabs from the dashboard to `/dashboard/history` (covered by the existing prefix) or to a new top-level route (which needs adding to `PROTECTED_ROUTES`), with `?day=` / `?month=` parameters.
6. **Hourly breakdown in the day view.** It is possible only for about the last 35 days. Should it be included for those days, or kept out of S-15?
7. **How forecast-vs-actual is shown** where the forecast is missing or untrusted, i.e. before 2026-09-27 and on days without a stored forecast.

## Follow-up (2026-09-30): the lab's other data sources

The owner asked to answer the open questions from all the data we have, not only what the app stores: the PGE connector (data arrives about 1.5 months late), the database on the UGREEN, and the Deye Cloud integration. Research was read-only; the UGREEN database was queried with `sqlite3 -readonly`. Paths below are in homelab-2 unless marked `E:` (energy-analyser).

### Home Assistant recorder on the UGREEN (the most useful source)

- **What it is.** The only energy database on the UGREEN is HA's default SQLite recorder: `/home/Funky/AppData/homeassistant-rehearsal/config/home-assistant_v2.db`, about 729 MB, schema 53. It belongs to HA Core 2026.8, `infra/compose/homeassistant/ugreen-homeassistant-rehearsal.compose.yaml:8-30`.
  - No `recorder:` block is configured, so HA's defaults apply. `states` and 5-minute `statistics_short_term` go back about 10 days, to 2026-09-20. Hourly `statistics` are kept indefinitely and start at **2026-07-20 13:00 UTC**, the day this HA instance was deployed.
  - No other energy database runs on the UGREEN: `docker ps` shows no InfluxDB, Timescale or MariaDB. The database has no backup (`inventory/services/ugreen-homeassistant-rehearsal.yaml:61`, `backup.method: not-yet-decided`).
- **What it holds** (hourly `statistics`, from 2026-07-20 15:00 UTC unless stated):
  - Local Deye day counters (`sensor.deye_inverter_2505305044_daily{activeproduction,consumption,energypurchased,gridfeedin,…}`) and lifetime counters.
  - Deye Cloud station counters (`sensor.deye_station_61507285_*_today`), and Solarman counters from 2026-07-21.
  - Hourly mean/min/max of PV, load, grid and battery power and of SOC.
  - Solcast forecast from **2026-09-26 07:00** only. Forecast.Solar sensors have no `state_class`, so they have no long-term statistics.
- **It fills every day the app is missing.** Each of the 10 missing days (07-31, 08-10, 09-14–18, 09-22–24) has 24 hourly rows per counter.
  - Totals at 23:00 local, for example: 08-10 had PV 33.1, load 42.0 and import 11.2 kWh; 09-14 had PV 5.4, load 30.9 and import 26.4 kWh.
  - On 07-31 the Deye Cloud station counters read 0 all day, while the local inverter counters are complete (PV 29.7, load 19.9 kWh).
  - HA itself has gaps: 09-19 has 18 hourly rows and 09-20 has 14, about 10 hours of downtime. 07-20 is its partial first day.
  - Whether the app's null days 08-31, 09-13 and 09-21 are complete in HA was not checked one by one.
- **How to read it.** A day's total is the counter at the last hour of the Warsaw day, or the `sum` delta. A plain daily max can pick up the previous day's value left just after midnight. Hourly energy is the difference of `sum` between consecutive hours.
  - The recorder can be read without file access through HA's WebSocket `recorder/statistics_during_period`.
- **Relation to the lab files.** `energy-history.jsonl` on docker-core, trimmed to 90 days (`infra/compose/energy-app/scripts/append-energy-history.py:15`), is a 5-minute poll of this same HA. Its gaps are poll or push outages, not missing source data.
  - The untrimmed `private/energy.sqlite3` `energy_snapshot` table on docker-core is written by the same refresh run, so it most likely shares those gaps (not checked).
- **Possibly older data, not checked:** the QNAP HA database (`inventory/services/qnap-home-assistant.yaml:37`, still running as a rollback) and the retired QNAP TimescaleDB dump (`exports/qnap/legacy-energy-stack-cooling-off-2026-07-22.md:30-40`).

### Deye Cloud

- **It is already the source.** Every counter and 5-minute reading the app receives comes from the Deye Cloud HACS integration (`heavenknows1978/hass-deyecloud`); local Solarman is kept for comparison only (`infra/compose/energy-app/scripts/collect-ha-snapshot.py:17-61, 335-336`).
  - So Deye Cloud cannot correct the grid and export errors, which come from the same inverter current sensors (E: `context/archive/2026-09-28-grid-export-mismatch/frame.md`).
- **History API.** Deye OpenAPI `POST /station/history` returns daily (`granularity=2`) or monthly (`granularity=3`) records of generation, consumption, purchase (import), grid (export) and battery charge/discharge. Source: upstream integration `custom_components/deyecloud/sensor.py:371-463, 1400-1414`, commit b29a2b8.
  - The installed integration does not write past days into HA; it fetches today, yesterday and the day before only.
  - A comment in the collector says the cloud showed "an 11-month history" (`collect-ha-snapshot.py:28-30`). Days before 2026-07-20 could therefore come from Deye Cloud, back to about autumn 2025. The daily depth has not been verified by an API call.
  - HA exposes per-month station sensors back to Aug 2025, but their values before July 2026 are small and their meaning is unclear.
- **Constraints.** A fetch script needs Deye developer credentials, and the lab's policy is to hold no Deye Cloud credentials (`infra/compose/energy-app/README.md:89`), so that policy would change.
  - Deye Cloud has actuals only, so it cannot supply past forecasts.

### PGE

- **Two different feeds.**
  - (a) The HA `PGE_sensor` integration polls mBOK every 8 h and holds only the latest invoice: consumed/fed-in kWh, amount and period (`inventory/services/ugreen-homeassistant-rehearsal.yaml:53`). The lab appends one row per closed period to `web/data/pge-settlement-history.jsonl` (36 rows kept), and only since about 2026-09-27 (`scripts/append-pge-settlement-history.py:1-13, 59-92`).
  - (b) The hourly eBOK CSV is downloaded by hand and parsed into the private SQLite `pge_hourly_reading` (`apps/solar-energy-analyser/src/solar_analyser/pge.py:56-72, 157-185`; `scripts/store-pge-readings-sqlite.py:32-43`). The lab holds February to July 2026 (E: `context/foundation/existing-system.md:17`). The August CSV was not uploaded to the lab (E: grid-export-mismatch `frame.md:93`).
- **Accuracy.** PGE's hourly-balanced values reproduce the invoice (August: import 423.5 and export 341.5 kWh, against invoice figures of 423 and 342). By comparison, the inverter recorded 94.7 kWh of export and about 265 kWh too much net import in August (E: grid-export-mismatch `frame.md:39-49`).
  - For closed months, PGE is the correct source for grid import and export.
- **Delay.** An invoice arrives about 3 weeks after month end (E: `context/archive/2026-09-27-bill-accuracy/plan.md:63, 96`). The CSV is manual and about a month behind (E: `docs/decisions.md:9`). The owner's "about 1.5 months" is consistent with this, but no document records it.
  - Whether the lab keeps import and export separately, or only a signed or import-only balanced value, is unverified: the parser drops the raw pobrana/oddana rows.
- **Rules.**
  - Per-day or per-month PGE aggregates with no identifiers appear to fit "public-safe aggregates" (E: `docs/architecture.md:57`, `context/foundation/existing-system.md:46`).
  - Per-hour PGE values are not covered: the 2026-09-30 exception is for the inverter's own figures (E: `docs/decisions.md:9`).
  - The roadmap parks "PGE bill reconciliation and the PGE vs Deye cross-check" and "PGE CSV upload in the app" (E: `context/foundation/roadmap.md:422-423`).
  - Showing PGE figures in the calendar needs an explicit owner decision.

### Export since mid-August

- Local and cloud counters both show **0 kWh export on every day checked from about 2026-08-13**, for example each missing day in September. HA's balance (PV + import ≈ load) looks consistent with that.
- PGE recorded 342 kWh of balanced export in August, including real night export.
- So after mid-August the inverter's export figure cannot be trusted either way. Whether the site really stopped exporting (a zero-export setting) is not verified.

### What this changes in the open questions

| Question                   | Effect of the new sources                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Year view               | Inverter history in the app starts on 2026-07-16, and in HA on 2026-07-20. PGE grid-only data covers February–July 2026; Deye Cloud possibly reaches about autumn 2025 (unverified). Before a Deye Cloud or PGE import, a 2026 year view is roughly 5.5 months of data, which supports leaving it to S-16.             |
| 2. Recommendations per day | Unchanged: past recommendations exist only in the app, from 2026-09-25. Lab recommendation history was not checked.                                                                                                                                                                                                    |
| 3. Minimum data            | Most gaps are recoverable. A one-off fill from HA statistics (lab reads the recorder and pushes the days with `--from/--to`) would complete August and September except around 09-19/20, which makes a "sum with its day count" rule workable.                                                                         |
| 4. Charts / export         | Show PV and house use as they are. Show grid import with the known over-report caveat from 4 August. Don't chart the inverter's export; for closed months PGE is the only trustworthy import/export, if the owner allows PGE aggregates in the app.                                                                    |
| 6. Hourly day view         | HA keeps hourly statistics from 2026-07-20 indefinitely. An hourly day view for every day since then is possible, but needs the app's 35-day `hourly_energy` pruning (E: `supabase/migrations/20260930081229_hourly_energy.sql:128`) relaxed, plus a backfill from HA. Otherwise it stays limited to the last 35 days. |
| 7. Forecast vs actual      | No source holds past forecasts before 2026-09-26: Solcast statistics start then, Forecast.Solar has no statistics, and Deye Cloud has actuals only. Forecast vs actual can only start on 2026-09-27, with earlier days labelled as not collected yet.                                                                  |

**Candidate follow-ups (not in S-15 unless the owner chooses):**

- (a) A lab script that reads HA hourly statistics and re-sends the missing and null days, with the range push already built in F-03.
- (b) Upload the August PGE CSV and decide whether PGE monthly (or daily) import/export may be shown in the app.
- (c) Check the QNAP HA database and the Timescale dump for days before 2026-07-20.
- (d) A Deye Cloud history fetch, which needs developer credentials and a policy change.
- (e) Back up the UGREEN HA recorder: it now holds the only complete hourly record and has no backup.
