---
project: energy-analyser
version: 2
status: draft
created: 2026-09-23
updated: 2026-10-07
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
- **Scope anchors:** FR-001–FR-006, FR-011–FR-036, US-01, US-03–US-08 (the full v3.1 PRD; FR-007–FR-010 and US-02 were removed in v3; the year view is deferred, see Parked). Stretch for the 2026-11-04 deadline: US-07 (S-09, S-12, S-13). S-08 is blocked on the lab; S-10 stays must-have but is sequenced last.

## Vision recap

The owner of a home PV + battery + grid system gets PGE cost feedback a month late and makes battery reserve/charge decisions without knowing what weather or season is coming. The home lab already collects the telemetry, bills and a narrated advisory. This app puts access control, a season-adjusted insight, a browsable history with honest ratings and a maintained codebase on top of that data, so each day's decision is presented instead of buried in raw numbers, and past days can be read for patterns.

## North star

**S-03: User can see today's battery recommendation** — the north star is the smallest end-to-end flow whose success proves the product works, so it was placed as early as its prerequisites allowed. It proved the whole chain (the home lab pushes, the app stores the data, the owner reads today's advice) and is done.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                                        | Prerequisites | PRD refs                              | Status   |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| F-01 | push-ingestion-endpoint   | (foundation) the home lab can push an authenticated, versioned payload                      | —             | NFR (secrets, raw data)               | done     |
| F-02 | daily-history-push        | (foundation) the home lab pushes per-day energy totals every push                           | F-01          | FR-003, FR-015                        | done     |
| F-03 | history-backfill          | (foundation) the ten lab days before the first push are in the app                          | F-02          | FR-024                                | done     |
| F-04 | lab-period-summaries      | (foundation) the lab writes plain-language texts for today, days and months                 | F-02          | FR-023, FR-030                        | done     |
| F-05 | solar-forecast-source     | (foundation) Home Assistant has a solar forecast again and the lab pushes it                | F-02          | FR-006, FR-015, FR-020                | done     |
| F-07 | e2e-alert-rules           | (foundation) a browser test drives the alert-rules page against a real local stack in CI    | S-21          | test-plan risk #8                     | done     |
| F-06 | history-gap-fill          | (foundation) the missing and empty days are re-sent from Home Assistant's hourly statistics | F-03          | FR-021, FR-024                        | proposed |
| S-01 | access-key-sign-in        | open the app from an access-key link and land in their own session                          | —             | FR-001                                | done     |
| S-02 | live-state-with-staleness | see current PV/battery/grid state, marked stale when pushes stop                            | F-01, S-01    | US-01, FR-002, FR-004                 | done     |
| S-03 | todays-recommendation     | see today's narrated battery recommendation with forecast confidence                        | F-01, S-01    | US-01, FR-005, FR-006                 | done     |
| S-04 | seasonal-usage-insight    | see whether recent usage is normal against a season-adjusted baseline                       | F-02, S-01    | US-01, FR-003                         | done     |
| S-14 | data-period-transparency  | read every card without energy knowledge: plain words, colours, its data period, no guesses | S-03, S-04    | US-01, FR-018, FR-019, FR-029         | done     |
| S-07 | bill-forecast             | see the projected cost of the current month with a range                                    | F-01, S-01    | US-03, FR-011                         | done     |
| S-15 | history-calendar          | browse days and months: production, forecast vs actual, recommendations                     | S-14          | US-05, FR-021                         | done     |
| S-16 | calendar-year-view        | open the calendar's year view with the current year's totals to date                        | S-15          | US-05, FR-021                         | proposed |
| S-17 | period-ratings            | see a good / neutral / bad rating for each completed day and month                          | S-15          | US-05, FR-022                         | done     |
| S-20 | consumption-trends        | see a remark when consumption rises or falls noticeably over weeks and months               | S-14, S-15    | US-05, FR-031                         | proposed |
| S-19 | day-notes                 | add, view, edit and delete notes on calendar days                                           | S-15          | US-06, FR-025, FR-026, FR-027, FR-028 | done     |
| S-18 | period-summaries          | read plain-language explanations of today and summaries of past days and months             | F-04, S-15    | US-01, US-05, FR-023, FR-030          | done     |
| S-11 | forecast-accuracy         | see how accurate the PV forecast has been and how certain today's forecast is               | F-05, S-14    | US-01, FR-015, FR-020, FR-006         | proposed |
| S-08 | closed-period-bill        | see the actual cost of the last closed period under the full tariff                         | F-01, S-01    | US-03, FR-012                         | blocked  |
| S-09 | consumption-plan-actions  | see the lab's consumption-plan actions next to today's recommendation                       | S-03          | US-07, FR-013                         | proposed |
| S-10 | usage-profile             | see how consumption spreads across the day, week and unusual hours                          | F-01, S-01    | US-04, FR-014                         | proposed |
| S-12 | inverter-schedule-view    | see the inverter's current schedule next to the recommendation                              | S-03          | US-07, FR-016                         | proposed |
| S-13 | pipeline-health           | see why advice or live data is missing or degraded                                          | S-02, S-03    | US-07, FR-017, FR-004                 | proposed |
| S-21 | alert-rules               | set alert rules and get a Telegram message when one fires, reminds or recovers              | S-02, S-07    | US-08, FR-032–036                     | done     |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                         | Chain                                               | Note                                                                                                                                                                                                       |
| ------ | ----------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Delivered core                | `F-01` → `S-01` → `S-02` → `S-03` → `F-02` → `S-04` | Done; everything below builds on it.                                                                                                                                                                       |
| B      | Trust in the numbers and cost | `S-14` → `S-07` → `F-05` → `S-11`                   | The owner's first priority. S-07 (cost before the bill) is the PRD's first problem and cheap, so it follows S-14 (v3.1). S-11 needs a week or two of forecasts after F-05 before certainty means anything. |
| C      | History calendar              | `S-15` → `S-17` → `S-20` → `S-19`                   | The main v3 surface; S-16 (year view) is no longer parked — it ships as a partial-year view; only year-over-year comparison still waits for a second year of history.                                      |
| D      | Lab history and summaries     | `F-03` → `F-04` → `S-18`                            | homelab-2 work that runs alongside Streams B and C; S-18 joins Stream C at S-15.                                                                                                                           |
| F      | Alerts and verification       | `S-21` → `F-07`                                     | Added 2026-10-06 (PRD v3.2): the second CRUD surface with Telegram messages, built on the owner's request, and the first browser e2e test of it. S-21 waits only for the real production alarm (row 4.6).  |
| E      | v2 cost and context           | `S-08` → `S-09` → `S-10` → `S-12` → `S-13`          | Sequenced after the v3 work by the owner's decision (2026-09-26). S-09, S-12 and S-13 are stretch (US-07); S-08 is blocked on the lab; S-10 is must-have but last. S-07 moved to Stream B.                 |

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
- **Risk:** Small, homelab-2 only. The push script's `--days` counts back from today and stops at 62, and 2026-07-16 was 76 days back, so the script needed a date-range option (`--from 2026-07-16 --to 2026-07-25`; added and pushed once on 2026-09-30). The app contract caps a push at 62 entries but not their age, so it does not change. The push must stay idempotent with the regular 35-day push; incomplete days stay empty. **Time-bound:** the lab's history file keeps 25,920 rows (90 days at a 5-minute cadence), and the oldest rows start dropping about 2026-10-30, so F-03 had to run before then.
- **Status:** done

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
- **Risk:** homelab-2 plus a new optional contract section; the narration must stay description-only, like the recommendation's facts-only rule. The new section carries its facts apart from the narration, so a failed LLM call leaves the facts in the push instead of dropping the whole section the way the recommendation block does today (owner's decision 2026-09-30, `lab-feature-port`; the old recommendation block keeps its gate).
- **Status:** done

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

### F-06: History gap fill

- **Outcome:** (foundation) the lab reads Home Assistant's hourly statistics on the UGREEN (kept indefinitely since 2026-07-20) and re-sends the days the app is missing or holds with empty totals (07-31, 08-10, 09-14–18, 09-22–24; 07-20, 08-31, 09-13, 09-19, 09-21) with the existing `--from/--to` range push, so the calendar's gaps close where the source has the data.
- **Change ID:** history-gap-fill
- **PRD refs:** FR-021, FR-024
- **Unlocks:** fuller month and quarter totals in S-15 and more complete days for S-17 and S-20
- **Prerequisites:** F-03
- **Parallel with:** S-15, S-17
- **Blockers:** —
- **Unknowns:**
  - Are the app's empty days (08-31, 09-13, 09-21) complete in Home Assistant? 09-19 and 09-20 have only 18 and 14 hourly rows there. — Owner: user. Block: no.
- **Risk:** homelab-2 only; no contract change, the push stays idempotent and incomplete days stay empty. A day's total is the counter at the last hour of the Warsaw day (or the `sum` delta), not a daily max, which can pick up the previous day's value just after midnight. The recorder has no backup yet (`context/changes/history-calendar/research.md`, follow-up (a) and (e)). Proposed by `history-calendar` (2026-09-30), which leaves the gaps visible rather than filling them.
- **Status:** proposed

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
- **Status:** done

### S-15: History calendar

- **Outcome:** user can move between days, months and quarters in a calendar and see each period's PV production, consumption, grid import, forecast against actual, and the recommendations from that period. The year view is S-16; grid export and PGE figures are left out (plan 2026-09-30: the inverter's export counter under-reads, and PGE figures wait on a privacy decision, see Parked).
- **Change ID:** history-calendar
- **PRD refs:** US-05, FR-021
- **Prerequisites:** S-14
- **Parallel with:** F-03, F-04, F-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The main new surface; it must stay usable on a phone and reuse S-14's period and minimum-data rule rather than invent its own. Charts (owner's decision 2026-09-30, `lab-feature-port`): the day and month charts extend the hand-rolled server-rendered SVG of the sparklines, with no chart library; the Home Assistant 30-day PV-vs-consumption and import-vs-export charts (`energy-glass.yaml:624-737` in homelab-2) are the visual reference.
- **Status:** done

### S-16: Calendar year view

- **Outcome:** user can open the calendar's year view and see the current year's aggregated PV production, consumption, grid import/export, and forecast-vs-actual totals to date; year-over-year comparison is not available until a second year of history exists (about July 2027).
- **Change ID:** calendar-year-view
- **PRD refs:** US-05, FR-021
- **Prerequisites:** S-15
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Un-parked 2026-09-28 (owner's decision): the lab's history starts on 2026-07-16, so a year view would show only part of 2026 and no year could be compared with another. That constraint is accepted, not a blocker — the partial year shows via the same "not enough data yet" pattern (FR-019) any incomplete period already uses, and the view's existence is no longer gated on a second year of history; only the year-over-year comparison itself still waits for one.
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
- **Status:** done

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
- **Risk:** The app's only create/update/delete surface and its first client write; the owner-only table approach from the dropped S-05 is reused (its patterns are recorded in `context/changes/day-notes/research.md`).
- **Status:** done

### S-18: Period summaries

- **Outcome:** user can read on the dashboard a short plain-language explanation of what today's figures mean, and in the calendar the home lab's summary of what happened on a completed day or in a completed month, next to its rating.
- **Change ID:** period-summaries
- **PRD refs:** US-01, US-05, FR-023, FR-030
- **Prerequisites:** F-04, S-15
- **Parallel with:** S-17, S-19
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Display only; like the recommendation card, the summary is shown as narrated, with its generation time and the period it covers.
- **Status:** done

### S-21: Alert rules

- **Outcome:** user can keep alert rules on a page and get a Telegram message when a rule starts to hold, still holds after its reminder interval, or stops holding.
- **Change ID:** alert-rules
- **PRD refs:** US-08, FR-032, FR-033, FR-034, FR-035, FR-036
- **Prerequisites:** S-02, S-07
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** whether a real alarm reaches the owner's Telegram in production (plan row 4.6; the forecast must reach 7 days first, about 8–9 October).
- **Risk:** The second client-written table and the first outbound call; the evaluator runs without a session through two anon-callable database functions guarded by their own token. Built before this entry existed (PRD v3.2 records it); live in production with a VPS trigger every 5 minutes. Implementation review 2026-10-06: eight fixes applied.
- **Status:** done

### F-07: Browser e2e for alert rules

- **Outcome:** (foundation) a Playwright test drives the alert-rules page (create, edit, switch off, delete, invalid and duplicate) against a local Supabase stack and runs in CI as a non-required job.
- **Change ID:** e2e-alert-rules
- **PRD refs:** — (verification; `context/foundation/test-plan.md` risk #8)
- **Unlocks:** the pattern for any later browser test (`context/foundation/test-stack.md`)
- **Prerequisites:** S-21
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Browser tests flake; no retries so a flake shows, and the CI job stays non-required until it has a track record.
- **Status:** done

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
- **Risk:** The lab already computes the forecast every 5 minutes; the slice adds a contract section and a card. Moved right after S-14 (v3.1, owner's decision 2026-09-26): late cost feedback is the first problem the PRD names, and the slice is cheap. It must follow S-14's period and plain-language rules. Parked 2026-09-27 on `bill-accuracy`: the lab figure this card would have displayed priced every imported kWh at full rate (about 509 PLN for August against the 214.66 PLN invoiced). Unparked 2026-09-28 — the credit-aware forecast is deployed and the lab output now carries `settlement` and `closed_month_check`.
- **Status:** done

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
- **Risk:** Built from imported PGE data in the lab. Scope (owner's decision 2026-09-30, `lab-feature-port`): the FR-014 count of unusual consumption by hour only; the lab's explained anomaly list is parked. **Rule changed 2026-09-30 (`grid-export-mismatch`):** hourly totals per clock hour may now leave the lab (previously only hour-of-day aggregates, never single readings or timestamps); sub-hour readings and raw PGE rows still stay in the lab (`docs/decisions.md`, 2026-09-30). That change delivers part of this slice from the inverter's hourly figures (the `hourly_history` push section): last night's grid draw and the highest and lowest hours and days of house use (the "Godziny zużycia" card). The hour-of-day profile, day/night and weekday/weekend shares and the FR-014 count are still to come.
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

| Roadmap ID | Change ID                 | Suggested issue title                                                   | Ready for `/10x-plan` | Notes                                                        |
| ---------- | ------------------------- | ----------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| F-01       | push-ingestion-endpoint   | Authenticated, idempotent push ingestion endpoint (v1 envelope)         | no                    | Done                                                         |
| F-02       | daily-history-push        | Lab pushes the last 35 days of per-day energy totals                    | no                    | Done                                                         |
| F-03       | history-backfill          | One-time backfill of the ten lab days before the first push             | yes                   | Run `/10x-plan history-backfill`; mostly homelab-2, one push |
| F-04       | lab-period-summaries      | Lab writes plain-language texts for today, days and months              | yes                   | Run `/10x-plan lab-period-summaries`; mostly homelab-2       |
| F-05       | solar-forecast-source     | Restore the Home Assistant solar forecast and push it                   | yes                   | Run `/10x-plan solar-forecast-source`; homelab-2 + HA config |
| S-01       | access-key-sign-in        | Replace email/password with access-key sign-in                          | no                    | Done                                                         |
| S-02       | live-state-with-staleness | Show pushed live state with staleness indicator                         | no                    | Done                                                         |
| S-03       | todays-recommendation     | Show today's narrated battery recommendation                            | no                    | Done                                                         |
| S-04       | seasonal-usage-insight    | Season-adjusted usage insight with 30-day fallback                      | no                    | Done                                                         |
| S-14       | data-period-transparency  | Clarity for a non-expert: plain words, colours, data period, no guesses | yes                   | Run `/10x-plan data-period-transparency`                     |
| S-15       | history-calendar          | Calendar with day and month views of production and advice              | no                    | Needs S-14                                                   |
| S-17       | period-ratings            | Good / neutral / bad ratings for days and months                        | no                    | Needs S-15                                                   |
| S-20       | consumption-trends        | Remarks when consumption rises or falls over weeks and months           | no                    | Needs S-14, S-15                                             |
| S-19       | day-notes                 | Notes on calendar days (create, view, edit, delete)                     | no                    | In progress; planned in `context/changes/day-notes/`         |
| S-18       | period-summaries          | Show today's plain explanation and the day/month summaries              | no                    | Needs F-04, S-15                                             |
| S-11       | forecast-accuracy         | Show forecast accuracy and today's forecast certainty                   | no                    | Needs F-05 and ~1–2 weeks of forecasts, S-14                 |
| S-07       | bill-forecast             | Show the projected cost of the current month                            | yes                   | Right after S-14                                             |
| S-08       | closed-period-bill        | Show the closed-period cost under the full tariff                       | no                    | Blocked: full G11 tariff not deployed on the lab             |
| S-09       | consumption-plan-actions  | Show consumption-plan manual actions next to the advice                 | yes                   | Stretch, after the v3 work                                   |
| S-10       | usage-profile             | Show the usage profile (day, week, unusual hours)                       | yes                   | After the v3 work                                            |
| S-12       | inverter-schedule-view    | Show the inverter's current schedule (read-only)                        | yes                   | Stretch, after the v3 work                                   |
| S-13       | pipeline-health           | Show why advice or live data is degraded                                | yes                   | Stretch, after the v3 work                                   |

## Open Roadmap Questions

1. **How are the push contract versions kept in step between this repo and homelab-2?** — Owner: user. Block: none. Practice since F-02: optional fields are added to the app contract first and deployed before the lab sends them. F-03, F-04 and F-05 follow the same practice.
2. **Should the daily advice also go to Telegram?** — Owner: user. Block: none. Raised 2026-09-25; lab-side and not in the PRD, so it would be a homelab-2 change or a PRD update, not an M-1 slice.
3. **Does all of M-1 fit before the 2026-11-04 deadline?** — Owner: user. Block: none. v3.1 (2026-09-26) sets the line: S-07 moved up; US-07 (S-09, S-12, S-13) is stretch; S-10 is last. Revisit after S-15.
4. **How should the cards give numbers a sense of scale?** — Owner: user. Block: none. Raised 2026-09-26 after S-14: the term explanations say what kWh means but not whether a figure is a lot. The owner wants to know how much a kWh is in everyday terms, what is a good or bad value, and how much a typical household uses per day or month. Decide whether this belongs in S-07 (cost), S-17 (ratings) or a slice of its own, and where the typical-household figure comes from. _Partly answered 2026-09-26 by `usage-norm-scale` (archived): the usage card shows low / normal / high / very high kWh ranges from the home's own median and a typical ~140 m² heat-pump house for the month (estimate, sources in `docs/logic.md`). Still open: how much a kWh is in everyday terms, and the cost and rating cards (S-07, S-17)._
5. **What is wrong with the inverter's grid reading?** — Owner: user. Block: none. Raised 2026-09-28 from `bill-accuracy` as "why does PGE record export the inverter doesn't see"; answered in part by the `grid-export-mismatch` frame (2026-09-30, `context/changes/grid-export-mismatch/frame.md`), checked against the owner's August eBOK hourly CSV and the lab's 5-minute history. PGE settles on **hourly-balanced** values: summing each hour's net reproduces the invoice's 423 kWh import and 342 kWh export, so those are not raw meter registers (549.7 / 467.7). Night export is real (all 31 August nights). The phase-imbalance candidate is ruled out: net energy disagrees (PGE 82 kWh, inverter 339 kWh net import for August), which no balancing explains. What remains: the inverter's grid reading over-reports net import by a load-dependent 0.1–0.8 kWh an hour (about 265 kWh in August), coming close to PGE only at night (11.8% above PGE over 26–31 August, 22:00–06:00); 1–3 August behave differently. Follow-up: an on-site check of the grid CT placement and polarity on each phase, and collecting `gridpowerl1/l2/l3` in the lab. Until then daytime and monthly grid figures from the inverter are wrong, and the bill forecast keeps estimating the in-month credit. _Update 2026-09-30 (`inverter-grid-correction`): an hourly comparison of PGE's meter data with the inverter (16 July – 31 August, aggregates only) shows the grid sensor wrong for the whole history, not only in August. Its hourly net fits about −0.53 × PGE's net − 0.70 kWh before the change and +0.53 × PGE's net + 0.70 kWh after it: the sign flipped on 3/4 August (which is why 1–3 August behaved differently), so July's import was under-read (151 against ~350 kWh). House use is derived from the same sensor. The owner chose option A: one caveat for the whole history in the app, 3–17 August left unrated in the ratings, nothing corrected numerically (`docs/decisions.md`, 2026-09-30). The installer's on-site check of the sensor's placement and phase mapping (option D) runs in parallel outside the app and is what closes this question. Showing PGE figures for closed days (option C) is parked as its own item below; history before the physical fix stays with the caveat until that change._
6. **Should the usage card show estimated ranges when own data is short?** — Owner: user. Block: none. Raised 2026-09-26 in the `usage-norm-scale` review: the owner wants the typical ~140 m² heat-pump house ranges for the month, clearly marked as an estimate, instead of "za mało danych" when fewer than 7 own days exist. This changes FR-019 ("no guessing from too little data") for the usage card, so it needs a PRD/decisions update and its own change (`/10x-new` → plan → plan review → implement). Open: does the badge stay grey while the estimated ranges show? Source: `context/archive/2026-09-26-usage-norm-scale/follow-ups/review-fixes.md` item 1.
7. **Who fixes the inconsistent early rows (2026-07-26 to 2026-08-03)?** — Owner: user. Block: none now; blocks a correct seasonal baseline from about July 2027. In `daily_energy` those days break the energy balance (e.g. export larger than PV plus import) and read 9–25 kWh against about 36 afterwards. Lab-side: correct or exclude them in homelab-2 and re-push; the app's median already limits their effect on the 30-day norm. Source: same file, item 2. _Note 2026-09-30 (S-17 `period-ratings`): the day and month ratings skip any day whose grid import exceeds its use (07-27, 07-28, 07-30, 08-02 and 08-03 in production): it reads "dane niespójne", is not rated and never enters a rating norm. The lab-side fix is still open._ _Note 2026-09-30 (`inverter-grid-correction`): the imbalance of these rows is plausibly the same grid-sensor fault as question 5 (import under-read until 3 August, and house use derived from the same sensor), not verified; 08-03 is now unrated as the sensor-change day._
8. **How does the recent norm handle the autumn heating ramp?** — Owner: user. Block: S-17 planning (its plan must already check that a seasonal trend does not paint every day red). When heating starts, the trailing 30-day median trails the season and ordinary days may read "powyżej normy". Candidate fix: adjust own days by a heating degree-day or seasonal index before taking the median. Decide in the S-17 plan whether the usage insight gets the same fix. Source: same file, item 3. _Answered for the ratings 2026-09-30 (S-17 `period-ratings`): ratings compare a day with the median of the 14 days before it (at least 7), which follows the season twice as fast as 30 days, and rate by an absolute ±10-point gap in self-sufficiency. Still open for the usage card, which keeps its trailing 30-day norm._

## Parked

- **Recommendation feedback: S-05 `record-feedback` and S-06 `edit-delete-feedback`** — Why parked: dropped by the owner on 2026-09-26 (PRD v3 removed US-02 and FR-007–FR-010); the system rates days and months instead (S-17), and notes on days (S-19) are the CRUD surface. The `feat/record-feedback` branch no longer exists; the patterns worth reusing from S-05's phase 1 are recorded in `context/changes/day-notes/research.md`, and its commits `f94d796` and `d651733` are reachable only through the reflog.
- **Custom weather-forecast modelling** — Why parked: PRD Non-Goals; the lab's existing forecast source is consumed (F-05 restores it).
- **Multi-user / multi-household support** — Why parked: PRD Non-Goals; single-tenant by design.
- **PGE bill reconciliation (predicted vs actual) and the PGE vs Deye cross-check** — Why parked: PRD Non-Goals; the projection and closed-period cost (S-07, S-08) are in scope, the comparison is not.
- **PGE CSV upload in the app** — Why parked: PRD Non-Goals; raw bill exports stay in the lab.
- **Dynamic buy/sell prices and PGE payment due date** — Why parked: considered from the lab review on 2026-09-25 but not taken into the PRD.
- **Any device control (time-of-use changes, grid charging, Solar Accelerator strategy)** — Why parked: PRD guardrail; the app never writes to the inverter or Home Assistant.
- **Live LLM generation on page view** — Why parked: PRD Non-Goals; the recommendation and the period summaries are pre-computed by the lab.
- **Advice from ratings or summaries** — Why parked: PRD v3 Non-Goals; ratings and summaries describe what happened and never suggest changes.
- **Pre-issued reusable access link** — Why parked: a link that works on every visit is a password in a URL; the magic link plus a long session covers the single owner.
- **Meter-grade live data over wM-Bus** — Why parked: owner's decision 2026-09-27, future development. The PGE smart meter's wM-Bus/HAN interface would give live import and export straight from the billing meter (read with `wmbusmeters` or ESPHome + an 868 MHz receiver), replacing the inverter as the export source. Needs the meter model checked, a request to PGE Dystrybucja to enable it and issue the key, and a receiver near the meter. MojeIRE (CSIRE) 15-minute data is the official alternative once its consumer API is published. Details: `context/changes/bill-accuracy/change.md`.
- **On-demand features over the Tailscale channel** — Why parked: infrastructure.md keeps Tailscale off the v1 critical path.
- **Per-day battery charge/discharge totals, battery history charts and the daily energy-balance check** — Why parked: owner's decision 2026-09-30 (`lab-feature-port`, candidates 17–18): wanted, but after M-1. The lab computes battery totals for today only (`collect-ha-snapshot.py:347-354` in homelab-2) and does not send them per day; reviving it is a foundation item across both repos (lab emits `battery_charged_kwh` / `battery_discharged_kwh` in `daily_history`, contract field, `daily_energy` migration), after which the Home Assistant battery chart (`energy-glass.yaml:740-792`) and balance check (`:838-894`) become presentation work.
- **Explained PGE hourly anomaly list** — Why parked: owner's decision 2026-09-30 (`lab-feature-port`, candidate 12): S-10 ships the FR-014 count only, after M-1 for the rest. The lab's list (`pge_anomalies.py:103-139`: hour, kWh against typical, Polish explanation, severity) names single timestamped hours, so reviving it also means revisiting S-10's aggregates-only rule.
- **One-sentence summary of the current flow** — Why parked: owner's decision 2026-09-30 (`lab-feature-port`, candidate 2): no new scope in M-1. The live card already rates each node and shows "Bilans systemu"; the Home Assistant narrative card (`energy-glass.yaml:224-314`) is the reference.
- **Battery-plan proposal with confirm/skip** — Why parked: owner's decision 2026-09-30 (`lab-feature-port`, candidate 23): a confirm button reads as control even when advisory, so it stays next to the device-control guardrail above.
- **PGE monthly import/export in the history calendar** — Why parked: `history-calendar` plan (2026-09-30), restated by `inverter-grid-correction` (2026-09-30). For closed months PGE's hourly-balanced figures are the only trustworthy grid import and export, because the inverter's grid sensor is wrong for the whole history (and its export reads 0 from about mid-August), but showing PGE aggregates in the app needs the owner's privacy decision first; the August CSV is also not in the lab yet (`context/changes/history-calendar/research.md`, follow-up (b)). The change that would lift it is option C of `inverter-grid-correction`: a lab aggregation and push, a contract section and a migration, replacing the whole-history caveat with PGE figures for closed days.
- **Visible local micro-analysis feed** — Why parked: owner's decision 2026-09-30 (`lab-feature-port`, candidate 16): the local model's observations stay input to the stronger model's explanations (FR-030) and are not shown raw to the owner.

## Milestone History

## Done

- **F-01: (foundation) the app accepts a versioned, bearer-token-authenticated, idempotent push from the home lab and stores it without a service-role key; payload sections for state, recommendation and history are added by the slices that first consume them.** — Archived 2026-09-23 → `context/archive/2026-09-23-push-ingestion-endpoint/`. Lesson: —.
- **S-02: user can see current PV/battery/grid state pushed by the home lab, and last-known data with a visible staleness indicator when pushes stop.** — Archived 2026-09-25 → `context/archive/2026-09-25-live-state-with-staleness/`. Lesson: —.
- **F-02: (foundation) the home lab derives per-day totals (PV, load, grid import/export, and the day's PV forecast) and sends the last 35 days in every push; the app stores them per day.** — Archived 2026-09-25 → `context/archive/2026-09-25-daily-history-push/`. Lesson: —.
- **S-04: user can see whether recent usage/generation is normal, above or below a season-adjusted baseline, with a visible notice when the flat 30-day fallback is used.** — Archived 2026-09-25 → `context/archive/2026-09-25-seasonal-usage-insight/`. Lesson: —.
- **S-01: user can open the app from an access-key link and land in an authenticated session that sees only their own data.** — Archived 2026-09-26 → `context/archive/2026-09-23-access-key-sign-in/`. Lesson: —.
- **S-03: user can see today's plain-language battery recommendation narrated by the home lab from its facts bundle (the verified numbers the deterministic engine computed), with forecast confidence stated explicitly and no controls to apply it.** — Archived 2026-09-26 → `context/archive/2026-09-23-todays-recommendation/`. Lesson: —.
- **F-05: (foundation) Home Assistant has a working solar forecast integration again, and the lab fills the daily PV forecast and the recommendation's forecast in every push.** — Archived 2026-09-26 → `context/archive/2026-09-26-solar-forecast-source/`. Lesson: —.
- **S-14: user can read every existing card without energy knowledge: plain words with technical terms explained where they appear, a colour plus text label for good / worth watching / problem / not enough data, the period and number of days behind each figure, and "not enough data yet" instead of a verdict or prediction when there is too little data.** — Archived 2026-09-26 → `context/archive/2026-09-26-data-period-transparency/`. Lesson: —.
- **S-07: user can see the projected cost of the current month in PLN, with a range and the number of days it is based on.** — Archived 2026-09-29 → `context/archive/2026-09-27-bill-forecast/`. Lesson: —.
- **F-03: (foundation) the home lab sends the days it recorded before the first push (2026-07-16 to 2026-07-25) once, so the app holds every day the lab has, not only those since 2026-07-26.** — Archived 2026-09-30 → `context/archive/2026-09-30-history-backfill/`. Lesson: —.
- **S-15: user can move between days, months and quarters in a calendar and see each period's PV production, consumption, grid import, forecast against actual, and the recommendations from that period. The year view is S-16; grid export and PGE figures are left out (plan 2026-09-30: the inverter's export counter under-reads, and PGE figures wait on a privacy decision, see Parked).** — Archived 2026-09-30 → `context/archive/2026-09-30-history-calendar/`. Lesson: —.
- **S-17: user can see a good / neutral / bad rating for each completed day and month in the calendar, based on self-sufficiency against a norm (the season-adjusted one when a year of history exists, otherwise the recent trailing one, said plainly on the card), with the basis stated and no advice.** — Archived 2026-09-30 → `context/archive/2026-09-30-period-ratings/`. Lesson: —.
- **S-19: user can add a note to a calendar day, see it on that day and see which days in a month have notes, and edit or delete it.** — Archived 2026-10-01 → `context/archive/2026-10-01-day-notes/`. Lesson: —.
- **S-18: user can read on the dashboard a short plain-language explanation of what today's figures mean, and in the calendar the home lab's summary of what happened on a completed day or in a completed month, next to its rating.** — Archived 2026-10-01 → `context/archive/2026-10-01-period-summaries/`. Lesson: —.
- **F-07: (foundation) a Playwright test drives the alert-rules page (create, edit, switch off, delete, invalid and duplicate) against a local Supabase stack and runs in CI as a non-required job.** — Archived 2026-10-07 → `context/archive/2026-10-06-e2e-alert-rules/`. Lesson: —.
- **S-21: user can keep alert rules on a page and get a Telegram message when a rule starts to hold, still holds after its reminder interval, or stops holding.** — Archived 2026-10-07 → `context/archive/2026-10-06-alert-rules/`. Lesson: —.
- **F-04: (foundation) the home lab has its stronger model (the existing narration chain) interpret the local model's frequent observations into plain-language texts for someone without energy knowledge: a short explanation of what today's figures mean, and after each completed day and month a summary of what happened that takes Polish seasons into account, points out consumption patterns and gives no advice; it pushes them and the app stores them per period.** — Archived 2026-10-07 → `context/archive/2026-10-01-lab-period-summaries/`. Lesson: —.
