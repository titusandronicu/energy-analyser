<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Main Landmark and Top-Level Heading on Every Page

- **Plan**: context/changes/page-landmarks-headings/plan.md
- **Mode**: Deep
- **Date**: 2026-09-29
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | WARNING |

## Grounding

7/7 paths ✓, 3/3 claims ✓ (Tailwind preflight resets `h1` size and weight, `node_modules/tailwindcss/preflight.css:78-84`; the auth pages are public, `src/middleware.ts:5`; `DashboardBody` is imported only by `src/pages/dashboard.astro`), brief↔plan ✓. The claim checks were run directly rather than by a sub-agent, given the five-file scope.

## Findings

### F1 — Grep checks would fail on their own comments

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 change 4 and check 1.6; Phase 2 check 2.2
- **Detail**: Check 1.6 expects no `<main` in `Layout.astro`, but change 4 adds a comment there about each page supplying its own main; a literal tag in that comment fails the check. The same applies to 2.2 (exactly three `<main` lines in `smoke.mjs`) if a step name or comment writes the tag.
- **Fix**: Change 4 and the Phase 2 contract say comments name "the main landmark" in words, not the literal tag.
- **Decision**: FIXED

### F2 — Stale "dev page" comment in the file being edited

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 change 1 (`src/components/DashboardBody.astro:21`)
- **Detail**: The comment says the body is shared "so /dashboard and the dev page render exactly the same body"; the dev page was deleted in the dashboard refresh. The plan noted this in Key Discoveries but did not fix it.
- **Fix**: Reword the comment to say it is the dashboard's page body, while that file is being edited.
- **Decision**: FIXED

### F3 — Manual checks need a signed-in dashboard

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 manual checks 1.9, 1.10, 1.12
- **Detail**: The dashboard checks assume a local stack with sign-in, which on the owner's Mac means Supabase through the UGREEN relay. The auth pages need only the dev server.
- **Fix**: The Phase 1 implementation note allows checking 1.9, 1.10 and 1.12 on production after the deploy when the local stack is not running.
- **Decision**: FIXED
