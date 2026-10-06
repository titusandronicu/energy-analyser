<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Push boundary refactor Implementation Plan

- **Plan**: context/changes/refactor-push-boundary/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: REVISE (SOUND after the seven fixes below)
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

16/16 paths exist, 5/5 symbols found (`HOURLY_HISTORY_DAYS = 35` at `src/lib/services/hourly-usage.ts:18`, `MAX_CAPTURE_AGE_MS` at `src/lib/ingest/contract.ts:9`, `IngestDeps` at `src/lib/services/ingest.ts:10-14`, five KNOWN GAP tests in `tests/integration/history-safety.test.ts`), brief and plan agree, Progress maps one-to-one onto each phase's Success Criteria (4, 8, 5, 9, 4 rows). No `docs/reference/contract-surfaces.md` exists, so that check was skipped.

## Findings

### F1 — Verification commands are not runnable as written

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 criterion 2.1; every `npm run test:integration` row in Phases 1-4
- **Detail**: `npx supabase migration up` appears nowhere in the repo or in dev-hub. The Supabase CLI needs the remote Docker host, so on the Mac it needs `scripts/remote-docker.sh relay-start` and the `exec` wrapper (`/Users/kamilnowosad/code/dev-hub/CLAUDE.md:14`; the only wrapped form the docs quote is `exec npx supabase status -o env`, `docs/prerequisites.md:24`). `docs/prerequisites.md:25` says applying new migrations to the stack "needs the owner's explicit OK". So the plan's safety net (the integration suite) cannot be run locally by an implementer without that OK, and the pre-flight gate would report the command not runnable. CI does apply all migrations on a fresh stack (`.github/actions/local-supabase/action.yml`).
- **Fix A ⭐ Recommended**: Make the CI `integration` and `smoke` jobs the authoritative run and say so
  - Strength: Matches how earlier phases were proven here, needs no change to the shared stack, and removes the owner gate from each phase.
  - Tradeoff: Feedback comes from a pushed draft PR instead of a local run; step 1.4's deliberate break is also proven in CI.
  - Confidence: HIGH — the same CI-first route verified the earlier test phases.
  - Blind spot: Wall-clock time per CI round trip is unmeasured.
- **Fix B**: Keep local commands, use the wrapped form, and add a manual gate for the owner's OK before each migration is applied to the stack
  - Strength: Faster local feedback once approved.
  - Tradeoff: Adds an owner gate to Phases 2 and 4 and depends on the relay being up; the exact wrapped command is inferred, not documented.
  - Confidence: MEDIUM — inferred from the wrapper's usage text.
  - Blind spot: Whether `migration up --local` works through the SSH Docker host is unverified.
- **Decision**: FIXED (Fix A)

### F2 — The "helpers are unreachable" test would prove the wrong layer

- **Severity**: WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2, change 4 and criterion 2.4
- **Detail**: The plan probes `client.schema("ingest").rpc(...)`. The `ingest` schema is not in `[api] schemas` (`supabase/config.toml:13`), so the call fails because the schema is not exposed, whatever the function privileges are. No existing test uses `.schema()`. The production API schema list is unknown, so a test that passes locally says nothing about the revoke that the plan relies on.
- **Fix**: Assert privileges directly through the privileged helper (`tests/integration/support/privileged.ts`) with `has_function_privilege`: false for `anon`, `authenticated` and `public` on every helper; `ingest_push` and `ingest_token_ok` executable by `anon` only. Keep an API probe only as a secondary check.
- **Decision**: FIXED

### F3 — The retention parity test sequence is inaccurate

- **Severity**: WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, change 3 (`ingest-retention.test.ts`)
- **Detail**: The plan pushes an old raw push "then a normal push to trigger the prune". In the latest body a direct-RPC push older than 14 days is inserted at line 38 and deleted by the same call at line 140, and an hour older than 35 days is inserted at lines 77-94 and deleted at line 141 (`supabase/migrations/20261001113911_period_summaries_keep_narration.sql`), so the second push is unnecessary and the pruned row is only observable by a later read. The boundary also uses `now()`, so a test at exactly 14 days or 35 days is flaky without a margin. The existing test at `tests/integration/history-safety.test.ts:335-361` observes the hourly prune the same way.
- **Fix**: Rewrite the sequence: one direct-RPC push at `now - 14 days - 5 minutes` and one at `now - 14 days + 5 minutes` (and hourly rows at 35 days minus and plus 5 minutes), assert by reading back that the first is absent and the second present, with unique keys and cleanup.
- **Decision**: FIXED

### F4 — Retention constants create a service-to-contract dependency

- **Severity**: WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3, change 2; Phase 2 change 3
- **Detail**: Phase 3 exports the retention days from `src/lib/ingest/contract.ts` and makes `src/lib/services/hourly-usage.ts` import them. That adds the first edge from a read-side service to the zod contract (the repo map found `ingest` has no importers). `stryker.config.mjs:24` mutates `contract.ts`. The Phase 2 parity test also has to use `MAX_CAPTURE_AGE_MS`, a capture-age limit, until Phase 3 lands, mixing two concepts. Circular imports were not checked.
- **Fix**: Create a tiny `src/lib/ingest/retention.ts` exporting the two day counts in Phase 2 (so the parity test imports it), and in Phase 3 rewire `contract.ts` (deriving `MAX_CAPTURE_AGE_MS`) and `hourly-usage.ts` to it; no service imports the zod contract.
- **Decision**: FIXED

### F5 — The token check adds an unmetered validity oracle that the plan does not name

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4, change 1
- **Detail**: `ingest_token_ok` is callable by anon, returns a boolean and has no rate limit (Q-05 in the domain distillation is unanswered). It is safe only because tokens are 32 random bytes (`scripts/create-ingest-token.mjs:12`); the plan does not state that assumption.
- **Fix**: Add one sentence to Open Risks and to the Phase 5 decisions entry: the check is safe because tokens come from `scripts/create-ingest-token.mjs` (32 random bytes); no other change.
- **Decision**: FIXED

### F6 — Phase 5 misses documents that become stale

- **Severity**: WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5
- **Detail**: `docs/prerequisites.md:20` says "all 12 migrations applied" (becomes 14) and `:25` says new migrations need the owner's explicit OK; `context/foundation/test-plan.md:164` describes `push()` as mirroring the route (`handleIngest` plus `rpc("ingest_push")`), which Phase 4 changes. `context/foundation/lessons.md` requires docs to move with the code.
- **Fix**: Add both files to Phase 5's changes and add an automated row checking `command grep -n "all 12 migrations" docs/prerequisites.md` returns nothing.
- **Decision**: FIXED

### F7 — The plan does not say which half of the ranked #1 done-when it closes

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State; What We're NOT Doing
- **Detail**: The domain distillation's #1 done-when has two halves: a direct RPC with an out-of-contract payload is refused in the database, and a request without a valid token gets one answer whatever its body. The plan closes only the second (SQL guards are excluded by decision), but the plan never says so, so the badge report could read as if both were done.
- **Fix**: Add a line under What We're NOT Doing that the first half stays open as a recorded follow-up, and have the Phase 5 decisions entry record it.
- **Decision**: FIXED
