<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Push-to-page integration tests (test plan Phase 2)

- **Plan**: context/changes/testing-push-to-page-integration/plan.md
- **Mode**: Deep
- **Date**: 2026-10-01
- **Verdict**: REVISE (all findings fixed in the plan; SOUND after fixes)
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 14/14 paths ✓ (`tests/` is new by design), 8/8 symbols ✓, brief↔plan ✓ (4 phases, decisions and scope agree). Progress mapping verified: 27 criteria ↔ 27 rows, one `## Progress`. No `docs/reference/contract-surfaces.md`, so the surface check was skipped. Vitest 5.0.1: `fileParallelism`, `testTimeout`, `hookTimeout`, `include` and `--config` exist (checked in the installed types and in the docs). The deep check read the loaders, view mappers, migrations, smoke and tooling config; only inferences are `astro check` covering `tests/` (read from its source, not run) and the exact Intl output of month and percent labels.

## Findings

### F1 — The smoke hourly assertion would pass without the new rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2, change 2 (`scripts/smoke.mjs`)
- **Detail**: The step asserts `hourly-status` is present and the empty-reason marker "does not say `brak danych godzinowych`". Both hold with no new data: `hourly-status` is always rendered (`HourlyUsageCard.astro:53`); `hourly-empty-reason` is rendered only for an empty view (:59) and its text is capitalised ("Brak danych godzinowych."), so a lowercase `notContains` is vacuous. Worse, `freshPush` spreads the example, which already carries 4 hours dated 2026-09-21 (`docs/ingest/example-v1.json:72`); they sit inside the 35-day window until about 2026-10-26, so the card may already render as usage. The plan's success criterion could pass while the card for pushed hours is unwired.
- **Fix A ⭐ Recommended**: Push one complete Warsaw day (all clock hours, at least 10 samples, distinct invented loads) for a day a few days back, then assert `hourly-status` present, `hourly-empty-reason` absent and the hand-derived label of the heaviest hour inside `data-testid="hourly-hours"`
  - Strength: The figure exists only because of the new rows, so the step proves the push reached the card; the same keys each run keep reruns identical.
  - Tradeoff: A full day is 23 to 25 rows (DST) to build in the script and the heaviest-hour label must be derived by hand from `docs/logic.md`.
  - Confidence: HIGH — the card's ranking and labels are read from `hourly-usage.ts`, and a full day is the documented completeness rule.
  - Blind spot: A complete day from an earlier smoke or integration run would also rank; the integration suite must keep to incomplete days (see F2).
- **Fix B**: Drop the smoke step and rely on the Vitest hourly test only
  - Strength: No change to `smoke.mjs`.
  - Tradeoff: The dashboard composition of the hourly card stays untested over HTTP.
  - Confidence: MEDIUM — Vitest cannot render the page.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A: smoke pushes one complete Warsaw day and asserts the heaviest-hour label inside `hourly-hours`)

### F2 — "Per-run salt" cannot give fresh hourly keys, and some negative checks need fresh keys

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 change 3 (`uniqueHourBlock`), Phase 2 right-surface checks, Phase 3 prune
- **Detail**: The loader window is 35 days, so hours that a loader test reads sit in about 840 possible slots; a salt derived from the clock will collide across runs. Collisions are harmless for positive checks (each test seeds its own state and a newer `captured_at` overwrites), but the right-surface check ("a daily-only push creates no hourly row at the test's unique hours") and the prune check assume the key was absent. A leftover row from an earlier run at the same hour makes them fail or pass for the wrong reason. Also, `captured_at` "now minus a small per-call offset" is ambiguous: two pushes in one millisecond collide (source, `captured_at`) and a later push with a larger offset can be older than an earlier test's push, so it would not be the newest `live_state`.
- **Fix**: Give absence and prune checks keys from an unbounded space: `hour_start` in a far past year (the contract has no bound) read by a direct owner select, and keep loader-window tests positive-only on their own keys. Make the `captured_at` helper strictly increasing (real now, bumped by 1 ms if not greater than the previous one) and never subtract a variable offset except in the explicit "older push" cases. Add a note that the suite must never form a complete Warsaw day in the loader window (it would rank beside smoke's day from F1).
- **Decision**: FIXED (verified-absent far-past keys, strictly increasing `captured_at`, 1 kWh cap on the suite's complete days)

### F3 — Phase 2 view assertions name reasons and fields that do not match the code

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, change 1 (hourly and state rows)
- **Detail**: For 5 hours with at least 10 samples, `toHourlyUsageView` returns kind `usage` (not empty) with `hours = { kind: "insufficient", reason: "za mało danych: brak pełnego dnia" }` (`hourly-usage.ts:286-287`); `lastNight.reason` is `INCOMPLETE_NIGHTS` (:255), so a test cannot say "not INCOMPLETE_NIGHTS" at view level. The empty view uses `NO_HOURLY_DATA` with or without a suffix (:206-208). For the live state, `toLiveStateView` has no "headline"; the power figure is in `view.pv`, `view.homeLoad`, `view.grid.value` and `view.battery.value`, formatted as `${oneDecimal(|W|/1000)} kW` with a decimal comma (`live-state.ts:149-151`); its PV and home verdicts depend on the wall-clock hour, and `today.periodLabel` changes across Warsaw midnight.
- **Fix**: Write the assertions as `view.kind === "usage"` and `view.hours.reason === "za mało danych: brak pełnego dnia"`; for the live row assert `view.status.label === "aktualne"`, `isStale === false` and `view.pv` equal to a hand-written literal such as "3,1 kW" for 3100 W, and do not assert the verdict texts or the period label.
- **Decision**: FIXED (hourly row asserts `kind === "usage"` and `hours.reason`; live row asserts status label, `isStale` and `view.pv` literal)

### F4 — The bill-forecast fixture is dated 2027-03, so rewriting only `generated_at` gives a "wrong month" view

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 change 3 (`billForecast` builder), Phase 2 `bill_forecast` row
- **Detail**: `scripts/fixtures/bill-forecast/lab-shape.json` has `month: "2027-03"`, observed days in March 2027 and its own `captured_at` in 2027. With only `generated_at` rewritten, `toBillForecastView` returns the forecast view but with status "to prognoza za marzec 2027, nie za bieżący miesiąc" (`bill-forecast.ts:462-471`) and no delta. `centralLabel` ("ok. 232 zł", 231.75 rounded) and `rangeLabel` ("od 141 zł do 322 zł") do not depend on the date, but `dayLabel` depends on the current year. The contract does not tie `month` to the observed days, so rewriting `month` still validates.
- **Fix**: Have the builder rewrite `generated_at` and `month` (to the current Warsaw month) and assert only `kind === "forecast"`, `centralLabel`, `rangeLabel` and the pushed `generated_at`; do not assert `dayLabel` or the status text (with the fixture's invoice, the current-month verdict is "problem", ponad 20% powyżej rachunku 191 zł, and that is a fixture fact, not a risk).
- **Decision**: FIXED (builder rewrites `month` too; asserts kind, centralLabel and rangeLabel only)

### F5 — `loadPeriodSummary` does not select `facts`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, `period_summaries` row
- **Detail**: The row says the loader "returns the pushed facts and narration". It selects `kind, period, narration_text, narration_generated_at, narration_provider, narration_model, built_at` only (`period-summary.ts:17-18`), so facts cannot be asserted through it. The owner can select `facts` directly (`20261001094118_period_summaries.sql:173-175`).
- **Fix**: Assert narration text, provider, model and `built_at` through the loader and the facts through a direct owner select of `period_summaries`; the far-future `built_at` KNOWN GAP in Phase 3 already uses a field the loader returns.
- **Decision**: FIXED (narration and `built_at` through the loader, facts through a direct owner select)

### F6 — The plan says raw pushes cannot be read without privileged access, but owners can

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: "What We're NOT Doing", bullet on `ingest_pushes`; research.md summary and open question 4
- **Detail**: Owners may select `source, captured_at, received_at, payload` from `ingest_pushes` (`20260925123751_live_state_view.sql:6-12`); only `token_id` and `payload_hash` are hidden, which smoke already checks (`scripts/smoke.mjs:497-499`). Reading raw pushes needs no postgres access, and it gives the duplicate test a direct oracle: a repeated push leaves exactly one raw row at that `captured_at`.
- **Fix**: Correct the bullet (non-owner and second token still need privileged access; owner reads of the allowed columns do not) and add to the Phase 3 duplicate test an owner select of `ingest_pushes` at that `captured_at` asserting one row.
- **Decision**: FIXED (bullet corrected; one-raw-row assertion added to the duplicate test)

### F7 — Two more command lists need the new script

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 change 6 and Phase 4
- **Detail**: `AGENTS.md:13-15` duplicates the `CLAUDE.md` command list and `README.md:56-57` and `:102` list `npm test`, smoke and the CI description; the plan updates only `CLAUDE.md`.
- **Fix**: Add the `test:integration` line to `AGENTS.md` and `README.md` in Phase 1 change 6, and extend the Phase 4 prettier check to them.
- **Decision**: FIXED (AGENTS.md and README.md added to the command-list update and the prettier and grep criteria)
