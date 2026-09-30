---
change_id: inverter-grid-correction
title: Handle the inverter's wrong grid reading across the whole history
status: preparing
created: 2026-09-30
updated: 2026-09-30
archived_at: null
---

## Notes

Opened 2026-09-30 after comparing PGE's hourly meter data (eBOK CSV, held in the lab's `pge_hourly_reading` on the homelab) with the inverter's grid reading hour by hour for 16 July – 31 August 2026. Follows roadmap open question 5 and the archived `grid-export-mismatch` change (`context/archive/2026-09-28-grid-export-mismatch/`).

What the comparison found (aggregates only; no PGE or lab rows are kept in this repo):

- The inverter's grid reading is wrong for the **whole** history, not only from 2026-08-04 as the app says today (`GRID_IMPORT_OVERSTATED_FROM`, `src/lib/services/calendar-view.ts:57`).
- Hourly fit on import-only hours: 17 July – 3 August `inverter_net = −0.53 · PGE_net − 0.70` kWh/h (R² 0.99); 4 – 31 August `inverter_net = +0.53 · PGE_net + 0.70` (R² 0.90). The sign flipped on 3–4 August (the CT direction was most likely reversed); the scale was not fixed.
- July: the inverter's import is 151 kWh against PGE's hourly-balanced ~350 kWh (under-read). August: the inverter's net import is ~260 kWh above PGE's; export 95 against 342 kWh.
- The counters net the three phases arithmetically (per-phase counting ruled out). Most likely cause, unverified: a CT paired with the wrong phase voltage (cos 120° ≈ −0.5 plus a reactive offset), then its polarity flipped on 3–4 August. Zero-export regulation on the wrong reading pushes ~0.85 kW to the grid; ~100 kWh of battery energy was exported at night in August.
- The root fix is physical (installer: CT placement and phase mapping), not yet confirmed or scheduled.
- PGE hourly data arrives about 1.5 months late, so it can correct history but not recent days.

Research: `research.md`. A draft `plan.md` lays out options A–D without choosing; it needs the owner's decisions (open questions at its top) before `/10x-plan` finalises it. No code has changed.
