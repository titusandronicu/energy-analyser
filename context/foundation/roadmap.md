---
project: energy-analyser
version: 1
status: draft
created: 2026-09-23
updated: 2026-09-23
prd_version: 1
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

- **Intent:** The owner opens the app with an access key and sees near-live state, a season-aware insight and today's battery recommendation, all from data the home lab pushes, and can keep a feedback history on those recommendations.
- **Source materials:** `context/foundation/prd.md` (v1), with `context/foundation/existing-system.md` for what the home lab already provides.
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-010, US-01, US-02 (the full v1 PRD).

## Vision recap

The owner of a home PV + battery + grid system gets PGE cost feedback a month late and makes battery reserve/charge decisions without knowing what weather or season is coming. The home lab already collects the telemetry, bills and a narrated advisory. This app puts access control, a season-adjusted anomaly insight, feedback history and a maintained codebase on top of that data, so each day's decision is presented instead of buried in raw numbers.

## North star

**S-03: User can see today's battery recommendation** — the north star is the smallest end-to-end flow whose success proves the product works, so it is placed as early as its prerequisites allow. Here it proves the whole chain: the home lab pushes, the app stores the data and the owner reads today's advice. With speed as the goal, this is the link most worth proving first.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                    | Prerequisites | PRD refs                     | Status   |
| ---- | ------------------------- | ----------------------------------------------------------------------- | ------------- | ---------------------------- | -------- |
| F-01 | push-ingestion-endpoint   | (foundation) the home lab can push an authenticated, versioned payload  | —             | NFR (secrets, raw data)      | done     |
| S-01 | access-key-sign-in        | open the app from an access-key link and land in their own session      | —             | FR-001                       | in-progress |
| S-02 | live-state-with-staleness | see current PV/battery/grid state, marked stale when pushes stop        | F-01, S-01    | US-01, FR-002, FR-004        | proposed |
| S-03 | todays-recommendation     | see today's narrated battery recommendation with forecast confidence    | F-01, S-01    | US-01, FR-005, FR-006        | proposed |
| S-04 | seasonal-usage-insight    | see whether recent usage is normal against a season-adjusted baseline   | F-01, S-01    | US-01, FR-003                | proposed |
| S-05 | record-feedback           | accept or dismiss today's recommendation with a note and see history    | S-03          | US-02, FR-007, FR-008        | proposed |
| S-06 | edit-delete-feedback      | edit or delete a past feedback entry                                    | S-05          | US-02, FR-009, FR-010        | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                               | Note                                                                  |
| ------ | ------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| A      | Advice loop        | `F-01` → `S-03` → `S-05` → `S-06`   | The shortest path to the north star, then the CRUD surface on top of it. |
| B      | Access             | `S-01`                              | No prerequisites; run it in parallel with F-01. Every page-facing slice needs it. |
| C      | State and insight  | `S-02` → `S-04`                     | Joins Stream A at `F-01`; can run alongside S-03 once F-01 and S-01 land. |

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
- **Status:** proposed

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
- **Status:** proposed

### S-04: Seasonal usage insight

- **Outcome:** user can see whether recent usage/generation is normal, above or below a season-adjusted baseline, with a visible notice when the flat 30-day fallback is used.
- **Change ID:** seasonal-usage-insight
- **PRD refs:** US-01, FR-003
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02, S-03, S-05, S-06
- **Blockers:** —
- **Unknowns:** — (proposed 2026-09-23, confirm in the plan: "same season" = ±14 days around the same day of year in earlier years; sufficient = at least 20 days with data in that window, else the trailing 30-day fallback)
- **Risk:** The only domain logic computed in this app; history starts mid-2026, so the fallback path is the one that runs first and must be tested.
- **Status:** proposed

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

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                        | Ready for `/10x-plan` | Notes |
| ---------- | ------------------------- | ------------------------------------------------------------ | --------------------- | ----- |
| F-01       | push-ingestion-endpoint   | Authenticated, idempotent push ingestion endpoint (v1 envelope) | yes                | Run `/10x-plan push-ingestion-endpoint` |
| S-01       | access-key-sign-in        | Replace email/password with access-key sign-in               | yes                   | Run `/10x-plan access-key-sign-in` |
| S-02       | live-state-with-staleness | Show pushed live state with staleness indicator              | no                    | Needs F-01, S-01 |
| S-03       | todays-recommendation     | Show today's narrated battery recommendation                 | no                    | Needs F-01, S-01; north star |
| S-04       | seasonal-usage-insight    | Season-adjusted usage insight with 30-day fallback           | no                    | Needs F-01, S-01 |
| S-05       | record-feedback           | Accept/dismiss feedback on a recommendation + history        | no                    | Needs S-03 |
| S-06       | edit-delete-feedback      | Edit and delete feedback entries                             | no                    | Needs S-05 |

## Open Roadmap Questions

1. **How are the push contract versions kept in step between this repo and homelab-2?** — Owner: user. Block: none (settle in F-01's plan).

## Parked

- **Custom weather-forecast modelling** — Why parked: PRD Non-Goals; the lab's existing forecast source is consumed.
- **Multi-user / multi-household support** — Why parked: PRD Non-Goals; single-tenant by design.
- **PGE bill reconciliation (predicted vs actual)** — Why parked: PRD Non-Goals (v2); the lab already has most of it.
- **Live LLM generation on page view** — Why parked: PRD Non-Goals; the recommendation is pre-computed.
- **Feedback-driven recommendation learning** — Why parked: PRD Non-Goals (v1 feedback is reference-only).
- **Pre-issued reusable access link** — Why parked: a link that works on every visit is a password in a URL, and minting one without the forbidden service-role key needs its own token store; the magic link plus a long session covers the single owner for v1.
- **On-demand features over the Tailscale channel** — Why parked: infrastructure.md keeps Tailscale off the v1 critical path.

## Milestone History

## Done

- **F-01: (foundation) the app accepts a versioned, bearer-token-authenticated, idempotent push from the home lab and stores it without a service-role key; payload sections for state, recommendation and history are added by the slices that first consume them.** — Archived 2026-09-23 → `context/archive/2026-09-23-push-ingestion-endpoint/`. Lesson: —.
