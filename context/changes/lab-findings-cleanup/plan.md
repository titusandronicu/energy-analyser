# Lab Findings Cleanup Implementation Plan

## Overview

The dashboard's "Najważniejsze ustalenia" come from fixed rules in homelab-2's `build_findings()`, not from the LLM. Three of them mislead the owner almost daily, and every text lacks Polish diacritics. This change fixes the rules in the lab, following the owner's decisions of 2026-09-30 (research.md, "Owner decisions"). It also covers the rules with tests for the first time. The app needs no change.

## Current State Analysis

From `context/changes/lab-findings-cleanup/research.md`:

- `build_findings()` (homelab-2 `infra/compose/energy-app/scripts/build-energy-agent-briefing.py:46-185`) emits dicts `{severity, title, fact, meaning, suggested_check}` from the snapshot's `values`, `balance_today` and `raw_entities`.
- **"Rozjazd"** (:161-174) compares a stale June bill (`pge_computed_rachunek_pln`, from the hand-kept `rachunek-current.json`) with the latest invoice amount. It fired on 24.5% of snapshots since 09-04.
- **"Wysoki import dzisiaj"** (:77) uses a fixed 6 kWh threshold on the faulty grid sensor. It fired on 64.6% of snapshots.
- **"Zalegla platnosc PGE"** (:113-128) fires from day 1 past the due date, and its text mentions "wstrzymanie dostaw".
- The weak-forecast label says "Forecast.Solar", but `forecast_tomorrow_kwh` has been Solcast since 2026-09-26. "Tania energia, warto ladowac" gives advice.
- `closed_month_check` in `web/data/current-month-bill-forecast.json` (`build-current-month-bill-forecast.py:451-474`) compares the same period's computed and invoiced bill. For August it reads 208.83 vs 214.66 zł, −2.7%, `ok: true`.
- `build_findings` has no tests. `apps/solar-energy-analyser/tests/test_energy_agent_briefing_script.py` loads the script via importlib and is discovered by `make test-solar-analyser`.
- Deploy copies the scripts to docker-core by hand (`runbooks/energy-analyser-push.md:50-66`), and `build-energy-agent-briefing.py` is missing from that copy list.

## Desired End State

- **"Rozjazd"** appears only when the latest closed month's computed bill and its invoice differ by more than the check's own threshold (`ok: false`). It names the period and both amounts, and never uses `rachunek-current.json`.
- **"Wysoki import dzisiaj"** is gone.
- **"Zaległa płatność PGE"** appears only 7 or more days past the due date with a positive balance. It is info, with neutral wording.
- **Every finding text has Polish diacritics.** The forecast label names Solcast, and the cheap-energy finding states a fact, not advice.
- **Tests pin each changed rule's boundaries** and the diacritics.
- **The runbook's copy list includes the briefing script.** Deploying to docker-core happens only with the owner's OK.

## What We're NOT Doing

- **The export rule and the home-load rule** keep their logic (owner, 2026-09-30); only their copy gets diacritics.
- **`rachunek-current.json`**, its HA REST sensor and the old web page are left alone; only the findings stop reading it.
- **No new import rule** against a baseline. That is a later change, after the installer's sensor fix.
- **No app, contract, migration or LLM prompt changes.**
- **Reordering the refresh script:** not done. The briefing reads the forecast file from the previous 5-minute run, which is acceptable.

## Implementation Approach

1. Load `current-month-bill-forecast.json`'s `closed_month_check` in `build_bundle` next to the snapshot (a missing or unreadable file means no check).
2. Rewrite the three rules and the copy.
3. Test `build_findings` directly with synthetic snapshots.
4. Update the runbook.

## Phase 1: Rules, copy and tests (homelab-2)

### Overview

Change `build_findings()` per the owner's decisions and pin it with unit tests.

### Changes Required:

#### 1. Briefing script

**File**: homelab-2 `infra/compose/energy-app/scripts/build-energy-agent-briefing.py`

**Changes**:

- **Read the check.** A helper `load_closed_month_check(path)` returns the `closed_month_check` dict from the bill-forecast JSON, or `None` when the file is missing, unreadable or has no check. It takes a CLI option (`--bill-forecast`, defaulting to the stack's `web/data/current-month-bill-forecast.json`, following the script's existing path options). `build_findings(snapshot, closed_month_check=None)` accepts it.
- **"Rozjazd".**
  - Remove the rule based on `pge_computed_rachunek_pln` / `pge_live_invoice_amount_pln`, together with `drift_pct` if nothing else uses it.
  - New rule: when the check is present and `ok is False`, emit warn "Rozjazd: rachunek liczony a faktura PGE".
  - Fact: "Za okres {period} policzono {computed} zł, a faktura PGE to {invoice} zł ({diff_pct:+.1f}%)."
  - Meaning: the tariff or the settled kWh used by the calculation may differ from PGE's.
  - Suggested check: compare the invoice's positions with the tariff.
- **"Wysoki import dzisiaj":** remove the rule.
- **"Zaległa płatność PGE".**
  - Condition: the due date is at least 7 days before today and the balance is above 0 (`PAYMENT_GRACE_DAYS = 7`). Severity: info.
  - Fact: "Termin płatności PGE minął {n} dni temu ({date}), saldo {balance} zł."
  - Meaning: "Wpłata mogła jeszcze nie dotrzeć albo nie została zaksięgowana."
  - Suggested check: "Sprawdź saldo w eBOK PGE."
  - No mention of cutting off supply.
- **Weak forecast:** fact "Solcast przewiduje {x} kWh na jutro."
- **Cheap energy:** title "Tania energia teraz". The fact states the price flag, SOC and import. It contains no "warto ładować" and no instruction.
- **Diacritics:** every remaining Polish string (titles, facts, meanings, suggested checks, the "Brak pilnych anomalii" fallback) is rewritten with correct Polish characters. The file must be UTF-8, and the JSON must be written with `ensure_ascii=False` if it isn't already, so the texts are not escaped.

#### 2. Tests

**File**: homelab-2 `apps/solar-energy-analyser/tests/test_energy_agent_briefing_script.py`

**Changes** (synthetic snapshots only):

- "Rozjazd":
  - absent when the check is `None` or `ok` is true;
  - present, as warn, when `ok` is false, naming the period and both amounts;
  - never present because of `pge_computed_rachunek_pln` alone.
- No "Wysoki import" at any import value.
- Payment:
  - absent at 6 days past due;
  - present, as info, at 7 days;
  - absent when the balance is 0;
  - the text never contains "wstrzyman".
- The forecast fact contains "Solcast". The cheap-energy finding has no "warto".
- The "Brak pilnych anomalii" fallback is still emitted when nothing fires.
- Every emitted title contains only valid Polish, checked by asserting known diacritic titles such as "Zaległa płatność PGE".

### Success Criteria:

#### Automated Verification:

- Solar analyser tests pass: `make test-solar-analyser` (run in homelab-2)
- Push script tests still pass: `cd infra/compose/energy-app && python3 -m unittest scripts/test_push_energy_analyser.py`
- The script compiles: `python3 -m py_compile infra/compose/energy-app/scripts/build-energy-agent-briefing.py`
- No stale copy remains: `grep -n "Forecast.Solar przewiduje\|Wysoki import\|wstrzyman\|warto ladowac\|rachunek_pln" infra/compose/energy-app/scripts/build-energy-agent-briefing.py` prints nothing

#### Manual Verification:

- Run the new script read-only against a copy of the current lab snapshot and forecast file (in the scratchpad, never committed). Check that the findings list has no "Wysoki import" and no "Rozjazd" (August's check is ok), and that it reads naturally in Polish.

---

## Phase 2: Runbook and lab deploy

### Overview

Record the deploy step, then, only with the owner's OK, put the script on docker-core and check the result in the app.

### Changes Required:

#### 1. Runbook

**File**: homelab-2 `runbooks/energy-analyser-push.md`

**Changes**: add `build-energy-agent-briefing.py` to the copy lists at :50-66, with the same `.bak` and `install -m 0755` steps as the other scripts. Add a one-line note that the findings read `current-month-bill-forecast.json`'s `closed_month_check`.

#### 2. energy-analyser docs

**File**: energy-analyser `docs/prerequisites.md` (the lab jobs section) and `docs/logic.md` (Findings)

**Changes**: note that the lab's findings are fixed rules in `build-energy-agent-briefing.py`, which the app shows as sent. List the rules that exist after this change (payment grace 7 days, "Rozjazd" from the closed-month check, no import rule while the sensor is faulty). This follows the lesson "Keep the project docs in step with the code".

### Success Criteria:

#### Automated Verification:

- Runbook lists the script: `grep -n "build-energy-agent-briefing.py" runbooks/energy-analyser-push.md` prints at least one line (homelab-2)
- App docs formatted: `npx prettier --check docs` (energy-analyser)

#### Manual Verification:

- With the owner's explicit OK, copy the script to docker-core per the runbook. The next refresh's `energy-agent-briefing.json` then has diacritics, no "Wysoki import" and no stale "Rozjazd".
- After the next LLM refresh (about 55 minutes), the dashboard's "Najważniejsze ustalenia" show the new findings.

---

## Testing Strategy

- Unit tests call `build_findings` directly with synthetic snapshot dicts and synthetic `closed_month_check` dicts, covering the boundaries above.
- The Phase 1 manual check runs the script on copies of the real lab files in the scratchpad only. No lab data enters either repository.

## Migration Notes

There are no data migrations. Rollback is restoring the `.bak` copy of the script on docker-core. Findings already stored in the app stay as they were sent.

## References

- Research: `context/changes/lab-findings-cleanup/research.md`
- Related: `context/changes/inverter-grid-correction/` (faulty grid sensor), `context/archive/2026-09-30-history-backfill/` (earlier homelab-2 change tracked here)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rules, copy and tests (homelab-2)

#### Automated

- [x] 1.1 Solar analyser tests pass: `make test-solar-analyser` — 6e92c27
- [x] 1.2 Push script tests still pass: `python3 -m unittest scripts/test_push_energy_analyser.py` — 6e92c27
- [x] 1.3 The script compiles: `python3 -m py_compile …/build-energy-agent-briefing.py` — 6e92c27
- [x] 1.4 No stale copy remains: the grep prints nothing — 6e92c27

#### Manual

- [ ] 1.5 Dry run on copies of the lab files: no "Wysoki import", no stale "Rozjazd", natural Polish

### Phase 2: Runbook and lab deploy

#### Automated

- [x] 2.1 Runbook lists the script: grep prints at least one line — 214bc80
- [x] 2.2 App docs formatted: `npx prettier --check docs` — 49f4c53

#### Manual

- [ ] 2.3 With the owner's OK, the script is deployed to docker-core and the next briefing shows the new findings
- [ ] 2.4 The dashboard's "Najważniejsze ustalenia" show the new findings after the next LLM refresh
