---
change_id: bill-accuracy
title: Make the lab's current-month bill forecast match PGE invoices
status: preparing
created: 2026-09-27
updated: 2026-09-27
archived_at: null
---

## Notes

Raised 2026-09-27 while planning S-07 (bill-forecast), which is parked until this lands. Owner: "the calculation for the bill is quite wrong based on PGE bills".

Evidence gathered read-only on docker-core (aggregates only):

- Import source: the forecast uses Deye `bought_kwh`. 2026-07-17..31: Deye 140 kWh vs PGE balanced import 406 kWh; on several days Deye *export* matches PGE *import* (swapped counters / CT direction?). Same period as roadmap open question 6. Aug/Sep cannot be checked yet (PGE CSV in the lab ends 2026-07-31).
- Pricing: every kWh at the June-bill blended rate (1.0991 PLN gross) + 44.62 PLN fixed; no credit for exported energy; `rachunek-current.json` is hand-made (2026-07-21) and a missing file crashes the refresh.
- Real invoices seen by HA's PGE Sensor: 670.59 PLN / 350.93 kWh (due 2026-07-21), 495.22 PLN / 434.5 kWh (due 2026-08-25), 214.66 PLN / 261.81 kWh (due 2026-09-22). Periods and correction/deposit lines unknown without the PDFs.
- Day selection: snapshot gaps 2026-09-14..18 and 09-22..24; the Deye day counter also resets mid-day (e.g. 09-26 14:44), so "last sample after 21:00" undercounts.
- The lab collects only 4 PGE Sensor entities (balance, invoice amount, settled energy, due date); check what else the HA PGE connector exposes.

Inputs promised by the owner: last PGE invoices (PDF) and the Aug/Sep eBOK CSV upload. Next: /10x-frame bill-accuracy once they are in.

### HA PGE connector (queried read-only 2026-09-27)

PGE Sensor v1.5.1 exposes more than the lab collects: `pge_consumed_energy` (423 kWh), `pge_feed_in_energy` (342 kWh), `solar_pge_sensor_pge_okres_rozliczeniowy` (01.08–31.08.2026, monthly), `solar_pge_sensor_pge_magazyn_energii` (factor **0.8**, credited 274 kWh, left 0), `solar_pge_sensor_pge_biezaca_platnosc`. Friendly names and the balance attributes carry personal data (email, PPE, invoice number): never copy them into a repo.

- Settlement is **net-metering (opust) at 0.8**, monthly, not net-billing. August: (423 − 0.8 × 342) = 149.4 kWh × 1.0991 + 44.62 = ~209 PLN against the real 214.66 PLN invoice (within 3%). The lab's method gives 423 × 1.0991 + 44.62 = ~509 PLN.
- Deye August import 433.6 kWh vs PGE 423 (−2.5%): the import counter is fine since early August. Deye August export 94.7 kWh vs PGE 342: the export counter is not usable, so the in-month forecast needs another export source.
- Unused credit carries forward (leftEnergyAmount), so summer surplus can offset later months.

### Owner decision 2026-09-27: the HA PGE connector is the billing source

- Use PGE Sensor for billing from now on (closed-month consumption, feed-in, 0.8 credit, invoice amount, billing period).
- It has no hourly or daily data: it reads the mBOK *sales* API every 8 h (latest invoice, balance, and for prosumers the invoice's energy-storage record). Hourly meter data lives with PGE Dystrybucja (eLicznik / eBOK CSV), a separate service.
- Within a month: daily/hourly import and load from the Deye snapshots (import reliable since early August); export needs another source (open).
