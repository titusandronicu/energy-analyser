---
project: "Energy Analyser"
version: 3
status: draft
created: 2026-09-26
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: true
---

## Vision & Problem Statement

The sole operator of a home PV + battery + grid system gets no timely feedback on energy cost — PGE bills post roughly a month after the usage they cover — and has no forecast-informed guidance for battery settings, so charge/reserve decisions are made reactively, without knowing what weather or season is coming. The gap isn't visibility of raw data (Home Assistant already exposes live PV/battery/grid telemetry) — it's the absence of a rule that turns that data, plus PGE's real tariff structure and seasonal generation patterns, into a decision: what should the battery do today, and was yesterday's usage normal or a waste of money.

Generic solar-monitoring apps don't have this owner's exact PGE tariff and billing history, the seasonal PV generation pattern specific to this location, or the Deye inverter's own behavior quirks (reserve, Grid Charge, Time-of-Use) — combining those three is what makes a forecast-driven recommendation possible instead of a generic one.

**Not a blank slate.** The app's code is new, but its data plane already runs in the owner's home lab: live Home Assistant with the Deye inverter integrated, PGE bill import and tariff math, and a lab Solar Energy Analyser page whose deterministic facts bundle is narrated by an LLM provider chain (HA conversation → local Ollama → OpenRouter). This product adds access control, a browsable history with day and month ratings, notes on days, tests and a maintained codebase on top of that system instead of recreating it. See [existing-system.md](existing-system.md).

## User & Persona

Primary persona: the homeowner (you) — sole operator of a home solar PV + battery + grid system (Deye inverter, PGE G11 tariff, Home Assistant as the live telemetry hub). Reaches for this product:
- mid-next-month, when the PGE bill arrives and they want to understand or verify the cost against what actually happened, and
- day-to-day / seasonally, when deciding how to configure battery reserve/charge behavior ahead of expected weather or a season change, and
- looking back over days, months and years to spot patterns: which periods went well or badly, and what happened then.

The owner has no energy background: terms like PV, kW versus kWh, battery state of charge or grid import mean little to them. The app explains every figure in plain words and marks what is good or worrying with colour, instead of assuming expertise (v3, 2026-09-26).

No secondary persona — single-user by design.

Scale insight (100x check): at real multi-household scale, the access-key model wouldn't hold — it would need proper account security and credential storage. This confirms single-user + access-key is a deliberate MVP choice, not an oversight; multi-tenant support is explicitly out of scope (see Non-Goals).

## Success Criteria

### Primary
- End-to-end flow works: opening the app with the access key shows current state (near-live Home Assistant telemetry pushed from the home lab) plus one derived insight against the historical baseline (computed in this app from pushed history), and an LLM-narrated battery-setting recommendation for today, informed by a weather forecast (narrated in the home lab and pushed with its facts bundle).

### Secondary
- The battery recommendation already incorporates a weather forecast in v1, rather than being deferred to v2.
- The user sees the expected cost of the current month before the PGE bill arrives, and the actual cost of the last closed period, instead of learning it a month later from the bill.

### Guardrails
- The app never writes to Home Assistant or the inverter — recommendations are advisory-only, for human review.
- No private-network data or secrets (telemetry, bills, credentials, local network topology) leak into the public repo.
- The app degrades gracefully when the home lab stops pushing (Home Assistant, the lab pipeline or the connection is down): it shows last-known data with a clear staleness indicator instead of failing.

## User Stories

### US-01: User checks today's energy insight and battery recommendation

- **Given** a user with a valid access key and existing historic energy data
- **When** they open the app
- **Then** they see current PV/battery/grid state, one derived insight against the historical baseline, and a plain-language battery-setting recommendation for today

#### Acceptance Criteria
- Insight and recommendation are visible without further clicks beyond opening the app
- The recommendation shown reflects the most recent daily refresh — it is not computed live while the user waits
- If same-season historical data is insufficient, the insight visibly discloses it is using the flat-30-day fallback baseline
- If no fresh push has arrived (Home Assistant or the home-lab pipeline is down), last-known state is shown with a visible staleness indicator instead of an error page
- The recommendation is advisory text only — no controls to apply it directly to the inverter/HA
- Every card is readable without energy knowledge: plain words, technical terms explained where they appear, and a colour plus text label saying whether the figure is good, worth watching or a problem
- Manual actions from the home lab's consumption plan are listed next to the recommendation as steps for the user to take themselves, without inverter setting values
- The inverter's current schedule and the recent forecast accuracy are shown next to the recommendation, so the user can compare the advice with what is set and how reliable the forecast has been
- When the recommendation or live data is degraded, a plain status message says why

### US-02: (removed in v3)

Recording accept/dismiss feedback on recommendations was dropped on 2026-09-26: the system now rates days and months itself (US-05), and the owner's own input moves to notes on days (US-06).

### US-03: User checks what this month and the last period cost

- **Given** a user with a valid access key, and billing aggregates pushed by the home lab
- **When** they open the app mid-month, or when the PGE bill arrives
- **Then** they see the projected cost of the current month with a range, and the actual cost of the last closed period under their real tariff

#### Acceptance Criteria
- The projection states how many days of the month it is based on, and shows a range rather than a single exact figure
- The closed-period cost uses the full tariff (energy and fixed charges), not a flat per-kWh rate
- When the home lab has not pushed billing aggregates, the cost panel says so instead of showing sample or placeholder numbers

### US-04: User reviews their usage profile

- **Given** a user with a valid access key, and usage-profile aggregates pushed by the home lab
- **When** they open the usage profile
- **Then** they see how their consumption is spread across an average day, day/night and weekday/weekend, and at which hours of the day unusual consumption occurs

#### Acceptance Criteria
- Only aggregates are shown — no individual hourly readings, meter or customer identifiers
- The profile states the period and number of days it covers

### US-05: User browses past days, months and years

- **Given** a user with a valid access key and pushed daily history
- **When** they open the calendar and pick a day, a month or a year
- **Then** they see that period's production, consumption and grid exchange, the forecast against what actually happened, the recommendations from that period, a good / neutral / bad rating with its basis, and the home lab's summary of what happened

#### Acceptance Criteria
- The user can move between days, months and years without typing dates
- Every figure and rating states the period and number of days it is based on
- A rating or summary is only shown for a period with enough data; otherwise the view says there is not enough data yet
- Ratings and summaries describe what happened; they never give advice or suggest changes
- Periods before the app started receiving pushes are available through a one-time backfill from the home lab

### US-06: User keeps notes on days

- **Given** a user viewing a day in the calendar
- **When** they add, edit or delete a note on that day ("away on holiday", "heat pump installed")
- **Then** the note is saved and shows on that day and in the month and year views, so unusual ratings have a recorded explanation

#### Acceptance Criteria
- Notes are scoped to the single logged-in user's account
- Editing or deleting a note updates or removes it immediately, visible on next view
- Notes are for the user's own reference; they never alter ratings, summaries or recommendations

## Functional Requirements

### Access
- FR-001: User can access the app using an access key (token/link), without creating an account. Priority: must-have
  > Socratic: No counter-argument considered; stands as written.

### Live state & insight
- FR-002: User can view current PV/battery/grid state from Home Assistant, pushed by the home lab at least every 5 minutes, independently of whether the insight/recommendation panel is available. Priority: must-have
  > Socratic: Counter-argument considered: "live pull adds a failure-prone dependency for
  > something that isn't the differentiator." Resolution: kept, but decoupled — the live-state
  > panel and the insight/recommendation panel degrade independently; an HA hiccup doesn't take
  > down the whole app.
  > Correction (2026-09-23): "pulled live" changed to "pushed by the home lab". The home lab
  > is LAN-only, so the app never reaches into it; the lab's existing refresh job sends
  > public-safe snapshots outbound. See existing-system.md.
- FR-003: User can view a derived insight comparing recent usage/generation against a season-adjusted historical baseline (a same-season historical window, not a flat recent average). When same-season historical data is missing or insufficient, the app falls back to a flat trailing-30-day average and visibly discloses that the fallback baseline is in use, rather than silently comparing against thin data or failing. Priority: must-have
  > Socratic: Counter-argument considered: "a raw day-vs-baseline comparison can be misleading
  > without controlling for season/weather." Resolution: baseline redefined as season-adjusted
  > to reduce false anomaly flags.
  > Note (v2, 2026-09-25): the baseline needs per-day totals; the home lab must push its daily
  > history, which it does not do yet.
  > Correction (post-PRD review): the season-adjusted baseline has a cold-start problem — if the
  > historic database lacks data from the equivalent point a year ago, there's nothing to compare
  > against. Resolution: explicit fallback to a flat 30-day average with a visible disclaimer.
- FR-004: User sees a clear staleness indicator and last-known data when the latest push is older than expected (Home Assistant, the lab pipeline or the connection is down). Priority: must-have
  > Socratic: Counter-argument considered: "this is edge-case engineering effort that could be
  > skipped for v1." Resolution: kept must-have — consistent with the guardrail already locked
  > in Phase 3 (app must not fail hard when Home Assistant is down).

### Battery recommendation
- FR-005: User can view a plain-language battery-setting recommendation for today, generated via an LLM that narrates a pre-computed, verified facts bundle from the deterministic advisory engine — the LLM does not introduce new numbers or facts of its own. Priority: must-have
  > Socratic: Counter-argument considered: "an LLM could hallucinate or misstate the underlying
  > facts with confident tone." Resolution: LLM constrained to narration-only over a verified
  > facts bundle; it cannot introduce facts the deterministic engine didn't compute.
- FR-006: The battery recommendation incorporates a weather forecast as an input, stating forecast confidence/uncertainty explicitly rather than as flat fact. Priority: nice-to-have
  > Socratic: Counter-argument considered: "multi-day weather forecasts are often wrong — a
  > confidently-wrong forecast-based tip could be worse than no tip." Resolution: recommendation
  > must surface forecast confidence/uncertainty explicitly, not state it as fact.

### Energy cost & usage (v2 — surfaced from the home lab)
- FR-011: User can view the projected cost of the current month in PLN, with a range and the number of days it is based on, computed by the home lab from its aggregates. Priority: must-have
- FR-012: User can view the actual cost of the last closed billing period under the full tariff (energy and fixed charges), regenerated by the home lab instead of a hand-made one-off figure. Priority: must-have
- FR-013: User can see the home lab's consumption-plan recommendations as manual actions (what to check or change, and why) next to today's battery recommendation, without inverter setting values. Priority: must-have
- FR-014: User can view a usage profile — average consumption across the day, day/night and weekday/weekend shares, and the count of unusual consumption by hour of the day — built from aggregates only. Priority: must-have
- FR-015: User can see how accurate the PV production forecast has been over recent days (forecast vs actual), next to today's recommendation, so its stated confidence has a visible basis. Priority: must-have
- FR-016: User can see the inverter's current charging schedule (time slots, grid charging on/off, target state of charge), as last read by the home lab, next to today's recommendation — display only, never changed from the app. Priority: must-have
- FR-017: User can see why the recommendation or live data is missing or degraded — for example that a fallback narration was used or a lab step failed — as plain status messages, without raw error details. Priority: must-have
  > Note (v2, 2026-09-25): FR-011–014 surface features that already run in the lab's old
  > analyser page, replacing its sample figures with real aggregates. The home lab computes
  > them; the app displays them. FR-015–017 come from a second review of the lab's running
  > jobs: the forecast-vs-actual data, the inverter schedule read and the narration status
  > already exist there. See existing-system.md.

### Data transparency (v3)
- FR-018: Every derived figure, rating and prediction states the period and number of days it is based on (for example "based on 18 days, 1–18 September"). Priority: must-have
- FR-019: Below a minimum amount of data, a card shows "not enough data yet" instead of a verdict, rating or prediction. No prediction or rating is derived from a single day. Priority: must-have
- FR-020: The recommendation states how certain the PV forecast is, derived from the forecast's accuracy over recent days (FR-015) and the number of days behind it. With too few days, it says the certainty is not known yet instead of showing a figure. Priority: must-have
  > Note (v3, 2026-09-26): the lab rarely sends a forecast confidence, so the app's card mostly
  > showed "nieznana". Certainty now comes from the app's own forecast-vs-actual history, which
  > F-02 already stores (pv_forecast_kwh against pv_kwh).

### History, ratings and summaries (v3)
- FR-021: User can open a calendar with day, month and year views, each showing PV production, consumption, grid import/export, forecast against actual, and the recommendations from that period. Priority: must-have
- FR-022: Each completed day and month gets a good / neutral / bad rating computed in the app from self-sufficiency (the share of consumption covered by PV and the battery rather than grid import) compared with the season-adjusted norm, with the basis shown. Thresholds are set when the slice is planned. Priority: must-have
- FR-023: Each completed day and month shows a short summary written by the home lab: an LLM narrates a facts bundle of what happened, taking Polish seasons into account, without advice or suggested changes. It is generated and pushed by the lab ahead of the visit, like the daily recommendation. Priority: must-have
- FR-024: The home lab backfills its full daily history once, so year views and season comparisons work from the start rather than filling in over time. Priority: must-have
  > Note (v3, 2026-09-26): FR-021–024 replace recommendation feedback (FR-007–010) as the way
  > the owner reviews how days went. The rating is deterministic so it is explainable; the
  > summary only narrates, as FR-005 does for the recommendation.

### Plain language for a non-expert (v3)
- FR-029: Every card and rating marks its status with a colour and a text label (green = good, amber = worth watching, red = a problem, grey = not enough data), never with colour alone. Priority: must-have
- FR-030: The dashboard shows a short plain-language explanation of what today's figures mean for the owner, written ahead of the visit by the home lab's LLM chain: the local model first, the existing cloud fallback when it fails. It narrates the same verified facts and introduces no numbers of its own. Priority: must-have
- FR-031: The app remarks when consumption rises or falls noticeably over weeks and months, against earlier periods and the same season a year before when that history exists (for example "consumption is 15% higher than in the same three months last year"), and the day and month summaries (FR-023) point out such patterns. Priority: must-have
  > Note (v3, 2026-09-26): added after the owner asked that the app assume no energy
  > knowledge, use the local LLM for easy-to-read text, mark information with colours and
  > remark on consumption growing over time. The summaries in FR-023 follow the same plain
  > style and the same local-first chain.

### Notes on days (CRUD, v3)
- FR-025: User can add a note to a calendar day. Priority: must-have
- FR-026: User can view notes on the day, and see which days in a month or year have notes. Priority: must-have
- FR-027: User can edit a note. Priority: must-have
- FR-028: User can delete a note. Priority: must-have
  > Correction (v3, 2026-09-26): FR-007–010 (accept/dismiss feedback on recommendations) were
  > removed at the owner's request; the system rates days and months instead (FR-022). Notes on
  > days keep a full create/read/update/delete surface, and they explain the outliers the
  > ratings surface.

## Non-Functional Requirements

- Raw telemetry and billing data (PGE CSVs, customer/POD identifiers, hourly private readings, HA tokens) never leave the home lab. Only public-safe aggregates, the facts bundle and the narrated recommendation are pushed to the app, plus the minimum data required for the weather-forecast lookup. Cost figures and the usage profile arrive as aggregates computed in the home lab; inverter setting values stay in the lab. The inverter schedule leaves the lab only as a slot summary (times, grid charging on/off, target state of charge), and pipeline status only as fixed status codes, never raw error text, device names or addresses.
- Credentials (the app's push-ingestion token, Supabase keys, and the home lab's own HA/LLM credentials) are never committed to source control. The app holds no Home Assistant or LLM credentials.
- The user sees continuous visible feedback (not a frozen screen) during any operation that takes longer than 2 seconds.
- All user-facing text is plain Polish for someone without energy knowledge; each technical term (PV, kW, kWh, battery %, grid import/export) is explained where it first appears on a screen.
- The historical dataset used for the baseline and recommendation is refreshed at least once per day (met by the home lab's 5-minute refresh and push), so "yesterday's usage" is never based on a static, aging snapshot.
- The battery recommendation and the day and month summaries are generated ahead of the user's visit (refreshed at least once daily) rather than synchronously while the user waits, so opening the app never triggers a multi-second wait for LLM inference.

## Business Logic

Given live and historical PV/battery/grid data plus a weather forecast, the app determines whether current usage is anomalous against a season-adjusted baseline, and derives a plain-language battery-setting recommendation for today.

The rule consumes recent and historical PV generation, battery state, and grid import/export readings, the user's existing billing/tariff history, and a short-range weather forecast for the user's location. Its output is a flagged anomaly status for the current period (normal / above-baseline / below-baseline) plus one recommended battery setting for today, phrased in plain language with an explicit confidence note when the weather forecast informs it. When same-season historical data is missing or insufficient, the comparison falls back to a flat trailing-30-day average and visibly discloses that the fallback is in use. The user encounters this on opening the app: the anomaly flag and the recommendation appear together on the main view, without needing to run a report or select a date range — the decision is presented, not buried in raw numbers.

Day and month ratings (FR-022) use the same daily totals: self-sufficiency is `1 − grid import ÷ consumption` for the period, compared with the season-adjusted norm for that time of year. The rating says good, neutral or bad, states the period and number of days behind the norm, and is withheld when there is not enough data (FR-019). It describes; it never advises.

Cost and usage views (FR-011–014) present figures the home lab has already computed from the user's real tariff and billing history; the app adds no pricing logic of its own, and states the period each figure covers.

## Access Control

Access key (magic link) — no account-creation form, no roles, but opening the link **establishes an authenticated session**: the user is logged in for that session and sees only their own resources (current state, insight, recommendations, history, notes). This is a real login mechanism, not just an anonymous page gate — it satisfies "access tied to a logged-in user" without the overhead of a username/password flow. Single user by design.

## Non-Goals

- **No custom weather-forecast modeling** — the app consumes an existing weather-forecast source rather than building forecasting logic of its own.
- **No multi-user / multi-household support** — single-tenant only for this MVP; the 100x-scale check confirmed that real multi-user support would need proper account/credential security, which is out of scope here.
- **No PGE bill reconciliation (predicted vs. actual) and no PGE vs Deye cross-check** — still deferred. PRD v2 brings in the current-month projection and the closed-period cost (FR-011, FR-012), but comparing predictions against issued bills, and PGE against inverter readings, stays out of scope.
- **No PGE CSV upload in the app** — raw bill exports stay in the home lab, which imports them.
- **No synchronous/live LLM generation on each page view** — the recommendation is pre-computed on a daily cadence (see Non-Functional Requirements), not generated fresh while the user waits.
- **No advice from ratings or summaries** — day and month ratings and the lab's summaries describe what happened; they never suggest changes, and they do not feed back into the recommendation logic.
- **No accept/dismiss feedback on recommendations** — removed in v3 (see FR-025–028 for notes on days).
- **Notes never alter anything** — notes on days are for the user's own reference only.

## Open Questions

None open. Five questions raised on 2026-09-23 by reviewing this PRD against the running home-lab system ([existing-system.md](existing-system.md)) were resolved the same day:

1. **Consume or port?** Split. The home lab keeps ingestion, PGE parsing and LLM narration. This app implements the season-adjusted baseline and anomaly flag (FR-003), feedback CRUD and access control over pushed data. (v3: feedback CRUD became notes on days, and the app also computes the day and month ratings.) No home-lab code is copied.
2. **Which LLM path is primary?** The running chain: HA conversation → local Ollama → OpenRouter (opt-in). Narration happens in the home lab; the app displays it with its facts bundle.
3. **Where does the app run relative to the data?** The app stays on the public VPS. The home lab pushes public-safe data outbound, and no v1 feature connects into the home network (FR-002, FR-004). Tailscale via Micr.us is kept as an optional private channel for flexibility, not as a data dependency.
4. **Bill reconciliation?** Stays a non-goal. Superseded in part on 2026-09-25: PRD v2 moves the current-month projection and closed-period cost into scope (FR-011, FR-012); predicted-vs-actual reconciliation stays out.
5. **Brownfield?** No. This repo is new code; the home lab is an external data source that pushes in. `context_type` stays `greenfield`.

v3 (2026-09-26): after using the app, the owner asked for a history calendar, good / neutral / bad ratings of days and months with lab-written summaries that consider Polish seasons, a clear statement of the period behind every figure, no guessing from too little data, and visible prediction certainty. US-02 and FR-007–010 (recommendation feedback) were removed; US-05, US-06 and FR-018–031 added. Decisions taken with the owner: ratings use self-sufficiency against the season norm; ratings carry no advice; the app assumes no energy knowledge, marks status with colour plus a label, remarks on consumption trends, and plain-language texts come from the lab's local model with the existing cloud fallback; the lab backfills its full history once; notes on days keep the CRUD surface. No new open questions: rating thresholds and the minimum-data amounts are set per slice.

v2 (2026-09-25): FR-011–017, US-03 and US-04 added to surface the lab's existing cost and usage features in the app, following a comparison of the lab's old analyser page with this app. The narrowed bill non-goal and the daily-history note on FR-003 come from the same review. No new open questions.

Original note: all required sections were resolved during the `/10x-shape` session — the closing quality cross-check reported no gaps (Access Control, Business Logic, Project artifacts, Timeline-cost acknowledgment, Non-Goals all present). A post-generation review surfaced four refinements (cold-start fallback, data-freshness NFR, sharpened secrets guardrail, and pre-computed recommendation timing) — all resolved at the product level and folded into the relevant sections above; the underlying implementation mechanisms (pipeline push-vs-cron, secret-injection method) are intentionally left open here and forwarded to `/10x-tech-stack-selector`.
