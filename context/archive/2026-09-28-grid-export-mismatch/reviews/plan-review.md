<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Night-Time Grid Draw and Highest/Lowest Consumption Hours

- **Plan**: context/changes/grid-export-mismatch/plan.md
- **Mode**: Deep
- **Date**: 2026-09-30
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

7/7 paths ✓; 3/5 claims confirmed. The latest `ingest_push` definition is in `20260925151509_daily_forecast.sql:14-101`, the owner-read pattern is confirmed, and the lab keeps 90 days of history. Two claims were contradicted: `fit_body` drops only `bill_forecast`, and `energyKwh` is non-negative. brief↔plan ✓. One sub-agent verified the code claims.

## Findings

### F1 — Example push and fixture tooling will break or leak made-up hours

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, change 3
- **Detail**:
  - `example-v1.json` has five readers: `push-fixture.mjs:83`, `smoke.mjs:163`, `contract.test.ts:8`, `ingest.test.ts:6`, and a comment in `bill-forecast.test.ts:45`.
  - The state-only strip in `push-fixture.mjs:91-96` would let example hours reach production.
  - `--shift-days` (`:139-148`) moves days only.
  - The 35-day prune would delete fixed example hours once they age.
  - `contract.test.ts:25-26` `sections()` requires every example section.
- **Fix**: Phase 1 updates `push-fixture.mjs` (strip and shift the section), covers it in `contract.test.ts`, and keeps smoke from asserting stored example hours.
  - Strength: closes a production data-pollution path and a delayed CI failure.
  - Tradeoff: two more files in Phase 1.
  - Confidence: HIGH — line-level evidence for each reader.
  - Blind spot: none significant.
- **Decision**: FIXED

### F2 — The night rule contradicts what was verified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 rules
- **Detail**: "Sums positive and negative hourly net as is" subtracts night export. The frame verified night import as the sum of positive hourly nets, which is what PGE bills.
- **Fix**: Night grid draw = sum of `max(grid_net_kwh, 0)`.
- **Decision**: FIXED

### F3 — The lab's body-size fitter and history reader don't do what the plan says

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 4, change 1
- **Detail**:
  - `fit_body` (`push-energy-analyser.py:376-386`) drops only `bill_forecast` and returns an over-limit body unchanged; `main()` (`:486-488`) assumes "bill_forecast dropped".
  - `read_history` (`:320-332`) is a one-pass generator.
- **Fix**: Rework `fit_body` to drop `hourly_history` first, then `bill_forecast`, and report which section it dropped; materialise the history once for both builders.
- **Decision**: FIXED

### F4 — Two manual checks rely on data no phase creates

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Checks 2.5 and 3.6
- **Detail**: No phase produced the August figures or a 35-day fixture. Using the owner's real data would put household consumption in a repository read on GitHub.
- **Fix**: Synthetic data only. Phase 2 gets an August-shaped test fixture; Phase 3 adds `push-fixture.mjs --hourly-days <n>`.
  - Strength: both checks become runnable and nothing personal is committed.
  - Tradeoff: a small generator to maintain.
  - Confidence: HIGH — the fixture tool already shifts and re-times pushes.
  - Blind spot: none significant.
- **Decision**: FIXED

### F5 — What the card shows when last night is incomplete

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2/3
- **Detail**: The plan defined a complete night but not what shows when the last one isn't complete.
- **Fix**: Show the most recent complete night among the last 3, by name; otherwise "niepełne dane za ostatnie noce" with no figure.
- **Decision**: FIXED

### F6 — Contract and storage details the plan leaves implicit

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1–2
- **Detail**:
  - `energyKwh` is non-negative (`contract.ts:12`).
  - `push_id` must be `on delete set null`.
  - The function's revoke/grant must be restated after `create or replace` (`151509:99-100`).
  - `warsaw-time.ts` has no hour helpers.
- **Fix**: Name all four in the Phase 1 and 2 contracts.
- **Decision**: FIXED
