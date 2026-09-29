<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Recommendation card refresh

- **Plan**: context/changes/recommendation-card-refresh/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-29

> Triage complete 2026-09-29: F1-F4, F6, F8 fixed; F5, F7 accepted.

- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Plan adherence: 21 of 21 planned change areas MATCH, 0 DRIFT, 0 MISSING, one benign EXTRA file (`AdviceBlocks.astro`, allowed by the plan). "What We're NOT Doing" is respected. Automated gates: `npm test` 480 passed, `npm run lint` clean, `npx astro check` 0/0/0, `npm run build` passes; CI `ci` and `smoke` green on PR 59.

## Findings

### F1 — Chevron still rotates with reduced motion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/DisclosureButton.tsx:41
- **Detail**: The chevron uses `transition-transform duration-200` when `animate` is true. The reduced-motion rule in `global.css` disables `animation` only, so a user with reduced motion still sees the rotation on a current recommendation. Contradicts the comment in `global.css` that the override covers every reuse and plan criterion 4.7 ("nothing animates").
- **Fix**: Use `motion-safe:transition-transform` (or add a `.transition-transform` override to the reduced-motion block).
- **Decision**: FIXED (motion-safe on the chevron transition)

### F2 — Findings beyond the fifth appear twice in the disclosure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/RecommendationCard.astro:22-24, 94-98
- **Detail**: `explained` is built from `[...findings, ...moreFindings]` filtered on meaning or suggested check, and `moreFindings` is then listed again under "Pozostałe ustalenia". A sixth or later finding that has a `meaning` shows under both headings (up to 50 findings).
- **Fix A ⭐ Recommended**: Build `explained` from `findings` only and show the meaning and check inline under each item in "Pozostałe ustalenia".
  - Strength: every finding appears once and its explanation stays next to it.
  - Tradeoff: a slightly larger "more" list item.
  - Confidence: MED — depends on how the owner wants the disclosure to read.
  - Blind spot: whether the plan meant "Co to znaczy" to cover all findings.
- **Fix B**: Exclude `moreFindings` from `explained` and drop their meaning.
  - Strength: smallest change.
  - Tradeoff: meaning of findings beyond the fifth is no longer visible anywhere.
  - Confidence: MED.
  - Blind spot: none significant.
- **Decision**: FIXED (Fix A: explained from the first five, meaning and check inline under 'Pozostałe ustalenia')

### F3 — Truncation can split a surrogate pair

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/recommendation.ts:~123
- **Detail**: `text.slice(0, FINDING_TEXT_MAX_CHARS - 1)` cuts by UTF-16 code unit; an emoji straddling position 499 leaves a lone surrogate before "…". Reachable only with more than 500 characters of emoji-heavy text (the contract already caps strings at 500).
- **Fix**: Cut on code points, or drop a trailing high surrogate, and keep the 500/501 test consistent.
- **Decision**: FIXED (cut drops a trailing high surrogate; test added)

### F4 — `isCurrent` and `isStale` are derived separately

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/services/recommendation.ts:~178
- **Detail**: `isCurrent = status.tone === "good"` while `isStale` comes from the age rules; `isCurrent === !isStale` holds today and is guarded only by edge tests.
- **Fix**: Derive `isCurrent` from `!isStale` or assert the equivalence in a test.
- **Decision**: FIXED (isCurrent = !isStale)

### F5 — Dashboard mixes two colour vocabularies

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/RecommendationCard.astro vs BillForecastCard, LiveStateCard, UsageInsightCard, TermsExplained, tone-classes.ts
- **Detail**: The recommendation card uses tokens (`text-card-foreground`, `text-muted-foreground`, `border-border`); the neighbouring cards still use `text-blue-100`. Works while the app is dark-only. The plan lists colour cleanup elsewhere as not in scope.
- **Fix**: Record the half-migration in `docs/decisions.md` (or a follow-up), no code change here.
- **Decision**: ACCEPTED (half-migration to tokens stays, colour cleanup elsewhere is out of scope)

### F6 — Test gaps: CRLF lead split and escaped markup

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/format/advice-markdown.test.ts, src/lib/services/recommendation.test.ts
- **Detail**: No CRLF case for `splitAdviceLead` (the parser normalises it, so not a bug) and no test that a `<script>` string in a finding stays escaped (Astro interpolation escapes it; nothing pins it).
- **Fix**: Add a one-line CRLF split test.
- **Decision**: FIXED (CRLF split test added)

### F7 — Bold-only line counts as a heading

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/format/advice-markdown.ts (`isHeadingBlock`)
- **Detail**: A first line like `**Uwaga: długie zdanie**` on its own line is treated as a heading, so the next block also joins the lead. Safe (a real block always shows), pinned by a test, documented by a comment.
- **Fix**: None required.
- **Decision**: ACCEPTED (no change)

### F8 — Loose wording in the motion decision and manual-gate evidence

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: docs/decisions.md (motion entry); plan.md Progress 2.11-2.17, 4.6, 4.7
- **Detail**: The motion entry says "Three short one-shot animations" while `global.css` has two keyframes and two utilities used in three places. Manual ticks have no artifact in the diff by design (untracked dev page); 2.17 was run in-session on the local stack, 4.7 was checked only in the served CSS, not with emulation.
- **Fix**: Reword to "two animations used in three places"; note in the PR body that reduced motion was verified from the CSS only.
- **Decision**: FIXED (decisions.md wording; PR note on reduced motion checked from CSS only)
