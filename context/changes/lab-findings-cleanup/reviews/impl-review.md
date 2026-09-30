<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Lab Findings Cleanup

- **Plan**: context/changes/lab-findings-cleanup/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated criteria re-run on homelab-2 main at 6d23a94 and energy-analyser main:

- `make test-solar-analyser` (128 tests), the push tests (91), `py_compile` and the stale-copy grep all pass. The runbook lists the script 4 times, and prettier passes on the docs.
- All 8 Progress rows are ticked. 2.3 and 2.4 were checked live: the briefing on docker-core and the production dashboard show only "Brak pilnych anomalii", with diacritics.
- Every planned rule change matches.
- The export, home-load and battery-temperature logic is unchanged, compared against `6d23a94^`.
- Test data is synthetic only.
- No consumer (memory file, advisory, Telegram, push) matches on the removed titles.

## Findings

### F1 — A briefing crash stops the whole 5-minute refresh

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: homelab-2 `infra/compose/energy-app/scripts/refresh-energy-agent-data.sh:2,35`; `build-energy-agent-briefing.py` (the `raw_entities.get(X) or {}).get("state")` pattern)
- **Detail**: The refresh runs under `set -eu`, and the briefing step (:35) is its first builder with no guard. Any exception in `build_findings` or `build_bundle` therefore stops history, SQLite, the forecast, the memory file and the push. The bill forecast step already has a `|| echo warning` guard (:80-81). This change adds logic but no new crash path. However, the review reproduced an existing one: a raw entity that is not a dict (for example `{"pge_live_payment_due_date": "2029-01-01"}`) raises AttributeError. The refresh also doesn't pass `--bill-forecast "$STACK_DIR/…"`, so an `ENERGY_STACK_DIR` override is ignored for that input.
- **Fix**: In the briefing script, read raw entity state through a small `entity_state(raw, key)` helper that tolerates non-dict values, and test it. In `refresh-energy-agent-data.sh`, guard the step (`|| echo "refresh: warning: briefing failed; keeping the previous briefing" >&2`) and pass `--bill-forecast "$STACK_DIR/web/data/current-month-bill-forecast.json"`. Redeploy both scripts per the runbook, with backups.
  - Strength: the push and history keep running even if a rule breaks, the same as the forecast step.
  - Tradeoff: a failing briefing leaves the previous findings in place, visible only in the journal.
  - Confidence: HIGH — the crash was reproduced and the guard pattern already exists in the same script.
  - Blind spot: whether the push should carry a stale briefing; it already does when the LLM response is older.
- **Decision**: FIXED — `entity_state` helper for raw entities; refresh guards the briefing step and passes `--bill-forecast` under `$STACK_DIR`

### F2 — "Rozjazd" can warn with a misleading fact on malformed input

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 `build-energy-agent-briefing.py:176-189`
- **Detail**: If either amount is not a number, it prints as "0.00 zł". A missing `diff_pct` prints "+0.0%", and NaN prints "nan zł". The finding is still a warn in all three cases. The producer always writes rounded floats and a real bool, so the risk is low.
- **Fix**: Emit the finding only when both amounts are finite numbers, and leave out the "(±x%)" when `diff_pct` isn't a finite number. Add tests for string amounts, a missing `diff_pct` and `ok: "false"`.
- **Decision**: FIXED — Rozjazd only for finite numeric amounts; "(±x%)" left out without a finite `diff_pct`

### F3 — Findings format numbers with a dot, but the app uses Polish commas

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: homelab-2 `build-energy-agent-briefing.py` (all findings: "111.11 zł", "0.30 zł/kWh", "5.0 kWh", "1.20 kW", "38.5 °C"); tests pin the dot
- **Detail**: The app shows every other figure in pl-PL ("8,1 kWh", `src/lib/format/values.ts:5`), so the findings are now the only dotted numbers on the card.
- **Fix**: Add a `pl_number(x, digits)` helper (comma decimal) that the `kwh`, `kw` and amount formatting in the findings use, and update the pinned test strings. Percentages are formatted the same way ("+11,1%").
- **Decision**: FIXED — `pl_number` comma formatting for every figure in the findings; pinned tests updated

### F4 — `docs/prerequisites.md` not updated

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: energy-analyser `docs/prerequisites.md:12` (lab stack row)
- **Detail**: Phase 2 §2 asked for a note there as well. Only `docs/logic.md` was updated.
- **Fix**: In the lab stack row, note that the briefing step builds the findings from fixed rules and reads the previous run's bill forecast (`closed_month_check`).
- **Decision**: FIXED — lab stack row notes the findings rules, the forecast dependency and the guarded step

### F5 — A due date written as a timestamp silently drops the payment finding

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 `build-energy-agent-briefing.py:127`
- **Detail**: `date.fromisoformat` rejects "2030-01-01T00:00:00+00:00", so if the HA sensor ever reports a timestamp, the finding disappears without any trace.
- **Fix**: Parse the first 10 characters when the state looks like an ISO timestamp, and test it.
- **Decision**: FIXED — due date accepts ISO timestamps (first 10 chars)

### F6 — Two texts lean towards advice

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: homelab-2 `build-energy-agent-briefing.py:101` ("wieczorna rezerwa baterii ma większe znaczenie"), `:120` ("Zbieraj trend z kilku dni, zanim powstanie automatyczna rekomendacja")
- **Detail**: The PRD says the app never advises. Neither line is a direct instruction, but both hint at one.
- **Fix**: State facts: ":101 → 'Przy słabszej produkcji bateria ładuje się z paneli mniej.'"; ":120 → 'Porównaj z odczytami z kilku ostatnich dni.'"
- **Decision**: FIXED — both texts reworded to facts/checks per the fix

### F7 — Diacritics tested in titles only

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: homelab-2 `apps/solar-energy-analyser/tests/test_energy_agent_briefing_script.py`
- **Detail**: An ASCII word could creep back into a fact, meaning or check without any test failing.
- **Fix**: Add a test that builds every finding from a snapshot that triggers all rules and asserts that no text contains known ASCII forms ("zl ", "Zalegla", "platnosc", "ladowac", "obciazenie", "Mozliwy").
- **Decision**: FIXED — all-rules test asserts no ASCII forms or dotted numbers in any text field

Out of scope, noted only: the sanity-check and LLM-prompt texts still lack diacritics (not shown in the app); `collect-ha-snapshot.py:97` still collects `pge_computed_rachunek_pln`; the old web page (`apps/solar-energy-analyser/web/app.js:813`) has its own JS findings.
