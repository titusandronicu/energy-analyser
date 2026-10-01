# Time and number guards (test plan Phase 1) Implementation Plan

## Overview

Rollout Phase 1 of `context/foundation/test-plan.md` for risks #1 (stale data shown as fresh), #2 (a wrong money figure shown with a normal status) and #5 (day, month and "enough data" decisions wrong at the boundary). It adds unit and contract tests at the cheapest layer, with an injected clock and expected values derived independently of the code. Two small behaviour changes the owner chose close the holes that tests alone cannot prove: a future-dated recommendation or narration time stops reading as current, and the bill forecast refuses a negative figure and an implausible closed-month amount.

## Current State Analysis

Established by `research.md` (read it for the evidence; paths below are anchors from it, not re-verified here).

- **Mostly pinned already.** For the inspected surfaces and rules, most thresholds have exact-edge unit tests (e.g. `live-state.test.ts:159-164`, `bill-forecast.test.ts:228-236`, `period-summary.test.ts:177-188`). The untested set is narrow: low sun at exactly 70%, the 6-versus-7 operator in `periodTotals`, a rating with today the 1st, day-level rules on the DST days, a winter-midnight `warsawParts`, `adjacent` across the new year, and 16 exports with no direct test (`research.md` Risk #5 and "Test conventions").
- **Risk #1 gap.** `ageStatus` returns good for a negative age (`recommendation.ts:112-115`), and `period-summary.test.ts:254-257` pins "written in the future shows as current". The bill forecast refuses a time more than 5 minutes ahead (`bill-forecast.ts:333`). The ingest contract guards only the push's own `captured_at` against the future, at receipt and within 5 minutes (`contract.ts:252-259`); the live state has no future guard at all (a future `captured_at` gives a negative age that `formatAge` clamps to 0, `live-state.ts:341, 350-355`).
- **Consumers of the stale flag.** `isStaleRecommendation` feeds only `toRecommendationView` (`recommendation.ts:190`); `RecommendationView.isStale` drives the card's "Laboratorium mogło przestać przesyłać dane." paragraph (`RecommendationCard.astro:43-47`), neutral finding chips and the animation gate (`isCurrent`, `recommendation.ts:159, 199`). `TodaySummaryView.isStale` has no component reader, so on the today card a future time changes the badge only. `RecommendationForecast.astro:28-38` labels the forecast days "dziś" and "jutro" relative to the generation time, and `isFromEarlierDay` is false for a future time.
- **Risk #2 gaps.** On the inspected view-model path there is no sign check on central, low or high, and the 7000 PLN ceiling covers only those three (`bill-forecast.ts:367-394`), not the closed-month check's amounts (`:442-446`). The contract already rejects a negative central, low, high and closed-month amount with a 422 (`nonNegative`, `contract.ts:15, 124-127, 157-158`), so the missing sign check matters only for a stored row that skipped validation; the contract has no ceiling, so the closed-month ceiling is the hole with a reachable path (`contract.ts:100-106`). No check ties central to billable kWh × rate + fee, and no lower bound exists. Of 13 bill-forecast fixtures, 2 are rendered through the view model (`src/lib/ingest/bill-forecast-fixtures.test.ts:26, 50`); the ceiling is tested only at 9500 (`bill-forecast.test.ts:321`).
- **Fixture provenance.** `bill-forecast.test.ts:45` calls `docs/ingest/example-v1.json` "the real September body". The owner's decision: treat it as real. New fixtures are fully synthetic; rewriting the example is a separate change.
- **Conventions.** Tests sit next to the unit as `<module>.test.ts` under `src` (the only place `vitest.config.ts` looks), take `now` or `today` as an argument, use `row(overrides)` factories and `it.each`, and open with `// All data here is synthetic.` No test in the inspected set uses the wall clock or a TZ setting.
- **Lessons that apply** (`context/foundation/lessons.md`): a change that adds or alters a rule updates `docs/logic.md` and adds a dated `docs/decisions.md` entry; there are no external prerequisites here (pure unit tests, no lab data, no Supabase).

### Key Discoveries:

- Thresholds live in several modules with different values (15 min, 2 h and 30 min; 5 min future skew only on the forecast). A single cross-surface table with the thresholds written as literals from `docs/logic.md` is the one place where drift between modules becomes visible.
- Any expected value in a new test must come from `docs/logic.md` or hand arithmetic written in a comment, never from importing the production constant (the oracle problem).
- The view model's guard order is fixed because a later guard reads a key an earlier one proves absent (`bill-forecast.ts:306-307`); a new guard must slot into that order.

## Desired End State

For the four age-bearing surfaces (live state, recommendation, today summary, bill forecast), one table-driven suite proves the exact edge, one millisecond over, a future time and the earlier-day case, with thresholds as literals. A time more than 5 minutes ahead reads as a problem ("czas z przyszłości") on the recommendation and the today card. The bill forecast refuses a negative central, low or high and an implausible closed-month amount, every fixture in `scripts/fixtures/bill-forecast/` is rendered through the real view model against a hand-listed expected outcome, and the two remaining holes (lower bound, internal consistency) are pinned as named known gaps. The boundary edges listed above are tested, and every export that decides a day key, staleness or a money label has a direct test. Verify with `npm test`, lint, `astro check` and the build, and by breaking each guard in the worktree and seeing its test go red.

## What We're NOT Doing

- No integration or browser tests; those belong to test-plan Phases 2 and 3 and to later refreshes.
- No change to `docs/ingest/example-v1.json` or the tests that read it; scrubbing it is a separate change recorded in `docs/decisions.md`.
- No re-implementation of the lab's projection formulas as an oracle; the oracle is app-side (verdict bands, delta, ceiling, 7-day rule, displayed rounding).
- No lower plausibility bound and no central-versus-billable-kWh consistency guard; both are pinned as known gaps.
- No fix for the rating's low-sun text rounding (PV 13.96 against a norm of 20 prints "14,0" while flagged low); it is pinned as a known gap.
- No contract change, no migration, no lab change, no new CI step, no coverage threshold.
- The hardcoded "15 minut" text in `LiveStateCard.astro` is left as is.
- No new per-risk test files; one cross-surface file for #1 and extensions to existing co-located files for everything else.
- No component tests; the one card copy change in Phase 1 is covered by a manual check, not a test.
- No real household or lab values in any new fixture or test.

## Implementation Approach

Work on a fresh branch from `main` (this change folder and `test-plan.md` are currently untracked). Order is by risk and cost: the cross-surface staleness suite first, because it covers a High × High risk and carries the one behaviour change that touches two cards; then money guards and the fixture table; then the boundary gaps, which are pure additions; then docs. Each behaviour change lands test-first in the same phase: write the failing test from the independent oracle, then the smallest change that turns it green, then confirm by a deliberate break that the test protects the rule.

## Phase 1: Cross-surface staleness (risk #1)

### Overview

Align future-dated times and add one table-driven suite that proves each age-bearing surface at its exact edge, one millisecond over, a future time and the earlier-day case.

### Changes Required:

#### 1. Future-time rule for recommendation and today summary

**File**: `src/lib/services/recommendation.ts`, `src/lib/services/period-summary.ts`, `src/components/RecommendationCard.astro`, `src/components/RecommendationForecast.astro`

**Intent**: A generation time more than 5 minutes ahead of the app's clock must not read as current. Today `ageStatus` calls any negative age good. The bill forecast already refuses such a time; the recommendation and the today card should flag it. A future time is a clock error, not an outage, so the recommendation card must not tell the reader the lab "may have stopped sending data", and its forecast days must not call a future date "dziś".

**Contract**: a shared future-skew constant of 5 minutes, exported next to `STALE_AFTER_MS` (`recommendation.ts:9`). `ageStatus(ageMs)` returns `{ tone: "problem", label: "czas z przyszłości" }` when `ageMs < -FUTURE_SKEW_MS` (exactly 5 minutes ahead stays good, the same edge as `bill-forecast.test.ts:245-253`). `isStaleRecommendation(generatedAt, now)` is true in the same case, so `isCurrent` is false and findings turn neutral. `RecommendationView` gains a distinct flag for this case (the implementer names it, for example `isFutureDated`), true exactly when the time is more than the skew ahead. `RecommendationCard.astro` shows a clock-error message in place of the "Laboratorium mogło przestać przesyłać dane." paragraph when the flag is set, and `RecommendationForecast.astro` does not label the lab's "today" and "tomorrow" with a future date as "dziś" and "jutro" in that case (the implementer grounds the exact wording against the existing labels). In `period-summary.ts`, `isStale` is true for a time beyond the skew; that view has no component reader besides its badge. The earlier-Warsaw-day rule keeps precedence. `FORECAST_FUTURE_SKEW_MS` (`bill-forecast.ts:19`) keeps its value; the table in item 2 asserts that both are 5 minutes.

#### 2. Cross-surface staleness table

**File**: `src/lib/services/staleness-surfaces.test.ts` (new)

**Intent**: One suite that makes drift between the surfaces' thresholds visible, with expected values written as literals from `docs/logic.md` and not imported from the code.

**Contract**: a table with one row per age-bearing surface (live state via its view mapper, recommendation, today summary, bill forecast). Per row: age exactly at the threshold gives not stale; threshold + 1 ms gives stale (watch, or problem for the live state's 2 h tone); a time exactly 5 minutes ahead is current or kept; 5 minutes + 1 ms ahead is a problem or a refusal (not applicable to the live state: the contract guards `captured_at` against the future only at receipt and within 5 minutes, and the live view has no future guard of its own, so for that row the table instead pins a `captured_at` within the 5-minute skew as current, which is the only future case that can occur); a text generated at 23:59 Warsaw and read at 00:01 reads as another day (recommendation and today summary only). Thresholds are literals: 15 min and 2 h (live state), 2 h (recommendation and today summary), 30 min and 5 min (bill forecast). One extra assertion: the historical-mode recommendation never reports stale or current (`recommendation.test.ts:314-320`). The clock is a fixed ISO string with a CEST/CET comment; no fake timers.

#### 3. Existing tests touched

**File**: `src/lib/services/period-summary.test.ts`, `src/lib/services/recommendation.test.ts`

**Intent**: The one test that pins the old behaviour becomes the new rule, and the shared status helpers get direct tests.

**Contract**: `period-summary.test.ts:254-257` ("shows a text written in the future as current") is rewritten to the 5-minute-skew rule. `recommendation.test.ts` gains direct cases for `ageStatus` (exact 2 h, +1 ms, exactly 5 min ahead, +1 ms beyond) and `earlierDayStatus`, which have no direct test today, and view-level cases for `toRecommendationView` with a future time: the new flag is true beyond the skew and false at exactly 5 minutes, `isStale` is true and `isCurrent` false beyond it, and the findings turn neutral.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the cross-surface table: `npm test`
- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`
- Deliberate break: removing the future-time rule turns the new table and the recommendation tests red (done in the worktree per the implement ritual, then restored)

#### Manual Verification:

- The owner reads the new status wording "czas z przyszłości" on the recommendation and the today card (quoted in the phase commit message) and approves it
- With a recommendation dated about 10 minutes ahead on the local stack, the card shows the "czas z przyszłości" badge and the clock-error message, not the outage message, and its forecast days are not called "dziś" and "jutro"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Money guards and refusal ladder (risk #2)

### Overview

Add the two cheap guards, close the exact-edge gaps in the refusal ladder, render every bill-forecast fixture through the real view model, and pin the two remaining holes as known gaps.

### Changes Required:

#### 1. Two guards in the view model

**File**: `src/lib/services/bill-forecast.ts`

**Intent**: An implausible closed-month amount, and a negative central, low or high, must refuse the figure instead of showing it with a normal status. The closed-month ceiling closes a hole that is reachable through ingest, because the contract has only a sign rule on those amounts and no ceiling (`contract.ts:100-106`). The sign guard is defence in depth: the contract already rejects a negative central, low or high with a 422 (`contract.ts:15, 124-127`), so it only protects a stored row that skipped validation, such as a direct database write. It stays because the view model does not trust stored jsonb. The contract leaves only the settlement and derived-kWh signs to the view model (`docs/decisions.md:69, 92`).

**Contract**: after the "unreadable money" refusal (`:367`) and before the reversed-range check, a sign guard refuses (problem tone, new label and reason in Polish, the same shape as the existing refusals) when central, low or high is below 0. The plausibility ceiling (`MAX_PLAUSIBLE_BILL_PLN`, `:27`, check at `:388`) also applies to `closed_month_check.computed_gross_pln` and `invoice_gross_pln` when readable (read from the body at that position, which needs no reordering): above the ceiling refuses with the existing "nierealna kwota" outcome. The guard order stays fixed. One other outcome changes because the ceiling sits before the day-count refusal (`:431`): a body with fewer than 7 observed days and a closed-month amount above the ceiling now gets "nierealna kwota" instead of "Za mało dni"; a test pins this.

#### 2. Refusal-ladder edges and fixture table

**File**: `src/lib/services/bill-forecast.test.ts`, `src/lib/ingest/bill-forecast-fixtures.test.ts`, `scripts/fixtures/bill-forecast/` (one new synthetic file)

**Intent**: Prove the ladder at its exact edges and prove that every fixture, not just two, produces its documented outcome.

**Contract**: in `bill-forecast.test.ts`: central, low or high at exactly 7000 is shown and at 7000.01 is refused; central alone above the ceiling is refused; a lone unreadable low and a lone unreadable high are refused (only central is covered today, about `:376`); negative central, low and high (table, as inline bodies that bypass the contract by design, named as defence-in-depth cases); closed-month computed alone and invoice alone above the ceiling; fewer than 7 observed days with a closed-month amount above the ceiling (the order change above); the other-month relabel through a real Warsaw rollover (generated 23:58 on the last day of a month, read 00:05 on the 1st) and for a future month, without overriding the month at an in-month clock; a closed-month check with `ok: false` keeps the verdict and status unchanged. Two clearly named known-gap tests pin that a contract-valid, ordered, sub-ceiling body whose central is inconsistent with its own billable kWh, rate and fee, and a central below the fixed fee, still show. In `src/lib/ingest/bill-forecast-fixtures.test.ts`: a table that renders every JSON file in the directory (13 today, plus one new synthetic file: a closed-month amount above the ceiling, which the contract accepts) through the view model at a clock set per file relative to its `generated_at` (the stale fixture needs a clock more than 30 minutes later), against an expected outcome (kind, status tone and reason) listed by hand per file name; a file with no expected entry, or an entry with no file, fails the test, so a new fixture cannot be added unclassified. The existing loop requires every file in the directory to pass the strict contract, so no contract-invalid fixture (such as a negative central) can live there. The new fixture reuses the shape of `lab-shape.json` with invented values only.

#### 3. Hand-computed verdict and delta oracle, and money helpers

**File**: `src/lib/services/bill-forecast.test.ts`, `src/lib/format/values.test.ts` (new)

**Intent**: Prove the figures the card shows against arithmetic done outside the code.

**Contract**: new verdict and delta cases use new synthetic invoice and central values; each case carries the hand arithmetic in a comment derived from `docs/logic.md` (verdict bands at +20%, whole-złoty comparison, delta, 7-day rule, display rounding such as 360.4 shown as "360 zł"), not from running the code. `values.test.ts` covers `asNumber` (NaN, Infinity, numeric strings, null), `asRecord` (arrays, null) and `plnLabel` (rounding at .5, negatives, large values), none of which has a direct test today.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the ladder edges and the fixture table: `npm test`
- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`
- Deliberate break: removing the sign guard, and separately the closed-month ceiling, turns the matching tests red (worktree, then restored)

#### Manual Verification:

- The owner spot-checks two of the hand-computed oracle comments against `docs/logic.md` and agrees the arithmetic is independent of the code

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Boundary gaps (risk #5)

### Overview

Close the untested exact edges and give every day-key and completeness export a direct test. Pure additions, no behaviour change.

### Changes Required:

#### 1. Time-helper and completeness tests

**File**: `src/lib/format/warsaw-time.test.ts`, `src/lib/services/complete-day.test.ts` (new), `src/lib/calendar/period.test.ts`

**Intent**: Pin the day-key and completeness decisions where they could silently shift: midnight in winter and summer, the DST days, and the year boundary.

**Contract**: `warsawParts` and `warsawMonthKey` at winter midnight (22:59:59Z and 23:00:00Z in January) and summer midnight (21:59:59Z and 22:00:00Z in July); `dayKeyToUtcMs` and `utcMsToDayKey` round trips across 2026-03-29, 2026-10-25 and 2026-12-31 to 2027-01-01; `formatDayMonth` and `formatMonth` basics. `complete-day.test.ts` covers `kwh` (null, NaN, negative, zero) and `isCompleteDay` on a normal day, today, the day before today, a future day, and the two DST days. `period.test.ts` covers `isOpenable` directly (a day equal to 2026-07-16, a day equal to today, 2026-07-15 refused) and `adjacent` (both defined in `src/lib/calendar/period.ts`) for months and days across 2026-12 and 2027-01. Expected values are written from the Warsaw offsets (UTC+1 in winter, UTC+2 in summer), not computed with the helper under test.

#### 2. Rating and calendar edges

**File**: `src/lib/services/period-rating.test.ts`, `src/lib/services/calendar-view.test.ts`

**Intent**: Pin the remaining exact edges in the rating and totals rules (`docs/logic.md` rating and calendar sections).

**Contract**: low sun at exactly 70% of the norm PV (not low) beside the existing 13.9 case; `rateMonth` for a month that just ended with today the 1st of the next month, and for 2026-12 with today 2027-01-01; `rateDay` on a DST day with a norm window that spans the change; the 6-versus-7 complete-day gate on the totals operator (`periodTotals` is not exported, so through `buildMonthView` with exactly 6 and exactly 7 complete days; `calendar-view.ts:359-363`; today only 6 versus 31 at `calendar-view.test.ts:312`, which is a `buildQuarterView` test); `buildMonthView` with December completed and today 2027-01-01. One named known-gap test pins the low-sun rounding hazard: PV 13.96 against a norm of 20 is flagged low while the text prints one decimal ("14,0 … 20,0"), so a later fix flips it knowingly.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new boundary cases: `npm test`
- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`
- Deliberate break: changing the `periodTotals` 7-day comparison from `<` to `<=` turns the new 6-versus-7 test red (worktree, then restored)

---

## Phase 4: Docs, cookbook and plan backport

### Overview

Bring the project docs in step with the behaviour changes, fill the test plan's cookbook with the patterns shipped, and backport the research's corrections.

### Changes Required:

#### 1. Project docs

**File**: `docs/logic.md`, `docs/decisions.md`

**Intent**: Per the lessons, a changed rule updates `docs/logic.md` and a decision adds a dated entry.

**Contract**: `docs/logic.md`: state the future-time rule (a generation time more than 5 minutes ahead is a problem, "czas z przyszłości", for the recommendation and the today card, with a clock-error message on the recommendation card in place of the outage warning; the bill forecast already refuses it; the live state has none) where the staleness rules are described; add the two new bill-forecast guards (the ceiling on the closed-month amounts, which changes the outcome for a body with fewer than 7 days; the sign of central, low and high, noting that the contract already rejects negatives and the guard only protects a stored row that skipped validation) to the guard description near the 7000 PLN ceiling; correct three wording drifts the research found (the rating norm is the mean of the two middle values for an even count; the hourly window "35 days" spans 36 calendar dates including today; the usage compared day needs only a load reading and accepts a negative one) and note the 29 February seasonal anchor. `docs/decisions.md`: a dated entry (2026-10-01) with the owner's decisions: future-time alignment, the two guards and the two pinned known gaps, the low-sun rounding left unfixed and pinned, app-side oracle only, and the follow-up to scrub `docs/ingest/example-v1.json`.

#### 2. Test plan cookbook and backport

**File**: `context/foundation/test-plan.md`

**Intent**: Make §6 usable by the next phase and keep §2 truthful.

**Contract**: §6.1 gets the staleness-table file as the reference for an injected-clock, literal-threshold test; §6.5 is filled with the time, boundary and "enough data" pattern (hand-derived expectations in comments, exact edge plus one unit beyond, known-gap tests named as such); §6.6 gets a 2–3 line note on what the phase taught. §2 receives the research corrections (Source wording and Risk Response Guidance cells only, never a file anchor): row #1's guidance mentions the future-time rule, row #2's anti-pattern notes the example-fixture provenance question. §3 Status is updated by the orchestrator, not here.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type check passes: `npx astro check`
- Production build succeeds: `npm run build`
- The docs state the new rules: `/usr/bin/grep -n "czas z przyszłości" docs/logic.md` finds the future-time rule and `/usr/bin/grep -n "mean of the two middle" docs/logic.md` finds the corrected median wording

#### Manual Verification:

- The owner reads `test-plan.md` §6.1 and §6.5 and confirms the patterns are usable for the next rollout phase
- The pull request description lists the `example-v1.json` scrub as a follow-up and the owner agrees

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Cross-surface staleness table (new), co-located extensions in `recommendation`, `period-summary`, `bill-forecast`, `period-rating`, `calendar-view`, `warsaw-time`, `period`, `nav`, plus new `complete-day.test.ts` and `values.test.ts`.
- Edge discipline: for every threshold, the exact edge and one unit beyond (1 ms where the unit allows); both sides of every day and month boundary; DST days and the year boundary.
- Expected values are literals from `docs/logic.md` or hand arithmetic in a comment; the clock is an argument with a CEST/CET comment.

### Integration Tests:

- None in this phase of the test plan. The cross-surface table and the fixture table run the real view mappers on real contract-valid fixtures, which is the closest this layer gets.

### Manual Testing Steps:

1. Read the new "czas z przyszłości" wording in the phase 1 commit message and approve it.
2. Spot-check two oracle comments in `bill-forecast.test.ts` against `docs/logic.md`.
3. Read test-plan §6.1 and §6.5.

## Performance Considerations

Unit tests only; the fixture table reads 15 small JSON files and renders each once. No change to runtime cost; the two new guards are a handful of numeric comparisons.

## Migration Notes

None. No schema, contract or data change. The two behaviour changes are display-only: a future-dated text and an implausible bill figure show a refusal or problem status instead of a normal one.

## References

- Related research: `context/changes/testing-time-and-number-guards/research.md`
- Test plan: `context/foundation/test-plan.md` §2 risks #1, #2, #5; §6
- Reference tests: `src/lib/services/period-summary.test.ts` (injected clock, mock chain, boundary cases), `src/lib/ingest/bill-forecast-fixtures.test.ts:8-24` (fixture loop)
- Rules (oracle sources): `docs/logic.md` (staleness, bill forecast, rating, calendar sections)
- Prior incidents: `docs/decisions.md:91-92`, `context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-2.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cross-surface staleness (risk #1)

#### Automated

- [x] 1.1 Unit tests pass, including the cross-surface table — 1d05696
- [x] 1.2 Linting passes — 1d05696
- [x] 1.3 Type check passes — 1d05696
- [x] 1.4 Production build succeeds — 1d05696
- [x] 1.5 Deliberate break: removing the future-time rule turns the new table and the recommendation tests red — 1d05696

#### Manual

- [x] 1.6 The owner reads the new status wording "czas z przyszłości" on the recommendation and the today card and approves it — 1d05696
- [x] 1.7 With a recommendation dated about 10 minutes ahead on the local stack, the card shows the "czas z przyszłości" badge and the clock-error message, not the outage message, and its forecast days are not called "dziś" and "jutro" — 1d05696

### Phase 2: Money guards and refusal ladder (risk #2)

#### Automated

- [x] 2.1 Unit tests pass, including the ladder edges and the fixture table — 6bdc785
- [x] 2.2 Linting passes — 6bdc785
- [x] 2.3 Type check passes — 6bdc785
- [x] 2.4 Production build succeeds — 6bdc785
- [x] 2.5 Deliberate break: removing the sign guard, and separately the closed-month ceiling, turns the matching tests red — 6bdc785

#### Manual

- [x] 2.6 The owner spot-checks two of the hand-computed oracle comments against docs/logic.md and agrees the arithmetic is independent of the code — 6bdc785

### Phase 3: Boundary gaps (risk #5)

#### Automated

- [x] 3.1 Unit tests pass, including the new boundary cases — 2bfb89c
- [x] 3.2 Linting passes — 2bfb89c
- [x] 3.3 Type check passes — 2bfb89c
- [x] 3.4 Production build succeeds — 2bfb89c
- [x] 3.5 Deliberate break: changing the periodTotals 7-day comparison from < to <= turns the new 6-versus-7 test red — 2bfb89c

### Phase 4: Docs, cookbook and plan backport

#### Automated

- [x] 4.1 Unit tests pass — 81215a6
- [x] 4.2 Linting passes — 81215a6
- [x] 4.3 Type check passes — 81215a6
- [x] 4.4 Production build succeeds — 81215a6
- [x] 4.5 The docs state the new rules — 81215a6

#### Manual

- [x] 4.6 The owner reads test-plan.md §6.1 and §6.5 and confirms the patterns are usable for the next rollout phase — 81215a6
- [x] 4.7 The pull request description lists the example-v1.json scrub as a follow-up and the owner agrees — 81215a6
