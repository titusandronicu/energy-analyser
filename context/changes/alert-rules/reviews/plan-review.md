<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Alert Rules with Telegram Notifications

- **Plan**: context/changes/alert-rules/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: REVISE
- **Findings**: 0 critical, 8 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

21/22 paths ✓ (CHANGELOG.md missing), 10/12 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (25 steps, 1:1)

## Findings

### F1 — bill_above has no numeric figure to compare

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Pure evaluation
- **Detail**: The plan reads `projected_bill_gross_pln` from the `forecast` view variant and says to confirm the field at implementation. The variant has no numeric PLN field, only formatted labels; the number exists only in the raw body (`bill-forecast.ts:364`). The `unavailable` reason is Polish display text, not a code.
- **Fix**: Add a numeric `centralPln` to the `forecast` variant, set after all existing guards, so the evaluator inherits every refusal path. Store the unavailable reason as text only.
  - Strength: Reuses the stale, 7-day and plausibility guards instead of duplicating them.
  - Tradeoff: Touches a mutation-tested file (`bill-forecast.ts`).
  - Confidence: HIGH — the guards already sit in front of that line.
  - Blind spot: Existing snapshot tests of the view shape may need the new field.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F2 — A forecast for another month would still fire alarms

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Pure evaluation
- **Detail**: The view keeps showing a forecast with `isOtherMonth` (relabelled, not withheld); the plan counts every `kind === "forecast"` as evaluable, so a month change could alarm on the previous month's figure. The plan does not decide this.
- **Fix**: Treat `isOtherMonth` as "cannot evaluate" (skip, keep state, show reason).
  - Strength: Consistent with the unknown-keeps-state decision; no wrong-month alarm.
  - Tradeoff: A genuine overrun is unseen until the new month's forecast is available.
  - Confidence: MED — month-boundary behaviour of the lab forecast not observed.
  - Blind spot: How long `isOtherMonth` lasts around a month change.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F3 — The live-state "future skew" rule does not exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Pure evaluation
- **Detail**: The plan says live_stale reuses the existing future-skew constant and `toLiveStateView`. Only the forecast has such a constant (`FORECAST_FUTURE_SKEW_MS`, `bill-forecast.ts:20`); `live-state.ts` treats a future `captured_at` as age 0, and the rule only needs `now - captured_at`.
- **Fix**: Specify live_stale as a direct `captured_at` comparison; define the future-skew rule as new, with its own constant of the same 5-minute value; drop the `toLiveStateView` mention.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F4 — The snapshot function reads security_invoker views as definer

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — alerts_snapshot
- **Detail**: No existing SECURITY DEFINER function reads `live_state` / `bill_forecast`; all touch base tables. Behaviour under a definer owner was not verified.
- **Fix**: Select from `public.ingest_pushes` with the views' filters (`source='homelab'`, newest by `captured_at`, `payload ? 'bill_forecast'`) and return rows in the loaders' shape so the existing mappers apply.
  - Strength: Follows the established definer pattern; no view-semantics surprise.
  - Tradeoff: The view filters are repeated in one function.
  - Confidence: HIGH — every existing definer function reads base tables.
  - Blind spot: View definitions may change later and drift from the copy.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F5 — The local-stack assumptions do not hold

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 step 1.1; Phase 3 integration tests
- **Detail**: Step 1.1 uses `npx supabase db reset`, but the integration suite assumes the database is never reset (`tests/integration/support/keys.ts:13-14`) and Docker runs on the UGREEN (`scripts/remote-docker.sh`). `seed.sql` runs only on reset or first start, so on an existing stack the seed alerts token is absent and the Phase 3 integration test would fail.
- **Fix**: Apply with `scripts/remote-docker.sh exec npx supabase migration up`; integration tests insert their own alerts token via `insertAlertToken`; the seed row is kept only for the fresh CI stack and smoke.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F6 — The live_stale minimum of 5 minutes is below what can be measured

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — migration checks; Phase 2 — zod bounds
- **Detail**: The lab pushes every 5 minutes, the evaluator runs every 10 (GitHub cron adds jitter) and the app's stale line is 15 minutes, so a 5-minute rule would flap.
- **Fix**: Set the DB check, shared constant and zod to 15-1440 minutes (matches `LIVE_STALE_AFTER_MS`).
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F7 — The schedule can go live before the production steps

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — Scheduled workflow
- **Detail**: Merging the workflow starts a scheduled run every 10 minutes; until the migration, deploy, token, secrets and variable exist, every run fails red. Repository-level secrets have precedent (`CLAUDE_CODE_OAUTH_TOKEN`).
- **Fix**: Gate the job with `if: vars.ALERTS_ENABLED == 'true'` and set that variable as the last production step, after step 4.5.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F8 — Wrong references and missing files in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phases 2, 3 and 4
- **Detail**: `CHANGELOG.md` does not exist. `assertAnonKey` is private to `src/lib/supabase.ts:6` (routes only need `createAnonClient()`). A second token path breaks existing exact-set assertions in `src/middleware.test.ts` (~:229-:261) and `src/lib/route-guards.test.ts` (`toEqual(["/api/ingest"])` at :147). The `current` union in `DashboardHeader.astro` and `AppShell.astro` must gain `alerts`. `AGENTS.md` is a symlink to `CLAUDE.md`.
- **Fix**: Drop CHANGELOG.md, fix the citation, list the test and component edits (guard-test edits in Phase 3), and note the single CLAUDE.md edit.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F9 — A disabled or edited rule keeps its old state

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — migration
- **Detail**: Disabling a rule in `alarm` and re-enabling it later sends a reminder instead of an alarm, and no recovery; a threshold change has the same problem.
- **Fix**: A BEFORE UPDATE trigger resets `state='ok'` and clears `unevaluable_reason` when `enabled` or `threshold` changes.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F10 — Stryker only mutates files on an explicit list

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Tests
- **Detail**: `stryker.config.mjs` has no `src/lib/services/*.ts` glob, so the new pure files would not be mutated.
- **Fix**: Add `alert-evaluation.ts` and the parse code in `alert-rules.ts` to the `mutate` list; keep `telegram.ts` out.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

## Triage summary

- Fixed: F1-F10 (10)
- Skipped / Accepted / Dismissed: none
- Verdict after fixes: REVISE -> SOUND
- Note: Progress rows 1.1, 4.1 and 4.5 were reworded together with their Success Criteria bullets (nothing had been executed yet), so the one-to-one mapping holds (25 steps).
