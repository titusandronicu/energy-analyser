# Today's Recommendation — Plan Brief

> Full plan: `context/changes/todays-recommendation/plan.md`

## What & Why

When the owner opens the app, show the latest battery recommendation narrated by the home lab: Polish text, when it was made, today's and tomorrow's forecast with its confidence stated explicitly, and a clear warning when it's stale. This is roadmap slice S-03, the north star. It's the first screen that turns pushed data into a decision.

## Starting Point

F-01 already stores each pushed recommendation in `public.recommendations`, but nobody can read it: RLS is on with no policies, and client grants are revoked. The dashboard is the starter placeholder, and `/` is the starter's English welcome page. The lab narrates about every hour, doesn't send a forecast confidence yet, and doesn't push at all yet.

## Desired End State

`/` sends the owner to `/dashboard`. That page shows the newest recommendation as a Polish card, or "Nieaktualna" when it's from before today or more than 2 hours old, or an empty state when nothing has been pushed. Only users on an owner allowlist can read the data. Real advice appears in production once the separate homelab-2 push change lands.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Which recommendation | Always the newest, with a "Nieaktualna" warning when it's from before today (Warsaw) or more than 2 h old | Keeps last-known advice visible during a lab outage, per the PRD's degrade-gracefully guardrail. |
| Read access | Owner allowlist (`app_owners`) in RLS | Data stays private even if sign-up were ever enabled, and S-02/S-04/S-05 reuse the same check. |
| Missing confidence | Show "Pewność prognozy: nieznana" | Meets FR-006's "state uncertainty explicitly" without inventing a value. |
| Lab push | Separate homelab-2 change; this plan writes its brief | Infra changes belong in the infra repo; each side is verified on its own. |
| Local/CI users | `seed.sql` trigger makes every local user an owner | Smoke-created users can read; `seed.sql` never runs in production. |
| Landing page | `/` redirects to dashboard or sign-in; starter welcome removed | The app has one purpose: open it and see the decision. |
| Rendering | Server-side, text only (no HTML), line breaks kept | No XSS surface from LLM text; no client JavaScript needed. |

## Scope

**In scope:** migration (`app_owners`, grants, owner-only select policies); local/CI seed trigger; `RecommendationRow` type and view-model service with unit tests; Polish dashboard card (fresh/stale/empty/error), advice-only note and "Na podstawie" findings; `/` redirect and removing the starter welcome; smoke test proving push → dashboard; production runbook step and the homelab-2 push brief.

**Out of scope:** homelab-2 code; confidence modelling; live state (S-02), seasonal insight (S-04), feedback (S-05/06); a history view; any control over the inverter.

## Architecture / Approach

```text
home lab ──push──► /api/ingest ──► recommendations (RLS: owners only)
                                           │ select newest by generated_at
owner ──► /dashboard ──► loadLatestRecommendation ──► toRecommendationView(row, now)
                                                         │ fresh / stale / empty
                                                         ▼
                                              Polish card (server-rendered)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data access and view model | Owner allowlist + read policies; staleness and label rules with tests | A grant without the policy exposes data; a policy without the grant breaks reads |
| 2. Dashboard recommendation card | Polish card, `/` redirect, smoke proves push → dashboard | Smoke ordering (push before the signed-in check) |
| 3. Production rollout and lab handoff | Migration + owner row in production; homelab-2 brief | North star only proven once the lab actually pushes |

**Prerequisites:** F-01 and S-01 deployed (done); local Supabase via the UGREEN relay; production SQL access for the owner row.
**Estimated effort:** ~2 sessions across 3 phases, plus the separate homelab-2 change.

## Open Risks & Assumptions

- Production stays on the empty state until the homelab-2 push lands; the north star isn't closed until then.
- The lab's forecast confidence stays "nieznana" until the lab adds it.
- S-01's production sign-in is still parked (email templates + rate limit); the dashboard needs that sign-in to be seen in production.

## Success Criteria (Summary)

- The owner opens the app and sees the latest advice in Polish, clearly marked when stale, with forecast and confidence.
- A signed-in non-owner and anonymous clients can't read recommendations.
- CI proves a pushed recommendation appears on the dashboard.
