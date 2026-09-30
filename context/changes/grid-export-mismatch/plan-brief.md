# Night-Time Grid Draw and Highest/Lowest Consumption Hours — Plan Brief

> Full plan: `context/changes/grid-export-mismatch/plan.md`
> Frame brief: `context/changes/grid-export-mismatch/frame.md`

## What & Why

The owner wants to see how much the house draws from the grid at night, and which hours and days had the highest
and lowest house use, "so as a consumer I can try to pinpoint what was going on on those days". The frame showed the
inverter's grid reading is usable at night (within ~10% of PGE) but over-reports during the day. August also shows
why this matters: 1–2 Aug used 113 and 131 kWh against a normal 28–43, drawing about 8 kW for hours.

## Starting Point

The app stores daily totals only (`daily_energy` from the `daily_history` push section) and keeps raw pushes for 14
days. The lab already averages its 5-minute history into hours, but keeps 48 hours for its own notes and sends nothing
hourly. Roadmap S-10 forbids sending single readings or timestamps.

## Desired End State

A "Godziny zużycia" card on the dashboard shows last night's grid draw (22:00–06:00) against the average of recent
nights, the 5 highest and 5 lowest hours of house use with grid draw beside each, and the 3 highest and 3 lowest days.
It says what window it rests on and refuses to rank when data is too thin. A note warns that daytime grid draw from
the inverter may be overstated until its sensor is checked.

## Key Decisions Made

| Decision               | Choice                                                                        | Why (1 sentence)                                                                  | Source        |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- |
| What the plan is about | Night-time grid draw plus highest/lowest hours and days                       | The owner's need; the export gap is explained or on-site                          | Frame + owner |
| Data source            | Inverter hourly figures pushed by the lab                                     | Automatic and current; verified within ~10% at night                              | Plan          |
| What is ranked         | House use, with grid draw shown beside it                                     | "What was running" is a house-use question                                        | Plan          |
| S-10's timestamp rule  | Hourly totals per clock hour may leave the lab                                | The feature needs specific hours; still no sub-hour or raw PGE rows               | Plan          |
| Retention              | 35 days in the app                                                            | Matches `daily_history`; covers a month                                           | Plan          |
| Push size              | Last 48 complete hours per push, one-off 35-day backfill                      | A full window every 5 minutes would retain ~300 MB of raw pushes                  | Plan          |
| Completeness           | Hour: ≥ 10 of 12 readings; day: every local clock hour (23/24/25)             | Gaps must not pose as "lowest"                                                    | Plan          |
| Rankings               | Top 5/5 hours, 3/3 days; ties to the more recent; days need ≥ 7 complete days | Short lists for a non-expert; no ranking from too little data                     | Plan          |
| Night                  | 22:00–06:00, named "noc z 1 na 2 sierpnia"; draw = sum of positive hourly net | How people think of overnight; the same quantity PGE bills and the frame verified | Plan + review |
| Placement              | Full-width card below the card grid, inside the main landmark                 | A new surface without disturbing the refreshed layout                             | Plan          |

## Scope

**In scope:**

- An optional `hourly_history` push section, the `hourly_energy` table (35 days, owner-only)
- Pure ranking rules with unit tests (synthetic data only; the repo is public), and the "Godziny zużycia" card
- Fixture tooling: `push-fixture.mjs` strips the section in state-only pushes and can generate synthetic hours
- The lab push sending 48 hours, a one-off backfill, and ordered production rollout
- Docs (logic, decisions, architecture, prerequisites, ingest README) and roadmap updates (S-10, open question 5)

**Out of scope:** fixing the inverter's CT; PGE CSV as a source; weekday/weekend shares and the hour-of-day profile
(rest of S-10); a calendar or charts; ranking grid draw separately; hourly data beyond 35 days.

## Architecture / Approach

Lab 5-minute history → `build_hourly_history` (complete clock hours, mean W → kWh, samples) → push `hourly_history`
(48 h) → `ingest_push` upserts `hourly_energy` (newer capture wins, pruned at 35 days) → `hourly-usage.ts` applies
completeness, night and ranking rules → `HourlyUsageCard.astro`. App first, lab second, because the contract rejects
unknown keys.

## Phases at a Glance

| Phase                            | What it delivers                                 | Key risk                                           |
| -------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| 1. Contract and storage          | App accepts and stores `hourly_history`          | Migration order in production                      |
| 2. Rules and read path           | Tested completeness, night and ranking rules     | DST days and nights across midnight                |
| 3. The card                      | "Godziny zużycia" on the dashboard               | Too much for a non-expert; keep lists short        |
| 4. Lab push, production, roadmap | Hours flowing, 35-day backfill, roadmap truthful | A lab push before the app deploy is rejected whole |

**Prerequisites:** the lab's 5-minute history on docker-core (90 days kept); the local Supabase stack (working since
the 2026-09-30 reset).
**Estimated effort:** ~3–4 sessions across two repos.

## Open Risks & Assumptions

- House load is the inverter's figure; PGE can't confirm it, and the CT fault may affect it too.
- Daytime grid draw is overstated until the on-site CT check; the card says so.
- M-1 scope: this delivers part of S-10 (already in M-1), not new scope.

## Success Criteria (Summary)

- The owner sees last night's grid draw and can point at the highest and lowest hours and days of the past 35 days.
- The figures rest on complete data and say so; thin data is refused, not guessed.
- In production, last night's figure agrees with PGE's CSV within ~10%.
