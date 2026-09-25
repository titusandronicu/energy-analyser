<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Live State with Staleness

- **Plan**: context/changes/live-state-with-staleness/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria were re-run on 2026-09-25:
- Unit tests, lint, `astro check` and build pass.
- The migration applied on a clean local DB.
- CI `ci` and `smoke` passed on PR #24, including "dashboard shows the fresh live state" and "anon cannot read live state directly -> 401".
- Manual row 1.5 was checked by SQL: locally (owner 1 row, non-owner 0, anon denied, owner can't read `token_id`) and in production (no anon grant, no `token_id`/`payload_hash` column privilege, `security_invoker=true`, non-owner 0 rows).
- Rows 2.3 and 3.2 were confirmed by the owner.

## Findings

### F1 — Owners can read the raw push history directly, not only through the view

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260925123751_live_state_view.sql:1-12
- **Detail**: The comment says owners read `ingest_pushes` "through the public.live_state view only". But the column grant and the owner policy apply to the table itself, so an owner can call `GET /rest/v1/ingest_pushes?select=payload,captured_at,...` and get the full 14-day payload history. `token_id`, `payload_hash`, `id` and `contract_version` stay hidden, and non-owners and anon read nothing. It isn't a leak for a single-owner app, whose owner already reads recommendations. The risk is that a later slice trusts the comment.
- **Fix A ⭐ Recommended**: Correct the comment in a follow-up migration comment or the runbook; keep the access as is.
  - Strength: Matches the actual single-tenant model, where the owner is allowed to see their own pushed data; there's no schema churn.
  - Tradeoff: The raw payload stays reachable for the owner.
  - Confidence: HIGH — RLS still limits it to owners, which the SQL checks confirmed.
  - Blind spot: A future multi-user feature would need to revisit this.
- **Fix B**: Make the view the only way in: drop the table grant and policy, and serve the newest state through a `security definer` function with its own owner check.
  - Strength: The narrowest possible exposure.
  - Tradeoff: A new migration applied in production, plus a definer function, which is the pattern the advisor flags.
  - Confidence: MED — it also changes how S-04 would read the history.
  - Blind spot: S-04 may want the history anyway.
- **Decision**: FIXED (Fix A): access documented in CLAUDE.md and the runbook; the applied migration is unchanged

### F2 — The auto-reload relies on a single timer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:56-69
- **Detail**: One `setTimeout(reloadIfDue, 5 min)` fires. If it fires a hair early relative to `Date.now()` (clock coarsening or a clock change), the `>= 5 min` check fails and nothing re-arms it. A tab that stays visible then never reloads, until it's hidden and shown again.
- **Fix**: Replace the one-shot timer with `setInterval(reloadIfDue, 60_000)`, keeping the visibility check.
- **Decision**: FIXED: setInterval(reloadIfDue, 60 s)

### F3 — Formatting helpers are shared through another card's service

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/live-state.ts:3
- **Detail**: `live-state.ts` imports `formatWarsawDateTime` from `recommendation.ts`. `MISSING`, `asRecord`, `kwhLabel` and the pl-PL one-decimal formatter are copied in both services, and `src/lib/format/` already exists.
- **Fix**: Move the Warsaw time and number/"—" helpers to `src/lib/format/` (e.g. `warsaw-time.ts`, `numbers.ts`) and import them from both services.
- **Decision**: FIXED: shared helpers in src/lib/format/warsaw-time.ts and src/lib/format/values.ts

### F4 — Tiny flows show "0,0 kW" next to a direction word

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/live-state.ts:65-69
- **Detail**: Only an exact 0 W hides the direction. For example, 30 W of grid import shows "0,0 kW · pobór z sieci", which reads as contradictory.
- **Fix**: Treat |W| < 50 as no direction (still "0,0 kW"), and add a test case.
- **Decision**: FIXED: no direction below MIN_FLOW_W = 50 W (+ 5 test cases, break-checked)

### F5 — The smoke test doesn't check what a signed-in user can read

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs:145-175
- **Detail**: The smoke test covers anon only. The column grant's main guarantee, that a signed-in user can't select `token_id` or `payload_hash`, is proven only by manual SQL.
- **Fix**: Get a JWT for the smoke password user and assert that `ingest_pushes?select=token_id` is refused.
- **Decision**: FIXED: smoke step "signed-in user cannot read push token columns" -> 403 (checked locally: 403 hidden columns, 200 captured_at)

### F6 — No rollback noted for the migration

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/deployment/micrus-runbook.md
- **Detail**: The migration only adds a grant, a policy and a view, with no data change. The rollback isn't written down anywhere, and neither is one for the earlier migrations.
- **Fix**: Add the three rollback statements (drop the view, drop the policy, revoke the column grant) to the runbook.
- **Decision**: FIXED: rollback SQL in the runbook
