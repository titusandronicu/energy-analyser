# Bill accuracy — Plan Brief

> Full plan: `context/changes/bill-accuracy/plan.md`
> Frame brief: `context/changes/bill-accuracy/frame.md`

## What & Why

> **The real problem to plan around is**: the lab bills gross grid import at full price and ignores the 0.8 net-metering credit, and it has no reliable daily export figure to apply that credit within the month.

As a result, September reads 610 PLN while the August invoice was 214.66 PLN. S-07 (the app's bill card) is parked until the lab's figure is right.

## Starting Point

The lab forecast takes average Deye import × days in the month × a June-bill rate, plus fixed fees. The HA PGE Sensor already reports each closed month's consumed and fed-in energy, the 0.8 credit and the invoice, but the lab collects only four of its values. The inverter measures import well (within 2.5% of PGE in August) and export badly (95 kWh against 342).

## Desired End State

The lab's forecast estimates the **invoice amount**. It applies the 0.8 credit, estimated from last month's export/import ratio plus any credit carried forward, takes rates from `tariffs.py`, and shows a range. Each run also checks the formula against the last closed invoice (August within 5%). Missing inputs give `no_data` instead of stopping the refresh. The docs explain the rule, and S-07 can resume.

## Key Decisions Made

| Decision                           | Choice                                                    | Why (1 sentence)                                                    | Source |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| Target figure                      | The PGE invoice amount                                    | That's what the owner compares against                              | Frame  |
| Billing source                     | HA PGE Sensor (mBOK)                                      | It has each closed month's settlement facts; the owner chose it     | Frame  |
| Settlement model                   | Net-metering, factor 0.8, monthly, credit carried forward | It reproduces the July and August invoices within 1–3%              | Frame  |
| In-month export                    | Last closed month's export/import ratio                   | The inverter can't measure export; the ratio uses PGE's own figures | Plan   |
| Import per day                     | The push script's daily totals                            | Same numbers the app shows; glitches handled once                   | Plan   |
| Rates                              | `solar_analyser.tariffs`                                  | One place for rates; no hand-made June file, no crash               | Plan   |
| Invisible export / phase question  | Separate change `grid-export-mismatch`                    | The bill fix shouldn't wait for a physical investigation            | Plan   |
| Meter-grade data (wM-Bus, MojeIRE) | Parked                                                    | Owner's decision: future development                                | Plan   |

## Scope

**In scope:**

- Collecting the PGE Sensor's settlement facts (no personal data)
- The credit-aware forecast, its tests and the refresh wiring
- Deploying to docker-core and fixing the net-billing sentence in the HA prompt
- The logic, decisions and prerequisites docs, the roadmap entry and the follow-up change

**Out of scope:**

- The app card (S-07)
- Explaining the invisible export
- wM-Bus and MojeIRE
- Rate updates
- Reconciliation history
- The hourly usage profile (S-10)

## Architecture / Approach

HA PGE Sensor → the collector (new entities; values only) → a snapshot. The forecast reads the snapshot (credit facts), `energy-history.jsonl` (daily import, through the push script's `build_daily_history`) and `tariffs.py` (rates). It writes `current-month-bill-forecast.json`, which the Telegram bot, the lab page and later the app (S-07) read. Invoice estimate = max(0, import − 0.8 × (ratio × import + carried credit)) × variable rate + fixed fees.

## Phases at a Glance

| Phase                       | What it delivers                                                  | Key risk                                                    |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| 1. Collect settlement facts | PGE Sensor values in every snapshot                               | Personal data leaking into the snapshot (covered by a test) |
| 2. Credit-aware forecast    | The new calculation, back-tested on the July and August invoices  | The ratio shifts with the season (less export in winter)    |
| 3. Deploy and verify        | Live output on docker-core; HA prompt fixed                       | Host changes need the owner's OK; `app-src` may be stale    |
| 4. Docs and follow-ups      | Rule, decision, roadmap question 8, `grid-export-mismatch` folder | —                                                           |

**Prerequisites:** the PGE Sensor installed and signed in (it is); operator access to docker-core and the UGREEN; the owner's OK for each host change.
**Estimated effort:** about 2 sessions; phases 1–2 are code and tests, phases 3–4 are short.

## Open Risks & Assumptions

- The left-over credit is assumed to be fed-in kWh before the factor (carried credit = left × 0.8). It has been 0 so far; check it the first time it isn't.
- Last month's ratio is a rough estimate at season changes, e.g. September's ratio applied to October. The range and the closed-month check make that visible.
- The June invoice matched with no credit and couldn't be checked (the June CSV has no export rows).
- The invisible export may mean real money is lost; that's handled in `grid-export-mismatch`.

## Success Criteria (Summary)

- The lab forecast for September reads around 250 PLN rather than 610, and the owner finds it plausible.
- The August check stays within 5% of the real invoice.
- A missing input never stops the refresh, and the Telegram bot keeps working.
