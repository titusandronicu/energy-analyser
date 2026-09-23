---
project: "Energy Analyser"
context_type: greenfield
created: 2026-09-14
updated: 2026-09-14
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "project scope / repo topology"
      decision: "Standalone new app in its own repo/directory (/Users/kamilnowosad/Desktop/energy-analyser), not an in-place extension of homelab-2's apps/solar-energy-analyser module. Integrates with an existing Home Assistant instance as an external live data source. Intended to be a public repo for portfolio purposes; must not carry over homelab-2 secrets or other private module code."
    - topic: "pain category"
      decision: "Missing feature (no forecast-driven battery strategy) + data trapped (PGE billing arrives ~1 month delayed) + decision paralysis (no clear rule for battery settings even with data in hand)."
    - topic: "insight"
      decision: "Combines exact PGE tariff/billing history, seasonal PV generation pattern specific to this location, and Deye inverter/battery behavior specifics (reserve, Grid Charge, Time-of-Use) — a generic solar-monitoring app has none of these three."
    - topic: "persona scope"
      decision: "Single named user — the participant themselves, sole operator of the home PV + battery + grid system. No multi-user scope planned."
    - topic: "access control"
      decision: "Access key (token/link), not full login and not N/A — trivial to implement, but gives the app a real access-control mechanism for course/portfolio purposes."
    - topic: "MVP scope"
      decision: "Scoped down from a full historic-DB + AI-learning + weather-forecast + bill-reconciliation flow to: reuse existing historic DB and ported deterministic advisory logic, wire live HA telemetry, produce one insight vs. historical baseline, add an LLM narrative pass for a plain-language battery recommendation including weather-forecast input (kept in v1 as the accepted secondary). Bill reconciliation deferred to v2."
    - topic: "post-PRD review corrections"
      decision: "Four gaps found reviewing prd.md v1: (1) FR-003 cold-start when same-season data missing — resolved with flat-30-day fallback + visible disclaimer; (2) historic dataset had no defined freshness — resolved as a daily-minimum-refresh NFR, exact pipeline mechanism (push vs. cron) forwarded to tech-stack step; (3) secrets guardrail sharpened to name the three integrations needing credentials (LLM, weather, HA) — env-var injection mechanism forwarded to tech-stack step; (4) LLM latency vs. the 2s-feedback NFR contradicted US-01 — resolved by pre-computing the recommendation at least daily instead of synchronously on page load; refresh cadence confirmed as 'at least once daily' for both the historical dataset and the recommendation."
    - topic: "certification-criteria gap check"
      decision: "Checked shaped MVP against updated 10xBuilder criteria pasted by the user. Two gaps found: (1) access control was a bare page-gate token, not tied to a 'logged-in user' — reframed as a magic-link login that establishes a session; (2) MVP had zero create/update/delete capability (pure read-only insight/recommendation views) — added FR-007–010, a CRUD surface on recommendation feedback (accept/dismiss + note, editable/deletable), chosen by the user over threshold-CRUD and manual-bill-CRUD alternatives. Business Logic, contextual docs, and (deferred) tests were already on track; no changes needed there."
    - topic: "existing home-lab system and integration (2026-09-23)"
      decision: "The homelab-2 energy stack is a running system, not prior art: live HA + Deye, PGE import and bill math, 5-minute refresh, SQLite history, LLM narration (HA conversation -> Ollama -> OpenRouter). Integration model: the home lab pushes public-safe snapshots, history aggregates, the facts bundle and the narrated recommendation outbound to this app on the VPS; no v1 feature depends on connecting into the home network (Tailscale via Micr.us is kept as an optional private channel for flexibility). This app owns access control, feedback CRUD and the season-adjusted baseline/anomaly logic. context_type stays greenfield (new code; the home lab is an external data source). See existing-system.md."
  frs_drafted: 10
  quality_check_status: accepted
---

## Vision & Problem Statement

The sole operator of a home PV + battery + grid system gets no timely feedback on energy cost — PGE bills post roughly a month after the usage they cover — and has no forecast-informed guidance for battery settings, so charge/reserve decisions are made reactively, without knowing what weather or season is coming. The gap isn't visibility of raw data (Home Assistant already exposes live PV/battery/grid telemetry) — it's the absence of a rule that turns that data, plus PGE's real tariff structure and seasonal generation patterns, into a decision: what should the battery do today, and was yesterday's usage normal or a waste of money.

Generic solar-monitoring apps don't have this owner's exact PGE tariff and billing history, the seasonal PV generation pattern specific to this location, or the Deye inverter's own behavior quirks (reserve, Grid Charge, Time-of-Use) — combining those three is what makes a forecast-driven recommendation possible instead of a generic one.

## User & Persona

Primary persona: the homeowner (you) — sole operator of a home solar PV + battery + grid system (Deye inverter, PGE G11 tariff, Home Assistant as the live telemetry hub). Reaches for this product:
- mid-next-month, when the PGE bill arrives and they want to understand or verify the cost against what actually happened, and
- day-to-day / seasonally, when deciding how to configure battery reserve/charge behavior ahead of expected weather or a season change.

No secondary persona — single-user by design.

*Scale insight (100x check): at real multi-household scale, the access-key model wouldn't hold — it would need proper account security and credential storage. Confirms single-user + access-key is a deliberate MVP choice, not an oversight; multi-tenant auth is out of scope (see Non-Goals).*

## Access Control

Access key (magic link) — no account-creation form, no roles, but opening the link **establishes an authenticated session**: the user is logged in for that session and sees only their own resources (current state, insight, recommendations, feedback history). This is a real login mechanism, not just an anonymous page gate — it satisfies "access tied to a logged-in user" without the overhead of a username/password flow. Single user by design.
> Correction (post-PRD review): reframed from a bare page-gate token to an explicit session-establishing login, to unambiguously meet the "logged-in user sees their own resources" access-control requirement.

## Success Criteria

### Primary
- End-to-end flow works: opening the app with the access key shows current state (live Home Assistant telemetry) plus one derived insight against the historical baseline (built from the existing database and advisory logic ported from the prior prototype), and an LLM-narrated battery-setting recommendation for today, informed by a weather forecast.

### Secondary
- The battery recommendation already incorporates a weather forecast in v1, rather than being deferred to v2.

### Guardrails
- The app never writes to Home Assistant or the inverter — recommendations are advisory-only, for human review.
- No private-network data or secrets (telemetry, bills, credentials, local network topology) leak into the public repo.
- The app degrades gracefully when Home Assistant is temporarily unreachable — shows last-known data with a clear staleness indicator instead of failing.

## Functional Requirements

### Access
- FR-001: User can access the app using an access key (token/link), without creating an account. Priority: must-have
  > Socratic: No counter-argument considered; stands as written.

### Live state & insight
- FR-002: User can view current PV/battery/grid state from Home Assistant, pushed by the home lab at least every 5 minutes (corrected 2026-09-23; originally "pulled live"), independently of whether the insight/recommendation panel is available. Priority: must-have
  > Socratic: Counter-argument considered: "live pull adds a failure-prone dependency for
  > something that isn't the differentiator." Resolution: kept, but decoupled — the live-state
  > panel and the insight/recommendation panel degrade independently; an HA hiccup doesn't take
  > down the whole app.
- FR-003: User can view a derived insight comparing recent usage/generation against a season-adjusted historical baseline (a same-season historical window, not a flat recent average). When same-season historical data is missing or insufficient, the app falls back to a flat trailing-30-day average and visibly discloses that the fallback baseline is in use, rather than silently comparing against thin data or failing. Priority: must-have
  > Socratic: Counter-argument considered: "a raw day-vs-baseline comparison can be misleading
  > without controlling for season/weather." Resolution: baseline redefined as season-adjusted
  > to reduce false anomaly flags.
  > Correction (post-PRD review): the season-adjusted baseline has a cold-start problem — if the
  > historic database lacks data from the equivalent point a year ago, there's nothing to compare
  > against. Resolution: explicit fallback to a flat 30-day average with a visible disclaimer.
- FR-004: User sees a clear staleness indicator and last-known data when Home Assistant is temporarily unreachable. Priority: must-have
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

### Recommendation feedback (CRUD)
- FR-007: User can create a feedback entry on a recommendation — accept or dismiss it, with an optional note. Priority: must-have
- FR-008: User can view their past feedback entries. Priority: must-have
- FR-009: User can edit an existing feedback entry (change accept/dismiss status or note). Priority: must-have
- FR-010: User can delete a feedback entry. Priority: must-have
  > Correction (post-PRD review): FR-007–010 added because the shaped MVP was read-only —
  > view state, view insight, view recommendation — with no create/update/delete of any
  > resource, which doesn't meet a full-CRUD requirement. Feedback on recommendations was
  > chosen as the CRUD surface because it strengthens the advisory loop rather than bolting
  > on an unrelated list.

## User Stories

### US-01: User checks today's energy insight and battery recommendation

- **Given** a user with a valid access key and existing historic energy data
- **When** they open the app
- **Then** they see current PV/battery/grid state, one derived insight against the historical baseline, and a plain-language battery-setting recommendation for today

#### Acceptance Criteria
- Insight and recommendation are visible without further clicks beyond opening the app
- The recommendation shown reflects the most recent daily refresh — it is not computed live while the user waits
- If same-season historical data is insufficient, the insight visibly discloses it is using the flat-30-day fallback baseline
- If Home Assistant is unreachable, last-known state is shown with a visible staleness indicator instead of an error page
- The recommendation is advisory text only — no controls to apply it directly to the inverter/HA

### US-02: User records feedback on a recommendation

- **Given** a user viewing today's battery recommendation
- **When** they mark it as accepted or dismissed, optionally with a note
- **Then** the feedback is saved and appears in their feedback history, and can later be edited or deleted

#### Acceptance Criteria
- Feedback entries are scoped to the single logged-in user's session/account
- Editing or deleting a feedback entry updates or removes it immediately, visible on next view
- Feedback does not automatically alter future recommendations in v1 — it's recorded for the user's own reference (see Non-Goals)

## Business Logic

Given live and historical PV/battery/grid data plus a weather forecast, the app determines whether current usage is anomalous against a season-adjusted baseline, and derives a plain-language battery-setting recommendation for today.

The rule consumes recent and historical PV generation, battery state, and grid import/export readings, the user's existing billing/tariff history, and a short-range weather forecast for the user's location. Its output is a flagged anomaly status for the current period (normal / above-baseline / below-baseline) plus one recommended battery setting for today, phrased in plain language with an explicit confidence note when the weather forecast informs it. When same-season historical data is missing or insufficient, the comparison falls back to a flat trailing-30-day average and visibly discloses that the fallback is in use. The user encounters this on opening the app: the anomaly flag and the recommendation appear together on the main view, without needing to run a report or select a date range — the decision is presented, not buried in raw numbers.

## Non-Functional Requirements

- No PV/battery/grid telemetry or billing data leaves the user's own systems, except the minimum data required for the weather-forecast lookup and the LLM narration call.
- Credentials for third-party integrations (LLM narration, weather forecast, Home Assistant access) are never committed to source control.
- The user sees continuous visible feedback (not a frozen screen) during any operation that takes longer than 2 seconds.
- The historical dataset used for the baseline and recommendation is refreshed at least once per day, so "yesterday's usage" is never based on a static, aging snapshot.
- The battery recommendation is generated ahead of the user's visit (refreshed at least once daily) rather than synchronously while the user waits, so opening the app never triggers a multi-second wait for LLM inference.

## Non-Goals

- **No custom weather-forecast modeling** — the app consumes an existing weather-forecast source rather than building forecasting logic of its own.
- **No multi-user / multi-household support** — single-tenant only for this MVP; the 100x-scale check confirmed that real multi-user support would need proper account/credential security, which is out of scope here.
- **No full PGE bill reconciliation (predicted vs. actual) in v1** — deferred to v2, per the earlier MVP scope-down decision; v1 stops at the anomaly insight and recommendation.
- **No synchronous/live LLM generation on each page view** — the recommendation is pre-computed on a daily cadence (see NFRs), not generated fresh while the user waits.
- **No automatic learning/adjustment of recommendations from feedback in v1** — feedback (FR-007–010) is recorded for the user's own reference only; it does not yet feed back into the recommendation logic.

## Quality cross-check

All checks present — no gaps. (Access Control, Business Logic, Project artifacts, Timeline-cost acknowledgment, Non-Goals.)

## Forward: tech-stack

- New standalone repo, intended public, separate from the private `homelab-2` monorepo.
- Consumes Home Assistant as an external live-data integration (read-only telemetry), not as code dependency.
- May reference PGE billing/tariff calculation logic and deterministic-advisory patterns already prototyped in `homelab-2/apps/solar-energy-analyser` as prior art — no code or secrets copied from that repo.
- **Correction (2026-09-23):** the `homelab-2` energy stack is not just prior art. It is a running system: live HA + Deye telemetry, PGE CSV import and bill math, a 5-minute refresh pipeline, multi-month SQLite history, and an advisory page whose facts bundle is narrated by HA conversation → local Ollama → OpenRouter. See [existing-system.md](existing-system.md). The "port, don't consume" decision and the OpenRouter-first LLM assumption should be re-confirmed. Open questions are listed in `prd.md`.
- Should validate cleanly without live access to the owner's QNAP/HA (fixture-based telemetry adapters recommended, mirroring the pattern already used in the prior-art module) so a reviewer can run tests from a clone.
- Historic-dataset refresh mechanism: **resolved 2026-09-23.** The home lab's existing 5-minute refresh job pushes snapshots and history aggregates to an ingestion endpoint in this app.
- Recommendation pre-compute mechanism: **resolved 2026-09-23.** The home lab narrates the facts bundle with its LLM chain and pushes the result. No scheduler or LLM call runs in this app for v1.
- Secret handling: **narrowed 2026-09-23.** The app holds only Supabase keys and one push-ingestion token (environment-injected on the VPS). HA and LLM credentials stay in the home lab.
- Streaming/token-by-token UI for the recommendation was considered as an alternative to pre-computation, but not adopted for v1 (adds transport/protocol complexity the pre-compute approach avoids). Worth revisiting only if pre-computed daily cadence proves too stale in practice.
