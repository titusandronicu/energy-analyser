<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Refactor follow-ups

- **Plan**: context/changes/refactor-followups/plan.md
- **Mode**: Deep
- **Date**: 2026-10-07
- **Verdict**: REVISE (SOUND after the fixes below)
- **Findings**: 0 critical, 5 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

17/17 paths ✓, 2/2 symbols ✓, Progress↔phases 5/5 ✓, brief↔plan ✓

## Findings

### F1 — Nothing in the repo loads the real supabase.ts in a test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Blind Spots
- **Location**: Phase 4, change 2
- **Detail**: middleware.test.ts mocks supabase.ts itself, so loading `@supabase/ssr` and `@supabase/supabase-js` in vitest is unproven; all five astro:env values must be mocked.
- **Fix**: Mock `astro:env/server` with all five values and mock both Supabase packages with spy factories; CI smoke covers real client creation.
- **Decision**: FIXED (applied as proposed)

### F2 — Moving the calendar copy silently weakens an existing guard test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Blind Spots
- **Location**: Phase 3, change 1
- **Detail**: calendar-view.test.ts:40 and L772-775 scan every exported string of `./calendar-view` for /zawyżon\w* od/i; after the move that scan would no longer see the moved strings.
- **Fix**: Also scan `import * as calendarCopy from "./calendar-copy"`; criterion 3.3 updated.
- **Decision**: FIXED (applied as proposed)

### F3 — The buildNodes characterization has no mechanism yet

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Plan Completeness
- **Location**: Phase 3, change 2
- **Detail**: `buildNodes`/`NodeData` are not exported; no test imports a .tsx from src/components; the live-flow fixture helpers are private; icons need identity comparison.
- **Fix**: Temporarily export both for the pre-move test, hand-build props, compare icons by identity; fallback is to move first and prove equality with a one-off script.
- **Decision**: FIXED (applied as proposed)

### F4 — Phase 1 misses an importer of the removed re-export

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1, change 2
- **Detail**: `tests/integration/support/keys.ts:2` imports `HOUR_MS` from warsaw-time.
- **Fix**: Added to the files list; check with the type check since two importers use multi-line imports.
- **Decision**: FIXED

### F5 — The Phase 2 grep criterion is wrong as written

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 2, criterion 2.1
- **Detail**: the grep also hits `live-state.test.ts:342` (a day string) and `contract.ts:70` (out of scope).
- **Fix**: Criterion restated to expect only `age.ts`, `contract.ts` and the day string; the contract names both as out of scope.
- **Decision**: FIXED

### F6 — Phase 4 contradicts two recorded statements

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: tests/support/local-guards.ts:5-6, docs/decisions.md
- **Detail**: both say supabase.ts keeps its own check, "not shared".
- **Fix**: Header comment rewritten and the decision entry amended in phase 4.
- **Decision**: FIXED

### F7 — Rollback story, verified

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM
- **Dimension**: Blind Spots
- **Location**: Phase 5
- **Detail**: /api/health goes through the middleware (middleware.ts:38), so a throwing check fails the deploy check (deploy-production.yml:116-123) and the compose healthcheck; rollback restores the image and release.env, not .env.runtime; the old image accepts the `other` class.
- **Fix**: Recorded in phase 5 docs and prerequisites.
- **Decision**: FIXED

### F8 — New security-relevant rule is outside the mutation-test set

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 4
- **Detail**: stryker.config.mjs `mutate` is an explicit file list that does not include a new `src/lib/anon-key.ts`.
- **Fix**: Phase 4 change 5 adds the entry.
- **Decision**: FIXED
