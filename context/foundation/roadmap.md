---
project: energy-analyser
version: 2
status: draft
created: 2026-09-23
updated: 2026-09-26
prd_version: 3
main_goal: speed
top_blocker: time
milestone_id: mvp-daily-advice
milestone_seq: 1
milestone_status: open
---

# Roadmap: Energy Analyser

> Derived from `context/foundation/prd-v3.md` + `existing-system.md` + auto-researched codebase baseline.
> Edit-in-place; archive when superseded. Previous version: `context/foundation/archive/2026-09-26-roadmap-mvp-daily-advice.md`.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: MVP daily advice** — Status: open

- **Intent:** The owner opens the app with an access key and sees near-live state, a season-aware insight and today's battery recommendation, all from data the home lab pushes. Extended 2026-09-25 (PRD v2): the cost, usage and context features of the lab's old analyser page move into the app. Extended 2026-09-26 (PRD v3): every figure states the period behind it and nothing is guessed from too little data; a calendar shows days, months and years with good / neutral / bad ratings, lab-written summaries and the owner's notes; everything is written for someone without energy knowledge, with colours and remarks on consumption trends; recommendation feedback is dropped. Corrected 2026-09-26 (PRD v3.1): the lab's history starts on 2026-07-16, so ratings use a disclosed recent norm until a year of history exists, the backfill covers ten days, the year view is parked, the bill forecast moves up, and the recommendation's context cards (S-09, S-12, S-13) are stretch.
- **Source materials:** `context/foundation/prd-v3.md` (v3; v2 is `prd-v2.md`, v1 is `prd.md`), with `context/foundation/existing-system.md` for what the home lab already provides.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-006, FR-011–FR-031, US-01, US-03–US-07 (the full v3.1 PRD; FR-007–FR-010 and US-02 were removed in v3; the year view is deferred, see Parked). Stretch for the 2026-11-04 deadline: US-07 (S-09, S-12, S-13). S-08 is blocked on the lab; S-10 stays must-have but is sequenced last.

## Vision recap

The owner of a home PV + battery + grid system gets PGE cost feedback a month late and makes battery reserve/charge decisions without knowing what weather or season is coming. The home lab already collects the telemetry, bills and a narrated advisory. This app puts access control, a season-adjusted insight, a browsable history with honest ratings and a maintained codebase on top of that data, so each day's decision is presented instead of buried in raw numbers, and past days can be read for patterns.

## North star

**S-03: User can see today's battery recommendation** — the north star is the smallest end-to-end flow whose success proves the product works, so it was placed as early as its prerequisites allowed. It proved the whole chain (the home lab pushes, the app stores the data, the owner reads today's advice) and is done.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                        | Prerequisites        | PRD refs                          | Status   |
| ---- | ------------------------- | --------------------------------------------------------------------------- | -------------------- | --------------------------------- | -------- |
| F-01 | push-ingestion-endpoint   | (foundation) the home lab can push an authenticated, versioned payload      | —                    | NFR (secrets, raw data)           | done     |
| F-02 | daily-history-push        | (foundation) the home lab pushes per-day energy totals every push           | F-01                 | FR-003, FR-015                    | done     |
| F-03 | history-backfill          | (foundation) the ten lab days before the first push are in the app         | F-02                 | FR-024                            | ready    |
| F-04 | lab-period-summaries      | (foundation) the lab writes plain-language texts for today, days and months | F-02                 | FR-023, FR-030                    | ready    |
| F-05 | solar-forecast-source     | (foundation) Home Assistant has a solar forecast again and the lab pushes it | F-02                | FR-006, FR-015, FR-020            | done     |
| S-01 | access-key-sign-in        | open the app from an access-key link and land in their own session          | —                    | FR-001                            | done     |
| S-02 | live-state-with-staleness | see current PV/battery/grid state, marked stale when pushes stop            | F-01, S-01           | US-01, FR-002, FR-004             | done     |
| S-03 | todays-recommendation     | see today's narrated battery recommendation with forecast confidence        | F-01, S-01           | US-01, FR-005, FR-006             | done     |
| S-04 | seasonal-usage-insight    | see whether recent usage is normal against a season-adjusted baseline       | F-02, S-01           | US-01, FR-003                     | done     |
| S-14 | data-period-transparency  | read every card without energy knowledge: plain words, colours, its data period, no guesses | S-03, S-04 | US-01, FR-018, FR-019, FR-029 | in-progress |
| S-07 | bill-forecast             | see the projected cost of the current month with a range                    | F-01, S-01           | US-03, FR-011                     | proposed |
| S-15 | history-calendar          | browse days and months: production, forecast vs actual, recommendations     | S-14                 | US-05, FR-021                     | proposed |
| S-17 | period-ratings            | see a good / neutral / bad rating for each completed day and month          | S-15                 | US-05, FR-022                     | proposed |
| S-20 | consumption-trends        | see a remark when consumption rises or falls noticeably over weeks and months | S-14, S-15         | US-05, FR-031                     | proposed |
| S-19 | day-notes                 | add, view, edit and delete notes on calendar days                           | S-15                 | US-06, FR-025, FR-026, FR-027, FR-028 | proposed |
| S-18 | period-summaries          | read plain-language explanations of today and summaries of past days and months | F-04, S-15        | US-01, US-05, FR-023, FR-030      | proposed |
| S-11 | forecast-accuracy         | see how accurate the PV forecast has been and how certain today's forecast is | F-05, S-14         | US-01, FR-015, FR-020, FR-006     | proposed |
| S-08 | closed-period-bill        | see the actual cost of the last closed period under the full tariff         | F-01, S-01           | US-03, FR-012                     | blocked  |
| S-09 | consumption-plan-actions  | see the lab's consumption-plan actions next to today's recommendation       | S-03                 | US-07, FR-013                     | proposed |
| S-10 | usage-profile             | see how consumption spreads across the day, week and unusual hours          | F-01, S-01           | US-04, FR-014                     | proposed |
| S-12 | inverter-schedule-view    | see the inverter's current schedule next to the recommendation              | S-03                 | US-07, FR-016                     | proposed |
| S-13 | pipeline-health           | see why advice or live data is missing or degraded                          | S-02, S-03           | US-07, FR-017, FR-004             | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                        | Chain                                                   | Note |
| ------ | ---------------------------- | ------------------------------------------------------- | ---- |
| A      | Delivered core               | `F-01` → `S-01` → `S-02` → `S-03` → `F-02` → `S-04`     | Done; everything below builds on it. |
| B      | Trust in the numbers and cost | `S-14` → `S-07` → `F-05` → `S-11`                      | The owner's first priority. S-07 (cost before the bill) is the PRD's first problem and cheap, so it follows S-14 (v3.1). S-11 needs a week or two of forecasts after F-05 before certainty means anything. |
| C      | History calendar             | `S-15` → `S-17` → `S-20` → `S-19`                       | The main v3 surface; the year view (S-16) is parked until a second year of history exists. |
| D      | Lab history and summaries    | `F-03` → `F-04` → `S-18`                                | homelab-2 work that runs alongside Streams B and C; S-18 joins Stream C at S-15. |
| E      | v2 cost and context          | `S-08` → `S-09` → `S-10` → `S-12` → `S-13`              | Sequenced after the v3 work by the owner's decision (2026-09-26). S-09, S-12 and S-13 are stretch (US-07); S-08 is blocked on the lab; S-10 is must-have but last. S-07 moved to Stream B. |

## Baseline

What's already in place in the codebase as of 2026-09-26 (from the delivered slices and a production check; user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro dashboard with the live state, usage insight and recommendation cards (`src/pages/dashboard.astro`).
- **Backend / API:** present — bearer-token push ingestion (`/api/ingest`), sign-in routes, health.
- **Data:** present — five migrations; owner-only reads through grants and RLS; `daily_energy` in production from 2026-07-26; recommendations kept forever. No PV forecast has been stored (0 of 53 days) and no recommendation carries a forecast.
- **Auth:** present — emailed magic link plus password, no sign-up, long-lived session.
- **Deploy / infra:** present — Dockerfile, Compose, CI with a local-Supabase smoke test, GHCR image, manual production deploy.
- **Observability:** partial — `/api/health` and lab-side alerting (Uptime Kuma + Telegram); nothing further required by the PRD.

## Foundations

### F-01: Push ingestion endpoint

- **Outcome:** (foundation) the app accepts a versioned, bearer-token-authenticated, idempotent push from the home lab and stores it without a service-role key; payload sections for state, recommendation and history are added by the slices that first consume them.
- **Change ID:** push-ingestion-endpoint
- **PRD refs:** NFR (raw telemetry never leaves the home lab), NFR (credentials never committed; app holds no HA/LLM credentials); Open Questions resolution 1 and 3
- **Unlocks:** S-02, S-03, S-04; verification path: a fixture push that exercises the endpoint without the real home lab
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because three slices consumed it; scope stopped at the envelope so it did not become a whole data layer.
- **Status:** done

### F-02: Daily history push

- **Outcome:** (foundation) the home lab derives per-day totals (PV, load, grid import/export, and the day's PV forecast) and sends the last 35 days in every push; the app stores them per day.
- **Change ID:** daily-history-push
- **PRD refs:** FR-003 (v2 note), FR-015; issue #21
- **Unlocks:** S-04, S-11, S-15; verification path: a push with `daily_history` fills one row per day
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Mostly a homelab-2 change; the forecast field it carries stays empty until F-05.
- **Status:** done

### F-03: History backfill

- **Outcome:** (foundation) the home lab sends the days it recorded before the first push (2026-07-16 to 2026-07-25) once, so the app holds every day the lab has, not only those since 2026-07-26.
- **Change ID:** history-backfill
- **PRD refs:** FR-024
- **Unlocks:** ten more days for the calendar and the recent norms of S-04, S-17 and S-20. It does not give a same-season window a year back: the lab's history starts on 2026-07-16, and PGE data (from February 2026) holds grid import/export only.
- **Prerequisites:** F-02
- **Parallel with:** F-04, F-05, S-14, S-15
- **Blockers:** —
- **Unknowns:** — (resolved 2026-09-26: the lab's `energy-history.jsonl` starts on 2026-07-16.)
- **Risk:** Small, homelab-2 only. The push script's `--days` counts back from today and stops at 62, and 2026-07-16 is 72 days back, so the script needs a date-range option (e.g. `--from 2026-07-16 --to 2026-07-26`). The app contract caps a push at 62 entries but not their age, so it does not change. The push must stay idempotent with the regular 35-day push; incomplete days stay empty. **Time-bound:** the lab's history file keeps 25,920 rows (90 days at a 5-minute cadence), and the oldest rows start dropping around 2026-10-28, so F-03 must run before then.
- **Status:** ready

### F-04: Lab period summaries

- **Outcome:** (foundation) the home lab has its stronger model (the existing narration chain) interpret the local model's frequent observations into plain-language texts for someone without energy knowledge: a short explanation of what today's figures mean, and after each completed day and month a summary of what happened that takes Polish seasons into account, points out consumption patterns and gives no advice; it pushes them and the app stores them per period.
- **Change ID:** lab-period-summaries
- **PRD refs:** FR-023, FR-030
- **Unlocks:** S-18
- **Prerequisites:** F-02
- **Parallel with:** F-03, F-05, S-14, S-15, S-17
- **Blockers:** —
- **Unknowns:**
  - Which facts go into a day and a month bundle (totals, self-sufficiency, weather, season), and which provider narrates them? — Owner: user. Block: no.
- **Risk:** homelab-2 plus a new optional contract section; the narration must stay description-only, like the recommendation's facts-only rule.
- **Status:** ready

### F-05: Solar forecast source

- **Outcome:** (foundation) Home Assistant has a working solar forecast integration again, and the lab fills the daily PV forecast and the recommendation's forecast in every push.
- **Change ID:** solar-forecast-source
- **PRD refs:** FR-006, FR-015, FR-020
- **Unlocks:** S-11; the forecast figures on the existing recommendation card
- **Prerequisites:** F-02
- **Parallel with:** F-03, F-04, S-14, S-15
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Home Assistant has had no solar forecast since its host move (~2026-07-21): production has 0 of 53 days with a forecast. It is a homelab-2 and Home Assistant configuration change; certainty needs a week or two of forecasts after it lands. Follow-up found in review: Forecast.Solar comparison values were kept only in the live snapshot, so homelab-2 #28 adds them to lab history.
- **Status:** done

## Slices

### S-01: Access-key sign-in

- **Outcome:** user can open the app from an access-key link and land in an authenticated session that sees only their own data.
- **Change ID:** access-key-sign-in
- **PRD refs:** FR-001; Access Control
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Every page-facing slice relies on the session.
- **Status:** done

### S-02: Live state with staleness

- **Outcome:** user can see current PV/battery/grid state pushed by the home lab, and last-known data with a visible staleness indicator when pushes stop.
- **Change ID:** live-state-with-staleness
- **PRD refs:** US-01, FR-002, FR-004
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** First consumer of the state section of the push contract.
- **Status:** done

### S-03: Today's recommendation

- **Outcome:** user can see today's plain-language battery recommendation narrated by the home lab from its facts bundle (the verified numbers the deterministic engine computed), with forecast confidence stated explicitly and no controls to apply it.
- **Change ID:** todays-recommendation
- **PRD refs:** US-01, FR-005, FR-006
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The north star.
- **Status:** done

### S-04: Seasonal usage insight

- **Outcome:** user can see whether recent usage/generation is normal, above or below a season-adjusted baseline, with a visible notice when the flat 30-day fallback is used.
- **Change ID:** seasonal-usage-insight
- **PRD refs:** US-01, FR-003
- **Prerequisites:** F-02, S-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The first domain logic computed in this app; its season window and sufficiency rule are reused by S-14 and S-17.
- **Status:** done

### S-14: Clarity for a non-expert

- **Outcome:** user can read every existing card without energy knowledge: plain words with technical terms explained where they appear, a colour plus text label for good / worth watching / problem / not enough data, the period and number of days behind each figure, and "not enough data yet" instead of a verdict or prediction when there is too little data.
- **Change ID:** data-period-transparency
- **PRD refs:** US-01, FR-018, FR-019, FR-029; NFR (plain language)
- **Prerequisites:** S-03, S-04
- **Parallel with:** F-03, F-04, F-05
- **Blockers:** —
- **Unknowns:**
  - What is the minimum amount of data per card (S-04 already uses 20 days in the season window)? Set in the plan. — Owner: user. Block: no.
- **Risk:** First by the owner's decision; it sets the plain-language, colour and "period + minimum data" rules every later card reuses, so getting them right once matters more than its size.
- **Status:** in-progress

### S-15: History calendar

- **Outcome:** user can move between days and months in a calendar and see each period's PV production, consumption, grid import/export, forecast against actual, and the recommendations from that period.
- **Change ID:** history-calendar
- **PRD refs:** US-05, FR-021
- **Prerequisites:** S-14
- **Parallel with:** F-03, F-04, F-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The main new surface; it must stay usable on a phone and reuse S-14's period and minimum-data rule rather than invent its own.
- **Status:** proposed

### S-17: Period ratings

- **Outcome:** user can see a good / neutral / bad rating for each completed day and month in the calendar, based on self-sufficiency against a norm (the season-adjusted one when a year of history exists, otherwise the recent trailing one, said plainly on the card), with the basis stated and no advice.
- **Change ID:** period-ratings
- **PRD refs:** US-05, FR-022
- **Prerequisites:** S-15
- **Parallel with:** S-19, F-03, F-04
- **Blockers:** —
- **Unknowns:**
  - Thresholds between good, neutral and bad; set in the plan. — Owner: user. Block: no.
- **Risk:** The rating is computed in the app, like S-04's insight, and reuses its season window, fallback and disclosure. No same-season history exists until about July 2027, so every rating in the MVP uses the recent norm; the plan must check that a falling autumn trend does not paint every day red (for example a shorter window than 30 days). Self-sufficiency is clamped to 0–100% and skipped for incomplete days.
- **Status:** proposed

### S-20: Consumption trends

- **Outcome:** user can see a plain remark when consumption rises or falls noticeably over weeks and months, compared with earlier periods and, once the history reaches back far enough, the same season a year before.
- **Change ID:** consumption-trends
- **PRD refs:** US-05, FR-031
- **Prerequisites:** S-14, S-15
- **Parallel with:** S-19, S-18
- **Blockers:** —
- **Unknowns:**
  - What counts as "noticeable" (percentage and minimum period) — set in the plan. — Owner: user. Block: no.
- **Risk:** Computed in the app like S-04; with history from 2026-07-16 only recent-period comparisons work until about July 2027, so S-14's minimum-data rule decides which remarks appear.
- **Status:** proposed

### S-19: Day notes

- **Outcome:** user can add a note to a calendar day, see it on that day and see which days in a month have notes, and edit or delete it.
- **Change ID:** day-notes
- **PRD refs:** US-06, FR-025, FR-026, FR-027, FR-028
- **Prerequisites:** S-15
- **Parallel with:** S-17, S-20, S-18
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The app's only create/update/delete surface and its first client write; the owner-only table approach from the dropped S-05 (branch `feat/record-feedback`) can be reused.
- **Status:** proposed

### S-18: Period summaries

- **Outcome:** user can read on the dashboard a short plain-language explanation of what today's figures mean, and in the calendar the home lab's summary of what happened on a completed day or in a completed month, next to its rating.
- **Change ID:** period-summaries
- **PRD refs:** US-01, US-05, FR-023, FR-030
- **Prerequisites:** F-04, S-15
- **Parallel with:** S-17, S-19
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Display only; like the recommendation card, the summary is shown as narrated, with its generation time and the period it covers.
- **Status:** proposed

### S-11: Forecast accuracy and certainty

- **Outcome:** user can see how accurate the PV forecast has been over recent days, and next to today's recommendation how certain its forecast is, based on that accuracy and the number of days behind it.
- **Change ID:** forecast-accuracy
- **PRD refs:** US-01, FR-015, FR-020, FR-006
- **Prerequisites:** F-05, S-14
- **Parallel with:** S-15, S-17, S-19
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Second in the owner's priority, but placed after the calendar because it needs a week or two of forecasts after F-05; until then S-14's rule shows certainty as not known yet. Accuracy counts days from 2026-09-27 only: the stored forecast for 2026-09-26 came from Forecast.Solar, which overshoots. Comparing the two sources needs homelab-2 #28 (Forecast.Solar values in lab history) installed.
- **Status:** proposed

### S-07: Bill forecast

- **Outcome:** user can see the projected cost of the current month in PLN, with a range and the number of days it is based on.
- **Change ID:** bill-forecast
- **PRD refs:** US-03, FR-011
- **Prerequisites:** F-01, S-01
- **Parallel with:** F-05, S-15
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The lab already computes the forecast every 5 minutes; the slice adds a contract section and a card. Moved right after S-14 (v3.1, owner's decision 2026-09-26): late cost feedback is the first problem the PRD names, and the slice is cheap. It must follow S-14's period and plain-language rules.
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
- **PRD refs:** US-07, FR-013
- **Prerequisites:** S-03
- **Parallel with:** S-07, S-10, S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Stretch for the deadline (US-07, v3.1). The lab's plan cards include setting values; the contract must carry titles, facts and actions only.
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

### S-12: Inverter schedule view

- **Outcome:** user can see the inverter's current charging schedule (slots, grid charging, target SOC) as last read by the lab, next to today's recommendation.
- **Change ID:** inverter-schedule-view
- **PRD refs:** US-07, FR-016
- **Prerequisites:** S-03
- **Parallel with:** S-09, S-13
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Stretch for the deadline (US-07, v3.1). Display only; the lab's settings read includes entity names and a LAN address, so only the slot summary may be pushed.
- **Status:** proposed

### S-13: Pipeline health

- **Outcome:** user can see why the recommendation or live data is missing or degraded (fallback narration used, a lab step failed) as plain status messages.
- **Change ID:** pipeline-health
- **PRD refs:** US-07, FR-017, FR-004
- **Prerequisites:** S-02, S-03
- **Parallel with:** S-12
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Stretch for the deadline (US-07, v3.1). Fixed status codes only; raw provider errors can contain URLs or prompt fragments. Lab-side alerting already exists, so this slice explains degraded data in the app.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                             | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------- | ----------------------------------------------------------------- | --------------------- | ----- |
| F-01       | push-ingestion-endpoint   | Authenticated, idempotent push ingestion endpoint (v1 envelope)   | no                    | Done |
| F-02       | daily-history-push        | Lab pushes the last 35 days of per-day energy totals              | no                    | Done |
| F-03       | history-backfill          | One-time backfill of the ten lab days before the first push       | yes                   | Run `/10x-plan history-backfill`; mostly homelab-2, one push |
| F-04       | lab-period-summaries      | Lab writes plain-language texts for today, days and months        | yes                   | Run `/10x-plan lab-period-summaries`; mostly homelab-2 |
| F-05       | solar-forecast-source     | Restore the Home Assistant solar forecast and push it             | yes                   | Run `/10x-plan solar-forecast-source`; homelab-2 + HA config |
| S-01       | access-key-sign-in        | Replace email/password with access-key sign-in                    | no                    | Done |
| S-02       | live-state-with-staleness | Show pushed live state with staleness indicator                   | no                    | Done |
| S-03       | todays-recommendation     | Show today's narrated battery recommendation                      | no                    | Done |
| S-04       | seasonal-usage-insight    | Season-adjusted usage insight with 30-day fallback                | no                    | Done |
| S-14       | data-period-transparency  | Clarity for a non-expert: plain words, colours, data period, no guesses | yes             | Run `/10x-plan data-period-transparency` |
| S-15       | history-calendar          | Calendar with day and month views of production and advice        | no                    | Needs S-14 |
| S-17       | period-ratings            | Good / neutral / bad ratings for days and months                  | no                    | Needs S-15 |
| S-20       | consumption-trends        | Remarks when consumption rises or falls over weeks and months      | no                    | Needs S-14, S-15 |
| S-19       | day-notes                 | Notes on calendar days (create, view, edit, delete)               | no                    | Needs S-15 |
| S-18       | period-summaries          | Show today's plain explanation and the day/month summaries        | no                    | Needs F-04, S-15 |
| S-11       | forecast-accuracy         | Show forecast accuracy and today's forecast certainty             | no                    | Needs F-05 and ~1–2 weeks of forecasts, S-14 |
| S-07       | bill-forecast             | Show the projected cost of the current month                      | yes                   | Right after S-14 |
| S-08       | closed-period-bill        | Show the closed-period cost under the full tariff                 | no                    | Blocked: full G11 tariff not deployed on the lab |
| S-09       | consumption-plan-actions  | Show consumption-plan manual actions next to the advice           | yes                   | Stretch, after the v3 work |
| S-10       | usage-profile             | Show the usage profile (day, week, unusual hours)                 | yes                   | After the v3 work |
| S-12       | inverter-schedule-view    | Show the inverter's current schedule (read-only)                  | yes                   | Stretch, after the v3 work |
| S-13       | pipeline-health           | Show why advice or live data is degraded                          | yes                   | Stretch, after the v3 work |

## Open Roadmap Questions

1. **How are the push contract versions kept in step between this repo and homelab-2?** — Owner: user. Block: none. Practice since F-02: optional fields are added to the app contract first and deployed before the lab sends them. F-03, F-04 and F-05 follow the same practice.
2. **Should the daily advice also go to Telegram?** — Owner: user. Block: none. Raised 2026-09-25; lab-side and not in the PRD, so it would be a homelab-2 change or a PRD update, not an M-1 slice.
3. **Does all of M-1 fit before the 2026-11-04 deadline?** — Owner: user. Block: none. v3.1 (2026-09-26) sets the line: S-07 moved up; US-07 (S-09, S-12, S-13) is stretch; S-10 is last. Revisit after S-15.

## Parked

- **Recommendation feedback: S-05 `record-feedback` and S-06 `edit-delete-feedback`** — Why parked: dropped by the owner on 2026-09-26 (PRD v3 removed US-02 and FR-007–FR-010); the system rates days and months instead (S-17), and notes on days (S-19) are the CRUD surface. S-05's phase 1 stays unmerged on branch `feat/record-feedback` for reference.
- **S-16 `calendar-year-view`** — Why parked: the lab's history starts on 2026-07-16, so a year view would show only part of 2026 and no year could be compared with another. Revisit when a second year of history exists (about July 2027).
- **Custom weather-forecast modelling** — Why parked: PRD Non-Goals; the lab's existing forecast source is consumed (F-05 restores it).
- **Multi-user / multi-household support** — Why parked: PRD Non-Goals; single-tenant by design.
- **PGE bill reconciliation (predicted vs actual) and the PGE vs Deye cross-check** — Why parked: PRD Non-Goals; the projection and closed-period cost (S-07, S-08) are in scope, the comparison is not.
- **PGE CSV upload in the app** — Why parked: PRD Non-Goals; raw bill exports stay in the lab.
- **Dynamic buy/sell prices and PGE payment due date** — Why parked: considered from the lab review on 2026-09-25 but not taken into the PRD.
- **Any device control (time-of-use changes, grid charging, Solar Accelerator strategy)** — Why parked: PRD guardrail; the app never writes to the inverter or Home Assistant.
- **Live LLM generation on page view** — Why parked: PRD Non-Goals; the recommendation and the period summaries are pre-computed by the lab.
- **Advice from ratings or summaries** — Why parked: PRD v3 Non-Goals; ratings and summaries describe what happened and never suggest changes.
- **Pre-issued reusable access link** — Why parked: a link that works on every visit is a password in a URL; the magic link plus a long session covers the single owner.
- **On-demand features over the Tailscale channel** — Why parked: infrastructure.md keeps Tailscale off the v1 critical path.

## Milestone History

## Done

- **F-01: (foundation) the app accepts a versioned, bearer-token-authenticated, idempotent push from the home lab and stores it without a service-role key; payload sections for state, recommendation and history are added by the slices that first consume them.** — Archived 2026-09-23 → `context/archive/2026-09-23-push-ingestion-endpoint/`. Lesson: —.
- **S-02: user can see current PV/battery/grid state pushed by the home lab, and last-known data with a visible staleness indicator when pushes stop.** — Archived 2026-09-25 → `context/archive/2026-09-25-live-state-with-staleness/`. Lesson: —.
- **F-02: (foundation) the home lab derives per-day totals (PV, load, grid import/export, and the day's PV forecast) and sends the last 35 days in every push; the app stores them per day.** — Archived 2026-09-25 → `context/archive/2026-09-25-daily-history-push/`. Lesson: —.
- **S-04: user can see whether recent usage/generation is normal, above or below a season-adjusted baseline, with a visible notice when the flat 30-day fallback is used.** — Archived 2026-09-25 → `context/archive/2026-09-25-seasonal-usage-insight/`. Lesson: —.
- **S-01: user can open the app from an access-key link and land in an authenticated session that sees only their own data.** — Archived 2026-09-26 → `context/archive/2026-09-23-access-key-sign-in/`. Lesson: —.
- **S-03: user can see today's plain-language battery recommendation narrated by the home lab from its facts bundle (the verified numbers the deterministic engine computed), with forecast confidence stated explicitly and no controls to apply it.** — Archived 2026-09-26 → `context/archive/2026-09-23-todays-recommendation/`. Lesson: —.
- **F-05: (foundation) Home Assistant has a working solar forecast integration again, and the lab fills the daily PV forecast and the recommendation's forecast in every push.** — Archived 2026-09-26 → `context/archive/2026-09-26-solar-forecast-source/`. Lesson: —.
