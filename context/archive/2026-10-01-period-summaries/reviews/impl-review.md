<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Period summaries (S-18)

- **Plan**: context/changes/period-summaries/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

Automated verification re-run for the review: `npm test` 989 passed, `npm run lint` clean, `npx astro check` 0 errors, `npm run build` ok, smoke against local Supabase 67 passed / 0 failed, `! grep "does not show them yet" docs/logic.md` ok. Manual rows 2.6-2.9 and 3.7-3.9 were confirmed by the owner; 3.10 (production check after the app deploy) is pending by design. Plan-drift review: every planned item MATCH, no "not doing" violations, docs claims true to the code.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — `facts` is selected but never used

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/period-summary.ts:15-16 (and period-summary.test.ts:55-65)
- **Detail**: `SUMMARY_COLUMNS` includes `facts`, the untrusted jsonb, although no view reads it. The "facts never exposed" tests pass only because the mappers copy named fields; the select test even locks `facts` in.
- **Fix**: Drop `facts` from `SUMMARY_COLUMNS`, type the loaders' rows as `Omit<PeriodSummaryRow, "facts">`, and make the select test assert the list excludes `facts`.
  - Strength: The invariant no longer depends on the mappers, and untrusted jsonb is not transferred or logged.
  - Tradeoff: The loaders' row type differs from `PeriodSummaryRow`, and the mapper signatures change.
  - Confidence: HIGH — the mappers never read `facts`.
  - Blind spot: None significant.
- **Decision**: FIXED — `facts` dropped from the select, rows typed as `PeriodSummaryText`, select test asserts it is absent

### F2 — Smoke asserts "aktualna" against the whole page body

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs (step "dashboard shows today's summary card as current, with its text", ~:205)
- **Detail**: The recommendation card uses the same status wording, so `contains: "aktualna"` can pass without the summary card's own badge saying it.
- **Fix**: Assert the text inside `data-testid="today-summary-status"`, or drop "aktualna" and rely on the marker.
- **Decision**: FIXED — smoke matches `aktualna` inside the summary card's own status element (new `matches` expectation)

### F3 — A future-dated `period` shows as "aktualna"

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/period-summary.ts:24-28 and :116
- **Detail**: `loadTodaySummary` orders by `period` descending, so a row dated tomorrow (clock skew, wrong timezone) is picked, `isFromEarlierDay` is false and it reads as current.
- **Fix**: Pass today's Warsaw day key to the loader and add `.lte("period", today)`, or treat a future period as a problem status.
  - Strength: A skewed lab clock cannot make the card claim a text about tomorrow is current.
  - Tradeoff: The loader gains a parameter and the dashboard passes its day key.
  - Confidence: HIGH — the query shape is the cause.
  - Blind spot: Whether the lab can produce a future period in practice is unverified.
- **Decision**: FIXED — `loadTodaySummary(client, today)` filters `period <= today`; the dashboard passes its Warsaw day key; tested

### F4 — A malformed date throws and, on history, hides the whole view

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/period-summary.ts:77, :122-123
- **Detail**: An invalid `built_at`, `narration_generated_at` or `period` gives an Invalid Date or a RangeError from `Intl`. On the dashboard it lands in `orLoadError` (load-failed card); on history the whole `buildDayView` or `buildMonthView` call is wrapped, so the day or month view disappears. Columns are `timestamptz` and the key is validated at ingest, so the risk is low.
- **Fix**: Guard `generatedAtLabel` with `Number.isFinite`, falling back to `built_at` or omitting the time.
- **Decision**: FIXED — unreadable times fall back to `built_at`, then to "w nieznanym czasie" / "nieznany czas wygenerowania" (stale); tested

### F5 — Duplicated markup and status logic

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/TodaySummaryCard.astro, src/components/history/SummaryPanel.astro, src/lib/services/period-summary.ts:93-99
- **Detail**: The two components repeat the narrated and pending markup and class string ("Wygenerowano" vs "napisane", "Dotyczy" vs "dotyczy"). `todayStatus` re-implements the wording of the private `recommendationStatus`, so a change to thresholds or labels needs two edits.
- **Fix**: Extract a shared text fragment and export a shared status helper from `recommendation.ts` — or accept the duplication for now.
- **Decision**: FIXED — shared `SummaryText.astro` for both surfaces; `ageStatus` and `earlierDayStatus` exported from `recommendation.ts` and used by both cards

### F6 — The badge age and the shown time are measured from different timestamps

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/period-summary.ts:97, :122
- **Detail**: Staleness and "sprzed X" use `built_at`; the card shows `narration_generated_at` as "Wygenerowano …". They can differ, so the badge may say "sprzed 5 godz." beside another time. The choice is documented in a code comment.
- **Fix**: Accept; revisit the wording only if it confuses in use.
- **Decision**: FIXED — staleness and the badge age now use the shown time (`narration_generated_at`, falling back to `built_at`); docs updated

### F7 — Test gaps

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/period-summary.test.ts, src/lib/services/calendar-view.test.ts, scripts/smoke.mjs
- **Detail**: No test that `facts` is absent from the select (see F1), no invalid-date or future-period cases, no escaping test (a `<b>` payload in a summary), no case with today on the 1st or across a December/January boundary, and no smoke step that a pending day shows no marker.
- **Fix**: Add the cases alongside F1, F3 and F4; add one smoke step pushing a `<b>` payload and asserting it appears escaped.
- **Decision**: FIXED — unit cases (invalid dates, year boundary, today on the 1st, escaping) and smoke steps (escaped markup, pending day, badge word) added
