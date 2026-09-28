# Frame Brief: Bill forecast accuracy

> Framing stage before /10x-plan. This document records what the problem _actually_ is,
> separated from what was first assumed.

## Reported observation

The home lab's current-month bill forecast does not match PGE's bills: it reads **too high**
(owner, 2026-09-27). September's forecast is 610.52 PLN (range 525.64–695.41), based on 16 days;
the latest real invoice (August) was 214.66 PLN.

## Initial framing (preserved)

- **Stated cause or approach**: "the calculation for the bill is quite wrong based on PGE bills".
- **Proposed direction**: use the Home Assistant PGE connector from now on; investigate an eLicznik
  (PGE Dystrybucja) integration for automatic hourly import/export data.
- **Pre-dispatch narrowing**: the forecast is too high; the target figure is the **invoice amount**
  (including the export credit); hourly data should first serve **finding the biggest consumers**
  and **daily export**.

## Dimension map

The observation could come from any of these:

1. **Settlement model**: the forecast prices every imported kWh and ignores the credit for exported energy. ← initial framing
2. **Import source**: Deye `bought_kwh` misreports daily grid import.
3. **Rates**: the blended June-bill rate (1.0991 PLN/kWh gross) plus 44.62 PLN fixed fees does not reflect the current tariff.
4. **Day selection**: snapshot gaps and mid-day counter resets bias the daily average.
5. **Invoice semantics**: invoices include forecast or correction amounts, so no energy-based formula can match them.

## Hypothesis investigation

| Hypothesis           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Verdict                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1. No export credit  | HA PGE Sensor (`sensor.solar_pge_sensor_pge_magazyn_energii`): factor 0.8, 342 kWh fed in, 274 credited, 0 left over; the billing period is monthly (01.08–31.08.2026). The forecast script has no export term (homelab-2 `build-current-month-bill-forecast.py:41-43`). Back-test: Aug (423 − 0.8×342) × 1.0991 + 44.62 ≈ 209 PLN vs 214.66 invoiced (the current method gives ≈ 509); Jul (702 − 0.8×372, PGE CSV) ≈ 489 vs 495.22 invoiced (current method ≈ 816). The lab also assumes net-billing elsewhere (`infra/homeassistant/packages/gemini_home_reports.yaml:84`). | STRONG                                                                  |
| 2. Import source     | Jul 17–31: Deye 140 kWh vs PGE 406 (counters look swapped; roadmap open question 6). **August: Deye 433.6 vs PGE 423 (+2.5%)**, so import has been reliable since early August. Deye export: 94.7 vs 342, so export is unusable. An import error would make the forecast too _low_, not too high.                                                                                                                                                                                                                                                                              | WEAK for the current error; STRONG that Deye export can't feed a credit |
| 3. Rates             | The implied August rate is (214.66 − 44.62) / 149.4 ≈ 1.14 PLN/kWh, about 3.5% above the June blend. Stale rates make the forecast slightly too low.                                                                                                                                                                                                                                                                                                                                                                                                                           | WEAK (a few %)                                                          |
| 4. Day selection     | No snapshots Sep 14–18 and 22–24; the Deye day counter resets mid-day (e.g. Sep 26 14:44), so "the last sample after 21:00" undercounts. Only 16 of 26 days are used. This biases the forecast low, and makes it noisy.                                                                                                                                                                                                                                                                                                                                                        | WEAK for "too high"; real data-quality issue                            |
| 5. Invoice semantics | The June invoice (670.59 PLN) matches 566.7 kWh with no credit (≈ 667), but the June CSV has no export rows, so it can't be checked. `pge_settled_energy` (261.81 for August) does not equal consumed − credit (149.4), so its meaning is unclear.                                                                                                                                                                                                                                                                                                                             | PARTIAL: a caveat, not the cause                                        |

## Narrowing signals

- The owner sees the forecast as too **high**. Only hypothesis 1 moves the figure up; hypotheses 2–4 would push it down.
- The target is the **invoice amount**, and the credit model reproduces the July and August invoices within 1–3%.
- The PGE Sensor provides the settlement facts for each closed month, but no hourly or daily data (it reads the mBOK sales API every 8 h). Hourly data sits with PGE Dystrybucja.

## Cross-system convention

For prosumers in Poland on the pre-April-2022 scheme ("opust"), 0.8 kWh is credited per exported kWh on a system of 10 kWp or less, and energy-based fees are charged only on the net amount. The PGE Sensor's `factor: 0.8` confirms this household is on that scheme. The lab and the HA report prompt were built on a net-billing assumption. The leading hypothesis matches the convention.

## Reframed problem statement

> **The real problem to plan around is**: the lab bills gross grid import at full price and ignores the 0.8 net-metering credit, and it has no reliable daily export figure to apply that credit within the month.

The initial framing ("the calculation is wrong") holds, but the error is the settlement model, not the arithmetic or the tariff rates. Fixing it needs three things: (a) the credit, including credit carried forward from earlier months; (b) a daily export source other than Deye, because the credit depends on export; (c) the connector's closed-month values as the reference for checking the result. Stale June rates, missing days and counter resets are secondary accuracy issues, worth a few percent each. The finding of the biggest consumers from hourly data is a separate, smaller outcome that shares that data source.

## Confidence

**HIGH.** Two invoices reproduced within 1–3%, the connector reports the 0.8 factor explicitly, and the direction matches the owner's observation. The one open item is June (no export data), which is not needed before planning.

## What changes for /10x-plan

Plan the credit-aware calculation around connector values and a trustworthy daily export source, rather than a tweak to the existing formula. The export source (eBOK CSV, eLicznik integration or inverter power integration) is the key design choice. Include collecting all PGE Sensor values in the lab and fixing the net-billing assumption in the HA report prompt. The app card (S-07) stays parked until this lands.

## References

- homelab-2: `infra/compose/energy-app/scripts/build-current-month-bill-forecast.py:20-71`, `infra/compose/energy-app/scripts/collect-ha-snapshot.py:74-79`, `apps/solar-energy-analyser/src/solar_analyser/tariffs.py:29-103`, `infra/homeassistant/packages/gemini_home_reports.yaml:84`
- HA: `custom_components/pge_sensor/api.py` (mBOK endpoints, 8 h poll, latest invoice only)
- Evidence: read-only queries on docker-core `private/energy.sqlite3` and the HA `/api/states` endpoint, 2026-09-27 (aggregates only), recorded in `change.md`
- `docs/prerequisites.md` (PGE Sensor row, settlement paragraph)
