---
change_id: solar-forecast-source
title: Restore the solar forecast in the lab's pushes, with Solcast as the source
status: implementing
created: 2026-09-26
updated: 2026-09-26
archived_at: null
---

## Notes

Roadmap F-05 (FR-006, FR-015, FR-020). Home Assistant on the UGREEN had no solar forecast integration after the host move (~2026-07-21), so the lab pushed no forecast. On 2026-09-26 the owner added Forecast.Solar (flat roof, 0° / 0° / 10000 W) and Solcast. Forecast.Solar overshoots against real production (tomorrow 36.3 kWh vs Solcast 27.6 and a September best of 26.3), so the lab switches to Solcast and keeps Forecast.Solar for comparison. The code change is in homelab-2; this folder holds the plan.
