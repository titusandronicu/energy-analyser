---
change_id: solar-forecast-source
title: Restore the solar forecast in the lab's pushes, with Solcast as the source
status: archived
created: 2026-09-26
updated: 2026-09-26
archived_at: 2026-09-26T09:33:22Z
---

## Notes

Roadmap F-05 (FR-006, FR-015, FR-020). Home Assistant on the UGREEN had no solar forecast integration after the host move (~2026-07-21), so the lab pushed no forecast. On 2026-09-26 the owner added Forecast.Solar (flat roof, 0° / 0° / 10000 W) and Solcast. Forecast.Solar overshoots against real production (tomorrow 36.3 kWh vs Solcast 27.6 and a September best of 26.3), so the lab switches to Solcast and keeps Forecast.Solar for comparison. The code change is in homelab-2; this folder holds the plan.

Review follow-up (2026-09-26): the Forecast.Solar comparison values lived only in the live snapshot, so no comparison would ever have been possible. homelab-2 #28 adds `forecast_solar_today_kwh` / `forecast_solar_tomorrow_kwh` to lab history; install it on docker-core before closing this change. S-11 counts forecast accuracy from 2026-09-27, because the stored forecast for 2026-09-26 came from Forecast.Solar.
