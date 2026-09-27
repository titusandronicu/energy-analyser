# Bill accuracy Implementation Plan

## Overview

Make the home lab's current-month bill forecast estimate the **PGE invoice amount** by applying the 0.8 net-metering credit. The code changes are in homelab-2 (`infra/compose/energy-app/`). The change is tracked here because S-07 (`bill-forecast`) will display the result and stays parked until this lands.

## Current State Analysis

From `frame.md` (confidence HIGH):

- The forecast (`homelab-2 infra/compose/energy-app/scripts/build-current-month-bill-forecast.py:20-71`) computes the mean of completed Deye days × days in the month × the June-bill blended rate, plus fixed fees. It has **no export credit**. Adding the credit reproduces the August invoice within 3% (≈209 against 214.66 PLN; the current method gives ≈509) and the July invoice within about 1% (≈489 against 495.22).
- Settlement is **net-metering (opust), factor 0.8, monthly periods**. This is confirmed by the HA PGE Sensor (`sensor.solar_pge_sensor_pge_magazyn_energii`: factor 0.8, 342 kWh fed in, 274 credited, 0 left over; period 01.08–31.08.2026).
- **Deye import is reliable since early August** (433.6 against PGE's 423 kWh). **Export can't come from the inverter**: its counter shows 94.7 kWh and its summed grid power 95 kWh, against PGE's 342. PGE also records night export the inverter never sees. Owner's decision: investigate that in a separate change.
- Rates come from the **stale** (June), gitignored `rachunek-current.json`. It is not hand-made: `solar_analyser` generates it from a real eBOK CSV (`overview.py:13-39`, `build_bill_payload`), and six other things read it (an HA REST sensor `solar_dashboard_analyser.yaml:20`, the Lovelace dashboard, the collector's `pge_computed_rachunek_pln`, the agent briefing's drift finding, `web/app.js` `loadRealBill`, two runbooks). Its defect is that nobody refreshes it. If that file is missing, the script raises, and because the refresh runs under `set -eu`, the refresh stops before it pushes.
- The lab's day rule ("last sample at or after 21:00") differs from the push script's, and it takes mid-day counter glitches at face value.

## Desired End State

`web/data/current-month-bill-forecast.json` on docker-core projects the **invoice amount** for the current month:

- The credit is estimated from the last closed month's export/import ratio (PGE Sensor), and credit carried from earlier months is included.
- Rates come from `solar_analyser.tariffs`.
- Daily import comes from the same daily totals the app receives.
- A range covers both the import and the export-ratio uncertainty.
- A `closed_month_check` compares the formula, applied to the last closed month's real consumed and fed-in energy, with that month's invoice. For August it must be within 5%.

The existing keys (`month`, `confidence`, `projected_*`, `range_gross_pln`, `completed_days_used`) keep their meaning for the Telegram bot and the lab page. Missing inputs produce `status: "no_data"` with a reason, and never stop the refresh.

### Key Discoveries:

- The collector copies entity values only through `ENTITY_MAP` / `ATTRIBUTE_MAP` (`collect-ha-snapshot.py:60-91,146-161`). Four PGE Sensor entities are mapped today (`:74-80`). A mapped entity that is missing marks the snapshot `degraded`.
- The push script already derives trusted daily totals (`push-energy-analyser.py:204-298`, `build_daily_history`, `daily_counters`): it skips dips, ignores samples before 00:30, and requires the last sample at 23:00 or later. The tests load scripts by path (`apps/solar-energy-analyser/tests/test_current_month_bill_forecast.py:8-11`).
- `solar_analyser` is deployed at `/srv/homelab/energy-app-stack/app-src`, and lab scripts import it (`build-deye-consumption-plan.py:17`). Rates live only in `apps/solar-energy-analyser/src/solar_analyser/tariffs.py:29-103`. `billing.calculate_bill` applies 23% VAT with invoice rounding (`billing.py:131-167`).
- The refresh calls the forecast with `--database … --bill …/rachunek-current.json` (`refresh-energy-agent-data.sh:65-69`).
- The lab page reads the same file (`apps/solar-energy-analyser/web/app.js:1275-1290,1603-1612`). It gates on `status !== 'ok'`, but the ok path needs `range_gross_pln.low` unguarded and a `confidence` in {low, medium, high}, so the existing keys must keep their shapes.
- The Telegram bot reads `month`, `confidence`, `average_daily_import_kwh`, `projected_import_kwh`, `projected_bill_gross_pln` (`apps/telegram-home/bot.py:242-261,321-327`).
- The HA report prompt says the house is on net-billing (`infra/homeassistant/packages/gemini_home_reports.yaml:84`).
- The PGE Sensor's names and some attributes are personal (account e-mail, PPE, invoice number). The collector's `raw_entities` keeps only `entity_id`, `state`, `unit`, `last_updated`.

## What We're NOT Doing

- The app card (S-07 `bill-forecast`): it stays parked and resumes after this change.
- Finding why PGE sees export the inverter doesn't (night export, possible phase imbalance): that goes to a new change, `grid-export-mismatch`.
- Meter-grade data (wM-Bus, MojeIRE): parked in the roadmap.
- Reconciling forecasts against invoices over time (PRD non-goal). `closed_month_check` covers only the one latest closed month, as a validity check.
- Hourly consumption analysis in the lab (S-10 covers the usage profile).
- Changing tariff rates. `tariffs.py` stays as verified. A rate update is a separate edit when PGE changes prices.
- Removing `rachunek-current.json` or the `solar_analyser_rachunek_pge` HA sensor. The forecast just stops depending on them.

## Implementation Approach

Collect the settlement facts first, then change the calculation, then deploy, then document. Keep the output backward-compatible and let each missing input degrade to `no_data`. The formula in full:

- `import_kwh` = mean daily import over the month's complete days × days in the month.
- `ratio` = last closed month `feed_in_kwh / consumed_kwh` (PGE Sensor). The connector holds only the latest invoice, which arrives about three weeks into the following month, so the reference month lags the current one by one or two months; `reference_lag_months` records that lag and widens the range (Phase 2, item 3).
- `credit_kwh` = factor × `ratio` × `import_kwh` + factor × carried left-over kWh.
- `billable_kwh` = max(0, `import_kwh` − `credit_kwh`).
- `bill` = `billable_kwh` × variable gross rate + fixed gross fees per month. Credit beyond this month's import is reported as `credit_left_kwh`, not as a negative bill.

## Critical Implementation Details

- **Units of the left-over credit.** `settledEnergyAmount` (342) equals the fed-in kWh, and `settled_energy_sum_with_factor` (274) is that figure after the factor, so `leftEnergyAmount` is taken to be fed-in kWh *before* the factor: carried credit = left × factor. It has been 0 so far. Record the assumption in the output (`carried_credit_basis`) and in `docs/logic.md`, and check it the first time it isn't 0.
- **Reference-month lag.** For most of a month the latest invoice is still the month before last (August's invoice was due 2026-09-22), so the ratio can be two months old, and ratios differ sharply between months: July 372/702 = 0.53 against August 342/423 = 0.81, which on a 515 kWh projected import is 371 PLN against 245 PLN. The forecast therefore reports the lag, degrades confidence and widens the range while the lag is above one month, and `docs/logic.md` states that the figure re-bases when a new invoice arrives. `closed_month_check` cannot catch a wrong ratio: it prices the closed month's actual consumed and fed-in kWh.
- **Sequencing.** Collector changes deploy before the forecast change. Until the new entities have been collected at least once, the forecast must return `no_data` with reason `settlement_facts_missing`, not crash.

## Phase 1: Collect the connector's settlement facts

### Overview

The collector records the PGE Sensor values the credit needs, without personal data.

### Changes Required:

#### 1. Collector entity and attribute maps

**File**: `homelab-2 infra/compose/energy-app/scripts/collect-ha-snapshot.py`

**Intent**: Add the closed-period consumed and fed-in energy, the billing period, and the energy-credit record, so the forecast can read them from the snapshot.

**Contract**:
- `ENTITY_MAP` gains:
  - `pge_live_consumed_kwh` → `sensor.pge_sensor_pge_consumed_energy`
  - `pge_live_feed_in_kwh` → `sensor.pge_sensor_pge_feed_in_energy`
  - `pge_live_billing_period` → `sensor.solar_pge_sensor_pge_okres_rozliczeniowy`
  - `pge_live_credit_kwh` → `sensor.solar_pge_sensor_pge_magazyn_energii`
- `ATTRIBUTE_MAP` gains `pge_credit_factor` (`factor`), `pge_credit_fed_in_kwh` (`settled_energy_sum`) and `pge_credit_with_factor_kwh` (`settled_energy_sum_with_factor`).
- New `pge_credit_left_kwh` = the `leftEnergyAmount` of the newest `history` entry. It is parsed from the attribute, which may be a list or a Python-repr string. The parse is tolerant: unparsable gives `None`.
- No other attribute of these entities is copied.
- The billing period is kept as its text (`DD.MM.YYYY - DD.MM.YYYY`).

#### 2. Closed-month settlement history

**File**: `homelab-2 infra/compose/energy-app/scripts/` — the collector, or a small sibling script called from `refresh-energy-agent-data.sh` — writing `web/data/pge-settlement-history.jsonl`

**Intent**: The connector exposes only the **latest** invoice, so each closed month's settlement facts are lost when the next invoice arrives. Persisting them gives the forecast a series instead of one number: it can use the month immediately preceding the current one once that exists, and from about July 2027 the same month a year back (the reasoning that parks the roadmap's S-16 year view). It does not shorten the lag — PGE issues an invoice about three weeks after the month ends, and the connector already surfaces it within 8 h.

**Contract**:
- One row per `reference_period`, appended only when that period is not already present. The refresh runs every 5 minutes and the connector polls every 8 h, so nearly every run is a no-op.
- Row shape: `{reference_period, consumed_kwh, feed_in_kwh, factor, left_kwh, invoice_gross_pln, first_seen_at}`. Values only — no names, PPE, e-mail or invoice number.
- A row is written only when consumed, fed-in and factor are all present. A partial or `unavailable` reading never writes a row.
- Retention: 36 rows (three years), oldest dropped, following the history-file convention in the energy-app README.
- A missing or unreadable file is not an error: it means no history, and the forecast falls back to the snapshot's current values.

#### 3. Collector tests

**File**: `homelab-2 apps/solar-energy-analyser/tests/` (next to the existing collector tests, or a new `test_collect_ha_snapshot_pge.py` loading the script by path)

**Intent**: Pin the new mapping and the privacy rule.

**Contract**: The cases:
- A state fixture shaped like the real entities (numbers from `change.md`; fake e-mail and PPE in names and attributes) yields the new values.
- No output contains the fake e-mail, PPE or invoice number.
- `history` given as a string or a list, and an unparsable one, gives `None`.
- An `unavailable` state gives `None`.

### Success Criteria:

#### Automated Verification:

- Lab tests pass: `make test-solar-analyser`
- A privacy test proves names, PPE and invoice numbers never reach the snapshot output or the settlement history
- A second run with the same `reference_period` appends nothing, and a new period appends exactly one row

#### Manual Verification:

- After deploy (Phase 3), one real snapshot on docker-core carries consumed 423, fed-in 342, factor 0.8 and left-over 0 for the 01.08–31.08.2026 period

**Implementation Note**: Continue to Phase 2 after the automated checks pass. The manual row is checked in Phase 3, after deploy.

---

## Phase 2: Credit-aware forecast

### Overview

Rewrite the forecast calculation around the invoice amount, with shared daily totals, rates from `tariffs.py`, the estimated credit, and a check against the last closed invoice.

### Changes Required:

#### 1. Daily import from the shared daily totals

**File**: `homelab-2 infra/compose/energy-app/scripts/build-current-month-bill-forecast.py`

**Intent**: Use the same complete-day totals the app receives, instead of the forecast's own 21:00 rule, so glitches and the minutes after midnight are handled once, in one place.

**Contract**:
- Read the lab's `energy-history.jsonl`, the push script's source.
- Take `grid_import_kwh` per day from `build_daily_history`, with the push script loaded by path as its tests do.
- Use complete past days of the current Warsaw month that have a non-null import. Today is excluded.
- `observed_days` keeps the `{date, grid_import_kwh}` shape.
- New CLI `--history <path>` replaces `--database`.
- `build_daily_history(rows, now, days)` takes the generator from `read_history` (`push-energy-analyser.py:301-313`), which is **read once**; `days` is passed as 35, enough to cover any month. `now` must be timezone-aware.
- Its day rule is **stricter** than the forecast's current one: the last usable sample must be at or after 23:00 (`DAY_COMPLETE_AFTER`, `:62`) and `counters_ok` must be `True` (`:204-216`), against today's 21:00. So `completed_days_used` drops. **Measured 2026-09-27** against the real `energy-history.jsonl` (evidence in `change.md`): `n` = 15 against the current 16 — of 26 past September days only 18 have rows, and 3 of those are null under the 23:00 rule. Because `50/√15 = 12.9` is below the 15% floor, uncertainty stays 15.0% and confidence stays `high`. The resulting projection is 258 PLN against 648 PLN for the current method, so check 3.3's "around 250 PLN" holds.

#### 2. Rates from `tariffs.py`

**File**: same script

**Intent**: Remove the dependency on the stale June file; `tariffs.py` is the single place for rates. Note that `tariffs.py` is hand-maintained too, so the change swaps one manually updated rate source for another and must keep a freshness signal.

**Contract**:
- The variable gross rate per kWh and fixed gross fees per month come from `calculate_bill(Decimal("1000"), pge_g11_positions(), BillingPeriod(days=30, months=Decimal("1")))` — **consumption first** (`billing.py:131-135`) — read off the `Bill` as the **properties** `variable_unit_gross` and `fixed_gross` (`billing.py:90-98`; calling them as methods raises `TypeError: 'decimal.Decimal' object is not callable`). Verified values: 1.0991 PLN/kWh and 44.62 PLN/month.
- `solar_analyser` is imported via `ENERGY_APP_SRC` / `sys.path`, like `build-deye-consumption-plan.py`.
- `pricing` gets `source: "solar_analyser.tariffs.pge_g11_positions"` and `rates_verified_on: "2026-09-27"` in place of `source_month`, which is removed (it has no consumers). `rates_verified_on` is the date the rates were last checked against an invoice, so staleness stays visible.
- `--bill` is removed.

#### 3. Credit, range and closed-month check

**File**: same script

**Intent**: Estimate the invoice as set out in Implementation Approach, and check the formula against the last closed invoice.

**Contract**:
- Settlement facts come from `web/data/pge-settlement-history.jsonl` (`--settlement-history <path>`) and, as a fallback, the collector's output `web/data/ha-energy-snapshot.json` (`HA_SNAPSHOT_OUTPUT`, `collect-ha-snapshot.py:188-191`, `--snapshot <path>`). The forecast prefers the history row for the month immediately preceding the current one, falls back to the newest row, and falls back to the snapshot's current values when the history has nothing usable. `reference_lag_months` is computed from whichever row is used.
- Output adds:
  - `method: "net_metering_credit_estimate"`
  - `settlement {factor, reference_period, reference_lag_months, reference_consumed_kwh, reference_feed_in_kwh, export_ratio, carried_credit_kwh, carried_credit_basis: "left_kwh_times_factor"}`
  - `reference_lag_months` = whole Warsaw months between the end of `reference_period` and the start of the current month (0 when the reference is the immediately preceding month).
  - `projected_credit_kwh`, `projected_billable_kwh`, `credit_left_kwh`
  - `closed_month_check {period, computed_gross_pln, invoice_gross_pln, diff_pct, ok}`
  - `invoice_gross_pln` comes from the snapshot's existing `pge_live_invoice_amount_pln` (`collect-ha-snapshot.py:76`), the invoice total — **not** `pge_live_balance_pln`, the account balance used for overdue detection (`build-energy-agent-briefing.py:113-128`). A test asserts the balance key is never read.
  - `ok` is `abs(diff_pct) <= 5`. A false `ok` is reported and logged only: it never changes `status`, never blocks the refresh and never suppresses the projection. The diff also moves when PGE changes prices — the implied August rate was 1.14 against today's 1.0991, so August sits at −2.6% before any formula error.
- `projected_bill_gross_pln` is the credited estimate.
- Range: the import and export-ratio errors are treated as **independent** and combined in quadrature, not in lockstep (owner's decision 2026-09-27; the lockstep worst case assumed both hit their extreme together and gave −45%/+56%, which double-counts, because `u` is sampling noise and `r` is seasonal).
  - `u` is the existing `max(15, min(40, 50/√n))`; `r` is the ratio band: 0.25 while `reference_lag_months` ≤ 1, 0.40 above it.
  - `base` = `projected_billable_kwh` = `max(0, import − factor × ratio × import)`.
  - `d_import` = `u × base` (billable is linear in import at a fixed ratio).
  - `d_ratio` = `factor × ratio × r × import`.
  - `spread` = `sqrt(d_import² + d_ratio²)`.
  - low = `max(0, base − spread)` × variable gross rate + fixed gross fees; high = `(base + spread)` × variable gross rate + fixed gross fees.
  - Measured on the real September data (import 549 kWh, ratio 0.809, u = 15%, r = 0.25): base 193.9 kWh, `d_import` 29.1, `d_ratio` 88.8, spread 93.4 → **155–361 PLN around 258**. Evidence and the rejected alternatives are in `change.md`.
- `confidence` keeps its thresholds (below 7 days, below 14 days), then drops one tier (`high` → `medium` → `low`) when `reference_lag_months` > 1.
- `status: "no_data"` with a `reason`:
  - `no_complete_days`
  - `settlement_facts_missing` (factor, consumed or fed-in is missing, or consumed ≤ 0)
  - `rates_unavailable`
- The script catches its own input errors and always writes a JSON file.

#### 4. Refresh wiring

**File**: `homelab-2 infra/compose/energy-app/scripts/refresh-energy-agent-data.sh`

**Intent**: Call the forecast with the new inputs, so a forecast failure can't stop the push.

**Contract**:
- Lines 65-69 pass `--history` and `--snapshot` instead of `--database` / `--bill`.
- The call is guarded so a non-zero exit logs `refresh: bill forecast failed` and the refresh continues.

#### 5. Telegram bot guards on `status`

**File**: `homelab-2 apps/telegram-home/bot.py`

**Intent**: Stop the bot presenting a missing forecast as a 0.00 PLN bill. Nothing there reads `status` today, and `:261` formats `float(bill.get('projected_bill_gross_pln') or 0)`, so a `no_data` body prints `Prognoza rachunku None: 0.00 PLN (unknown confidence)` — the first refresh after deploy is expected to do exactly that (Migration Notes).

**Contract**:
- `:250-261` checks `status` first: anything other than `"ok"` prints the `reason` in Polish plain text instead of a number.
- `:321-331` (`home_context`) passes `status` through, so the LLM never receives all-`None` bill values as if they were figures.
- No other bot behaviour changes.

#### 6. Tests

**File**: `homelab-2 apps/solar-energy-analyser/tests/test_current_month_bill_forecast.py`

**Intent**: Replace the June-bill fixtures with the credit model, and pin the real August and July back-tests.

**Contract**: Both back-tests pin the rates in the fixture (1.0991 variable, 44.62 fixed) rather than calling `tariffs.py`, so a legitimate rate update cannot break the suite; the live derivation is pinned by its own case below. The cases:
- **August check.** Consumed 423, fed-in 342, factor 0.8 gives `computed_gross_pln` within 5% of 214.66.
- **July.** 702 / 372 gives a value within 5% of 495.22 (as a closed-month check fixture).
- **Credit exceeding import.** Only fixed fees are charged, and `credit_left_kwh` > 0.
- **Carried credit.** A left-over of 10 kWh with factor 0.8 adds 8 kWh of credit.
- **Range ordering and shape.** low ≤ projected ≤ high, and the spread is the quadrature combination: import 549.2 kWh, ratio 0.809, factor 0.8, u = 0.15, r = 0.25 gives low 155 PLN and high 361 PLN (±1 PLN).
- **Each `no_data` reason.** A missing snapshot or a consumed value of 0 returns `no_data` and doesn't raise.
- **Day selection.** Days with null import and today are excluded.
- **Rates.** The variable rate equals the `tariffs.py`-derived value (1.0991 at current rates).
- **Few days.** With `n` below 7 the confidence is `low`, and at `n = 1` the uncertainty is the 40% ceiling.
- **Reference lag.** A reference period two months back gives `reference_lag_months: 2`, the 0.40 ratio band and a confidence one tier below the day-count tier; the immediately preceding month gives 0 and 0.25.

### Success Criteria:

#### Automated Verification:

- Lab tests pass: `make test-solar-analyser`
- The August back-test is within 5% of the 214.66 PLN invoice, and the July back-test within 5% of 495.22 PLN (with fixture rates)
- The forecast writes a `no_data` JSON when the snapshot, history or rates are missing, and exits 0
- The existing output keys used by `apps/telegram-home/bot.py` are still present, and `python3 -m py_compile` passes on every changed script
- A reference period two months old yields `reference_lag_months: 2`, the wider ratio band and a confidence one tier lower
- On a `no_data` body the Telegram formatting path prints the reason, not a 0.00 PLN figure

---

## Phase 3: Deploy and verify in the lab

### Overview

Install the collector and forecast on docker-core, fix the net-billing sentence in HA, and check real output. Each step on a running host needs the owner's OK first.

### Changes Required:

#### 1. docker-core install

**File**: `homelab-2 runbooks/energy-analyser-push.md` (the install list), `homelab-2 runbooks/solar-energy-analyser-validation.md:194-204`, and the hosts themselves

**Intent**: Deploy the changed scripts, and the `solar_analyser` sources if `app-src` is older than `tariffs.py`, using the runbook's copy to `/tmp` and `sudo install` flow. Record the new files in the runbook.

**Contract**:
- The runbook's diff check shows docker-core equal to the repo for `collect-ha-snapshot.py`, `build-current-month-bill-forecast.py` and `refresh-energy-agent-data.sh`.
- `app-src` has the current `tariffs.py` and `billing.py`.
- The settlement-history writer, if it is a separate script, is in the install list, and `web/data/pge-settlement-history.jsonl` is recorded as a new data file whose rollback note says leaving it in place is harmless.
- `solar-energy-analyser-validation.md:194-204` no longer describes the 21:00 rule or "the last closed PGE G11 calculation provides the variable gross rate"; it describes the shared day rule, `tariffs.py` rates and the credit.

#### 2. HA report prompt

**File**: `homelab-2 infra/homeassistant/packages/gemini_home_reports.yaml:84`

**Intent**: Replace the net-billing claim with the real scheme.

**Contract**: The prompt states Polish plain text: net-metering (opust) with factor 0.8, monthly settlement, and no amounts in PLN in the report. It is deployed to the UGREEN HA config per the homelab-2 HA runbook, then HA reloads its YAML (with the owner's OK).

### Success Criteria:

#### Automated Verification:

- After one refresh, `current-month-bill-forecast.json` on docker-core has `status: "ok"`, `method: "net_metering_credit_estimate"`, and `closed_month_check.diff_pct` within ±5 for 01.08–31.08.2026
- The refresh log shows no `bill forecast failed`, and the push after it succeeded (runbook check)

#### Manual Verification:

- The owner accepts the September projection (expected around 250 PLN, not 610) as plausible against their PGE experience
- The HA daily report no longer mentions net-billing after the next scheduled run
- Telegram `/energy` shows the bill forecast line, and on a `no_data` body shows the reason instead of a 0.00 PLN figure
- The lab page's current-month forecast card still renders with the new output

---

## Phase 4: Docs and follow-ups

### Overview

Record the rule and decisions in energy-analyser, un-park S-07, and open the follow-up for the invisible export.

### Changes Required:

#### 1. Rule, decisions and prerequisites

**File**: `docs/logic.md`, `docs/decisions.md`, `docs/prerequisites.md` (this repo)

**Intent**: Keep the course-facing docs in step, as the lessons require.

**Contract**:
- `logic.md` gets a "Bill forecast (lab)" rule under the planned or lab section: the formula, the ratio source, the reference-month lag and the re-base when a new invoice arrives, the range, the carried-credit assumption, and the `no_data` reasons.
- `decisions.md` gets a dated 2026-09-27 entry:
  - net-metering 0.8, not net-billing
  - the PGE Sensor is the billing source
  - in-month export is estimated from last month's ratio
  - wM-Bus is parked
  - the invisible export goes to a separate change
- `prerequisites.md`: the S-07 row says `bill-accuracy` is done and names the new collector entities. The "Where things run" row stays as it is.

#### 2. Roadmap and follow-up change

**File**: `context/foundation/roadmap.md`, `context/changes/grid-export-mismatch/change.md`, `context/changes/bill-forecast/change.md`

**Intent**: Make the next steps visible.

**Contract**:
- The roadmap gets open question **5** — the list at `roadmap.md:394` currently ends at 4 — "Why does PGE record export the inverter doesn't see?", covering the night export, possible phase imbalance and the money at stake, with the source in `frame.md`. (`change.md`'s reference to "open question 6" is stale from the pre-v3 roadmap.)
- Decide whether S-07's slice (`roadmap.md:294-304`, today "Blockers: —", "Status: proposed") should record that it was parked on this change.
- The `grid-export-mismatch` folder follows the `/10x-new` semantics, with the evidence from this change in its notes.
- `bill-forecast/change.md` notes that it is unparked and that the lab output now has `settlement` and `closed_month_check`.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check .` passes, and `npm test` still passes in energy-analyser

#### Manual Verification:

- The owner reads the `docs/logic.md` bill rule and finds it understandable without energy knowledge

---

## Testing Strategy

### Unit Tests:

- Collector: the new entity and attribute mapping, the left-over parse, privacy (no names, PPE or invoice numbers), and `unavailable` handling.
- Forecast: the August and July back-tests, credit above import, carried credit, range ordering, every `no_data` reason, day selection, and the rate derivation.

### Integration Tests:

- One real refresh on docker-core after deploy (Phase 3 automated checks).

### Manual Testing Steps:

1. Read `current-month-bill-forecast.json` on docker-core and compare September's projection with the August invoice and your expectations.
2. Check Telegram `/energy`.
3. Read the next HA daily report.

## Migration Notes

- The output keeps its old keys; `pricing.source_month` is replaced by `pricing.source`.
- The settlement history starts empty, so the first runs fall back to the snapshot's current values — the same behaviour as today, with the lag reported. It fills one row per invoice from then on.
- The first refresh after deploy may report `settlement_facts_missing` until the collector has run once with the new map. The next 5-minute cycle fixes that.
- Rollback: reinstall the previous two scripts and the refresh script from git. `rachunek-current.json` is left in place for that reason.

## References

- Frame: `context/changes/bill-accuracy/frame.md`; evidence and connector notes: `context/changes/bill-accuracy/change.md`
- homelab-2: `infra/compose/energy-app/scripts/build-current-month-bill-forecast.py`, `collect-ha-snapshot.py:60-161`, `push-energy-analyser.py:204-298`, `refresh-energy-agent-data.sh:65-69`, `apps/solar-energy-analyser/src/solar_analyser/tariffs.py`, `billing.py:131-167`, `apps/telegram-home/bot.py:242-327`, `infra/homeassistant/packages/gemini_home_reports.yaml:84`, `runbooks/energy-analyser-push.md`
- Lessons: `context/foundation/lessons.md` (prerequisites, docs in step, plan before implementing)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Collect the connector's settlement facts

#### Automated

- [x] 1.1 Lab tests pass: `make test-solar-analyser` — homelab-2@159a060
- [x] 1.2 A privacy test proves names, PPE and invoice numbers never reach the snapshot output or the settlement history — homelab-2@159a060
- [x] 1.4 A second run with the same `reference_period` appends nothing, and a new period appends exactly one row — homelab-2@159a060

#### Manual

- [ ] 1.3 After deploy (Phase 3), one real snapshot on docker-core carries consumed 423, fed-in 342, factor 0.8 and left-over 0 for the 01.08–31.08.2026 period

### Phase 2: Credit-aware forecast

#### Automated

- [ ] 2.1 Lab tests pass: `make test-solar-analyser`
- [ ] 2.2 The August back-test is within 5% of the 214.66 PLN invoice, and the July back-test within 5% of 495.22 PLN (with fixture rates)
- [ ] 2.3 The forecast writes a `no_data` JSON when the snapshot, history or rates are missing, and exits 0
- [ ] 2.4 The existing output keys used by `apps/telegram-home/bot.py` are still present, and `python3 -m py_compile` passes on every changed script
- [ ] 2.5 A reference period two months old yields `reference_lag_months: 2`, the wider ratio band and a confidence one tier lower
- [ ] 2.6 On a `no_data` body the Telegram formatting path prints the reason, not a 0.00 PLN figure

### Phase 3: Deploy and verify in the lab

#### Automated

- [ ] 3.1 After one refresh, `current-month-bill-forecast.json` on docker-core has `status: "ok"`, `method: "net_metering_credit_estimate"`, and `closed_month_check.diff_pct` within ±5 for 01.08–31.08.2026
- [ ] 3.2 The refresh log shows no `bill forecast failed`, and the push after it succeeded (runbook check)

#### Manual

- [ ] 3.3 The owner accepts the September projection (expected around 250 PLN, not 610) as plausible against their PGE experience
- [ ] 3.4 The HA daily report no longer mentions net-billing after the next scheduled run
- [ ] 3.5 Telegram `/energy` shows the bill forecast line, and on a `no_data` body shows the reason instead of a 0.00 PLN figure
- [ ] 3.6 The lab page's current-month forecast card still renders with the new output

### Phase 4: Docs and follow-ups

#### Automated

- [ ] 4.1 `npx prettier --check .` passes, and `npm test` still passes in energy-analyser

#### Manual

- [ ] 4.2 The owner reads the `docs/logic.md` bill rule and finds it understandable without energy knowledge
