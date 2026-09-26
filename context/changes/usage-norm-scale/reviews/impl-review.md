<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Usage Norm as a Median, with Ranges and a Sense of Scale

- **Plan**: context/changes/usage-norm-scale/plan.md
- **Scope**: Full plan (retrospective plan; manual step 2.5 pending)
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Automated verification on merged main (19f3686): `npm test` 204 passed, `npm run lint` clean, `astro check` 0 errors, `npm run build` complete; CI passed on PR #42. Manual 2.5 (owner reads the card on a phone) is pending.

## Findings

### F1 — Rounded kWh can sit outside the range marked "ten dzień"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/usage-insight.ts:108-125, src/components/UsageInsightCard.astro:84,88-101
- **Detail**: The band comes from the raw load (with EPSILON), but the day's kWh and the range edges are shown with one decimal, and adjacent ranges share an edge ("25,5–34,5" / "34,5–42,0"). Norm 30, load 34.52: the card says "zużył 34,5 kWh" and marks "Wysokie 34,5–42,0 ← ten dzień"; load 25.46 shows "25,5 kWh" marked "poniżej 25,5". The badge and delta ("+15,1%") agree, but the kWh view alone looks contradictory. `deltaLabel` already solves the same problem at ±15% with an extra decimal; the kWh labels don't. No test covers it.
- **Fix A ⭐ Recommended**: When the day's rounded kWh equals a rounded range edge, show it with two decimals ("34,52 kWh"), and add tests at each edge.
  - Strength: Same approach as `deltaLabel` at ±15% (`usage-insight.ts` deltaLabel); the badge, range and number never contradict.
  - Tradeoff: A second decimal appears occasionally.
  - Confidence: HIGH — narrow change in the view model, fully unit-testable.
  - Blind spot: Two decimals may still collide for values within 0.005 of an edge (vanishingly rare).
- **Fix B**: Write the ranges as non-overlapping text ("do 34,5" / "więcej niż 34,5") without changing the day's number.
  - Strength: Pure wording change.
  - Tradeoff: A day of 34.52 still reads "34,5" next to "więcej niż 34,5", so the contradiction remains.
  - Confidence: MED — improves edge wording but not the core case.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — two decimals on collision, edge tests, logic.md rule 8

### F2 — Change skipped plan, plan review and implement steps of the 10x workflow

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/usage-norm-scale/
- **Detail**: The change went `/10x-research` → code on request ("ok looks good implement"), with no `/10x-plan`, `/10x-plan-review` or `/10x-implement`. As a result: plan.md was written retrospectively; `change.md` stayed at `preparing` until the review; the research's six open questions were settled by defaults rather than by the owner (recorded in plan.md "Owner decisions"); there was no batched manual-check list; and the review found issues (F1, F4) a plan review would likely have caught.
- **Fix**: Record a lesson: an "implement" request right after research goes through `/10x-plan` (short plan, owner confirms open questions) and `/10x-implement`, even for a small change.
- **Decision**: ACCEPTED-AS-RULE: Plan before implementing, even straight after research (+ owner confirms defaults, /10x-plan-review on the retrospective plan)

### F3 — PRD still says the fallback norm is a flat average

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/prd-v3.md:147,155,246
- **Detail**: FR-003 and the rule text say "flat trailing-30-day average"; the norm is now a median (decisions.md 2026-09-26). lessons.md "Keep the project docs in step with the code".
- **Fix**: Change the wording in prd-v3.md to "median" with a pointer to the 2026-09-26 decision.
- **Decision**: FIXED (differently) — prd-v3.md says "norm" and points to docs/logic.md for the statistic

### F4 — "+40%" can appear next to "dużo więcej niż zwykle"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/usage-insight.ts deltaLabel; src/components/UsageInsightCard.astro:103-104
- **Detail**: `deltaLabel` shows one decimal only at ±15%. Load 42.1 on norm 30 reads "To dużo więcej niż zwykle (+40% wobec normy)", while exactly +40% is still "wysokie". The new verdict sentence is the first place both appear together.
- **Fix**: Apply the same one-decimal edge rule at +40% in `deltaLabel`, with tests.
- **Decision**: FIXED — deltaLabel shows one decimal at +40% too; tests

### F5 — Band names and verdict sentences live in the component, untested

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/UsageInsightCard.astro:18-29,104
- **Detail**: `BAND_NAME` and `BAND_VERDICT` are keyed by the same `UsageBand` as `BAND_STATUS` in the service, but live in the component with no tests; the verdict guard compares against a literal "—" and can never be false (norm is non-zero whenever `meaning` exists).
- **Fix**: Move the range names and the verdict sentence into `UsageMeaning` in usage-insight.ts, extend the existing `toEqual` test, and drop the unreachable guard.
- **Decision**: FIXED — range names and verdictSentence in UsageMeaning, tested; dead guard removed

### F6 — Polish wording and screen-reader details

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/UsageInsightCard.astro:84-86,96,107; src/lib/format/glossary.ts:34
- **Detail**: "Dnia 22 września" is stiff; "połowa tych dni była niższa" is loose ("w połowie tych dni zużycie było niższe"); "Kupione z sieci — Prąd, który…" capitalises after a dash and doubles the em dash; "←" is read aloud as "strzałka w lewo".
- **Fix**: Use "22 września dom zużył", "w połowie tych dni zużycie było niższe, w połowie wyższe", lowercase after the dash (or a dt/dd pair), and `aria-hidden` on the arrow.
- **Decision**: FIXED — "22 września dom zużył", "w połowie tych dni zużycie było niższe", "Kupione z sieci: prąd, …", arrow aria-hidden; glossary norm wording

### F7 — Reference figures' sources and related docs not in step

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/format/reference-usage.ts:6; context/changes/usage-norm-scale/research.md:148; docs/logic.md (S-17/S-20 planned rules); context/foundation/roadmap.md:399
- **Detail**: research.md backs only January, July and September of the 12 monthly values and refers to a "seasonal table above" that doesn't exist; the code comment points to a path that `/10x-archive` will move; logic.md step 9 lists numbers without sources; the S-17/S-20 planned rules don't say "median" though decisions.md says they should; roadmap open question 4 is still fully open.
- **Fix**: Add the monthly table and sources to research.md and a sources line to logic.md step 9, point the code comment at docs/logic.md, add "norm = median" to the S-17/S-20 planned rules, and mark open question 4 partly answered by usage-norm-scale.
- **Decision**: FIXED — monthly table and sources in research.md, sources in logic.md rule 9, code comment points to logic.md, S-17/S-20 planned rules say median, roadmap open question 4 marked partly answered

### F8 — change.md notes contradict the decision on public data

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/usage-norm-scale/change.md:11
- **Detail**: Notes say public figures "are to be used where own data is missing"; the implementation deliberately keeps them out of the norm (decisions.md 2026-09-26).
- **Fix**: Add a sentence to the notes recording the outcome.
- **Decision**: FIXED — outcome sentence added to change.md notes

### F9 — Conditional classes don't use cn()

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/UsageInsightCard.astro:92
- **Detail**: CLAUDE.md asks for `cn()`; StatusBadge.astro:22 uses `class:list={cn(...)}` (satisfies both CLAUDE.md and the lint rule); the new code uses a bare array like Banner.astro:11. No functional issue.
- **Fix**: Use `class:list={cn("contents", …)}` as StatusBadge does.
- **Decision**: FIXED — class:list={cn(...)} as in StatusBadge

### F10 — Not yet seen on the real dashboard

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A (plan.md Progress 2.5)
- **Detail**: The card was rendered only through Astro's container API with sample data; manual step 2.5 (owner reads it on a phone after deploy) is pending.
- **Fix**: After the next production deploy, the owner opens the dashboard on a phone and ticks 2.5.
- **Decision**: ACCEPTED — owner checks the card on a phone after the next production deploy; Progress 2.5 stays pending
