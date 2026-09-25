# Live State with Staleness Implementation Plan

## Overview

Show the owner the home's current PV, home load, grid and battery state from the newest home-lab push, above today's recommendation. The state is marked stale when the newest snapshot is more than 15 minutes old, a mild notice appears when the lab reports a degraded snapshot, and the dashboard reloads itself every 5 minutes while visible. This is roadmap slice S-02 (US-01, FR-002, FR-004).

## Current State Analysis

- Every push carries a `state` section (`pv_w`, `home_load_w`, `grid_w` positive = import, `battery_w` positive = discharge, `battery_soc_pct`, `pv_today_kwh`, `grid_import_today_kwh`, `grid_export_today_kwh`, `source_health`), all nullable (`src/lib/ingest/contract.ts`).
- It's stored only inside `public.ingest_pushes.payload` (jsonb) with `captured_at`, kept 14 days (`supabase/migrations/20260923101001_push_ingestion.sql:18-30`). RLS is on with no policies, and client grants are revoked.
- The lab pushes every 5 minutes. When Home Assistant is unreachable, the lab keeps its old snapshot, so re-pushes are duplicates and the newest `captured_at` stops advancing. Its age is therefore a reliable staleness signal (homelab-2 `refresh-energy-agent-data.sh`).
- S-03 introduced the owner allowlist (`public.app_owners`, `supabase/migrations/20260923150859_owner_read_recommendations.sql`), the view-model pattern (`src/lib/services/recommendation.ts`) and the dashboard card layout (`src/pages/dashboard.astro`, `src/components/RecommendationCard.astro`).

## Desired End State

- `/dashboard` shows a Polish "Stan na żywo" card above the recommendation:
  - PV production, home load, grid (kW, labelled "pobór z sieci" or "oddawanie do sieci"), battery (kW, "ładowanie" or "rozładowanie") and state of charge (%)
  - today's PV, bought and sold energy (kWh)
  - "Odczyt z <date time>" in Europe/Warsaw
- Missing values show "—".
- When the newest snapshot is more than 15 minutes old, the card shows a warning, "Dane nieaktualne — ostatni odczyt <how long> temu", and keeps the last-known numbers.
- When `source_health` is `degraded`, the card shows "Niepełne dane z Home Assistant — część odczytów może być niedostępna."
- With no pushes at all, the card shows "Brak danych — laboratorium jeszcze nie przesłało odczytów."
- While the tab is visible, the dashboard reloads every 5 minutes.
- Only owners can read the state; anonymous and non-owner users read nothing.

### Key Discoveries:

- State contract and sign conventions: `src/lib/ingest/contract.ts` (state object).
- Raw push storage: `supabase/migrations/20260923101001_push_ingestion.sql:18-30`.
- Owner check to reuse: `supabase/migrations/20260923150859_owner_read_recommendations.sql`.
- View-model and card patterns to follow: `src/lib/services/recommendation.ts`, `src/components/RecommendationCard.astro`.

## What We're NOT Doing

- No history, charts or trends (S-04 covers the seasonal insight).
- No live partial updates or new API route; a full-page reload every 5 minutes is enough for one user.
- No alerts or notifications when the state goes stale.
- No change to the push contract or the home lab.
- No direct owner access to raw payload columns beyond what the view needs (the token and hash columns stay hidden).

## Implementation Approach

Mirror S-03: access rules first, then a pure view model with fixed-clock unit tests, then a thin card. A `security_invoker` view reads through the caller's RLS, so the owner check stays in one place (`app_owners`). Column-level grants keep `token_id` and `payload_hash` out of reach.

## Critical Implementation Details

- **The view must run as the caller.** Create it `with (security_invoker = true)`; otherwise it would run with the owner role's rights and bypass RLS on `ingest_pushes`.
- **Column grants, not a table grant.** Grant `select (source, captured_at, received_at, payload)` on `ingest_pushes` to `authenticated`, not the whole table, so `token_id` and `payload_hash` stay unreadable even for the owner.

## Phase 1: Data access and live-state view model

### Overview

Owner-only read access to the newest snapshot, and all display rules unit-tested.

### Changes Required:

#### 1. Migration: live-state view

**File**: `supabase/migrations/<timestamp>_live_state_view.sql`

**Intent**: Expose only the newest snapshot's time, health and state to owners.

**Contract**:
- Column-level `grant select (source, captured_at, received_at, payload) on public.ingest_pushes to authenticated`.
- Owner-only select policy on `ingest_pushes`, using the same `exists (… app_owners … auth.uid())` check as recommendations.
- `public.live_state` view `with (security_invoker = true)` returning `captured_at`, `received_at` and `payload -> 'state' as state` for the newest `source = 'homelab'` row. `grant select` on the view to `authenticated`; nothing to `anon`.

#### 2. Types and view model

**File**: `src/types.ts`, `src/lib/services/live-state.ts`, `src/lib/services/live-state.test.ts`

**Intent**: Turn the newest snapshot and the current time into what the card shows.

**Contract**:
- `LiveStateRow` (`captured_at`, `received_at`, `state: unknown`).
- `loadLiveState(client) → Promise<LiveStateRow | null>` (throws on a query error).
- `toLiveStateView(row, now)` → `{ kind: "empty" }` or `{ kind: "state", capturedAtLabel, ageLabel, isStale, isDegraded, pv, homeLoad, grid: { value, direction }, battery: { value, direction, socLabel }, today: { pv, bought, sold } }`, where:
  - **power:** W → "x,x kW" (one decimal, Polish comma)
  - **grid direction:** positive → "pobór z sieci", negative → "oddawanie do sieci", zero or null → no direction
  - **battery direction:** positive → "rozładowanie", negative → "ładowanie"
  - **state of charge:** "74%"
  - **energy:** "x,x kWh"
  - **missing values:** "—"
  - **staleness:** `isStale` when `now - captured_at > 15 min`; exactly 15 minutes is not stale
  - **age:** "5 min" under an hour, "2 godz." up to a day, "3 dni" beyond
  - **degraded:** `isDegraded` when `source_health === "degraded"`
  - **the date label** reuses S-03's Warsaw formatting

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local DB: `npx supabase db reset` (via the remote-docker relay)
- Unit tests pass: `npm test`
- View-model tests cover: empty; fresh; exactly 15 min not stale; 15 min + 1 s stale; age labels (minutes, hours, days); grid and battery direction for positive, negative, zero and null; degraded vs ok; missing values; malformed `state`
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- In the local DB, an owner reads one row from `live_state`, a non-owner reads none, `anon` is denied, and the owner can't select `token_id` from `ingest_pushes`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard live-state card and auto-reload

### Overview

Render the card above the recommendation, reload every 5 minutes while visible, and prove it in the smoke test.

### Changes Required:

#### 1. Card and page

**File**: `src/components/LiveStateCard.astro`, `src/pages/dashboard.astro`

**Intent**: A server-rendered Polish card for the state, stale, degraded, empty and load-error states, placed above `RecommendationCard`. A load error shows "Nie udało się wczytać stanu" without affecting the recommendation card.

**Contract**: The page loads live state and the recommendation independently; either can fail on its own.

#### 2. Auto-reload

**File**: `src/pages/dashboard.astro`

**Intent**: Reload the page every 5 minutes while visible, so new data and staleness show up in an open tab.

**Contract**: A small inline script. It reloads 5 minutes after page load if the page is visible; when the tab becomes visible again after 5 or more minutes, it reloads at once. Background tabs never reload.

#### 3. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Prove push → live-state card.

**Contract**: After the fresh push and sign-in, the dashboard body contains "Stan na żywo" and the example's PV value ("3,1 kW") and no "Dane nieaktualne". An anonymous REST select on `live_state` → 401.

### Success Criteria:

#### Automated Verification:

- Lint, type check, build and unit tests pass
- CI `smoke` job passes, including the live-state steps

#### Manual Verification:

- The live-state card reads well in Polish at phone width in the fresh, stale, degraded and empty states (checked locally)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Production rollout

### Overview

Apply the migration in production, keep the repo's migration version in step, and deploy.

### Changes Required:

#### 1. Production migration

**File**: `supabase/migrations/<timestamp>_live_state_view.sql`

**Intent**: Apply it through the Supabase connector, then rename the file to the version production records (as for F-01 and S-03).

**Contract**: Production `list_migrations` and the repo's migration filenames match.

### Success Criteria:

#### Automated Verification:

- CI `ci` and `smoke` jobs pass on the PR

#### Manual Verification:

- After deploy, the production dashboard shows the live-state card: the empty state until the home lab pushes, then the lab's numbers

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Live-state view model: staleness boundary, age labels, direction words and zero handling, degraded, missing and malformed data.

### Integration Tests:

- Smoke in CI: pushed state appears on the signed-in owner's dashboard; anonymous view read denied.

### Manual Testing Steps:

1. Locally, push a fixture and see the fresh card.
2. Push a snapshot captured 20 minutes ago as the newest, and see "Dane nieaktualne — ostatni odczyt 20 min temu".
3. Push `source_health: "degraded"` with some nulls, and see the notice and dashes.

## Performance Considerations

One indexed query per dashboard view (the `captured_at` index, limit 1). A reload every 5 minutes for one user is negligible.

## Migration Notes

Additive view, policy and column grants; no data changes. Production shows the empty state until the home lab pushes.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (US-01, FR-002, FR-004)
- Patterns: `src/lib/services/recommendation.ts`, `src/components/RecommendationCard.astro`, `supabase/migrations/20260923150859_owner_read_recommendations.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data access and live-state view model

#### Automated

- [x] 1.1 Migration applies on a clean local DB — ff11664
- [x] 1.2 Unit tests pass: `npm test` — ff11664
- [x] 1.3 View-model tests cover staleness boundary, age labels, directions, degraded, missing and malformed data — ff11664
- [x] 1.4 Lint, type check and build pass — ff11664

#### Manual

- [x] 1.5 Owner reads live_state, non-owner and anon don't, owner can't read token_id — ff11664

### Phase 2: Dashboard live-state card and auto-reload

#### Automated

- [x] 2.1 Lint, type check, build and unit tests pass
- [ ] 2.2 CI `smoke` job passes including the live-state steps

#### Manual

- [ ] 2.3 Live-state card reads well in Polish at phone width in fresh, stale, degraded and empty states

### Phase 3: Production rollout

#### Automated

- [ ] 3.1 CI `ci` and `smoke` jobs pass on the PR

#### Manual

- [ ] 3.2 Production dashboard shows the live-state card after deploy
