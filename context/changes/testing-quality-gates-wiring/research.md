---
date: 2026-10-05T14:47:48+02:00
researcher: Claude (Sonnet 5.5)
git_commit: efe5d0abb0b7af76b46360805899addc86362c82
branch: test/quality-gates-wiring
repository: titusandronicu/energy-analyser
topic: "What actually blocks a merge today, and what Phase 4 must wire so the Phase 1-3 suites gate it"
tags: [research, ci, quality-gates, branch-protection, hooks, github-actions]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Sonnet 5.5)
---

# Research: What actually blocks a merge today, and what Phase 4 must wire

**Date**: 2026-10-05T14:47:48+02:00
**Git Commit**: efe5d0abb0b7af76b46360805899addc86362c82 (`origin/main` tip, #120)
**Branch**: test/quality-gates-wiring (uncommitted: `test-plan.md` §3 Phase 4 row set to `change opened`, this folder)
**Repository**: titusandronicu/energy-analyser (public, default branch `main`, token has ADMIN)

## Research Question

Challenge "the suite exists, so it gates": confirm what actually blocks a merge (required status checks, workflow triggers, skipped or optional jobs) for the unit and request-guard tests in `npm test`, the integration suite and smoke, rather than assuming. Also find what exists for an optional post-edit check on the services.

## Summary

**Nothing in GitHub blocks a merge today.** Read on 2026-10-05 through `gh api`: `main` has no classic branch protection (HTTP 404 "Branch not protected"), the repo has no rulesets (`rulesets` returns `[]`, `rules/branches/main` returns `[]`), and the only environment rule is a required reviewer on the `production` environment, which gates the deploy job and not a merge. The suites run and are green on PRs, but they are advisory: a red `ci` or `smoke` check would still show a mergeable PR to an admin. Every statement in `test-plan.md` §5 that a gate is "required" currently means "run in CI", not "blocks".

What does run on every PR to `main` and every push to `main` is `.github/workflows/ci.yml`, two jobs named `ci` and `smoke` (`ci.yml:3-8`, `ci.yml:14`, `ci.yml:30`). Together they cover all three suites Phase 4 names:

- job `ci`: `npm run lint`, `npm test` (unit and request-guard, 49 `src/**/*.test.ts` files), `npx astro check`, `npm run build` (`ci.yml:25-29`);
- job `smoke`: local Supabase, build and start the server, `npm run smoke`, then `npm run test:integration` as a later step of the same job (`ci.yml:48-55`).

Three weaknesses stand between "runs" and "gates", beyond the missing protection:

1. **The integration suite has no check of its own.** It is a step inside job `smoke`, after the smoke step (`ci.yml:48-55`). A required check named `smoke` therefore gates both, but a smoke failure ends the job before the integration step runs (default step semantics, no `if:`), so a red `smoke` can hide whether integration also broke, and the check name does not say which suite failed.
2. **A gate has never been seen to fail in a way the repo recorded.** Of the 200 most recent `CI` workflow runs listed, 199 concluded `success` and one `failure` (a PR from `cursor/frosted-aurora-dashboard-8dba`). No deliberate break per risk has been run. The prove-it-by-breaking part of the intent is untested for every gate.
3. **The local gates are bypassable and incomplete.** `.husky/pre-push` runs `astro check` and `npm test` only (`.husky/pre-push:1-2`), never the integration suite or smoke, and `git push --no-verify` skips it. It is not a merge gate.

The optional post-edit check **already exists and is committed** (PR #106, 2026-10-02): `.claude/settings.json:3-17` wires a `PostToolUse` hook on `Write|Edit` running `lint-edited-file.sh` and `related-tests.sh`, plus a `Stop` hook running `end-of-turn.sh`. `test-plan.md` §5 still lists the post-edit check as "recommended after §3 Phase 4", so the plan document lags the repo. Phase 4's post-edit work is to scope, prove and record what exists, not to build from nothing.

## Detailed Findings

### 1. What blocks a merge: GitHub side (observed 2026-10-05)

- Classic branch protection on `main`: absent. `gh api repos/titusandronicu/energy-analyser/branches/main/protection` returned HTTP 404 "Branch not protected".
- Rulesets: none. `repos/.../rulesets` returned `[]`; `repos/.../rules/branches/main` returned `[]`.
- Repo settings: `allow_auto_merge: false`, merge commit, squash and rebase all allowed, `delete_branch_on_merge: false`. Actions allowed for all actions (`sha_pinning_required: false`); default workflow token is read-only.
- The merged PRs #118 and #120 were merged by the repo owner with check rollups `ci` SUCCESS, `smoke` SUCCESS, `Sourcery review` SKIPPED (and `claude-support` SKIPPED, `code-review` SUCCESS on #118); `mergeStateStatus` came back `UNKNOWN` and `reviewDecision` empty, which is what an unprotected branch reports. This shows green checks preceded these merges, not that anything would have stopped a red one.
- The `production` environment has one required reviewer (the owner, `prevent_self_review: false`), which gates `deploy-production.yml` only.
- Required status checks, once configured, are matched by check name. The names to require are the job ids/names `ci` and `smoke` (as listed in the PR check rollup, workflow `CI`). `Sourcery review` is a third-party check with an empty workflow name and is reported `skipping`; it must not be made required.

### 2. What runs on which trigger

- `ci.yml` triggers: `push` to `main` and `pull_request` targeting `main` (`ci.yml:3-8`). No `paths` or `paths-ignore` filter, no `if:` on either job, no `continue-on-error`, so neither job is conditionally skipped on a docs-only PR (inspected: whole file). This matters for required checks: a path filter would leave a required check "pending" forever; this file has none, so that trap is absent today.
- `code-review.yml` and `code-review-fix.yml` trigger on `pull_request: types: [labeled]` with an `if: contains(...)` on a label (inspected: file headers); they are label-driven, so they run only when the label is applied and must never be required.
- `mutation.yml` runs on `workflow_dispatch` and a weekly cron, and states "Report-only ... never gates PRs or image publishing" (`mutation.yml:1-2`, `mutation.yml:5-9`).
- `publish-image.yml` triggers on `workflow_run` of `CI` completing on `main` and publishes only if the conclusion is `success` and the event is `push` (`publish-image.yml:3-15`). That gates the image on a green post-merge CI run, not the merge itself.
- `deploy-production.yml` is `workflow_dispatch` with a SHA input (`deploy-production.yml:3-9`); the first 80 lines inspected contain no step that checks that SHA's CI result (no `gh run`, `check-runs` or `conclusion` match in the 134-line file by grep). Whether a SHA that never passed CI can be deployed was not tested.

### 3. Suite-to-gate map

| Suite                                                                                                    | Where it runs                                                             | Job / check          | Own check?                                      | Notes                                                                                              |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| unit + request-guard (`src/**/*.test.ts`, 49 files incl. the middleware test)                            | `npm test` = `vitest run` (`package.json` scripts)                        | `ci`                 | no, shares `ci` with lint, `astro check`, build | `vitest.config.ts` includes only `src/**/*.test.ts`; also run by `.husky/pre-push`                 |
| smoke (71 steps with Supabase env, 52 without per test-plan §4)                                          | `npm run smoke`, exits 1 if any step failed (`scripts/smoke.mjs:710-727`) | `smoke`              | no, shares `smoke`                              | needs local Supabase and Mailpit                                                                   |
| integration (push-to-page, history, access, notes parity, seed; 5 test files under `tests/integration/`) | `npm run test:integration`                                                | `smoke` (later step) | no                                              | `vitest.integration.config.ts` includes `tests/integration/**/*.test.ts`; `fileParallelism: false` |

`requireStack` in the integration support code refuses a missing or non-local env rather than skipping (test-plan §6.2), so an unreachable stack turns the step red instead of silently passing; this was read from the test plan, not re-verified in the helper source here.

### 4. Post-edit and local gates (what exists)

- `PostToolUse` on `Write|Edit` runs `lint-edited-file.sh` (ESLint on the edited `*.ts|tsx|js|jsx|mjs|cjs|astro` file, `exit 2` on error) and `related-tests.sh` (`npx vitest related <file> --run` for edited `*/src/*.ts|tsx`, `exit 2` on failure) (`.claude/hooks/lint-edited-file.sh`, `.claude/hooks/related-tests.sh`; `.claude/settings.json:3-11`).
- `Stop` runs `end-of-turn.sh`: ESLint on changed files, the whole unit suite (`npx vitest run`), and `astro check --minimumSeverity error`, once, then lets the turn finish (`.claude/hooks/end-of-turn.sh`; `.claude/settings.json:12-16`). Its comment says "~2 s for 34 files"; the suite has 49 files now, so that figure is stale.
- The hooks target all of `src/`, not specifically "the services" (`src/lib/services`); `related-tests.sh` case pattern is `*/src/*.ts|*/src/*.tsx`.
- Integration tests are deliberately outside the post-edit loop ("integration tests need the local stack and stay out", `related-tests.sh` header).
- Git hooks: `pre-commit` runs `lint-staged` (`.husky/pre-commit`); `pre-push` runs `astro check` and `npm test`. All are tracked (`git ls-files .claude .husky`).

## Code References

- `.github/workflows/ci.yml:3-8` - triggers: push to main, pull_request to main, no path filters
- `.github/workflows/ci.yml:14-28` - job `ci`: lint, `npm test`, `astro check`, build
- `.github/workflows/ci.yml:30-55` - job `smoke`: Supabase, smoke, integration step, `if: always()` teardown
- `.github/workflows/publish-image.yml:3-15` - image publish gated on CI `success` on push
- `.github/workflows/mutation.yml:1-9` - report-only, never gates
- `.github/workflows/deploy-production.yml:3-9` - manual deploy by SHA
- `.claude/settings.json:3-17` - PostToolUse and Stop hooks
- `.husky/pre-push:1-2` - `astro check`, `npm test`
- `scripts/smoke.mjs:710-727` - smoke exits 1 on any failed step
- `vitest.config.ts`, `vitest.integration.config.ts` - include globs
- `context/foundation/test-plan.md` §5 - gate table with "required after Phase N" wording

## Architecture Insights

- "Required" in this repo has meant "present in CI and reviewed by the owner before merging". With one maintainer who is admin, rule enforcement is a deliberate choice; a protected branch does not stop an admin unless admin enforcement is on (GitHub setting, not verified on this repo because no protection exists).
- Job ids double as check names. Renaming `ci` or `smoke` after they are required silently leaves the requirement pending, so the wiring should fix the names first or require the new names in the same step.
- Phase 3's plan explicitly deferred this: "the new integration files run in the existing `smoke` job step automatically, and making them required stays Phase 4" (`context/archive/2026-10-02-testing-access-and-input-abuse/plan.md:35`).

## Historical Context (from prior changes)

- `context/archive/2026-10-02-testing-access-and-input-abuse/plan.md:35` - Phase 3 added no CI wiring; Phase 4 owns "CI gate wiring, post-edit hook". Supported by current `ci.yml` (no new job).
- `context/archive/2026-10-02-testing-access-and-input-abuse/plan.md:163` - the plan asked to confirm on the first PR run that `pg` reaches `127.0.0.1:54322` in the `smoke` job; later PRs (#118, #120) show `smoke` passing, so the integration step runs there. Supported.
- PR #106 (`4aed1a0`, 2026-10-02, "commit agent hooks and a pre-push gate") committed the hooks and `.husky/pre-push`. Partial: it predates Phase 4 and is not mentioned in `test-plan.md` §5, which still calls the post-edit check "recommended after Phase 4".
- Memory note on the Phase 3 state (`testing-phase3-state`) says the owner merges PRs; consistent with the `mergedBy` observed on #118 and #120.

## Related Research

- `context/archive/2026-10-01-testing-push-to-page-integration/` and `context/archive/2026-10-02-testing-access-and-input-abuse/` (research and plans for the suites being gated).

## Open Questions

Product or owner decisions the plan must settle (not facts to research further):

1. **Enforcement scope**: use classic branch protection or a ruleset, and whether admins (the owner) are bound. Binding the owner removes the "merge a red PR" path; leaving bypass on keeps the gate advisory for the only person who merges.
2. **Which checks to require**: at minimum `ci` and `smoke`. Whether to split the integration suite into its own job (own check name, runs even when smoke fails, parallel with smoke) before requiring, so a failure names the suite. A split changes check names and CI time; it needs its own Supabase start (about the smoke job's setup cost) unless a shared setup is kept.
3. **Require up-to-date branches** (strict status checks): the repo has fast-moving single-author PRs; strictness adds re-runs.
4. **How to prove each gate**: a deliberate break per risk on a throwaway branch and PR (stale-as-fresh, wrong bill figure, boundary, replay downgrade, non-owner read, Origin, notes limits) that turns the named check red, then revert. Whether to do all seven or one per suite is a cost choice; the intent says each gate.
5. **Post-edit check scope**: keep the existing hooks as the recommended check and update `test-plan.md` §5, or add a services-specific hook. Also decide whether to fix the stale "34 files" comment in `end-of-turn.sh`.
6. **Deploy path**: whether `deploy-production.yml` should refuse a SHA without a green `CI` run (not tested here; outside the stated Phase 4 intent unless the owner extends it).
7. **Docs to correct**: `test-plan.md` §5 "Required?" column and §4 "Already required in CI" (`test-plan.md:109`) say "required" while no check is required in GitHub; wording should follow whatever is configured.

Gaps: branch-protection settings were read only for `main`; whether the token's account could be bound by a ruleset (plan tier, public repo) was not exercised since no rule was created. `requireStack` refusal behaviour was taken from `test-plan.md` §6.2 and not re-read in `tests/integration/support/stack.ts`.
