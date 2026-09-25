# Live State with Staleness — Plan Brief

> Full plan: `context/changes/live-state-with-staleness/plan.md`

## What & Why

Show the home's current PV, load, grid and battery numbers from the newest home-lab push at the top of the dashboard, clearly marked when they're out of date. This is roadmap slice S-02 (FR-002, FR-004). Together with S-03 it makes the main view answer "what is happening now, and what should I do today?".

## Starting Point

Every push already carries the live state, but it sits inside the raw `ingest_pushes.payload` with no client access. S-03 built the owner allowlist, a tested view-model pattern and the dashboard card layout, so this slice reuses all three.

## Desired End State

A Polish "Stan na żywo" card above the recommendation shows:
- PV, home load, grid (buying from or selling to the grid), battery (charging or discharging), state of charge
- today's kWh, and the reading time

It warns "Dane nieaktualne" after 15 minutes without a new snapshot, notes degraded Home Assistant data, has an empty state, and the page reloads itself every 5 minutes while open.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Stale after | Newest snapshot more than 15 min old (3 missed pushes) | Flags real outages quickly without alarming on one slow refresh. |
| Refresh | Full-page reload every 5 min while visible | Matches the push cadence with a tiny script; no API route or client state. |
| Degraded snapshots | Mild notice, values kept, missing ones "—" | Partial data is honest and still useful; it isn't the same problem as stale data. |
| Data access | `security_invoker` view over `ingest_pushes` + owner RLS + column grants | Reuses the S-03 owner check; token and hash columns stay unreadable. |
| Staleness signal | Age of the newest `captured_at` | When Home Assistant is down, the lab re-sends the old snapshot, so the time stops advancing. |
| Layout | Live state above the recommendation | You read "what's happening" before "what to do". |

## Scope

**In scope:** migration (view, owner policy, column grants); `live-state.ts` view model with tests; `LiveStateCard.astro`; the dashboard reload script; smoke steps; production migration and deploy.

**Out of scope:** history or charts (S-04), live partial updates, notifications, and changes to the push contract or home lab.

## Architecture / Approach

```text
lab push (every 5 min) ──► ingest_pushes.payload.state
                                 │  live_state view (security_invoker, owners only, newest row)
owner ──► /dashboard ──► loadLiveState ──► toLiveStateView(row, now) ──► LiveStateCard
                         (reloads every 5 min while visible)            fresh / stale / degraded / empty
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data access and view model | View + owner policy + column grants; tested display rules | A view without `security_invoker` would bypass RLS |
| 2. Dashboard card and auto-reload | Polish card above the recommendation; 5-min reload; smoke | The reload closes an open "Na podstawie" section (acceptable) |
| 3. Production rollout | Migration applied, version aligned, deployed | Empty until the home-lab push is live |

**Prerequisites:** S-03 deployed (done); local Supabase via the UGREEN relay; Supabase connector for production.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Production shows empty states until the homelab-2 push is applied (homelab-2 PR #16).
- The lab re-sends an old snapshot when Home Assistant is down (as its refresh script does today); a lab change to that behaviour would need a new staleness signal.

## Success Criteria (Summary)

- The owner sees current numbers with the reading time, and a clear warning when they're older than 15 minutes.
- Non-owners and anonymous clients can't read the state.
- CI proves a pushed state appears on the dashboard.
