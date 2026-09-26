# Solar Forecast Source Implementation Plan

## Overview

Make the home lab send a realistic PV forecast again. The lab reads its four forecast values from Solcast instead of Forecast.Solar, keeps Forecast.Solar as comparison-only values, and starts recording Solcast's low (10%) and high (90%) estimates in its own history so certainty (S-11) has data when it is built. Roadmap F-05 (FR-006, FR-015, FR-020). All code lives in homelab-2; nothing changes in this app.

## Current State Analysis

- From ~2026-07-21 to 2026-09-26, Home Assistant on the UGREEN had no forecast integration, so `collect-ha-snapshot.py` got 404s for the four forecast entities, marked the snapshot `degraded`, and the pushes carried no forecast (production: 0 of 53 days with `pv_forecast_kwh`).
- On 2026-09-26 the owner added Forecast.Solar (plane `0° / 0° / 10000W`: flat, one 10 kWp array) and Solcast (site from the owner's Solcast account, API limit 10/day, estimate10/estimate90 attributes on). Pushes since 07:14 UTC are `ok` and carry Forecast.Solar values.
- Forecast.Solar overshoots: for 2026-09-27 it says 36.3 kWh; Solcast says 27.6 kWh; the best September day so far was 26.3 kWh and the best ever 35.6 kWh (2026-07-30).
- homelab-2 `infra/compose/energy-app/scripts/collect-ha-snapshot.py` (`ENTITY_MAP`, lines ~40–80 on `main`) maps `forecast_today_kwh`, `forecast_remaining_today_kwh`, `forecast_tomorrow_kwh`, `forecast_power_now_w` to Forecast.Solar entities. Any missing mapped entity makes the snapshot `degraded` (`"health": "ok" if not missing else "degraded"`); the Solarman comparison entities already follow that rule.
- `append-energy-history.py` writes `forecast_today_kwh` / `forecast_tomorrow_kwh` into each history row; `push-energy-analyser.py` sends them as the recommendation forecast and derives the per-day `pv_forecast_kwh` from the first sample at or after 06:00 local.
- The deployed scripts on docker-core are identical to homelab-2 `main` (checked 2026-09-26 with the runbook's key); the local checkout's branch is behind, which is what issue #25 saw.

## Desired End State

- The snapshot's four forecast values come from Solcast (`sensor.solcast_pv_forecast_forecast_today`, `…_forecast_remaining_today`, `…_forecast_tomorrow`, `…_power_now`; units kWh and W, the same as before).
- The snapshot also holds Forecast.Solar's four values under comparison-only keys, and Solcast's `estimate10` / `estimate90` for today and tomorrow.
- Each lab history row gains `forecast_today_p10_kwh`, `forecast_today_p90_kwh`, `forecast_tomorrow_p10_kwh`, `forecast_tomorrow_p90_kwh`; the app push is unchanged (the contract does not carry them yet).
- The panel details and forecast setup are recorded in homelab-2's inventory and energy-app README, so a lost Home Assistant config can be rebuilt.
- On production, pushes are `ok` and their forecast equals Solcast's values.

### Key Discoveries:

- Units match between the two sources (kWh for energy, W for power), so the switch is a mapping change with no conversion.
- `fetch_state` already returns the full state JSON including `attributes`, so the low/high estimates need no extra requests.
- The runbook `runbooks/energy-analyser-push.md` has pre-checks (drift diff), a backup step and `sudo install` apply steps with `ssh -i ~/.ssh/docker-core funky@192.168.50.30`.

## What We're NOT Doing

- Sending the low/high estimates or any confidence to the app: that is S-11's contract change.
- Changing how snapshot health is judged (comparison entities keep counting towards `degraded`, as Solarman's do).
- Rewriting past history: the 53 days without a forecast, and today's per-day forecast already taken from Forecast.Solar, stay as they are.
- Home Assistant configuration changes (both integrations are already set up by the owner), and the Home Assistant config backup (homelab-2 #24).

## Implementation Approach

A small mapping change plus an attribute map in the collector, two new comparison-free fields in the history appender, and unit tests for the new pure helpers. Docs record the setup. Then install the changed scripts on docker-core with the runbook's steps and verify through the next pushes.

## Critical Implementation Details

- **Health rule.** Adding the Forecast.Solar comparison keys to `ENTITY_MAP` means removing Forecast.Solar from Home Assistant later would mark every snapshot `degraded`; say so in the comment next to those keys. Low/high attributes are read from already-fetched Solcast states and must never add to `missing`.
- **Deploy together.** Install `collect-ha-snapshot.py` and `append-energy-history.py` together (the runbook's rule for the collector, appender and push script); the push script itself is unchanged.

## Phase 1: Lab code and docs (homelab-2)

### Overview

On a homelab-2 branch from `main`: switch the forecast source, keep the comparison, record low/high estimates, test, document. Open a PR.

### Changes Required:

#### 1. Collector

**File**: homelab-2 `infra/compose/energy-app/scripts/collect-ha-snapshot.py`

**Intent**: Read the forecast from Solcast, keep Forecast.Solar as comparison-only values, and capture Solcast's low/high estimates.

**Contract**: `ENTITY_MAP` forecast keys point to the four Solcast entities; new keys `forecast_solar_today_kwh`, `forecast_solar_remaining_today_kwh`, `forecast_solar_tomorrow_kwh`, `forecast_solar_power_now_w` point to the old Forecast.Solar entities, with a comparison-only comment. New `ATTRIBUTE_MAP` `{value key: (source value key, attribute)}` for `forecast_today_p10_kwh` / `_p90_` and `forecast_tomorrow_p10_kwh` / `_p90_` from `estimate10` / `estimate90`, applied by a pure helper over the fetched states; a missing state or attribute gives `None`. `source.forecast_source` records `"solcast"` with `"forecast_solar"` as comparison.

#### 2. History appender

**File**: homelab-2 `infra/compose/energy-app/scripts/append-energy-history.py`

**Intent**: Keep the low/high estimates in the lab's history from now on.

**Contract**: each row gains the four `forecast_*_p10_kwh` / `_p90_kwh` fields (`as_float`, `None` when absent). Older rows without them stay valid.

#### 3. Tests

**File**: homelab-2 `infra/compose/energy-app/scripts/test_collect_ha_snapshot.py` (new; import style as in `test_push_energy_analyser.py`)

**Intent**: Prove the attribute helper and the new history fields.

**Contract**: attributes present → numbers; attribute missing or non-numeric → `None`; state missing → `None` and not in `missing`; a history row built from a snapshot with and without the estimates.

#### 4. Docs

**Files**: homelab-2 `inventory/services/ugreen-homeassistant-rehearsal.yaml`, `infra/compose/energy-app/README.md`

**Intent**: Record the setup so it can be rebuilt.

**Contract**: inventory lists both integrations and their UI-only settings: Forecast.Solar plane 0° declination, 0° azimuth, 10000 W; Solcast site from the owner's account (API key only in HA), API limit 10; one array on inverter input PV1, observed peak 7.06 kW. README line "Forecast.Solar remains the forecast source" becomes Solcast, with Forecast.Solar as comparison.

### Success Criteria:

#### Automated Verification:

- Lab script tests pass: `python3 -m unittest test_push_energy_analyser test_collect_ha_snapshot` (in `infra/compose/energy-app/scripts`)
- `python3 -m py_compile` passes for the two changed scripts

#### Manual Verification:

- The homelab-2 PR diff shows only the mapping, the attribute capture, the history fields, the tests and the docs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Apply on docker-core and verify

### Overview

With the owner's explicit OK, install the two changed scripts on docker-core with the runbook's steps, then verify through snapshots, history and production pushes.

### Changes Required:

#### 1. Apply

**File**: homelab-2 `runbooks/energy-analyser-push.md` (steps followed, and updated if the file list changes)

**Intent**: Install from the merged `main`, after the runbook's drift pre-check and backup step.

**Contract**: `collect-ha-snapshot.py` and `append-energy-history.py` installed with `sudo install -o root -g root -m 0755`; backups of the previous files kept with the runbook's `.bak-<ts>` naming; no systemd or env change.

### Success Criteria:

#### Automated Verification:

- The next snapshot on docker-core reports `health=ok` and its forecast values equal the Solcast sensors
- The newest lab history row has the four low/high fields filled
- The next production push's recommendation forecast equals Solcast's today/tomorrow values (checked by SQL through the Supabase connector)

#### Manual Verification:

- Tomorrow's forecast shown on the production dashboard is in a plausible range next to recent September production

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Attribute helper: present, missing, non-numeric, missing state.
- History row: with and without the new fields.

### Integration Tests:

- On docker-core: one collector run and the resulting snapshot; the next timer push in production.

### Manual Testing Steps:

1. Compare the dashboard's forecast with the Solcast card in Home Assistant.
2. Next morning, check that the day's `pv_forecast_kwh` in production equals Solcast's first reading after 06:00.

## Performance Considerations

None: four more entity reads per 5-minute run against the local Home Assistant, no extra Solcast API calls (the integration polls Solcast itself within its limit of 10 a day).

## Migration Notes

Additive for the history file and the snapshot; the push contract is unchanged. Rollback: reinstall the `.bak-<ts>` copies.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-05; unlocks S-11)
- PRD: `context/foundation/prd-v3.md` (FR-006, FR-015, FR-020)
- homelab-2: `infra/compose/energy-app/scripts/collect-ha-snapshot.py`, `append-energy-history.py`, `push-energy-analyser.py`, `runbooks/energy-analyser-push.md`
- Related issues: homelab-2 #24 (HA config backup), #25 (deploy drift; stale, deployed equals `main`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Lab code and docs (homelab-2)

#### Automated

- [x] 1.1 Lab script tests pass — homelab-2@70a701c
- [x] 1.2 py_compile passes for the two changed scripts — homelab-2@70a701c

#### Manual

- [x] 1.3 The homelab-2 PR diff shows only the mapping, the attribute capture, the history fields, the tests and the docs — homelab-2@70a701c

### Phase 2: Apply on docker-core and verify

#### Automated

- [x] 2.1 Next snapshot reports health=ok with Solcast forecast values — homelab-2@3dfaf64
- [x] 2.2 Newest lab history row has the four low/high fields — homelab-2@3dfaf64
- [x] 2.3 Next production push's forecast equals Solcast's values — homelab-2@3dfaf64

#### Manual

- [x] 2.4 Dashboard forecast is plausible next to recent September production — confirmed by the owner 2026-09-26
