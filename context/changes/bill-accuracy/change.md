---
change_id: bill-accuracy
title: Make the lab's current-month bill forecast match PGE invoices
status: impl_reviewed
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

### Export / hourly data sources (web research 2026-09-27, search-index only: the Mac's DNS filter blocked direct fetches)

- "eLicznik" is Tauron's portal; no PGE Dystrybucja meter-data integration exists for HA (only an outage one). PGE's eBOK has no public API or scraper.
- MojeIRE (CSIRE, PSE): official 15-min import and export for households, CSV/PDF download behind login.gov.pl; consumer API announced, not published; full go-live 2026-10-19. https://www.pse.pl/oire/portale-csire/q-a-portale-csire
- wM-Bus on the PGE meter: ask PGE Dystrybucja to enable wM-Bus and issue the key; read with wmbusmeters (amiplus driver, A+/A- registers) or ESPHome + an 868 MHz receiver. Live, meter-grade import and export. https://github.com/wmbusmeters/wmbusmeters/pull/2081
- Candidates for the plan: manual eBOK CSV (now), inverter grid power integrated from snapshots/HA statistics (no new hardware, accuracy to verify against the CSV), wM-Bus (best, needs a PGE request and a receiver), MojeIRE (later).

### Day count and range under the shared day rule (measured 2026-09-27, read-only)

Ran the repo's own `build_daily_history` against the real `energy-history.jsonl` (4399 September rows pulled read-only from docker-core; the file is world-readable, no sudo needed). Settles the two figures the plan review left blank.

- **Day count.** 18 of the 26 past September days have rows at all (the 14–18 and 22–24 gaps have none). Of those, 3 are null under the push rule (13, 19, 21 — last usable sample before 23:00), leaving **n = 15** against the current forecast's 16. So the stricter rule costs one day, and nothing else: `50/√15 = 12.9` is below the 15% floor, so uncertainty stays **15.0%** and confidence stays **high** (the 7- and 14-day thresholds are clear). The F5 risk was real but lands benignly.
- **Projection.** Mean daily import 18.31 kWh (min 12.9, max 23.9) → 549 kWh for 30 days. With the August reference (ratio 0.809): **258 PLN**, against 648 PLN for the current no-credit method. That matches the plan's expected "around 250".
- **Range width (F9).** Point estimate 258 PLN. Lockstep as planned: **143–402 PLN** (−45%/+56%, width 259). Import band alone: 226–290 (±12%). Half ratio band: 184–346. Errors combined in quadrature: **155–361** (±40%, width 205). With the July reference (lag 2, ±40% band): 392 PLN, range 253–562.

Owner decision 2026-09-27: wM-Bus is parked as future development (roadmap Parked). This change uses the inverter's grid power for daily export, checked against the eBOK CSV. The PGE CSVs are hourly, so the meter is a remotely read AMI meter (model not yet checked).

### Phase 3 deploy, 2026-09-27: telegram-home is not built from the repo

Found while verifying criterion 3.5. The `telegram-home` image on docker-core (built 2026-09-07) runs a `bot.py` of 949 lines against the repo's 887 — 101 lines present only on the live side, 62 net. Those live-only lines have no commit in homelab-2's history on any branch: the `CAMERA_NIGHT_ALERT_*` night-window alerts for the zone-less backyard camera, and the bot-side battery-plan polling and acknowledgement client (`BATTERY_PLAN_POLL_INTERVAL`, `PENDING_BATTERY_PLAN`, and the caller of `battery_plan_ack`). The *server* half of that ack flow is in the repo — `handle_battery_plan_ack` at `infra/compose/energy-app/scripts/pge-upload-api.py:116`, added by `1b3ca89` — so only the client is missing. Rebuilding from the repo would delete both live features, so the Phase 2 bot change was **not** deployed.

Consequence: `/energy` still prints a forecast line, and it is now credit-aware because the output keys were kept compatible — but the live bot formats it as `float(bill.get('projected_bill_gross_pln') or 0):.2f` (live line 317), so the `no_data` half of 3.5 (show the reason, not 0.00 PLN) is not in the lab. Owner's decision 2026-09-27: defer it. The follow-up change backports the live drift into homelab-2 first (AGENTS.md requires it), then rebuilds with the Phase 2 bot change on top. 3.5 stays unchecked until then.
