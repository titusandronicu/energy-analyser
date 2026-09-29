<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Recommendation card refresh

> Triage complete 2026-09-29: F1-F5 fixed in plan.md and plan-brief.md.

- **Plan**: context/changes/recommendation-card-refresh/plan.md
- **Mode**: Deep (one subagent)
- **Date**: 2026-09-29
- **Verdict**: REVISE
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

14/14 paths, 10/10 symbols (line cites match), brief↔plan consistent, Progress mapping exact for all four phases, every Automated command runnable locally (`npm run smoke` is CI-only and marked so). Verified without findings: `local_findings` contract and guards, blast radius of `RecommendationView` and `ForecastCard`, `VerdictChip` props, fixture test discovery, `unique(generated_at)` with `on conflict do nothing`, no time bounds on `recommendation.generated_at`, CSS-only motion pattern. Not verified: lucide `ChevronDown` in 1.14, `group-aria-expanded:` in this Tailwind setup, real stored advice shape in production, no commands were run.

## Findings

### F1 — Fixtures and dev page arrive after the card that needs them

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 manual 2.7-2.10, Phase 3 item 4 and 3.11, Phase 4 4.8
- **Detail**: Phase 2 manual checks need an earlier-day card, more than five findings, empty and failed states and 390px overflow, but fixtures, the `--generated-at` flag and the dev page only appear in Phase 3. The dev page is deleted before the Phase 3 commit (3.11), yet Phase 4 item 4.8 re-shoots screenshots and needs it. `--generated-at` is not usable locally without Docker.
- **Fix A ⭐ Recommended**: Move fixtures, the push flag, the fixture test and the dev page into Phase 2 (or a new leading step); keep the dev page uncommitted until the end of Phase 4 and delete it there (3.11 moves to 4.x).
  - Strength: every manual gate has data; one dev page serves both screenshot passes.
  - Tradeoff: Phase 2 grows and Phase 3 shrinks to screenshots and contrast.
  - Confidence: HIGH — repeats the earlier "fixtures too late" lesson.
  - Blind spot: the dev page needs the middleware's Supabase call to fail softly without the local stack (unverified).
- **Fix B**: Keep the order and reword 2.7-2.10 as "temporary hard-coded view in the dev page".
  - Strength: no reordering.
  - Tradeoff: throwaway data; 4.8 still lacks the page.
  - Confidence: MED — reuses less.
  - Blind spot: none significant.
- **Decision**: FIXED (Fix A)

### F2 — Stale advice still shows live-looking chips

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Desired End State, Phase 2 findings section
- **Detail**: only motion is gated on `isCurrent`. An earlier-day recommendation (tone problem, "dotyczy innego dnia") still renders a green "Dobrze" and amber "Warto sprawdzić" chips as current facts, which contradicts "never looks live". The lab's fallback finding is `ok`, so the green chip is the most likely one on a stale card.
- **Fix A ⭐ Recommended**: when `isStale`, render every finding chip in the neutral tone but keep the word; add the case to the mapper tests and the `earlier-day` screenshot.
  - Strength: colour never claims freshness.
  - Tradeoff: warn severity loses its colour on stale cards.
  - Confidence: MED — the owner decides the wording.
  - Blind spot: whether the owner wants warn colour on older days.
- **Fix B**: keep the chips and rely on the `stale-warning` line and the status badge; record the choice in `docs/decisions.md`.
  - Strength: no new rule.
  - Tradeoff: a green chip beside a red "z 22 września" badge.
  - Confidence: MED.
  - Blind spot: none significant.
- **Decision**: FIXED (Fix A)

### F3 — First-block rule hides the whole list after a colon intro line

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (first-block rule), Phase 1 item 2
- **Detail**: the parser flushes a paragraph when a list item starts (`advice-markdown.ts:58-60`; test at `advice-markdown.test.ts:60`), so "Zalecenia na dziś:\n- a\n- b" gives a paragraph then a list; the lead is only the intro line and every actionable item goes behind the disclosure. Conversely a lead that is one long list can be the entire 4000 characters. Neither case is in the split tests.
- **Fix**: in `splitAdviceLead`, when the lead's last block is a one-line paragraph ending in ":" and the next block is a list, include that list in the lead; add both cases to the split tests and to a fixture.
- **Decision**: FIXED (Fix in plan)

### F4 — `--generated-at` edge cases are unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 item 2
- **Detail**: the default state-only push strips `recommendation` (`push-fixture.mjs:70-77`), so the flag silently does nothing without `--file` or `--full`; the `usage` string (:33-34) is not in the plan's change list; it is not said whether a silent rewrite is logged (compare :131-134) or how the flag interacts with `--captured-at`.
- **Fix**: exit with an error when the body has no `recommendation`, as `--shift-days` does (:114-117); print a line when the value is rewritten; update the header and the `usage` constant.
- **Decision**: FIXED (Fix in plan)

### F5 — Truncation boundary undefined

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details, Phase 1 tests
- **Detail**: "cut at 500 characters with an ellipsis" allows a 500- or 501-character result; trim order and the exact 500 versus 501 test are not fixed. The branch is unreachable for contract-valid rows (strings are capped at 500, `contract.ts:16`), so only a unit test can exercise it.
- **Fix**: state the rule as "trim, then if the length exceeds 500 use the first 499 characters plus '…'" and pin it in the 500/501 test.
- **Decision**: FIXED (Fix in plan)
