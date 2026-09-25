<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Seasonal Usage Insight

- **Plan**: context/changes/seasonal-usage-insight/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Every rule matches the plan (compared day, seasonal window with New Year and leap-day handling, fallback, exclusions, strict ±15% with a floating-point tolerance). RLS and column grants are sound, there is no XSS path, and error isolation holds. Checks re-run on 2026-09-25: unit tests, lint and type check pass; CI smoke passed on #31/#32; production grants verified by SQL. Note: F-02 finding F1 means two production days (16 Aug, 3 Sep) have undercounted PV; S-04 compares load, which is affected only when load was also low.

## Findings

### F1 — The owner-read smoke step can't prove the policy works

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/smoke.mjs (signed-in owner can read daily energy totals)
- **Detail**: The step only asserts 200. PostgREST returns 200 with an empty list when RLS filters everything, so a missing or wrong policy would still pass.
- **Fix**: Assert that the body has at least one row (the earlier fixture push writes daily rows).
- **Decision**: FIXED: the smoke step fails unless the owner sees at least one row

### F2 — Card copy: English "vs", fixed numbers, heading when not yesterday

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/UsageInsightCard.astro:20, :42, :54, :60, :65
- **Detail**: Deltas end with "vs średnia" (English in Polish copy), "30 dni" and "±14 dni" are hard-coded instead of taken from the constants, and the heading says "Zużycie wczoraj" even when the compared day is older.
- **Fix**: Use "wobec średniej", import the window constants, and title the card "Zużycie dzienne" when the compared day isn't yesterday.
- **Decision**: FIXED: "wobec średniej", window numbers from the service constants, heading "Zużycie dzienne" when not yesterday

### F3 — "+15%" can appear next to "powyżej normy"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/usage-insight.ts:64-77
- **Detail**: The status uses the exact value and the label rounds it, so 34.51 against 30 shows "+15%" with "powyżej normy" while 34.5 shows "+15%" with "w normie".
- **Fix**: Show one decimal when the rounded delta is exactly ±15% ("+15,0%" vs "+15,1%").
- **Decision**: FIXED: one decimal at the threshold, never contradicting the status ("+15,0%" normal, at least "+15,1%" above)

### F4 — Two cases lack tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/usage-insight.test.ts; usage-insight.ts:7, :35
- **Detail**: No test pins "yesterday" just after Warsaw midnight (e.g. 22:30 UTC), or the 400-day cutoff in `loadDailyEnergy`. The 400 days only ever reach one earlier year, which the comments don't say.
- **Fix**: Add the two tests, and note in the comment that the baseline uses one earlier year.
- **Decision**: FIXED: tests for 00:30 Warsaw and the 400-day cutoff; comment says one earlier year

### F5 — Three Supabase clients per page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/pages/dashboard.astro:25-39
- **Detail**: Each card creates its own server client. The risk is low, but an expired token could trigger three parallel refreshes writing the same cookies.
- **Fix**: Create one client for the page and pass it to the three loaders.
- **Decision**: FIXED: one lazily created client shared by the three loaders; per-card error isolation kept
