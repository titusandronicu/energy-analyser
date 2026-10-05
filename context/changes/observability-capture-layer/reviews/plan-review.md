<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Capture Layer Implementation Plan

- **Plan**: context/changes/observability-capture-layer/plan.md
- **Mode**: Deep
- **Date**: 2026-10-05
- **Verdict**: REVISE (SOUND after triage: all 8 findings fixed in the plan and brief on 2026-10-05)
- **Findings**: 0 critical, 5 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

28/28 existing paths ✓, 5/5 new paths free ✓, symbols ✓ (13 loader throws, 7 console sites, `APP_VERSION` at `astro.config.mjs:26`; `orLoadError` call sites 18 ≠ plan's 17), brief↔plan ✓, Progress↔Phase ✓ (5 phases, 22 rows identical). Verified in library source: throw propagation through `next()`, header mutability, auth-js error shapes, `Error` `cause` type-checks (target ESNext), no `App.Locals` mocks to break.

## Findings

### F1 — The 503 misses "/" and the plan has two mechanisms

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 (locals typing), Phase 4 (middleware, notes guard)
- **Detail**: Only `/dashboard*` and `POST /api/notes` get the 503. `src/pages/index.ts:12` redirects on `locals.user`, so during an outage the owner who opens "/" is still sent to `/auth/signin` with no message (the experience S1 describes, one hop earlier). The plan also builds the 503 for `/api/notes` twice: in the middleware path check and again in `notes.ts` via `locals.authUnavailable`; the second guard is unreachable because the middleware has already returned.
- **Fix A ⭐ Recommended**: One rule in the middleware covering "/" (exact), `/dashboard*` and `POST /api/notes`; delete `authUnavailable` from Locals and the notes.ts guard
  - Strength: One place decides and is tested; closes the bookmark path; removes a dead guard and a Locals field.
  - Tradeoff: Another route-aware rule lives in the middleware.
  - Confidence: HIGH — `index.ts` and `notes.ts:13` are the only `locals.user` readers besides the pages.
  - Blind spot: None significant.
- **Fix B**: Keep `locals.authUnavailable` and let `index.ts` and `notes.ts` each return the 503
  - Strength: Each route owns its behaviour.
  - Tradeoff: Two places to keep in step; a future user-gated route that forgets the check reintroduces S1.
  - Confidence: MEDIUM — works, repeats the plan's own pattern.
  - Blind spot: A future route that forgets the check.
- **Decision**: FIXED (Fix A)

### F2 — The logic that matters most is in the one untestable file

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 and Phase 4 (middleware.ts)
- **Detail**: `middleware.ts` imports `astro:middleware` and `astro:env/server`, which do not resolve under vitest, and there is no middleware test. Only the classifier and the 503 builder are unit-tested, so the behaviours that define success (503 only on an outage, silence on a missing session, redirect unchanged, id header always set) are verified only by manual steps 4.3 to 4.5.
- **Fix A ⭐ Recommended**: Extract the decision into a pure `decideAuth({ pathname, method, user, error })` in `auth-outage.ts` returning continue, redirect-signin or unavailable plus what to log; the middleware only applies it
  - Strength: Route rule, classification and silence rule are unit-tested; the middleware stays a few lines.
  - Tradeoff: One more small contract to design in Phase 4.
  - Confidence: HIGH — same pattern as `magic-link.ts` and the other services.
  - Blind spot: The thin wrapper itself (header, boundary) stays manual.
- **Fix B**: Add vitest aliases or stubs for `astro:middleware` and `astro:env/server` and test the real middleware
  - Strength: Tests the real file including header and boundary.
  - Tradeoff: New repo-wide test infrastructure; stubs can drift from Astro.
  - Confidence: MEDIUM — feasible, untried here.
  - Blind spot: Stubbed `next()` versus Astro's real behaviour.
- **Decision**: FIXED (Fix A)

### F3 — Log `path` must be the pathname, never the query

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — middleware context
- **Detail**: The plan puts `path` on every line. `/auth/confirm` carries the one-time `token_hash` and `code` in its query string, so a full URL would write a live login token into the log. The `origin_rejected` line also logs the received Origin, an unbounded attacker-controlled string.
- **Fix**: State that `path` is `context.url.pathname` only, cap the logged Origin at 200 characters, and add a manual check that a line for `/auth/confirm?token_hash=x` shows `/auth/confirm` without the query.
- **Decision**: FIXED

### F4 — "Every response carries X-Request-Id" overclaims

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State; brief "Desired End State"
- **Detail**: The header is set after `next()` returns, so the 500 page Astro renders after a rethrow, and a streamed body that errors mid-render, carry no id.
- **Fix**: Reword to "every response produced by a page, endpoint or middleware outcome carries X-Request-Id; Astro's 500 page after an unhandled error does not, and the logged line carries the id instead".
- **Decision**: FIXED

### F5 — Two verification commands are not shell-safe

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 criterion 2.2, Phase 3 criterion 3.3
- **Detail**: 2.2 uses unquoted `--include=*.ts` globs, which fail under zsh ("no matches found"); 3.3's pattern contains `\${error.message}` inside double quotes.
- **Fix**: 2.2 → `grep -rnE 'console\.(error|warn|log)' src | grep -v '\.test\.ts'` lists only `src/lib/logger.ts`; 3.3 → `grep -rnF 'failed: ${error.message}' src/lib/services | grep -v test` returns nothing. Update the matching Progress rows.
- **Decision**: FIXED

### F6 — Streaming render errors escape the boundary

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — error boundary
- **Detail**: With streaming on (`core/environment/production.js:48`), an error thrown while the template renders, after the component function returns, is stored in the stream and surfaces after `next()` has resolved (`render.js:167-169`). Frontmatter errors, where loader throws happen, are caught.
- **Fix**: Add one sentence to "What We're NOT Doing": errors thrown after the first byte of a streamed body are not seen by the boundary (Astro logs them).
- **Decision**: FIXED

### F7 — The stack is logged twice

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — rethrow
- **Detail**: The boundary logs `unhandled_error` and rethrows; Astro's handler then logs the same stack in its own text format (`routing/handler.js:102`). Two lines per error, only one with the request id.
- **Fix**: Accept it and say so in the plan: the JSON line is the one with the request id; Astro's raw line duplicates the stack.
- **Decision**: FIXED

### F8 — orLoadError has 18 call sites, not 17

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State, Phase 3, brief
- **Detail**: `dashboard.astro` has 8 (including the nested daily-row-time call) and `history.astro` has 10, so 18. The plan and brief say 17.
- **Fix**: Correct to 18 (8 + 10) in the plan and the brief.
- **Decision**: FIXED

## Triage summary

Fixed: F1 (Fix A), F2 (Fix A), F3, F4, F5, F6, F7, F8 (8). Skipped, accepted, dismissed: none. Plan Progress now has 24 rows (new: 2.5 query string never logged, 4.6 `GET /` returns the 503 during an outage); criteria 2.2, 3.3 and 4.1 were reworded and kept identical in Progress.
