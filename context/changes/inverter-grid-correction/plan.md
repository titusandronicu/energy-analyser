# Inverter Grid Correction Implementation Plan

## Overview

The inverter's grid sensor has measured wrongly since the history began on 2026-07-16. House use comes from the same sensor, so it is wrong too. The app currently says only that grid import is "overstated from 4 August", which is not true. This change replaces that note with one caveat for the whole history, and records 4 August 2026 only as the day the sensor's direction changed. The owner chose option A (research follow-up, 2026-09-30).

The change also stops ratings from comparing days across that change. It puts the caveat on the live, usage and hourly cards, fixes the glossary and corrects `docs/logic.md`, `docs/decisions.md` and the roadmap. Nothing is corrected numerically. The installer's physical fix (option D) runs in parallel, outside the app.

## Current State Analysis

From `context/changes/inverter-grid-correction/research.md`:

- **All grid and house-use figures come from the inverter.** That covers `daily_energy.grid_import_kwh`, `grid_export_kwh` and `load_kwh`, the live `grid_w`, `home_load_w` and today counters, and `hourly_energy.grid_net_kwh` and `load_kwh`. There is no PGE figure in the app.
- **House use is derived from the same sensor** (owner's answer to research question 1, from the earlier analysis). From 2026-08-04 the inverter's power balance `pv + grid + battery − load` closes on every sample, with a +130–190 W residual that is losses. True night load (PGE net + inverter output) stays at about 0.7–0.8 kW, while the inverter's load swings between 0.48 and 1.79 kW.
- **One data-quality note exists,** keyed to `GRID_IMPORT_OVERSTATED_FROM = "2026-08-04"` (`src/lib/services/calendar-view.ts:56-74`). It feeds `MONTH_CHART_NOTE`, `QUARTER_CHART_NOTE`, `GRID_IMPORT_TERM` and `GRID_IMPORT_EXPLANATION`, and the sentence about over-reporting in `RATING_EXPLANATION` (`:81`). `src/lib/services/calendar-view.test.ts:562-590` pins these texts.
- **The hourly card has an inline caveat** (`src/components/HourlyUsageCard.astro:152-156`) with a "10–20% at night" figure that depends on load and is not stable.
- **The live card and the usage card have no import caveat.**
- **Ratings** (`src/lib/services/period-rating.ts:149-222`) compare a day with the median of the qualifying days in the 14 days before it. Days 2026-08-04 to 2026-08-17 therefore get a norm made wholly or partly of days before the sensor change. `docs/decisions.md:11` and `docs/logic.md:176` claim the error "largely cancels", which fails across the change.
- **The usage card's fallback baseline is the 30 days before the compared day** (`src/lib/services/usage-insight.ts:258-270`). It spans 2026-08-04 only for compared days from 08-04 to 09-03. Those are past, but the seasonal baseline will span the change again from about July 2027.

### Key Discoveries:

- `PeriodRating`'s `inconsistent` kind already renders as "Poza oceną" with a free-text `basis`. No component switches on the kind (`git grep -n inconsistent -- src` finds it only in `period-rating.ts`), so the new rule can reuse it without touching any component.
- The norm is built only from `selfSufficiency()` of each window day, never from other days' ratings (`period-rating.ts:167-175`). Days from 08-04 to 08-17 can therefore be left unrated and still count in the norms of 08-18 onwards, which lie wholly after the change.
- Dependencies: `period-rating.ts` imports `usage-insight.ts`, and `calendar-view.ts` imports `period-rating.ts`. A new leaf module, which imports only `warsaw-time` and `calendar/period`, can serve all three without a cycle.

## Desired End State

- **One caveat everywhere:** "grid import and house use come from a faulty inverter sensor, for the whole history". It appears in the calendar captions and "Co to znaczy?", on the live card, on the usage card and on the hourly card. Each copy is taken from one module, `src/lib/services/grid-sensor.ts`.
- **4 August 2026 appears only as "sensor direction changed".**
- **Ratings:** a day from 2026-08-04 to 2026-08-17 reads "Poza oceną", with a neutral basis that names the sensor change. No rating norm mixes days from both sides of the change. A month is rated from its rated days, as today, so August rests on 18–30 August.
- **The usage card** adds one sentence when its baseline spans the sensor change.
- **Docs and roadmap match all of this.** No sentence in `docs/` or the roadmap says the import is "overstated from 4 August" or that the error "largely cancels".

## What We're NOT Doing

- **Option B, the fitted correction, is rejected.** The hourly formula is unverified: R² is 0.90 after the change, and it was fitted on import-only hours over 6.5 weeks. It would need a lab re-push, since the app holds hourly nets for 35 days only. It would also show numbers that no meter measured.
- **Option C, PGE figures for closed days, is not in this plan.** It becomes a separate later change: a lab aggregation and push, a contract and migration, and the parked privacy decision (`context/foundation/roadmap.md:451`). After the installer's fix, the history before it is kept with this caveat, and replacing it with PGE data is that change's job.
- **No lab, contract, migration, Supabase or homelab changes.** No PGE data leaves the lab.
- **The CT and the zero-export regulation are not addressed in software.** That is the installer's job (option D, outside the app).
- **The bill forecast card gets no new caveat.** The lab computes its imported energy, and the range already carries the uncertainty. Flagged for plan review, since it is a surface the owner did not list.
- **The live home verdict's load norm (`dailyLoadNorm`) is unchanged.** Its 30-day window can no longer span the change, because the compared day is always yesterday or later.
- **No change to the export explanation beyond naming the same sensor.** Export stays out of the calendar.

## Implementation Approach

Put the date, the caveat texts and a small pure helper in one leaf module. Rewrite the calendar and rating copy and the rating rule on top of it, with synthetic tests. Then apply the same texts to the dashboard cards and the glossary, and finally correct the docs and the roadmap. Every change is copy or a pure-function rule. No data paths change.

## Critical Implementation Details

- **The window rule.** A day `D` is inside the sensor-change window when `SENSOR_DIRECTION_CHANGED_ON ≤ D ≤ addDays(SENSOR_DIRECTION_CHANGED_ON, RATING_WINDOW_DAYS − 1)`, which is 2026-08-04 to 2026-08-17.
  - That is exactly the set of days whose own value and the window `[D − 14, D − 1]` do not all lie on one side of the change.
  - The helper is `crossesSensorChange(first, last)`, true when `first < CHANGED_ON ≤ last`. `rateDayIn` calls it with `(addDays(D, −RATING_WINDOW_DAYS), D)`.
- **The order of checks in `rateDayIn`.** Today, future, no row and incomplete are checked first, then no use. The sensor-change check comes **before** the import-above-use check, so a day inside the window always names the sensor rather than "błąd licznika". Its result is `{ kind: "inconsistent", tone: "insufficient", word: INCONSISTENT_WORD, basis: SENSOR_CHANGE_RATING_BASIS }`.
- **Wording stays neutral** (the existing "Poza oceną" convention, `docs/decisions.md:11`). It describes and never blames or advises.

## Phase 1: Shared caveat, calendar copy and the rating rule

### Overview

Create the caveat module. Move the calendar's notes onto it. Add the rule for the sensor-change window to the ratings.

### Changes Required:

#### 1. Caveat module

**File**: `src/lib/services/grid-sensor.ts` (new), with `src/lib/services/grid-sensor.test.ts`

**Changes**:

- `SENSOR_DIRECTION_CHANGED_ON = "2026-08-04"`.
- `crossesSensorChange(first: string, last: string): boolean`.
- Texts, each built from the constants (`formatDayMonth`, `HISTORY_START`). The Polish below is the target wording; plan review may polish it.
  - `SENSOR_CAVEAT`, one line for cards: "Prąd kupiony z sieci i zużycie domu pochodzą z czujnika prądu falownika, który od początku historii mierzy źle, więc te liczby są niepewne do czasu sprawdzenia czujnika przez instalatora."
  - `SENSOR_TERM`: "Prąd kupiony z sieci i zużycie domu".
  - `SENSOR_EXPLANATION`: "Falownik mierzy prąd z sieci wadliwym czujnikiem od początku historii (16 lipca 2026), a zużycie domu wylicza z tego samego czujnika, więc obie liczby są niepewne. Do 3 sierpnia pokazywał za mało prądu kupionego z sieci. 4 sierpnia 2026 zmienił się kierunek czujnika: od tego dnia prąd kupiony z sieci jest zawyżony, zwłaszcza w dzień, a prąd oddany do sieci zaniżony. Czujnik sprawdzi instalator; wcześniejsze dni zostaną z tą uwagą."
  - `SENSOR_CHANGE_RATING_BASIS`: "4 sierpnia 2026 zmienił się kierunek czujnika prądu falownika. Norma tego dnia sięgałaby dni sprzed tej zmiany, a ich liczb nie da się z późniejszymi porównać, więc ten dzień nie jest oceniany."
  - `SENSOR_CHANGE_BASELINE_NOTE` (usage card, Phase 2): "Norma obejmuje dni sprzed i po 4 sierpnia 2026, kiedy zmienił się kierunek czujnika prądu falownika, więc to porównanie jest szczególnie niepewne."

#### 2. Calendar copy

**File**: `src/lib/services/calendar-view.ts`, `src/components/history/HistoryNotes.astro`, `src/lib/services/calendar-view.test.ts`

**Changes**:

- Remove `GRID_IMPORT_OVERSTATED_FROM`, `GRID_IMPORT_OVERSTATED`, `GRID_IMPORT_TERM` and `GRID_IMPORT_EXPLANATION`.
- `MONTH_CHART_NOTE`: "Dni bez danych zostają puste, a dzisiejszy dzień nie jest rysowany, bo jeszcze trwa. Prąd kupiony z sieci i zużycie domu są przez całą historię niepewne (zobacz „Co to znaczy?”)."
- `QUARTER_CHART_NOTE`: the same second sentence, without the pointer.
- `RATING_EXPLANATION`: replace the sentence "Zawyżony od 4 sierpnia … mało się zmienia." with: "4 sierpnia 2026 zmienił się kierunek czujnika prądu falownika, więc dni od 4 do 17 sierpnia, których norma sięgałaby sprzed tej zmiany, są „Poza oceną”, a norma nigdy nie łączy dni sprzed i po zmianie." Compute "17 sierpnia" from the constants.
- `HistoryNotes.astro`: `{ term: SENSOR_TERM, explanation: SENSOR_EXPLANATION }` replaces the grid-import note.
- The export note becomes: "Ten sam czujnik falownika pokazuje za mało prądu oddanego do sieci, a od połowy sierpnia prawie zero, choć PGE zapisało prawdziwy zwrot. Dlatego kalendarz go nie pokazuje."
- Update the pinned-copy test to the new texts. Assert that no exported constant contains "zawyżony od".

#### 3. Rating rule

**File**: `src/lib/services/period-rating.ts`, `src/lib/services/period-rating.test.ts`

**Changes**:

- In `rateDayIn`, after the no-use check and before the import-above-use check: `if (crossesSensorChange(addDays(day, -RATING_WINDOW_DAYS), day)) return { kind: "inconsistent", …, basis: SENSOR_CHANGE_RATING_BASIS }`.
- Update the comment on the `inconsistent` variant: import above use, **or** a day in the sensor-change window.
- Tests, synthetic rows only:
  - 08-04 and 08-17 read "Poza oceną" with the sensor basis, even when a full norm exists.
  - 08-03 and 08-18 are rated normally, and 08-18's norm days are all ≥ 08-04.
  - A window-day that also has import above use gets the sensor basis.
  - An August built from steady days is rated from 18–31 August only, and its `periodLabel` says so.
  - Rewrite the existing case "leaves the inconsistent early days out of the norm". It currently expects 08-04 to read "Za mało danych: 3 z 7" (`period-rating.test.ts:181-188`); it now expects the sensor "Poza oceną". Keep that test's other assertion (08-03 inconsistent).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- No "overstated" copy remains in `src`: `git grep -n "GRID_IMPORT_OVERSTATED\|zawyżony od" -- src` prints nothing

#### Manual Verification:

- With synthetic rows, `rateMonth("2026-08", …)` reports its rated days as 18–31 August. `rateDay` for 08-10 gives the sensor "Poza oceną" basis, read aloud once for tone.

---

## Phase 2: Dashboard cards and glossary

### Overview

Show the same caveat on the live, usage and hourly cards. Add the baseline note to the usage card. Fix the glossary's PGE claim.

### Changes Required:

#### 1. Live card

**File**: `src/components/LiveStateCard.astro`

**Changes**: add `<p class="text-muted-foreground text-xs" data-testid="live-sensor-caveat">{SENSOR_CAVEAT}</p>` to the footer block beside the capture line (`:118-126`). It covers the flow's grid and home values, the today KPIs and the sparklines.

#### 2. Usage card

**File**: `src/lib/services/usage-insight.ts`, `src/lib/services/usage-insight.test.ts`, `src/components/UsageInsightCard.astro`

**Changes**:

- Add `crossesSensorChange: boolean` to the `baseline` of the insight view. It is true when the earliest baseline day is before `SENSOR_DIRECTION_CHANGED_ON` and the compared day is on or after it. Computed in `toUsageInsightView` from `baselineDays` and `compared`.
- The card shows `SENSOR_CAVEAT` always (`data-testid="usage-sensor-caveat"`, small muted text under the rows). It shows `SENSOR_CHANGE_BASELINE_NOTE` only when `baseline.crossesSensorChange` (`data-testid="usage-baseline-sensor-note"`).
- A note is simpler than suppressing the change against the norm, because suppressing it would need a new state for the badge, the deltas and the verdict sentence.
- Tests:
  - A compared day of 2026-08-20 with a fallback baseline from 07-21 → `true`.
  - A compared day of 2026-09-29 → `false`.
  - A seasonal baseline in 2027 that spans 2026-08-04 → `true`. This uses the existing seasonal fixture helpers.

#### 3. Hourly card

**File**: `src/components/HourlyUsageCard.astro`

**Changes**: replace the caveat at `:152-156` with `{SENSOR_CAVEAT}` followed by the ranking sentence, keeping the testid `hourly-caveat`. The ranking sentence reads: "Godziny i dni są uszeregowane według zużycia domu, a godziny, w których pobór z sieci wyraźnie przewyższa zużycie domu, nie trafiają na listę najniższych." It drops the "10–20% at night" figure.

#### 4. Glossary

**File**: `src/lib/format/glossary.ts` (and its test, if one pins the text)

**Changes**:

- `night_grid_draw`: "… liczony godzina po godzinie, w ten sam sposób, w jaki rozlicza go PGE, więc prąd oddany do sieci w jednej godzinie nie pomniejsza poboru w innej." This drops "tak jak rozlicza go PGE", which implied the figures equal PGE's.
- `grid_import` and `house_use` stay conceptual definitions. The caveat sits beside the figures, not in the definition.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- No stale figure remains: `git grep -n "10–20" -- src` prints nothing

#### Manual Verification:

- The dashboard at 390 px and 1440 px shows the caveat once on each of the live, usage and hourly cards. It does not wrap badly and pushes no card out of its grid.

---

## Phase 3: Docs and roadmap

### Overview

Make the written record match the new understanding and the decision.

### Changes Required:

#### 1. `docs/logic.md`

- `:99`, `:109` (Godziny zużycia): replace the 11.8% / "from 4 August" caveat with the whole-history statement. Say that house use is derived from the same sensor, and keep the 11.8% as a historical measurement of 26–31 August only.
- `:159`, `:163` (Historia): the note now covers the whole history. 4 August is "sensor direction changed".
- `:170-176` (Ocena): replace the "largely cancels out" point with the rule for the sensor-change window: 08-04 to 08-17 are "Poza oceną", and norms never mix sides.
- `:186` (Daily totals): add that the early imbalance fits the same sensor fault.
- A short new subsection, "Grid sensor caveat", under "Status colours and data periods". It gives the fitted relations (aggregates only), the date of the direction change, where the caveat is shown, and `src/lib/services/grid-sensor.ts`.
- Add a row to the "Where each rule runs" table.

#### 2. `docs/decisions.md`

- New entry at the top: the whole-history caveat is chosen over a fitted correction or PGE figures, with the why (option B rejected, option C later and needing privacy) and the owner's 2026-09-30 decision.
- `:11`: replace "The grid-import over-report from 4 August lowers all days alike, so it largely cancels…" with the rule for the sensor-change window and why: across the change the bias flips sign, so a 14-day norm does not cancel it.
- `:16`, `:24`: add a pointer that the "from 4 August" and "10–20% at night" wording has been superseded by this change.

#### 3. `context/foundation/roadmap.md`

- Open question 5 (`:428`): the whole-history finding, the sign flip on 3/4 August, house use derived from the sensor, the installer check running in parallel, and option C parked as its own item.
- Open question 7 (`:430`): note that the inconsistent early rows are plausibly the same sensor fault.
- Parked (`:451`): drop "over-reports import from 4 August" in favour of "the inverter's grid sensor is wrong for the whole history". Name option C as the change that would lift it.

### Success Criteria:

#### Automated Verification:

- Formatting passes: `npx prettier --check docs context/foundation/roadmap.md context/changes/inverter-grid-correction`
- The old claims are gone: `git grep -n "largely cancel\|overstated since 4 August\|over-reports import from 4 August" -- docs context/foundation` prints nothing
- The new rule is recorded: `git grep -n "grid-sensor.ts" -- docs/logic.md` prints at least one line

#### Manual Verification:

- The owner reads the new `docs/decisions.md` entry and the roadmap question 5 text and agrees they state the decision.

---

## Testing Strategy

### Unit Tests:

- `grid-sensor.test.ts`: the boundaries of `crossesSensorChange` (08-03/08-03 false, 08-03/08-04 true, 08-04/08-04 false, 07-21/08-17 true, 08-04/08-18 false) and the pinned texts.
- `period-rating.test.ts`: the window's edges (08-03, 08-04, 08-17, 08-18); the sensor basis winning over import above use; August's month rating resting on 18–31 August; norms for 08-18 onwards containing only post-change days.
- `usage-insight.test.ts`: `crossesSensorChange` on fallback and seasonal baselines.
- `calendar-view.test.ts`: the pinned captions and "Co to znaczy?" texts.
- All fixtures are synthetic. The period-rating fixture already copies only the shape of production (`period-rating.test.ts:26-28`).

### Integration Tests:

- Smoke is unchanged. It checks landmarks and routes, not caveat text, so `npm run smoke` against local Supabase must still pass.

### Manual Testing Steps:

1. `/dashboard/history?day=2026-08-10`: "Poza oceną" with the sensor basis.
2. `/dashboard/history?day=2026-08-20`: rated, and the norm period starts on or after 4 August.
3. `/dashboard/history?month=2026-08`: the month rating names 18–30 August (08-31 has no totals in production). The chart caption carries the whole-history note.
4. "Co to znaczy?" on the history page: the new sensor entry, no "od 4 sierpnia zawyżony".
5. Dashboard: the caveat on the live, usage and hourly cards, at 390 px and 1440 px.

## Performance Considerations

None. The change adds constant strings and one comparison per rated day.

## Migration Notes

None. There is no schema, contract or lab change, and rollback is reverting the PR. External prerequisites: none new. The installer check (option D) is tracked in roadmap question 5, not in `docs/prerequisites.md`, because the app does not depend on it.

## References

- Research: `context/changes/inverter-grid-correction/research.md` (including the owner-decisions follow-up)
- Prior changes: `context/archive/2026-09-28-grid-export-mismatch/`, `context/archive/2026-09-30-history-calendar/plan.md`, `context/changes/period-ratings/`
- Code: `src/lib/services/calendar-view.ts:56-81`, `src/lib/services/period-rating.ts:149-222`, `src/lib/services/usage-insight.ts:212-320`, `src/components/HourlyUsageCard.astro:152-156`, `src/components/LiveStateCard.astro:118-128`, `src/lib/format/glossary.ts:36-86`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared caveat, calendar copy and the rating rule

#### Automated

- [ ] 1.1 Unit tests pass, covering `crossesSensorChange` boundaries, the pinned calendar and sensor texts, the rating window 08-04 – 08-17 as "Poza oceną", the sensor basis before import-above-use, and August rated from 18 August on: `npm test`
- [ ] 1.2 Linting passes: `npm run lint`
- [ ] 1.3 Type checks pass: `npx astro check`
- [ ] 1.4 No "overstated from 4 August" copy remains: `git grep -n "GRID_IMPORT_OVERSTATED\|zawyżony od" -- src` prints nothing

#### Manual

- [ ] 1.5 With synthetic rows, the August month rating names 18–31 August and 08-10 reads the sensor basis, which reads neutrally

### Phase 2: Dashboard cards and glossary

#### Automated

- [ ] 2.1 Unit tests pass, covering the usage baseline's `crossesSensorChange` on fallback and seasonal baselines: `npm test`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Type checks pass: `npx astro check`
- [ ] 2.4 Production build succeeds: `npm run build`
- [ ] 2.5 The unstable night figure is gone: `git grep -n "10–20" -- src` prints nothing

#### Manual

- [ ] 2.6 The dashboard at 390 px and 1440 px shows the caveat once on each of the live, usage and hourly cards, without layout breakage

### Phase 3: Docs and roadmap

#### Automated

- [ ] 3.1 Formatting passes: `npx prettier --check docs context/foundation/roadmap.md context/changes/inverter-grid-correction`
- [ ] 3.2 The old claims are gone: `git grep -n "largely cancel\|overstated since 4 August\|over-reports import from 4 August" -- docs context/foundation` prints nothing
- [ ] 3.3 The new rule is recorded: `git grep -n "grid-sensor.ts" -- docs/logic.md` prints at least one line

#### Manual

- [ ] 3.4 In production, `/dashboard/history?day=2026-08-10` reads "Poza oceną" with the sensor basis, and `?month=2026-08` rates from 18 August on
- [ ] 3.5 The owner confirms the `docs/decisions.md` entry and roadmap question 5 state the decision
