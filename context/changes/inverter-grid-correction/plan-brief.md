# Inverter Grid Correction — Plan Brief

> Full plan: `context/changes/inverter-grid-correction/plan.md`
> Research: `context/changes/inverter-grid-correction/research.md`

## What & Why

The inverter's grid sensor has measured wrongly since the history began on 16 July 2026, and house use is derived from the same sensor. Before 3/4 August it under-read import. On 3/4 August its direction was reversed, and from then on the net import is overstated. The app tells the owner something else: that import is "overstated from 4 August". Its ratings also claim the error cancels out, which is false across the direction change. This change makes the app say what is known, once and consistently, and stops ratings from comparing days across the change. The installer's physical fix runs in parallel.

## Starting Point

- One caveat, keyed to 4 August, sits in the calendar's captions and "Co to znaczy?".
- The hourly card has its own "10–20% at night" text.
- The live and usage cards say nothing about import.
- Ratings compare 4–17 August with norms built from July days.

## Desired End State

- **One caveat on every surface that shows the figures:** grid import and house use come from a faulty inverter sensor, for the whole history. The surfaces are the calendar, the live card, the usage card and the hourly card.
- **4 August appears only as the day the sensor's direction changed.**
- **Ratings:** days 4–17 August read "Poza oceną" with a neutral basis naming the change, no norm mixes days from both sides, and August is rated from 18 August on.
- **The docs and the roadmap say the same.**

## Key Decisions Made

| Decision            | Choice                                                                                  | Why (1 sentence)                                                                               | Source                   |
| ------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| Approach            | Option A: a whole-history caveat; option D (installer) runs in parallel outside the app | Honest, small and app-only; the root fix is physical                                           | Owner, 2026-09-30        |
| Fitted correction   | Option B rejected                                                                       | Unverified hourly formula, needs a lab re-push, shows unmeasured numbers                       | Owner, 2026-09-30        |
| PGE figures         | Option C is a separate later change                                                     | Cross-repo and needs the parked privacy decision                                               | Owner, 2026-09-30        |
| House use           | Treated as unreliable too                                                               | The inverter's power balance closes on every sample, so load is derived from the faulty sensor | Owner (earlier analysis) |
| Ratings at the flip | 2026-08-04 – 08-17 "Poza oceną" with a sensor basis; norms never mix sides              | Across the flip the bias changes sign, so a 14-day norm does not cancel it                     | Owner, 2026-09-30        |
| Usage baseline      | A note when the baseline spans 4 August, not suppression                                | Simpler: no new badge or verdict state                                                         | Plan                     |
| Hourly text         | Drop "10–20% at night"; use the shared caveat                                           | The percentage depends on load, so it is not stable                                            | Plan                     |
| After the fix       | Old history is kept with the caveat                                                     | Replacing it with PGE is option C's job                                                        | Owner, 2026-09-30        |
| Copy source         | One leaf module `src/lib/services/grid-sensor.ts`                                       | Calendar, ratings and usage all need the date and text without an import cycle                 | Plan                     |

## Scope

**In scope:** the caveat module and helper, the calendar captions and "Co to znaczy?", the rule for the sensor-change window in ratings, the live, usage and hourly card caveats, the usage baseline note, the glossary's night-draw wording, `docs/logic.md`, `docs/decisions.md` and the roadmap.

**Out of scope:**

- Any numeric correction (option B) and PGE figures (option C).
- Lab, contract, migration or Supabase changes.
- The bill forecast card, flagged for plan review.
- The live home verdict's norm.
- The CT and zero-export behaviour, which are the installer's job.

## Architecture / Approach

A new pure leaf module holds `SENSOR_DIRECTION_CHANGED_ON`, `crossesSensorChange()` and the Polish texts. `calendar-view.ts`, `period-rating.ts` and `usage-insight.ts` import it, and the cards render its texts. The rating rule reuses the existing `inconsistent` ("Poza oceną") kind, so no component changes for it. All tests use synthetic rows.

## Phases at a Glance

| Phase                                    | What it delivers                                                                              | Key risk                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Shared caveat, calendar copy, ratings | `grid-sensor.ts`, new calendar notes, the 08-04 – 08-17 "Poza oceną" rule, pinned-copy tests  | An existing rating test expects 08-04 as "Za mało danych"; it changes on purpose |
| 2. Dashboard cards and glossary          | Caveat on the live, usage and hourly cards; usage baseline note; night-draw glossary          | Card layout at 390 px with one more line                                         |
| 3. Docs and roadmap                      | `docs/logic.md`, `docs/decisions.md`, roadmap questions 5 and 7 and the parked item corrected | Missing a stale "from 4 August" sentence (a grep gate covers it)                 |

**Prerequisites:** none outside the repo.
**Estimated effort:** about one session in total.

## Open Risks & Assumptions

- The fitted relations and the "direction change" reading are the owner's analysis. The app states them as "most likely" only in the docs, never as figures on a card.
- More caveat lines may become background noise. There is one per card, in muted text.
- When the installer fixes the sensor, the caveat needs an end date. That will be a small follow-up change, not part of this one.

## Success Criteria (Summary)

- No surface says import is "overstated from 4 August", and every surface showing grid import or house use carries the whole-history caveat.
- Days 4–17 August 2026 are not rated, and August's month rating rests on 18 August onwards.
- The docs and the roadmap record the decision and drop the "largely cancels" claim.
