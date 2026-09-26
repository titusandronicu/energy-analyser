<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Usage Norm as a Median, with Ranges and a Sense of Scale

- **Plan**: context/changes/usage-norm-scale/plan.md
- **Mode**: Quick (retrospective plan; code already verified by `reviews/impl-review.md`)
- **Date**: 2026-09-26
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 1 critical, 1 warning, 1 observation

Note: run after implementation, at the owner's request (impl-review F2), so every workflow step has an artifact. `change.md` keeps `status: impl_reviewed` rather than stepping back to `plan_reviewed`.

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

7/7 paths ✓, 5/5 symbols ✓ (median, meaningOf, bandOf, referenceUsageSentence, UsageMeaning), no plan-brief.

## Findings

### F1 — Phase 1 verification bullets have no Progress rows

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria / Progress
- **Detail**: "Unit tests pass", "Lint and types pass" and "Build passes" have no matching `1.N` rows, breaking the Progress contract.
- **Fix**: Add rows 1.4–1.6, ticked with f1f0c25 (verified in the implementation review).
- **Decision**: FIXED

### F2 — Plan does not record the implementation-review fixes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phases / Progress
- **Detail**: Two-decimal kWh at edges, one decimal at +40%, the verdict in the view model, and the wording and docs fixes landed after f1f0c25 but are not in the plan, so the archived plan would describe code that no longer exists.
- **Fix ⭐ Recommended**: Add "Phase 3: Implementation-review fixes" with Changes Required and Progress rows; SHA suffixes are added when the fixes are committed.
  - Strength: The plan stays the single source of truth; archive coverage is explicit.
  - Tradeoff: The plan grows a phase that was not planned up front.
  - Confidence: HIGH — the Progress contract allows new steps and phases.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — Autumn lag not tracked

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing
- **Detail**: The trailing 30-day median lags when heating starts; the plan excludes it but nothing tracks it.
- **Fix**: Add it as item 3 in `follow-ups/review-fixes.md`.
- **Decision**: FIXED
