# Daily History Push — Plan Brief

> Full plan: `context/changes/daily-history-push/plan.md`

## What & Why

The home lab starts sending per-day energy totals and each day's PV forecast in every push, and the app stores them. This is roadmap foundation F-02 (issue #21): the seasonal insight (S-04) needs past days to compare against, and forecast accuracy (S-11) needs each day's forecast next to its actual PV.

## Starting Point

The app already accepts and stores `daily_history` (four totals per day, latest push wins), but has no forecast field. The lab keeps about 90 days of 5-minute samples with daily counters, and derives days the same way for its own bill forecast, but its push script sends no history yet.

## Desired End State

Every lab push carries the last 35 days (today as a partial day), each with PV, load, grid import, grid export and the morning PV forecast. A one-time push seeds 62 days, so production starts with about two months of history. No incomplete or unhealthy sample can overwrite a good day.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Per-day forecast | Optional `pv_forecast_kwh` added now | One contract change instead of two, and forecast history starts accumulating before S-11. |
| Forecast value | First healthy sample at or after 06:00 local | The lab re-forecasts through the day; the morning value is the fair prediction. |
| Day value | Latest healthy sample of the Warsaw day | After midnight a stale sample can repeat yesterday's larger totals, so "max" would be wrong. |
| Incomplete past days | Not sent (last healthy sample before 21:00) | A bad day must never overwrite a good one; S-04 tolerates gaps. |
| Today | Sent as partial, replaced by each push | Latest-wins storage keeps it current; S-04 excludes today itself. |
| Window | 35 days per push, one-time 62-day backfill | Covers the 30-day fallback cheaply and starts S-04 with two months. |
| Source | The lab's JSONL history, not SQLite | Already used by the lab's day logic; SQLite grows without limit under `private/`. |

## Scope

**In scope:** contract field and storage; migration and production rollout; lab derivation with tests; `--days` backfill flag; runbook update and apply on `docker-core`.

**Out of scope:** seasonal insight and forecast-accuracy UI (S-04, S-11); battery, temperature or price per day; backfill older than 62 days; app-side day derivation.

## Architecture / Approach

```text
energy-history.jsonl (5-min samples, ~90 days)
   └─ build_daily_history(rows, now, days)  [homelab-2 push script]
        └─ daily_history[] in every push ──► /api/ingest ──► ingest_push ──► daily_energy (+ pv_forecast_kwh)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. App accepts the forecast | Contract field, column, updated ingest function, docs | Replacing `ingest_push` must keep its security settings and grants |
| 2. Production rollout | Migration applied, file renamed, app deployed | Must land before the lab sends the field, or pushes get 422 |
| 3. Lab derives and sends | `build_daily_history` with tests, backfill, apply on `docker-core` | A wrong day rule would overwrite history; the tests guard each rule |

**Prerequisites:** PR #27 (PRD v2 and roadmap) merged; homelab-2 PR #18 merged, since Phase 3 builds on its push script; `docker-core` reachable with the operator key.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Assumes `source_health == "ok"` reliably marks samples with real counters; the lab writes 0 for missing sensors, so degraded samples are ignored.
- Days during lab outages simply stay absent; S-04's fallback handles gaps.
- Deye's daily counters reset at local midnight with some cloud lag; the "latest sample" rule absorbs it.

## Success Criteria (Summary)

- Production `daily_energy` holds about 60 days after the backfill, yesterday complete and today partial.
- `pv_forecast_kwh` is filled for recent days.
- Every lab push keeps returning 201.
