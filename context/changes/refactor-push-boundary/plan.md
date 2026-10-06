# Push boundary refactor Implementation Plan

## Overview

Restructure the push (ingest) boundary so its rules are stated once per layer and proven by tests, and close the one undocumented exposure on it: an anonymous caller currently gets contract-validation details before any token check. Phases 1 to 3 change no observable behaviour. Phase 4 is the only behaviour change.

This is the refactoring plan for ranked candidate #1 in `context/domain/domain-distillation.md` (R-02, R-03, R-09, B-05). The five pinned KNOWN GAP behaviours stay exactly as they are.

## Current State Analysis

The rules for what the app accepts from the lab live in three layers:

- The zod contract, `src/lib/ingest/contract.ts` (`ingestPayloadV1`, bounds, capture window).
- The service pipeline, `src/lib/services/ingest.ts:49-84`: bearer-header presence, Content-Length, streamed read up to 256 KiB, JSON parse, `validateIngestPayload`, then one RPC.
- The SQL function `public.ingest_push`, redefined in five migrations; the latest body is `supabase/migrations/20261001113911_period_summaries_keep_narration.sql:13-145`. Earlier bodies: `20260923101001_push_ingestion.sql`, `20260925151509_daily_forecast.sql`, `20260930081229_hourly_energy.sql`, `20261001094118_period_summaries.sql`.

The database trusts its input: no range checks on kWh or `samples`, no whole-hour check on `hour_start`, no bound on `built_at` (`20261001113911_period_summaries_keep_narration.sql:9-10`: "the ingest token is the trust boundary"). The token itself is checked only inside the RPC, after the body has been read and validated (`src/lib/services/ingest.ts:50-71`), so any caller who sends some `Authorization: Bearer x` header receives 413, 400 and 422 answers with the failing field path.

Duplicated constants: raw-push retention (14 days) and hourly retention (35 days) are SQL literals (`...keep_narration.sql:140-141`); TypeScript mirrors the hourly one as `HOURLY_HISTORY_DAYS = 35` in `src/lib/services/hourly-usage.ts:18` and the 14 days only as a capture-age limit, `MAX_CAPTURE_AGE_MS`, `src/lib/ingest/contract.ts:9`. The 256 KiB cap exists only in TypeScript (`src/lib/services/ingest.ts:3`) and the docs.

### Key Discoveries:

- The only non-test callers of the boundary are `src/pages/api/ingest.ts:24-31` (calls `handleIngest` with `supabase.rpc("ingest_push", ...)`) and `tests/integration/support/push.ts:21-31`; `scripts/push-fixture.mjs:280` and `scripts/smoke.mjs:476` go over HTTP.
- `IngestDeps` has only `rpc`, `now`, `logError` (`src/lib/services/ingest.ts:10-14`); the unit tests build it in one helper, `src/lib/services/ingest.test.ts:10-14`.
- Five KNOWN GAP tests in `tests/integration/history-safety.test.ts` (titles at lines 369, 385, 404, 433, 466) pin lower or null totals replacing stored ones, fewer hourly samples replacing a fuller hour, a far-future `built_at` locking a row, and a second recommendation text being dropped with a 201. They must keep passing through every phase.
- No test sends a bad token with a bad body, and none sends an out-of-contract payload straight to the RPC (`tests/integration/support/push.ts:14` validates before sending).
- The integration database is never reset between runs and is shared with other tests (`tests/integration/support/keys.ts:13`), so a snapshot of whole tables would be unstable; tests must work on keys they own (`freshDays`, `freshWindowHours`, `emptySummaryDay`, `nextCapturedAt`).
- The grants test `tests/integration/access-abuse.test.ts:427` proves a signed-in owner cannot call `ingest_push`; helpers added in Phase 2 must pass the same kind of check.
- Migrations reach production by hand through the Supabase connector (`context/deployment/micrus-runbook.md:92`, `:129`); nothing in CI applies them. Rollback is re-running an older `ingest_push` body (`micrus-runbook.md:129-140`).
- The API exposes `public` and `graphql_public` only (`supabase/config.toml:13`), so a helper schema named `ingest` is not callable through the API locally; the production API schema list is set in a dashboard and is `unknown`, so helpers also revoke execute from every role.
- The contract is deliberately permissive for some bill-forecast fields so that one bad field cannot 422 the whole push (`src/lib/ingest/contract.ts:100-106`); nothing in this plan tightens it.

## Desired End State

- One thin `public.ingest_push(p_token text, p_payload jsonb)` that calls one named helper per section in a non-exposed `ingest` schema; each section's rule appears once in SQL.
- Retention windows are named constants in SQL, and an integration test fails if they drift from the TypeScript constants.
- `handleIngest` is a short pipeline of named stages; the same-order behaviour is unchanged until Phase 4, then the token is checked first.
- An anonymous caller with an unknown or revoked token receives `401 {"error":"unauthorized"}` whatever the body holds; a valid token with a bad body still gets 400 or 422.
- A golden replay integration test pins the real behaviour of every section, including the five KNOWN GAP behaviours, and stays green through each phase.
- Docs say what is true: `docs/ingest/README.md`, `docs/decisions.md`, `docs/architecture.md`, `docs/prerequisites.md`.

Verify the whole plan with: `npm test`, `npm run lint`, `npx astro check`, `npm run build`, `npm run test:integration` and `npm run smoke`. The CI `integration` and `smoke` jobs are the authoritative run of the last two, on a draft PR: they start a fresh stack that applies every migration. Running them locally needs the relay, the remote-docker wrapper (`scripts/remote-docker.sh exec ...`) and the owner's explicit OK to apply a migration to the shared stack (`docs/prerequisites.md:25`).

## What We're NOT Doing

- Not changing the contract shape, its JSON Schema (`docs/ingest/contract-v1.schema.json`) or `INGEST_CONTRACT_VERSION`; the lab sees no new field.
- Not fixing the five KNOWN GAP behaviours; the tests that pin them stay as written.
- Not adding database guards for a direct RPC call (decision: scope excludes SQL guards); the direct-RPC bypass with a valid token stays accepted and documented. This leaves the first half of the domain distillation's #1 done-when ("a direct RPC with an out-of-contract payload is refused in the database") open as a recorded follow-up; this plan closes only the second half ("a request without a valid token gets one answer whatever its body").
- Not adding rate limiting or any proxy control.
- Not editing earlier migrations; the new migrations restate or add, they never rewrite history.
- Not automating production migrations; applying them stays a manual step.
- Not touching the lab (homelab-2), day notes, sign-in or any card.

## Implementation Approach

Prove first, then change. Phase 1 adds the safety net against the unchanged code. Phase 2 restructures the SQL, Phase 3 the TypeScript, each green against the Phase 1 net with no test edited. Phase 4 then makes the single behaviour change, adding one tiny SQL function and reordering the service, and flips exactly one Phase 1 characterization test. Phase 5 aligns the docs.

SQL helpers live in an `ingest` schema that the API does not expose, are owned by the migration role, and have execute revoked from every client role; `public.ingest_push` stays `security definer` with `set search_path = ''` and calls them by fully qualified name. Keeping the `(text, jsonb)` signature means grants, the P0401 and P0409 error codes and the old bodies (for rollback) stay valid.

## Critical Implementation Details

- **Deploy order for Phase 4:** the new app calls `ingest_token_ok`, so its migration must be applied in production before the app deploys. A new app on an old database makes every push fail with 500, which the lab retries (`docs/ingest/README.md:52`), and the live card turns stale after 15 minutes. An old app on a new database is harmless.
- **Token check is an unmetered validity check:** `ingest_token_ok` is callable by anon, returns a boolean and has no rate limit (Q-05 of the domain distillation is unanswered). It is safe because tokens are minted by `scripts/create-ingest-token.mjs` as 32 random bytes (`:12`); a token of lower entropy would make it a guessing oracle.
- **Golden replay determinism:** the shared database is never reset, so the test owns its keys, reads back only those rows, and compares values with ids, `received_at`, `updated_at` and absolute timestamps left out.

## Phase 1: Safety net (tests only)

### Overview

Pin today's behaviour of the whole boundary before touching it. Pure addition of tests; no source, SQL or doc changes.

### Changes Required:

#### 1. Golden replay test

**File**: `tests/integration/ingest-golden.test.ts`

**Intent**: Replay a fixed, scripted sequence of pushes through the real `handleIngest` and the real `ingest_push`, then assert the final stored rows for the keys the test owns. The sequence covers every section and every pinned rule: a first push, an identical duplicate, a same-time conflict, a newer push with a lower and then a null daily total, a newer hourly push with fewer samples, an older late push, an omitted `pv_forecast_kwh`, a summary with a newer then older `built_at`, a narration-less summary after a narrated one, a far-future `built_at`, and a repeated recommendation `generated_at`.

**Contract**: Uses only owned keys from `tests/integration/support/keys.ts` (`freshDays`, `freshWindowHours`, `emptySummaryDay`, `nextCapturedAt`, `olderCapturedAt`) and reads rows back through the owner client, selecting only columns the owner may read. Expected values are written down as literals, derived from the current behaviour described in `docs/logic.md:96,118,222,284` and the five KNOWN GAP tests; no whole-table snapshot.

#### 2. Characterization tests for the two untested interactions

**File**: `tests/integration/ingest-boundary.test.ts`

**Intent**: Pin what happens today when a request carries an unknown token and an invalid body (answer is 422, not 401), and when an out-of-contract payload is sent straight to the RPC with a valid token (it is stored). Name the first so Phase 4 can flip it; name the second `KNOWN GAP` like its neighbours.

**Contract**: Uses `push.ts`-style handler wiring but with a deliberately invalid body (so it cannot use the validating `push()` helper) and `anonClient().rpc("ingest_push", ...)` for the direct call, following `tests/integration/access-abuse.test.ts:355-357`. Cleans up what it writes through the privileged helper if it writes a row outside the owned keys.

### Success Criteria:

#### Automated Verification:

- The new tests pass against the unchanged database: `npm run test:integration`
- Unit tests and type checks still pass: `npm test && npx astro check`
- Lint and format pass on the new files: `npm run lint && npx prettier --check tests/integration`

#### Manual Verification:

- Breaking one pinned behaviour on purpose on a throwaway branch (for example removing `where public.daily_energy.captured_at <= excluded.captured_at`) turns the CI `integration` job red, and reverting it turns it green again.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Restructure ingest_push (pure refactor, SQL)

### Overview

A new migration splits the function body into one helper per section, in a schema the API does not expose, and leaves a thin `public.ingest_push` on top. Behaviour is identical; the Phase 1 net proves it.

### Changes Required:

#### 1. Helper schema and functions

**File**: `supabase/migrations/<timestamp>_ingest_push_sections.sql`

**Intent**: Create the `ingest` schema and one helper per section, moving each upsert and prune from the latest body without changing it. Name the retention windows once, as constants at the top of the prune helper.

**Contract**: Helpers: `ingest.store_daily`, `ingest.store_hourly`, `ingest.store_period_summaries`, `ingest.store_recommendation` each taking `(p_payload jsonb, p_captured_at timestamptz, p_push_id bigint)` and returning void, and `ingest.prune()` returning void. All `set search_path = ''` with fully qualified names. `revoke all on schema ingest from public, anon, authenticated` and `revoke all on function ... from public, anon, authenticated` for every helper. The SQL is the latest body split verbatim, including the `captured_at <=` and `built_at <=` guards, the `coalesce` on `pv_forecast_kwh`, the narration guard and `on conflict (generated_at) do nothing`.

#### 2. Thin public function

**File**: same migration

**Intent**: Replace `public.ingest_push` with a body that keeps the token check, the dedupe and the conflict and duplicate answers, then calls the helpers in the same order as today.

**Contract**: Same signature `(p_token text, p_payload jsonb) returns jsonb`, `security definer`, `set search_path = ''`, same error codes (`P0401`, `P0409`) and the same `{"status":"created"|"duplicate"}` results. Restate `revoke all ... from public, anon, authenticated` and `grant execute ... to anon`. Keep the "unchanged from" chain comment convention.

#### 3. Retention constants module

**File**: `src/lib/ingest/retention.ts`

**Intent**: Give the two retention windows one TypeScript home that both the parity test and, in Phase 3, the contract and the hourly loader import, so no read-side service has to import the zod contract.

**Contract**: Exports `RAW_PUSH_RETENTION_DAYS = 14` and `HOURLY_RETENTION_DAYS = 35`; no other content, no imports.

#### 4. Retention parity test

**File**: `tests/integration/ingest-retention.test.ts`

**Intent**: Fail if the SQL retention windows drift from the TypeScript constants. A direct-RPC push is stored and then pruned by the same call, so no second push is needed: push one raw push at `now - RAW_PUSH_RETENTION_DAYS - 5 minutes` and one at `now - RAW_PUSH_RETENTION_DAYS + 5 minutes`, then read back and assert the first is absent and the second present; do the same for hourly rows at `HOURLY_RETENTION_DAYS` minus and plus 5 minutes.

**Contract**: Imports the constants from `src/lib/ingest/retention.ts`. The 5-minute margin keeps the check off the `now()` boundary. Uses unique keys, reads raw pushes through the owner client (`ingest_pushes.captured_at` is a granted column), and cleans up through the privileged helper.

#### 5. Helpers are unreachable from the API

**File**: `tests/integration/access-abuse.test.ts`

**Intent**: Add a test beside the existing grants test (`:427`) proving, at the privilege layer, that no client role can execute any `ingest` helper and that `public.ingest_push` is executable by anon only. A probe through the API would only prove the schema is not exposed (`supabase/config.toml:13`), not that the revoke worked, and the production API schema list is unknown.

**Contract**: Uses the privileged helper (`tests/integration/support/privileged.ts`, `withPrivileged`) and `has_function_privilege`: false for `anon`, `authenticated` and `public` on every helper in schema `ingest`; true for `anon` and false for `authenticated` on `public.ingest_push`. Keep the existing API call to `ingest_push` as the secondary check.

### Success Criteria:

#### Automated Verification:

- The migration applies on a fresh stack in the CI `integration` job (a local apply needs the relay, the `scripts/remote-docker.sh exec` wrapper and the owner's OK)
- Golden replay, boundary and every existing integration test pass unchanged: `npm run test:integration`
- Retention parity test passes: `npx vitest run --config vitest.integration.config.ts tests/integration/ingest-retention.test.ts`
- A test using `has_function_privilege` proves no client role can execute any `ingest` helper and `ingest_push` stays anon-only: `npx vitest run --config vitest.integration.config.ts tests/integration/access-abuse.test.ts`
- Unit tests, lint and type check pass: `npm test && npm run lint && npx astro check`

#### Manual Verification:

- Production's current `ingest_push` body matches the repo's latest (`20261001113911_period_summaries_keep_narration.sql`), checked through the Supabase connector before the migration is applied.
- The migration is applied in production through the Supabase connector and confirmed in `list_migrations`; the lab's next push still returns 201.
- The rollback is understood: re-running the previous body (migration `20261001113911`) restores the old function and the helper schema can stay unused.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Restructure the service (pure refactor, TypeScript)

### Overview

Make `handleIngest` a short pipeline of named stages in exactly today's order, and give the retention windows one named home in TypeScript. No observable change.

### Changes Required:

#### 1. Named pipeline stages

**File**: `src/lib/services/ingest.ts`

**Intent**: Split `handleIngest` into small functions for the existing steps (read bearer token, read the body within the limit, parse JSON, validate, store and map the RPC result) so each step reads as one decision, keeping the same order and the same responses.

**Contract**: `handleIngest(request, deps): Promise<IngestResponse>` and the exported `MAX_INGEST_BODY_BYTES`, `IngestDeps`, `IngestResponse`, `IngestRpcResult` keep their shape. The 401 body stays one shared constant. The order stays header, Content-Length, streamed read, JSON parse, validate, RPC. `src/lib/services/ingest.test.ts` passes unmodified.

#### 2. Use the shared retention constants

**File**: `src/lib/ingest/contract.ts`, `src/lib/services/hourly-usage.ts`

**Intent**: Derive `MAX_CAPTURE_AGE_MS` and its error message from `RAW_PUSH_RETENTION_DAYS` (a capture older than the retention window would be stored and pruned in the same call), and make `src/lib/services/hourly-usage.ts:18` import `HOURLY_RETENTION_DAYS` instead of its own literal.

**Contract**: Both files import from `src/lib/ingest/retention.ts` (created in Phase 2); no service imports the zod contract. The exported JSON Schema does not change (no bound is added to a schema field), which `npm run contract:export` must confirm.

### Success Criteria:

#### Automated Verification:

- Unit tests pass without edits to `ingest.test.ts` or `contract.test.ts`: `npm test`
- The committed JSON Schema is unchanged: `npm run contract:export && git diff --exit-code docs/ingest/contract-v1.schema.json`
- The integration suite, including the golden replay and retention parity tests, passes: `npm run test:integration`
- Type check, lint and build pass: `npx astro check && npm run lint && npm run build`

#### Manual Verification:

- Reading the diff confirms the stage order is unchanged: header, Content-Length, streamed read, JSON parse, validate, RPC.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Token before body (behaviour change)

### Overview

The only behaviour change. Check the token with a cheap RPC right after the header check, before the size read and validation, so an anonymous caller with a bad token gets 401 whatever the body holds.

### Changes Required:

#### 1. Token-check function

**File**: `supabase/migrations/<timestamp>_ingest_token_ok.sql`

**Intent**: Add a small SQL function that answers whether a token is live, using the same hash and revoke rules as `ingest_push`.

**Contract**: `public.ingest_token_ok(p_token text) returns boolean`, `security definer`, `set search_path = ''`, true only for a token whose SHA-256 matches an `ingest_tokens` row with `revoked_at is null`. `revoke all ... from public, anon, authenticated; grant execute ... to anon`. It returns only a boolean, never a reason.

#### 2. Service reorder

**File**: `src/lib/services/ingest.ts`

**Intent**: Add a `tokenOk` dependency and call it first. A missing or malformed header stays a 401 with no call; a false answer is a 401 before the body is read; an error from the check is logged and answered with the existing generic 500.

**Contract**: `IngestDeps` gains `tokenOk: (token: string) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>`. New order: bearer header, token check, Content-Length, streamed read, JSON parse, validate, RPC. The RPC still maps `P0401` to the same 401 body, for a token revoked between the two calls. All other statuses and bodies are unchanged.

#### 3. Route and test wiring

**File**: `src/pages/api/ingest.ts`, `tests/integration/support/push.ts`, `src/lib/services/ingest.test.ts`

**Intent**: Pass `tokenOk` from the Supabase anon client in the route and in the integration helper; extend the unit-test dependency helper and add cases for the new order.

**Contract**: Route: `tokenOk: (token) => supabase.rpc("ingest_token_ok", { p_token: token })`. Unit cases: no header makes no call; a bad token with a bad body is 401 and neither `rpc` nor the body parser runs; a good token with a bad body is 422; a token-check error is 500 and logged.

#### 4. Integration proof and the flipped test

**File**: `tests/integration/ingest-boundary.test.ts`

**Intent**: Flip the Phase 1 characterization test "unknown token with an invalid body is 422" to "is 401", add the valid-token-with-bad-body case (422) and prove `ingest_token_ok` returns only a boolean to anon.

**Contract**: The direct-RPC out-of-contract test (KNOWN GAP) stays unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests cover the new order: `npm test`
- Integration tests prove bad token plus bad body is 401, good token plus bad body is 422, and a normal push is still 201: `npm run test:integration`
- `ingest_token_ok` is executable by anon and returns only a boolean, tested in `tests/integration/access-abuse.test.ts`: `npx vitest run --config vitest.integration.config.ts tests/integration/access-abuse.test.ts`
- The smoke test passes against a built server: `npm run smoke` (the `smoke` CI job)
- The committed JSON Schema is unchanged: `npm run contract:export && git diff --exit-code docs/ingest/contract-v1.schema.json`
- Type check, lint and build pass: `npx astro check && npm run lint && npm run build`

#### Manual Verification:

- The flipped test is renamed to describe the new behaviour and the diff shows no other Phase 1 test edited.
- In production the migration is applied through the Supabase connector before the app is deployed; after the deploy the lab's next push returns 201.
- Locally, `scripts/push-fixture.mjs` with a wrong token and a deliberately invalid body prints 401.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 5: Docs and close-out

### Overview

Make the documents match the code, as `context/foundation/lessons.md` requires.

### Changes Required:

#### 1. Ingest handoff

**File**: `docs/ingest/README.md`

**Intent**: State the new check order (header, token, size, JSON, schema, store), that a bad token always gets 401, and that the direct-RPC bypass with a valid token remains accepted (the statement at line 60 stays true and is reworded only where the order changed).

**Contract**: The status table at lines 44-54 is unchanged except the 401 row, which now says the token is checked before the body.

#### 2. Decisions

**File**: `docs/decisions.md`

**Intent**: Add a dated entry (newest first) for the token-order change, the helper schema and the parity tests, with the reasons and the rejected options (no SQL guards, no limits table). Record that `ingest_token_ok` relies on 32-byte random tokens, and record the open follow-up: a direct RPC with an out-of-contract payload is still stored.

**Contract**: One dated section at the top, in the file's existing style.

#### 3. Architecture and prerequisites

**File**: `docs/architecture.md`, `docs/prerequisites.md`

**Intent**: Architecture: the data flow and security model name the two public functions and the non-exposed helper schema. Prerequisites: list the two new migrations as production steps with their order (token-check migration before the app deploy), and fix the stale migration count (`docs/prerequisites.md:20` says "all 12 migrations"; it becomes 14). Test plan: the description of the `push()` support helper now includes the token check.

**Contract**: Edits stay inside the existing ingest and migration sections (`docs/architecture.md:41,60`, `docs/prerequisites.md:20,86`, `context/foundation/test-plan.md:164`).

### Success Criteria:

#### Automated Verification:

- Formatting and lint pass: `npx prettier --check docs context CLAUDE.md && npm run lint`
- The new function and order are documented: `command grep -n "ingest_token_ok" docs/ingest/README.md docs/decisions.md docs/prerequisites.md` returns a match in each file
- Unit tests still pass: `npm test`
- The stale migration count is gone: `command grep -n "all 12 migrations" docs/prerequisites.md` returns nothing

#### Manual Verification:

- The owner reads the ingest section of `docs/ingest/README.md` and confirms the order and statuses match the code.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `src/lib/services/ingest.test.ts` stays green untouched through Phases 1 to 3; Phase 4 extends its dependency helper and adds the new-order cases.
- `src/lib/ingest/contract.test.ts` stays untouched; the JSON Schema guard proves the contract did not move.

### Integration Tests:

- Golden replay (`tests/integration/ingest-golden.test.ts`): final stored rows after a scripted sequence, including the five pinned KNOWN GAP behaviours.
- Boundary tests (`tests/integration/ingest-boundary.test.ts`): bad token with bad body, valid token with bad body, direct out-of-contract RPC.
- Retention parity (`tests/integration/ingest-retention.test.ts`): SQL windows agree with the TypeScript constants.
- Grants (`tests/integration/access-abuse.test.ts`): helpers unreachable from the API, `ingest_push` anon-only, `ingest_token_ok` boolean only.

### Manual Testing Steps:

1. Break one pinned behaviour locally and confirm the golden test goes red, then revert.
2. Run `scripts/push-fixture.mjs` with a wrong token and an invalid body and see 401.
3. After each production migration, confirm the lab's next push returns 201.

## Performance Considerations

Phase 4 adds one indexed token lookup per push (the lab pushes every 5 minutes) and removes the body read for unauthenticated callers, which bounds anonymous cost. Phase 2 adds function-call overhead inside one transaction, which is negligible at this volume.

## Migration Notes

Two migrations, each applied in production by hand through the Supabase connector and renamed in the repo to the version production recorded (`context/deployment/micrus-runbook.md:129`). Phase 2's migration is safe at any time relative to an app deploy because the signature does not change. Phase 4's migration must precede the app deploy. Rollback of Phase 2 is re-running the previous `ingest_push` body; rollback of Phase 4 is deploying the previous app version, which does not call the new function.

## References

- Domain distillation: `context/domain/domain-distillation.md` (R-02, R-03, R-09, B-05, ranking #1)
- Repo map: `context/map/repo-map.md` (risk zone 1)
- Glossary: `context/domain/glossary.md`
- Latest function body: `supabase/migrations/20261001113911_period_summaries_keep_narration.sql:13-145`
- Pinned gaps: `tests/integration/history-safety.test.ts:369,385,404,433,466`; `docs/decisions.md:33-38`
- Production migration procedure: `context/deployment/micrus-runbook.md:92,129-140`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Safety net (tests only)

#### Automated

- [x] 1.1 The new tests pass against the unchanged database: `npm run test:integration` — 566ea8b
- [x] 1.2 Unit tests and type checks still pass: `npm test && npx astro check` — 566ea8b
- [x] 1.3 Lint and format pass on the new files: `npm run lint && npx prettier --check tests/integration` — 566ea8b

#### Manual

- [x] 1.4 Breaking one pinned behaviour on purpose on a throwaway branch turns the CI `integration` job red, and reverting it turns it green again — owner confirmed 2026-10-06; CI run 37444338550 on break PR #133: `integration` red on exactly 2 of 62 tests (history-safety "an older daily push cannot replace a newer one" and the golden replay)

### Phase 2: Restructure ingest_push (pure refactor, SQL)

#### Automated

- [x] 2.1 The migration applies on a fresh stack in the CI `integration` job (a local apply needs the relay, the `scripts/remote-docker.sh exec` wrapper and the owner's OK) — c64d4d1
- [x] 2.2 Golden replay, boundary and every existing integration test pass unchanged: `npm run test:integration` — c64d4d1
- [x] 2.3 Retention parity test passes: `npx vitest run --config vitest.integration.config.ts tests/integration/ingest-retention.test.ts` — c64d4d1
- [x] 2.4 A test using `has_function_privilege` proves no client role can execute any `ingest` helper and `ingest_push` stays anon-only: `npx vitest run --config vitest.integration.config.ts tests/integration/access-abuse.test.ts` — c64d4d1
- [x] 2.5 Unit tests, lint and type check pass: `npm test && npm run lint && npx astro check` — c64d4d1

#### Manual

- [x] 2.6 Production's current `ingest_push` body matches the repo's latest, checked through the Supabase connector before the migration is applied — owner confirmed 2026-10-06; read-only check through the Supabase connector: production ingest_push body identical to 20261001113911 (126 of 126 lines), 12 migrations recorded with the repo's versions, neither new migration applied yet
- [x] 2.7 The migration is applied in production through the Supabase connector and confirmed in `list_migrations`; the lab's next push still returns 201 — owner applied both migrations with the Supabase CLI (db push) on 2026-10-06; verified read-only through the connector: 14 migrations recorded with the repo's versions, ingest schema and 5 helpers not executable by anon, authenticated or PUBLIC, ingest_push thin and anon-only; pushes 3033 to 3037 (newest 10:25:57 UTC) were stored after the replacement (transaction ids above 6291) and wrote 27 daily, 48 hourly and 10 summary rows, so the lab's pushes still succeed
- [x] 2.8 The rollback is understood: re-running the previous body restores the old function and the helper schema can stay unused — owner confirmed 2026-10-06; rollback understood (re-run the 20261001113911 body through the connector; the ingest helper schema can stay unused)

### Phase 3: Restructure the service (pure refactor, TypeScript)

#### Automated

- [x] 3.1 Unit tests pass without edits to `ingest.test.ts` or `contract.test.ts`: `npm test` — 177f010
- [x] 3.2 The committed JSON Schema is unchanged: `npm run contract:export && git diff --exit-code docs/ingest/contract-v1.schema.json` — 177f010
- [x] 3.3 The integration suite, including the golden replay and retention parity tests, passes: `npm run test:integration` — 177f010
- [x] 3.4 Type check, lint and build pass: `npx astro check && npm run lint && npm run build` — 177f010

#### Manual

- [x] 3.5 Reading the diff confirms the stage order is unchanged: header, Content-Length, streamed read, JSON parse, validate, RPC — owner confirmed 2026-10-06; Phase 3 diff keeps the order header, Content-Length, streamed read, JSON parse, validate, RPC

### Phase 4: Token before body (behaviour change)

#### Automated

- [x] 4.1 Unit tests cover the new order: `npm test` — 14ee144
- [x] 4.2 Integration tests prove bad token plus bad body is 401, good token plus bad body is 422, and a normal push is still 201: `npm run test:integration` — 14ee144
- [x] 4.3 `ingest_token_ok` is executable by anon and returns only a boolean: `npx vitest run --config vitest.integration.config.ts tests/integration/access-abuse.test.ts` — 14ee144
- [x] 4.4 The smoke test passes against a built server: `npm run smoke` (the `smoke` CI job) — 14ee144
- [x] 4.5 The committed JSON Schema is unchanged: `npm run contract:export && git diff --exit-code docs/ingest/contract-v1.schema.json` — 14ee144
- [x] 4.6 Type check, lint and build pass: `npx astro check && npm run lint && npm run build` — 14ee144

#### Manual

- [x] 4.7 The flipped test is renamed to describe the new behaviour and the diff shows no other Phase 1 test edited — owner confirmed 2026-10-06; the only Phase 1 test edited since is tests/integration/ingest-boundary.test.ts (flipped and renamed test, call wiring, comments), the golden test is untouched
- [x] 4.8 In production the migration is applied before the app is deployed; after the deploy the lab's next push returns 201 — owner approved the deploy and I dispatched it on 2026-10-06 (workflow run 37450011236, sha 11fc526, completed/success at 10:30 UTC); both migrations were applied first (14 recorded); /api/health reports 11fc526168c24044003d781c77800c50e9d3815d; the first lab push after the new app, id 3038 received 10:31:12 UTC with daily, hourly, summary and recommendation sections, was stored (201)
- [x] 4.9 Locally, `scripts/push-fixture.mjs` with a wrong token and an invalid body prints 401 — WAIVED by owner 2026-10-06, not run locally; the behaviour is proven in CI by the flipped integration test "an unknown token with an invalid body answers 401: the token is checked before the body" and by the unit cases for a rejected token with a non-JSON body, a contract-breaking body and an oversized Content-Length

### Phase 5: Docs and close-out

#### Automated

- [x] 5.1 Formatting and lint pass: `npx prettier --check docs context CLAUDE.md && npm run lint` — 5196ac4
- [x] 5.2 The new function and order are documented: `command grep -n "ingest_token_ok" docs/ingest/README.md docs/decisions.md docs/prerequisites.md` returns a match in each file — 5196ac4
- [x] 5.3 Unit tests still pass: `npm test` — 5196ac4
- [x] 5.5 The stale migration count is gone: `command grep -n "all 12 migrations" docs/prerequisites.md` returns nothing — 5196ac4

#### Manual

- [x] 5.4 The owner reads the ingest section of `docs/ingest/README.md` and confirms the order and statuses match the code — owner confirmed 2026-10-06; ingest section of docs/ingest/README.md read against the code

Note (2026-10-06): row 5.1 runs `npx prettier --check docs context CLAUDE.md`, which also fails on two archived HTML design files (`context/archive/2026-09-29-dashboard-refresh-icons-sparklines/design/Main.dc.html` and `Mobile.dc.html`). They were already failing before this change and this change does not touch them (archives are read-only by convention), so 5.1 was judged on every other file, which passes, together with `npm run lint`.
