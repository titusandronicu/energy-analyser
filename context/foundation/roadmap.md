---
project: energy-analyser
version: 1
status: draft
created: 2026-09-23
updated: 2026-09-25
prd_version: 2
main_goal: speed
top_blocker: time
milestone_id: mvp-daily-advice
milestone_seq: 1
milestone_status: open
---

# Roadmap: Energy Analyser

> Derived from `context/foundation/prd.md` (v1) + `existing-system.md` + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: MVP daily advice** — Status: open

- **Intent:** The owner opens the app with an access key and sees near-live state, a season-aware insight and today's battery recommendation, all from data the home lab pushes, and can keep a feedback history on those recommendations. Extended 2026-09-25 (PRD v2): the cost, usage and context features of the lab's old analyser page move into the app, replacing its sample figures with real aggregates.
- **Source materials:** `context/foundation/prd-v2.md` (v2; v1 is `prd.md`), with `context/foundation/existing-system.md` for what the home lab already provides.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-017, US-01–US-04 (the full v2 PRD).

## Vision recap

The owner of a home PV + battery + grid system gets PGE cost feedback a month late and makes battery reserve/charge decisions without knowing what weather or season is coming. The home lab already collects the telemetry, bills and a narrated advisory. This app puts access control, a season-adjusted anomaly insight, feedback history and a maintained codebase on top of that data, so each day's decision is presented instead of buried in raw numbers.

## North star

**S-03: User can see today's battery recommendation** — the north star is the smallest end-to-end flow whose success proves the product works, so it is placed as early as its prerequisites allow. Here it proves the whole chain: the home lab pushes, the app stores the data and the owner reads today's advice. With speed as the goal, this is the link most worth proving first.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                    | Prerequisites | PRD refs                     | Status   |
| ---- | ------------------------- | ----------------------------------------------------------------------- | ------------- | ---------------------------- | -------- |
| F-01 | push-ingestion-endpoint   | (foundation) the home lab can push an authenticated, versioned payload  | —             | NFR (secrets, raw data)      | done     |
| S-01 | access-key-sign-in        | open the app from an access-key link and land in their own session      | —             | FR-001                       | in-progress |
| S-02 | live-state-with-staleness | see current PV/battery/grid state, marked stale when pushes stop        | F-01, S-01    | US-01, FR-002, FR-004        | done     |
| S-03 | todays-recommendation     | see today's narrated battery recommendation with forecast confidence    | F-01, S-01    | US-01, FR-005, FR-006        | in-progress |
| S-04 | seasonal-usage-insight    | see whether recent usage is normal against a season-adjusted baseline   | F-02, S-01    | US-01, FR-003                | in-progress |
| S-05 | record-feedback           | accept or dismiss today's recommendation with a note and see history    | S-03          | US-02, FR-007, FR-008        | proposed |
| S-06 | edit-delete-feedback      | edit or delete a past feedback entry                                    | S-05          | US-02, FR-009, FR-010        | proposed |
| F-02 | daily-history-push        | (foundation) the home lab pushes per-day energy totals every push       | F-01          | FR-003, FR-015               | in-progress |
| S-07 | bill-forecast             | see the projected cost of the current month with a range                | F-01, S-01    | US-03, FR-011                | proposed |
| S-08 | closed-period-bill        | see the actual cost of the last closed period under the full tariff     | F-01, S-01    | US-03, FR-012                | blocked  |
| S-09 | consumption-plan-actions  | see the lab's consumption-plan actions next to today's recommendation  | S-03          | US-01, FR-013                | proposed |
| S-10 | usage-profile             | see how consumption spreads across the day, week and unusual hours      | F-01, S-01    | US-04, FR-014                | proposed |
| S-11 | forecast-accuracy         | see how accurate the PV forecast has been, next to the recommendation   | F-02, S-03    | US-01, FR-015, FR-006        | proposed |
| S-12 | inverter-schedule-view    | see the inverter's current schedule next to the recommendation          | S-03          | US-01, FR-016                | proposed |
| S-13 | pipeline-health           | see why advice or live data is missing or degraded                     | S-02, S-03    | US-01, FR-017, FR-004        | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                               | Note                                                                  |
| ------ | ------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| A      | Advice loop        | `F-01` → `S-03` → `S-05` → `S-06`   | The shortest path to the north star, then the CRUD surface on top of it. |
| B      | Access             | `S-01`                              | No prerequisites; run it in parallel with F-01. Every page-facing slice needs it. |
| C      | State and insight  | `S-02` → `F-02` → `S-04` → `S-11`   | Daily history unblocks the seasonal insight and forecast accuracy; S-11 also needs S-03. |
| D      | Cost and usage     | `S-07` → `S-08` → `S-10`            | Money feedback from lab aggregates; S-08 waits for the full tariff on the lab. |
| E      | Advice context     | `S-09` → `S-12` → `S-13`            | Joins Stream A at S-03: context around today's recommendation. |

## Baseline

What's already in place in the codebase as of 2026-09-23 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro + React + Tailwind + shadcn; `src/layouts/Layout.astro`, placeholder `src/pages/dashboard.astro`.
- **Backend / API:** partial — auth routes and `/api/health` only; the Origin check in `src/middleware.ts` currently rejects non-browser POSTs to `/api/*`.
- **Data:** absent — Supabase configured (`supabase/config.toml`), no migrations yet.
- **Auth:** partial — Supabase email/password with an `ALLOW_SIGNUP` gate; no access-key login.
- **Deploy / infra:** present — Dockerfile, Compose, CI, GHCR image publish, manual production deploy.
- **Observability:** partial — `/api/health` only; nothing further required by the PRD.

## Foundations

### F-01: Push ingestion endpoint

- **Outcome:** (foundation) the app accepts a versioned, bearer-token-authenticated, idempotent push from the home lab and stores it without a service-role key; payload sections for state, recommendation and history are added by the slices that first consume them.
- **Change ID:** push-ingestion-endpoint
- **PRD refs:** NFR (raw telemetry never leaves the home lab), NFR (credentials never committed; app holds no HA/LLM credentials); Open Questions resolution 1 and 3
- **Unlocks:** S-02, S-03, S-04; verification path: a fixture push that exercises the endpoint without the real home lab
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Where is the matching homelab-2 push change tracked, and does it land before S-02/S-03 need real data? — Owner: user. Block: no.
- **Risk:** Sequenced first because three slices consume it and the write path (no service-role key, rotatable token, origin-check exemption) is the least familiar piece; scope stops at the envelope so it does not become a whole data layer.
- **Status:** done

### F-02: Daily history push

- **Outcome:** (foundation) the home lab derives per-day totals (PV, load, grid import/export, and the day's PV forecast) and sends the last 35 days in every push; the app stores them per day.
- **Change ID:** daily-history-push
- **PRD refs:** FR-003 (v2 note), FR-015; issue #21
- **Unlocks:** S-04, S-11; verification path: a push with `daily_history` fills one row per day
- **Prerequisites:** F-01
- **Parallel with:** S-05, S-07, S-09, S-10, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Mostly a homelab-2 change (the app already accepts `daily_history`); the per-day forecast field is new to the contract, so it lands here rather than in S-11.
- **Status:** in-progress

## Slices

### S-01: Access-key sign-in

- **Outcome:** user can open the app from an access-key link and land in an authenticated session that sees only their own data.
- **Change ID:** access-key-sign-in
- **PRD refs:** FR-001; Access Control
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** — (resolved 2026-09-23: emailed magic link with a long-lived session; a pre-issued reusable link is parked, see ## Parked)
- **Risk:** Replaces the starter's email/password flow; kept first and small because every page-facing slice relies on the session.
- **Status:** in-progress

### S-02: Live state with staleness

- **Outcome:** user can see current PV/battery/grid state pushed by the home lab, and last-known data with a visible staleness indicator when pushes stop.
- **Change ID:** live-state-with-staleness
- **PRD refs:** US-01, FR-002, FR-004
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low domain risk; first consumer of the state section of the push contract, so a contract mismatch shows up here.
- **Status:** done

### S-03: Today's recommendation

- **Outcome:** user can see today's plain-language battery recommendation narrated by the home lab from its facts bundle (the verified numbers the deterministic engine computed), with forecast confidence stated explicitly and no controls to apply it.
- **Change ID:** todays-recommendation
- **PRD refs:** US-01, FR-005, FR-006
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:**
  - Confirm in the plan that the lab's facts bundle carries forecast confidence (owner expects it does, 2026-09-23); if not, FR-006 splits out. — Owner: user. Block: no.
- **Decided (2026-09-23):** the recommendation is shown in Polish as narrated by the lab; the app UI is Polish.
- **Risk:** The north star; placed as early as F-01 and S-01 allow. FR-006 is nice-to-have and gets split out if the lab does not supply confidence yet.
- **Status:** in-progress

### S-04: Seasonal usage insight

- **Outcome:** user can see whether recent usage/generation is normal, above or below a season-adjusted baseline, with a visible notice when the flat 30-day fallback is used.
- **Change ID:** seasonal-usage-insight
- **PRD refs:** US-01, FR-003
- **Prerequisites:** F-02, S-01
- **Parallel with:** S-02, S-03, S-05, S-06
- **Blockers:** —
- **Unknowns:** — (proposed 2026-09-23, confirm in the plan: "same season" = ±14 days around the same day of year in earlier years; sufficient = at least 20 days with data in that window, else the trailing 30-day fallback)
- **Risk:** The only domain logic computed in this app; history starts mid-2026, so the fallback path is the one that runs first and must be tested.
- **Status:** in-progress

### S-05: Record feedback

- **Outcome:** user can accept or dismiss today's recommendation with an optional note and see their feedback history.
- **Change ID:** record-feedback
- **PRD refs:** US-02, FR-007, FR-008
- **Prerequisites:** S-03
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Needs a stored recommendation to attach to; feedback stays reference-only and never alters future recommendations.
- **Status:** proposed

### S-06: Edit and delete feedback

- **Outcome:** user can edit the status or note of a past feedback entry, or delete it, and see the change on next view.
- **Change ID:** edit-delete-feedback
- **PRD refs:** US-02, FR-009, FR-010
- **Prerequisites:** S-05
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Completes the CRUD surface; low risk once S-05's ownership rules are in place.
- **Status:** proposed

### S-07: Bill forecast

- **Outcome:** user can see the projected cost of the current month in PLN, with a range and the number of days it is based on.
- **Change ID:** bill-forecast
- **PRD refs:** US-03, FR-011
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-04, S-05, S-09, S-10, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The lab already computes the forecast every 5 minutes; the slice adds a contract section and a card, so it is the cheapest cost feedback.
- **Status:** proposed

### S-08: Closed-period bill

- **Outcome:** user can see the actual cost of the last closed billing period under the full tariff (energy and fixed charges).
- **Change ID:** closed-period-bill
- **PRD refs:** US-03, FR-012
- **Prerequisites:** F-01, S-01, full G11 tariff deployed on the lab
- **Parallel with:** S-07, S-10
- **Blockers:** —
- **Unknowns:**
  - Deploy the full G11 tariff code to the lab (the server still runs the flat-rate version) and regenerate the closed-period figure on a schedule — Owner: user. Block: yes.
- **Risk:** Wrong money figures destroy trust faster than missing ones; blocked until the lab computes them with the real tariff.
- **Status:** blocked

### S-09: Consumption-plan actions

- **Outcome:** user can see the lab's consumption-plan recommendations as manual actions next to today's recommendation, without inverter setting values.
- **Change ID:** consumption-plan-actions
- **PRD refs:** US-01, FR-013
- **Prerequisites:** S-03
- **Parallel with:** S-07, S-10, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The lab's plan cards include setting values; the contract must carry titles, facts and actions only.
- **Status:** proposed

### S-10: Usage profile

- **Outcome:** user can see average consumption across the day, day/night and weekday/weekend shares, and unusual consumption by hour of the day, from aggregates only.
- **Change ID:** usage-profile
- **PRD refs:** US-04, FR-014
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-07, S-09, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Built from imported PGE data in the lab; only hour-of-day aggregates may leave, never single readings or timestamps.
- **Status:** proposed

### S-11: Forecast accuracy

- **Outcome:** user can see how accurate the PV forecast has been over recent days, next to today's recommendation.
- **Change ID:** forecast-accuracy
- **PRD refs:** US-01, FR-015, FR-006
- **Prerequisites:** F-02, S-03
- **Parallel with:** S-12, S-13
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Computed in the app from pushed daily forecast and actual PV; history is short at first, so the view must state how many days it covers.
- **Status:** proposed

### S-12: Inverter schedule view

- **Outcome:** user can see the inverter's current charging schedule (slots, grid charging, target SOC) as last read by the lab, next to today's recommendation.
- **Change ID:** inverter-schedule-view
- **PRD refs:** US-01, FR-016
- **Prerequisites:** S-03
- **Parallel with:** S-09, S-11, S-13
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Display only; the lab's settings read includes entity names and a LAN address, so only the slot summary may be pushed.
- **Status:** proposed

### S-13: Pipeline health

- **Outcome:** user can see why the recommendation or live data is missing or degraded (fallback narration used, a lab step failed) as plain status messages.
- **Change ID:** pipeline-health
- **PRD refs:** US-01, FR-017, FR-004
- **Prerequisites:** S-02, S-03
- **Parallel with:** S-11, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Fixed status codes only; raw provider errors can contain URLs or prompt fragments.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                        | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------- | ------------------------------------------------------------ | --------------------- | ----- |
| F-01       | push-ingestion-endpoint   | Authenticated, idempotent push ingestion endpoint (v1 envelope) | yes                | Run `/10x-plan push-ingestion-endpoint` |
| S-01       | access-key-sign-in        | Replace email/password with access-key sign-in               | yes                   | Run `/10x-plan access-key-sign-in` |
| S-02       | live-state-with-staleness | Show pushed live state with staleness indicator              | no                    | Needs F-01, S-01 |
| S-03       | todays-recommendation     | Show today's narrated battery recommendation                 | no                    | Needs F-01, S-01; north star |
| S-04       | seasonal-usage-insight    | Season-adjusted usage insight with 30-day fallback           | no                    | Needs F-02, S-01 |
| S-05       | record-feedback           | Accept/dismiss feedback on a recommendation + history        | no                    | Needs S-03 |
| S-06       | edit-delete-feedback      | Edit and delete feedback entries                             | no                    | Needs S-05 |
| F-02       | daily-history-push        | Lab pushes the last 35 days of per-day energy totals         | yes                   | Run `/10x-plan daily-history-push`; mostly homelab-2 (issue #21) |
| S-07       | bill-forecast             | Show the projected cost of the current month                 | no                    | Needs S-01 done |
| S-08       | closed-period-bill        | Show the closed-period cost under the full tariff            | no                    | Blocked: full G11 tariff not deployed on the lab |
| S-09       | consumption-plan-actions  | Show consumption-plan manual actions next to the advice      | no                    | Needs S-03 done |
| S-10       | usage-profile             | Show the usage profile (day, week, unusual hours)            | no                    | Needs S-01 done |
| S-11       | forecast-accuracy         | Show recent PV forecast accuracy                             | no                    | Needs F-02, S-03 |
| S-12       | inverter-schedule-view    | Show the inverter's current schedule (read-only)             | no                    | Needs S-03 done |
| S-13       | pipeline-health           | Show why advice or live data is degraded                     | no                    | Needs S-02, S-03 |

## Open Roadmap Questions

1. **How are the push contract versions kept in step between this repo and homelab-2?** — Owner: user. Block: none (settle in F-01's plan).

## Parked

- **Custom weather-forecast modelling** — Why parked: PRD Non-Goals; the lab's existing forecast source is consumed.
- **Multi-user / multi-household support** — Why parked: PRD Non-Goals; single-tenant by design.
- **PGE bill reconciliation (predicted vs actual) and the PGE vs Deye cross-check** — Why parked: PRD v2 Non-Goals; the projection and closed-period cost (S-07, S-08) are in scope, the comparison is not.
- **PGE CSV upload in the app** — Why parked: PRD v2 Non-Goals; raw bill exports stay in the lab.
- **Dynamic buy/sell prices and PGE payment due date** — Why parked: considered from the lab review on 2026-09-25 but not taken into PRD v2.
- **Any device control (time-of-use changes, grid charging, Solar Accelerator strategy)** — Why parked: PRD guardrail; the app never writes to the inverter or Home Assistant.
- **Live LLM generation on page view** — Why parked: PRD Non-Goals; the recommendation is pre-computed.
- **Feedback-driven recommendation learning** — Why parked: PRD Non-Goals (v1 feedback is reference-only).
- **Pre-issued reusable access link** — Why parked: a link that works on every visit is a password in a URL, and minting one without the forbidden service-role key needs its own token store; the magic link plus a long session covers the single owner for v1.
- **On-demand features over the Tailscale channel** — Why parked: infrastructure.md keeps Tailscale off the v1 critical path.

## Milestone History

## Done

- **F-01: (foundation) the app accepts a versioned, bearer-token-authenticated, idempotent push from the home lab and stores it without a service-role key; payload sections for state, recommendation and history are added by the slices that first consume them.** — Archived 2026-09-23 → `context/archive/2026-09-23-push-ingestion-endpoint/`. Lesson: —.
- **S-02: user can see current PV/battery/grid state pushed by the home lab, and last-known data with a visible staleness indicator when pushes stop.** — Archived 2026-09-25 → `context/archive/2026-09-25-live-state-with-staleness/`. Lesson: —.
