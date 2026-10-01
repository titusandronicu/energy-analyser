# Push-to-page integration tests (test plan Phase 2) — Plan Brief

> Full plan: `context/changes/testing-push-to-page-integration/plan.md`
> Research: `context/changes/testing-push-to-page-integration/research.md`

## What & Why

Add an integration suite on local Supabase that proves a lab-shaped push goes through the ingest service, the real store and the real loaders and shows up on its own surface (risk #3), and that replays and out-of-order pushes never downgrade stored data while a gap stays a gap (risk #4). The 34 unit test files open no database, so a wiring or SQL regression passes them all.

## Starting Point

The store already guards replay, order and narration in one SQL function (`ingest_push`), and the loaders take a client, so they can be called from Vitest. Smoke covers part of the real path over HTTP but never the hourly card, daily-history cells or order of daily and hourly pushes. Research found three unguarded holes: a newer push with a lower or empty total, a far-future `built_at`, a repeated `generated_at`.

## Desired End State

`npm run test:integration` runs against a reachable local stack and fails loudly if it is missing or not local; `npm test`, the `ci` job and Stryker never collect it; the `smoke` CI job runs it after smoke. The three holes are pinned by named `KNOWN GAP` tests, and the cookbook (§6.2) says how to add the next one.

## Key Decisions Made

| Decision                   | Choice                                                   | Why (1 sentence)                                                           | Source   |
| -------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| Lower or null daily total  | Pin as `KNOWN GAP`, no SQL change                        | Lab corrections downward can be legitimate; a guard is a product decision. | Plan     |
| Far-future `built_at`      | Pin as `KNOWN GAP`, no contract bound                    | Avoids a contract change for the lab; the test flips when a bound lands.   | Plan     |
| Repeated `generated_at`    | Pin as `KNOWN GAP`, no 409                               | Consistent with first-wins elsewhere; one cheap test.                      | Plan     |
| Non-owner and second token | Deferred to rollout Phase 3                              | Needs postgres or service-role access; Phase 2 does not need it.           | Plan     |
| Placement                  | `tests/integration/` with its own config, run in `smoke` | `npm test` and Stryker see no new file without any exclude.                | Plan     |
| Layer for #3               | Vitest with a real anon client, plus one smoke step      | The loaders are callable directly; only HTTP composition needs the server. | Research |
| Test isolation             | Real "now", verified-absent far-past keys, sequential    | Global views and a never-reset database make shared state the main risk.   | Review   |

## Scope

**In scope:** harness and seed test, one test per pushed section, right-surface and key-skip checks, replay and order guards with controls, gap and hourly-prune tests, three `KNOWN GAP` tests, one smoke step for the hourly card, CI step, docs.

**Out of scope:** any production, SQL or contract change, non-owner and second-token tests, middleware and Origin tests, browser tests, narration-keep re-test, 14-day raw-push prune, values from `example-v1.json`.

## Architecture / Approach

`push()` calls `handleIngest` with an `rpc` that hits the real `ingest_push` through an anon client, exactly like the route; an owner session created by signup reads back through the exported loaders, view mappers and, where a loader hides a column (`facts`) or a table (`ingest_pushes`), a direct select. Expected values are invented figures or rules from `docs/logic.md`, written by hand. Each guard test has a control (a newer push does change the row). Absence and prune checks use far-past keys verified absent before use; `captured_at` is strictly increasing. The smoke step pushes one complete Warsaw day and asserts the heaviest-hour label, which exists only because of those rows.

## Phases at a Glance

| Phase                    | What it delivers                                                | Key risk                                                   |
| ------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Harness and seed test | Config, script, helpers, one green test, CI step                | Proves no risk yet; needs the local stack reachable        |
| 2. Push to page          | One test per section, right-surface, key-skip, smoke hourly day | View labels derived by hand can drift from `docs/logic.md` |
| 3. History safety        | Replay, order, gaps, prune, three `KNOWN GAP` tests             | Rerun-safety on a database that is never reset             |
| 4. Docs and cookbook     | §6.2, §6.6, decisions, logic, prerequisites, CLAUDE.md          | Docs drifting from what the tests pin                      |

**Prerequisites:** the UGREEN Supabase stack up with the 12 migrations applied and the relay running (changing the stack needs the owner's OK); CI already starts the stack.
**Estimated effort:** about 4 sessions, one per phase; CI runtime unmeasured until the first PR run.

## Open Risks & Assumptions

- Assumes the UGREEN stack is up and migrated; the first manual step confirms it.
- Pinned tests encode today's behaviour; if the owner later decides a guard, those tests flip by design.
- `lab-shape.json` is trusted as synthetic per the comment at `src/lib/ingest/bill-forecast-fixtures.test.ts:129`; provenance of the live-flow and recommendation fixtures is unconfirmed, so they are not used.
- Local auth rate limits (`email_sent`, signups per IP) were not tested; one signup per file keeps the suite far below them.
- The smoke hourly label stays the heaviest only if the suite's own complete days keep every load at or below 1 kWh (the smoke day's top hour is at least 5 kWh).

## Success Criteria (Summary)

- A lab-shaped push is proven, against real Postgres, to appear on each of its surfaces and nowhere else.
- Replays, older pushes and gaps are proven safe at the store, and the three unguarded holes are named in tests and docs.
- The suite runs in CI and locally without touching `npm test` or Stryker.
