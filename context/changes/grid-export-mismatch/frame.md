# Frame Brief: Grid export mismatch → night-time grid import

> The framing step before /10x-plan. This records what the problem _actually_ is, kept apart from what was
> first assumed.

## Reported Observation

For the August period (01.08–31.08.2026) PGE settled **342 kWh** fed into the grid, while the Deye inverter's export
counter reads **94.7 kWh** and its summed grid power about **95 kWh**. Import agrees: Deye 433.6 kWh against PGE's
423 (+2.5%). PGE was said to record export at night. In 2026-07-17..31 the Deye counters looked swapped (Deye export
matched PGE import on several days). (`change.md`; `context/archive/2026-09-27-bill-accuracy/change.md:16,29`,
`plan.md:13`.)

## Initial Framing (preserved)

- **Owner's stated cause**: a phase imbalance. The billing meter settles each phase separately, so a surplus on one
  phase counts as export while the house draws on another. The inverter is three-phase (Deye `SG0*LP3`, homelab-2
  `docs/migration/deye-integration-research.md:95`).
- **Owner's proposed direction**: check the meter model and wiring; compare the PGE hourly CSV with the inverter's
  night-time grid power; consider a meter-grade source (wM-Bus, MojeIRE).
- **Pre-dispatch narrowing (2026-09-30)**: first "an in-month export figure". Then corrected by the owner: "I'm more
  concerned about information about night consumption, so import". Both "how much I draw at night" and "whether
  the night numbers are right". The owner has not seen the night export first-hand and wants to know where the claim
  came from. PGE data reaches Home Assistant through the HA PGE integration; the meter model is unknown.

## Dimension Map

1. **PGE figure semantics** — 342 kWh is not the raw export the inverter should see.
2. **Meter phase accounting** — per-phase arithmetic summing at the meter. ← initial framing
3. **Inverter measurement scope and sign** — a CT missing, misplaced or reversed on a phase, or counters that net
   differently for import and export.
4. **Night import visibility and accuracy** — the owner's actual concern: can night-time grid draw be seen, and is
   it right? (added after narrowing)

## Hypothesis Investigation

| Hypothesis                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Verdict                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1. 342 kWh is a different quantity          | HA PGE Sensor v1.5.1 reads the mBOK _sales_ API every 8 h, no hourly data (homelab-2 `collect-ha-snapshot.py:76-96`). 342 = the invoice's `settledEnergyAmount` for 01.08–31.08 (`tests/fixtures/pge_sensor_states.json:58,90-93`), not a meter register; nothing says balanced or raw. July's entry has `leftEnergyAmount` 12.5, against "0 left over" in the bill-accuracy frame (`:97-100`). `pge_settled_energy` 261.81 matches nothing (`:29`).                                                                                                                                                                            | PARTIAL: meaning of 342 unverified                    |
| 1b. "PGE records export at night"           | First appears as a bare sentence in `bill-accuracy/plan.md:13,43` (commit c20addf); flagged in `reviews/impl-review-phase-4.md:111`. The lab never held hourly PGE **export**: every importer keeps only the "En. Czynna zbilansowana" rows (homelab-2 `src/solar_analyser/pge.py:20-23,157-185`; `store-pge-readings-sqlite.py:68`), and the CSV ends 2026-07-31.                                                                                                                                                                                                                                                              | NONE: unsupported claim                               |
| 2. Per-phase summing at the meter ← initial | Arithmetic summing inflates import and export by the same hidden amount H. Export gap ⇒ H ≈ 247 kWh ⇒ predicted PGE import ≈ 680 kWh; actual 423. Hourly balancing can only _lower_ meter export. No meter model, balancing mode or phase-load layout in either repo.                                                                                                                                                                                                                                                                                                                                                           | NONE                                                  |
| 3. Inverter scope or sign                   | Grid entities are DeyeCloud (`collect-ha-snapshot.py:17-33,44-46`); sign import-positive, verified 2026-07-22 (`:35-40`). CT/meter placement and direction are recorded nowhere (`deye-knowledge.md.example:84,95`); one hint that external CTs exist (`inventory/homeassistant/energy-entities.yaml:69`). No second PV source found. Per-phase `gridpowerl1/l2/l3` exist but are collected by no script (`energy-glass.yaml:57-59`). The July swap overlaps lab source/sign changes (07-21, 07-22, commit b985ec0), so a lab mix-up fits better than a physical fault.                                                         | WEAK: plausible, unverifiable from repos              |
| 4. Night import visibility and accuracy     | **Visibility:** the app has daily totals only (`daily_energy`), raw pushes kept 14 days (`20260923101001_push_ingestion.sql:17,147`), and an intraday chart deferred for lack of interval readings (`docs/decisions.md:32`). The lab has PGE's official hourly _import_ up to 2026-07-31 and a 00–06 night bucket (homelab-2 `analyse-pge-usage.py:31-35,80-84`); roadmap S-10 already promises day/night shares from aggregates. **Accuracy:** monthly import agrees within 2.5% since August; night- or hour-level agreement has never been checked, and the only hourly PGE comparison (July) is the swapped-counter period. | STRONG as the real need; accuracy at night unverified |

## Narrowing Signals

- The owner's focus moved from export to night import: "how much I draw at night" and "whether the numbers are
  right" (2026-09-30).
- The owner has not seen the night export, and no data behind it exists in either repo.
- Import agreeing within 2.5% contradicts the leading export hypothesis (per-phase summing) and makes the inverter's
  import usable as a night-import source, subject to an hourly check.

## Cross-System Convention

Reconciling a hybrid inverter's CT readings with the billing meter is normally done hour by hour against the
utility's interval data (here the eBOK/eLicznik CSV: "pobrana", "oddana", "zbilansowana"), with CT placement and
polarity checked on site. Monthly settlement totals from a billing API can't separate these causes. Night-time
import is the classic "base load" measure, and it is usually shown as a night share or an hourly profile; S-10's
day/night shares follow that convention.

## Reframed Problem Statement

> **The real problem to plan around is**: the owner can't see how much the house draws from the grid at night, or
> tell whether that figure is right. The export mismatch is a separate, currently unexplained question that this
> doesn't depend on.

Night import rests on the import side, which agrees with PGE month by month, so it can be built and checked without
solving the export gap. The "night export" that started this change has no evidence behind it. The phase-imbalance
cause is contradicted by the import figures. What remains of the export question (the meaning of 342, CT scope or
polarity) needs data the lab doesn't hold: an August eBOK CSV with "oddana" rows, and per-phase grid history. That
belongs with roadmap open question 5, not with the owner's night-import need.

## Confidence

**MEDIUM.** The reframe rests on the owner's stated focus and on a strong import match. But agreement at _night_ and
_hour_ level is unverified, and the only hourly comparison (July) sits in the swapped-counter period. Verification
before or as part of planning: export the eBOK/eLicznik hourly CSV for August–September (import and "oddana" rows)
and compare the 00–06 hours with the inverter's grid power. The same file answers whether PGE shows any export at
night, and whether 342 equals the summed "oddana" rows.

## What Changes for /10x-plan

Plan around **night-time grid import**: showing it (per night and/or as an hourly or day/night profile) and checking
it against PGE's hourly import. This overlaps roadmap S-10 (usage profile, day/night shares), which the plan must
reconcile with rather than duplicate. The export mismatch should not be planned here: keep it as roadmap open question 5
and correct that question's wording, since its "night export" and "phase imbalance" claims are unsupported or
contradicted.

## References

- homelab-2: `infra/compose/energy-app/scripts/collect-ha-snapshot.py:17-46,76-96`; `apps/solar-energy-analyser/src/solar_analyser/pge.py:20-23,157-185`; `apps/solar-energy-analyser/tests/fixtures/pge_sensor_states.json:29,48-100`; `infra/compose/energy-app/scripts/analyse-pge-usage.py:31-35`; `infra/homeassistant/lovelace/dashboards/energy-glass.yaml:57-59`; `inventory/homeassistant/energy-entities.yaml:69`
- energy-analyser: `context/archive/2026-09-27-bill-accuracy/{change,frame,plan}.md`, `reviews/impl-review-phase-4.md:111`; `docs/decisions.md:32`; `supabase/migrations/20260923101001_push_ingestion.sql:17,147`; `context/foundation/roadmap.md` (S-10, open question 5)
- Investigation tasks: PGE figure semantics and night-export provenance; inverter measurement scope and sign; meter phase-accounting check (2026-09-30)
