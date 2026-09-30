# History Backfill — Plan Brief

> Full plan: `context/changes/history-backfill/plan.md`

## What & Why

The home lab recorded ten days (2026-07-16 to 2026-07-25) before it started pushing to the app. Sending them once gives the calendar and the norms every day the lab has (roadmap F-03, FR-024). It is time-bound: the lab's history file keeps 90 days, so 2026-07-16 starts dropping around **2026-10-30**.

## Starting Point

Production's oldest day is 2026-07-26, from the `--days 62` backfill on 2026-09-25. The lab push script counts `daily_history` back from today and stops at 62 days; 2026-07-16 is 76 days back. The app accepts any day's age and keeps the latest capture per day, so it needs no change.

## Desired End State

`daily_energy` holds 2026-07-16 to 2026-07-25: nine days with totals and 2026-07-20 empty (the lab went offline at 15:17 that day). The regular push is unchanged, and the script keeps a documented `--from/--to` for any future range.

## Key Decisions Made

| Decision                 | Choice                                                                                     | Why (1 sentence)                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| How to pick the old days | `--from/--to` (inclusive Warsaw days) in the existing push script, exclusive with `--days` | One code path, so the backfilled days follow exactly the regular push's day rules       |
| Range validation         | Both halves required; from ≤ to; at most 62 days; `to` not in the future                   | Keeps a push inside the contract's 62-day cap and refuses typos before anything is sent |
| App side                 | No change                                                                                  | The contract has no age limit and the upsert already keeps the latest capture           |
| Phasing                  | Code and PR first, then the one-off run on docker-core                                     | The VM run happens only after the script is reviewed and merged                         |

## Scope

**In scope:** the range option, its tests and runbook step; one backfill push; production check; app docs/roadmap update.

**Out of scope:** app code, contract or migrations; the regular push; 2026-07-31 (lab rows but no usable counters); hourly data for these days; archiving the lab history file.

## Phases at a Glance

| Phase                                | What it delivers                             | Key risk                                                                                          |
| ------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. Date range in the push script     | `--from/--to`, tests, runbook (homelab-2 PR) | The default 35-day window drifting; covered by the existing tests                                 |
| 2. Backfill run and production check | Ten days in production, docs updated         | `409 capture time conflict` if the push reuses the timer's snapshot; retry after the next refresh |

**Prerequisites:** the lab history file still holding 2026-07-16 (until ~2026-10-30); SSH to docker-core; the owner's go for the install and the push.
**Estimated effort:** one short session per phase.

## Open Risks & Assumptions

- Early July rows are older formats (no `counters_ok`, some zero-filled PV counters); the existing legacy rule and dip filter handle them, and the dry run is compared with the neighbouring stored days before pushing.
- The 2026-10-30 date assumes about 280 rows a day; a gap-free period would bring it forward slightly.

## Success Criteria (Summary)

- The ten days are in production with the expected totals and 2026-07-20 empty.
- The regular push and the dashboard are unaffected.
