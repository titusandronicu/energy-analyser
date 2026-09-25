# Seasonal Usage Insight — Plan Brief

> Full plan: `context/changes/seasonal-usage-insight/plan.md`

## What & Why

Show whether yesterday's home load was normal, above or below a season-adjusted baseline, with grid purchase next to it for cost context. This is roadmap slice S-04 (FR-003): it answers "was yesterday's usage normal or a waste of money" from the PRD's problem statement.

## Starting Point

F-02 fills `daily_energy` with one row per day (48 days from 2026-07-26, 13 outage days missing; today partial). Owners cannot read the table yet. S-02 already set the pattern: owner-only access with column grants, a tested view model, and a Polish card on the dashboard.

## Desired End State

A "Zużycie wczoraj" card between the live state and the recommendation shows yesterday's load with "w normie" / "powyżej normy" / "poniżej normy" and the % difference, grid purchase with its % difference, and which baseline was used. For now it shows the fallback notice, because year-ago data does not exist yet.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| What "usage" means | Flag on home load; grid purchase shown as information | "Did I use normally" and "did I buy normally" are different questions, and cost is the purchase. |
| Compared period | Yesterday (last complete day); an earlier day within 7 days if yesterday is missing | Matches the PRD's "yesterday"; today is partial. |
| Threshold | Strictly more than ±15% from the baseline mean; exactly ±15% is normal | Simple and explainable with the few days available. |
| Same-season baseline | ±14 days around the day's date in earlier years, at least 20 days | Proposed in the roadmap; avoids comparing thin data. |
| Fallback | The 30 days before the compared day, at least 7 days, with a visible notice | FR-003's cold-start rule; it is the only path until mid-2027. |
| Where the rules live | TypeScript view model over the owner's last ~400 rows | Rules are unit-tested instead of hidden in SQL; the data is tiny. |

## Scope

**In scope:** owner read access to `daily_energy`; view model and tests; card on the dashboard; smoke steps; production migration and deploy.

**Out of scope:** flags on purchase or PV; weekday or weather adjustment; charts; contract or lab changes; older-year backfill (F-02 follow-up).

## Architecture / Approach

```text
daily_energy (F-02) ──owner RLS + column grants──► loadDailyEnergy ──► toUsageInsightView(rows, now) ──► UsageInsightCard
                                                         compared day → seasonal baseline (≥20 d) → else 30-day fallback (≥7 d) → ±15% flag
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data access and rule | Owner policy and grants; tested view model | Off-by-one in day windows or including today in a baseline |
| 2. Dashboard card | Polish card and smoke steps | Wording of the fallback notice |
| 3. Production rollout | Migration applied, file renamed, deployed | None beyond the usual migration-before-deploy order |

**Prerequisites:** F-02 done (daily history in production); local Supabase via the UGREEN relay; Supabase connector.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- The fallback runs until mid-2027 unless older history is imported (F-02 follow-up `qnap-history.md`).
- Outage gaps reduce the number of baseline days; the card states how many days the baseline uses.

## Success Criteria (Summary)

- The owner sees yesterday's load flagged against a stated baseline, with purchase context.
- Non-owners and anonymous clients cannot read daily totals.
- CI proves the card renders from pushed history.
