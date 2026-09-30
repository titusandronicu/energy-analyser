# Period Ratings — Plan Brief

> Full plan: `context/changes/period-ratings/plan.md`

## What & Why

Roadmap S-17 (FR-022): each completed day and month in the history calendar gets a good / neutral / bad rating. It compares the period's self-sufficiency, the share of the house's use not bought from the grid, with the house's recent norm. The owner sees at a glance which days went well. The basis, period and number of days are always shown, and the rating never advises.

## Starting Point

The calendar (S-15) already reserves a `rating` slot on its day and month views. The usage card (S-04) has a median norm, but it's tied to house use and to "yesterday", uses relative bands where higher is worse, and a 30-day window that would lag the autumn slide (roadmap question 8). Production data shows self-sufficiency mostly follows the sun: 55–70% on typical days, 23–37% on cloudy ones.

## Desired End State

A past day's page shows "Dobry dzień", "Przeciętny dzień" or "Słaby dzień" with its basis, for example: "Samowystarczalność 30,9% — 27,4 punktu poniżej normy. Norma: mediana z 13 dni…". On cloudy days it adds "Mało słońca: 10,9 kWh z paneli, zwykle 23,4 kWh". A completed month's view carries "Dobry / Przeciętny / Słaby miesiąc" next to its totals (the quarter view stays unrated). Days with too little data, or whose import exceeds their use, say so instead of being rated.

## Key Decisions Made

| Decision          | Choice                                                                                          | Why (1 sentence)                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Thresholds        | ±10 percentage points from the norm; exactly ±10 is neutral                                     | Works across the bounded 0–100% range and reads plainly                                 |
| Norm              | Median of the qualifying days in the 14 days before, at least 7                                 | Follows the autumn slide twice as fast as 30 days, which answers question 8 for ratings |
| Cloudy days       | Rated, with a "mało słońca" note when PV is below 70% of the norm days' PV                      | Keeps FR-022 and explains the cause                                                     |
| Inconsistent days | Import > use means not rated and left out of norms ("dane niespójne")                           | Keeps meter glitches (question 7) out of ratings                                        |
| Month             | Median of its rated days' gaps, same ±10 rule, at least 7 rated days                            | Immune to the seasonal slide that month-vs-month comparison would suffer                |
| Colours           | Green "Dobry" / grey "Przeciętny" / red "Słaby"; "za mało danych" stays grey with its own words | Neutral looks neutral; amber keeps meaning "warto sprawdzić"                            |
| Placement         | Day view badge and month totals only                                                            | The owner's choice; the grid, quarter and dashboard are left out                        |
| Seasonal norm     | Not built until a year of history exists                                                        | No same-season data before about July 2027                                              |

## Scope

**In scope:** the rating service with tests; filling the day and month `rating` slots; loading 14 extra days; a rating badge with its basis; "Co to znaczy?" notes; docs and roadmap.

**Out of scope:** grid markers, quarter and dashboard ratings; the seasonal norm; any change to the usage card; weather data; lab, contract or migration changes; gap filling (F-06); advice.

## Phases at a Glance

| Phase                        | What it delivers                                                                                                         | Key risk                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1. Rating logic              | `period-rating.ts`: self-sufficiency, 14-day norm, ±10 bands, low-sun note, month rule, tested on production-shaped data | Edge rules; pinned by tests at exactly ±10                    |
| 2. Calendar display and docs | Filled rating slots, rating badge on the day view and month totals, notes, docs                                          | Widened reads leaking into totals or charts; pinned by a test |

**Prerequisites:** none outside the repo.
**Estimated effort:** about one session per phase.

## Open Risks & Assumptions

- Gaps in late September leave those days "za mało danych" until F-06 fills them.
- The grid-import over-report lowers every day alike; ratings compare days with each other, so it mostly cancels, and the notes say so.
- A run of cloudy weeks lowers the norm, so a sunny day then rates better than it would against a longer window.

## Success Criteria (Summary)

- 2026-09-11 reads "Słaby dzień" with "Mało słońca", 2026-09-12 reads "Przeciętny dzień", and 2026-09-29 reads "za mało danych: 5 z 7".
- August 2026 shows a month rating with its basis; the current month and today are never rated.
- Every rating names its norm period and number of days and gives no advice.
