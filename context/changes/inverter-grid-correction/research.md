---
date: 2026-09-30T15:00:00+02:00
researcher: Claude (Opus 5.5)
git_commit: 7dc3a248bed874a4f7316a17a9f395fecca9880f
branch: main
repository: energy-analyser
topic: "Where the app uses the inverter's grid import/export, and what a wrong figure does to each view"
tags:
  [
    research,
    inverter-grid-correction,
    grid-import,
    grid-export,
    daily_energy,
    hourly_energy,
    self-sufficiency,
    ratings,
    bill-forecast,
    data-quality,
  ]
status: complete
last_updated: 2026-09-30
last_updated_by: Claude (Opus 5.5)
---

# Research: Where the inverter's grid reading reaches the user

**Date**: 2026-09-30T15:00:00+02:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 7dc3a248bed874a4f7316a17a9f395fecca9880f
**Branch**: main
**Repository**: energy-analyser

## Research Question

An hourly comparison of PGE's meter data with the inverter (16 July – 31 August 2026) shows the inverter's grid reading is wrong for the whole history, with a sign flip on 3–4 August. Where does the app use grid import and export — daily totals, live flows, the usage card, the bill forecast, calendar totals and charts, the ratings' self-sufficiency, the hourly card, the data-quality notes, `docs/logic.md` and `docs/decisions.md` — and what does a wrong import figure do to each user-visible output?

## Summary

- **Every grid figure in the app comes from the inverter.** The lab sends the inverter's daily counters (`daily_energy.grid_import_kwh`, `grid_export_kwh`), its live power (`state.grid_w`), its today counters (`grid_import_today_kwh`, `grid_export_today_kwh`) and hourly nets integrated from its 5-minute power (`hourly_energy.grid_net_kwh`). There is no PGE figure anywhere in the app (a parked privacy decision, `context/foundation/roadmap.md:451`).
- **The app's data-quality story is wrong in two ways.**
  - It says import is **overstated from 2026-08-04** (`src/lib/services/calendar-view.ts:56-57`) and implies the data before is fine. In fact July's import is **under-read** (151 kWh against PGE's hourly-balanced ~350 kWh), and the whole history is off.
  - It says the over-report "lowers all days alike, so it largely cancels" in the ratings (`docs/decisions.md:11`, `docs/logic.md:176`, `RATING_EXPLANATION` in `calendar-view.ts:81`). That holds within one side of the flip, not across it: a day from 4 to about 17 August is rated against a 14-day norm that holds July days whose self-sufficiency is inflated by the under-read import, so it is pushed towards "Słaby dzień".
- **Twelve consumers** read the grid figures (table below). The most exposed are the self-sufficiency ratings (a wrong import changes the band, not just a number), the calendar's import totals and charts, and the bill forecast's in-month imported energy (computed in the lab from the same daily import).
- **House use may be affected too (unverified).** On a Deye hybrid with a grid-side CT, house load is usually derived from the inverter's output plus the CT's grid power. If so, `load_kwh` inherits the same error, which would explain the early rows reading 9–25 kWh against about 36 afterwards (`roadmap.md:430`, open question 7). This is not established and would widen the change to the usage card and every house-use figure.
- **The monthly August import total is close to PGE (+2.5%) by coincidence of the fit, not because it is right.** Hour by hour it over-reports during the day and the net figure is ~260 kWh too high; the gross total happens to land near PGE's. A correction applied per day would not reproduce this; see the plan's option B.
- **Correction data exists only in the lab and only late.** PGE hourly readings arrive about 1.5 months after the fact (eBOK CSV into the lab SQLite `pge_hourly_reading`). The app keeps hourly nets for 35 days only (`hourly_energy`, from 2026-08-26), so any per-hour correction of daily totals has to be computed in the lab from its 5-minute history, not in the app.

## Detailed Findings

### The established measurement (from the PGE-vs-inverter analysis, aggregates only)

- Hourly fit on import-only hours:
  - 17 July – 3 August: `inverter_net = −0.53 · PGE_net − 0.70` kWh/h, R² 0.99.
  - 4 – 31 August: `inverter_net = +0.53 · PGE_net + 0.70` kWh/h, R² 0.90.
  - The sign flipped between 3 and 4 August (someone reversed the CT direction); the scale of about 0.53 and the offset of about 0.70 kWh/h did not change.
- Monthly: July import 151 kWh (inverter) against ~350 kWh (PGE, hourly-balanced). August net import ~260 kWh higher on the inverter than at PGE; export 95 against 342 kWh.
- The inverter nets the three phases arithmetically; per-phase counting is ruled out (consistent with `roadmap.md:428`, which already ruled out phase imbalance).
- Most likely cause, **not verified**: one CT paired with the wrong phase voltage, which multiplies its reading by about cos 120° ≈ −0.5 and adds a reactive offset; on 3–4 August its polarity was flipped, turning −0.53 into +0.53 but not fixing the pairing.
- Physical side effect: the inverter's zero-export regulation acts on the wrong reading, so it pushes about 0.85 kW into the grid while believing it exports nothing. About 100 kWh of battery energy went to the grid at night in August (credited at 0.8, instead of covering the house).
- The root fix is physical: the installer checks CT placement and phase mapping. Not yet confirmed or scheduled.
- PGE hourly data lags about 1.5 months, so it can correct closed history but never the last weeks.

### Where the figures enter

- Ingest contract: `src/lib/ingest/contract.ts:19-28` (live `grid_w`, today counters; "grid positive = import"), `:60-61` (daily `grid_import_kwh`, `grid_export_kwh`), `:66-82` (hourly `grid_net_kwh`, ±50 kWh bound). Sign convention: `docs/ingest/README.md:29`.
- Types: `src/types.ts:29-30` (daily), `:43-49` (hourly).
- Storage: `daily_energy` (`supabase/migrations/20260923101001_push_ingestion.sql`), `hourly_energy` (`supabase/migrations/20260930081229_hourly_energy.sql`, pruned to 35 days).
- The lab computes the bill forecast's imported energy from the same daily import and sends a finished figure (`docs/logic.md:196`).

### Consumers and what a wrong import does

| #   | Consumer                              | Where                                                                                                                                                                                                                                                         | Reads                                                      | What a wrong figure does to the user                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Live flow diagram                     | `src/lib/services/live-state.ts:154` (`flow`), `:390`, `:434`; `src/components/live/LiveFlow.tsx:135-146`                                                                                                                                                     | `state.grid_w`                                             | Direction and size of the grid arrow are wrong. With the +0.53 · x + 0.70 kW relation from August, a house really exporting ~0.85 kW can show as a small draw or no flow; the glossary chip switches between "grid_import" and "grid_export" on the wrong sign (`LiveFlow.tsx:146`). Grid is not rated (`docs/logic.md:32`), so no verdict is wrong, only the picture.                                                                                                                                                                                   |
| 2   | Live "today" KPIs                     | `live-state.ts:414-420`; `src/components/LiveStateCard.astro:36-50`                                                                                                                                                                                           | `grid_import_today_kwh`, `grid_export_today_kwh`           | "Kupione z sieci dziś" and "Sprzedane do sieci dziś" show the inverter's counters. Export is already known to under-read (`docs/logic.md:69`); import is not caveated on this card at all.                                                                                                                                                                                                                                                                                                                                                               |
| 3   | Live KPI sparklines                   | `live-state.ts:424-430`                                                                                                                                                                                                                                       | `daily_energy.grid_import_kwh`, `grid_export_kwh`, 14 days | The 14-day bought/sold lines inherit every daily error; a series crossing 3–4 August shows a step that is the CT flip, not the house.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | Usage insight "Kupione z sieci"       | `src/lib/services/usage-insight.ts:64`, `:221`, `:298`, `:310-316`; `src/components/UsageInsightCard.astro:23-24`, `:41-43`, `:143`                                                                                                                           | `grid_import_kwh` of the compared day and its baseline     | The purchase value and its delta against the norm (median of the baseline days) are wrong. A baseline straddling 4 August compares an August day with under-read July days and reports a large rise that did not happen. The card's status band rests on load, not purchase, so the badge is unaffected — unless load is derived from the same CT (see Summary).                                                                                                                                                                                         |
| 5   | Bill forecast (lab, shown by the app) | lab computation, `docs/logic.md:196-197`; app mapper `src/lib/services/bill-forecast.ts:407`, `:432`; `src/components/BillForecastCard.astro:137`                                                                                                             | lab: mean daily inverter import × days in month            | The central figure and range scale with the in-month imported energy. Under a −0.53 relation (July) the forecast would be far too low; under +0.53 (August) the monthly gross import landed within 2.5% of PGE, which is why the August check passed. Whether September's inverter import is near PGE is unknown. The credit already uses PGE's settled export ratio, not the inverter's export (`docs/decisions.md:67`).                                                                                                                                |
| 6   | Calendar completeness                 | `src/lib/services/complete-day.ts:11-15`                                                                                                                                                                                                                      | `grid_import_kwh` not null                                 | Only presence matters, so a wrong value does not change which days are complete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 7   | Calendar totals (month, quarter, day) | `src/lib/services/calendar-view.ts:320-332` (`energyTotals`), `:500-510` (quarter), `:517-530` (`dayTotals`); loader `src/lib/services/calendar-data.ts:16`                                                                                                   | `grid_import_kwh`                                          | "Prąd kupiony z sieci" totals are wrong for every month: July under-read by more than half, August near PGE in total but wrong per day. The day view's figure is wrong in either direction depending on the side of the flip.                                                                                                                                                                                                                                                                                                                            |
| 8   | Calendar charts                       | `calendar-view.ts:451` (month import bars), `:507` (quarter import); `src/components/history/MonthView.astro:199`, `src/components/history/QuarterView.astro:106`                                                                                             | `grid_import_kwh`                                          | Import bars show a jump at 4 August that is the CT flip. The captions (`MONTH_CHART_NOTE`, `QUARTER_CHART_NOTE`, `calendar-view.ts:67-69`) blame only the days from 4 August.                                                                                                                                                                                                                                                                                                                                                                            |
| 9   | Data-quality notes                    | `calendar-view.ts:56-57` (`GRID_IMPORT_OVERSTATED_FROM = "2026-08-04"`), `:64`, `:73-74` (`GRID_IMPORT_TERM`, `GRID_IMPORT_EXPLANATION`); `src/components/history/HistoryNotes.astro:5-10`, `:29`; pinned in `src/lib/services/calendar-view.test.ts:564-590` | constant                                                   | The notes tell the user July and 1–3 August are fine and August on is "zawyżony". Both halves are wrong: July is under-read, and August's monthly import total is close to PGE while its daytime hours are over-read.                                                                                                                                                                                                                                                                                                                                    |
| 10  | Ratings: self-sufficiency             | `src/lib/services/period-rating.ts:104-112` (`selfSufficiency`), `:87`, `:155-162` ("Poza oceną"), norm `:171-182`; `RATING_EXPLANATION` `calendar-view.ts:81`                                                                                                | `grid_import_kwh`, `load_kwh`                              | `1 − import ÷ use`: July's under-read import inflates July's self-sufficiency; from 4 August the over-read lowers it. Within one side the 14-day norm largely cancels the bias (the current claim). Across the flip it does not: days 4 to about 17 August are rated against a norm holding July days and are pushed to "Słaby dzień"; month ratings for August inherit it. The "Poza oceną" rule (import > use) fires on 07-27, 07-28, 07-30, 08-02, 08-03 (`roadmap.md:430`), which may itself be a symptom of the CT fault rather than grid charging. |
| 11  | Hourly usage ("Godziny zużycia")      | `src/lib/services/hourly-usage.ts:97`, `:111-124` (`gridDraw = max(net, 0)`), `:148-156` (night sum), `:160-165` (`isSuspectLowHour`), `:290-300`; `src/components/HourlyUsageCard.astro:152-156`                                                             | `hourly_energy.grid_net_kwh`                               | "Pobór z sieci w nocy" (last night, night average) is from the inverter's net; the card caveats it as "w nocy zwykle o około 10–20%" high (checked on 26–31 August). By the fit, the offset (+0.70 kWh/h) dominates at low load, so the percentage is not stable and depends on load. Ranking is by house use, so the lists are only affected if `load_kwh` is derived from the CT. `isSuspectLowHour` drops hours where the grid reading far exceeds use, which the CT offset can also cause.                                                           |
| 12  | Glossary                              | `src/lib/format/glossary.ts:36-44` (`grid_import`, `grid_export`), `:83-86` (`night_grid_draw`)                                                                                                                                                               | text                                                       | Defines the terms as what PGE bills ("tak jak rozlicza go PGE"), which the figures do not currently match.                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Documents that state the current (partly wrong) understanding

- `docs/logic.md:69-70`: export series under-reads; no self-consumption figure. Still right.
- `docs/logic.md:99`, `:109`: grid draw 11.8% above PGE at night; over-report "from 4 August 2026". The "from 4 August" part is contradicted by the July fit.
- `docs/logic.md:159`, `:163`: calendar shows import "with the note that it has been overstated since 4 August 2026".
- `docs/logic.md:170-171`, `:176`: self-sufficiency and the "largely cancels out" claim.
- `docs/logic.md:186`: early days don't balance ("the early PV and export counters are off") — plausibly the same CT fault.
- `docs/logic.md:196-197`: bill forecast imported energy from the inverter.
- `docs/decisions.md:11`, `:16`, `:23-24`, `:65-69`: rating rationale ("lowers all days alike"), what the calendar leaves out, hourly source and the 11.8% correction, net-metering and the reasons the inverter's export is not used.
- `context/foundation/roadmap.md:428` (open question 5), `:430` (open question 7), `:451` (parked: PGE monthly figures in the calendar, needs a privacy decision).

## Code References

- `src/lib/services/calendar-view.ts:56-81`: over-report constant, captions and explanations.
- `src/lib/services/calendar-view.ts:320-332, 451, 500-530`: totals, month series, quarter, day totals.
- `src/lib/services/period-rating.ts:87, 104-112, 155-182`: self-sufficiency, "Poza oceną", norm.
- `src/lib/services/complete-day.ts:11-15`: completeness rule.
- `src/lib/services/live-state.ts:154, 390, 414-434`: live grid flow, today counters, sparklines.
- `src/lib/services/usage-insight.ts:64, 221, 298, 310-316`: purchase value, norm, series.
- `src/lib/services/hourly-usage.ts:97, 111-124, 148-165`: hourly grid draw.
- `src/lib/services/bill-forecast.ts:407, 432`: app-side mapping of the lab's imported energy.
- `src/lib/ingest/contract.ts:19-28, 60-61, 66-82`: where the figures enter.
- `src/components/history/HistoryNotes.astro:5-36`, `MonthView.astro:199`, `QuarterView.astro:106`, `HourlyUsageCard.astro:152-156`, `UsageInsightCard.astro:23-43, 143`, `LiveStateCard.astro:36-50`, `live/LiveFlow.tsx:135-146`: where users read them.
- `src/lib/calendar/period.ts:15`: `HISTORY_START = "2026-07-16"`.
- `src/lib/services/calendar-view.test.ts:564-590`: pins the current note texts.

## Architecture Insights

- Services build view models and cards only render, so a correction or a widened note lands in one service per surface. The over-report copy is already centralised in `calendar-view.ts`, but the hourly card's caveat is inline Astro text and the live and usage cards have none.
- The app never recomputes lab figures; it validates and displays them. Correcting data in the app would be a first (derived "corrected" numbers next to raw ones). Correcting it in the lab keeps the current split but needs a homelab-2 change and a re-push of history (the `--from/--to` push, `docs/decisions.md:16`).
- The hourly nets the fit needs are only in the app for 35 days; the lab's 5-minute history (and the Home Assistant recorder on the UGREEN) is the only place a per-hour correction of the whole history can be computed.

## Historical Context (from prior changes)

- `context/archive/2026-09-28-grid-export-mismatch/change.md`, `frame.md`: export 94.7 vs 342 kWh for August; PGE settles hourly-balanced values; night export real; the 11.8% night figure; "1–3 August behave differently" (now explained by the sign flip).
- `context/archive/2026-09-30-history-calendar/`: chose to show inverter import with the "since 4 August" note and to leave export and PGE figures out.
- `context/changes/period-ratings/change.md`: "Grid import is over-reported from 4 August 2026 … the rating must say so or account for it" — addressed by the "largely cancels" argument, which this research weakens across the flip.
- `context/archive/2026-09-30-history-backfill/`: kept the unbalanced early days as sent.
- `context/archive/2026-09-27-bill-accuracy/`: net-metering model; August import matched PGE within 2.5%.

## Related Research

- `context/archive/2026-09-30-history-calendar/research.md`, follow-up section "PGE": the PGE sources the lab holds.
- `context/archive/2026-09-28-grid-export-mismatch/frame.md`.

## Open Questions

1. Is `load_kwh` (and `home_load_w`) derived from the same CT? If yes, house use is wrong too and the scope grows to the usage card, the calendar's house use and every rating denominator. Checkable in the lab: does PV + battery + inverter-grid balance to load exactly on every 5-minute sample?
2. Has the installer been contacted, and is a date known? The answer decides whether a software correction is worth building at all.
3. Is the fit stable enough to apply? It rests on import-only hours of 6.5 weeks; R² 0.90 after the flip; export hours were not fitted.
4. May PGE-derived figures (not raw rows) be shown in the app? This is the parked privacy decision (`roadmap.md:451`).
5. After the physical fix, what happens to the history before it — kept raw with a note, corrected, or replaced by PGE?
