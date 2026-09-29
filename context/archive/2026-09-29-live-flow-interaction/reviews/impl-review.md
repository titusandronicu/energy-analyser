<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Live Flow Interaction

- **Plan**: context/changes/live-flow-interaction/plan.md
- **Scope**: Full plan (phases 1 to 5 of 5; rows 2.4 and 5.5 stay open by the owner's decision)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-09-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations (all fixed after triage, see the decisions below)

Evidence: `npm test` 400/400, `npm run lint`, `npm run build`, `astro check` 0 errors, `prettier --check`, schema diff clean (run after the fix in 8ef3575); CI on PR 58 green (ci, smoke) before the fix commit. Two read-only reviewers (plan drift, safety and quality) read the changed files; neither ran the app or tests. The Codex P2 comment on PR 58 is F1 below.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Consumption rated from a stale daily row

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/live-state.ts (homeVerdict), found by the Codex review on PR 58 and by the safety reviewer
- **Detail**: `load_kwh` comes from a daily row written independently of the snapshot; a fresh state-only push left an older total that was explained as consumption up to the new capture time (06:00 total of 5 kWh, fresh 12:00 snapshot, norm 20 kWh gave "good, −50%").
- **Fix**: Expose `daily_energy.captured_at` to owners (migration) and leave consumption unrated when the row is older than the snapshot by more than 15 minutes or has no time.
  - Strength: fixes it at the source; tests for the scenario and both edges.
  - Tradeoff: a production migration must be applied with the deploy.
  - Confidence: HIGH — reproduced and covered by tests.
  - Blind spot: real lab cadence of the daily row was not observed.
- **Decision**: FIXED in 8ef3575 (migration `20260929130000_owner_read_daily_energy_captured_at.sql`, isolated timestamp query, tests, docs)

### F2 — push-fixture can write fake whole bodies to a remote server

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/push-fixture.mjs:57-73,88-97
- **Detail**: only header comments say "local only". With a production token, `--file scripts/fixtures/live-flow/worse.json --shift-days` would write a made-up recommendation and overwrite real `daily_energy` rows with fake history dated to look like today; `--shift-days` makes the fake data look real.
- **Fix**: when the body is whole (`--file` or `--full`) and the host of `BASE_URL` is not localhost, 127.0.0.1, [::1] or `*.localhost`, exit unless an explicit `--allow-remote` flag is passed.
- **Decision**: FIXED (Fix now: `--allow-remote` guard for whole bodies to non-local hosts)

### F3 — `--shift-days` aligns to the machine's today, not the capture day

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/push-fixture.mjs:94-96
- **Detail**: at 00:10 Warsaw with `--captured-at` 40 minutes back, the capture day is yesterday but the newest history day becomes today, so PV and consumption find no row for the capture day and read "brak prognozy" or "brak odczytu" instead of the scenario; the same for any capture up to 14 days back. `warsawToday()` is also called twice and can differ at midnight.
- **Fix**: derive the target day from `capturedAt` with the same Warsaw formatter, and call it once.
- **Decision**: FIXED (Fix now: `--shift-days` aligns to the Warsaw day of the capture time sent, computed once)

### F4 — "94% prognozy" reads as a share of the day's forecast

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/live-state.ts:221 (PV verdict `detail`)
- **Detail**: the share is measured against the forecast pro-rated to the capture time, but the chip says "prognozy". A July 15:10 capture with 73% of the day's forecast produced reads "100% prognozy", which someone may read as "the day is done". The explanation sentence is correct; only the compact label misleads. The plan itself specified "94% prognozy".
- **Fix A ⭐ Recommended**: word the detail "94% oczekiwanego" (matches the explanation text).
  - Strength: unambiguous; no logic change; docs and tests get the new word.
  - Tradeoff: slightly less obvious to a first-time reader that the forecast is the basis (the details strip says it).
  - Confidence: HIGH — wording only.
  - Blind spot: none significant.
- **Fix B**: keep "prognozy" and add a short caption "do tej pory" under the chip.
  - Strength: keeps the word the owner approved in the mockup.
  - Tradeoff: one more line on the square, which is already tight at 390px.
  - Confidence: MEDIUM — layout at 390px not checked.
  - Blind spot: mobile height.
- **Decision**: FIXED (Fix A: chip says "94% oczekiwanego")

### F5 — Charging icon depends on a display string

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/live/LiveFlow.tsx:67 (`battery.direction === "ładowanie"`)
- **Detail**: the direction word is owned by live-state.ts; a wording change silently stops the charging icon. Same coupling existed in the earlier card.
- **Fix**: expose a boolean (`charging`) from the mapper and use it in the icon choice.
- **Decision**: FIXED (Fix now: `battery.charging` boolean from the mapper)

### F6 — A failed history load reads "brak danych historii"

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro (dailyRowsPromise) and live-state.ts NO_HISTORY_DETAIL
- **Detail**: when the daily-energy query fails, PV and consumption say "Bez oceny · brak danych historii", the same wording as "no rows yet".
- **Fix**: pass a distinct reason for a failed load ("historia niedostępna") through the third argument.
- **Decision**: FIXED (Fix now: `null` history means the load failed, detail "historia niedostępna"; empty history keeps "brak danych historii")

### F7 — Client bundle pulls mapper constants

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/live/LiveFlow.tsx:28 (imports `MIN_FLOW_W` from live-state.ts)
- **Detail**: `LiveFlow.B1xT5VdR.js` (18 KB) carries live-state.ts's top-level constants and formatters; the verdict functions and usage-insight were tree-shaken out and nothing server-only ships.
- **Fix**: move `MIN_FLOW_W` to a tiny shared constants module (or into flow-geometry.ts).
- **Decision**: FIXED (Fix now: `MIN_FLOW_W` in `src/lib/flow-constants.ts`, re-exported by live-state.ts; LiveFlow imports types only from live-state)

### F8 — Small accessibility refinements

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/live/LiveFlow.tsx:287 (aria-live), FlowNode.tsx:57 (aria-pressed), view and pause buttons (32px)
- **Detail**: the details strip is `aria-live` without `aria-atomic`, so a selection change may announce fragments; the square buttons use `aria-pressed` for a single selection (`aria-current` fits better); the view and pause buttons are 32px, above the 24px minimum but below the 44px comfort size. The stored "readings" view renders the diagram first and swaps after hydration (one layout shift per reload).
- **Fix**: add `aria-atomic="true"`; the rest as a later polish.
- **Decision**: FIXED (Fix now: `aria-atomic` only; aria-current, 44px targets and the reload layout shift stay as later polish)

### F9 — Deviations from the plan that are documented but not in it

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md Phase 5; `LiveStateCard.astro`
- **Detail**: the plan said to extend `contract.test.ts` (a separate `live-flow-fixtures.test.ts` does it, stronger); reduced-motion and paused screenshots were not captured (`screenshots/README.md` says so); some `text-blue-100` and `bg-white/5` literals remain in untouched markup of `LiveStateCard.astro` and in `tone-classes.ts` for the neutral tone; extra files `preferences.ts`, `tone-classes.ts` and `VerdictChip.tsx` were added. All intent is met; none violates "What We're NOT Doing".
- **Fix**: add a one-line addendum in plan.md noting these.
- **Decision**: FIXED (Fix now: addendum in plan.md, Migration Notes)

### F10 — Unrelated bill-forecast fixes ride in this PR

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/bill-forecast.ts (e39f6c8, already merged to main through PR 57)
- **Detail**: two guards (central estimate inside its range, `generated_at` not more than 5 minutes ahead) were added to answer PR 57 review comments. Tested and documented in `docs/logic.md`; unrelated to the flow card.
- **Fix**: mention them in the change notes; nothing to revert.
- **Decision**: FIXED (Fix now: note in change.md)
