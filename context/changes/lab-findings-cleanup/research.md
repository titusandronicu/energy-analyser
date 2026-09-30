---
topic: Why the lab's "Najważniejsze ustalenia" are wrong, and what can replace each rule
date: 2026-09-30
researcher: Claude (Opus 5.5) for the owner
repositories: homelab-2 (code), energy-analyser (display)
status: complete
last_updated: 2026-09-30
last_updated_by: Claude
---

# Research: lab findings cleanup

## Question

The owner reported that the "Najważniejsze ustalenia" on the dashboard are not valid. Where do they come from, why are they wrong, and what data exists to replace each rule?

## Summary

- **The findings are not written by the LLM.** They come from eleven fixed rules in homelab-2 `infra/compose/energy-app/scripts/build-energy-agent-briefing.py` `build_findings()` (:46-185). The push copies them verbatim (`push-energy-analyser.py:58`, `:201-231`), and the LLM prompts and the memory file (`run-energy-advisory.py:127`, `run-ha-conversation-advisory.py:56-65`, `write-energy-memory-md.py:121-125`) and the Telegram bot (`apps/telegram-home/bot.py:243,369`) all receive them as facts.
- **Four rules produce most of what the owner sees, and each has a defect:**
  - "Rozjazd": the wrong period is compared.
  - "Wysoki import": a fixed threshold on a faulty sensor.
  - "Zaległa płatność": no grace period or debounce, and wording that is too blunt.
  - The export rule: a broken counter.
- **Other defects:** one label is stale (Forecast.Solar), no text has Polish diacritics, and no finding is tested.
- **The app needs no change.** Titles, wording, diacritics and the number of findings are free-form within the contract (`src/lib/ingest/contract.ts:16-17,33-38`: at most 50 items, strings up to 500 characters). Severity is mapped `warn|ok|info`, and anything else shows a grey "Bez oceny" (`src/lib/services/recommendation.ts:25-44`). No app test or doc pins lab wording.

## Rules, inputs and frequency

Frequency comes from re-running the current `build_findings` over the 17,286 stored snapshots (2026-07-17 to 2026-09-30, `private/energy.sqlite3` `energy_snapshot`). It is an approximation, because the script last changed on 7 August.

| Rule (title, severity)                                  | Condition (file:line)                               | Input source                                                                                                                                                 | Fired                                              | Verdict                                                                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Rozjazd: rachunek liczony vs faktura PGE", warn/info   | drift > 2%, warn > 10% (:161-174, `drift_pct` :204) | `pge_live_invoice_amount_pln` against `pge_computed_rachunek_pln` (REST sensor over hand-kept `rachunek-current.json`, June bill 667.51 zł, generated 07-21) | 24.5% of snapshots, 19 days since 09-04            | **Invalid.** Compares June's computed bill with whatever the latest invoice is. The invoice amount flaps 214.66 / 6.65 zł since 09-09 (6.65 is probably an interest note). |
| "Wysoki import dzisiaj", warn                           | import today > 6 kWh (:77)                          | DeyeCloud station daily import counter (`collect-ha-snapshot.py:45`)                                                                                         | 64.6%, 60 days                                     | **Misleading.** 6 kWh is crossed almost every day by morning, and the grid sensor is wrong for the whole history (`inverter-grid-correction`).                             |
| "Zalegla platnosc PGE", warn                            | due date < today and balance > 0 (:113-128)         | raw `pge_live_payment_due_date`, `pge_live_balance_pln`                                                                                                      | 49.5%, 34 days (08-07..09-29)                      | **Correct data, but blunt and not debounced.** It fires from the first day past the due date and mentions "wstrzymanie dostaw".                                            |
| "Eksport przy niepelnej baterii", warn                  | export > 4 kWh and SOC < 96 (:68)                   | DeyeCloud daily export counter (`collect-ha-snapshot.py:46`)                                                                                                 | 16 days, 07-17..08-03 only                         | **Dead since the sensor flip.** The export counter reads 0 from about mid-August while PGE records real export.                                                            |
| "Slabsza prognoza PV na jutro", info                    | forecast < 18 kWh (:86)                             | `forecast_tomorrow_kwh`, which is **Solcast** since 2026-09-26 (collector :65-67)                                                                            | never                                              | The label says "Forecast.Solar", which is stale.                                                                                                                           |
| "Duze obciazenie domu teraz", info                      | home load > 4.5 kW (:95)                            | live load, derived from the same faulty sensor                                                                                                               | 12.5%                                              | The load figure is unreliable (same sensor).                                                                                                                               |
| "Temperatura baterii do obserwacji", warn               | ≥ 38 °C (:104)                                      | battery temperature                                                                                                                                          | 12 days, 07-23..08-03                              | Plausible as is.                                                                                                                                                           |
| "Tania energia, warto ladowac", info                    | cheap price, SOC < 95, import > 100 W (:130-140)    | price flags                                                                                                                                                  | 10.7%                                              | Plausible, but "warto ładować" is advice and the app never advises (PRD).                                                                                                  |
| "Droga energia, a dom importuje", warn                  | expensive price and import > 100 W (:142-149)       | price flags                                                                                                                                                  | never (`price_is_expensive` always false in Sept.) | Harmless.                                                                                                                                                                  |
| "Solar Accelerator: brak lacznosci z falownikiem", warn | link sensor off (:151-159)                          | `accelerator_inverter_link_ok`                                                                                                                               | never                                              | Harmless.                                                                                                                                                                  |
| "Brak pilnych anomalii", ok                             | nothing else fired (:176)                           | —                                                                                                                                                            | 10.5%, last 09-07                                  | Fine.                                                                                                                                                                      |

All titles and texts are ASCII Polish with no diacritics.

## Replacement data that already exists

- **"Rozjazd" can move to the closed-month check.** `build-current-month-bill-forecast.py:451-474` writes `closed_month_check` (`period`, `computed_gross_pln`, `invoice_gross_pln`, `diff_pct`, `ok` when |diff| ≤ 5%) to `web/data/current-month-bill-forecast.json`. For August it computes 208.83 zł against a 214.66 zł invoice, −2.7%, `ok: true`. It pairs the same period's settled kWh with that period's invoice (`pge-settlement-history.jsonl`) and uses the tariff positions, not `rachunek-current.json`. The app already shows this check on the bill forecast card (`BillForecastCard.astro:57`).
  - **Ordering:** `refresh-energy-agent-data.sh` builds the briefing at :35, but the settlement history is appended at :43 and the forecast written at :76. The briefing would read the previous run's file, 5 minutes old. That is acceptable, or the briefing step can move.
- **Nothing produces `rachunek-current.json`.** It is a hand-kept file on docker-core, ignored by git (`.gitignore:31`). Its consumers are the HA REST sensor (`infra/homeassistant/packages/solar_dashboard_analyser.yaml:20-35`), the old analyser web page (`apps/solar-energy-analyser/web/app.js:295,1674`) and two runbooks. The bill forecast already stopped reading it (`build-current-month-bill-forecast.py:179`).
- **For a debounce:** no streak logic exists. `pge-settlement-history.jsonl` (`append-pge-settlement-history.py:96-117`: atomic write, dedupe, unreadable-file guard) is the pattern for a small state file. A due-date grace period (for example 7 days) needs no state at all.
- **Import baseline:** `push-energy-analyser.py:240-277` (`counters_usable`, `daily_counters`) gives per-day usable counters, which could feed a norm. But any import-based rule inherits the faulty sensor until the installer fixes it.

## Delivery facts

- **Findings reach the app only with a valid LLM response** (`build_recommendation` returns None otherwise, :202-211). The app stores a recommendation once per `generated_at` (about every 55 minutes), so what the app shows is frozen at the first push after each new response.
- **Tests:** `build_findings` has none. The runner is unittest (`make test-solar-analyser` covers `apps/solar-energy-analyser/tests`). Script tests in `infra/compose/energy-app/scripts/test_*.py` run by hand with `python3 -m unittest`. `apps/solar-energy-analyser/tests/test_energy_agent_briefing_script.py` loads the script with importlib and covers only the sanity checks.
- **Deploy:** homelab-2 has no CI. Scripts are copied to docker-core `/srv/homelab/energy-app-stack/scripts` with `scp` and `sudo install`, keeping `.bak` files (`runbooks/energy-analyser-push.md:50-66`). `build-energy-agent-briefing.py` is **missing from that runbook's copy list**. The 5-minute systemd timer runs fresh processes, so no restart is needed. Changing files on docker-core is a lab deploy; it follows homelab-2's AGENTS.md and needs the owner's OK.

## Open questions for the owner

1. **"Rozjazd":** replace it with a finding built from `closed_month_check` (fires only when `ok` is false), or drop it, since the bill card already shows the check?
2. **"Wysoki import":** drop it while the sensor is faulty, keep it with a sensor caveat, or rebuild it against a recent-days baseline?
3. **"Zaległa płatność":** grace period (how many days?) and softer wording without "wstrzymanie dostaw"? Keep it as warn, or make it info?
4. **Export rule and the "Duże obciążenie" load rule:** drop both, since they read the broken counter and the faulty sensor?
5. **"Tania energia, warto ładować":** reword as a fact ("Tania energia teraz"), since the app gives no advice?
6. **`rachunek-current.json`:** retire the REST sensor and the old web page's use of it in this change, or leave them and only stop the findings reading it?
7. **Deploy:** the scripts are copied to docker-core per the runbook, which changes the lab and needs the owner's OK. Should this change also add the missing briefing script to the runbook?

## Owner decisions (2026-09-30)

1. **"Rozjazd":** rebuilt from `closed_month_check`. It fires only when the check is present and `ok` is false, and it names the period, the computed and invoice amounts and the gap. The previous run's file (5 minutes old) is acceptable.
2. **"Wysoki import":** dropped while the grid sensor is faulty (see `inverter-grid-correction`). Re-adding it against a baseline is a later change.
3. **"Zaległa płatność PGE":** fires only 7 or more days past the due date with a balance above 0. Severity is info, and the wording is neutral, with no mention of "wstrzymanie dostaw".
4. **Copy and labels:** Polish diacritics in every text; the forecast label names Solcast; "Tania energia, warto ładować" becomes a fact ("Tania energia teraz"), with no advice.
5. **Not in this change:** the export and load rules stay as they are, apart from the copy fixes. `rachunek-current.json` and its REST sensor stay; only the findings stop reading it.
6. **Deploy:** not approved yet. The change ships as a homelab-2 PR with tests. Copying the script to docker-core waits for the owner's explicit OK.
