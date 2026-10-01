<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Time and number guards (test plan Phase 1)

- **Plan**: context/changes/testing-time-and-number-guards/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

Automated verification re-run for the review (worktree `energy-analyser-wt-testing`, branch `testing-time-and-number-guards`, 5 commits on `origin/main`): `npm test` 1195 passed, `npm run lint` clean, `npx astro check` 0 errors, `npm run build` ok, both Phase 4 doc greps match. All 25 Progress rows are ticked, including the manual rows 1.6, 1.7, 2.6, 4.6 and 4.7, each confirmed by the owner. Plan-drift review: every planned item MATCH apart from F5's delivery detail; each plan item skipped because the stryker tests already pin it was confirmed pinned by a named existing test; no "What We're NOT Doing" item was violated; the new fixture contains none of the real example's figures.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — The ceiling rows for central and low claim coverage they don't have

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `src/lib/services/bill-forecast.test.ts`, plausibility-ceiling block (central and low rows)
- **Detail**: In every row the high end equals the central (7000 or 7000.01), so the row fails only through `high`. If `central` and `low` were dropped from the ceiling's `Math.max`, all rows would still pass, so the names and the plan's "central, low or high" claim overstate the coverage. The ordering check refuses a lone central or low above the ceiling first.
- **Fix A ⭐ Recommended**: Rename or merge the rows so they say "high end", and state in a comment that central and low are covered by the ordering check
  - Strength: Test names match what they protect; no production change.
  - Tradeoff: The ceiling's `central` and `low` terms stay as unpinned redundancy.
  - Confidence: HIGH — the ordering check makes them unreachable alone.
  - Blind spot: None significant.
- **Fix B**: Also drop `central` and `low` from the `Math.max` in `bill-forecast.ts`
  - Strength: No code that no test can protect.
  - Tradeoff: Loses a second line of defence if the ordering check is ever reordered.
  - Confidence: MEDIUM — depends on whether the ordering check stays first.
  - Blind spot: Other callers' reliance on the current order.
- **Decision**: FIXED (Fix A: rows renamed to the high end, comment on the ordering check)

### F2 — One row of the cross-surface table is a tautology

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `src/lib/services/staleness-surfaces.test.ts:86-88, 133` (and the age loop at `:178-195`)
- **Detail**: The bill-forecast adapter hardcodes `isStale` from the view kind and derives the outcome from the same kind, so for that surface `isStale === (outcome !== "current")` can't fail. For the exactly-at-threshold rows (`-5 MINUTE`, `30 MINUTE`) any forecast view passes, whatever its tone. The loop over ages sits inside one `it`, so a failure doesn't name the age.
- **Fix**: Pin `view.status.tone` and `isOtherMonth === false` for the current forecast rows, and turn the age loop into `it.each`.
- **Decision**: FIXED (tone and isOtherMonth pinned for current forecast rows, age loop is it.each)

### F3 — The sign guard doesn't cover negative closed-month amounts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/bill-forecast.ts:374-378`
- **Detail**: The new guard checks central, low and high, but a stored row with a negative `invoice_gross_pln` or `computed_gross_pln` passes it. A negative invoice would drive the verdict to "good" and the delta oddly, the same shape as the inflated-invoice hole the ceiling extension closed. The contract rejects negatives there today, so this is defence in depth only, like the guard it parallels.
- **Fix**: Extend the sign guard to the readable closed-month amounts, and add one test per amount.
- **Decision**: FIXED (sign guard covers closed-month amounts, one test per amount, break-checked)

### F4 — Real household values appear in the new tests' comments and base data

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: `src/lib/services/bill-forecast.test.ts:938, 948` (new known-gap tests), `src/lib/ingest/bill-forecast-fixtures.test.ts:78`; `docs/decisions.md` 2026-10-01 entry
- **Detail**: The plan says no real household or lab values in any new fixture or test. The new fixture is clean, but the two known-gap tests quote 193.9 kWh × 1.0991 + 44.62 from the shared `okRow` base (which derives from the example the plan treats as real), and a fixtures-test comment cites 214.66. The `decisions.md` line "none copies its values" is true for the fixture but not for these comments. The tariff rates are public; the 193.9 kWh and the invoice figure are household figures.
- **Fix A ⭐ Recommended**: Rewrite the two known-gap tests and the comment with invented figures, and make the decisions line say exactly what is clean
  - Strength: Matches the plan's rule and does not widen the exposure in new lines.
  - Tradeoff: A little more edit work; the shared `okRow` base keeps its old values until the scrub.
  - Confidence: HIGH — the new lines are small and self-contained.
  - Blind spot: Other new comments that reuse `okRow` figures were not all enumerated.
- **Fix B**: Keep the tests and correct only the `decisions.md` wording, noting the `okRow` base is covered by the scrub follow-up
  - Strength: No test edits; honest docs.
  - Tradeoff: New lines still quote household figures in a public repo.
  - Confidence: MEDIUM — depends on how strict the rule should be for derived comments.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A: known-gap tests and fixtures comment use invented figures, decisions.md wording corrected; okRow base left for the scrub follow-up)

### F5 — Component wiring is covered only by the manual check

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/components/RecommendationCard.astro:43-52, 62`; `src/components/RecommendationForecast.astro`
- **Detail**: The clock-error paragraph and the `isFromEarlierDay || isFutureDated` label prop are asserted by no test, only by manual check 1.7. The plan's Contract implied the label change lives in `RecommendationForecast.astro`; the behaviour is delivered through the card's prop and that file got only a comment. No behaviour drift.
- **Fix**: Accept; a browser test for the card belongs to a later test-plan phase.
- **Decision**: SKIPPED (accepted; browser test belongs to a later test-plan phase)

### F6 — The live state has no future guard and nothing would flip if one is added

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `src/lib/services/staleness-surfaces.test.ts:101-108`
- **Detail**: The live-state rows pin only the within-skew case, which the plan allows. A `captured_at` beyond the skew reads "aktualne" and there is no KNOWN GAP test, unlike the other known gaps.
- **Fix**: Add one KNOWN GAP row for a live `captured_at` beyond the skew.
- **Decision**: FIXED (KNOWN GAP row for a live captured_at beyond the skew)

### F7 — Overlapping tests

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/services/recommendation.test.ts:268-280` and `src/lib/services/staleness-surfaces.test.ts:178`
- **Detail**: The 5-minute edge is pinned in four places and the historical case twice. Cross-surface duplication is intended; the historical duplicate is redundant. The plan's Testing Strategy also mentions a `nav` extension that no phase requires.
- **Fix**: Accept; optionally drop the redundant historical duplicate.
- **Decision**: FIXED (redundant historical duplicate removed from recommendation.test.ts; isFutureDated assertion moved to the table)

### F8 — Progress SHAs point at pre-rebase commits

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/testing-time-and-number-guards/plan.md` Progress rows
- **Detail**: The four distinct SHA suffixes (`1d05696`, `6bdc785`, `2bfb89c`, `81215a6`) are not in HEAD's history because the branch was rebased before its first push. The PR body says so.
- **Fix**: Accept; `/10x-archive` repoints them to the merge commit.
- **Decision**: SKIPPED (accepted; archive repoints the SHAs)
