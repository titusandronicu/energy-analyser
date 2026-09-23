# Today's Recommendation Implementation Plan

## Overview

Show the owner the latest battery recommendation narrated by the home lab as soon as they open the app: Polish text, when it was generated, today's and tomorrow's forecast with its confidence stated explicitly, and a visible warning when the advice is stale. Advisory only, with no controls. This is roadmap slice S-03, the north star (US-01, FR-005, FR-006). The home lab's push of real recommendations is a separate homelab-2 change; this plan ships the page, the access rules and an empty state, and hands over what the lab side needs.

## Current State Analysis

- Recommendations arrive through F-01: `public.recommendations` stores `generated_at` (unique), `language`, `text`, `provider`, `model`, `forecast` (jsonb: `today_kwh`, `tomorrow_kwh`, optional `confidence`) and `facts` (jsonb, including `local_findings`) (`supabase/migrations/20260923101001_push_ingestion.sql:46-57`).
- That table has RLS with no policies, and `anon`/`authenticated` privileges are revoked (`…push_ingestion.sql:59-66`), so the app can't read it yet.
- The lab narrates about every hour, not once a day: `refresh-energy-agent-data.sh:103` re-runs `run-energy-advisory.py` when the last response is older than 55 minutes (homelab-2). The lab doesn't push yet, so production has no rows.
- The lab's output has no forecast confidence; `confidence` is optional in the v1 contract (`src/lib/ingest/contract.ts`).
- `/dashboard` (`src/pages/dashboard.astro`) is the starter placeholder, protected by middleware. `/` renders the starter's English `Welcome.astro`.
- Sign-in is the magic link (S-01). In local and CI runs `ALLOW_SIGNUP=true` creates a fresh user per smoke run; production has a single owner account.
- Services follow the injected-dependency pattern with unit tests (`src/lib/services/ingest.ts`, `magic-link.ts`); shared types belong in `src/types.ts`, which doesn't exist yet.

## Desired End State

- `/` redirects signed-in users to `/dashboard` and everyone else to `/auth/signin`.
- `/dashboard` (Polish) shows the newest recommendation by `generated_at`:
  - its text with line breaks kept, "Wygenerowano <date time>" in Europe/Warsaw, and the model that wrote it
  - forecast "Dziś X kWh / Jutro Y kWh" (a dash when a value is missing) and "Pewność prognozy: niska/średnia/wysoka", or "nieznana" when the lab didn't send one
  - a collapsible "Na podstawie" list of the lab's findings
  - a note that this is advice only and the app changes nothing on the inverter
- The same recommendation carries a visible "Nieaktualna" warning when it was generated before the start of today in Europe/Warsaw, **or** more than 2 hours ago.
- With no recommendations at all, the page shows "Brak rekomendacji — laboratorium jeszcze nie przesłało danych."
- Only users listed in `public.app_owners` can read recommendations; other signed-in users see the empty state and anonymous users read nothing.

Verify with `npm test`, `npm run lint`, `npx astro check`, `npm run build`, and the CI smoke job.

### Key Discoveries:

- Recommendations table and revoked grants: `supabase/migrations/20260923101001_push_ingestion.sql:46-66`.
- Hourly narration cadence: homelab-2 `infra/compose/energy-app/scripts/refresh-energy-agent-data.sh:103`.
- Advisory output fields (`generated_at`, `provider`, `model`, `language`, `response_text`): homelab-2 `scripts/run-energy-advisory.py:322-333`.
- Dashboard placeholder: `src/pages/dashboard.astro`; starter landing: `src/pages/index.astro` → `src/components/Welcome.astro`.
- Service + test pattern: `src/lib/services/magic-link.ts`, `magic-link.test.ts`.

## What We're NOT Doing

- No homelab-2 changes. The push step is a separate change; this plan only writes its brief.
- No confidence modelling in the app; the confidence comes from the lab, or shows as "nieznana".
- No live state (S-02), no seasonal insight (S-04), and no feedback on recommendations (S-05/S-06).
- No history view; only the newest recommendation is shown.
- No controls that change Home Assistant or the inverter.
- No Topbar/Layout redesign beyond what the dashboard needs.

## Implementation Approach

Access rules first: an explicit owner allowlist in the database, so every later slice (S-02, S-04, S-05) can reuse the same "is owner" check. Then a pure view-model service that decides staleness and labels, so the rules are unit-tested with fixed clocks and the page stays a thin rendering of it. Real data from the lab comes later through the separate homelab-2 change; until then, the empty state is the production behaviour.

## Critical Implementation Details

- **Grants and RLS both matter.** F-01 revoked all table privileges from `authenticated`. The new migration must `grant select` on `recommendations` (and on `app_owners`) to `authenticated` **and** add the owner-only select policies. A grant alone would expose the data to every user; a policy alone still fails with permission denied.
- **Local/CI owner trigger lives only in `seed.sql`.** It adds every new `auth.users` row to `app_owners`, so smoke-created users can read. `seed.sql` never runs in production, where the owner row is inserted by hand. Putting the trigger in a migration would make every future user an owner in production.

## Phase 1: Data access and recommendation view model

### Overview

Let the owner, and only the owner, read recommendations, and turn a row into everything the page shows, with the rules unit-tested.

### Changes Required:

#### 1. Migration: owner allowlist and read access

**File**: `supabase/migrations/<timestamp>_owner_read_recommendations.sql`

**Intent**: Introduce the owner allowlist and let listed owners read recommendations through RLS.

**Contract**:
- `public.app_owners` (`user_id uuid primary key references auth.users (id) on delete cascade`, `created_at timestamptz not null default now()`), with RLS enabled.
- Grant `select` on `app_owners` and `recommendations` to `authenticated`, with no insert/update/delete.
- The `app_owners` select policy for `authenticated` allows `user_id = (select auth.uid())`.
- The `recommendations` select policy for `authenticated` allows `exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))`.
- `anon` gets nothing new.

#### 2. Local/CI owner seeding

**File**: `supabase/seed.sql`

**Intent**: Make every locally created user an owner so smoke and local development can read recommendations. This file is local/CI only.

**Contract**: A `SECURITY DEFINER` trigger function plus an `after insert on auth.users` trigger that inserts the new id into `public.app_owners` (`on conflict do nothing`). The comment states it must never be copied into a migration.

#### 3. Recommendation types and view model

**File**: `src/types.ts`, `src/lib/services/recommendation.ts`, `src/lib/services/recommendation.test.ts`

**Intent**: Load the newest recommendation and derive everything the card shows from it and the current time.

**Contract**:
- `RecommendationRow` in `src/types.ts`, matching the table columns the page reads.
- `loadLatestRecommendation(client) → Promise<RecommendationRow | null>`: select ordered by `generated_at desc`, limit 1. A query error is thrown, not swallowed.
- `toRecommendationView(row: RecommendationRow | null, now: Date)` → `{ kind: "empty" }` or `{ kind: "recommendation", text, generatedAtLabel, isStale, forecast: { todayLabel, tomorrowLabel, confidenceLabel }, modelLabel, findings: string[] }`, where:
  - `isStale` is true when `generated_at` is before the start of `now`'s day in Europe/Warsaw, or `now - generated_at > 2 h`
  - labels are in Polish: `pl-PL` with Europe/Warsaw for the date, one decimal plus "kWh" for energy, "—" for a missing value, and confidence low/medium/high → niska/średnia/wysoka with missing → "nieznana"
  - `findings` are the `fact` strings from `facts.local_findings`, read defensively because the jsonb shape isn't guaranteed

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local DB: `npx supabase db reset` (via the remote-docker relay)
- Unit tests pass: `npm test`
- View-model tests cover: empty; fresh; stale because of yesterday in Warsaw (for example 23:30 yesterday vs 00:30 today); stale because of more than 2 h the same day; exactly 2 h is not stale; the Warsaw midnight boundary with UTC times in the previous UTC day; each confidence value and a missing one; missing forecast values; findings from malformed `facts`
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`

#### Manual Verification:

- In the local DB, a user not in `app_owners` gets zero rows from `recommendations`, and an owner gets rows (checked via SQL with `set local role authenticated` and a user id claim)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard recommendation card

### Overview

Replace the placeholder dashboard and the starter landing page with the Polish recommendation view, and prove it end to end in the smoke test.

### Changes Required:

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`, `src/components/RecommendationCard.astro`

**Intent**: Render the view model server-side: the fresh, stale and empty states, a header with the owner's email and "Wyloguj", and the advice-only note. The text is rendered as plain text, never HTML, with line breaks preserved.

**Contract**: The page calls `loadLatestRecommendation` with the request's cookie-bound client and `toRecommendationView(row, new Date())`. A load error shows a Polish "Nie udało się wczytać rekomendacji" message instead of a 500. Findings sit inside a `<details>` titled "Na podstawie".

#### 2. Landing redirect

**File**: `src/pages/index.astro`, `src/components/Welcome.astro`, `src/components/Topbar.astro`

**Intent**: `/` becomes a redirect (signed-in → `/dashboard`, otherwise `/auth/signin`). Delete `Welcome.astro`, and `Topbar.astro` if nothing else uses it.

**Contract**: `GET /` → 302.

#### 3. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Prove the whole read path. Push a payload whose recommendation `generated_at` is now, sign in, and check that `/dashboard` contains that recommendation's text and no staleness warning.

**Contract**: The ingest push with a recommendation runs before the signed-in dashboard check. The dashboard step asserts status 200 and that the body contains a distinctive substring of the pushed text. `/` → 302. An anonymous REST select on `recommendations` → 401. The `request` helper gains an optional body capture.

### Success Criteria:

#### Automated Verification:

- Lint, type check, build and unit tests pass
- CI `smoke` job passes, including the dashboard-shows-recommendation step
- No references to the deleted starter components remain: `grep -rn "Welcome" src` returns nothing

#### Manual Verification:

- The card reads well in Polish at phone width in all three states (fresh, stale, empty), checked locally with seeded data

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Production rollout and home-lab handoff

### Overview

Put the access rules and the page into production, register the owner, and write down what the separate homelab-2 change must deliver.

### Changes Required:

#### 1. Production database

**File**: `context/deployment/micrus-runbook.md`

**Intent**: Record the one-time owner step next to the other Supabase steps.

**Contract**:
1. Apply the migration to production (Supabase MCP or `npx supabase db push`), keeping the repo file's version in step with what production records.
2. Insert the owner with `insert into public.app_owners (user_id) select id from auth.users where email = '<owner email>';` in the SQL editor.

#### 2. Home-lab push brief

**File**: `context/changes/todays-recommendation/follow-ups/homelab-push.md`

**Intent**: A self-contained brief for the homelab-2 change. After each refresh, POST the v1 payload (state, plus `recommendation` built from `energy-agent-response.json` and the briefing's facts when `response_text` is present, plus `daily_history` when available) to `/api/ingest` with the token. Include the field mapping from the lab files to the contract, the retry rules (`docs/ingest/README.md`), and the forecast-confidence gap.

**Contract**: The brief references `docs/ingest/README.md` and `docs/ingest/example-v1.json`, and contains no token or host.

### Success Criteria:

#### Automated Verification:

- CI `ci` and `smoke` jobs pass on the PR

#### Manual Verification:

- Migration applied in production and the owner row inserted
- After deploy, `/dashboard` in production shows the empty state (until the lab pushes)
- Once the homelab-2 push is live, `/dashboard` shows the lab's latest recommendation (closes the north star)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- View model: every staleness boundary with fixed clocks around Warsaw midnight and the 2 h window, confidence labels, missing values, and malformed facts.

### Integration Tests:

- Smoke in CI: pushed recommendation → signed-in owner (seed trigger) sees its text on `/dashboard`; anonymous REST read denied; `/` redirects.

### Manual Testing Steps:

1. Locally, push a fixture with `--full` and a current `generated_at`, then sign in and see the fresh card.
2. Push one with `generated_at` 3 h ago and a later `captured_at`, and see the "Nieaktualna" warning.
3. In production after rollout, see the empty state; after the homelab-2 change, see real advice.

## Performance Considerations

One indexed query per dashboard view (unique `generated_at` index, limit 1). About 24 rows a day is negligible.

## Migration Notes

The additive migration doesn't touch existing data. In production, run it before or with the deploy; the page shows the empty state until the owner row exists. `seed.sql`'s trigger is local/CI only.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (US-01, FR-005, FR-006, guardrails)
- Ingest contract and storage: `docs/ingest/README.md`, `supabase/migrations/20260923101001_push_ingestion.sql`
- Lab advisory: homelab-2 `infra/compose/energy-app/scripts/run-energy-advisory.py`, `refresh-energy-agent-data.sh`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data access and recommendation view model

#### Automated

- [x] 1.1 Migration applies on a clean local DB — 02d1ce3
- [x] 1.2 Unit tests pass: `npm test` — 02d1ce3
- [x] 1.3 View-model tests cover staleness boundaries, confidence, missing values and malformed facts — 02d1ce3
- [x] 1.4 Lint, type check and build pass — 02d1ce3

#### Manual

- [ ] 1.5 Non-owner reads zero recommendations and owner reads rows in the local DB

### Phase 2: Dashboard recommendation card

#### Automated

- [x] 2.1 Lint, type check, build and unit tests pass
- [ ] 2.2 CI `smoke` job passes including the dashboard-shows-recommendation step
- [x] 2.3 No references to the deleted starter components remain

#### Manual

- [ ] 2.4 Card reads well in Polish at phone width in fresh, stale and empty states

### Phase 3: Production rollout and home-lab handoff

#### Automated

- [ ] 3.1 CI `ci` and `smoke` jobs pass on the PR

#### Manual

- [ ] 3.2 Migration applied in production and owner row inserted
- [ ] 3.3 Production dashboard shows the empty state after deploy
- [ ] 3.4 Production dashboard shows the lab's latest recommendation once the homelab-2 push is live
