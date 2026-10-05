<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Testing Phase 4: Quality-gates wiring

- **Plan**: context/changes/testing-quality-gates-wiring/plan.md
- **Mode**: Deep (claims checked directly against the code; no sub-agent needed for this size)
- **Date**: 2026-10-05
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

13/13 existing paths ✓ (new files `.github/actions/...`, `.github/rulesets/...`, `breaks.md` are intended), symbols ✓ (`TOKEN_AUTH_ROUTES`, `render-safety.test.ts`, `handleIngest`), brief↔plan ✓, Progress↔Phase 29/29 rows ✓ (one `## Progress`, five `### Phase N`, no checkboxes in phase blocks).

## Findings

### F1 — Break #4 targets the wrong layer

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 4, break set, #4
- **Detail**: The plan says to remove replay or out-of-order protection "in the ingest path the integration `push()` mirrors". `handleIngest` only calls the `ingest_push` RPC (`src/lib/services/ingest.ts:71`); the protection is in SQL (latest definition in `supabase/migrations/20261001113911_period_summaries_keep_narration.sql` and earlier ones). A TypeScript edit cannot break it, so the implementer would have to guess.
- **Fix**: Name the target: a throwaway migration (newer timestamp, `create or replace function public.ingest_push`) that copies the current body minus the downgrade guard; expect `integration` red in `history-safety`. Delete the migration with the branch.
- **Decision**: FIXED (applied)

### F2 — Break #7 will turn two checks red, not one

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4, break set, #7
- **Detail**: Rendering lab text through `set:html` is caught first by the static guard `src/lib/render-safety.test.ts` (check `ci`), and also by the smoke escaping steps (`scripts/smoke.mjs:292-297`). The plan expects only `smoke`, so a red `ci` would look like a mismatch.
- **Fix**: Expect both `ci` (render-safety) and `smoke` for the raw-markup break, and record both in `breaks.md`.
- **Decision**: FIXED (applied)

### F3 — The gate is only as strong as the workflow in the PR

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Desired End State; Phase 5 decisions entry
- **Detail**: `pull_request` runs use the workflow file from the PR itself, so a PR that edits `ci.yml` (for example making `integration` trivially pass) still satisfies the required names. A deleted job leaves the check missing and blocked. With a single owner this is accepted, but it is the limit of "required".
- **Fix**: One line in the `docs/decisions.md` entry: the ruleset requires check names, not workflow contents.
- **Decision**: FIXED (applied)

### F4 — "Exactly three checks" ignores third-party checks

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 criterion 1.3
- **Detail**: PR rollups also show `Sourcery review` (skipped) and label-driven jobs, so "exactly" would never be literally true.
- **Fix**: Reword to "the checks `ci`, `smoke` and `integration` are present and success"; Progress title 1.3 is not yet executed so it may be edited now.
- **Decision**: FIXED (applied)
