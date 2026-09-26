# Follow-ups from the implementation review

Queued from `reviews/impl-review.md`. Each item becomes its own change (`/10x-new` → `/10x-plan` → `/10x-plan-review` → `/10x-implement`), per lessons.md "Plan before implementing, even straight after research".

1. **Estimated ranges when own data is short (from F2, owner decision 2026-09-26).** With fewer than 7 own days in the fallback window, show the typical ~140 m² heat-pump house ranges for the month, clearly marked as an estimate, instead of "not enough data". Changes FR-019 for the usage card; needs a PRD/decisions update and wording that makes the estimate obvious. Open: should the badge stay grey ("za mało danych") while the ranges show?
2. **Inconsistent early rows (from research open question 1).** Rows 2026-07-26 to 2026-08-03 in `daily_energy` break the energy balance; correct or exclude them in homelab-2 before the seasonal baseline uses them (about July 2027).
3. **Autumn lag of the 30-day norm (plan review F3).** When heating starts (October–November), the trailing 30-day median trails the season and ordinary days may read "powyżej normy". Consider adjusting own days by a heating degree-day or seasonal index before taking the median (shape from the public profile, level from own data). The S-17 plan must check the same risk (`roadmap.md`, S-17).
