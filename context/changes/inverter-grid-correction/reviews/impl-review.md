<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Inverter Grid Correction

- **Plan**: context/changes/inverter-grid-correction/plan.md
- **Scope**: Full plan (plus post-plan commit 3bef11e, the owner's month rule from check 3.4)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated criteria were re-run on main at 992c3fb:

- 871 tests, lint, astro check (0 errors) and the build all pass.
- Greps 1.4, 2.5 and 3.2 print nothing, prettier 3.1 passes, and grep 3.3 finds 2 lines.
- All 16 Progress rows are ticked. The manual checks carry evidence:
  - 2.6 and 3.4 were checked in production at 482c54c and 3bef11e.
  - 1.5 and 3.5 were confirmed by the owner.
- No "What We're NOT Doing" item was touched: no numeric correction, and no lab, contract or migration change.
- XSS: none. Copy is rendered through `{}` and nothing uses `set:html`.
- Test data is synthetic only.

## Findings

### F1 — "Co to znaczy?" and the plan don't state the August month rule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/calendar-view.ts:82 (`RATING_EXPLANATION`), calendar-view.test.ts:576; plan.md Desired End State
- **Detail**: The rule from 3bef11e is that the month holding the sensor change counts only its days from 4 August. It is in the code and in docs/logic.md:187 and docs/decisions.md:8, but not in "Co to znaczy?" or in the plan's Desired End State, which still says "rated from its rated days, as today". The same explanation also says that "Poza oceną" days never enter norms. That holds for days with import above use, but days in the sensor window do count in later norms (08-18's norm is 4–17 sierpnia).
- **Fix**: Add to `RATING_EXPLANATION`, built from the constants: "Miesiąc zmiany (sierpień 2026) jest oceniany tylko z dni od 4 sierpnia; dni z okna zmiany liczą się do późniejszych norm." Pin it in the test, and add an addendum line to the plan's Desired End State.
- **Decision**: FIXED — month rule and norm counting stated in RATING_EXPLANATION; plan addendum added

### F2 — The 3 August wording gives the wrong reason

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/grid-sensor.ts:30-33 (`SENSOR_EXPLANATION`, `SENSOR_CHANGE_RATING_BASIS`)
- **Detail**: 08-03 shows `SENSOR_CHANGE_RATING_BASIS` ("Norma tego dnia sięgałaby dni sprzed tej zmiany…"), but 08-03's real problem is that its own readings are mixed: the direction changed at about 16:00 that day. `SENSOR_EXPLANATION` says "Do 3 sierpnia … za mało" and "4 sierpnia zmienił się kierunek", while docs/logic.md puts the change on the afternoon of 3 August. Both follow the plan's wording (plan-review F3 came after the texts were drafted).
- **Fix**: Add `SENSOR_CHANGE_DAY_BASIS` for 08-03 ("3 sierpnia 2026 po południu zmienił się kierunek czujnika prądu falownika, więc ten dzień łączy odczyty sprzed i po zmianie i nie jest oceniany."), and in `SENSOR_EXPLANATION` say "Do popołudnia 3 sierpnia … od 4 sierpnia …". Update the pinned tests.
- **Decision**: FIXED — SENSOR_CHANGE_DAY_BASIS for 08-03; SENSOR_EXPLANATION says afternoon of 3 August / from 4 August

### F3 — `dayMonthYear()` is duplicated

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/grid-sensor.ts:20, src/lib/services/calendar-view.ts:58
- **Detail**: The two modules have identical copies of the helper.
- **Fix**: Export it once from `@/lib/format/warsaw-time`, next to `formatDayMonth`, and import it in both.
- **Decision**: FIXED — dayMonthYear exported from warsaw-time and imported in both modules

### F4 — The month check relies on a loose prefix and an empty-string sentinel

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/period-rating.ts:244-247
- **Detail**: `SENSOR_CHANGE_DAY.startsWith(month)` would also match "2026" or "2026-0". The `day < ""` skip works only because nothing sorts below the empty string. Both hold today (the only caller passes `YYYY-MM`), but they take a moment's thought to see.
- **Fix**: `const firstDay = SENSOR_CHANGE_DAY.slice(0, 7) === month ? SENSOR_DIRECTION_CHANGED_ON : null;` and `if (firstDay !== null && day < firstDay) continue;`.
- **Decision**: FIXED — exact month match with a null sentinel

### F5 — The "no zawyżony od" guard is case-sensitive

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/calendar-view.test.ts:583-586
- **Detail**: The old `RATING_EXPLANATION` began "Zawyżony od …" with a capital letter, which this guard would not have caught.
- **Fix**: `expect(text).not.toMatch(/zawyżon\w* od/i)`.
- **Decision**: FIXED — guard is now /zawyżon\w* od/i

### F6 — The usage-card note would be literally wrong for a 2027 baseline wholly before the change

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/grid-sensor.ts:36 (`SENSOR_CHANGE_BASELINE_NOTE`)
- **Detail**: For compared days around 2027-07-16 to 07-20, the seasonal window lies wholly before 2026-08-04, so the flag is true (correctly, since the comparison crosses the change). The note, though, says "Norma obejmuje dni sprzed i po 4 sierpnia 2026", which would be false. The gap is in the plan's wording, not in the code, and it can only occur from July 2027.
- **Fix**: Reword to "Norma albo ten dzień sięgają sprzed 4 sierpnia 2026, kiedy zmienił się kierunek czujnika prądu falownika, więc to porównanie jest szczególnie niepewne."
- **Decision**: FIXED — note reworded to "leżą po różnych stronach"
