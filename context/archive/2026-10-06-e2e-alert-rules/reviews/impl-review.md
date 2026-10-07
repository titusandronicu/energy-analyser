<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: First Browser E2E Test: The Owner Manages an Alert Rule

- **Plan**: context/changes/e2e-alert-rules/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Success criteria re-run on main at 21f9a15: e2e 6/6, repeated 26/26, teardown left 0 users, lint / astro check / prettier clean, forbidden-pattern grep empty, unit 54 files / 1767 tests, integration 10 files / 113 tests, `test:e2e` named in all four docs. Manual rows evidenced by PRs #139 and #141. Drift review: every planned item MATCH; nothing under src/ touched; ruleset unchanged.

## Findings

### F1 — The database host guard can be bypassed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/support/env.ts:81-86 (same flaw in tests/integration/support/privileged.ts:24)
- **Detail**: The guard checks only `new URL(raw).hostname`, but the pg driver lets a query parameter override it: `?host=db.example.com` connects to that host while the guard sees 127.0.0.1 (reproduced). Exposure needs a crafted SUPABASE_DB_URL; the teardown's DELETE is the destructive statement behind it.
- **Fix**: Reject any connection URL whose query string contains `host`, `hostaddr` or `port`, in both files.
  - Strength: Closes the bypass where the rule lives; both guards are copies of each other.
  - Tradeoff: A legitimate URL using those parameters is refused (not realistic for a local stack).
  - Confidence: HIGH — the bypass was reproduced.
  - Blind spot: A port-forward to a remote database on 127.0.0.1 is invisible to any host check.
- **Decision**: FIXED (PR #143, fix/e2e-guard-hardening, 2026-10-06)

### F2 — The teardown deletes whatever email is in the file

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/global.teardown.ts:12-22
- **Detail**: No check that the email is an e2e one; a hand-edited or stale owner-email.txt could delete any matching user. The DELETE is parameterised and scoped to one row and the database is local, so exposure is low.
- **Fix**: Assert `/^e2e-\d+-[0-9a-f]{8}@example\.com$/` before the query and add `and email like 'e2e-%@example.com'` to the SQL.
- **Decision**: FIXED (PR #143, fix/e2e-guard-hardening, 2026-10-06)

### F3 — .dockerignore lacks the session folder

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .dockerignore
- **Detail**: It lists the report folders but not tests/e2e/.auth, so `COPY . .` would send owner.json (session cookies) to the Docker daemon in a local build. A plan gap: the plan listed only the three report folders.
- **Fix**: Add `tests/e2e/.auth` to .dockerignore.
- **Decision**: FIXED (PR #143, fix/e2e-guard-hardening, 2026-10-06)

### F4 — A cleanup error can hide the real failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/alert-rules.spec.ts (the two finally blocks)
- **Detail**: If a test fails because the page is broken, the delete in `finally` throws too and its error replaces the real assertion error.
- **Fix**: Make the cleanup unable to mask, `.catch(() => undefined)` on the delete; the teardown cascades anyway.
- **Decision**: FIXED (PR #143, fix/e2e-guard-hardening, 2026-10-06)

### F5 — A failing build or startup leaves no trace

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: playwright.config.ts:34-43 and tests/e2e/global.teardown.ts
- **Detail**: The webServer output is not piped, so a failed build reports only "Timed out waiting for webServer". The teardown's connect error also lacks the relay hint privileged.ts gives.
- **Fix**: Set `stdout: "pipe"` and `stderr: "pipe"`, and wrap the teardown's connect error with the relay hint.
- **Decision**: FIXED (PR #143, fix/e2e-guard-hardening, 2026-10-06)

### F6 — Failure artifacts live for 90 days

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml (upload step)
- **Detail**: A trace can contain the throwaway sign-up body and cookies of the throwaway user; the stack is destroyed at job end so nothing real leaks, but a public repo's artifacts are downloadable.
- **Fix**: Add `retention-days: 3`.
- **Decision**: FIXED (PR #143, fix/e2e-guard-hardening, 2026-10-06)

### F7 — Three copies of the same guards must change together

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/support/env.ts, tests/integration/support/stack.ts, tests/integration/support/privileged.ts
- **Detail**: F1 is exactly this failure mode: one flaw lives in two copies. A single shared pure module would fix it structurally but is a refactor beyond this change.
- **Fix**: Record it as a follow-up; F1 fixes both copies now.
- **Decision**: ACCEPTED-AS-RULE: A safety guard that exists as copies is fixed in all copies at once (context/foundation/lessons.md, PR #143); the shared-module refactor is queued in follow-ups/review-fixes.md

## Triage summary

- Fixed: F1-F6 (6), in PR #143; F1 also gained a 28-case guard test (tests/integration/db-url-guard.test.ts) proven red by a deliberate break
- Rule: F7 (+ lesson); the GitHub-scheduler lesson from the alert-rules review was added with it
- Skipped / Dismissed: none
