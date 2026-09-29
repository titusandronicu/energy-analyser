<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Dashboard Refresh: Icons, Sparklines, Bill Delta and System Balance

> Triage complete 2026-09-29: F1-F10 fixed in plan.md and plan-brief.md.

- **Plan**: context/changes/dashboard-refresh-icons-sparklines/plan.md
- **Mode**: Deep
- **Date**: 2026-09-29
- **Verdict**: REVISE
- **Findings**: 0 critical, 6 warnings, 4 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 16/16 paths ✓ (the four new components, `daily-series.ts`, `sparkline.ts` and the dev page are correctly absent; the artboards exist at the scratchpad path; the PR 65 plan exists only on its branch, as the plan says), 15/15 lucide exports ✓, 14/14 symbols ✓ (`verdictStatus`, `dayLabelOf`, `toBillForecastView`, `deltaLabel`, `selectBaseline`, `loadDailyEnergy`, `flow()`, `MIN_FLOW_W`, `capturedClock`, `data-flow-junction`, `PLACEMENT`, `TONE_CLASSES` and others), brief↔plan ✓ (except the stale "pending owner confirmation" wording, F7); Progress↔Phase mechanically consistent (one `## Progress` at the end, 7 phases matched by number, every criterion has its `N.M` row: 9+5, 9+5, 6+4, 8+5, 8+5, 7+5, 10+6, no checkboxes inside phase blocks). Two citation drifts (F7). PR 65 (`origin/cursor/frosted-aurora-dashboard-8dba`) merges cleanly into current `main` (`git merge-tree` produced a tree, no conflicts): its 11 files are exactly the ones the plan lists, `main` has not touched `global.css`, the four cards, `dashboard.astro` or `tone-classes.ts` since `630aeb1`. Contrast table recomputed and matches (muted 8.08/7.37, chips 7.19 to 9.35 on card, grid 5.48).

## Findings

### F1 — Dev-page fixture recipe does not match the pinned clock or the named fixtures

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — 4. Fixture dev page (temporary, untracked); Phase 5 manual 5.9; Phase 7 screenshots
- **Detail**: Every gate in Phases 1 to 7 depends on this page, but its recipe is under-specified in ways that make the first render wrong. (a) The pinned clock is 2026-09-29 16:10, yet `scripts/fixtures/live-flow/normal.json` has `captured_at` 2026-09-10, the bill fixtures have `generated_at` 2026-09-23T11:55 (the mapper refuses anything older than 30 minutes, `bill-forecast.ts` `FORECAST_STALE_AFTER_MS`, and the live card goes stale after 15 minutes) and `recommendation/current.json` is stamped 2026-09-29T08:00. The plan only says to shift `daily_history` ("as `--shift-days` does"); `captured_at`, `generated_at` and the recommendation stamp are not rebased, so `fresh-full` would render stale and refused cards. (b) `fresh-full` is "bill `verdict-above-plus-20-pct` with the example's own 257.73 against 214.66", but that fixture is 260 against 200 (+30%). The 257.73/214.66 pair is the `bill_forecast` of `docs/ingest/example-v1.json` (and of the refusal-variant fixtures `above-plausibility-ceiling`, `negative-derived-kwh`, `stale-generated-at`); manual gate 5.9 checks "+43 zł (+20,1%)" against a body the plan does not name. (c) Scenarios need different clocks (`stale-and-lag` "read 40 minutes later", `other-month-and-refusals` "read in October") and the plan does not say the clock is per scenario. (d) One page renders five full bodies, but the screenshots are named per scenario at a fixed 390x2600 viewport; nothing says how one scenario is isolated (`?scenario=` or anchors).
- **Fix**: Name the rebase step in the contract: a small helper on the dev page that rewrites `captured_at`, `bill_forecast.generated_at`, the recommendation `generated_at` and `daily_history` relative to each scenario's own `now`, state that the 257.73/214.66 body comes from `docs/ingest/example-v1.json`, and add a `?scenario=<name>` filter so each screenshot shows one body.
  - Strength: Removes the most likely first-hour failure of Phase 1 and makes gates 4.12, 5.9 and 7.11 reproducible by any implementer.
  - Tradeoff: A little more dev-page code (untracked, thrown away in Phase 7).
  - Confidence: HIGH — the timestamps and the 30-minute and 15-minute freshness rules were read in the fixtures and mappers.
  - Blind spot: Whether each fixture still passes the strict contract after a timestamp rewrite (the dev page bypasses ingest, so it should).
- **Decision**: FIXED (Fix in plan)

### F2 — 390 px width budget after the inset panel and the balance text is unstated and unchecked

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — 3. Source legend, LiveFlow icon and stage; Phase 6 — 3. Junction text; manual 1.11, 2.14, 6.8
- **Detail**: At 390 px the 2x2 grid is `minmax(0,1fr) 40px minmax(0,1fr)` inside the page gutter (16 px), the `Panel` (`p-6`) and now the new inset panel "with padding". That takes each node column from about 135 px today to about 119 px. `FlowNode` content is already tight: `whitespace-nowrap` value, and a `VerdictChip` ("Warto sprawdzić", "Bez oceny") plus a detail line ("85,0% oczekiwanego") inside a 2 px border and 8 px padding. Phase 6 then puts "Bilans systemu" in the same column-1 gap, needing its own width. The only checks are 1.11 (which runs before the inset exists), 2.14 (horizontal page scroll only) and 6.8 (overlap with squares and lines). No criterion looks for clipped or wrapped node text after the inset, and the padding is left as "with padding". I could not render the page, so the overflow itself is unconfirmed, only the missing budget and check.
- **Fix**: State the inset padding for phone (for example `p-2 sm:p-4`) in the Phase 2 contract and add a manual criterion: at 390 px with the `worse` and `battery-low` fixtures every node keeps its chip and detail text unclipped, and the balance label wraps to at most two lines inside the 36 px row gap.
  - Strength: Catches the regression where it is introduced (Phase 2) instead of in the Phase 7 screenshots.
  - Tradeoff: One more manual line; possibly a smaller inset on phone than the artboard shows.
  - Confidence: MED — arithmetic from the tokens and classes read, not from a render.
  - Blind spot: Actual chip wrapping widths at 390 px.
- **Decision**: FIXED (Fix in plan)

### F3 — A failed history load renders "za mało dni"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — 2. Live view series; Phase 3 — 2. Component
- **Detail**: `toLiveStateView` already separates `dailyRows === null` (load failed, "historia niedostępna") from `[]` (no history). Phase 4 collapses both into 14 nulls, and the component's only empty text is "za mało dni". A database error would then tell the owner the history is too short, while the verdict chips on the same card say the history is unavailable. `DailySeries = (number | null)[]` cannot carry the difference.
- **Fix**: Make the live `series` `null` when `historyFailed` and give `Sparkline` an unavailable variant ("historia niedostępna"); add the failed-history case to the live mapper tests and to gate 4.11.
- **Decision**: FIXED (Fix in plan)

### F4 — The export sparkline draws a known-bad counter, and an all-equal series sits mid-scale

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing (export bullets); Phase 3 — 1. Path helper (flat rule); Phase 4 — 4. KPI row
- **Detail**: The plan omits "Z PV wykorzystane" because the inverter export counter under-reads (94.7 kWh against PGE's 342, `docs/logic.md:123`), then draws a 14-day sparkline of that same counter under "Sprzedane do sieci dziś" and accepts that "it may be flat at zero". The path helper draws an all-equal series at mid-height and scales every series min to max. So a series of 14 zeros, the likeliest outcome of an under-reading counter, renders as a steady line at half height, and a series ranging 0,00 to 0,10 kWh looks as dramatic as one ranging 8 to 25 kWh. The label is honest, but the picture is what the eye reads, and it gives visual authority to a figure the same document calls unreliable. This is a rationale inconsistency, not a violation of an owner decision (the three KPI sparklines come from the design).
- **Fix A ⭐ Recommended**: Keep the sparkline, but draw an all-equal series on the baseline when the value is 0 (and mid-height only when non-zero), and render the label "bez zmian, 0,0 kWh w każdym dniu" as visible text next to a flat-zero line.
  - Strength: Small change inside `sparklineGeometry` and its exact-value tests; keeps the approved design.
  - Tradeoff: One more branch in the helper; still min-max scaled for varying series.
  - Confidence: MED — depends on how often export is truly all zero in the 14-day window (not checked against data).
  - Blind spot: Real export values over the last 14 days.
- **Fix B**: Drop the sold sparkline for now (keep its value) and record it next to "Z PV wykorzystane" until the lab computes self-consumption.
  - Strength: Consistent with the omission rationale; no chart of an unreliable counter.
  - Tradeoff: Departs from the artboard's three-sparkline KPI row; owner would need to agree.
  - Confidence: HIGH — follows directly from the plan's own reasoning.
  - Blind spot: Owner preference for the symmetric row.
- **Decision**: FIXED (Fix A)

### F5 — Percent edge rule at +20% is described loosely and duplicates `deltaLabel`'s pattern

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 5 — 1. Mapper: delta and days; 2. Mapper tests
- **Detail**: The repo already has the exact rule in `usage-insight.ts` `deltaLabel` (lines 168-195): when the whole percent equals the edge, show one decimal, clamped by the tone (`Math.min(tenths, edge)` if milder, else `Math.max(tenths, edge + 0.1)`). The plan re-specifies it in prose ("at the +20% verdict line it shows one decimal") and cites `docs/logic.md:64` for it (the rule is at `docs/logic.md:49`). Read literally, "at the line" leaves the 20.05 to 20.5% band open: 240.6 against 200 is `problem` ("ponad 20% powyżej…" on the badge) yet a whole percent would print "+20%". The test list has 240 and 240.01 only, and no negative case (160 against 200 would hit the same branch if copied without a sign guard). A second copy of the logic is also a drift risk.
- **Fix**: Say the bill percent reuses `deltaLabel`'s edge branch (trigger: whole percent equals 20 and the delta is positive; clamp by `verdictTone`), preferably via a shared helper extracted from `deltaLabel`, and add tests for 240.6 against 200 (`+20,6%`, problem) and 160 against 200 (`−20%`, no decimal).
- **Decision**: FIXED (Fix in plan)

### F6 — The balance value stays at full strength on a stale snapshot

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 6 — 3. Junction text and readings view; manual 6.9
- **Detail**: The plan computes the balance for stale and degraded snapshots on purpose, but the junction text is bold `text-primary` with no freshness treatment. Everything else in the diagram is dimmed when `isStale` (connectors get `opacity-45` in `LiveFlow.tsx`, motion stops, verdicts become "bez oceny"), following the recorded rule that stale data must not look live. A three-hour-old "+2,2 kW" in the most prominent spot would.
- **Fix**: Render the balance label and value in the muted colour (or the same `opacity-45`) when `isStale`, and add "stale snapshot dims the balance" to gate 6.9.
- **Decision**: FIXED (Fix in plan)

### F7 — Owner-confirmed assumptions still read as undecided, and two citations drifted

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Implementation Approach — Assumptions; plan-brief Open Risks; Current State and Key Discoveries citations
- **Detail**: The plan says the owner "has not decided" the six assumptions and they are "confirmed or changed at plan review", and the brief lists all six as pending. The owner has since confirmed 1 (badge text plus dot), 2 (bill card to the right column), 3 (keep the 2x2 verdict squares), 4 (previous complete days only) and 5 (three extra tokens); only 6 (no live-heading icon) is still an assumption. An implementer may stop to ask about decided items. Citation drift: `docs/logic.md:64` should be `:49` for the one-decimal rule; `usage-insight.ts:57` is `:58`. Also `origin/main` is now `4e7b49c` (docs-only PR 66), not `e2d176b`; harmless, but the "`main` at e2d176b" wording will confuse the 1.1 check.
- **Fix**: Mark assumptions 1 to 5 "confirmed by owner at plan review", keep 6 open, update the brief line, and fix the two citations and the `main` reference.
- **Decision**: FIXED (Fix in plan)

### F8 — Some automated checks cannot fail or are not verifiable

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 criterion 2.6; Phase 7 criterion 7.6
- **Detail**: 2.6 greps `<(LogOut|ChartLine|…)[^>]*client:`. The icons are passed as `icon={Sparkles}` props into `CardHeading` and rendered as `<Icon />`, and `git grep` is line-based, so the pattern never matches and the check passes whatever the implementer does. 7.6 says the command "prints the existing rule beside `animate-flow-dash`", which a plain `git grep -n "prefers-reduced-motion"` cannot show (it prints one line). The remaining criteria I ran (`from("daily_energy")` gives exactly two lines, `diff_pct` one line, three `*-status` testids, all ten bill testids present today, `git ls-files src/pages/dev`, `git diff --exit-code` on the motion files) behave as the plan states, and `prettier --check` on the plan files passes now.
- **Fix**: Replace 2.6 with `git grep -n "client:" -- "src/**/*.astro"` and list the expected islands in the criterion; in 7.6 check that `git grep -c "prefers-reduced-motion" -- src/styles/global.css` is unchanged from the branch base.
- **Decision**: FIXED (Fix in plan)

### F9 — Phases 1 and 5 are the heaviest for one subagent run each

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Lean Execution
- **Location**: Phase 1 (M), Phase 5 (M), Phase 2 — 4. Page body extraction
- **Detail**: Phase 1 combines a palette rewrite, two consumer files, a design copy and a five-scenario dev page with a synthetic row generator (F1). Phase 5 combines a delicate mapper change with about 25 exact-string tests, a card rewrite and the layout move of the bill card. Both are feasible but at the top of "one run". The layout move needs no data and is independent of the mapper, and `DashboardBody` already arrives in Phase 2.
- **Fix**: Optional: move the bill-card layout move (right column, phone order) into Phase 2's `DashboardBody` extraction, so Phase 5 is mapper, tests and the card body only; split the dev page's synthetic generator out of the Phase 1 gate if it slips.
  - Strength: Smaller Phase 5 risk and the new column layout is visible in every later screenshot.
  - Tradeoff: Phase 2 grows and its screenshots show the bill card in the right column before its delta exists.
  - Confidence: MED — sizing is a judgement, not measured.
  - Blind spot: Actual subagent context and time budgets.
- **Decision**: FIXED (moved to Phase 2)

### F10 — Usage sparkline subject and window label are undefined

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — 5. Usage card rows
- **Detail**: The KPI subjects and the window label "ostatnie 14 dni" are given; the usage rows give only the subject "Zużycie domu" and none for the purchase row, and no window label. The series ends on the compared day, which can be up to seven days before today (`LOOKBACK_DAYS`), so "ostatnie 7 dni" would be wrong exactly in the "brak danych z wczoraj" case the plan tests.
- **Fix**: Specify the label as "7 dni do <dayLabel>" (using the view's `dayLabel`) and the purchase subject "Energia kupiona z sieci".
- **Decision**: FIXED (Fix in plan)
