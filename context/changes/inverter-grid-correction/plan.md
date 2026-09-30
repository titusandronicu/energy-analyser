# Inverter Grid Correction — DRAFT Plan (options, not decided)

> **DRAFT — needs the owner's decisions before `/10x-plan` finalises it.** This file lays out options A–D side by side and chooses none. No phase below is approved; the `## Progress` section is a placeholder that will be rewritten once an option (or a combination) is picked.

## Open Questions for the Owner (answer first)

1. **Which option, or which combination?** A (widen the note), B (fitted correction), C (PGE hourly where it exists), D (wait for the installer). A is compatible with every other option; B and C overlap for closed months.
2. **Installer status.** Has the CT check (placement and phase mapping) been booked? If a fix is days away, A alone may be enough; if it is months away, the live picture and the zero-export behaviour (~0.85 kW pushed to the grid, ~100 kWh of battery energy exported at night in August) matter more than the history.
3. **Is house use affected?** If `load_kwh` / `home_load_w` are derived from the same CT, every house-use figure and every rating denominator is wrong too. Should the lab check this (5-minute balance of PV + battery + grid against load) before choosing?
4. **Inferred numbers as measured?** Is it acceptable for the app to show a corrected import that no meter measured (option B), and if so, how must it be labelled?
5. **PGE figures in the app.** Option C needs the parked privacy decision (`context/foundation/roadmap.md:451`): may PGE-derived daily totals (not raw rows) leave the lab?
6. **Ratings across the flip.** Until something is fixed, should days whose 14-day norm window crosses 3/4 August be rated at all, rated with a note, or shown as "Poza oceną"?
7. **History after the physical fix.** Keep the pre-fix history as is with a note, correct it, or replace closed months with PGE?
8. **Cross-repo work.** Options B (if done in the lab) and C need a homelab-2 change and a history re-push. Is lab work in scope before the 2026-11-04 deadline?

## Overview

The inverter's grid reading is wrong for the whole history (16 July 2026 onwards), not only from 4 August as the app tells the user. It under-reads import before 3/4 August and over-reads net import after, following a fitted `±0.53 · PGE_net ± 0.70` kWh/h relation whose sign flipped when the CT direction was reversed. This change decides how the app should handle that until, and after, the installer fixes the CT. See `research.md` for the twelve consumers and the evidence.

## Current State Analysis

- All grid figures are the inverter's (`daily_energy`, live `state.grid_w` and today counters, `hourly_energy.grid_net_kwh`); nothing from PGE is in the app.
- One data-quality note exists, keyed to `GRID_IMPORT_OVERSTATED_FROM = "2026-08-04"` (`src/lib/services/calendar-view.ts:56-81`), shown in the calendar captions and "Co to znaczy?". The hourly card has its own inline caveat (`src/components/HourlyUsageCard.astro:152-156`). The live card, usage card and bill forecast carry none for import.
- Ratings argue the bias "largely cancels" against a 14-day norm (`docs/decisions.md:11`, `docs/logic.md:176`), which fails for norm windows that cross 3/4 August.
- PGE hourly data exists in the lab (`pge_hourly_reading`) about 1.5 months late; the app keeps hourly nets for 35 days only.

## Desired End State

To be set by the owner's answers. Common to every option: no surface claims July's import is trustworthy, and no rating silently compares days from opposite sides of the flip.

## What We're NOT Doing (in any option)

- No raw PGE or lab rows committed to this repo; tests use synthetic fixtures only.
- No changes to production data, Supabase, the homelab or any container from this change's planning.
- No attempt to fix the CT or the zero-export regulation in software; that is the installer's job.
- Export stays out of the calendar (existing decision), whatever option is chosen.

## Options

### Option A — Widen the data-quality note to the whole history

**What:** replace the "from 4 August, overstated" note with one that covers every day from `HISTORY_START` (2026-07-16): the inverter's grid reading is off for the whole history — too low until 3 August, too high in daytime after — until the CT is checked. Flag self-sufficiency and ratings accordingly (for example, a note on every rating, or "Poza oceną" for days whose norm window crosses the flip — question 6). Extend the caveat to the live card, the usage card's "Kupione z sieci" and the bill forecast's imported energy. Correct the docs.

**Touches:** `src/lib/services/calendar-view.ts:56-81` (constant becomes a range or a pair of periods; captions, `GRID_IMPORT_TERM`, `GRID_IMPORT_EXPLANATION`, `RATING_EXPLANATION`), `src/lib/services/calendar-view.test.ts:564-590`, `src/lib/services/period-rating.ts` (only if question 6 changes behaviour), `src/components/history/HistoryNotes.astro`, `src/components/HourlyUsageCard.astro:152-156` (the "10–20% at night" wording is load-dependent, not a stable percentage), `src/components/LiveStateCard.astro`, `src/components/UsageInsightCard.astro`, possibly `src/components/BillForecastCard.astro`, `docs/logic.md` (`:109`, `:163`, `:176`), `docs/decisions.md` (`:11`, and a new entry), `context/foundation/roadmap.md` (open questions 5 and 7).

**Pros:** honest, small, app-only, reversible, no new data paths; stays right after the CT fix if the note gets an end date.
**Cons:** numbers stay wrong; ratings around the flip stay distorted unless question 6 changes behaviour; a warning on every surface risks being ignored.

### Option B — Apply the fitted correction to displayed import

**What:** invert the fit per hour (`PGE_net ≈ −(inv_net + 0.70) / 0.53` before 4 August, `(inv_net − 0.70) / 0.53` after), then take `max(·, 0)` per hour and sum to a corrected daily import; show it instead of, or beside, the inverter's.

**Touches:** a correction must work on **hourly nets**, not daily counters (the daily import counter is gross 5-minute import, and the per-day relation is not linear in it). The app holds hourly nets for 35 days only, so for the whole history this has to be computed in the **lab** from its 5-minute history and re-pushed (homelab-2 change, `--from/--to` push), or the app gains a new stored "corrected" field (migration, contract field, `src/lib/ingest/contract.ts`). Then every consumer in `research.md` that reads `grid_import_kwh` switches source, plus labelling in each card.

**Pros:** figures closer to what PGE bills; ratings across the flip become comparable.
**Cons:** shows inferred numbers as if measured; the formula is unverified (R² 0.90 after the flip, fitted on import-only hours, 6.5 weeks); it must change the day the installer fixes the CT (a second breakpoint the app has to learn); if house use is derived from the same CT (question 3) it corrects only half the problem; cross-repo.

### Option C — Prefer PGE hourly data for days where it exists

**What:** for closed days PGE has settled (about 1.5 months behind), the lab computes daily import and export from `pge_hourly_reading` (hourly-balanced, what PGE bills) and pushes them; the app shows PGE figures for those days and the inverter's (with option A's note) for recent days, stating the source per period.

**Touches:** homelab-2 (a PGE-to-daily aggregation and a push of source-tagged totals), the ingest contract (a source field or separate columns, e.g. `grid_import_source`), a migration, `src/lib/services/calendar-view.ts` totals and charts, `period-rating.ts` (ratings mixing sources inside one norm window), the usage card baseline, and the docs. Requires the owner's privacy decision (question 5).

**Pros:** measured, billed figures for history; would allow grid export back into the calendar for closed months; unaffected by the CT fault and its future fix.
**Cons:** cross-repo and the largest; never covers recent weeks, so every view mixes two sources with a seam that moves; ratings whose norms straddle the seam need a rule; manual CSV import cadence decides freshness.

### Option D — Wait for the installer

**What:** change no code now beyond, at most, correcting the docs; after the CT fix, collect a couple of weeks of data, confirm against PGE, then decide A/B/C for the pre-fix history with a known end date.

**Touches:** nothing now (optionally `docs/logic.md`, `docs/decisions.md`, `roadmap.md` open question 5).

**Pros:** no inferred numbers, no rework when the fix lands; the fix also stops the ~0.85 kW involuntary export, which no software option addresses.
**Cons:** until then the app keeps telling the user that July is fine and August is "zawyżony", and ratings around 4 August stay distorted; no date is known.

### Comparison

|                               | A                 | B                                 | C         | D    |
| ----------------------------- | ----------------- | --------------------------------- | --------- | ---- |
| Repos                         | app               | lab + app (or app with migration) | lab + app | none |
| New data path                 | no                | yes                               | yes       | no   |
| Shows unmeasured numbers      | no                | yes                               | no        | no   |
| Covers recent days            | note only         | yes                               | no        | no   |
| Survives the CT fix unchanged | needs an end date | no                                | yes       | n/a  |
| Needs privacy decision        | no                | no                                | yes       | no   |
| Size                          | small             | medium–large                      | large     | none |

## Implementation Approach

Not chosen. A plausible shape, **for discussion only**: A now (small, app-only, honest), D in parallel (book the installer), then C for closed months once PGE figures may leave the lab — skipping B unless the installer is months away. The owner decides.

## Testing Strategy (applies to whichever option is picked)

- Unit tests with synthetic `daily_energy` / `hourly_energy` rows on both sides of 2026-08-04, including a rating whose norm window crosses the flip.
- Pinned copy tests (`calendar-view.test.ts:564-590`) updated with the new wording.
- No real PGE or lab rows in fixtures.

## References

- `context/changes/inverter-grid-correction/research.md`
- `context/archive/2026-09-28-grid-export-mismatch/change.md`, `frame.md`
- `context/archive/2026-09-30-history-calendar/plan.md`
- `context/changes/period-ratings/change.md`
- `docs/logic.md:99, 109, 163, 170-176, 196-197`; `docs/decisions.md:11, 16, 23-24, 65-69`; `context/foundation/roadmap.md:428, 430, 451`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.
>
> **Placeholder.** Phases are written once the owner has chosen an option; nothing here is approved.

### Phase 0: Owner decisions

#### Manual

- [ ] 0.1 The owner answers the open questions at the top of this plan and picks an option or a combination
- [ ] 0.2 The installer CT check is booked or its status recorded in `change.md`
- [ ] 0.3 Whether `load_kwh` is derived from the grid CT is checked in the lab and recorded in `research.md`
