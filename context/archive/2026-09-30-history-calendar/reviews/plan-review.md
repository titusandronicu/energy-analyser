<!-- PLAN-REVIEW-REPORT -->

# Plan Review: History Calendar

- **Plan**: context/changes/history-calendar/plan.md
- **Mode**: Deep
- **Date**: 2026-09-30
- **Verdict**: REVISE → SOUND after triage (all 7 fixed)
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 10/10 paths ✓, 6/6 symbols ✓, Progress↔Phase 3/3 phases and 17/17 rows ✓, brief↔plan ✓

## Findings

### F1 — Reusing toRecommendationView marks every past day's advice as a red problem

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §3 (buildDayView), Phase 3 §2 (DayView)
- **Detail**: Every status `toRecommendationView` sets is relative to `now` (`recommendation.ts:100-110, 152, 169-179`). For 2026-09-27 viewed on 2026-10-05 it returns:
  - a red status "z 27 września — dotyczy innego dnia" and `isStale = true`;
  - every finding chip in the neutral "insufficient" tone.
    `RecommendationCard.astro:31, 43-47` would also show "Rekomendacja na dziś" and "Laboratorium mogło przestać przesyłać dane." The forecast relabelling for earlier days (`RecommendationForecast.astro:28-38`) is correct and worth keeping.
- **Fix**: Add an optional `{ historical: true }` to `toRecommendationView`. It gives a neutral status "z 27 września, 14:00", `isStale = false` and `isCurrent = false`, keeps the findings' real tones, and keeps the forecast relabelling. `DayView` renders its own advice section (heading "Rekomendacja z tego dnia", no stale warning) instead of `RecommendationCard`.
  - Strength: One mapper stays the single source of the advice view, and an optional parameter leaves the dashboard, `recommendation.test.ts` and the fixture test unaffected.
  - Tradeoff: A second presentation of advice to keep in step with the dashboard card.
  - Confidence: HIGH — the verification traced every staleness branch.
  - Blind spot: Findings wording written "for today" may still read oddly for a past day.
- **Decision**: FIXED — historical option on toRecommendationView and a DayView advice section added to Phase 1 §3 and Phase 3 §3

### F2 — DashboardBody is the dashboard's card grid, not a reusable shell

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 §1 ("inside the dashboard shell")
- **Detail**: `DashboardBody.astro:15-48` takes the five dashboard views as props and hard-codes the aurora wrapper, the header, `<main>` with the five cards, and the `SourceLegend` footer. The plan assumes a shell the history page can render into, and none exists. `DashboardHeader` (prop `email` only) is reusable. The 5-minute reload lives in `dashboard.astro:88-102`, so it would not leak.
- **Fix A ⭐ Recommended**: Extract `src/components/AppShell.astro`: the aurora wrapper, `DashboardHeader` with a new `current: "dashboard" | "history"` prop, `<main>` with a `<slot/>`, and an optional legend slot. `DashboardBody` becomes the dashboard's card grid inside it.
  - Strength: One layout for both pages, so the landmarks, spacing and header nav can't drift; one caller each (`DashboardBody` ← `dashboard.astro`).
  - Tradeoff: Touches the dashboard in this change, so the dashboard needs a regression look.
  - Confidence: HIGH — blast radius is two files.
  - Blind spot: Whether `SourceLegend` fits the history page.
- **Fix B**: The history page copies the wrapper, header and `<main>` markup.
  - Strength: No change to the dashboard.
  - Tradeoff: Two copies of the page layout to keep in step.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — AppShell extraction added as Phase 3 §2, dashboard regression check 3.7

### F3 — Landing on the current month shows "za mało danych" for the first week of every month

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Desired End State ("lands on the current month"), Phase 1 §1 (`parsePeriod` default)
- **Detail**: With the 7-complete-day minimum and today never complete, the current month shows no totals and "za mało danych" from the 1st to the 7th. The daily charts need at least 3 values, so they are empty on days 1–3. The first deploy is likely in early October, so the first thing the owner sees would be an almost empty page.
- **Fix A ⭐ Recommended**: With no parameter, land on the current month when it has at least 7 complete days, otherwise on the previous month (never before 2026-07-16). The current month stays one "next" tap away.
  - Strength: The calendar always opens on a month with totals and charts.
  - Tradeoff: The default view changes with the date, which needs saying in `logic.md`.
  - Confidence: MED — a product preference.
  - Blind spot: Whether the owner expects "this month" first.
- **Fix B**: Always land on the current month, and in the insufficient state link to the previous month ("Poprzedni miesiąc: sierpień 2026").
  - Strength: Predictable landing.
  - Tradeoff: An empty first screen for about a quarter of each month.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — defaultMonth rule in Phase 1 §1 and the Desired End State

### F4 — dailySeries plots today unless the caller removes it

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 (month chart series)
- **Detail**: `dailySeries` filters only by the window (`daily-series.ts:25`), so a row for today is plotted. The plan says "today and later as gaps" but not who does it.
- **Fix**: State in the `buildMonthView` contract that rows for today and later are dropped before `dailySeries`, and add a test for it. Also name `MIN_PERIOD_DAYS = MIN_RANKED_DAYS` (reusing `hourly-usage.ts:22`) instead of a second 7.
- **Decision**: FIXED — dailySeries today-gap rule and MIN_RANKED_DAYS reuse in Phase 1 §4

### F5 — End of a Warsaw day is not defined for the recommendation range

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details (Timing & lifecycle)
- **Detail**: "the end of the last day" has no helper. The proven idiom is the next day's start: `warsawDayHours(addDays(lastDay, 1))[0].startMs` as an exclusive bound (`warsaw-time.ts:95-103`, used by `hourly-usage.ts:86`).
- **Fix**: Name that idiom in the contract (`[startOf(first), startOf(last + 1))`), with a test on a DST-change day.
- **Decision**: FIXED — half-open instant range with the next day's start, DST test

### F6 — The invalid-parameter smoke step can't tell a redirect loop from success

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §4 (smoke)
- **Detail**: The smoke matcher compares `location.startsWith(expected)` (`smoke.mjs:295`), so `/dashboard/history?month=bad` would also match `/dashboard/history`. The signed-in steps must sit between sign-in (`:100`) and sign-out (`:132`).
- **Fix**: Make the step check the exact location, and place the signed-in history steps between `:100` and `:132`.
- **Decision**: FIXED — exact-location smoke step, placed between sign-in and sign-out

### F7 — A truncated recommendation-time read would silently drop the month's last days

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2 (`loadRecommendationTimes`)
- **Detail**: The read is ascending with `.limit(1000)`, so if a month ever exceeds 1000 narrations the newest days lose their marker without any sign. Today it is about 24 a day, about 744 a month.
- **Fix**: If the read returns exactly the limit, the view marks the day markers as possibly incomplete (or reads per week), with a test.
- **Decision**: FIXED — truncated flag on loadRecommendationTimes with a marker note and test
