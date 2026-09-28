# bill-forecast — session handoff

> Updated 2026-09-28 after `/10x-plan-review`. Paste into a fresh session to pick this up.

Context: energy-analyser, slice S-07 `bill-forecast` (projected cost of the
current month in PLN, with a range and the days behind it — US-03, FR-011).

```
Repo:    /Users/kamilnowosad/code/dev-hub/projects/energy-analyser
Branch:  docs/bill-accuracy   ← leftover from the archived change; branch for
                                bill-forecast before implementing
Plan:    context/changes/bill-forecast/plan.md            (5 phases, 32 criteria)
Brief:   context/changes/bill-forecast/plan-brief.md
Review:  context/changes/bill-forecast/reviews/plan-review.md
change.md: status plan_reviewed · roadmap S-07: planning
```

Plan review verdict: **REVISE → SOUND**, all 10 findings fixed and applied to the
plan. Progress re-verified afterwards: 32/32 criteria map 1:1, numbering
sequential per phase, no stray checkboxes.

Uncommitted (intentionally — commits with phase 1):

```
 M context/changes/bill-forecast/change.md
 M context/foundation/roadmap.md
?? context/changes/bill-forecast/plan.md
?? context/changes/bill-forecast/plan-brief.md
?? context/changes/bill-forecast/handoff.md
?? context/changes/bill-forecast/reviews/
```

## Do next

1. `git switch -c feat/bill-forecast`
2. `/10x-implement bill-forecast phase 1`

Plan review is done, so nothing gates implementation.

## Phase order is load-bearing

Phases 1–4 are app-side and must ship **and deploy** before phase 5 changes the
lab (`docs/ingest/README.md:58-62`). Phase 5 now opens with item #0, a preflight:
parse the real `current-month-bill-forecast.json` against the deployed contract
_before_ touching the lab. Do not skip it — the contract is `z.strictObject`, so
one undeclared key 422s the entire push and stops live state and the
recommendation updating in production.

## Decisions already taken

Don't reopen these; the brief's Key Decisions table carries the one-line why for each.

- Range is the headline; central estimate secondary; whole złoty, no grosze.
- Lagging reference month: show the figure, disclosed, naming the month. Grey
  "za mało danych" stays reserved for fewer than 7 complete days.
- Verdict against `closed_month_check.invoice_gross_pln`; **no** verdict when the
  key is absent — never a fallback to `computed_gross_pln`.
- Freshness: the body's own `generated_at` past 30 minutes blanks the figure.
- Validation split: shape in zod; plausibility **and settlement signs** in the
  mapper. The `settlement` block is deliberately permissive in zod because
  `reference_feed_in_kwh` has been observed negative, and a rejection there
  would take all ingestion down.
- `closed_month_check`: one line inside the "Na podstawie" details, worded as a
  test of the arithmetic. Reconciliation is a PRD non-goal.
- A wrong `month` downgrades the badge to `problem` and names the actual month —
  it does not blank the figure (follows `isFromEarlierDay`).
- Card sits second on the dashboard, after live state.

## What the review changed

Worth skimming before you start, because Phase 1 roughly doubled:

- **Phase 2** — the view filters on key presence (`and p.payload ? 'bill_forecast'`).
  `live_state` is _not_ a precedent for an optional section; without the
  predicate, any push omitting the section would blank the card and discard a
  good forecast from minutes earlier.
- **Phase 1** — now 6 items: a `--file <path>` flag on `push-fixture.mjs`, a
  `scripts/fixtures/bill-forecast/` directory of variant bodies, and a
  `generated_at` rewrite. Without that rewrite the committed example goes stale
  the next day and the happy path is never rendered by any fixture or smoke run.
- **Phase 4** — `scripts/smoke.mjs` is now a named change. Its whole-page
  `notContains` assertions ("Nieaktualna", "Dane nieaktualne", "Nie udało się
  wczytać porównania") constrain the new card's Polish copy, and CI runs it.

## Still live

- **The lab's field list remains the weakest assumption.** It is documented in
  `change.md:18-23`, never verified against the running
  `build-current-month-bill-forecast.py`, and
  `context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-4.md:89`
  found five places where that change's plan diverged from what actually runs.
  Phase 5's preflight is the gate; trust it, don't skip it.
- **`MAX_PLAUSIBLE_BILL_PLN = 7000` is derived, not measured** — from the lab's
  200 kWh/day counter-glitch bound over a 31-day month. A genuinely high month
  would be blanked.
- **The range is wide** (±40%) and `confidence` reads `low` for about three weeks
  of every month. Both are honest, neither is comfortable; worth revisiting after
  living with the card.
- **The brief still says "~2–3 sessions"** — written before the review grew
  Phase 1 and added the Phase 5 gate. Treat it as optimistic; I left the number
  alone rather than invent a new one.

## Convention note

Citations to another change's reviews must be fully qualified
(`context/archive/2026-09-27-bill-accuracy/reviews/…`). A bare
`reviews/plan-review.md:33` now resolves to _this_ change's review, which is a
different document — seven references had to be fixed for exactly this reason.
