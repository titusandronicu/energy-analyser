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

| Hypothesis                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Verdict                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. 342 kWh is a different quantity          | **Verified 2026-09-30** against the owner's eBOK hourly CSV for August (three row types, 31 days). "En. Czynna zbilansowana" equals `pobrana − oddana` for every hour (696/696). Summing each hour's net gives **import 423.5, export 341.5 kWh**, the invoice's 423 and 342; the raw registers read 549.7 and 467.7. PGE settles on hourly-balanced values; in 373 of 744 hours the connection both drew and fed in within the hour. The HA PGE Sensor exposes only the invoice figure (`settledEnergyAmount`, homelab-2 `tests/fixtures/pge_sensor_states.json:58,90-93`).                                                                              | STRONG: resolved, 342 = hourly-balanced export                                                                            |
| 1b. "PGE records export at night"           | The claim had no data behind it (`bill-accuracy/plan.md:13`; the lab keeps only balanced rows, homelab-2 `src/solar_analyser/pge.py:157-185`). The August CSV confirms it: "oddana" is non-zero at 00–06 on all 31 nights (83.9 kWh raw, 35.2 kWh after hourly balancing), with swings of ±4–5 kWh an hour on Aug 1–3.                                                                                                                                                                                                                                                                                                                                    | STRONG: true, now evidenced                                                                                               |
| 2. Per-phase summing at the meter ← initial | Net import is independent of how phases or hours are balanced: PGE net = 423.5 − 341.5 = **82 kWh**, inverter net = 433.6 − 94.7 = **339 kWh**. No balancing scheme turns one into the other. The earlier "import matches within 2.5%" compared the inverter's import with PGE's _balanced_ import, two different quantities.                                                                                                                                                                                                                                                                                                                             | NONE                                                                                                                      |
| 3. Inverter scope or sign                   | Hour by hour against the lab's 5-minute `grid_w` history (docker-core `/srv/homelab/energy-app-stack/web/data/energy-history.jsonl`, 718 August hours with ≥ 6 samples): the inverter reports **~265 kWh more net import** than PGE. From Aug 4 the gap is at every hour, −0.1 to −0.4 kWh/h at night and up to −0.8 kWh/h in the evening, and it grows with house load (≈ 800–1,900 W), including hours with no PV. Aug 1–3 run the other way (+10 to +28 kWh/day). CT placement and polarity are recorded nowhere (homelab-2 `deye-knowledge.md.example:84,95`); per-phase `gridpowerl1/l2/l3` exist but are not collected (`energy-glass.yaml:57-59`). | STRONG that the inverter's grid reading is wrong by a load-dependent amount; cause (CT scope, polarity, phase) unverified |
| 4. Night import visibility and accuracy     | **Accuracy:** 27 complete nights from Aug 4, 00–06: inverter import **6.87 kWh/night**, PGE balanced **6.22**, PGE raw **7.51**. The inverter is +11% against balanced and −8% against raw, so usable at night within about ±10%, unlike the day. **Visibility:** the app has daily totals only (`daily_energy`), raw pushes kept 14 days (`20260923101001_push_ingestion.sql:17,147`), an intraday chart deferred (`docs/decisions.md:32`). The lab holds PGE's hourly import up to 2026-07-31 through manual CSV upload, with a 00–06 bucket (homelab-2 `analyse-pge-usage.py:31-35`); roadmap S-10 promises day/night shares.                          | STRONG as the need; night accuracy acceptable, day accuracy not                                                           |

## Narrowing Signals

- The owner's focus moved from export to night import: "how much I draw at night" and "whether the numbers are
  right" (2026-09-30).
- The August eBOK CSV reproduces the invoice exactly with hourly balancing, which makes PGE's hourly data the ground truth.
- The inverter-vs-PGE gap is small at night and large in the afternoon and evening, and scales with house load.
- Aug 1–3 behave differently (large night swings, opposite sign), close to the July "swapped counters" period.

## Cross-System Convention

Reconciling a hybrid inverter's CT readings with the billing meter is normally done hour by hour against the
utility's interval data, with CT placement and polarity checked on site. That check was done here for August. It
separated the billing rule (hourly balancing, which explains 423/342) from a measurement fault in the inverter's grid
reading. Night-time import is the classic "base load" measure, usually shown as a night share or an hourly profile;
S-10's day/night shares follow that convention.

## Reframed Problem Statement

> **The real problem to plan around is**: the owner wants to see how much the house draws from the grid at night.
> The inverter's figure is good enough at night (±10% against PGE), but its grid reading as a whole over-reports net
> import by a load-dependent amount, about 265 kWh in August, so any daytime or monthly grid figure from it is wrong.

Two things the change started with are now explained. The 342 kWh export and 423 kWh import are PGE's hourly-balanced
totals, and night export is real. The phase-imbalance cause does not hold: the gap is in _net_ energy, which no
balancing changes. What is left is a measurement fault in the inverter's grid sensor. It is load-dependent, present at
every hour since Aug 4, and different on Aug 1–3. That is an on-site question (CT placement and polarity per phase),
not something the app can fix. The night-import need does not wait for it.

## Confidence

**HIGH** for the facts: the invoice is reproduced to 0.5 kWh from the hourly CSV, the night comparison covers 27 full
nights, and the gap pattern is consistent across 28 days. **MEDIUM** for the cause of the inverter's error: it needs
per-phase grid data or an on-site CT check. September has not been checked; the CSV holds August only.

## What Changes for /10x-plan

Plan around **night-time grid import**: showing it (per night, or as a night share or hourly profile), sourced from
data that is right at night. The inverter's `grid_w` qualifies at night (±10%); PGE's hourly CSV is exact but manual
and lags. Reconcile with roadmap S-10 (day/night shares) rather than duplicating it. Do **not** plan app-side fixes
for the export or daytime gap. Record it instead as a lab and on-site follow-up: check CT placement and polarity per
phase, and collect `gridpowerl1/l2/l3`. Correct roadmap open question 5 accordingly: the 342/423 are explained by
hourly balancing, night export is real, and the open part is the inverter's load-dependent over-reading.

## References

- homelab-2: `infra/compose/energy-app/scripts/collect-ha-snapshot.py:17-46,76-96`; `apps/solar-energy-analyser/src/solar_analyser/pge.py:20-23,157-185`; `apps/solar-energy-analyser/tests/fixtures/pge_sensor_states.json:29,48-100`; `infra/compose/energy-app/scripts/analyse-pge-usage.py:31-35`; `infra/homeassistant/lovelace/dashboards/energy-glass.yaml:57-59`; `inventory/homeassistant/energy-entities.yaml:69`
- energy-analyser: `context/archive/2026-09-27-bill-accuracy/{change,frame,plan}.md`, `reviews/impl-review-phase-4.md:111`; `docs/decisions.md:32`; `supabase/migrations/20260923101001_push_ingestion.sql:17,147`; `context/foundation/roadmap.md` (S-10, open question 5)
- Investigation tasks: PGE figure semantics and night-export provenance; inverter measurement scope and sign; meter phase-accounting check (2026-09-30)
- Verification data (2026-09-30, not committed): the owner's eBOK export `PGE eBOK Data Sept 28 2026.csv` (August 2026, "pobrana", "oddana" and "zbilansowana" rows, hourly; point of delivery code omitted here), and the lab's 5-minute history rows for 2026-07-30 to 2026-09-02 read from docker-core (9,094 samples with `grid_w`). The analysis ran on local copies; the CSV stays in `~/Downloads`.
