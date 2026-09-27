<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bill accuracy

- **Plan**: `context/changes/bill-accuracy/plan.md`
- **Scope**: Phase 2 of 4
- **Reviewed phases**: 2
- **Date**: 2026-09-27
- **Verdict**: REJECTED → all 10 findings FIXED and re-verified at homelab-2@2595211 (112 tests, was 93; 11 guards break-verified)
- **Findings**: 2 critical, 7 warnings, 1 observation
- **Commits reviewed**: homelab-2@8df3680, energy-analyser@57a9ecf

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria verified

All six green at the committed state: 2.1 (93 tests), 2.2 (August 208.83 vs 214.66 = −2.7%; July 489.09 vs 495.22 = −1.2%), 2.3 (all three `no_data` reasons, exit 0), 2.4 (consumer keys + py_compile), 2.5 (stale reference), 2.6 (Telegram reason not 0.00 PLN). Phase 2 has no Manual rows. **That every criterion passes while F1 and F2 exist is itself the finding.**

## What matched

All six Changes Required implemented, nothing missing. The headline arithmetic reproduces the contract exactly (257.82 PLN, 155.10–360.53, −2.7% August check) on the real September history. Credit, quadrature range, lag threshold and `no_data` triggers match the written contract line for line. Phase 1's settlement-history call and its guard survived intact; `set -eu` still sound. Privacy clean: the only free-text field is regex-gated in both producers and a planted PPE/e-mail string is rejected. `float`/`Decimal` boundary, rounding order, month-boundary and DST behaviour (25-hour day, run at 00:03 on the 1st) all clean. No reachable `None` arithmetic; range monotonic, `low` never negative. The Telegram fix is correct.

## Findings

### F1 — The per-day sanity clamp was dropped; one glitched counter gives 7992 PLN

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: build-current-month-bill-forecast.py:114-135
- **Detail**: The old script clamped each day to `0 <= value <= 200` (`8df3680^:30`); the rewrite has no upper bound, and the push day rule does not replace it — `daily_counters` skips dips below 95% of a running max, but a spike becomes the new max. Reproduced: one September day spiked to 5000 kWh moves output from 257.82 to 7992.01 PLN, import 549.2 → 20472.8, confidence still `high`. Item 1's stated intent ("glitches handled once, in one place") is not delivered.
- **Fix**: Restore the upper bound in `daily_imports` and add a spiked-day test.
- **Decision**: FIXED — MAX_DAILY_IMPORT_KWH (200) restored in daily_imports; the spiked day is now excluded (256.39 with 13 days, was 7992.01). Break-verified.

### F2 — Settlement facts are never sanity-checked, in either direction

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (correctness)
- **Location**: build-current-month-bill-forecast.py:252-268
- **Detail**: `finite()` accepts negatives and `max(0,…)` guards `billable_kwh` but never `credit_kwh`. Reproduced with real tariffs: `feed_in_kwh = -342` → billable 904.4 kWh against import 549.2 (physically impossible), bill 1038.68 PLN, confidence `high`; `consumed_kwh = 0.001` → bill collapses to 44.62 with range 44.62–41,288,043.87 and `credit_left_kwh` 150,260,570.8 published. `closed_month_check` caught both (`ok: false`) and nothing acts on it; `app.js` never shows it.
- **Fix A ⭐ Recommended**: Validate at the boundary and act on the check — require `>= 0` for consumed/feed_in/factor/left_kwh, a plausible reference month (`consumed >= 50`), an `export_ratio` in 0..2, clamp `credit_kwh` at 0, assert `billable <= import`, and force `confidence "low"` when `closed_month_check.ok` is false by a wide margin.
  - Strength: The invariant is physical, not statistical; the check already knew both cases were wrong.
  - Tradeoff: Several guards; the 50 kWh and 0..2 thresholds are judgement calls.
  - Confidence: HIGH — every case reproduced.
  - Blind spot: A genuinely tiny billing month (new connection) would be rejected.
- **Fix B**: Assert the invariant only (`billable <= import`, ratio finite and 0..2) and return `no_data` when it fails.
  - Strength: One check instead of per-field validation.
  - Tradeoff: Loses the forecast rather than degrading, and misses the under-billing case where the invariant still holds.
  - Confidence: MEDIUM.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — non_negative() on all four settlement figures, MIN_REFERENCE_KWH 50, MAX_EXPORT_RATIO 2, credit_kwh clamped at 0, and confidence forced low when the closed-month check misses by >25% (CHECK_WIDE_MISS_PCT). The `billable > import` branch was written and then removed as unreachable once credit is clamped — the invariant is asserted in tests instead, since dead code that looks like a guard is worse than none. Break-verified.

### F3 — Two paths abort with no file written, and the new guard hides it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: build-current-month-bill-forecast.py:209-219, 398-403
- **Detail**: `finite()` screens inputs but not products: `export_ratio` can overflow to `inf` and `json.dumps(allow_nan=False)` then raises outside every `try` — exit 1, no file. Separately `settlement_from_snapshot` assumes the shapes of `values`, `raw_entities` and the entity dict, giving three uncaught `AttributeError`s. Both reproduced. The refresh guard added in item 4 makes these silent, and nginx keeps serving the previous file — which until the first success is the old-method payload, also `status: "ok"`, with the 2.4x-overstated figure.
- **Fix**: Run the payload through `finite()` before writing; wrap the write in `except (ValueError, OSError)` → stderr, return 0; `isinstance`-check the nested snapshot shapes. Consider treating a `generated_at` older than ~30 min as no data in the consumers.
- **Decision**: FIXED plus the staleness guard — sanitized() screens the products, write_payload is atomic and wrapped in except (OSError, ValueError) -> stderr/return 0, and every snapshot nesting level is isinstance-checked. Both app.js and bot.py now treat a forecast older than 30 minutes as no data. Break-verified.

### F4 — The lag clamp and tie-break can both pick the wrong reference

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (correctness)
- **Location**: build-current-month-bill-forecast.py:87-95, 194
- **Detail**: `max(0, previous - reference)` means a period ending in the current month or the future reports lag 0 and is treated as the trusted preceding month — narrow band, confidence not forced low, on an open period. The lag-0 tie-break uses `min()`, so with two rows ending in the same month the older wins: a 1 kWh "01.08–15.08" row beats a 423 kWh "16.08–31.08" row, giving `export_ratio` 0 and a full-gross ~648 PLN bill. Both need a connector reporting an open or split period.
- **Fix**: Return the signed difference and treat `lag < 0` as unusable; change the tie-break to `max()`.
- **Decision**: FIXED — lag_months returns the signed difference and a negative lag is rejected as an open period; the same-month tie-break is now max(). Break-verified.

### F5 — Carried credit is neither aged nor reflected in the range

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (correctness)
- **Location**: build-current-month-bill-forecast.py:265, 283
- **Detail**: `carried_credit = factor × left_kwh` comes from the reference period. Whenever lag >= 1 — most of every month — the intervening month has already drawn on that credit, so the current month is over-credited: with `left_kwh` 1000 the bill drops to the bare 44.62. Relatedly `d_import` uses `billable_kwh` while sampling noise scales `projected_kwh`, so the correct term is `u × (billable + carried)` and the range is marginally too narrow when carried credit is non-zero. `left_kwh` has been 0 on every invoice so far.
- **Fix**: Drop or scale `carried_credit` when `lag > TRUSTED_LAG_MONTHS` and say so in the payload; use `(billable + carried)` for `d_import`.
- **Decision**: FIXED (drop when stale) — carried_credit is 0 when lag > TRUSTED_LAG_MONTHS with carried_credit_dropped_as_stale in the payload, and d_import covers (billable + carried). Break-verified.

### F6 — main()'s fallback predicate disagrees with build_forecast's guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (correctness)
- **Location**: build-current-month-bill-forecast.py:386 vs :255
- **Detail**: `main()` falls back to the snapshot when `factor` or `consumed_kwh` is None, but `build_forecast` also requires `feed_in_kwh`. A history row missing only `feed_in_kwh` never consults the snapshot and reports `settlement_facts_missing` forever. Today's writer cannot emit such a row.
- **Fix**: Use one predicate covering all three fields.
- **Decision**: FIXED — one complete_facts() predicate used by both main()'s fallback decision and build_forecast's guard.

### F7 — The forecast script is in no install list, and is mode 644

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: git mode 100644; runbooks/energy-analyser-push.md:51
- **Detail**: No runbook installs `build-current-month-bill-forecast.py`, while the refresh invokes it as a bare command. Its repo mode is 644 (pre-existing since 5e4d790) where `analyse-pge-anomalies.py` and `append-pge-settlement-history.py` are 755. The runbook's install pattern uses `-m 0755`, so adding it there fixes the host mode — Phase 3's job, and its contract already names the file for the diff check.
- **Fix**: Add it and `append-pge-settlement-history.py` to the runbook install list in Phase 3; set the repo mode to 755.
- **Decision**: FIXED — repo mode 100755, and both build-current-month-bill-forecast.py and append-pge-settlement-history.py added to the runbook install list with -m 0755, plus a note on the app-src/push-script coupling and the new data file's rollback rule. (Touches Phase 3's file early, by the owner's call.)

### F8 — No test exercises main(), and two assertions cannot fail usefully

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (test coverage)
- **Location**: tests/test_current_month_bill_forecast.py
- **Detail**: This is why F1, F2 and F3 got through. None of the 93 tests calls `main()`; the neighbouring settlement-history suite, written days ago in the same change, has three such tests and F3 is exactly what they would have caught. The ratio band is asserted as "stale width > fresh width" rather than against 0.25/0.40, and that comparison swaps AUGUST for JULY at the same time so the widening is not attributable to `r`; the n=1 40% ceiling is likewise only a width comparison. The live-rates test calls `skipTest` when `tariff_rates()` returns None — exactly what the bare `except Exception` at :156 produces, so a real breakage turns it green.
- **Fix**: Add `main()` tests in the neighbour's idiom; assert the band constants and the ceiling numerically; narrow :156 to `(ImportError, AttributeError, ArithmeticError)`; skip only when `find_spec` is None.
- **Decision**: FIXED all four — a MainTest class in the settlement-history suite's idiom (malformed snapshot, absent inputs, overflow, unwritable destination, routine-to-stdout, atomic swap by inode), the 0.25/0.40 band and the 40% ceiling pinned numerically with the ratio held constant, the tariff except narrowed to (ImportError, AttributeError, ArithmeticError), and the live-rates test skipping on find_spec rather than on the result.

### F9 — Non-atomic write, and routine no_data on stderr

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: build-current-month-bill-forecast.py:397-403
- **Detail**: `write_text` truncates then writes, so a crash mid-write leaves a truncated JSON that nginx serves and `bot.py` raises on — `append-pge-settlement-history.py` avoids exactly this with tempfile + fsync + os.replace, in the same change series. Every non-ok status goes to stderr including `no_complete_days`, which is by design on the 1st: 288 stderr lines a day, against the stdout-for-routine convention set last commit.
- **Fix**: Reuse the atomic-write shape; send `no_complete_days` to stdout.
- **Decision**: FIXED — write_payload uses tempfile+fsync+os.replace like the settlement writer; no_complete_days goes to stdout via ROUTINE_REASONS.

### F10 — Published reasons are unread, and one assumption is cheaply checkable

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: web/app.js:1282; build-current-month-bill-forecast.py:265
- **Detail**: `app.js` hard-codes "czeka na zakonczone dni Deye" for any `no_data`, now wrong for `rates_unavailable` and `settlement_facts_missing`; `reason`/`message` are published but only Telegram reads them (S-07's job). And `carried_credit` assumes `left_kwh` is before the factor — the snapshot already carries `pge_credit_with_factor_kwh` and `pge_credit_fed_in_kwh`, whose ratio would validate both that reading and the factor itself in two lines.
- **Fix**: Read `reason` in `app.js` (S-07); cross-check the factor from the two settled sums.
- **Decision**: FIXED (both) — implied_factor() cross-checks the factor from the connector's two settled sums and is published as settlement.factor_implied; app.js reads `reason` through FORECAST_NO_DATA_TEXT instead of always blaming missing Deye days.
