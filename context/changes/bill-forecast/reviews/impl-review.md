<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bill forecast

- **Plan**: context/changes/bill-forecast/plan.md
- **Scope**: Phases 1-4 (Phase 5 is only partly done, see below)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-29

> Triage complete 2026-09-29: F1-F9 fixed.

- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Plan adherence: every planned change in phases 1-4 is present (contract, view and loader, mapper, card, glossary, dashboard wiring, smoke, docs); all "Decisions already taken" and "What We're NOT Doing" are honoured; the phase 1 review fixes (8e05eb0) are applied. Extra, benign: two mapper refusals added in e39f6c8 (central estimate outside its range; `generated_at` more than 5 minutes ahead) and the phase 5 contract widening (0f7771d). Phase 5 evidence: 5.1, 5.2, 5.3, 5.8 done; 5.4-5.7 are manual and open, so Phase 5 is not judged complete. Automated: `npm test` 499 passed, `npm run lint` clean, `npx astro check` 0/0/0. In production `public.bill_forecast` grants only `authenticated: SELECT` (nothing for anon or public).

## Findings

### F1 — A negative derived kWh figure from the lab can 422 the whole push

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/ingest/contract.ts:99, 105-107 (`projected_import_kwh`, `projected_credit_kwh`, `projected_billable_kwh`, `credit_left_kwh`)
- **Detail**: The comment above the section and docs/decisions.md say sign problems in the settlement block must not 422 the push, and `settlement` is permissive for that reason. But the derived kWh fields are `nonNegative` in zod. The lab has been seen sending a negative `reference_feed_in_kwh`, which gives a negative `export_ratio`; docs/logic.md defines credit as 0.8 × export ratio × import, so `projected_credit_kwh` can go negative as well and the whole push is rejected. Live state and the recommendation then stop until the lab is fixed, and the mapper's sign guard never runs because the body is never stored.
- **Fix A ⭐ Recommended**: Loosen the derived kWh fields to `z.number()` and add sign guards for them in the mapper (refusal, like the settlement guard), with a fixture and a contract test pinning it.
  - Strength: matches the documented split (shape in zod, sign in the mapper) and removes the one path where a sensor glitch stops all pushes.
  - Tradeoff: a wider contract; the guard must cover each field.
  - Confidence: MED — depends on whether the lab already clamps these fields.
  - Blind spot: not verified against the lab script's clamping.
- **Fix B**: Keep the contract and confirm the lab clamps these fields, documenting that in prerequisites.
  - Strength: no contract change.
  - Tradeoff: the 422 risk stays and rests on lab behaviour.
  - Confidence: LOW.
  - Blind spot: lab clamping unread.
- **Decision**: FIXED (Fix A: derived kWh fields loosened in zod, negative or non-finite refused in the mapper; fixture and tests added)

### F2 — A stale or wrong-month `no_data` body is shown as current

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/bill-forecast.ts:232-240 (before the freshness checks at 250-272)
- **Detail**: The `no_data` branch returns before the `generated_at`, future-skew and month checks, although `no_data` bodies carry `generated_at` and `month`. If the lab stops recomputing while its last file is kept (the case impl-review-phase-2 names), a last `rates_unavailable` or `no_complete_days` body from the start of a month keeps showing "Miesiąc dopiero się zaczął" for weeks with no stale marker.
- **Fix**: Run the freshness and month checks for both statuses before branching, and add a test with a stale `no_data` body.
- **Decision**: FIXED (freshness checks now run before the no_data branch; wrong-month check stays for ok bodies)

### F3 — `completed_days_used` is never cross-checked against `observed_days`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/bill-forecast.ts:216-221, 322-323; src/lib/ingest/contract.ts:88-97
- **Detail**: The 7-day gate reads only `completed_days_used`, the day label derives from `observed_days`. The phase 1 review (F4, Fix A) left the count cross-check to the phase 3 mapper and the mapper does not do it: a body with `completed_days_used: 20` and 3 observed days passes the gate.
- **Fix**: Take the count from `observed_days.length` (or refuse on a mismatch) and add a test.
- **Decision**: FIXED (day count taken from observed_days when it is an array)

### F4 — The lab-shape gate is synthetic and manual, and the 422 risk is thinly documented

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/lib/ingest/bill-forecast-fixtures.test.ts:25-29; docs/ingest/README.md:23; docs/prerequisites.md (S-07)
- **Detail**: The fixture test guards a hand-maintained copy of the lab's shape, and the "refresh it when the lab output changes" note lives only in the test file. A new lab key (a top-level `notes`, or a key inside `settlement`) deployed without touching the fixture keeps the test green while production returns 422 for every push.
- **Fix**: Add one sentence to docs/prerequisites.md (S-07) and the ingest README that any change to the forecast file's keys needs a contract change deployed first; consider a check in the lab script's own tests that parses its real output against `docs/ingest/contract-v1.schema.json`.
- **Decision**: FIXED (sentence in prerequisites S-07 and the ingest README; comment in the fixtures test)

### F5 — Three small mapper defensiveness gaps

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/bill-forecast.ts:233, 216-221, 333
- **Detail**: (a) `NO_DATA[body.reason]` indexes a plain object, so a `reason` of "constructor" or "**proto**" builds `unavailable(undefined, ...)` (the contract's enum blocks it today). (b) `dayLabelOf` passes any string `date` to `formatPeriod` without the `DAY_KEY` regex, and an invalid one makes `formatDayMonth` throw a RangeError (whole card shows a load error). (c) A present but non-object `closed_month_check` (null or a string) renders a bogus "Sprawdzenie … (—)" line.
- **Fix**: (a) `Object.hasOwn`; (b) filter dates with `DAY_KEY` and fall back to the day count; (c) treat a non-object value as absent. One test each.
- **Decision**: FIXED (Object.hasOwn, DAY_KEY filter with a 31 cap, non-object closed_month_check treated as absent)

### F6 — Verdict is computed on unrounded values but shown in whole złoty

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/bill-forecast.ts:199-212
- **Detail**: Central 214.9 against an invoice of 214.66 shows "ok. 215 zł" and "do 20% powyżej ostatniego rachunku (215 zł)": the same number on both sides of "powyżej". No test for it.
- **Fix**: Compare the rounded values, or word the watch band so equal-looking amounts do not read as a contradiction; add a test.
- **Decision**: FIXED (the 'good' line compares whole-zloty-rounded values; +20% line stays exact)

### F7 — Awkward lag badge when the reference period is unreadable

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/bill-forecast.ts:191-193
- **Detail**: With an unreadable `reference_period` the badge reads "rozliczenie za —, nie za ostatni miesiąc"; `reference_lag_months` is unbounded in the card's "o N mies." sentence. No mapper test for `reference_lag_months`, or for a lagging body that still gets its verdict.
- **Fix**: Omit the detail when the month label is missing and add the two tests.
- **Decision**: FIXED (lag detail omitted for an unreadable month, lag capped at 12 for display; tests added)

### F8 — No smoke or regression check for the view

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:164-200
- **Detail**: There are anon-read checks for `ingest_pushes`, `recommendations`, `live_state` and `daily_energy`, but none for `bill_forecast`, and nothing exercises the SQL rule that a push without the section leaves the last forecast in place (the loader test mocks the query).
- **Fix**: Add an "anon cannot read bill forecast directly" step to the smoke test.
- **Decision**: FIXED (smoke step: anon cannot read bill forecast directly, runs in CI)

### F9 — Bookkeeping: phase 4 rows without SHA and unrecorded additions

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/bill-forecast/plan.md:495-506; docs/logic.md:143-147; src/components/BillForecastCard.astro:80
- **Detail**: Rows 4.1-4.9 are ticked without a commit SHA (the 68d7956 diff backs them; no false tick found; manual rows 4.5-4.9 cannot be evidenced from the diff). The two refusals added in e39f6c8 are not in the plan's mapper list and only partly in docs/logic.md. The central figure reads "najbardziej prawdopodobnie ok. 258 zł" where the plan said "ok. 258 zł" (wording only).
- **Fix**: Append `— 68d7956` to rows 4.1-4.9 and add the two refusals to docs/logic.md and the plan's mapper notes.
- **Decision**: FIXED (68d7956 appended to rows 4.1-4.9; the e39f6c8 refusals were already in docs/logic.md)
