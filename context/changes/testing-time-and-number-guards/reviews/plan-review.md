<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Time and number guards (test plan Phase 1)

- **Plan**: context/changes/testing-time-and-number-guards/plan.md
- **Mode**: Deep
- **Date**: 2026-10-01
- **Verdict**: REVISE (all findings resolved in the plan; verdict after fixes: SOUND)
- **Findings**: 1 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

20/21 paths ✓ (1 wrong: the fixtures test lives under `src/lib/ingest/`), 11/11 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (19 rows, one per criterion before the fixes; 20 after F3 added a manual row). A verification agent confirmed the consumers of the stale flag, the contract's sign rules, the guard order in `bill-forecast.ts`, the public mapper signatures and the blast radius of the changed helpers.

## Findings

### F1 — Phase 2's fixture work has a wrong path and an impossible fixture

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 (and Current State Analysis)
- **Detail**: The plan placed the fixture table in `src/lib/services/bill-forecast-fixtures.test.ts`, which does not exist (the file is `src/lib/ingest/bill-forecast-fixtures.test.ts`). It also added a "negative central" fixture file, but that test's loop requires every JSON file in the directory to pass the strict ingest contract, which rejects negative money (`nonNegative`, `contract.ts:15, 124-127, 157-158`). The Current State also said the contract leaves these signs to the view model; for money the contract comment says the opposite.
- **Fix**: Correct the path, cover negative central, low and high as inline bodies in `bill-forecast.test.ts`, keep only the closed-month-above-ceiling fixture, and fix the Current State wording.
- **Decision**: FIXED — path corrected, negative-central fixture file dropped (inline bodies instead), one new fixture, Current State and Phase 2 Intent reworded

### F2 — The sign guard can't fire through ingest

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1; the owner's decision on guards
- **Detail**: The contract already rejects a negative central, low or high with a 422, so the new sign guard protects only a stored row that skipped validation.
- **Fix A ⭐ Recommended**: Keep the guard as defence in depth and say so in the plan, test names and docs
  - Strength: A few lines; matches the view model's stance of not trusting stored jsonb.
  - Tradeoff: Code with no reachable path through ingest.
  - Confidence: HIGH — the contract comment and rules confirm the unreachability.
  - Blind spot: Whether any row predates the contract's non-negative rule is unverified.
- **Fix B**: Drop the sign guard and keep only the closed-month ceiling extension
  - Strength: No dead-path code.
  - Tradeoff: A directly written negative row would show a figure.
  - Confidence: MEDIUM — depends on how much a hand-edited row matters.
  - Blind spot: The history of direct database writes to that table is unknown.
- **Decision**: FIXED — via Fix A (the guard stays as defence in depth; plan, test naming and `docs/logic.md` say so)

### F3 — A future-dated recommendation would show contradictory copy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1
- **Detail**: Setting `isStale` for a future time makes `RecommendationCard.astro:43-47` show "Laboratorium mogło przestać przesyłać dane." under a "czas z przyszłości" badge, and the forecast labels read "dziś (<future date>)" (`RecommendationForecast.astro:30, 38`). On the today card the change is badge-only.
- **Fix A ⭐ Recommended**: A distinct view flag for a future time, and a clock-error message in place of the outage warning
  - Strength: Badge, paragraph and labels tell the same story; the case stays testable at the mapper.
  - Tradeoff: A small component change in a phase that has no component tests (needs a manual check).
  - Confidence: MED — the forecast labels may need their own wording.
  - Blind spot: How the forecast day labels should read for a time a day or more ahead.
- **Fix B**: Keep `isStale` false for a future time; change only the badge and `isCurrent`
  - Strength: No outage copy and no component change.
  - Tradeoff: `isCurrent` and `isStale` stop being complements (`recommendation.ts:159, 199`).
  - Confidence: LOW — other reliance on the pairing not fully checked.
  - Blind spot: Animation gate and neutral chips.
- **Decision**: FIXED — via Fix A (new flag, clock-error message, forecast-label rule; two component files added to Phase 1; manual criterion 1.7 added)

### F4 — The closed-month ceiling changes another outcome

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §1
- **Detail**: The ceiling check sits before the day-count refusal (`bill-forecast.ts:388` versus `:431`), so a body with fewer than 7 days and an absurd invoice would go from "Za mało dni…" to "nierealna kwota". The plan said no other outcome changes.
- **Fix**: Correct the sentence, state the order and add a test that pins the outcome.
- **Decision**: FIXED — sentence corrected, order stated, pinning test added to the Phase 2 list

### F5 — The live state has no future-time handling, and the plan's reason was thin

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2
- **Detail**: A future `captured_at` gives a negative age that `formatAge` clamps to 0, so the status reads "aktualne" (`live-state.ts:341, 350-355`); the contract guards it only at receipt, within 5 minutes.
- **Fix**: State that precisely in the plan and add one table assertion pinning a `captured_at` within the 5-minute skew as current.
- **Decision**: FIXED — Current State and the Phase 1 table contract updated

### F6 — Smaller anchor and wording slips

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2, Phase 3 §2, Current State
- **Detail**: The lone-unreadable-central test is at about `bill-forecast.test.ts:376`; `calendar-view.test.ts:312` is a `buildQuarterView` test; `docs/decisions.md:92` was cited for a claim that holds only for settlement and derived-kWh signs.
- **Fix**: Correct those three references.
- **Decision**: FIXED — anchors and the decisions.md reference corrected
