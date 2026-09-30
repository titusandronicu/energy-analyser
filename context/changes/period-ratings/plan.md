# Period Ratings Implementation Plan

## Overview

Give each completed day and each completed month in the history calendar a good / neutral / bad rating (roadmap S-17, FR-022, US-05). The rating compares the period's self-sufficiency with a recent norm and states its basis, period and number of days. It never gives advice. The rating is computed in the app, in a pure and tested service, and fills the `rating` slot the calendar already reserves on the day and month views.

## Current State Analysis

- **Reserved slots.** The calendar (S-15) reserves `rating: null` on the day, month and quarter view models: `ReservedSlots` in `src/lib/services/calendar-view.ts:162-167`, spread from `RESERVED` (`:252`). No component reads it yet. `isCompleteDay` (`:259-262`) requires a past day with finite, non-negative pv, load and import, but allows load 0.
- **Norm machinery from S-04 (`src/lib/services/usage-insight.ts`).**
  - `median` (`:87-92`) is exported and pure.
  - The band logic (`statusOf`/`bandOf`, `:94-105`) is private, relative (±15% / +40%) and treats "higher is worse".
  - `selectBaseline` (`:213-274`) is hard-wired to `load_kwh` and to "the most recent day".
  - None of it fits a bounded 0–100% metric where higher is better, rated for any target day. The edge helper `edgePercentLabel` (`src/lib/format/edge-percent.ts:12`) and `formatPeriod` (`src/lib/format/period.ts:8`) are reusable.
- **Status tones.** `src/lib/format/status.ts:2` defines `good | watch | problem | insufficient`. Grey `insufficient` means "not enough data". `StatusBadge` accepts a `text` override, which the historical recommendation badge already uses.
- **Rules already set.**
  - Self-sufficiency is `1 − import ÷ consumption`, clamped to 0–100%, and only for complete days with consumption above 0 (`context/foundation/prd-v3.md:271`).
  - The median is the norm statistic (`docs/decisions.md:65`).
  - Until a year of history exists, ratings use a disclosed recent norm (`docs/decisions.md:68`).
  - Nothing is rated from too little data (`docs/logic.md:142`).
  - Ratings describe and never advise.
- **Production data (2026-09-30).**
  - From August onward, most complete days reach 55–70% self-sufficiency, and cloudy days drop to 23–37%. Self-sufficiency therefore mostly follows the sun.
  - Grid import is over-reported from 2026-08-04 (`GRID_IMPORT_OVERSTATED_FROM`, `calendar-view.ts:43`). This lowers every day's self-sufficiency by a similar amount, so it largely cancels out when a day is compared with a norm built from the days before it.
  - On 07-27, 07-28, 07-30, 08-02 and 08-03 the import is larger than the house's use. These are the inconsistent early rows (roadmap open question 7).
  - Gaps in September (09-13 to 09-19, 09-21 to 09-24) leave late-September days with fewer than 7 qualifying days in their window.
- **Open question 8 (autumn ramp).** A trailing 30-day median lags the season, so an ordinary autumn day could read as bad (`context/foundation/roadmap.md`, open question 8). This plan answers it with a 14-day window.

## Desired End State

On the history calendar:

- **The day view** of a completed past day shows a rating badge:
  - "Dobry dzień" (green), "Przeciętny dzień" (grey) or "Słaby dzień" (red), or "za mało danych: N z 7" (grey), or "dane niespójne" for a day whose import exceeds its use.
  - The basis beneath it, for example: "Samowystarczalność 30,9% — 27,4 punktu poniżej normy. Norma: mediana z 13 dni: 28 sierpnia – 10 września (ostatnie dni, bo z tej pory roku jest za mało danych)."
  - When the day's PV was well below the norm days' PV, a note such as "Mało słońca: 10,9 kWh z paneli, zwykle 23,4 kWh."
- **The month view's totals** of a completed month show the month rating ("Dobry / Przeciętny / Słaby miesiąc") with its basis ("mediana odchyleń 13 ocenionych dni"). The current month says it isn't finished and isn't rated; September 2026 is rated once it's over.
- **Not rated:** today, future days, incomplete days, the current month and the quarter.

Worked examples on production data (they become tests on a production-shaped fixture):

- **2026-09-11.** The norm is the median of 13 qualifying days (2026-08-28 to 2026-09-10) = 58.3%. The day reached 30.9%, which is −27.4 points, so it rates **Słaby dzień**. Its PV was 10.9 kWh, below 70% of the norm days' median PV (23.4 kWh), so it also shows **Mało słońca**.
- **2026-09-12.** The norm is 57.4% over 13 days. The day reached 60.9%, which is +3.5 points, so it rates **Przeciętny dzień**.
- **2026-09-29.** Only 5 qualifying days fall in 2026-09-15 to 2026-09-28, so it reads **za mało danych: 5 z 7**.
- **2026-07-28.** Its import (19.8) is larger than its use (16.3), so it reads **dane niespójne** and is left out of every norm.

### Key Discoveries:

- `calendar-view.ts:162-167, 252`: the slot to fill. `buildDayView` and `buildMonthView` are the builders that receive rows.
- `src/pages/dashboard/history.astro:73`: rows are loaded with `periodBounds(period)`. Ratings need 14 more days before the first day of the period.
- `edge-percent.ts:12`: prints an edge value so that exactly 10.0 stays on the milder (neutral) side.
- `status.ts:2`: there is no neutral tone. Grey `insufficient` plus a `text` override gives "Przeciętny dzień" in grey, distinguished from "za mało danych" by its words.

## What We're NOT Doing

- **No seasonal norm.** Same-season history won't exist until about July 2027. Every rating uses the recent 14-day norm and says so. The seasonal switch is left to a later change once a year of history exists.
- **No ratings in the month grid cells, on the quarter view or its month rows, or on the dashboard.** Ratings appear only on the day view and the month totals, as decided.
- **No rating for the current month, today, future days, or the quarter as a whole.**
- **No change to the S-04 usage card or its 30-day window.** Question 8 is answered for ratings only.
- **No weather, irradiance or temperature data, and no lab, contract or migration change.**
- **No correction of the grid-import over-report and no filling of gaps.** Gap filling is F-06.
- **No advice in any rating text.**

## Implementation Approach

A new pure service computes everything from `DailyEnergyRow[]`, and `calendar-view.ts` calls it to fill the slot. Two rules are kept separate from S-04 on purpose: the band rule uses absolute points instead of a relative ±%, and higher is better. Only `median`, `formatPeriod` and `edgePercentLabel` are reused. The page widens the daily read by 14 days so every day in the period has its norm window.

## Phase 1: Rating logic

### Overview

A pure, tested `period-rating.ts` that rates a day and a completed month.

### Changes Required:

#### 1. Rating service

**File**: `src/lib/services/period-rating.ts` (new), `src/lib/services/period-rating.test.ts` (new)

**Intent**: Decide every number, word and sentence of a rating so that components only render it.

**Contract**:

- Constants:
  - `RATING_WINDOW_DAYS = 14`;
  - `RATING_MIN_DAYS = MIN_RANKED_DAYS` (7);
  - `RATING_THRESHOLD_POINTS = 10`;
  - `LOW_SUN_SHARE = 0.7`.
- `selfSufficiency(row)`, returning a percentage or null:
  - null unless `isCompleteDay` holds and load > 0;
  - `"inconsistent"` when import > load;
  - otherwise `clamp(100 × (1 − import ÷ load), 0, 100)`.
- `rateDay(day, rows, today)`, returning a `PeriodRating`:
  - **Not rated** (`kind: "none"`, with a reason) for today, future days, incomplete days and days with load 0.
  - **Inconsistent days** get `kind: "inconsistent"` ("dane niespójne").
  - **The norm** is the median self-sufficiency of the qualifying days (complete, consistent, load > 0) in `[day − 14, day − 1]`. With fewer than 7 of them, the result is `kind: "insufficient"` with "za mało danych: N z 7".
  - **The gap** is `delta = value − norm` in percentage points. A delta above +10 is good, below −10 is bad, and anything else is neutral. Exactly ±10 stays neutral: compare with a small epsilon. The gap is printed by a new points variant next to `edgePercentLabel` (`src/lib/format/edge-percent.ts`): same edge rule, one decimal, unit "punktu" ("27,4 punktu poniżej normy"; exactly 10 reads "10,0 punktu" on the neutral side).
  - **Low sun:** when the day's PV is below `LOW_SUN_SHARE` times the median PV of the same norm days, add a `lowSun` note with both kWh values.
  - **The result** carries: tone (`good` / `insufficient` for neutral / `problem`), word ("Dobry dzień" / "Przeciętny dzień" / "Słaby dzień"), value, norm, delta, the `formatPeriod` label of the norm days and their count, and a `basis` sentence that says the norm is the recent one.
- `rateMonth(month, rows, today)`:
  - Uses its own words: "Dobry miesiąc" / "Przeciętny miesiąc" / "Słaby miesiąc".
  - Not rated for the current or a future month ("miesiąc jeszcze trwa").
  - Otherwise, take the gaps of the month's days that `rateDay` rated good, neutral or bad. With fewer than 7 such days the result is insufficient. Otherwise the median gap is rated with the same ±10 rule, and the basis sentence names the count and the period of the rated days.
- `rowsNeededFrom(first)`: the first day key to load, `first − 14`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass. They cover:
  - the worked examples (09-11 bad with low sun, 09-12 neutral, 09-29 insufficient 5 of 7, 07-28 inconsistent) on a production-shaped fixture;
  - exactly +10.0 and −10.0 staying neutral, while +10.1 is good and −10.1 is bad, and the points label printing "10,0" and "10,1" accordingly;
  - the month words ("Dobry / Przeciętny / Słaby miesiąc");
  - load 0, today and future days not rated;
  - inconsistent days excluded from norms;
  - a month with 6 and with 7 rated days, and the current month not rated.
    Command: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`

**Implementation Note**: Pause for the owner's confirmation before Phase 2.

---

## Phase 2: Calendar display and docs

### Overview

Fill the rating slot on the day and month views, show it as a badge with its basis, and update the docs.

### Changes Required:

#### 1. View models and loading

**File**: `src/lib/services/calendar-view.ts`, `src/lib/services/calendar-view.test.ts`, `src/pages/dashboard/history.astro`

**Intent**: The day and month builders call `rateDay` / `rateMonth` with rows that reach 14 days before the period, so the first days of a month have their norm.

**Contract**:

- `ReservedSlots.rating` becomes `PeriodRating | null` on `DayView` and `MonthView`. `QuarterView` keeps `null`.
- The day and month paths in `history.astro` load `[rowsNeededFrom(first), last]` for daily rows. Totals, grid and charts still use only the period's own days, which a test pins.
- The default-month path's two-month read also reaches 14 days before the first day of the chosen month.

#### 2. Rating badge and basis

**File**: `src/components/history/RatingPanel.astro` (new), `src/components/history/DayView.astro`, `src/components/history/MonthView.astro`, `src/components/history/HistoryNotes.astro`

**Intent**: Show the rating where it was decided: on the day view and on the month totals.

**Contract**:

- `RatingPanel` renders `StatusBadge` with the rating's tone and its word as the `text` override, the basis sentence, and the low-sun note when present. It renders nothing when the rating is null.
- It sits on the day view under "Dzień w liczbach", and in `MonthView.astro` next to the `TotalsPanel`. `TotalsPanel` is unchanged, because the quarter view also uses it and must stay unrated.
- `HistoryNotes` gains a short "Ocena" explanation covering:
  - self-sufficiency in plain words;
  - the 14-day norm and the 7-day minimum;
  - the ±10 points rule;
  - that sunny and cloudy days move the rating;
  - that the grid-import over-report lowers all days alike;
  - that inconsistent days are skipped.
    The numbers are built from the constants, not written into the copy (the F3 rule from the calendar's review).

#### 3. Docs and roadmap

**Files**: `docs/logic.md`, `docs/decisions.md`, `context/foundation/roadmap.md`

**Intent**: Record the rating rules and decisions (lesson: keep the docs in step).

**Contract**:

- `logic.md`: the planned S-17 rule becomes a built "Ocena dni i miesięcy" section with the formula, the consistency rule, the 14-day window, the 7-day minimum, the ±10 points rule and its neutral edges, the low-sun note, the month rule, and what isn't rated.
- `decisions.md`: a dated entry covering:
  - absolute points instead of relative %;
  - a 14-day window, with question 8 answered for ratings;
  - the month rated by the median gap;
  - green / grey / red;
  - inconsistent days skipped;
  - placement on the day view and month totals only;
  - no seasonal norm until a year of history exists.
- `roadmap.md`: question 8 is marked answered for ratings (the usage card still uses 30 days), and question 7 notes that ratings skip days whose import exceeds their use. No Status field changes (the workflow handles those).

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the widened row range not changing month totals or charts: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- Docs record the rules: `git grep -n "Ocena dni" -- docs/logic.md` prints at least one line

#### Manual Verification:

- On the local stack with production-shaped history:
  - 2026-09-11 shows "Słaby dzień" with its basis and "Mało słońca".
  - 2026-09-12 shows "Przeciętny dzień".
  - 2026-09-29 shows "za mało danych: 5 z 7".
  - 2026-07-28 shows "dane niespójne".
  - August 2026 shows a month rating with its basis.
  - The current month says it isn't rated yet; September 2026, once finished, shows a month rating with its basis.
- At 375 px the badge and basis wrap without horizontal scroll, and the badge's words are read by a screen reader.
- In production after deploy, the same four days and August read as above.

---

## Testing Strategy

### Unit Tests:

- Self-sufficiency: the formula, the clamp, load 0, and import > load.
- Norm: the 14-day window, the 7-day minimum at 6 and 7, and inconsistent and incomplete days excluded.
- Bands at exactly ±10.0, ±10.1 and 0.
- Low-sun at exactly 70% of the norm PV (not low) and just below it (low).
- Month: current month not rated; 6 and 7 rated days; the median gap bands.
- View models: the rating slot is filled on day and month; the quarter stays null; the widened rows don't leak into totals, grid or charts.

### Manual Testing Steps:

1. Push production-shaped history locally, as in S-15, and open the four example days and August.
2. Check the badge words, the basis sentences and the low-sun note, at 375 px and 1440 px.
3. After deploy, repeat on production.

## Performance Considerations

The day view's daily read grows from 1 to 15 rows, and a month's from about 31 to about 45. There are no new queries.

## Migration Notes

None. There is no schema, contract or lab change, and rollback is reverting the PR. External prerequisites (lesson): none new.

## References

- Requirements: `context/foundation/prd-v3.md` FR-022 (`:214`), business logic (`:271`), US-05 (`:116-130`); roadmap S-17 and open questions 7 and 8.
- Patterns: `src/lib/services/usage-insight.ts:87-105, 213-274`; `src/lib/format/edge-percent.ts:12`; `src/lib/services/calendar-view.ts:162-167, 252-262`; `context/archive/2026-09-30-history-calendar/plan.md`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rating logic

#### Automated

- [x] 1.1 Unit tests pass, covering the worked examples, the ±10 edges, unrated days, inconsistent days excluded from norms, and the month minimum and current month: `npm test`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Type checks pass: `npx astro check`

### Phase 2: Calendar display and docs

#### Automated

- [ ] 2.1 Unit tests pass, including the widened row range not changing month totals or charts: `npm test`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Type checks pass: `npx astro check`
- [ ] 2.4 Production build succeeds: `npm run build`
- [ ] 2.5 Docs record the rules: `git grep -n "Ocena dni" -- docs/logic.md` prints at least one line

#### Manual

- [ ] 2.6 Local stack: 09-11 Słaby dzień with basis and Mało słońca, 09-12 Przeciętny dzień, 09-29 za mało danych 5 z 7, 07-28 dane niespójne, August rated, the current month not rated yet and September (once finished) rated
- [ ] 2.7 At 375 px the badge and basis wrap without horizontal scroll and the badge words are read by a screen reader
- [ ] 2.8 Production after deploy: the same four days and August read as above
