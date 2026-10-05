# Testing Phase 4: Quality-gates wiring Implementation Plan

## Overview

Rollout Phase 4 of `context/foundation/test-plan.md`. The Phase 1-3 suites run in CI but nothing in GitHub makes them block a merge. This plan makes `ci`, `smoke` and a new `integration` check required on `main` through a repository ruleset that also binds the owner, proves every gate with one deliberate break per risk (#1 to #7), and adopts and proves the already-committed post-edit hooks as the recommended, not required, check. No production code changes.

## Current State Analysis

- `main` has no branch protection and no rulesets (`gh api .../branches/main/protection` 404, `.../rulesets` `[]`, observed 2026-10-05). Only the `production` environment has a required reviewer, and it gates deploys, not merges (`research.md` section 1).
- `.github/workflows/ci.yml` has two jobs, `ci` (lint, `npm test`, `astro check`, build) and `smoke` (local Supabase, smoke, then `npm run test:integration` as the last step). Triggers are push and pull_request to `main`, no path filters, no `if:` (`ci.yml:3-8`, `ci.yml:14-55`).
- Integration has no check of its own, and a smoke failure ends the job before integration runs (`ci.yml:48-55`).
- Of the 200 most recent `CI` runs, 199 succeeded; no gate has been seen red for any covered risk.
- The post-edit hooks exist and are tracked (PR #106): `PostToolUse` on `Write|Edit` runs `lint-edited-file.sh` and `related-tests.sh`, and `Stop` runs `end-of-turn.sh` (`.claude/settings.json:3-17`). `test-plan.md` section 5 still says "recommended after Phase 4".
- `.husky/pre-push` runs `astro check` and `npm test` only and is bypassable with `--no-verify`.

## Desired End State

A pull request to `main` cannot be merged by anyone, including the owner, while `ci`, `smoke` or `integration` is red or missing. Each check is shown to turn red for the risks it protects. The test plan, decisions log and CLAUDE.md say exactly what is enforced and where. Verify by reading the ruleset (`gh api`), the break table in this folder, and `test-plan.md` sections 3-5.

### Key Discoveries:

- Job ids are the check names; renaming `ci` or `smoke` after they are required leaves the requirement pending forever (`research.md`, Architecture Insights).
- Required-check names must match the checks that run on the PR; a job with a path filter or skipped `if:` would also hang. `ci.yml` has neither today.
- `publish-image.yml` already gates the image on a green post-merge `CI` run (`publish-image.yml:3-15`); it stays untouched.
- `deploy-production.yml` does not check CI for the SHA (grep of the 134-line file finds no `gh run`, `check-runs` or `conclusion`); out of scope by owner decision.
- Phase 3 explicitly left "making them required" to this phase (`context/archive/2026-10-02-testing-access-and-input-abuse/plan.md:35`).
- Supabase CI exclusions must stay identical between the CI jobs and the Cursor VM note in `CLAUDE.md`, so the stack start is single-sourced.

## What We're NOT Doing

- No change to `deploy-production.yml` (gap recorded in `docs/decisions.md` as a follow-up; owner decision).
- No required reviews, no merge queue, no "require branches to be up to date" (owner decision; the push run on `main` catches two green PRs that break together).
- No new post-edit hook and no narrowing of the existing ones to `src/lib/services` (owner decision: adopt and prove the existing ones).
- No browser E2E, no mutation testing in the gate (`mutation.yml` stays report-only), no coverage thresholds.
- No change to production code, migrations or tests that are not part of a throwaway break.
- Not making `Sourcery review`, `code-review` or `claude-support` required: they are third-party or label-driven and often `skipped`.

## Implementation Approach

Order is chosen so each step can be verified against the real thing: first make the check names exist (split integration), then bring the local hook up to a proven state, then turn on the ruleset on a PR whose checks are green, then use throwaway draft PRs to prove the block and each risk's check, then document what is true. Phases 3 and 4 touch GitHub settings and throwaway PRs, so they pause for the owner. Every break is reverted by closing its throwaway PR and deleting its branch; nothing from a break reaches `main`.

## Critical Implementation Details

- **State sequencing**: create the ruleset only after this change's PR shows all three checks green, and before merging it. If the ruleset is created before the `integration` check has ever run, the PR stays blocked on a pending check. Recovery if CI itself breaks: set the ruleset enforcement to `disabled` in the GitHub settings (owner action, one click); record this in `docs/prerequisites.md`.
- **Timing**: add `timeout-minutes` to all three jobs so a hung job fails instead of leaving a required check pending indefinitely.

## Phase 1: Split integration into its own CI job

### Overview

Give the integration suite its own check name, so a red check says which suite broke, integration runs even when smoke fails, and all three can be required.

### Changes Required:

#### 1. Shared local-Supabase start

**File**: `.github/actions/local-supabase/action.yml` (new)

**Intent**: Single source for the reduced `supabase start` exclusion list and the `API_URL` / `ANON_KEY` extraction, so `smoke` and `integration` cannot drift apart and the Cursor VM note stays accurate.

**Contract**: A composite action with no inputs that runs `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor` and writes `supabase.env` containing only the `API_URL` and `ANON_KEY` lines (never secret or service-role keys), exactly as `ci.yml:36-38` does now.

#### 2. Workflow jobs

**File**: `.github/workflows/ci.yml`

**Intent**: Move `npm run test:integration` out of `smoke` into a new job `integration`, using the shared action; add `timeout-minutes` to `ci`, `smoke` and `integration`.

**Contract**: Three jobs with ids exactly `ci`, `smoke`, `integration` (these are the check names the ruleset will require; do not rename). `integration` checks out, sets up Node 22 with npm cache, runs `npm ci`, starts Supabase via the action, runs `npm run test:integration` with `SUPABASE_URL`/`SUPABASE_ANON_KEY` from `supabase.env`, and stops Supabase in an `if: always()` step. `smoke` keeps everything it has except the integration step. No `paths` filter, no job-level `if:`. Action SHA pins stay as they are.

### Success Criteria:

#### Automated Verification:

- Workflow and action files are formatted: `npx prettier --check .github`
- Lint, unit and type checks still pass locally: `npm run lint && npm test && npx astro check`
- On this change's PR the checks `ci`, `smoke` and `integration` are present and all success: `gh pr checks <pr-number>`
- The `smoke` job has no integration step: `gh run view <run-id> --json jobs --jq '.jobs[]|select(.name=="smoke")|[.steps[].name]'`

#### Manual Verification:

- The `integration` job log shows the suite's test files running and passing (not zero tests).
- PR wall-clock time for CI is acceptable (the two Supabase jobs run in parallel).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Post-edit check proof

### Overview

Turn "recommended after Phase 4" into a proven claim for the existing hooks, with a deliberate break in a service.

### Changes Required:

#### 1. Stale comment

**File**: `.claude/hooks/end-of-turn.sh`

**Intent**: Replace the "~2 s for 34 files" comment with a figure that does not go stale.

**Contract**: Comment-only change; behaviour and exit codes unchanged.

#### 2. Break proof for the hooks

**File**: none committed; run against a temporary break in one file under `src/lib/services`, reverted afterwards.

**Intent**: Show that `related-tests.sh` (per edit) and `end-of-turn.sh` (end of turn) exit 2 with the failing test named when a service regresses, and exit 0 when it does not, by piping the hook JSON on stdin exactly as Claude Code does.

**Contract**: Hook input is `{"tool_input":{"file_path":"<abs path>"}}` for `related-tests.sh`; exit code 2 plus stderr is the only combination the agent sees.

### Success Criteria:

#### Automated Verification:

- Clean service file, hook exits 0: `echo '{"tool_input":{"file_path":"'$PWD'/src/lib/services/bill-forecast.ts"}}' | .claude/hooks/related-tests.sh; echo $?`
- With a deliberate break in that service (reverted afterwards), the same command exits 2 and stderr names a failing test file.
- With the same break in the working tree, `echo '{}' | .claude/hooks/end-of-turn.sh; echo $?` exits 2 with "Unit tests fail".
- The break is gone afterwards: `git diff --stat -- src` is empty.

#### Manual Verification:

- In a live Claude Code session, editing a service so a test fails makes the agent see and react to the hook report.

**Implementation Note**: Pause for the human to confirm before proceeding to the next phase.

---

## Phase 3: Ruleset on `main`

### Overview

Turn the checks into a merge block, for everyone including the owner, with the ruleset definition kept in the repo as the record.

### Changes Required:

#### 1. Ruleset definition

**File**: `.github/rulesets/main-quality-gates.json` (new)

**Intent**: Committed record of the ruleset applied to `main`.

**Contract**: Target branch `main` (default branch), enforcement `active`, `bypass_actors: []`, a `required_status_checks` rule requiring contexts `ci`, `smoke`, `integration` with `strict_required_status_checks_policy: false` (branches need not be up to date; owner decision), no required reviews, and no force-push or deletion allowed on `main`.

#### 2. Apply and recover instructions

**File**: `docs/prerequisites.md`

**Intent**: Record the GitHub-side setting that lives outside the repo (lessons: name every prerequisite outside the repo), how to apply it (`gh api` with the JSON) and how to disable it if CI itself is broken.

**Contract**: A new section naming the ruleset, the three required checks, the apply command and the recovery step (set enforcement to `disabled` in repository settings, owner only).

### Success Criteria:

#### Automated Verification:

- The ruleset exists and is active with no bypass: `gh api repos/titusandronicu/energy-analyser/rulesets --jq '.[]|{name,enforcement}'` then `gh api repos/titusandronicu/energy-analyser/rulesets/<id> --jq '.bypass_actors'` returns `[]`
- The branch rules list the three required checks: `gh api repos/titusandronicu/energy-analyser/rules/branches/main --jq '[.[]|select(.type=="required_status_checks")|.parameters.required_status_checks[].context]'` returns `ci`, `smoke`, `integration`
- The committed JSON matches what GitHub reports for name, target, enforcement and the three contexts.

#### Manual Verification:

- On a draft PR with a red required check, the merge button is disabled and `gh pr merge` refuses, as the admin.
- This change's own PR (all green) can be merged normally afterwards.
- The recovery step (disable enforcement) is understood and works; re-enable afterwards.

**Implementation Note**: Pause for the human to confirm before proceeding to the next phase.

---

## Phase 4: Break proof, one per risk

### Overview

Prove each gate by a deliberate break that turns the right check red, and record which check and which test caught each risk. Throwaway draft PRs only; nothing merges.

### Changes Required:

#### 1. Break set

**File**: throwaway branches (for example `break/unit`, `break/integration`, `break/smoke`), never merged.

**Intent**: One small break per risk, chosen from the targets the existing tests already name, batched by the check expected to go red so a few CI runs cover all seven.

**Contract**: Target per risk (implementer picks the exact edit from the tests' own assertions):

- #1 stale-as-fresh: loosen a staleness threshold in a service in `src/lib/services` (expect `ci`, the staleness-surfaces table).
- #2 wrong money figure: weaken a plausibility or other-month guard in `src/lib/services/bill-forecast.ts` (expect `ci`).
- #5 boundary: use the UTC day instead of the Warsaw day in a calendar or period helper (expect `ci`, the boundary tables).
- #6 request guard: add a cookie-authenticated route such as `/api/auth/signin` to `TOKEN_AUTH_ROUTES` in `src/middleware.ts` (expect `ci`, the request-guard test); and a non-owner access break that the integration access tests catch, for example a temporary migration granting anon select on `ingest_pushes` (expect `integration`).
- #3 push-to-page: break a loader field mapping so a lab-shaped push no longer reaches its surface (expect `integration`).
- #4 history: the replay and out-of-order protection lives in SQL, not TypeScript (`handleIngest` only calls the RPC, `src/lib/services/ingest.ts:71`). Add a throwaway migration with a newer timestamp that does `create or replace function public.ingest_push` with the current body (latest definition: `supabase/migrations/20261001113911_period_summaries_keep_narration.sql`) minus the downgrade guard (expect `integration`, `history-safety`).
- #7 notes and lab text: change a notes limit in `src/lib/services/day-notes.ts` (expect `integration`, `notes-parity`, and the unit parity test) and render lab text as raw markup in one component (expect both `ci`, the static guard `src/lib/render-safety.test.ts`, and `smoke`, the escaping steps; record both).

#### 2. Break record

**File**: `context/changes/testing-quality-gates-wiring/breaks.md` (new)

**Intent**: A table of risk, break applied, check that went red, failing test or step name, run link, and that the merge was blocked.

**Contract**: One row per risk; every row names a check from `ci`, `smoke`, `integration`; closing note that all throwaway branches and PRs were deleted.

### Success Criteria:

#### Automated Verification:

- Every throwaway PR shows its expected check as failing: `gh pr checks <pr-number>`
- The failing log names the expected test or smoke step: `gh run view <run-id> --log-failed`
- Each throwaway PR is not mergeable: `gh pr view <pr-number> --json mergeStateStatus,mergeable`
- Nothing from a break is on `main`: `git diff origin/main -- src supabase` is empty after cleanup
- All throwaway PRs are closed and branches deleted: `gh pr list --state open --search "break/"` is empty

#### Manual Verification:

- The owner has read `breaks.md` and agrees each risk maps to a check that actually catches it.
- If a break did not turn its expected check red, the gap is logged in `breaks.md` and in `docs/decisions.md`, not hidden.

**Implementation Note**: Pause for the human to confirm before proceeding to the next phase.

---

## Phase 5: Docs say what is true

### Overview

Make the project docs match the enforced reality and mark the rollout phase complete.

### Changes Required:

#### 1. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Section 3 Phase 4 row to `complete` with the change folder path; section 4 "already required in CI" line and the section 5 gate table say what is enforced (three required checks, ruleset, admin bound) and that the post-edit hooks are recommended and proven; remove the "recommended after Phase 4" wording; fix the stale file counts if still present.

**Contract**: Table cells only change wording and status; no new rows except a "ruleset on `main`" gate row if one is missing.

#### 2. Decisions

**File**: `docs/decisions.md`

**Intent**: Dated entry: ruleset with admin bound, no up-to-date requirement, integration split, hooks adopted, deploy-gate gap left out of scope with the reason, and any gap found by a break.

**Contract**: One dated entry in the existing format, including one line that the ruleset requires check names, not workflow contents (a PR that edits `ci.yml` runs its own version of the workflow; accepted for a single owner).

#### 3. Agent and CI docs

**File**: `CLAUDE.md`, `README.md` if it describes CI

**Intent**: The "CI" section says CI has three jobs and that they are required by a ruleset; the Cursor VM note still points at the one place the Supabase exclusion list lives.

**Contract**: Wording changes only.

### Success Criteria:

#### Automated Verification:

- Formatting and lint pass: `npx prettier --check context/foundation/test-plan.md docs/decisions.md CLAUDE.md && npm run lint`
- Unit tests still pass: `npm test`
- Phase 4 row reads `complete`: `grep -n "Quality-gates wiring" context/foundation/test-plan.md`
- No stale wording left: `grep -n "recommended after" context/foundation/test-plan.md` returns nothing

#### Manual Verification:

- Reading test-plan sections 3-5 and the decisions entry gives the same picture as `gh api` shows.

---

## Testing Strategy

### Unit Tests:

- No new unit tests; the existing suites are the object under gate. Phase 2 and 4 temporarily break existing code and revert.

### Integration Tests:

- No new tests. Phase 1 changes only where the existing suite runs.

### Manual Testing Steps:

1. Open a draft PR with a deliberately red required check and try to merge it as admin; it must be refused.
2. Disable and re-enable the ruleset once to confirm the recovery path.
3. Make an edit that breaks a service in a live Claude Code session and confirm the hook report reaches the agent.

## Performance Considerations

The `integration` job adds a second Supabase start in parallel with `smoke`, so wall-clock time should not grow much; runner minutes grow by about one start per PR. The `smoke` job gets shorter by the integration run.

## Migration Notes

No data or schema changes. Rollout order matters: the `integration` job must have run green on the PR before the ruleset requires it. Recovery if CI itself is broken: disable the ruleset enforcement (documented in `docs/prerequisites.md`).

## References

- Related research: `context/changes/testing-quality-gates-wiring/research.md`
- Phase 3 deferral: `context/archive/2026-10-02-testing-access-and-input-abuse/plan.md:35`
- Existing hooks: `.claude/settings.json:3-17`, `.claude/hooks/`
- CI: `.github/workflows/ci.yml:3-55`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Split integration into its own CI job

#### Automated

- [x] 1.1 Workflow and action files are formatted: `npx prettier --check .github`
- [x] 1.2 Lint, unit and type checks still pass locally: `npm run lint && npm test && npx astro check`
- [ ] 1.3 On this change's PR the checks `ci`, `smoke` and `integration` are present and all success: `gh pr checks <pr-number>`
- [ ] 1.4 The `smoke` job has no integration step: `gh run view <run-id> --json jobs --jq '.jobs[]|select(.name=="smoke")|[.steps[].name]'`

#### Manual

- [ ] 1.5 The `integration` job log shows the suite's test files running and passing (not zero tests)
- [ ] 1.6 PR wall-clock time for CI is acceptable (the two Supabase jobs run in parallel)

### Phase 2: Post-edit check proof

#### Automated

- [ ] 2.1 Clean service file, hook exits 0
- [ ] 2.2 With a deliberate break in that service (reverted afterwards), `related-tests.sh` exits 2 and stderr names a failing test file
- [ ] 2.3 With the same break in the working tree, `end-of-turn.sh` exits 2 with "Unit tests fail"
- [ ] 2.4 The break is gone afterwards: `git diff --stat -- src` is empty

#### Manual

- [ ] 2.5 In a live Claude Code session, editing a service so a test fails makes the agent see and react to the hook report

### Phase 3: Ruleset on `main`

#### Automated

- [ ] 3.1 The ruleset exists, is active and has no bypass actors
- [ ] 3.2 The branch rules list the three required checks `ci`, `smoke`, `integration`
- [ ] 3.3 The committed ruleset JSON matches what GitHub reports for name, target, enforcement and the three contexts

#### Manual

- [ ] 3.4 On a draft PR with a red required check, the merge button is disabled and `gh pr merge` refuses, as the admin
- [ ] 3.5 This change's own PR (all green) can be merged normally afterwards
- [ ] 3.6 The recovery step (disable enforcement) is understood and works; re-enable afterwards

### Phase 4: Break proof, one per risk

#### Automated

- [ ] 4.1 Every throwaway PR shows its expected check as failing: `gh pr checks <pr-number>`
- [ ] 4.2 The failing log names the expected test or smoke step: `gh run view <run-id> --log-failed`
- [ ] 4.3 Each throwaway PR is not mergeable: `gh pr view <pr-number> --json mergeStateStatus,mergeable`
- [ ] 4.4 Nothing from a break is on `main`: `git diff origin/main -- src supabase` is empty after cleanup
- [ ] 4.5 All throwaway PRs are closed and branches deleted: `gh pr list --state open --search "break/"` is empty

#### Manual

- [ ] 4.6 The owner has read `breaks.md` and agrees each risk maps to a check that actually catches it
- [ ] 4.7 If a break did not turn its expected check red, the gap is logged in `breaks.md` and in `docs/decisions.md`, not hidden

### Phase 5: Docs say what is true

#### Automated

- [ ] 5.1 Formatting and lint pass: `npx prettier --check context/foundation/test-plan.md docs/decisions.md CLAUDE.md && npm run lint`
- [ ] 5.2 Unit tests still pass: `npm test`
- [ ] 5.3 Phase 4 row reads `complete`: `grep -n "Quality-gates wiring" context/foundation/test-plan.md`
- [ ] 5.4 No stale wording left: `grep -n "recommended after" context/foundation/test-plan.md` returns nothing

#### Manual

- [ ] 5.5 Reading test-plan sections 3-5 and the decisions entry gives the same picture as `gh api` shows
