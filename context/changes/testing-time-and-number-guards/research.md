---
date: 2026-10-01T16:23:14+02:00
researcher: Claude (Sonnet 5.5) for the owner
git_commit: 3a83fe6f046928ced953799912216fb7b1f58bc7
branch: archive-period-summaries
repository: energy-analyser
topic: "Rollout Phase 1 'Time and number guards' of the test plan: how risks #1 (stale shown as fresh), #2 (wrong money figure) and #5 (day, month and 'enough data' boundaries) are guarded today, what is already tested, and where the plan's response guidance needs correcting"
tags: [research, codebase, testing, staleness, bill-forecast, period-rating, boundaries]
status: complete
last_updated: 2026-10-01
last_updated_by: Claude (Sonnet 5.5) for the owner
---

# Research: Time and number guards (test plan Phase 1)

**Date**: 2026-10-01T16:23:14+02:00
**Researcher**: Claude (Sonnet 5.5) for the owner
**Git Commit**: 3a83fe6f046928ced953799912216fb7b1f58bc7
**Branch**: archive-period-summaries
**Repository**: energy-analyser

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` for risks #1, #2 and #5: for each risk, find where the real failure path lives, verify or correct the plan's response guidance, locate the existing tests, name the cheapest useful layer, and flag speculative risks or misleading hot-spot evidence.

## Summary

- **Phase 1 is mostly gap-filling, not greenfield.** For the inspected surfaces and rules, most thresholds already have exact-edge unit tests (details below). The untested set is narrow and named in "Gaps" per risk.
- **Risk #1 (stale shown as fresh).** The eight surface rows below use different timestamps (push `captured_at`, the recommendation's `generated_at`, the summary's `narration_generated_at` or `built_at`, the forecast body's `generated_at`) and age thresholds of 15 minutes, 2 hours and 30 minutes; the table lists each with its test. One real behaviour gap: a future-dated recommendation or narration time reads as "aktualna" (`recommendation.ts:112-115` has no guard for a negative age), while the bill forecast refuses a time more than 5 minutes ahead (`bill-forecast.ts:333`). The plan's "badge and shown time use the same timestamp" holds on the live card, the recommendation card and the today summary card; the bill forecast card shows no time at all.
- **Risk #2 (wrong money figure).** The app displays lab-computed figures and does not re-price (`docs/logic.md:250`). On the inspected bill-forecast path the view model applies 16 distinct guards, after the contract's own checks (listed below). Four holes remain where a contract-valid, wrong figure can show: no view-level sign check on central, low or high; no lower plausibility bound; the 7000 PLN ceiling does not cover the closed-month amounts; and no internal consistency check between central, billable kWh, rate and fee. Of 13 bill-forecast fixture files, 2 are rendered through the view model; 11 are only parsed against the contract.
- **Risk #5 (boundaries).** Of the 21 rules compared (docs/logic.md against code), 20 were checked in code and none of those 20 has a constant that disagrees; the sparkline minimum-points rule was not read. The weaknesses are missing exact-edge tests, three wording drifts in the docs, and one rounding hazard in the rating's low-sun text.
- **Fixture provenance needs the owner.** `bill-forecast.test.ts:45` calls `docs/ingest/example-v1.json` "the real September body", and its bill figures (549 kWh, export ratio 0.809, invoice 214.66) match the household figures quoted in `docs/logic.md`. This conflicts with the plan's synthetic-values-only rule and needs confirmation before any new fixture copies it.
- **Cheapest layer.** Unit tests with an injected clock are the right layer for all three risks. This inspected suite never uses fake timers, `Date.now()` or a TZ setting; every service takes `now` or `today` as a parameter.

## Detailed Findings

### Risk #1 — stale data shown as current

Inspected set: live-state, recommendation, bill-forecast, usage-insight, hourly-usage, period-summary, calendar-data, status, warsaw-time, `dashboard.astro`, the today card, and the two SQL views.

| Surface                          | Timestamp used                                                                   | Threshold and operator                                                                | Exact-edge test                                                        |
| -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Live state                       | push `captured_at` (view takes the newest push, no section filter)               | `ageMs > 15 min` (`live-state.ts:13, 389`); `> 2 h` for the problem tone (`:15, 351`) | `live-state.test.ts:159-164` (15 min exact and +1 s), `:170-171` (2 h) |
| Live home verdict, daily row lag | live capture minus the daily row's `captured_at`                                 | `> 15 min` (`live-state.ts:55, 310`)                                                  | `live-state.test.ts:612-619`                                           |
| Recommendation                   | the recommendation's own `generated_at`                                          | `> 2 h` or an earlier Warsaw day (`recommendation.ts:9, 96, 102`)                     | `recommendation.test.ts:35-40, 102-105, 139-145`                       |
| Today summary card               | `narration_generated_at`, falling back to `built_at` (`period-summary.ts:81-88`) | `> 2 h` (reuses `STALE_AFTER_MS`) or `period` before today's Warsaw day               | `period-summary.test.ts:177-188` (exact and +1 ms), `:231-246`         |
| Bill forecast                    | the body's own `generated_at`, not the push time (`bill-forecast.ts:10-15, 324`) | `> 30 min`; future skew `> 5 min`                                                     | `bill-forecast.test.ts:228-236, 245-253`                               |
| Usage insight                    | no age rule; "today" from the Warsaw day key; look back at most 7 days           | offset `<= 7` (`usage-insight.ts:17, 228`)                                            | `usage-insight.test.ts:122, 127`                                       |
| Hourly usage                     | `hour_start`; only complete hours before `now`                                   | window 35 days; no stale flag exists                                                  | none needed for age                                                    |
| History calendar advice          | the recommendation's `generated_at`, historical mode (no stale flag)             | none                                                                                  | `recommendation.test.ts:314-320`                                       |

- **Boundary offsets.** Of the surfaces above, only the today summary card tests +1 ms; the others test +1 s (`period-summary.test.ts:177-188` versus `live-state.test.ts:159-164`).
- **Stale section inside a fresh push.** The bill forecast is judged by its own `generated_at` (`bill-forecast.ts:340`; the incident is recorded in `docs/decisions.md:91`). The `bill_forecast` view picks the newest push carrying the key (`20260929101530_bill_forecast_view.sql:18`). The recommendation and the period summaries live in their own tables ordered by their own timestamps, and summaries upsert only `where built_at <= excluded.built_at` (`20261001094118_period_summaries.sql:143`). The live view takes the newest push with no section filter (`20260925123751_live_state_view.sql:19-22`), and only the daily-row lag has a guard (`live-state.ts:310`). No integration test of these views was found in the inspected set (the unit tests, not `scripts/`).
- **Future-dated times.** The ingest contract guards only the top-level `captured_at` against the future (`contract.ts:252-259`); `recommendation.generated_at` and `narration.generated_at` are not checked. `ageStatus` returns good for a negative age (`recommendation.ts:112-115`), and `period-summary.test.ts:254-257` pins "written in the future shows as current". No recommendation test covers a future time.
- **Smaller drift.** The "15 minut" text is hardcoded in `LiveStateCard.astro:93` and not derived from `LIVE_STALE_AFTER_MS`. `now` is fixed once per request (`dashboard.astro:18`) and the page reloads every 5 minutes while visible (`:80-91`), so an open tab can read current up to about 5 minutes past a threshold. For the today card, the earlier-day branch uses `row.period` while the age uses `narration_generated_at`; the earlier-day branch wins (`period-summary.ts:124`).

### Risk #2 — wrong money figure

Inspected set: `bill-forecast.ts`, `bill-forecast.test.ts`, `bill-forecast-fixtures.test.ts`, `contract.ts:94-183, 214-263`, `period-rating.ts`, `usage-insight.ts`, `docs/logic.md:226-267`.

- **Contract versus view model.** The contract owns shape, the sign of PLN figures, date uniqueness and the 31-day cap (`contract.ts:107-182`); it deliberately has no ceiling, no ordering, no sign check on settlement or derived kWh, and no staleness rule (`contract.ts:100-106`, accepted by `contract.test.ts:176-200`). The view model owns staleness, ordering, the ceiling, kWh and settlement sign, the day count and the other-month relabel (`bill-forecast.ts:314-450`).
- **View-model guards on the bill-forecast path (16), with tests.** Staleness and future skew are covered above. Boundary-tested: central at exactly low and high (`bill-forecast.test.ts:335`), 6 versus 7 days (`:262, :278`), verdict edges (`:285, :306`). Thin: the 7000 ceiling is tested only with high 9500 (`:321`), not at exactly 7000 or 7000.01, and not with central alone above it; unreadable low or high is untested (only central, `:375`); the other-month case is tested by overriding the month at an in-month clock (`:496`), not through a real Warsaw midnight rollover, and not for a future month; a closed-month check with `ok: false` has no card-level test.
- **Holes where a wrong figure can still show.** Inspected path only, `bill-forecast.ts:367-394, 442-463`: central, low and high have no view-level negative check (the contract's non-negative rule is the only barrier); no lower bound exists, so a central below the 44.62 PLN fixed fee passes; the ceiling does not cover `computed_gross_pln` or `invoice_gross_pln` of the closed-month check, and an inflated invoice would flip the verdict to good; no check ties central to billable kWh × rate + fee, observed days to the daily average, or projected import to days in month × mean. Staleness is judged only on the body's `generated_at`, so fresh time on stale content is undetectable.
- **Oracle.** The projection formulas live in the lab; `docs/logic.md:232-244` states them (import = mean complete-day import × days in month; credit = 0.8 × ratio × import + carried; bill = billable × 1.0991 + 44.62; range from the quadrature rule). The app-side oracle is simpler and sufficient: verdict bands (`docs/logic.md:255-258`), delta, the ceiling and the 7-day rule. Prose gives the range as 155–361 where the card shows 360 (the fixture holds 360.4), so a rounding rule must be explicit.
- **Ratings (money-adjacent).** `period-rating.ts` rates a day only for a complete, consistent day with at least 7 norm days in the previous 14, with bands at ±10 points where exactly ±10 is neutral (`:126-130, 183-200`); a month needs 7 rated days (`:254`). Tests: `period-rating.test.ts:222-233, 241, 250, 350, 377`.
- **Fixtures.** `scripts/fixtures/bill-forecast/` holds 13 JSON files; all are parsed against the strict contract (`bill-forecast-fixtures.test.ts:19`), but only `negative-derived-kwh` (`:26`) and `lab-shape` (`:50`) are rendered through the view model there. `lab-shape.json` is documented as synthetic (`:35`). The example body is the open provenance question above.

### Risk #5 — day, month and "enough data" boundaries

Inspected set: all of `docs/logic.md`, `warsaw-time.ts`, `calendar/period.ts`, `nav.ts`, `complete-day.ts`, `period-rating.ts`, `daily-series.ts`, `grid-sensor.ts`, `calendar-data.ts`, `calendar-view.ts`, `usage-insight.ts`, `hourly-usage.ts`.

- **Day key.** `warsawParts(date).dayKey` (`warsaw-time.ts:18-28`) is the single source; day arithmetic runs in UTC on date strings (`:34-49`), so DST cannot shift it; instant ranges use `warsawDayHours` (23, 24 or 25 hours, `:100`).
- **Rules versus code.** The 20 rules checked in code agree with the docs (the 21st, the sparkline minimum, was not read). Key constants with exact-edge tests: openable window from 2026-07-16 (`period.ts:75`, `period.test.ts:66-82`), 7 complete days for default month (`period.ts:109`, `:85`), rating window 14 and norm 7 (`period-rating.ts:25, 191`, `period-rating.test.ts:250-262`), sensor-change window (`period-rating.test.ts:291-312`), usage fallbacks 7, 20 and 30 days (`usage-insight.test.ts:122-180`), verdict edges ±15% and +40% (`:231-262`), hourly 10-of-12 samples (`hourly-usage.test.ts:86`), DST hour counts (`:109-135`).
- **Untested exact edges (inspected tests only).** Low-sun at exactly 70% (only 13.9 versus 14 at `period-rating.test.ts:241-247`); the 6-versus-7 operator in `periodTotals` (`calendar-view.ts:363`, only 6 versus 31 at `calendar-view.test.ts:312`); `rateMonth` with today the 1st of the next month; any day-level rule on the DST days 2026-03-29 and 2026-10-25; a direct `warsawParts` test at a winter (UTC+1) midnight; `adjacent` for months and days across 2026-12 to 2027-01.
- **Rounding hazard.** The low-sun rule compares unrounded PV but prints one decimal (`period-rating.ts:212, 216`), so PV 13.96 against a norm of 20 reads "14,0 … 20,0" while flagged low; the usage insight handles the same hazard with dedicated edge labels.
- **Docs wording drift (code and docs agree on numbers).** The rating norm is called "median" but takes the mean of the two middle values for an even count (`usage-insight.ts:94`, pinned at `period-rating.test.ts:377`); the hourly window "35 days" spans 36 calendar dates (`hourly-usage.ts:86`); the usage "complete day" requires only a load and accepts a negative one (`usage-insight.ts:224`); the Feb 29 seasonal anchor is undocumented (`usage-insight.ts:81`, tested at `usage-insight.test.ts:223`).
- **Ties.** Hour and day rankings send equal values to the more recent, documented and tested (`hourly-usage.ts:168-178`, `hourly-usage.test.ts:218`). Day advice with two identical `generated_at` follows input order and the docs are silent (`calendar-view.ts:591-598`).

### Test conventions to follow

- Tests sit next to the unit as `<module>.test.ts`, import from `vitest` and the `@/` alias, grouped by exported function (`recommendation.test.ts:38, 63`). `vitest.config.ts` includes only `src/**/*.test.ts`, so a new suite must live under `src` and use that name.
- The clock is an argument with a fixed ISO string and a CEST/CET comment (`live-state.test.ts:28`, `period-summary.test.ts:52`); factories are `row(overrides)`; the Supabase mock chain records arguments and ends in `overrideTypes` and is copied per file (`calendar-data.test.ts:17-31`); table-driven tests use `it.each` in 14 files; the header `// All data here is synthetic.` is used.
- Fixtures are validated by `readdirSync` plus `it.each` through `ingestPayloadV1.safeParse` (`bill-forecast-fixtures.test.ts:8-24`); the contract test pins schema drift (`contract.test.ts:60-64`). No test in the inspected set uses the wall clock or a TZ setting.
- Exports with no direct unit test (name-mention check over the services, format and calendar files; a weak proxy, some are covered indirectly): `warsawParts`, `formatWarsawDateTime`, `dayKeyToUtcMs`, `utcMsToDayKey`, `formatDayMonth`, `formatMonth`, `warsawMonthKey`, `verdictTone`, `earlierDayStatus`, `ageStatus`, `kwh`, `isOpenable`, `plnLabel`, `asNumber`, `asRecord`, `referenceUsageSentence`.

## Code References

- `src/lib/services/live-state.ts:13, 15, 55, 310, 351, 389` — 15 min, 2 h and daily-row lag rules
- `src/lib/services/recommendation.ts:9, 96, 102, 107-115` — 2 h rule, earlier-day rule, `earlierDayStatus`, `ageStatus` (no future guard)
- `src/lib/services/bill-forecast.ts:314-463` — the guard ladder; `:27` ceiling; `:333` future skew; `:340` staleness
- `src/lib/ingest/contract.ts:100-182, 252-259` — what the contract does and deliberately does not check
- `src/lib/services/period-rating.ts:126-130, 183-200, 212, 243, 254` — bands, norm, low sun, month rules
- `src/lib/services/period-summary.ts:81-88, 124, 143` — today card staleness and the shared timestamp
- `src/lib/format/warsaw-time.ts:18-49, 100` — day key, UTC day arithmetic, 23/24/25-hour days
- `docs/logic.md:232-258` — projection formulas and verdict bands (oracle source)

## Architecture Insights

- Every service takes `now` or `today` as a parameter, so injected-clock unit tests are the existing convention and need no fake timers; production reads the real clock only at the pages (`dashboard.astro:18`, `history.astro:55`) and two API routes (`api/notes.ts:15`, `api/ingest.ts:26`).
- Validation is deliberately split: shape and money sign in the contract so a 422 does not stop live state, plausibility in the view model (`docs/decisions.md:92`). Any new test for #2 must name which side owns the guard.
- Staleness is judged against each section's own timestamp, never the push's, for the bill forecast, the recommendation and the summaries; only live state uses the push time.

## Historical Context (from prior changes)

- `docs/decisions.md:91` — a stale forecast inside a fresh push stayed `status: "ok"` at 2.4× the right figure; the `stale-generated-at` fixture and `bill-forecast.test.ts:228-236` now pin it.
- `docs/decisions.md:77` — a false "good" consumption verdict from an old daily row; pinned by `live-state.test.ts:612-619`.
- `docs/decisions.md:92` and `context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-2.md` — a negative feed-in gave a 41M PLN range end; a missing per-day clamp gave 7992 PLN; the ceiling and sign checks sit in the view model.
- `context/archive/2026-09-26-usage-norm-scale/reviews/impl-review.md` F1 — rounded kWh against range edges; guarded in the usage insight, not in the rating's low-sun text (see above).
- `context/archive/2026-09-30-period-ratings/reviews/impl-review.md` F1 — a "synthetic" fixture that matched production figures; the same provenance concern now applies to the bill-forecast example.
- `context/archive/2026-10-01-period-summaries/reviews/impl-review.md` F3 and F4 — future-dated period and malformed dates, fixed for the summaries, still open for the recommendation.
- `context/archive/2026-09-30-history-backfill/reviews/impl-review.md` F3 — a wall-clock test flake at Warsaw midnight (lab Python, out of scope).

## Related Research

- `context/archive/2026-09-29-live-flow-interaction/research.md` — live-state staleness and the 15-minute rule.
- `context/archive/2026-09-27-bill-forecast/plan.md` — the bill forecast view and its guards.

## Open Questions

1. **Is `docs/ingest/example-v1.json`'s bill forecast real household data?** `bill-forecast.test.ts:45` says "the real September body". If so, it is already in the public repository, and Phase 1 must not copy its values into new fixtures. Owner to confirm.
2. **Policy for a future-dated recommendation or narration time.** Today it reads "aktualna"; the bill forecast refuses it. Phase 1 can either pin the current behaviour or align it. That is a product decision, and the plan should settle it before tests assert either.
3. **Should Phase 1 add view-level guards** (sign of central, low, high; a lower bound; the ceiling on the closed-month amounts; a consistency check)? Tests alone cannot prove protection that does not exist. Owner to decide between "pin current behaviour and record the holes" and "add guards".
4. **Scope of the money oracle.** App-side oracle (verdict bands, delta, ceiling, 7 days) or also the lab's projection formulas, which the app never executes.
5. **Not read by this research:** `contract.test.ts` beyond a grep, `period-rating.test.ts:1-214` and `:285-398`, the fixture JSON bodies, `LiveFlow.tsx` and `BillForecastCard.astro` beyond a grep, and the page loaders. Planning should re-check anything it relies on in those.
