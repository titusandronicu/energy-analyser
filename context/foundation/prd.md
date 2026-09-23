---
project: "Energy Analyser"
version: 1
status: draft
created: 2026-09-14
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

**Not a blank slate.** The app's code is new, but its data plane already runs in the owner's home lab: live Home Assistant with the Deye inverter integrated, PGE bill import and tariff math, and a lab Solar Energy Analyser page whose deterministic facts bundle is narrated by an LLM provider chain (HA conversation → local Ollama → OpenRouter). This product adds access control, feedback CRUD, tests and a maintained codebase on top of that system instead of recreating it. See [existing-system.md](existing-system.md).

## User & Persona

Primary persona: the homeowner (you) — sole operator of a home solar PV + battery + grid system (Deye inverter, PGE G11 tariff, Home Assistant as the live telemetry hub). Reaches for this product:
- mid-next-month, when the PGE bill arrives and they want to understand or verify the cost against what actually happened, and
- day-to-day / seasonally, when deciding how to configure battery reserve/charge behavior ahead of expected weather or a season change.

No secondary persona — single-user by design.

Scale insight (100x check): at real multi-household scale, the access-key model wouldn't hold — it would need proper account security and credential storage. This confirms single-user + access-key is a deliberate MVP choice, not an oversight; multi-tenant support is explicitly out of scope (see Non-Goals).

## Success Criteria

### Primary
- End-to-end flow works: opening the app with the access key shows current state (live Home Assistant telemetry) plus one derived insight against the historical baseline (built from the existing database and advisory logic ported from the prior prototype), and an LLM-narrated battery-setting recommendation for today, informed by a weather forecast.

### Secondary
- The battery recommendation already incorporates a weather forecast in v1, rather than being deferred to v2.

### Guardrails
- The app never writes to Home Assistant or the inverter — recommendations are advisory-only, for human review.
- No private-network data or secrets (telemetry, bills, credentials, local network topology) leak into the public repo.
- The app degrades gracefully when Home Assistant is temporarily unreachable — shows last-known data with a clear staleness indicator instead of failing.

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

## Functional Requirements

### Access
- FR-001: User can access the app using an access key (token/link), without creating an account. Priority: must-have
  > Socratic: No counter-argument considered; stands as written.

### Live state & insight
- FR-002: User can view current PV/battery/grid state pulled live from Home Assistant, independently of whether the insight/recommendation panel is available. Priority: must-have
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

## Non-Functional Requirements

- No PV/battery/grid telemetry or billing data leaves the user's own systems, except the minimum data required for the weather-forecast lookup and the LLM narration call.
- Credentials for third-party integrations (LLM narration, weather forecast, Home Assistant access) are never committed to source control.
- The user sees continuous visible feedback (not a frozen screen) during any operation that takes longer than 2 seconds.
- The historical dataset used for the baseline and recommendation is refreshed at least once per day, so "yesterday's usage" is never based on a static, aging snapshot.
- The battery recommendation is generated ahead of the user's visit (refreshed at least once daily) rather than synchronously while the user waits, so opening the app never triggers a multi-second wait for LLM inference.

## Business Logic

Given live and historical PV/battery/grid data plus a weather forecast, the app determines whether current usage is anomalous against a season-adjusted baseline, and derives a plain-language battery-setting recommendation for today.

The rule consumes recent and historical PV generation, battery state, and grid import/export readings, the user's existing billing/tariff history, and a short-range weather forecast for the user's location. Its output is a flagged anomaly status for the current period (normal / above-baseline / below-baseline) plus one recommended battery setting for today, phrased in plain language with an explicit confidence note when the weather forecast informs it. When same-season historical data is missing or insufficient, the comparison falls back to a flat trailing-30-day average and visibly discloses that the fallback is in use. The user encounters this on opening the app: the anomaly flag and the recommendation appear together on the main view, without needing to run a report or select a date range — the decision is presented, not buried in raw numbers.

## Access Control

Access key (magic link) — no account-creation form, no roles, but opening the link **establishes an authenticated session**: the user is logged in for that session and sees only their own resources (current state, insight, recommendations, feedback history). This is a real login mechanism, not just an anonymous page gate — it satisfies "access tied to a logged-in user" without the overhead of a username/password flow. Single user by design.

## Non-Goals

- **No custom weather-forecast modeling** — the app consumes an existing weather-forecast source rather than building forecasting logic of its own.
- **No multi-user / multi-household support** — single-tenant only for this MVP; the 100x-scale check confirmed that real multi-user support would need proper account/credential security, which is out of scope here.
- **No full PGE bill reconciliation (predicted vs. actual) in v1** — deferred to v2, per the earlier MVP scope-down decision; v1 stops at the anomaly insight and recommendation.
- **No synchronous/live LLM generation on each page view** — the recommendation is pre-computed on a daily cadence (see Non-Functional Requirements), not generated fresh while the user waits.
- **No automatic learning/adjustment of recommendations from feedback in v1** — feedback (FR-007–010) is recorded for the user's own reference only; it does not yet feed back into the recommendation logic.

## Open Questions

Raised 2026-09-23 after reviewing this PRD against the running home-lab system ([existing-system.md](existing-system.md)):

1. **Consume or port?** Should the app read the existing facts bundle and history (as a client of the lab analyser), or port the deterministic rules into this repo? "Port, no code copied" was decided when the lab system was treated as a prototype. It's now a running system, so the decision needs to be re-confirmed.
2. **Which LLM path is primary?** The PRD and infrastructure plan assume OpenRouter with an optional local model. The running system uses HA conversation → local Ollama → OpenRouter (opt-in). Which order does FR-005 follow?
3. **Where does the app run relative to the data?** Home Assistant, the history store and Ollama are LAN-only and have no production remote-access path. That conflicts with a public VPS that reads them live (FR-002).
4. **Is bill reconciliation still a v2 non-goal?** PGE import, PGE vs Deye cross-check and a current-month bill forecast already exist. Surfacing them may be cheaper than deferring.
5. **Should `context_type` become `brownfield`?** The app code is greenfield, but the data plane and business logic are an existing system. Switching means re-running `/10x-shape`, which regenerates this PRD in the 11-section brownfield template.

Original note: all required sections were resolved during the `/10x-shape` session — the closing quality cross-check reported no gaps (Access Control, Business Logic, Project artifacts, Timeline-cost acknowledgment, Non-Goals all present). A post-generation review surfaced four refinements (cold-start fallback, data-freshness NFR, sharpened secrets guardrail, and pre-computed recommendation timing) — all resolved at the product level and folded into the relevant sections above; the underlying implementation mechanisms (pipeline push-vs-cron, secret-injection method) are intentionally left open here and forwarded to `/10x-tech-stack-selector`.
