# Solar Forecast Source — Plan Brief

> Full plan: `context/changes/solar-forecast-source/plan.md`

## What & Why

The home lab sent no PV forecast for two months because Home Assistant lost its forecast integration in the July host move. The owner re-added Forecast.Solar and Solcast on 2026-09-26; Forecast.Solar overshoots real production, so the lab switches to Solcast and starts keeping Solcast's low/high estimates for the certainty feature (S-11). Roadmap F-05.

## Starting Point

Pushes carry Forecast.Solar values since 07:14 UTC today. The lab's collector maps four forecast values to Forecast.Solar entities; the history file keeps today/tomorrow forecasts; the push sends them. Deployed scripts equal homelab-2 `main`.

## Desired End State

The lab's forecast comes from Solcast (tomorrow 27.6 kWh instead of 36.3), Forecast.Solar stays as a comparison, the lab history gains low/high estimates, and the setup is written down so it can be rebuilt.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Forecast source | Solcast | Matches real September production; Forecast.Solar overshoots on this flat array. |
| Forecast.Solar | Kept as comparison-only values | S-11 can later show which source is more accurate here. |
| Low/high estimates | Recorded in lab history now, not sent to the app | Certainty data accumulates before S-11 changes the contract. |
| Health rule | Unchanged; comparison entities still count | Same as Solarman; documented next to the keys. |
| Apply | Runbook steps from merged `main`, with backups, after the owner's OK | The runbook already covers drift check, backup and install. |

## Scope

**In scope:** collector mapping and attribute capture, history fields, unit tests, inventory and README, install on docker-core, verification.

**Out of scope:** app contract changes (S-11), health rule changes, backfilling past forecasts, the Home Assistant config backup (homelab-2 #24).

## Architecture / Approach

Home Assistant (Solcast + Forecast.Solar) → `collect-ha-snapshot.py` (Solcast as forecast, Forecast.Solar as comparison, estimate10/90 from attributes) → `append-energy-history.py` (+4 fields) → `push-energy-analyser.py` (unchanged) → app.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Lab code and docs | homelab-2 PR with mapping, estimates, tests, docs | A comparison entity going missing marks snapshots degraded |
| 2. Apply and verify | Scripts installed on docker-core; pushes carry Solcast values | Live change; rollback is the runbook's `.bak` copies |

**Prerequisites:** both integrations set up in Home Assistant (done 2026-09-26); operator key `~/.ssh/docker-core`.
**Estimated effort:** one short session.

## Open Risks & Assumptions

- Solcast's free tier allows 10 polls a day; the integration manages that itself.
- The 10 kWp panel total is taken from the owner's Forecast.Solar entry; if it is wrong, both forecasts are off.

## Success Criteria (Summary)

- The dashboard's forecast is plausible next to real production.
- The lab history holds low/high estimates from today on.
- The setup is recorded in homelab-2.
