---
change_id: dashboard-refresh-icons-sparklines
title: Dashboard refresh: icons, sparklines, bill delta and system balance
status: plan_reviewed
created: 2026-09-29
updated: 2026-09-29
archived_at: null
---

## Notes

apply the approved Claude Designer dashboard refresh without new data: header logo and "Wyloguj się", lucide icons on card headings and a source legend footer, a server-rendered Sparkline component with 14-day and 7-day series from daily_energy, bill delta against the last invoice with a days-in-estimate bar, and the "Bilans systemu" value (PV minus home load) on the flow junction

Approved design: the Claude Designer canvas "Energy Analyser dashboard refresh" (https://claude.ai/artifact/L9CP96UZSkxwErmnBPX5K1, private; desktop 1440 and mobile 390 artboards). Owner shared a mockup image ("UI Proposal Board") as the target. Sparkline shapes and sample values in the canvas are illustrative; every value in the app must come from real data.

Owner decisions (2026-09-29):

- **PR 65 first.** The Frosted Aurora theme PR (cursor/frosted-aurora-dashboard-8dba, token cleanup of the cards) is merged by the owner before implementation; this change builds on it. Planning does not wait for it.
- **Palette from the design**, not from PR 65: background #0b1020, card #151a29, primary #b5a3f5, solar #f5c462, battery #f5a3c7, home #a3e6f5, grid #8b919e. PV moves from violet to yellow (`--flow-pv`), which touches the flow diagram tokens.
- **"Bilans systemu" = PV minus home load** (positive = surplus), computed from `state` (`pv_w`, `home_load_w`); needs a glossary entry.
- **Scope: no new data.** Steps 2, 3, 4, 6 and 7 of the proposed split: icons, source legend, logo and "Wyloguj się"; `Sparkline` component; daily sparklines from `daily_energy`; bill delta and days-in-estimate bar; the balance value. Out of scope, later changes: intraday sparklines (needs a view over retained pushes and a decision on `docs/decisions.md:20`) and recommendation tag chips (needs a lab `tags` field).
- **Flow diagram rebuilt to the design (2026-09-29, after the first screenshot pass; reverses plan assumption 3).** The owner saw that the rendered dashboard does not look like the approved artboards, mainly the flow diagram, and decided (binding) to rebuild it like `design/Main.dc.html` and `design/Mobile.dc.html`: flat icon tiles, PV on the left, a hub circle with the scale icon, Home, Battery and Grid in one right column, curved dashed connectors with arrowheads, big values (26/22 px), a verdict chip under each value, "Bilans systemu" under the hub, and the Schemat/Odczyty/Wstrzymaj controls in the title row (36 and 44 px); plus the bill range headline at 30 px in text-primary, the recommendation heading at 22 px and "Pokaż szczegóły" with a primary-tinted outline. LiveFlow behaviour (pause, freshness-gated motion, reduced motion, direction arrows, selection strip, "Odczyty") is unchanged. Delivered as new Phase 7 of the plan; the former Phase 7 is now Phase 8.
- Kept from the app (differs from the mockup): the bill card leads with the range ("od X zł do Y zł"), the central estimate is secondary; the delta line names the reference invoice ("względem ostatniego rachunku za sierpień"); recommendation chips stay the lab's severity chips.
