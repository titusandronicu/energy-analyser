---
change_id: period-selector
title: Day/month/quarter/year period selector for historical energy data
status: archived
created: 2026-09-28
updated: 2026-09-29
archived_at: 2026-09-29T16:06:05Z
---

## Notes

User wants a calendar/period control (day, month, quarter, year) to navigate historical energy data, instead of the dashboard only ever showing "now" and "yesterday". Third of three follow-ups identified after dashboard-glass-restyle (alongside live-state-flow-visual, in progress, and richer "co to znaczy" perspective, not yet started). Old lab page precedent: a segmented "Okres: Dziś / Miesiąc / Kwartał" control (context/changes/dashboard-glass-restyle/old-lab-page-reference.md). Known constraint from earlier research: the app's real history only goes back to ~2026-09-25, so quarter/year views will mostly show "insufficient data" for now — worth building the capability regardless since it grows in value over time.

**Closed as superseded 2026-09-29, never planned.** Roadmap slice S-15 `history-calendar` already covers this: moving between days, months, quarters and years (`context/foundation/roadmap.md`, S-15; the partial-year view is S-16). Pick the idea up there; the old lab page precedent above (`context/archive/2026-09-28-dashboard-glass-restyle/old-lab-page-reference.md`) still applies.
