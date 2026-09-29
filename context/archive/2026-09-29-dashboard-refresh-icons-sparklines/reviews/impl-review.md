<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Dashboard refresh: icons, sparklines, bill delta and system balance

- **Plan**: context/changes/dashboard-refresh-icons-sparklines/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6, 7, 8
- **Date**: 2026-09-29

> Triage complete 2026-09-29: F1, F3, F4, F7, F8 fixed; F2, F5, F6, F9 accepted; F10 follow-up.

- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 7 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

All eight phases are implemented and match the plan and the binding owner decisions (Assumptions 1 to 17, "What We're NOT Doing", the live-flow contracts table). Automated gates re-run by the reviewers: `npm test` 628 passed, `npm run lint` clean, `npx astro check` 0/0/0, `npm run build` complete. Verified clean: exactly four `client:` lines, no `set:html`, no new query, contract, migration or dependency, no colour literals in the changed components, `deltaLabel` output byte-identical to before, `edgePercentLabel`, `flowPath`, `dailySeries` (month, year and DST edges), bill days and delta rules, hydration of the Astro named slots, reduced-motion coverage. Manual Progress rows are open by the owner's batching decision (not accused).

## Findings

### F1 — The notices slot has no gap before the diagram stage

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/LiveStateCard.astro (notices slot), src/components/live/LiveFlow.tsx:175,237
- **Detail**: The notices reach the island as an `<astro-slot style="display:contents">`; the root's `space-y-4` compiles to `> :not(:last-child) { margin-block-end: 1rem }`, and a `display:contents` element ignores margins. Confirmed in `screenshots/stale-and-lag-1440.jpg`: "Ruch i oceny wstrzymane…" sits about 4 px above the stage on every stale or degraded snapshot.
- **Fix**: Put `mb-4` on the notices wrapper div inside the slot (or render `{notices && <div className="mb-4">{notices}</div>}` in LiveFlow so the spacing sits on a real box).
- **Decision**: FIXED (mb-4 on a real box inside the display:contents notices slot)

### F2 — Desktop columns are unbalanced and a few artboard differences are not on the accepted list

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/components/DashboardBody.astro:30; screenshots/fresh-full-1440.jpg; screenshots/README.md
- **Detail**: `lg:items-start` lets the recommendation card end about 200 px above the bill and usage column, leaving a blank block bottom-left; the artboard's columns end nearly level. Manual gate 8.14 ("no unbalanced column") is not met and the difference is not in the README's accepted list. Also not listed as differences: the extra "Naładowanie: 74%" line under the battery chip (taller node, the plan asks for it), a stage about 220 px tall against 180 px on the artboard, and phone PV and Battery connectors of about 27 px.
- **Fix A ⭐ Recommended**: Accept it explicitly in the README (with the reason: cards have different content heights) and add the three other differences to the accepted list.
  - Strength: no layout risk before the owner's visual pass; the record is honest.
  - Tradeoff: the blank block stays.
  - Confidence: MED — depends on how the owner reads the screenshot.
  - Blind spot: not verified how it looks with a long recommendation.
- **Fix B**: Drop `items-start` and make the recommendation Panel `h-full`.
  - Strength: columns end level like the artboard.
  - Tradeoff: a short recommendation card would stretch and leave empty space inside it.
  - Confidence: MED.
  - Blind spot: needs a render pass.
- **Decision**: ACCEPTED (Fix A: described in the screenshots README with the three other differences)

### F3 — Bookkeeping drift: uncommitted Phase 8 SHAs and stale README lines

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md Progress rows 8.1-8.13; screenshots/README.md:71,73; LiveFlow.tsx:241,299 versus plan Phase 7 step 4
- **Detail**: The Phase 8 rows carry no SHA in the committed plan.md (the SHA suffixes are an uncommitted edit). The README says `StatusBadge` `rounded-2xl` is "still uncommitted", but it is committed. The Phase 7 grid values drifted from the plan text (phone columns 70/114 instead of 72/104, `sm` columns 300 instead of 260, stage padding `px-1 py-2 sm:px-3 sm:py-6 md:px-8`) and the plan's connector-gap arithmetic no longer holds (README measures 27 px stubs); two small extras are not in the plan (`max-w-16` balance label, `bg-primary/15` on the paused button).
- **Fix**: Commit the plan.md SHAs, reword the README lines, and note the tuned values and extras in the plan (Phase 7 step 4) as accepted implementer tuning.
- **Decision**: FIXED (SHAs committed, README reworded, tuned values noted in the plan)

### F4 — Some graphics contrast is below 3:1

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/live/LiveFlow.tsx:275 (`opacity-45` stale connectors); src/components/ui/DisclosureButton.tsx (`border-primary/45`); unrated tile borders
- **Detail**: Dimmed stale connectors compute to grid 2.14, battery 2.86, pv 3.17, home 3.58 on the stage; the disclosure border is 2.63:1; unrated tile borders 2.14 to 2.86. The plan itself mandates `opacity-45` and `border-primary/45`, and the README and docs record them as accepted; the notice, chips and direction words carry the meaning, and the button is identified by its size and its primary text (above 8:1).
- **Fix A ⭐ Recommended**: Raise the stale connector dimming to `opacity-65` (grid about 3.1, battery about 4.6), keep the disclosure border and record it as decorative.
  - Strength: every connector meets 3:1 while still reading as dimmed.
  - Tradeoff: stale connectors look slightly less faded; wording in plan, docs and README changes.
  - Confidence: MED — computed, not seen.
  - Blind spot: how much `opacity-65` still looks "not live" next to the notice.
- **Fix B**: Accept as is.
  - Strength: no change.
  - Tradeoff: three of four stale connectors stay below the 3:1 graphics guideline.
  - Confidence: HIGH.
  - Blind spot: none significant.
- **Decision**: FIXED (Fix A: stale connectors opacity-65, 3,13 to 6,10:1; wording updated in docs, plan and README)

### F5 — A negative daily load total draws a gap while its value is shown

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/daily-series.ts:27; src/lib/services/usage-insight.ts (`selectBaseline`)
- **Detail**: A negative `load_kwh` on the compared day is a gap in the usage series (rule "negative is null"), but `selectBaseline` still shows the value ("-2,0 kWh"), so the sparkline ends one slot short of the figure beside it and its label ("ostatnia dostępna wartość") disagrees with it. Corrupt data only; no test pins the mismatch.
- **Fix A ⭐ Recommended**: Leave the behaviour and pin it with a test that names the corner.
  - Strength: no change to the shown figures or to `selectBaseline`.
  - Tradeoff: the mismatch stays for corrupt data.
  - Confidence: HIGH.
  - Blind spot: none significant.
- **Fix B**: Treat a negative `load_kwh` as absent in `selectBaseline` as well.
  - Strength: series and figure always agree.
  - Tradeoff: changes the usage verdict for corrupt data and an existing mapper.
  - Confidence: LOW — wider blast radius.
  - Blind spot: which other paths read `asNumber`.
- **Decision**: ACCEPTED (Fix A: behaviour kept, pinned with a test)

### F6 — Stale flow lines can flash for one frame when switching back to the diagram

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useFlowLines.ts
- **Detail**: `layout` is not cleared when `enabled` goes false, so switching Odczyty back to Schemat can paint one frame of lines from the old geometry until the ResizeObserver's first callback. Pre-existing behaviour (the hook is unchanged since the live-flow change, and the plan's guard requires it unchanged).
- **Fix**: `setLayout(null)` when `!enabled`, as a separate small change (it needs the guard in Phase 7 criterion 7.8 lifted for this file), or leave it.
- **Decision**: ACCEPTED (pre-existing; useFlowLines is guarded by criterion 7.8)

### F7 — Stale and misplaced comments

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/format/tone-classes.ts:3; src/styles/global.css (flow block comment); src/components/BillForecastCard.astro:48-49
- **Detail**: `tone-classes.ts` says "verdict chips on the flow squares" and the `global.css` flow comment says "squares, chips, arrows" although the squares are gone; the "Worded as a test of the arithmetic…" comment now sits above the delta code instead of above `checkLine`.
- **Fix**: Reword the two comments to "nodes" and move the orphaned comment back to `checkLine` (comment-only edits; `global.css` is guarded by criterion 7.8 as to rules, comments are fine).
- **Decision**: FIXED (comments reworded, orphaned comment moved back)

### F8 — Focus and active-state cues rely on browser defaults or weight

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/live/FlowNode.tsx; the Schemat/Odczyty segmented control in src/components/live/LiveFlow.tsx
- **Detail**: `FlowNode` has no explicit `focus-visible` style (it relies on the outline tinted by the global `outline-ring/50`; the selected node has a primary ring shadow). The active segment differs from the inactive one by a 15% primary fill and font weight only (plus `aria-pressed`), which a low-vision sighted user reads by weight.
- **Fix**: Add an explicit `focus-visible:ring-2 ring-ring` to `FlowNode` and a 1 px `border-primary/45` to the active segment.
- **Decision**: FIXED (explicit focus-visible ring on FlowNode, bordered active segment)

### F9 — Unused fields and repeated geometry computation

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/services/live-state.ts (`BalanceLabel.watts`); bill-forecast.ts (`BillDaysView.used`, `inMonth`); src/components/ui/Sparkline.astro
- **Detail**: No component reads `balance.watts`, `days.used` or `days.inMonth` (tests do); `Sparkline.astro` calls `sparklineGeometry`, `describeSeries` and `flatCaption` separately (about five sparklines per request, about 350 bytes each: negligible).
- **Fix**: Leave as is; they are small, tested and useful in the view models.
- **Decision**: ACCEPTED (small, tested view-model fields)

### F10 — The dashboard has no `<main>` and no `<h1>`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/layouts/Layout.astro, src/components/DashboardHeader.astro
- **Detail**: The brand is a span and the cards start at h2; the same was true on `main` and this change does not alter it. The new `<footer aria-label="Legenda">` and `<header>` are fine and the h2/h3 order is consistent.
- **Fix**: Follow-up outside this change (landmarks and heading level across pages).
- **Decision**: FOLLOW-UP (recorded in the README; landmarks and heading level are a separate change)
