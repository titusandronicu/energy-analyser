# Time and number guards (test plan Phase 1) — Plan Brief

> Full plan: `context/changes/testing-time-and-number-guards/plan.md`
> Research: `context/changes/testing-time-and-number-guards/research.md`

## What & Why

Rollout Phase 1 of the test plan, for three risks: stale data shown as fresh (#1), a wrong money figure shown with a normal status (#2), and day, month and "enough data" decisions wrong at the boundary (#5). The tests sit at the cheapest layer (unit and contract, injected clock) and take their expected values from `docs/logic.md` or hand arithmetic, never from the code under test. Two small behaviour changes close holes that tests alone cannot prove.

## Starting Point

Most thresholds already have exact-edge unit tests; what is missing is narrow and named by the research. Three things are real gaps: a future-dated recommendation or narration time reads "aktualna" (the bill forecast refuses it); the bill forecast's 7000 PLN ceiling skips the closed-month amounts, which the contract also does not bound (its sign check on central, low and high is already enforced at ingest, so the view-level sign guard is defence in depth only); and 11 of 13 bill-forecast fixtures are only parsed, not rendered. `docs/ingest/example-v1.json` is described in a test as "the real September body", so it is treated as real data.

## Desired End State

One cross-surface suite proves each age-bearing surface at its exact edge, one millisecond over, a future time and the earlier-day case, with thresholds as literals. A time more than 5 minutes ahead reads as a problem ("czas z przyszłości"). The bill forecast refuses negative figures and implausible closed-month amounts, every fixture is rendered against a hand-listed outcome, and two remaining holes are pinned as named known gaps. The untested boundary edges are covered and every export that decides a day key, staleness or a money label has a direct test.

## Key Decisions Made

| Decision            | Choice                                                                                                                                                                                                  | Why (1 sentence)                                                                                                  | Source                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------- |
| Fixture provenance  | Treat `example-v1.json` as real; new fixtures fully synthetic; scrubbing it is a separate change                                                                                                        | Public repo and the synthetic-values-only rule                                                                    | Owner (Q1)            |
| Future-dated times  | More than 5 min ahead is a problem, "czas z przyszłości", for recommendation and today card; exactly 5 min stays current                                                                                | Matches the bill forecast and the risk's goal that nothing with a broken clock reads current                      | Owner (Q2)            |
| Future-time copy    | The recommendation card shows a clock-error message instead of the outage warning, and its forecast days are not called "dziś"                                                                          | A clock error is not an outage; otherwise the card contradicts its own badge                                      | Owner (review F3)     |
| Money guards        | Extend the ceiling to closed-month amounts and add a sign check on central, low, high, kept as defence in depth because ingest already rejects negatives; pin lower bound and consistency as known gaps | The ceiling closes a reachable hole; the sign check protects stored rows; no re-implementation of the lab's model | Owner (Q3, review F2) |
| Oracle              | App-side only: verdict bands, delta, ceiling, 7-day rule, display rounding, derived by hand                                                                                                             | Tests what the app does, independent of the code                                                                  | Owner (Q4)            |
| Organisation        | Extend co-located test files plus one cross-surface staleness table                                                                                                                                     | Keeps tests next to code and makes drift between surfaces visible                                                 | Owner (Q5)            |
| Thresholds in tests | Written as literals from `docs/logic.md`, not imported                                                                                                                                                  | Avoids the oracle problem                                                                                         | Research              |
| Low-sun rounding    | Pinned as a known gap, not fixed                                                                                                                                                                        | Not chosen as a behaviour change; flips knowingly later                                                           | Plan default          |
| Future tolerance    | Reuse the bill forecast's 5 minutes                                                                                                                                                                     | One consistent edge across surfaces                                                                               | Plan default          |

## Scope

**In scope:** the cross-surface staleness table, the future-time rule, two bill-forecast guards, the fixture table and one new synthetic fixture, boundary gap tests, direct tests for untested exports, docs and test-plan §6 and §2 backport.

**Out of scope:** integration and browser tests, editing `example-v1.json`, the lab's formulas as an oracle, a lower bound and a consistency guard, the low-sun rounding fix, contract and migration changes, component tests (the one card copy change is a manual check), new CI steps, coverage thresholds.

## Architecture / Approach

Fresh branch from `main`. Each behaviour change lands test-first: write the failing test from the independent oracle, make the smallest change that turns it green, then break the guard in the worktree to confirm the test protects it. The staleness suite goes through each surface's own view mapper; the fixture table goes through the real bill-forecast mapper on contract-valid synthetic files.

## Phases at a Glance

| Phase                              | What it delivers                                                                         | Key risk                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1. Cross-surface staleness         | Future-time rule with its card copy, one table across four surfaces, shared helper tests | Changes two cards' behaviour (one with a component edit); the old pinning test must be rewritten                 |
| 2. Money guards and refusal ladder | Two guards, ladder edges, fixture table, hand-computed oracle, known-gap tests           | A guard that refuses a legitimate figure; the ceiling also changes the outcome for a body with fewer than 7 days |
| 3. Boundary gaps                   | Edge tests for day keys, DST, year end, rating and totals; tests for untested exports    | Expected values accidentally derived from the code                                                               |
| 4. Docs, cookbook, plan backport   | `logic.md`, `decisions.md`, test-plan §6 and §2                                          | Docs drifting from the behaviour just shipped                                                                    |

**Prerequisites:** none outside the repo (pure unit tests, no lab data, no Supabase). Start from a fresh branch off `main`.
**Estimated effort:** about 3-4 sessions across 4 phases.

## Open Risks & Assumptions

- `example-v1.json` stays in the repo with possibly real figures until its separate scrub; this change does not widen the exposure.
- Pinning the two known gaps documents a hole as passing behaviour; the tests are named so they are noticed when a guard is added later.
- The sign guard cannot fire through ingest (the contract rejects negatives); its tests use inline bodies, not fixture files, because every fixture file must pass the contract.
- The live state has no future-time guard; the plan pins only the within-skew case and leaves the rest to the contract's check at receipt.
- The research did not read `contract.test.ts` beyond a grep, parts of `period-rating.test.ts`, or the page loaders; the plan re-checks what it relies on at implementation time.
- A future-time rule on the recommendation could hide a legitimate recommendation if the lab's clock is more than 5 minutes ahead; that is the intended trade.

## Success Criteria (Summary)

- A time more than 5 minutes ahead never reads as current on the recommendation or the today card, and the table proves every age-bearing surface at its exact edge.
- A negative or implausible bill figure is refused, and every bill-forecast fixture renders to its documented outcome.
- Each new behavioural test goes red when its guard or rule is removed, and the boundary edges named by the research are covered.
