# Refactor follow-ups — Plan Brief

> Full plan: `context/changes/refactor-followups/plan.md`
> Research: `context/changes/refactor-followups/research.md`

## What & Why

Finish what `refactor-opportunities` (PR #149) left: fix the low-severity leftovers its review found, do the safest remaining dedupes, and align the app's anon-key check with the stricter test-side rule so one rule describes "an anon key" everywhere.

## Starting Point

The merged refactor preserved behaviour (two independent reviews found nothing weakened). Left over: three inline capitalize copies, a stale `HOUR_MS` re-export, `formatAge` tests in the wrong file, time units redefined in 13 test files, a seed token in 4 test files, an unused `LibBadge.astro`. The app's `assertAnonKey` rejects only secret and `service_role` keys; the tests also require `sb_publishable_` or role `anon`. The production key's shape is unknown.

## Desired End State

Each leftover exists once; `calendar-view.ts` copy and `buildNodes` live in their own tested modules; a pure `src/lib/anon-key.ts` serves both the app and the test guards. Production first warns on an unexpected key shape, then, once logs are clean, refuses it.

## Key Decisions Made

| Decision          | Choice                                                                                          | Why (1 sentence)                                               | Source           |
| ----------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------- |
| Scope             | Review fixes, safe test dedupes, LibBadge, two safe splits, anon-key                            | Owner chose all three weak spots and "two safe splits only"    | Plan (owner)     |
| Delivery          | PR A (phases 1-3), PR B (phase 4), PR C (phase 5)                                               | A production-behaviour change never rides in a cleanup PR      | Plan (owner)     |
| Anon-key approach | Shared pure module, app warns first then enforces                                               | One rule everywhere without a lockout from an unknown key      | Plan (owner)     |
| Warning content   | Key class only, never key, prefix or length                                                     | A log must not leak secret material                            | Plan             |
| Not doing         | CI composite action, token-script merge, `smoke`/`push-fixture` lib, `toBillForecastView` split | Low value or touches required checks                           | Plan (owner)     |
| Not doing         | Shared `row()` builder, test `now` constant, vitest alias merge                                 | Research: only one identical pair; 6 different values; 5 lines | Research         |
| `LibBadge.astro`  | Delete, edit `docs/decisions.md:168`                                                            | No importer; owner included it in the dedupes                  | Research + owner |

## Scope

**In scope:** leftovers from the review; time-unit, seed-token and `uniqueUser` test dedupes; `LibBadge` removal; `calendar-copy.ts` and `flow-nodes.ts` extractions; `anon-key.ts` with warn-only and enforcement releases; decision and prerequisite docs.

**Out of scope:** migrations, ingest contract, `contract.ts`, workflow and script merges, large-function splits, archives, `test-plan.md`.

## Architecture / Approach

Characterize first, then move; one commit per phase, gates green each time. The anon-key classifier is pure (no `astro:*` import) so `tests/support/local-guards.ts` can import it by a relative path. The app keeps today's rejections, adds a once-per-process labelled warning for the `other` class in release 1, and refuses that class in release 2 after the owner checks production logs.

## Phases at a Glance

| Phase                        | What it delivers                                                             | Key risk                                               |
| ---------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1. Review leftovers          | No stray capitalize/`HOUR_MS` copies; `age.test.ts`; guard table gaps closed | Low; rendering unchanged                               |
| 2. Test dedupes and LibBadge | Shared time units, `SEED_TOKEN`, `uniqueUser`; component deleted             | Renaming 13 test files' constants                      |
| 3. Two safe splits           | `calendar-copy.ts`, `flow-nodes.ts` with a characterization test             | `LiveFlow.tsx` has no component test                   |
| 4. Anon-key warn-only (PR B) | Pure classifier, app warns, guards share it                                  | Playwright import path; log hygiene                    |
| 5. Enforce (PR C)            | App refuses non-anon keys                                                    | A wrongly shaped production key means a 500 everywhere |

**Prerequisites:** the owner checks production logs after phase 4 is deployed (phase 5 waits for it); local integration and e2e runs need the owner's OK for the stack, otherwise CI is authoritative.
**Estimated effort:** about 4-5 sessions across 5 phases, plus a wait between phases 4 and 5.

## Open Risks & Assumptions

- Assumes the existing tests assert behaviour, not structure (reviews saw no counter-example).
- Whether Playwright resolves the relative `src/` import is checked by step 4.4 and CI `e2e`.
- Loading `LiveFlow.tsx` in vitest is unproven; phase 3 has a fallback (move first, prove equality with a one-off script).
- `supabase.ts` is tested with mocked Supabase packages; real-client creation is covered by the CI smoke job.
- Release 1 only proves the key is fine if production serves real traffic before the log check.

## Success Criteria (Summary)

- One copy of every helper the review and research named; grep checks in the plan show it.
- All gates green per PR, contract schema unchanged, no test assertion edited except import lines.
- The app and the test guards classify keys with the same code, and production is protected from a lockout by the warn-first release.
