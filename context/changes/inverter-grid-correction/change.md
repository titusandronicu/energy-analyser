---
change_id: inverter-grid-correction
title: Handle the inverter's wrong grid reading across the whole history
status: implementing
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
- House use is derived from the same sensor: from 2026-08-04 the inverter's power balance `pv + grid + battery − load` closes on every sample (+130–190 W residual = losses), while true night load (PGE net + inverter output) stays ~0.7–0.8 kW and the inverter's load swings 0.48–1.79 kW.
- The root fix is physical (installer: CT placement and phase mapping), not yet confirmed or scheduled.
- PGE hourly data arrives about 1.5 months late, so it can correct history but not recent days.

**Owner's decisions (2026-09-30):**

- Option A: one whole-history caveat for grid import and house use.
- Option D: the installer check runs in parallel, outside the app.
- Option B (fitted correction) is rejected.
- Option C (PGE figures for closed days) is a separate later change.
- Days whose 14-day rating norm would span the sensor change (2026-08-04 – 08-17) read "Poza oceną", and norms never mix days from both sides.
- After the fix, the old history is kept with the caveat.

Research: `research.md`. Plan: `plan.md` (brief: `plan-brief.md`). No code has changed yet.
