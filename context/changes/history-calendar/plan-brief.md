# History Calendar — Plan Brief

> Full plan: `context/changes/history-calendar/plan.md`
> Research: `context/changes/history-calendar/research.md`

## What & Why

Roadmap S-15 (US-05, FR-021): the owner wants to look back. A calendar lets them move between days, months and quarters and see what the house produced, used and drew from the grid in each period. It also shows how the forecast compared with the actual output, and what the app recommended. Every figure states the period and number of days it rests on. The calendar is also where ratings (S-17), notes (S-19) and summaries (S-18) will appear.

## Starting Point

- The app has one page, the dashboard, and no navigation. Its figures cover today and the recent days.
- Daily totals go back to 2026-07-16, with 10 missing and 5 empty days. Trusted forecasts start on 2026-09-27, and recommendations on 2026-09-25.
- The pieces to reuse:
  - A tested SVG sparkline and a gap-aware daily series builder.
  - The FR-018 period text, status badge and "Co to znaczy?" explanations.

## Desired End State

"Historia" in the header opens `/dashboard/history` on the current month, or on the previous one while the current month has fewer than 7 complete days:

- A tappable month grid.
- Totals over complete days with "z N z M dni".
- Daily charts: PV bars with a house-use line, and grid-import bars.
- Forecast against actual where a forecast exists.

A day shows its totals, forecast and morning recommendation, with the later ones folded. A quarter shows its months side by side. Gaps stay gaps, today is never treated as finished, and nothing is extrapolated.

## Key Decisions Made

| Decision           | Choice                                                                                     | Why (1 sentence)                                                                             | Source          |
| ------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------- |
| Periods            | Day, month, quarter; year stays in S-16                                                    | History reaches back only to July 2026, and the roadmap already splits the year out          | Plan            |
| Missing days       | Not filled here; a separate lab change fills them from Home Assistant's statistics         | Keeps S-15 app-only and reuses the F-03 range push                                           | Research + Plan |
| PGE and export     | Neither shown; export explained                                                            | The inverter's export reads 0 from mid-August, and PGE figures need a privacy decision first | Research + Plan |
| Hourly detail      | None in the day view                                                                       | The app keeps hours for only 35 days, so days would behave differently                       | Plan            |
| Day's advice       | The first recommendation after 06:00, the rest folded                                      | The morning one set the day's battery plan, and nothing is hidden                            | Plan            |
| Totals             | Sum over complete days with a day count; fewer than 7 days shows "za mało danych"          | Honest, reuses the app's 7-day minimum, and never extrapolates                               | Plan            |
| Charts             | Month: daily bars (PV with a house-use line; import). Quarter: grouped monthly bars        | Mirrors the Home Assistant reference while keeping the app's gap and no-today rules          | Research + Plan |
| Entry and URL      | `/dashboard/history`, header link, `?day/?month/?quarter`                                  | Covered by the existing protected prefix, works with no JS, and can be bookmarked            | Plan            |
| Landing month      | Current month from its 7th complete day, the previous month before that                    | Never opens on an empty "za mało danych" page early in a month                               | Plan review     |
| Past advice        | `toRecommendationView` gets a `historical` option; the day view has its own advice section | Otherwise every past day's advice shows a red "dotyczy innego dnia" badge                    | Plan review     |
| Page layout        | Extract `AppShell` used by the dashboard and history                                       | `DashboardBody` hard-codes the dashboard's cards, so there was no shell to reuse             | Plan review     |
| Forecast vs actual | Only from 2026-09-27, with the same 7-day minimum                                          | No source holds trusted forecasts earlier                                                    | Research        |

## Scope

**In scope:**

- Period and view-model logic with tests.
- Range loaders.
- Bar geometry and two SVG chart components.
- The history page with day, month and quarter views.
- Header navigation, smoke checks, docs and roadmap updates.

**Out of scope:** the year view (S-16); filling gaps; PGE figures; the export series; hourly charts; ratings, notes and summaries (reserved slots only); any contract, migration or lab change.

## Architecture / Approach

Pure functions in `src/lib/calendar/period.ts`, `src/lib/services/calendar-view.ts` and `src/lib/bars.ts` decide every number, status and label, and are unit-tested. `calendar-data.ts` loads only the chosen period's rows under the existing owner-only RLS. `src/pages/dashboard/history.astro` reads the period from the URL and renders, inside a shared `AppShell` (also used by the dashboard), Astro view components built from `Panel`, `CardHeading`, `StatusBadge` and `TermsExplained`. The charts are server-rendered SVG with token colours and accessible labels, and the page needs no client JS.

## Phases at a Glance

| Phase                  | What it delivers                                                             | Key risk                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. Periods and data    | Period parsing/navigation, range loaders, day/month/quarter view models      | Warsaw day boundaries and DST; covered by unit tests                                        |
| 2. Charts              | Zero-baseline bar geometry, daily and grouped-month SVG charts               | Legibility of 31 bars at 390 px                                                             |
| 3. Page and navigation | `AppShell`, `/dashboard/history`, header nav, smoke checks, docs and roadmap | The shell extraction touches the dashboard (regression check); phone layout checked by hand |

**Prerequisites:** none outside the repo (the page reads `daily_energy` and `recommendations` only).
**Estimated effort:** about one session per phase.

## Open Risks & Assumptions

- Many days in August and September stay gaps until the separate gap-fill change runs.
- Grid import is over-reported from 4 August. The calendar explains this rather than correcting it.
- Recommendation reads rely on staying under PostgREST's 1000-row cap for a month (about 24 a day today).

## Success Criteria (Summary)

- The owner reaches any day, month or quarter since 2026-07-16 from the header by tapping, on a phone.
- Every total states its period and number of days, gaps are visible, and too little data reads "za mało danych".
- A past day shows the recommendation it was given that morning.
