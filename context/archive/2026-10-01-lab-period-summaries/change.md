---
change_id: lab-period-summaries
title: Lab writes plain-language summaries of today, days and months and pushes them to the app
status: archived
created: 2026-10-01
updated: 2026-10-07
archived_at: 2026-10-07T13:34:43Z
---

## Notes

Roadmap F-04 (foundation, FR-023, FR-030); it unlocks S-18 (period summaries in the dashboard and calendar).

The home lab's stronger model (the existing narration chain) turns the local model's frequent observations into plain-language texts for someone without energy knowledge:

- a short explanation of what today's figures mean;
- after each completed day and month, a summary of what happened. It takes Polish seasons into account, points out consumption patterns and gives no advice.

The lab pushes them, and the app stores them per period.

Constraints from the roadmap:

- The work is in homelab-2, plus a new optional contract section.
- The narration describes only, like the recommendation's facts-only rule.
- The section carries its facts apart from the narration, so a failed LLM call leaves the facts in the push (owner's decision 2026-09-30, `lab-feature-port`). The old recommendation block keeps its gate.

Open roadmap unknown: which facts go into a day and a month bundle (totals, self-sufficiency, weather, season), and which provider narrates them.

Context from 2026-09-30/10-01:

- The grid sensor is faulty for the whole history, so grid import and house use are unreliable (`context/archive/2026-09-30-inverter-grid-correction/`). Summaries must not present those figures as measured truth.
- The lab's fixed-rule findings were just cleaned up (`context/archive/2026-09-30-lab-findings-cleanup/`).
- Day notes exist but never leave the app.

Code lives in homelab-2; this folder tracks the change, as with `history-backfill`.
