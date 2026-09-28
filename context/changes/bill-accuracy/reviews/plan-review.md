<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Bill accuracy — make the lab's bill forecast match PGE invoices

- **Plan**: `context/changes/bill-accuracy/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-27
- **Verdict**: REVISE → **SOUND after fixes** (all 9 findings applied)
- **Findings**: 3 critical, 5 warnings, 1 observation

## Verdicts

| Dimension             | Verdict | After fixes |
| --------------------- | ------- | ----------- |
| End-State Alignment   | WARNING | PASS        |
| Lean Execution        | PASS    | PASS        |
| Architectural Fitness | WARNING | PASS        |
| Blind Spots           | FAIL    | PASS        |
| Plan Completeness     | WARNING | PASS        |

## Grounding

10/10 paths ✓, 8/8 symbols ✓, brief↔plan ✓ (one wording discrepancy, see F4), Progress↔Phase 4/4 phases and 14/14 steps ✓ (16 steps after fixes). Deep verification ran against `projects/homelab-2`.

## Findings

### F1 — The export ratio is 1–2 months stale, so the figure re-bases mid-month

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Implementation Approach; Phase 2 item 3; Open Risks
- **Detail**: The PGE Sensor holds only the latest invoice, which arrives ~3 weeks into the following month (August's was due 2026-09-22). So Sept 1–21 used July's ratio (372/702 = 0.53) and only from Sept 22 August's (342/423 = 0.81) — on a 515 kWh projected import, 371 PLN against 245 PLN, a ~126 PLN jump between two refreshes. The plan's stated mitigation does not mitigate: `closed_month_check` prices the closed month's _actual_ consumed and fed-in kWh, so it never exercises the estimated ratio. Criterion 3.3 runs after the re-base and passes clean.
- **Fix A ⭐ Recommended**: Report `reference_lag_months`, drop `confidence` a tier at lag > 1, widen the ratio band from ±25% to ±40% at lag > 1, document the re-base in `docs/logic.md`.
  - Strength: One block of code, using only facts the snapshot already carries; the jump is explained rather than hidden.
  - Tradeoff: The central figure still moves when the invoice lands.
  - Confidence: HIGH.
  - Blind spot: The right band width at lag 2 is a guess until a second autumn of invoices exists.
- **Fix B**: Estimate in-month export from the lab's PV surplus, calibrated to the last closed month.
  - Strength: Tracks the current month and the season; removes the lag.
  - Tradeoff: Rests on the unexplained 342-vs-95 kWh export gap. If that is per-phase netting (frame hypothesis), PGE's export is not a function of the inverter's totals at all. Belongs after `grid-export-mismatch`.
  - Confidence: LOW.
  - Blind spot: Battery charging sits between PV surplus and export.
- **Decision**: FIXED via Fix A, plus an owner-requested amendment — the lab now persists each closed-month settlement (`web/data/pge-settlement-history.jsonl`, append-if-new on `reference_period`, 36-row retention) as a new Phase 1 item, so the ratio has a series instead of one number and can prefer the immediately preceding month. Established in review: polling the connector harder cannot shorten the lag (it reads the mBOK _sales_ API every 8 h and the lab snapshots every 5 minutes, so a new invoice already arrives within ~8 h; PGE simply does not issue it sooner).

### F2 — Telegram reports "0.00 PLN" as the bill on the `no_data` path

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 criterion 2.4; Phase 3 check 3.5; Migration Notes
- **Detail**: `bot.py:261` formats `float(bill.get('projected_bill_gross_pln') or 0):.2f` and nothing reads `status`, so a `no_data` body prints `Prognoza rachunku None: 0.00 PLN (unknown confidence)`. Migration Notes expect exactly that on the first refresh after deploy, and criteria 2.4 (keys present) and 3.5 (line still shown) both pass while it happens — the same class of error this change exists to remove. The lab page does handle it (`app.js:1280` gates on `status !== 'ok'`).
- **Fix**: Add `apps/telegram-home/bot.py:242-261,321-331` to Phase 2 as its own item with a `status != "ok"` guard printing the reason; reword check 3.5.
- **Decision**: FIXED (new Phase 2 item 5, new step 2.6, 3.5 reworded)

### F3 — The Phase 2 rates contract calls the billing API two ways it isn't

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, item 2
- **Detail**: The contract wrote `calculate_bill(pge_g11_positions(), …)` and `Bill.variable_unit_gross()` / `Bill.fixed_gross()`. The signature is `calculate_bill(consumption_kwh, positions, period=None)` (`billing.py:131-135`) — consumption first — and both accessors are `@property` (`billing.py:90-98`), so calling them raises `TypeError: 'decimal.Decimal' object is not callable`. The expected values check out: 1.0991 PLN/kWh and 44.62 PLN/month for 1000 kWh / 1 month.
- **Fix**: Rewrite as `calculate_bill(Decimal("1000"), pge_g11_positions(), BillingPeriod(days=30, months=Decimal("1")))` and read the properties.
- **Decision**: FIXED

### F4 — The ±5% closed-month gate mixes formula error with rate drift

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 items 2–3; criteria 2.2 and 3.1
- **Detail**: The check prices a past invoice with today's rates. August already sits at −2.6% (209 vs 214.66) and the implied August rate was 1.14 against 1.0991, so ~2.4% of headroom remains before the gate trips — and the gap is rate drift, not formula error. A PGE price change is out of scope by design yet would break both the unit test and the deploy gate, and nothing was defined for `diff_pct` above threshold. Separately, the plan called `rachunek-current.json` "hand-made"; it is generated by `solar_analyser` from a real eBOK CSV (`overview.py:13-39`) and has six live consumers. Its defect is staleness, and `tariffs.py` is equally hand-maintained.
- **Fix A ⭐ Recommended**: Pin fixture rates in the back-tests, add `pricing.rates_verified_on`, make over-threshold a reported `closed_month_check.ok: false` that never blocks the refresh.
  - Strength: A legitimate rate update can no longer break the suite; staleness stays visible.
  - Tradeoff: A fixture-pinned test no longer catches a bad rate edit (a separate case pins the live derivation).
  - Confidence: HIGH.
  - Blind spot: Who updates `rates_verified_on`, and when.
- **Fix B**: Make the check energy-based against the invoice's settled energy.
  - Strength: Removes rates from the check entirely.
  - Tradeoff: `pge_live_settled_kwh` reads 261.81 against a computed 149.4; unverified semantics, no consumers — a research detour into exactly what frame hypothesis 5 left open.
  - Confidence: LOW.
- **Decision**: FIXED via Fix A

### F5 — Reusing the push script's day rule silently cuts the day count

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 item 1; criterion 3.3
- **Detail**: `build_daily_history` requires the last usable sample at or after 23:00 (`DAY_COMPLETE_AFTER`, `push-energy-analyser.py:62`) plus `counters_ok is True` (`:204-216`); the forecast's current rule is 21:00. So `completed_days_used` drops below today's 16 of 26, on top of the recorded Sept 14–18 and 22–24 gaps. That feeds `max(15, min(40, 50/√n))` directly, can cross the 7-day and 14-day confidence thresholds, and moves the mean that "around 250 PLN" rests on. The plan never estimated the new `n`.
- **Fix**: Count September's passing days read-only on docker-core before coding; record expected `n`, uncertainty and range in the plan; add an `n < 7` test; specify `days=35` and that the generator is read once.
- **Decision**: FIXED

### F6 — Two consumers of the forecast were in no phase

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 item 1; Key Discoveries
- **Detail**: `web/app.js:1275-1290,1603-1612` reads the forecast and hard-requires an unguarded `range_gross_pln.low` plus a known `confidence`; the plan keeps those keys but nothing verified it. And `runbooks/solar-energy-analyser-validation.md:194-204` documents the 21:00 rule and "the last closed PGE G11 calculation provides the variable gross rate", both falsified by this change, while Phase 3 updated only `energy-analyser-push.md`. That is the `lessons.md` "keep docs in step" rule.
- **Fix**: Add the validation runbook to Phase 3's files and a manual check that the lab page's card still renders; record app.js in Key Discoveries.
- **Decision**: FIXED (new step 3.6)

### F7 — `closed_month_check`'s invoice figure had no named source

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, item 3
- **Detail**: Two automated criteria gate on `invoice_gross_pln` being 214.66, but the snapshot offers both `pge_live_invoice_amount_pln` (the invoice total, used that way at `build-energy-agent-briefing.py:161-174`) and `pge_live_balance_pln` (the account balance, used for overdue detection at `:113-128`). Different numbers; the implementer had to guess.
- **Fix**: Name `pge_live_invoice_amount_pln` and assert the balance key is never read.
- **Decision**: FIXED

### F8 — Phase 4's verification could not fail and its roadmap target did not exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 item 2; criterion 4.1
- **Detail**: Criterion 4.1 said "`npm run format` leaves the docs unchanged", but the script is `prettier --write .` and there is no `format:check` — it rewrites files and always exits 0. And Phase 4 said "open question 8"; `roadmap.md:394` has four, so the next number is 5 (`change.md`'s "open question 6" is stale from the pre-v3 roadmap).
- **Fix**: Use `npx prettier --check .`; number the question 5; decide whether S-07's slice should record it was parked.
- **Decision**: FIXED

### F9 — Netting amplifies the range to roughly −44% / +55%

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 item 3 (Range)
- **Detail**: Scaling import by ±u and the ratio by ∓r in the same direction compounds inside `max(0, import − credit)`: for September (≈515 kWh, ratio 0.81, u = 15%) that is roughly 137–380 PLN around 245, against the current card's ±15%. The terms model different errors — u is sampling noise, under which import and export move together and the ratio is roughly stable — so combining them partly double-counts. FR-011 and S-14 want a range a non-expert can act on.
- **Fix**: Compute September's real range before coding, record it and put it to the owner at check 3.3; if too wide, vary the ratio as a separate smaller term rather than in lockstep.
- **Decision**: FIXED

## Carried into implementation

Two figures are deliberately left blank in the plan and must be filled in **before** Phase 2 coding:

1. The September day count that passes the push script's rule, with the resulting `n`, uncertainty and range (F5).
2. The resulting September range in PLN, to be put to the owner at check 3.3 (F9).
