# Testing Phase 4: Quality-gates wiring — Plan Brief

> Full plan: `context/changes/testing-quality-gates-wiring/plan.md`
> Research: `context/changes/testing-quality-gates-wiring/research.md`

## What & Why

The Phase 1-3 test suites run in CI, but nothing in GitHub makes them block a merge, so a regression in any of risks #1 to #7 could still be merged. This plan makes the suites required checks on `main`, binds the owner too, and proves each gate with a deliberate break that turns CI red.

## Starting Point

`main` has no branch protection and no rulesets (observed 2026-10-05). `ci.yml` has jobs `ci` and `smoke`; integration runs as the last step of `smoke`, so it has no check of its own and is skipped when smoke fails. The post-edit hooks already exist (PR #106) but the test plan still calls them "recommended after Phase 4". Only 1 of the last 200 CI runs failed; no gate has been seen red per risk.

## Desired End State

A PR to `main` cannot merge, for anyone including the owner, while `ci`, `smoke` or `integration` is red or missing. Each check has been shown red for the risks it protects, the existing hooks are proven, and the docs state exactly what is enforced.

## Key Decisions Made

| Decision        | Choice                                             | Why (1 sentence)                                                                | Source   |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| Enforcement     | Ruleset on `main`, no bypass, owner bound          | A red check must really block the only person who merges                        | Plan     |
| Integration job | Split into its own job with its own check          | A red check names the suite and integration runs even if smoke fails            | Plan     |
| Up to date      | Not required                                       | Single author; the push run on `main` catches two green PRs that break together | Plan     |
| Proof           | One break per risk #1 to #7, batched by check      | Matches the intent that each gate is proven, in few CI runs                     | Plan     |
| Post-edit check | Adopt existing hooks, prove them, keep recommended | Hooks exist and are tracked; no new moving parts                                | Plan     |
| Deploy gate     | Out of scope, recorded as a follow-up              | Keeps Phase 4 to the merge gate; deploy already needs owner approval            | Plan     |
| Check names     | `ci`, `smoke`, `integration`                       | Job ids are the names; renaming later would leave the requirement pending       | Research |
| Supabase start  | Shared composite action                            | One exclusion list, as `CLAUDE.md` requires                                     | Plan     |

## Scope

**In scope:** the `integration` job and shared Supabase action, `timeout-minutes`, a committed ruleset JSON and its apply and recovery notes, hook proof, seven breaks, docs updates.

**Out of scope:** `deploy-production.yml`, required reviews, merge queue, up-to-date branches, new hooks, browser E2E, mutation or coverage gates, third-party and label-driven checks.

## Architecture / Approach

Make the check names exist first, then prove the hooks, then enable the ruleset on a green PR, then use throwaway draft PRs to prove the block and each risk's check, then document. Every break lives on a throwaway branch and is closed and deleted; nothing from a break reaches `main`.

## Phases at a Glance

| Phase                    | What it delivers                                                             | Key risk                                                              |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Split integration job | Three checks `ci`, `smoke`, `integration`, shared Supabase action, timeouts  | A renamed or skipped job would leave a required check pending         |
| 2. Post-edit check proof | Hooks shown to exit 2 on a broken service; comment fixed                     | Low                                                                   |
| 3. Ruleset on `main`     | Active ruleset, no bypass, JSON committed, recovery documented               | Owner locked out if CI itself breaks (recovery step documented)       |
| 4. Break proof           | `breaks.md` with one row per risk, merge blocked                             | A break may not turn its expected check red, which is then a real gap |
| 5. Docs                  | test-plan, decisions, CLAUDE.md, README say what is enforced; row `complete` | Low                                                                   |

**Prerequisites:** admin access to the repo (confirmed), `gh` working (AdGuard can block the GitHub API), CI minutes for about three break runs.
**Estimated effort:** about 2 sessions across 5 phases; phases 3 and 4 need the owner present.

## Open Risks & Assumptions

- Assumes a ruleset with an empty bypass list binds a repo admin on this plan; verified in Phase 3 manual step.
- The seven break targets are chosen from the tests' own assertions; a break that needs a migration change takes a database reset in CI.
- A second Supabase start adds runner minutes per PR.
- The ruleset requires check names, not workflow contents: a PR that edits `ci.yml` runs its own version (accepted for a single owner; recorded in decisions).
- Break #4 needs a throwaway SQL migration, because the replay protection lives in `ingest_push`, not in TypeScript.

## Success Criteria (Summary)

- A red `ci`, `smoke` or `integration` disables the merge button for the admin.
- `breaks.md` shows each of #1 to #7 caught by a named check and test.
- `test-plan.md`, `docs/decisions.md` and `CLAUDE.md` agree with `gh api` on what is required.
