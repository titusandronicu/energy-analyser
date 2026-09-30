---
change_id: history-calendar
title: Browse past days and months in a history calendar
status: implemented
created: 2026-09-30
updated: 2026-09-30
archived_at: null
---

## Notes

Roadmap S-15 (US-05, FR-021). The user can move between days, months, quarters and years in a calendar and see each period's PV production, consumption, grid import/export, forecast against actual, and the recommendations from that period.

From the roadmap: the main new surface; must stay usable on a phone and reuse S-14's period and minimum-data rule rather than invent its own. Charts (owner's decision 2026-09-30, `lab-feature-port`): the day and month charts extend the hand-rolled server-rendered SVG of the sparklines, with no chart library; the Home Assistant 30-day PV-vs-consumption and import-vs-export charts (`energy-glass.yaml:624-737` in homelab-2) are the visual reference. Year view: PRD v3.2 (2026-09-28) un-parked a partial-year view as roadmap S-16 `calendar-year-view`; whether S-15 includes it is open (research.md). Daily history now starts on 2026-07-16 (F-03); 2026-07-20 has no totals and 2026-07-31 has no row. Unlocks S-17 ratings, S-19 day notes, S-20 trends and S-18 summaries.
