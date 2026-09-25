# Seasonal Usage Insight Implementation Plan

## Overview

Show the owner whether yesterday's home load was normal, above or below a season-adjusted baseline, with grid purchase next to it for cost context. When no year-ago data exists, the insight falls back to the trailing 30 days and says so visibly. This is roadmap slice S-04 (US-01, FR-003).

## Current State Analysis

- **Data:** `public.daily_energy` holds one row per Europe/Warsaw day: `pv_kwh`, `load_kwh`, `grid_import_kwh`, `grid_export_kwh`, `pv_forecast_kwh` (F-02). Production has 48 days from 2026-07-26, with 13 outage days missing. Today's row is partial and replaced by every push.
- **Access:** RLS is on with no policies, and client grants were revoked in F-01 (`supabase/migrations/20260923101001_push_ingestion.sql`), so owners cannot read it yet.
- **Patterns to reuse:**
  - owner-only access: `supabase/migrations/20260925123751_live_state_view.sql`;
  - pure view model with fixed-clock tests: `src/lib/services/live-state.ts`;
  - shared formatting helpers: `src/lib/format/values.ts`, `src/lib/format/warsaw-time.ts`;
  - card and independent loading on the dashboard: `src/components/LiveStateCard.astro`, `src/pages/dashboard.astro:12-51`.
- **Reality check:** history starts in July 2026, so the same-season baseline cannot apply until mid-2027. The fallback path is the one that runs now.

## Desired End State

A Polish "Zużycie wczoraj" card between the live state and the recommendation shows:

- the compared day, e.g. "Wczoraj (24 września)", or the date when yesterday is missing;
- home load in kWh with a flag: "w normie", "powyżej normy" or "poniżej normy", and the difference in % against the baseline average;
- grid purchase in kWh with its difference in % against its own baseline average, as information without a flag;
- which baseline was used: "ta sama pora roku (±14 dni, N dni)" or, when that is not available, a visible notice "Za mało danych z tej pory roku — porównanie ze średnią z ostatnich 30 dni (N dni)";
- an empty state "Za mało historii do porównania" when even the fallback has fewer than 7 days, and a load-error state that does not affect the other cards.

### Key Discoveries:

- Owner policy and column-grant pattern: `supabase/migrations/20260925123751_live_state_view.sql`.
- Dashboard loads each card independently through `orLoadError` (`src/pages/dashboard.astro:12-30`).
- Today's `daily_energy` row is partial (F-02 rule), so it must never be the compared day or part of a baseline.

## What We're NOT Doing

- No flag on grid purchase or PV (information only for purchase; PV not shown).
- No per-weekday or weather adjustment of the baseline.
- No charts or history table (the card shows one comparison).
- No change to the push contract or the lab.
- No standard-deviation thresholds; the rule is a fixed ±15% band.
- No backfill of older years here (tracked in F-02's `follow-ups/qnap-history.md`).

## Implementation Approach

Mirror S-02: access rules first, then a pure view model with fixed-clock tests that owns every rule, then a thin card. The page reads the owner's last ~400 days of `daily_energy` once (a few KB) and the view model does all selection in TypeScript, so the rules are unit-tested rather than hidden in SQL.

## Critical Implementation Details

- **Exclusions:** the compared day and today (Warsaw) are never part of a baseline, and a day with `load_kwh` null is skipped everywhere.
- **Boundary wording:** "above" means strictly more than 15% above the average and "below" strictly more than 15% below; exactly ±15% counts as normal.

## Phase 1: Data access and the comparison rule

### Overview

Owners can read daily totals, and every comparison rule is implemented and unit-tested.

### Changes Required:

#### 1. Migration: owner read access

**File**: `supabase/migrations/<timestamp>_owner_read_daily_energy.sql`

**Intent**: Let owners read daily totals, using the same owner check as the other tables.

**Contract**:
- column-level `grant select (day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh) on public.daily_energy to authenticated`;
- an owner-only select policy with the `exists (... app_owners ... auth.uid())` check;
- nothing for `anon`; `captured_at`, `updated_at` and `push_id` stay unreadable.

#### 2. Types and view model

**File**: `src/types.ts`, `src/lib/services/usage-insight.ts`, `src/lib/services/usage-insight.test.ts`

**Intent**: Turn daily rows and the current time into what the card shows.

**Contract**:
- `DailyEnergyRow` (`day`, `pv_kwh`, `load_kwh`, `grid_import_kwh`, `grid_export_kwh`, `pv_forecast_kwh`).
- `loadDailyEnergy(client)` returns the rows for the last 400 days, newest first, and throws on a query error.
- `toUsageInsightView(rows, now)` returns `{ kind: "insufficient" }` or `{ kind: "insight", dayLabel, isYesterday, load: { kwhLabel, deltaLabel, status }, purchase: { kwhLabel, deltaLabel }, baseline: { kind: "seasonal" | "fallback", days } }`, where:
  - **compared day:** yesterday in Europe/Warsaw if it has `load_kwh`, else the latest earlier day with `load_kwh` within the last 7 days; none found → `insufficient`;
  - **seasonal baseline:** days whose date falls within ±14 calendar days of the compared day's month-day in any earlier year; used when it has at least 20 days with `load_kwh`;
  - **fallback baseline:** the 30 calendar days before the compared day; used when the seasonal one is insufficient; fewer than 7 days with `load_kwh` → `insufficient`;
  - **baseline value:** the mean of the baseline days; purchase uses the same days, skipping nulls;
  - **status:** `above` when load > mean × 1.15, `below` when load < mean × 0.85, otherwise `normal`;
  - **labels:** kWh with one decimal and a Polish comma; delta as signed whole percent ("+12%", "−8%"); day label in Polish ("24 września").

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local DB: `npx supabase db reset` (via the remote-docker relay)
- Unit tests pass: `npm test`
- View-model tests cover: yesterday present; yesterday missing (earlier day used, date named); no day in the last 7 → insufficient; seasonal baseline chosen when ≥20 year-ago days; fallback when fewer; fallback with fewer than 7 days → insufficient; today and the compared day excluded; exactly +15% and −15% normal; just above and below; null loads skipped; purchase delta with some null purchases
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- In the local DB, an owner reads `daily_energy` rows, a non-owner reads none, `anon` is denied, and the owner cannot select `push_id`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard insight card

### Overview

The card appears between the live state and the recommendation, and the smoke test proves it.

### Changes Required:

#### 1. Card and page

**File**: `src/components/UsageInsightCard.astro`, `src/pages/dashboard.astro`

**Intent**: A server-rendered Polish card for the insight, fallback notice, insufficient and load-error states, loaded independently of the other cards.

**Contract**: the page loads daily rows through `orLoadError` alongside the existing loads; a failure shows "Nie udało się wczytać porównania" and leaves the other cards untouched.

#### 2. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Prove pushed history reaches the card.

**Contract**: after the signed-in dashboard step, the body contains "Zużycie wczoraj"; an anonymous REST select on `daily_energy` → 401.

### Success Criteria:

#### Automated Verification:

- Lint, type check, build and unit tests pass
- CI `smoke` job passes including the new steps

#### Manual Verification:

- The card reads well in Polish at phone width in the seasonal, fallback and insufficient states (checked locally)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Production rollout

### Overview

Apply the migration in production, keep the repo's migration version in step, and deploy.

### Changes Required:

#### 1. Production migration and deploy

**File**: `supabase/migrations/<timestamp>_owner_read_daily_energy.sql`

**Intent**: Apply through the Supabase connector, rename the file to the version production records, then merge and deploy.

**Contract**: production `list_migrations` matches the repo filenames; the security advisor shows no new finding.

### Success Criteria:

#### Automated Verification:

- CI `ci` and `smoke` jobs pass on the PR
- Production grants and policy verified by SQL (owner reads, non-owner none, anon denied)

#### Manual Verification:

- The production dashboard shows the card with the fallback notice (history starts 2026-07-26)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Compared-day selection, baseline selection and fallback, thresholds at the boundaries, null handling, labels.

### Integration Tests:

- Smoke: the signed-in dashboard shows the card; anonymous `daily_energy` read denied.

### Manual Testing Steps:

1. Locally, push history with and without year-ago days and check the seasonal and fallback states.
2. Remove yesterday's row and check the card names the earlier day.
3. Check the insufficient state with only a few days of history.

## Performance Considerations

One indexed read of at most ~400 small rows per dashboard view; the page already reloads every 5 minutes for one user.

## Migration Notes

Additive grant and policy; no data changes. Rollback: drop the policy and revoke the column grant.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd-v2.md` (US-01, FR-003, Business Logic)
- Data source: `context/changes/daily-history-push/` (F-02)
- Patterns: `src/lib/services/live-state.ts`, `src/components/LiveStateCard.astro`, `supabase/migrations/20260925123751_live_state_view.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data access and the comparison rule

#### Automated

- [x] 1.1 Migration applies on a clean local DB — 0c25f2c
- [x] 1.2 Unit tests pass — 0c25f2c
- [x] 1.3 View-model tests cover day selection, baselines, fallback, thresholds and nulls — 0c25f2c
- [x] 1.4 Lint, type check and build pass — 0c25f2c

#### Manual

- [x] 1.5 Owner reads daily_energy, non-owner and anon don't, owner can't read push_id — 0c25f2c

### Phase 2: Dashboard insight card

#### Automated

- [x] 2.1 Lint, type check, build and unit tests pass — b028a0c
- [x] 2.2 CI smoke job passes including the new steps — b028a0c

#### Manual

- [x] 2.3 Card reads well in Polish at phone width in seasonal, fallback and insufficient states

### Phase 3: Production rollout

#### Automated

- [x] 3.1 CI ci and smoke jobs pass on the PR — 61c816e
- [x] 3.2 Production grants and policy verified by SQL — 61c816e

#### Manual

- [x] 3.3 Production dashboard shows the card with the fallback notice
