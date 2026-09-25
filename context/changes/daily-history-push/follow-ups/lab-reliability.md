# Follow-up: lab reliability issues found during F-02

Found 2026-09-25 while backfilling daily history. Details and fixes: homelab-2 `runbooks/proxmox-nic-hang-and-alerting.md`.

1. **No PV forecast since the Home Assistant move (~2026-07-21).** The UGREEN Home Assistant has no solar-forecast integration, so `forecast_today_kwh` is null in every history row, recommendations carry no forecast, and `daily_energy.pv_forecast_kwh` stays empty. Owner: Kamil (add Forecast.Solar or Solcast in the HA UI; expected sensors `energy_production_today`, `energy_production_today_remaining`, `energy_production_tomorrow`, `power_production_now`). Blocks plan row 3.4's forecast part and S-11.
2. **Proxmox NIC hangs (e1000e on I219-LM).** The host stayed up but off the network 2026-09-13 to 09-19 and 09-21 to 09-25, so 13 days are missing from the history. Fixed 2026-09-25 (TSO/GSO off, persisted). Watch: hang count stays 0 for a week.
3. **No alert on silence.** The push script now calls an optional heartbeat URL after each successful push. Owner: Kamil (create an Uptime Kuma push monitor and ping monitors on the UGREEN, then put the push URL into `.env.push`).
4. **Snapshot health was too coarse for day totals.** Resolved in this change: the lab records `counters_ok`, and day totals no longer depend on forecast sensors.

Plan row 3.4 was accepted on 2026-09-25 for the history part (48 days in production; the 13 outage days cannot be recovered). The forecast part is tracked by item 1 above and re-checked when S-11 (forecast accuracy) is planned.
