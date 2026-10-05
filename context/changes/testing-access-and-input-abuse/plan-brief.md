# Access and Input Abuse Tests — Plan Brief

> Full plan: `context/changes/testing-access-and-input-abuse/plan.md`
> Research: `context/changes/testing-access-and-input-abuse/research.md`

## What & Why

Rollout Phase 3 of the test plan: add tests for risk #6 (a signed-out, non-owner or forged client gets in) and risk #7 (lab text or notes render as markup, or the notes limits disagree). The guards already exist; no test proves them, and this app has a single owner, so "logged in means owner" is the assumption most worth breaking. No production code changes.

## Starting Point

`src/middleware.ts` holds the Origin check and the `/api/ingest` token exemption, and Postgres RLS holds the owner-only reads. The only test of either is one smoke step on a foreign Origin. No test reads as a non-owner, because the local and CI seed trigger makes every signup an owner and the integration suite is anon-key only. The notes limit has server unit tests but nothing on the form or the database.

## Desired End State

`npm test` fails when the Origin check, the token exemption, the protected-route prefix or the set of routes drifts, or when an HTML sink appears in `src`. The integration suite proves with a real non-owner and with anon that owner data is hidden and notes cannot be written, and that unknown, empty and revoked tokens are refused. Smoke proves markup stays text on every rendering surface. The test plan and docs say what is now true.

## Key Decisions Made

| Decision                               | Choice                                                        | Why (1 sentence)                                                                          | Source           |
| -------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------- |
| Getting a non-owner and a second token | Test-only `pg` helper, local host only                        | Needs postgres access that the anon suite deliberately lacks, with no secrets in the repo | Research (owner) |
| Making the non-owner                   | Delete the owner row after signup, do not disable the trigger | Changes no global state, so other files stay unaffected                                   | Plan             |
| Testing the middleware                 | Unit test with Vite `resolveId` plus `vi.mock` stubs          | Cheap, runs in `npm test`, no server                                                      | Research (owner) |
| Escaping on the page                   | Extend smoke plus a static sink guard                         | No new tooling; Astro components cannot render in Vitest here                             | Research (owner) |
| Known gaps                             | Pin as `KNOWN GAP` tests, no production change                | Same approach as Phase 2; each fix is a product or security decision                      | Research (owner) |
| `/api/ingest/` with a trailing slash   | Pinned as refused (403)                                       | It fails closed; a change is a product decision                                           | Plan             |
| Route-list test                        | Hand-written table that fails on unlisted pages               | Protection is a path prefix, so a new owner page could be open without notice             | Plan             |

## Scope

**In scope:** middleware and route-inventory unit tests, a sink guard, a privileged SQL helper, non-owner, anon and token integration tests, notes parity tests, smoke payloads for escaping, and docs and test-plan updates.

**Out of scope:** any production, migration or grant change; service-role keys; browser or Container API tests; the lab's Python code; making the suites required in CI (Phase 4 of the test plan).

## Architecture / Approach

Cheapest layer first. Phase 1 is pure unit in `npm test`. Phase 2 adds `tests/integration/support/privileged.ts` (a local-only `pg` connection to `127.0.0.1:54322`) and uses it for the non-owner, anon and token tests, each with an owner control so a stack that denied everyone cannot pass. Phase 3 reuses the helper for database-side note checks. Phase 4 touches only `scripts/smoke.mjs`. Phase 5 updates docs, including the stale line in `test-plan.md`.

## Phases at a Glance

| Phase                                 | What it delivers                                                             | Key risk                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1. Request-guard unit tests           | Middleware table test, route inventory, sink guard, form-attribute check     | Vitest 5 may not resolve the `astro:` modules as the v4 docs show; fallback is `test.alias` stubs |
| 2. Privileged helper and access tests | `pg` helper, non-owner and anon reads and writes, token rules, column grants | The `pg` connection must work in CI and through the relay on 54322                                |
| 3. Notes limit parity                 | Unit and database pins for emoji, whitespace and trim-then-max               | Postgres `btrim` and `char_length` behaviour is documented, not yet run here                      |
| 4. Page-level escaping                | Survey of unread cards, smoke payloads and escaped-output steps              | The unread cards may render fields the plan did not expect                                        |
| 5. Docs and test-plan                 | Prerequisites, decisions, test-plan sections and statuses                    | Wording drift if done before the facts are known                                                  |

**Prerequisites:** local Supabase reachable with the relay on 54321 and 54322 (UGREEN); owner's OK is not needed for tests, only for container changes.
**Estimated effort:** about 4 to 5 sessions across 5 phases.

## Open Risks & Assumptions

- Inferred, not run: `/api/ingest/` returns 403, the middleware stub works under Vitest 5, and `btrim` and `char_length` behave as documented. Phases 1 and 3 pin them with tests.
- The unread cards (bill forecast, recommendation findings and forecast, usage insight, live state, totals) may render lab strings; Phase 4 decides the payloads after reading them.
- Defaults chosen without asking (delete the owner row, `resolveId` plugin, route table, 403 pin) can be changed at plan review.

## Success Criteria (Summary)

- Each guard has a test that turns red when the guard is deliberately broken, shown per phase.
- A real non-owner and anon read and write nothing, with an owner control proving the suite is not vacuous.
- The test plan, decisions and prerequisites match what the repository now does.
