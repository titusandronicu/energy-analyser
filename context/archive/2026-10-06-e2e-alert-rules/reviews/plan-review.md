<!-- PLAN-REVIEW-REPORT -->

# Plan Review: First Browser E2E Test: The Owner Manages an Alert Rule

- **Plan**: context/changes/e2e-alert-rules/plan.md
- **Mode**: Deep
- **Date**: 2026-10-06
- **Verdict**: REVISE
- **Findings**: 0 critical, 8 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

16/16 paths ✓, 4/4 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (16 rows, 1:1). Verified OK: cookie replay works (the app sets `secure` only when APP_ORIGIN is https, `src/lib/supabase.ts:44-48`); the build needs no env; neither vitest config collects `tests/e2e`; the ruleset allows a non-required job; `AGENTS.md` is a symlink to `CLAUDE.md`.

## Findings

### F1 — test-plan.md has more stale passages than the plan lists

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3, item 2
- **Detail**: The plan edits the tools-table row, §6.3 and the ledger. The file also says browser e2e is "not in the rollout" (§3, L93-95), risk #3's anti-pattern column warns against "promoting the check to a browser" (L58), the §5 gates table has no `e2e` row, the test-base profile says pages have no tests (L118-121) and the "Last updated" line is stale. Left alone the document contradicts itself.
- **Fix**: List those passages in the Phase 3 contract: add a risk #8 (the page's forms and the route's expected fields drift apart) with browser e2e as its cheapest layer, a Phase 5 row in §3, a non-required `e2e` row in the §5 gates table, scope the #3 wording, and bump the dates.
  - Strength: Matches the file's own refresh convention and makes the justification explicit.
  - Tradeoff: A longer docs edit in Phase 3.
  - Confidence: HIGH — the passages are quoted with line numbers from the file.
  - Blind spot: Whether the owner would rather keep §3 "frozen" and note the exception elsewhere.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F2 — Docs that say "three jobs" would become wrong

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3, item 3
- **Detail**: `README.md:149`, `docs/prerequisites.md:112,116` and `CLAUDE.md:67` (one edit; AGENTS.md is a symlink) enumerate the CI jobs, and `README.md:53-56` has a test-layer table. The plan only adds the command to these files.
- **Fix**: Add those lines to the Phase 3 contract: the job counts ("plus a non-required `e2e` job") and a table row.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F3 — Two criteria can't run at their gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Criteria 1.4 and 3.3
- **Detail**: 1.4 describes a database count but gives no command. 3.3 (`gh pr checks`) needs an open PR, which exists only after the commit, while the implement ritual runs its gates before committing.
- **Fix**: Give 1.4 a concrete one-liner (node with `pg` against the local Postgres) and move 3.3 to the Manual list, worded as "after the PR is open".
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F4 — The lockfile isn't mentioned

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, item 1
- **Detail**: Adding `@playwright/test` changes `package-lock.json`, which is tracked and used by `npm ci` in every CI job and the Dockerfile.
- **Fix**: Name the lockfile in the Contract and the file list.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F5 — Nothing says how to supply Supabase env locally

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, item 2
- **Detail**: Playwright does not load `.env`, and the config refuses to start without `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The repo's existing recipe (`docs/prerequisites.md:26`, `test-plan.md:181`) is not referenced.
- **Fix**: Put the recipe (`scripts/remote-docker.sh exec npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)='`) in the config's error message and in `test-stack.md`.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F6 — A reused server could test a stale build

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, item 2 and Phase 2, item 2
- **Detail**: With `reuseExistingServer: !CI` a leftover server on 4321 is reused locally, so the deliberate markup break would not be picked up and would prove nothing.
- **Fix**: Set `reuseExistingServer: false` always, so a taken port fails loudly.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F7 — A failed sign-in leaves a user behind

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, item 3
- **Detail**: The setup creates the user, then writes the email file only after the sign-in works. If the sign-in fails, the teardown has no email and the user stays in the database.
- **Fix**: Write the email file right after the signup response, before signing in.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F8 — Random thresholds can collide, and large ones may render differently

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2, item 1
- **Detail**: The three tests share one owner and a unique key on (kind, threshold); independent random draws in 15-1440 collide rarely but not never, and values of 1000 or more may render with a thousands separator, making a text assertion brittle.
- **Fix**: Give each test its own fixed range below 1000 with a random value inside it.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F9 — The invalid-threshold test is not a drift detector

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2, item 1
- **Detail**: If the form field is renamed every submit is invalid, so this test stays green for the wrong reason. The plan's break correctly expects only the lifecycle and duplicate tests to go red.
- **Fix**: State in the spec contract that the invalid test guards the refusal message only.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

### F10 — .dockerignore does not exclude the new output

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, item 6
- **Detail**: It does not list `tests/`, `playwright-report/` or `test-results/`, so they enter the Docker build context. Harmless bloat.
- **Fix**: Add the report folders to `.dockerignore` in the housekeeping step.
- **Decision**: FIXED (2026-10-06, in plan.md and plan-brief.md)

## Triage summary

- Fixed: F1-F10 (10)
- Skipped / Accepted / Dismissed: none
- Verdict after fixes: REVISE -> SOUND
- Note: Progress rows 1.4 and Phase 3 were reworded and renumbered together with their Success Criteria (3.3 moved to Manual as 3.4); nothing had been executed yet, so the one-to-one mapping holds (16 rows).
