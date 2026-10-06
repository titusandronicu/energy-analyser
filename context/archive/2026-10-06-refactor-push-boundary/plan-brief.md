# Push boundary refactor — Plan Brief

> Full plan: `context/changes/refactor-push-boundary/plan.md`
> Domain distillation: `context/domain/domain-distillation.md` (ranking #1)
> Repo map: `context/map/repo-map.md` (risk zone 1)

## What & Why

Restructure the push (ingest) boundary, the one place every number enters the app, so its rules are stated once per layer and guarded by tests. Close the one undocumented exposure on it: an anonymous caller gets contract-validation details before any token check. This is the L4 refactoring plan for the ranked #1 candidate in the domain distillation.

## Starting Point

The rules sit in three layers: the zod contract (`src/lib/ingest/contract.ts`), the service pipeline (`src/lib/services/ingest.ts`) and the SQL function `ingest_push`, redefined in five migrations. The database trusts its input, the token is checked only after the body is validated, and the retention windows are copied between SQL and TypeScript. Five KNOWN GAP integration tests pin accepted-but-undesired behaviour.

## Desired End State

A thin `public.ingest_push` calling one helper per section in a non-exposed `ingest` schema; retention windows named once in SQL and once in TypeScript, with a test that fails if they drift; a service made of named stages that checks the token first. A bad token always gets 401 whatever the body holds. A golden replay test pins every section's behaviour, and the docs match.

## Key Decisions Made

| Decision                  | Choice                                                         | Why (1 sentence)                                                                                                              | Source      |
| ------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Scope                     | Refactor plus token order                                      | Closes the only undocumented exposure while the restructure stays provably neutral.                                           | Plan        |
| Limits source of truth    | TypeScript owns payload shape, parity tests guard SQL numbers  | No runtime coupling between layers and drift becomes a red test.                                                              | Plan        |
| Proof of neutrality       | Golden replay test written first                               | Pins the real function including the five KNOWN GAP behaviours with one artefact.                                             | Plan        |
| Token order               | Cheap `ingest_token_ok` RPC before the body is read            | Bounds anonymous cost and ends validation-detail leakage for one indexed lookup per push.                                     | Plan        |
| SQL shape                 | Helpers in a non-exposed `ingest` schema, thin public function | Each rule is stated once and cannot be called from the API; old bodies stay valid for rollback.                               | Plan        |
| SQL guards for direct RPC | Not in this change                                             | Keeps the five pinned gaps and the documented bypass untouched; the first half of the #1 done-when stays open as a follow-up. | Plan        |
| Verification route        | CI `integration` and `smoke` jobs are authoritative            | Local runs need the relay and the owner's OK to apply a migration to the shared stack.                                        | Plan review |

## Scope

**In scope:** golden replay and boundary tests; a new SQL migration with helpers; service stages and shared retention constants; the token-check function and reorder; docs.

**Out of scope:** contract shape or JSON Schema changes; fixing the five KNOWN GAP behaviours; SQL guards on a direct RPC call; rate limiting; automating production migrations; the lab.

## Architecture / Approach

Prove first, then change. Phase 1 adds the safety net against unchanged code. Phases 2 and 3 restructure SQL and TypeScript with no test edited. Phase 4 is the single behaviour change and flips one Phase 1 characterization test. Phase 5 aligns the docs.

## Phases at a Glance

| Phase                  | What it delivers                                              | Key risk                                                                         |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Safety net          | Golden replay and boundary characterization tests             | Shared, never-reset database makes snapshots unstable, so the test owns its keys |
| 2. SQL restructure     | New migration with sectioned helpers, parity and grants tests | A grant slip exposes a helper; production body may differ from the repo          |
| 3. Service restructure | Named pipeline stages and shared retention constants          | Accidentally reordering or changing a response                                   |
| 4. Token before body   | `ingest_token_ok`, reordered service, flipped test            | Deploy order: the migration must precede the app deploy                          |
| 5. Docs                | README, decisions, architecture, prerequisites                | Docs drifting from the order actually shipped                                    |

**Prerequisites:** a draft PR so the CI `integration` and `smoke` jobs can run (a local run needs the relay and the owner's OK); the owner applies two migrations in production by hand through the Supabase connector.
**Estimated effort:** about 3 to 4 sessions across 5 phases.

## Open Risks & Assumptions

- The deployed `ingest_push` may differ from the repo (the runbook renames migration files after applying); Phase 2 checks it first.
- The production API schema list is unknown; helpers also revoke execute from every role so an exposed schema stays uncallable.
- `ingest_token_ok` is an unmetered anon-callable check; it is safe only because tokens are 32 random bytes from `scripts/create-ingest-token.mjs`.
- Assumes the lab retries on 5xx (`docs/ingest/README.md:52`), which makes a wrong deploy order recoverable but visible as a stale card after 15 minutes.

## Success Criteria (Summary)

- A request with an unknown or revoked token gets 401 whatever its body; a valid token with a bad body still gets 400 or 422.
- The golden replay, retention parity and all existing integration tests pass unchanged through the pure-refactor phases, including the five pinned gaps.
- No helper is callable through the API, `ingest_push` keeps its signature and anon-only grant, and the contract's JSON Schema is byte-identical.
