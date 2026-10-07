# Refactor opportunities — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`

## What & Why

Remove the most clearly duplicated code found by research, with no behaviour change. The lead item is a safety guard that exists as three copies in the test support code, which a lesson already says must be fixed in all copies at once; the rest are cheap, countable duplicates in `src`.

## Starting Point

Three copies of the local-host allowlist guard (e2e, integration stack, integration privileged), covered by a test table that misses the stack-env guards. In `src`: 14 `getClient()` wrappers in page frontmatter, the same Polish refresh sentence written 18 times, a skew constant in three services, `formatAge` living in `live-state.ts`, three `capitalize` copies and a few smaller twins.

## Desired End State

Each of those exists once. All exported names that tests pin keep working, no test assertion changes, the ingest contract schema is byte-identical, and every gate (lint, unit, type check, build, integration, e2e) is green after each phase.

## Key Decisions Made

| Decision                                 | Choice                                                                     | Why (1 sentence)                                                                         | Source       |
| ---------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------ |
| Scope                                    | Guards plus low-risk dedupes                                               | Clears the lesson-backed item and the highest-count duplicates without large-file splits | Plan (owner) |
| Delivery                                 | One change, 4 phases, one PR, one commit per phase                         | One review, easy per-phase revert                                                        | Plan (owner) |
| Anon-key check in `src/lib/supabase.ts`  | Left alone                                                                 | Keeps the refactor pure; no production behaviour change                                  | Plan (owner) |
| Guard module                             | Pure `tests/support/local-guards.ts`, callers keep their names and wording | Both vitest and Playwright can import it; messages stay as today                         | Research     |
| Safety net                               | Extend the guard table to the stack-env guards before moving code          | Old behaviour is pinned first                                                            | Plan         |
| Skew constants                           | One shared value, three existing names kept as aliases                     | Tests pin the names; the policies may diverge later                                      | Plan         |
| `contract.ts`, `wholeNumber`, `LibBadge` | Not touched                                                                | Write side under Stryker; load test pins the formatter; deletion needs a docs edit       | Research     |

## Scope

**In scope:** shared test guard module; `src/lib/format/age.ts`, `capitalize`, `NO_STATUS`, `byDay`, `DAILY_COLUMNS`; `jsonNoStore`, `bearerToken`, `signout` prerender flag, client-or-fallback helper; `RefreshHint.astro`, shared form button classes; two `docs/decisions.md` entries.

**Out of scope:** large-file splits, test fixture builders, CI composite action, token-script merge, `contract.ts`, migrations, `supabase.ts`, `LibBadge` removal, `test-plan.md`, archives.

## Architecture / Approach

Characterize first, then move: pin current guard refusals with tests, extract, keep the same tests green. Every later phase is a pure move or merge with the original exports preserved where tests import them. The Astro components have no unit tests, so Phases 3 and 4 lean on build, type check, grep counts and the e2e alert-rules spec.

## Phases at a Glance

| Phase                | What it delivers                                           | Key risk                                            |
| -------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| 1. Test guards       | One guard module, table covers all four guards             | Weakening a safety guard by a wording or order slip |
| 2. `src/lib` helpers | Shared age/skew/`capitalize`/`NO_STATUS`/`byDay`/columns   | `live-state` load test and pinned constant names    |
| 3. Routes and pages  | `jsonNoStore`, `bearerToken`, prerender flag, `withClient` | Ingest stage order; page frontmatter has no tests   |
| 4. Components        | `RefreshHint`, shared button classes                       | No component tests; test ids must stay              |

**Prerequisites:** local Supabase relay for local integration and e2e runs needs the owner's explicit OK; CI is authoritative otherwise.
**Estimated effort:** about 3-4 sessions across 4 phases.

## Open Risks & Assumptions

- Risk ratings assume existing tests assert behaviour, not structure (not verified in research).
- It is unchecked whether other tests match the guards' refusal wording beyond `/Refusing/`; step 1.1 finds out.
- The three `capitalize` bodies are assumed equal for the empty string; Phase 2 checks before merging.

## Success Criteria (Summary)

- One copy of each duplicated guard, helper and sentence; grep checks in the plan show it.
- All gates green per phase, contract schema unchanged, no test assertion edited.
