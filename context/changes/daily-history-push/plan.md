# Daily History Push Implementation Plan

## Overview

The home lab starts sending per-day energy totals (PV, home load, grid import, grid export) and each day's PV forecast in every push, and the app stores them. This is roadmap foundation F-02 (FR-003, FR-015; issue #21). It unblocks S-04 (seasonal usage insight) and S-11 (forecast accuracy). The work spans two repos: energy-analyser gets one optional contract field and its storage; homelab-2's push script derives the days.

## Current State Analysis

- **App contract:** `daily_history` is already accepted: up to 62 unique entries of `day`, `pv_kwh`, `load_kwh`, `grid_import_kwh`, `grid_export_kwh` (`src/lib/ingest/contract.ts:51-72`). The entry schema is strict, so any other key is rejected with 422.
- **App storage:** `public.ingest_push` upserts each entry into `public.daily_energy`, and the push with the latest `captured_at` wins per day (`supabase/migrations/20260923101001_push_ingestion.sql:34-43, 112-130`). There is no forecast column.
- **Lab source:** `append-energy-history.py` writes one row per 5-minute refresh to `$STACK_DIR/web/data/energy-history.jsonl` and keeps about 90 days (25,920 lines). Each row has `generated_at` (UTC), `source_health`, the day's cumulative counters `produced_kwh`, `consumed_kwh`, `bought_kwh`, `exported_kwh` (Deye "today" sensors, reset daily), and `forecast_today_kwh` (Forecast.Solar, re-forecast through the day).
- **Lab conventions:** the lab already derives days as "latest sample per Europe/Warsaw day" (`build-pge-deye-cross-check.py:74-137`), and treats a day as complete only if its last sample is at 21:00 or later (`build-current-month-bill-forecast.py:27`).
- **Lab traps:** a missing sensor is written as 0, not null (`collect-ha-snapshot.py:176-178`); samples just after midnight can still carry yesterday's totals (cloud polling lag); the refresh script never exports the history path to the push script (`refresh-energy-agent-data.sh:7`).
- **Lab push script:** `push-energy-analyser.py` builds `state` and `recommendation` in pure functions (`build_state`, `build_recommendation`, `build_payload`) with unittest coverage in `test_push_energy_analyser.py`.

## Desired End State

- Every lab push carries `daily_history` for the last 35 Europe/Warsaw days (today included, as a partial day that the next push replaces), each with the four totals and `pv_forecast_kwh` where known.
- A one-time manual push sent 62 days, so the app starts with about two months of history.
- Production `daily_energy` has one row per day with `pv_forecast_kwh` filled for days that had a morning forecast.
- No incomplete past day, unhealthy sample or stale post-midnight value ever overwrites a correct day.

Verify: production `select day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh from daily_energy order by day desc limit 5` shows yesterday complete and today partial, and `count(*)` is about 60 after the backfill.

### Key Discoveries:

- Contract entry schema: `src/lib/ingest/contract.ts:52-58`; upsert: `supabase/migrations/20260923101001_push_ingestion.sql:112-130`.
- Lab history row shape: homelab-2 `infra/compose/energy-app/scripts/append-energy-history.py:24-64`; retention `:12, :67-73`.
- Day completeness rule to reuse: homelab-2 `build-current-month-bill-forecast.py:27`.
- Push script entry points: homelab-2 `push-energy-analyser.py:174-187` (`build_payload`), `:221-230` (`main`, env defaults).

## What We're NOT Doing

- No seasonal insight or forecast-accuracy UI (S-04, S-11 consume this data later).
- No reading of the lab's SQLite store; the JSONL history is the source.
- No per-day battery, temperature or price fields.
- No change to `contract_version` (the new field is optional and additive).
- No backfill older than 62 days (the contract limit); July history stays in the lab.
- No app-side re-derivation of days; the app stores what the lab computes.

## Implementation Approach

App first, then production, then the lab. The app must accept `pv_forecast_kwh` before the lab sends it, otherwise every lab push fails with 422. The lab derivation is a pure function with fixture tests so the day rules are proven before anything reaches production.

## Critical Implementation Details

- **Deployment order:** Phase 2 (app live in production with the migration) must finish before Phase 3 installs the new push script on `docker-core`. The old lab script sends no `daily_history`, so the app change is safe to ship first.
- **Upsert must not drop the forecast:** the new `ingest_push` writes `pv_forecast_kwh` from the entry. A push whose day has no morning forecast sends `null`, and latest-wins then stores `null`; the lab sends the same morning value on every push, so a known forecast is never replaced by `null` for that day.
- **Latest sample, not maximum:** after midnight a stale sample can repeat yesterday's larger totals; taking the maximum would inflate the day. Take the latest healthy sample of the day.

## Phase 1: App accepts and stores the daily forecast

### Overview

The contract and database accept an optional per-day PV forecast; everything else about `daily_history` is unchanged.

### Changes Required:

#### 1. Contract field

**File**: `src/lib/ingest/contract.ts`, `src/lib/ingest/contract.test.ts`

**Intent**: Let each `daily_history` entry carry the day's PV forecast.

**Contract**: `dailyEnergy` gains `pv_forecast_kwh: energyKwh.optional()` (nonnegative, nullable, optional). Tests: an entry with the field passes, a negative value fails at `daily_history.N.pv_forecast_kwh`, an entry without it still passes.

#### 2. Storage

**File**: `supabase/migrations/<timestamp>_daily_forecast.sql`

**Intent**: Store the forecast per day using the same latest-wins rule.

**Contract**: `alter table public.daily_energy add column pv_forecast_kwh numeric`; `create or replace function public.ingest_push(p_token text, p_payload jsonb)` identical to the current one except that the `daily_energy` insert and `on conflict ... do update` also write `pv_forecast_kwh` from `(d ->> 'pv_forecast_kwh')::numeric`. Keep `security definer`, `set search_path = ''`, the error codes and the existing grants (re-grant execute to `anon` if `create or replace` requires it).

#### 3. Docs, schema and example

**File**: `docs/ingest/README.md`, `docs/ingest/contract-v1.schema.json`, `docs/ingest/example-v1.json`

**Intent**: The lab-facing handoff documents the field and the day rules.

**Contract**: regenerate the schema with `npm run contract:export`; add `pv_forecast_kwh` to the example's days; README: the field is the forecast for that day as known in the morning, and `daily_history` should hold complete past days plus today (partial).

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local DB: `npx supabase db reset` (via the remote-docker relay)
- Unit tests pass (including the committed schema matching the contract): `npm test`
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`
- A local push of the example (`push-fixture.mjs --full`) returns 201 and a local SQL check shows `pv_forecast_kwh` stored for its days

#### Manual Verification:

- None beyond the automated checks (no user-visible change)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Production rollout of the app change

### Overview

Production accepts the new field before the lab starts sending it.

### Changes Required:

#### 1. Production migration and deploy

**File**: `supabase/migrations/<timestamp>_daily_forecast.sql`

**Intent**: Apply through the Supabase connector, rename the file to the version production records, merge and deploy.

**Contract**: production `list_migrations` matches the repo filenames; `/api/health` reports the merged commit.

### Success Criteria:

#### Automated Verification:

- CI `ci` and `smoke` jobs pass on the PR
- Production `daily_energy` has the `pv_forecast_kwh` column and `ingest_push` is still callable only as intended (security advisor shows no new finding)

#### Manual Verification:

- Production `/api/health` reports the deployed commit after you approve the deploy

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Lab derives and sends daily history

### Overview

The homelab-2 push script derives the days from the history file and sends them; a one-time push backfills 62 days.

### Changes Required:

#### 1. Derivation

**File**: homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py`

**Intent**: Turn history rows into contract `daily_history` entries using the agreed rules.

**Contract**: a pure `build_daily_history(rows, now, days=35)`:
- group rows by `generated_at` converted to Europe/Warsaw date;
- per day, take the latest row with `source_health == "ok"` and all four counters numeric; map `produced_kwh → pv_kwh`, `consumed_kwh → load_kwh`, `bought_kwh → grid_import_kwh`, `exported_kwh → grid_export_kwh`; clamp at 0, round to 3 decimals;
- skip past days whose latest healthy row is before 21:00 local; always include today if it has a healthy row;
- `pv_forecast_kwh` = `forecast_today_kwh` of the first healthy row at or after 06:00 local that day, else `null`;
- return the last `days` days (at most 62), oldest first, unique by day.

`build_payload` takes an optional history list and adds `daily_history` only when non-empty. `main` reads `ENERGY_HISTORY` (default `/srv/homelab/energy-app-stack/web/data/energy-history.jsonl`), skipping unreadable lines, and accepts `--days N` (1–62) for the one-time backfill.

#### 2. Tests

**File**: homelab-2 `infra/compose/energy-app/scripts/test_push_energy_analyser.py`

**Intent**: Prove each day rule with inline row fixtures.

**Contract**: cases for latest-not-max after midnight, degraded and zero-filled samples ignored, a past day ending before 21:00 skipped, today included as partial, DST change day grouped correctly, forecast from the first sample at or after 06:00, the `--days` cap at 62, unique days in order.

#### 3. Runbook and apply

**File**: homelab-2 `runbooks/energy-analyser-push.md`

**Intent**: Document the history input, the one-time backfill, and verification; then apply on `docker-core`.

**Contract**: runbook gains the `ENERGY_HISTORY` default, `--days 62` backfill step and a verification query; apply via the runbook's existing install steps.

### Success Criteria:

#### Automated Verification:

- Push script tests pass: `python3 -m unittest test_push_energy_analyser` (in `infra/compose/energy-app/scripts`)
- Dry run on `docker-core` shows 35 `daily_history` days with only contract fields
- The one-time `--days 62` push returns 201 and later timer pushes return 201
- Production `daily_energy` has about 60 rows, yesterday complete, today partial, and `pv_forecast_kwh` filled for recent days

#### Manual Verification:

- A few recent days' totals look plausible against what you know from the inverter app

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- App: contract accepts, rejects and omits `pv_forecast_kwh` as specified.
- Lab: every day rule listed in Phase 3 §2.

### Integration Tests:

- Local: example push with forecast stored in `daily_energy`.
- Production: backfill push, then timer pushes, verified by SQL through the connector.

### Manual Testing Steps:

1. Compare yesterday's pushed totals with the inverter app's day summary.
2. Confirm today's row changes between two pushes and yesterday's does not.

## Performance Considerations

The history file is about 20 MB; the push script reads it once per 5-minute run, which is well under a second. A push grows by about 4 KB (35 days), or about 8 KB for the one-time 62-day backfill, far below the 256 KB cap.

## Migration Notes

Additive column and a function replacement with the same signature; no data change. Existing `daily_energy` rows (fixtures only) get `pv_forecast_kwh = null`.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-02); issue #21
- PRD: `context/foundation/prd-v2.md` (FR-003 note, FR-015)
- Lab source: homelab-2 `infra/compose/energy-app/scripts/append-energy-history.py`, `build-current-month-bill-forecast.py:27`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: App accepts and stores the daily forecast

#### Automated

- [x] 1.1 Migration applies on a clean local DB — d66f079
- [x] 1.2 Unit tests pass including the committed schema — d66f079
- [x] 1.3 Lint, type check and build pass — d66f079
- [x] 1.4 Local example push stores pv_forecast_kwh — d66f079

### Phase 2: Production rollout of the app change

#### Automated

- [x] 2.1 CI ci and smoke jobs pass on the PR — 6286a66
- [x] 2.2 Production has the column and no new advisor finding — 6286a66

#### Manual

- [x] 2.3 Production health reports the deployed commit — 6286a66

### Phase 3: Lab derives and sends daily history

#### Automated

- [x] 3.1 Push script tests pass — 3d107ae
- [x] 3.2 Dry run shows 35 days with contract fields only — 3d107ae
- [x] 3.3 Backfill push and timer pushes return 201 — 3d107ae
- [ ] 3.4 Production daily_energy has about 60 rows with forecasts

#### Manual

- [ ] 3.5 Recent days' totals look plausible against the inverter app
