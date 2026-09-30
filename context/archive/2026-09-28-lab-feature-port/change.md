---
change_id: lab-feature-port
title: What to port from the lab's old analyser page and Home Assistant dashboards
status: archived
created: 2026-09-28
updated: 2026-09-30
archived_at: 2026-09-30T07:01:52Z
---

## Notes

Raised 2026-09-28 by the owner: "we have a lot of interesting options and quite nice GUI
already on old HA solution in old energy analyser — check what can be implemented in our
new solution to make our solution better".

Discovery only. The output is roadmap and PRD input, not a single implementable change:
most candidates map onto slices that already exist (S-07, S-09, S-10, S-11, S-12, S-13,
S-15, S-17, S-20), a few are genuinely new scope, and several are already on the roadmap's
Parked list. See `research.md` in this folder.

**Owner decisions 2026-09-30** (the research's open questions; the output went to `context/foundation/roadmap.md` and `docs/decisions.md`):

- Already delivered since the research: candidate 1 (live power-flow visual) and 8 (relative-age freshness) by `live-flow-interaction` and `dashboard-refresh-icons-sparklines`; candidate 3 (PV and export shown) by the KPI row's sparklines; candidate 10 by S-07 `bill-forecast`. Open question 1 was settled for sparklines on 2026-09-29 (hand-rolled SVG).
- Q1, charts: S-15's day and month charts extend the hand-rolled server-rendered SVG, no chart library (recorded on S-15).
- Q2, per-day battery totals: yes, after M-1; parked with the battery charts and the energy-balance check (candidates 17–18).
- Q3, facts vs the LLM gate: folded into F-04, whose new contract section carries its facts apart from the narration; no new roadmap item; the old recommendation block keeps its gate (recorded on F-04).
- Q4, anomalies: S-10 ships the FR-014 count only (recorded on S-10); the explained list is parked, and reviving it means revisiting S-10's aggregates-only rule because the list names timestamped hours.
- Q5, micro-analysis feed: input only (FR-030); a visible feed is parked.
- Q6, battery-plan proposal: stays parked next to the device-control guardrail.
- Q7, deadline: no new scope in M-1; the one-sentence flow summary (candidate 2) is parked.
