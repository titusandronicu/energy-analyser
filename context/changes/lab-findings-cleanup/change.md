---
change_id: lab-findings-cleanup
title: Fix the lab's rule-based findings shown as "Najważniejsze ustalenia"
status: impl_reviewed
created: 2026-09-30
updated: 2026-09-30
archived_at: null
---

## Notes

The "Najważniejsze ustalenia" the app shows are not LLM output: they come from fixed rules in homelab-2 `infra/compose/energy-app/scripts/build-energy-agent-briefing.py` `build_findings()` (about lines 46–185), copied verbatim by `push-energy-analyser.py` (about lines 214–217). The owner reported them as not valid (2026-09-30 audit):

- "Rozjazd" compares a stale `rachunek-current.json` (21 July, June's gross bill 667.51 zł, via the `sensor.solar_analyser_rachunek_pge` REST sensor) with `pge_invoice_amount`, which flips between 214.66 zł and 6.65 zł (probably an interest note).
- "Wysoki import" uses a fixed 6 kWh threshold crossed every day by about 06:00, on the inverter's grid sensor, which is wrong for the whole history (`inverter-grid-correction`).
- "Zaległa płatność" matched PGE's data but is now cleared; its wording is too blunt.
- The export rule reads the broken export counter; the Forecast.Solar label is stale; texts have no Polish diacritics.

Proposed direction: drop or rebuild "Rozjazd" from the closed-month check; drop or baseline "Wysoki import" (with the sensor caveat); soften and debounce "Zaległa płatność"; add diacritics; retire rachunek-current.json; ignore the PGE invoice amount when settlement sensors are unavailable. Code lives in homelab-2; this folder tracks the change, as with `history-backfill`.
