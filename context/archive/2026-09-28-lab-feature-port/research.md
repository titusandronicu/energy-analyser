---
date: 2026-09-28T10:52:56+0200
researcher: Kamil Nowosad
git_commit: 2b712642e1de8f7fb85321cc336e8cff0be3a16f
branch: docs/bill-accuracy
repository: energy-analyser
topic: "What the lab's old analyser page and Home Assistant dashboards offer that the app does not, and what is worth porting"
tags: [research, codebase, homelab-2, home-assistant, lovelace, solar-energy-analyser, push-contract, roadmap]
status: complete
last_updated: 2026-09-28
last_updated_by: Kamil Nowosad
---

# Research: What to port from the lab's old analyser page and Home Assistant dashboards

**Date**: 2026-09-28T10:52:56+0200
**Researcher**: Kamil Nowosad
**Git Commit**: 2b712642e1de8f7fb85321cc336e8cff0be3a16f
**Branch**: docs/bill-accuracy
**Repository**: energy-analyser (cross-repo: homelab-2 at `f922727`, branch `feat/bill-accuracy`)

## Research Question

The owner's words (2026-09-28): the old Home Assistant solution and the old energy
analyser already have "a lot of interesting options and quite nice GUI" — what of that can
be implemented in the new app to make it better? Each candidate is to be mapped onto an
existing roadmap slice (S-NN / F-NN) or flagged as new scope.

## Summary

**The "old solution" is three surfaces, not one.** `inventory/services/solar-energy-analyser.yaml:20-23`
lists three URLs for the service: the static analyser page on port 3020 and two Home
Assistant dashboard paths. The PRD v2 review of 2026-09-25 compared only the analyser page
with the app (`context/foundation/prd-v3.md:299`), so the **Home Assistant dashboards are
the part that has never been mined** — and they are where the "nice GUI" actually lives.

**Three findings decide what is cheap and what is not:**

1. **Presentation gap.** In the app's inspected `src/`, the dashboard composes exactly three
   card components (`src/pages/dashboard.astro:66-68`), and no charting library appears among
   the 13 runtime dependencies declared at `package.json:17-30`. The HA dashboards, by
   contrast, carry 11 ApexCharts cards between them — 10 occurrences of
   `custom:apexcharts-card` in `energy-glass.yaml` and 1 in `solar-home.yaml` — plus a
   built-in history graph on the cast display (`office-display.yaml:94-103`).
   A large share of the perceived quality gap is chart-and-flow
   presentation over data the app **already stores**.
2. **Pipeline gap.** Of the 21 computed lab artifacts enumerated A1–A21 in this research,
   the push sender carries exactly three payload sections — `state`, optional
   `recommendation`, optional `daily_history` (`push-energy-analyser.py:332-342`). Every
   money figure, every PGE-CSV analysis and every Deye-settings artifact stays in the lab.
   So most "port this feature" candidates are **contract changes first, UI second**.
3. **The app is not behind on everything.** Searching every file under
   `infra/homeassistant/lovelace/dashboards/` found no Forecast.Solar / Solcast /
   `energy_production_*` entity on any live dashboard, and no forecast-vs-actual comparison
   card. The lab does not compute a forecast-accuracy metric either — its own generated
   lessons file lists it as missing data (`write-energy-memory-md.py:237`). **S-11 is new
   capability, not a port.**

**Shortlist.** Ranked by value ÷ cost against the 2026-11-04 deadline
(`context/foundation/prd-v3.md:12`), the four candidates worth acting on are: a live
power-flow visual (no new data at all), charts on the S-15 calendar (data already fetched),
the self-sufficiency percentage as a shown number inside S-17, and taking the lab's bill
forecast payload verbatim into S-07 — which is the next slice anyway.

## Detailed Findings

### A. The app's baseline today

Grounded in the inspected `src/` tree at commit `2b71264`:

- **One screen.** `src/pages/index.ts:5` states it outright ("The app has one screen"); the
  dashboard renders `LiveStateCard`, `UsageInsightCard` and `RecommendationCard`
  (`src/pages/dashboard.astro:66-68`). In a grep of `href=` across `src/`, the only three
  hits are a favicon (`src/layouts/Layout.astro:18`), an external Supabase docs link
  (`:28`) and a link back to sign-in (`src/pages/auth/check-email.astro:21`) — no dashboard
  navigation, no date picker, no calendar.
- **No charts.** No charting dependency appears among the 13 runtime dependencies at
  `package.json:17-30`. A grep of `src/` for chart/graph/svg/canvas library names returned
  only shadcn colour tokens `--chart-1..5` (`src/styles/global.css:26-30`), which no markup
  references. The nearest visual is a four-row textual band table
  (`src/components/UsageInsightCard.astro:79-97`).
- **Stored but unshown.** The usage-insight query selects `day, pv_kwh, load_kwh,
grid_import_kwh, grid_export_kwh, pv_forecast_kwh` over a 400-day window
  (`src/lib/services/usage-insight.ts:55-65`) and collapses all of it into one median and
  one compared day (`:256-279`). On this inspected path `pv_kwh`, `grid_export_kwh` and
  `pv_forecast_kwh` are fetched and never rendered. `pv_forecast_kwh` was added for a future
  slice, with the migration comment naming S-11 (`supabase/migrations/20260925151509_daily_forecast.sql:4`).
- **Recommendation certainty is hard-coded, and nothing fills it.** The contract accepts an
  optional `confidence` (`src/lib/ingest/contract.ts:37-49`), the app ignores it and always
  reports certainty as unknown (`src/lib/services/recommendation.ts:10-18`), and the sender
  never emits it — its comment says so at `push-energy-analyser.py:190`. S-11 therefore
  needs a lab-side producer, not only an app-side reader.

### B. Home Assistant — the unmined surface

Two energy dashboards were read in full under `infra/homeassistant/lovelace/dashboards/`:
`energy-glass.yaml` (7 views, 1579 lines) and `solar-home.yaml` (4 views, 477 lines), plus
the cast dashboard `office-display.yaml`.

What they offer that the app has no equivalent of:

| HA surface                                     | What it shows                                                                                                                | Anchor                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Power Flow Card Plus                           | Live animated 4-node flow (solar → home ↔ grid ↔ battery) with SoC on the battery node                                       | `solar-home.yaml:130-157`                              |
| Solar Bar Card                                 | Single animated bar splitting PV into self-consumption / export / battery charge                                             | `energy-glass.yaml:164-218`                            |
| Narrative status card                          | One-sentence Polish verdict on the current flow, thresholds ±50/±100 W                                                       | `energy-glass.yaml:224-314`                            |
| `Przepływy mocy dzisiaj`                       | 24 h of PV/house/grid/battery, 5-min averages, PV as area                                                                    | `energy-glass.yaml:479-566`                            |
| `Produkcja PV i zużycie domu`                  | 30 days, PV columns vs consumption line, kWh                                                                                 | `energy-glass.yaml:624-679`                            |
| `Import i eksport energii`                     | 30 days, import columns vs export line                                                                                       | `energy-glass.yaml:682-737`                            |
| `Aktywność magazynu energii`                   | 30 days, battery charge vs discharge paired columns                                                                          | `energy-glass.yaml:740-792`                            |
| `Ocena dzisiejszego dnia`                      | Today-vs-yesterday % change for PV and consumption, in prose                                                                 | `energy-glass.yaml:579-621`                            |
| `Niezależność energetyczna` / `Autokonsumpcja` | Daily self-sufficiency % and self-consumption % as tiles                                                                     | `energy-glass.yaml:802-825`, `solar-home.yaml:162-188` |
| `Bilans danych`                                | Energy-balance consistency check `PV + import + discharge − consumption − export − charge`, green when \|Δ\| ≤ 0.5 kWh       | `energy-glass.yaml:838-894`                            |
| `Dni` view                                     | Today / yesterday / day-before bars for PV and consumption, plus a 3-day-mean verdict with a data-quality warning            | `energy-glass.yaml:903-1084`                           |
| `Miesiąc` view                                 | Month-to-date tiles, a 62-day this-month-vs-last-month chart, and a monthly verdict that states the % of production exported | `energy-glass.yaml:1239-1481`                          |
| `Rok` view                                     | Yearly cumulative consumption curve plus an explicit data-range disclaimer                                                   | `energy-glass.yaml:1509-1559`                          |
| Analyser health tiles                          | Analyser health, LLM provider + model + freshness age in minutes, micro-analysis provider                                    | `solar-home.yaml:385-471`                              |

Negative findings, with the searched paths named:

- **No native HA Energy dashboard.** Grepping every `*.yaml` under `infra/homeassistant/`
  for `type: energy-*`, `energy_date_selection`, `energy-distribution`, `energy-sankey`,
  `hui-energy` and `energy_sources` returned zero hits. All energy views there are
  hand-built Lovelace.
- **No forecast-vs-actual.** No Forecast.Solar / Solcast / `energy_production_*` entity
  appears in any file under `lovelace/dashboards/`. The only forecast wiring found is in
  a vendored card that no dashboard references (`lovelace/www/casa-luna/casa-luna-energy-card.js:22-24`).
- **No notifications.** Grepping `infra/homeassistant/**` for `notify.`, `telegram`,
  `mobile_app`, `persistent_notification` and `alert:` returned zero hits; all user-facing
  reporting there is text-to-speech (`packages/gemini_home_reports.yaml`) plus Assist speech.
- **No inverter control or schedule card.** No `switch.` / `number.` / `select.` / `time.`
  inverter entity appears on any dashboard; time-of-use slots exist only as a read-only
  inventory contract (`inventory/homeassistant/energy-entities.yaml:126-136`), consistent
  with the write-control ban at `lovelace/DASHBOARD-RULES.md:137-141`.

One HA artifact is directly reusable as **text**, not UI: `script.energy_report`
(`packages/gemini_home_reports.yaml:63-97`) speaks a Polish daily summary — PV production,
house consumption, grid import, grid export, the energy balance as export − import, and
battery SoC — and its facts block states the net-metering "opust" model with the 0.8 factor
settled monthly while instructing the model not to quote PLN amounts (`:75-93`). That is
close to the plain-language daily explanation FR-030 asks for, and a ready model for F-04.

### C. The lab analyser page — real data vs demo

The static page is a single-scroll, unauthenticated, Polish, dark-theme dashboard: 13
stacked `<section>` elements (`apps/solar-energy-analyser/web/index.html:66-383`), no tabs,
no calendar, no login. `nginx.conf:1-24` adds no auth; the only protection is that the
container publishes to a loopback port (`compose.yaml:7`).

**Important qualifier: a good part of that page is demo data.** On the inspected paths, the
PGE-vs-inverter reconciliation table is driven by a hardcoded array re-scaled by the
simulator knobs (`web/app.js:66-71`, `:376-383`) and is _not_ wired to the
`pge-deye-cross-check.json` the pipeline actually produces; the signal queue
(`app.js:100-129`), the battery-strategy card, the time-of-use timeline (`app.js:137-142`)
and the readiness gates (`app.js:130-136`) are likewise hardcoded. The page's own header
carries a permanent `Dane przykładowe` chip (`index.html:21-25`). This matches the decision
already recorded at `docs/decisions.md:33` ("the lab page showed sample figures").

The panels that **are** backed by real pipeline output, and therefore worth treating as
reference implementations:

| Panel                                    | What it does                                                                                                                     | Anchor                                | Feed                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- |
| Hourly usage profile                     | 24-bar column chart of average kWh per hour of day, with tooltips                                                                | `app.js:1244-1250`                    | `pge-usage-analysis.json`          |
| Night/day/evening/weekday/weekend shares | Totals, % share and average kWh/h per bucket                                                                                     | `app.js:1252-1261`                    | same                               |
| Best / worst month                       | Green and red tiles with avg kWh/day and `+N%` vs best                                                                           | `app.js:1229-1233`                    | same                               |
| Top 5 / lowest 5 hours                   | Two ranked lists with full timestamps                                                                                            | `app.js:1263-1272`                    | same                               |
| PGE hourly anomalies                     | Up to 8 cards: hour label, kWh, typical kWh, surplus, score, Polish explanation                                                  | `app.js:1157-1201`                    | `pge-anomalies.json`               |
| Current-month bill forecast              | Projected PLN, projected kWh, low–high range, days used, confidence word, three typed no-data reasons, staleness guard at 30 min | `app.js:1294-1314`, `:1277-1281`      | `current-month-bill-forecast.json` |
| Deye consumption plan                    | Severity-coloured cards with title / fact / meaning / manual action, plus a read-only mirror of the inverter's ToU screen        | `app.js:1316-1357`                    | `deye-consumption-plan.json`       |
| Micro-analysis feed                      | Last 8 samples, newest first, badged by provider, with observation and next check                                                | `app.js:1359-1394`                    | `local-micro-analysis.jsonl`       |
| 30-day trend chart                       | Bar chart with a toggle between self-sufficiency % and cost PLN                                                                  | `app.js:729-743`, toggle `:1516-1519` | `energy-history.jsonl`             |
| Plain balance + proportional bars        | Polish sentence plus five tone-coloured kWh bars                                                                                 | `app.js:442-475`                      | `ha-energy-snapshot.json`          |

Two behaviours on that page are worth copying as _rules_ rather than as features, because
they agree with FR-018/FR-019 (`context/foundation/prd-v3.md:204-206`): when the snapshot is
not fresh the KPI row renders dashes instead of demo numbers (`app.js:505-512`), and the
balance panel replaces itself with an explicit refusal rather than showing yesterday's data
as today's (`app.js:428-440`).

### D. The pipeline gap — what the lab computes but never sends

The sender opens exactly three files plus the history JSONL — snapshot, briefing, advisory
response (`push-energy-analyser.py:405-412`) — and builds a payload with three sections
(`:332-342`). Mapping the 21 enumerated artifacts against it:

**Reaches the app (3 of 21):** live telemetry as `state` (`:154-162`); per-day totals as
`daily_history` (`:243-298`); the LLM advisory text plus a scalar-flattened slice of the
briefing as `recommendation` (`:165-195`).

**Does not reach the app (18 of 21),** each verified as never opened by the sender at
`:405-412`: the current-month bill forecast and its closed-month check (A11), PGE hourly
anomalies (A7), the PGE time-of-use usage analysis (A8), the PGE-vs-Deye cross-check (A13),
the Deye settings snapshot (A19), the Deye consumption plan (A4), the battery-plan proposal
(A5) and its ack log (A6), local micro-analyses (A14), the Markdown memory and lessons
layer (A15), the PGE settlement history (A16), the hourly telemetry summary (A10), the PGE
import status (A9), the raw 5-minute history (A17), the private SQLite store (A18), the
invoice/tariff engine output (A20), the ad-hoc source comparison (A21), and the curated
Deye knowledge pack.

**Two fragilities in what _is_ sent**, both material for planning:

1. **The whole `recommendation` block is dropped unless the LLM answered.** The sender
   requires a non-empty `response_text`, a provider in its enum map, a parseable
   `generated_at` _and_ a non-empty `model` (`push-energy-analyser.py:169-175`); an unknown
   provider name silently drops the block. Because `facts.current_state`,
   `facts.balance_today`, `facts.local_findings`, `facts.sanity_checks` and the forecast all
   live inside that block (`:49-50`, `:178-193`), a failed narration takes every
   deterministic fact with it. Any future slice that carries lab-written period summaries
   (F-04, S-18) or pipeline health (S-13) inherits this unless the contract separates them.
2. **Facts are flattened to scalars.** Nested dicts and lists inside a fact are discarded
   (`push-energy-analyser.py:127-135`, `:141-151`), so the sanity checks' `candidates[]` and
   drift `items[]` never survive the push — exactly the detail S-13 would want to show.

Note also that `manifests/solar-energy-analyser-api.v1.yaml:1-4` is `status: draft`,
describes seven GET endpoints and contains no `/api/ingest`. Nothing in the running code
reads it. It is an aspirational read-API sketch, not the live contract; the live contract is
`src/lib/ingest/contract.ts` in this repo, which rejects unknown keys with 422
(`contract.ts:4-6`).

### E. Candidate map

Legend: **slice** = already covered by a roadmap item; **new** = not in the PRD or roadmap;
**parked** = on the roadmap's Parked list (`context/foundation/roadmap.md`, the `## Parked` section), so it
needs a PRD change to revive.

#### E1. Presentation only — no new lab data needed

| #   | Candidate                                                  | Reference                                            | Data in the app today                                                                                       | Verdict                                          |
| --- | ---------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | Live power-flow visual (4 nodes, animated)                 | `solar-home.yaml:130-157`; lab `app.js:524-565`      | Yes — `state` carries `pv_w`, `home_load_w`, `grid_w`, `battery_w`, `battery_soc_pct` (`contract.ts:17-27`) | **new**, enhances S-02                           |
| 2   | Plain-Polish sentence for the current flow                 | `energy-glass.yaml:224-314`; `solar-home.yaml:13-60` | Yes, same fields                                                                                            | **new**, adjacent to S-14                        |
| 3   | Show PV production and export at all                       | `energy-glass.yaml:437-475`                          | Yes — selected then discarded (`usage-insight.ts:59`)                                                       | **slice** S-15 / S-17                            |
| 4   | 30-day PV-vs-consumption and import-vs-export charts       | `energy-glass.yaml:624-737`                          | Yes — 400 days already fetched (`usage-insight.ts:55-65`)                                                   | **slice** S-15 (chart form is the open decision) |
| 5   | Today-vs-yesterday % verdict                               | `energy-glass.yaml:579-621`                          | Yes                                                                                                         | **slice** S-20, extended down to day level       |
| 6   | Month-to-date and month-vs-previous                        | `energy-glass.yaml:1239-1481`                        | Yes                                                                                                         | **slice** S-15 month view                        |
| 7   | Self-sufficiency % and self-consumption % as shown numbers | `energy-glass.yaml:802-825`                          | Yes — FR-022 already defines self-sufficiency as the rating basis (`prd-v3.md:266`)                         | **slice** S-17                                   |
| 8   | Relative-age freshness badge ("15 min temu")               | lab `app.js:567-588`                                 | Yes                                                                                                         | **slice** S-02 / S-13, cosmetic                  |
| 9   | Yearly cumulative curve                                    | `energy-glass.yaml:1509-1546`                        | Partly                                                                                                      | **parked** — S-16, revisit ~July 2027            |

#### E2. Needs a contract addition — the lab already computes it

| #   | Candidate                                                                                                         | Lab anchor                                                                                                                                                                 | Verdict                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 10  | Bill forecast: projected PLN, range, confidence, days used, settlement, pricing, `closed_month_check`             | `build-current-month-bill-forecast.py:405-447`                                                                                                                             | **slice** S-07 — payload shape is ready to lift verbatim                                                        |
| 11  | Usage profile: 24-h profile, weekday profile, night/day/evening/weekend shares, monthly ranking, top/lowest hours | `analyse-pge-usage.py:59-72`                                                                                                                                               | **slice** S-10 — FR-014 already asks for exactly this                                                           |
| 12  | PGE hourly anomalies with Polish explanations and severity                                                        | `pge_anomalies.py:103-139`                                                                                                                                                 | **partly slice** — FR-014 covers only "the count of unusual consumption by hour"; the explained list is **new** |
| 13  | Deye consumption-plan recommendations (title / fact / meaning / manual action)                                    | `deye_consumption.py:298-398`                                                                                                                                              | **slice** S-09 (stretch)                                                                                        |
| 14  | Deye ToU slots, Grid Charge state, reserve SoC                                                                    | `collect-deye-settings-snapshot.py:112-135`                                                                                                                                | **slice** S-12 (stretch)                                                                                        |
| 15  | LLM provider chain, fallback flag, failures; un-flattened sanity checks                                           | `run-energy-advisory.py:326-337`; flattening at `push-energy-analyser.py:127-135`                                                                                          | **slice** S-13 (stretch)                                                                                        |
| 16  | Local micro-analysis feed                                                                                         | `run-local-micro-analysis.py:256-278`                                                                                                                                      | **slice** as input to F-04/S-18 (FR-030 already names this split); a _visible_ feed is **new**                  |
| 17  | Daily battery charge/discharge totals                                                                             | Present in the snapshot as `balance_today` (`collect-ha-snapshot.py:347-354`); **absent** from `daily_history` (`push-energy-analyser.py:292-297`) and from `daily_energy` | **new foundation** — needed for candidates 18 and for HA-style battery charts (`energy-glass.yaml:740-792`)     |
| 18  | Daily energy-balance consistency check                                                                            | `energy-glass.yaml:838-894`; lab computes the residual at `append-energy-history.py:38-40`                                                                                 | **new**, depends on 17                                                                                          |
| 19  | Closed-period settlement facts                                                                                    | `append-pge-settlement-history.py:67-93`                                                                                                                                   | **slice** S-08 — blocked on the lab's full G11 tariff                                                           |

#### E3. Already ruled out

| #   | Candidate                                                      | Anchor                                                    | Why not                                                                                                                                      |
| --- | -------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 20  | PGE-vs-Deye drift cross-check                                  | `build-pge-deye-cross-check.py:139-211`                   | **parked** — PRD non-goal (`roadmap.md:407`); also demo-only in the lab GUI (`app.js:66-71`)                                                 |
| 21  | PGE CSV upload                                                 | lab `index.html:90-93`                                    | **parked** — raw bill exports stay in the lab (`roadmap.md:408`)                                                                             |
| 22  | What-if simulator (period / tariff / reserve / scenario knobs) | lab `index.html:28-64`                                    | **new but conflicting** — it re-scales demo numbers, against FR-019 (`prd-v3.md:205`)                                                        |
| 23  | Battery-plan proposal and its confirm/skip ack                 | `battery_plan.py:85-188`; ack `pge-upload-api.py:116-154` | **needs an owner decision** — advisory-only with manual confirmation, but adjacent to the parked device-control guardrail (`roadmap.md:411`) |
| 24  | Copy-prompt / download-facts-JSON buttons                      | lab `app.js:1521-1543`                                    | Developer affordance, not owner-facing                                                                                                       |

## Code References

- `src/pages/dashboard.astro:66-68` — the app's whole dashboard: three cards, one column
- `src/lib/services/usage-insight.ts:55-65` — 400-day daily query whose PV and export columns are never rendered
- `src/lib/services/recommendation.ts:10-18` — forecast certainty hard-coded as unknown
- `src/lib/ingest/contract.ts:4-6,17-27,53-60` — strict contract, `state` and `daily_history` shapes
- `supabase/migrations/20260925151509_daily_forecast.sql:4` — `pv_forecast_kwh` added for S-11
- `../homelab-2/infra/homeassistant/lovelace/dashboards/energy-glass.yaml:624-737` — the 30-day charts to copy
- `../homelab-2/infra/homeassistant/lovelace/dashboards/energy-glass.yaml:838-894` — the energy-balance consistency check
- `../homelab-2/infra/homeassistant/lovelace/dashboards/solar-home.yaml:130-157` — the live power-flow card
- `../homelab-2/infra/homeassistant/packages/gemini_home_reports.yaml:63-97` — the spoken daily energy report, a model for F-04
- `../homelab-2/apps/solar-energy-analyser/web/app.js:1203-1273` — the hourly usage-profile panel, reference GUI for S-10
- `../homelab-2/apps/solar-energy-analyser/web/app.js:66-71` — the reconciliation table's hardcoded demo array
- `../homelab-2/infra/compose/energy-app/scripts/push-energy-analyser.py:169-175` — the LLM-success gate that drops every fact
- `../homelab-2/infra/compose/energy-app/scripts/push-energy-analyser.py:127-135` — scalar flattening that discards nested sanity-check detail
- `../homelab-2/infra/compose/energy-app/scripts/build-current-month-bill-forecast.py:405-447` — the bill-forecast output shape for S-07

## Architecture Insights

- **The split holds.** PRD Open Question 1 settled that the lab keeps ingestion, PGE parsing
  and LLM narration while the app adds access control and its own derived views
  (`prd-v3.md:289`). Nothing found here challenges that: every candidate above is either a
  presentation change in the app or a new payload section, never a port of lab code.
- **Contract ordering is app-first.** Optional fields are added to the app contract and
  deployed before the lab sends them (`roadmap.md` Open Question 1), because unknown keys
  are rejected with 422 (`contract.ts:4-6`). Each E2 candidate is therefore two changes in a
  fixed order, not one.
- **The lab's GUI already encodes the app's own transparency rules.** Stale-data refusal
  (`app.js:428-440`), real-vs-simulated bill labelling (`app.js:593`) and typed no-data
  reasons (`app.js:1277-1281`) predate FR-018/FR-019 and agree with them.
- **HA's own dashboard rules agree with the PRD guardrail.** `lovelace/DASHBOARD-RULES.md:137-141`
  bans inverter and battery write controls, and `:148-155` requires advisory or forecast text
  to identify stale or unavailable data.

## Historical Context (from prior changes)

- `context/foundation/prd-v3.md:299` — PRD v2 (2026-09-25) added FR-011–017, US-03 and US-04
  "following a comparison of the lab's old analyser page with this app". **Verdict: still
  accurate, but narrower than its wording suggests** — the Home Assistant dashboards were not
  part of that comparison, and every candidate in section E1 comes from them.
- `docs/decisions.md:33` — "the lab page showed sample figures; the app shows real
  aggregates the lab already computes". **Verdict: confirmed** on the inspected paths, for
  the reconciliation table, signal queue, battery strategy, timeline and gates
  (`app.js:66-71`, `:100-129`, `:130-136`, `:137-142`).
- `context/foundation/existing-system.md:52-56` — lists what the app adds that the lab lacks
  (access control, notes on days, a tested CI-deployed codebase). **Verdict: still accurate**;
  this research adds that the lab conversely leads on charting and live-flow presentation.
- `context/changes/bill-accuracy/change.md` — established the HA PGE connector as the billing
  source and the credit-aware forecast now carrying `settlement` and `closed_month_check`.
  That output is candidate 10 here, and S-07 is the slice that consumes it.
- `context/foundation/lessons.md` — "Name every prerequisite outside the repo" applies to
  every E2 candidate (each needs a lab job and a contract field listed in
  `docs/prerequisites.md`); "Plan before implementing, even straight after research" means
  this document feeds `/10x-plan`, not an implement request.

## Related Research

- `context/archive/2026-09-26-usage-norm-scale/research.md` — the earlier pass on giving kWh
  figures a sense of scale; roadmap Open Question 4 is still partly open and overlaps
  candidate 7 (self-sufficiency as a shown number).
- `context/changes/bill-accuracy/frame.md` — evidence behind roadmap Open Question 5 and the
  `grid-export-mismatch` follow-up; bounds how much of candidate 10's export figure is
  measured rather than estimated.

## Open Questions

1. **Which charting approach?** The app has no charting dependency (`package.json:17-30`).
   S-15 cannot show day and month views in the HA style without one. Owner decision: a
   library, or hand-rolled SVG in the style of the existing band table
   (`UsageInsightCard.astro:79-97`)?
2. **Do daily battery totals enter the contract?** Candidates 17 and 18, and any battery
   chart, need `battery_charged_kwh` / `battery_discharged_kwh` per day. The lab computes
   them for _today_ (`collect-ha-snapshot.py:347-354`) but does not emit them per day
   (`push-energy-analyser.py:292-297`). This is a new F-level item across both repos plus a
   migration.
3. **Should facts be decoupled from the LLM-success gate?** Today a failed narration drops
   every deterministic fact (`push-energy-analyser.py:169-175`). F-04, S-18 and S-13 all
   depend on lab-written content surviving a narration failure.
4. **Anomalies: inside S-10 or a slice of their own?** FR-014 covers the count by hour of
   day; the lab's explained anomaly list (`pge_anomalies.py:103-139`) is richer than that.
5. **Is the micro-analysis feed user-facing?** FR-030 uses the local model's observations as
   input to the stronger model's explanation. Whether the raw feed is also shown
   (`app.js:1359-1394`) is undecided.
6. **Battery-plan proposal (candidate 23)** — port as an advisory card, or leave parked next
   to the device-control guardrail?
7. **Does any of this fit before 2026-11-04?** Roadmap Open Question 3 already flags the
   deadline risk with 14 open items. Adding E1 candidates 1, 2 and 4 is the cheapest way to
   close the perceived quality gap, but it is still added scope.
