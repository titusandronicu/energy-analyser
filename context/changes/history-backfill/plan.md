# History Backfill Implementation Plan

## Overview

Send the ten days the home lab recorded before the app's first push (2026-07-16 to 2026-07-25, Europe/Warsaw) to production once, through the existing `daily_history` push section, so the app holds every day the lab has (roadmap F-03, FR-024). The lab push script gets an inclusive `--from/--to` date range; the app does not change.

## Current State Analysis

- Production's oldest `daily_energy` day is **2026-07-26** (all rows up to 2026-08-04 carry `captured_at` 2026-09-25 15:50, the 62-day `--days 62` backfill). 2026-07-31 has no row.
- The lab push script (homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py`) builds `daily_history` in `build_daily_history(rows, now, days)` (`:279`), which counts back from today: `first_day = today - (days - 1)`, up to today. `--days` is validated by `history_days` (`:403`) to 1–62 (`MAX_HISTORY_DAYS`, `:81`), the contract's array cap. 2026-07-16 is 76 days before 2026-09-30, so no `--days` value reaches it.
- The lab history file on docker-core (`/srv/homelab/energy-app-stack/web/data/energy-history.jsonl`) holds 17,396 rows (checked 2026-09-30), first row 2026-07-16 16:28Z. Per Warsaw day before 2026-07-26:

  | Day           | Rows    | First–last (local) | Rows with consumption > 0 | Expected entry                                                        |
  | ------------- | ------- | ------------------ | ------------------------- | --------------------------------------------------------------------- |
  | 07-16         | 66      | 18:28–23:55        | 66                        | totals (counters are cumulative for the day, so a late start is fine) |
  | 07-17         | 260     | 00:01–23:59        | 174                       | totals                                                                |
  | 07-18         | 271     | 00:04–23:56        | 166                       | totals                                                                |
  | 07-19         | 269     | 00:01–23:58        | 184                       | totals                                                                |
  | 07-20         | 171     | 00:03–15:17        | 71                        | **null totals** (last sample before 23:00)                            |
  | 07-21         | 68      | 17:59–23:59        | 68                        | totals                                                                |
  | 07-22 – 07-25 | 273–279 | ~00:03–23:58       | 191–276                   | totals                                                                |

- `append-energy-history.py` trims the file to its last 25,920 lines (`DEFAULT_LIMIT`, 90 days at 5 minutes). At about 280 rows a day, 07-16 starts dropping around **2026-10-30**. That is the deadline for Phase 2.
- The app side needs nothing: the contract (`src/lib/ingest/contract.ts`) caps `daily_history` at 62 unique days with no age limit, and `ingest_push` upserts each day, keeping the row with the later `captured_at` (`supabase/migrations/20260930081229_hourly_energy.sql:70-90`). `daily_energy` has no retention job.

## Desired End State

`select day, load_kwh from daily_energy where day between '2026-07-16' and '2026-07-25'` returns ten rows: nine with totals and 2026-07-20 with null totals. The regular 5-minute push is unchanged (35 days, 48 hours) and still returns 201. The lab script and runbook document `--from/--to` for any future one-off range push.

### Key Discoveries:

- The day rules (latest usable sample, 95% dip filter, 00:30 settle, 23:00 completeness, null totals for incomplete past days, morning forecast) all live in `build_daily_history` and `daily_counters` (`push-energy-analyser.py:255-335`); the range option only changes which days are in the window.
- A push that reuses the current snapshot's `captured_at` with different content gets `409 capture time conflict` (runbook `runbooks/energy-analyser-push.md:96`); the one-off push must follow a fresh snapshot, as with the earlier `--days 62` and `--hourly-hours 840` backfills.
- Tests for the day builder: `BuildDailyHistoryTest` in `test_push_energy_analyser.py:138`.

## What We're NOT Doing

- No app code, contract, migration or dashboard change; the calendar (S-15) and norms will read the days when they exist.
- No change to the regular push (default 35 days, 48 hours) or the day rules.
- Not filling 2026-07-31 (lab rows but no usable counter sample, so it would only be a null row) or re-sending days already in production.
- No archive of the lab history file beyond its 90-day trim; once the ten days are in the app, their lab rows may drop.
- No `hourly_history` for these days: the app keeps hours for 35 days only.

## Implementation Approach

Generalise the day window in `build_daily_history` from "last N days up to today" to an explicit inclusive first/last day, with `--days` kept as the default path that computes the same window as today. `--from/--to` is a mutually exclusive alternative, validated in the CLI. Then install and run it once on docker-core and check production.

## Phase 1: Date range in the push script

### Overview

The push script can send `daily_history` for an explicit inclusive range of Europe/Warsaw days, with the regular push unchanged.

### Changes Required:

#### 1. Day window

**File**: `homelab-2/infra/compose/energy-app/scripts/push-energy-analyser.py`

**Intent**: Let `build_daily_history` take an explicit first and last day, so a one-off push can send days older than 62 days back. The default call (35 days up to today) must produce exactly what it does now.

**Contract**: `build_daily_history(rows, now, days=DEFAULT_HISTORY_DAYS, first_day=None, last_day=None)`. When both dates are given they replace the `days` window: rows are kept for `first_day <= day <= last_day`, and `last_day` is clamped to today. Today is only included (as a partial day) when it falls in the range. All other rules are unchanged. The window never exceeds `MAX_HISTORY_DAYS` days.

#### 2. CLI

**File**: same

**Intent**: `--from YYYY-MM-DD --to YYYY-MM-DD` (inclusive, Europe/Warsaw days), in an argparse mutually exclusive relation with `--days`; both must be given together.

**Contract**: Refuse (argparse error, exit 2) when only one of the two is given, when either is not a valid ISO date, when `from > to`, when the range is longer than 62 days, or when `to` is after today in Europe/Warsaw. The `--days` help text stops calling 62 "the one-time backfill" and points to `--from/--to` for ranges further back. The stderr/stdout section log gains one line for the daily section when a range is used, e.g. `push: daily_history range 2026-07-16..2026-07-25 (<n> days)`.

#### 3. Tests

**File**: `homelab-2/infra/compose/energy-app/scripts/test_push_energy_analyser.py`

**Intent**: Cover the range in `BuildDailyHistoryTest` and the CLI validation.

**Contract**: New cases: a range entirely in the past returns only days inside it, oldest first, and leaves out today; a past day in the range ending before 23:00 is sent with null totals (the 07-20 shape); a day that starts late (first sample 18:28) but ends after 23:00 gets totals; a range whose `to` is today includes today as partial; the default call without dates is unchanged (existing tests keep passing). CLI: `from > to`, a 63-day range, a future `to`, and `--from` without `--to` are rejected.

#### 4. Runbook

**File**: `homelab-2/runbooks/energy-analyser-push.md`

**Intent**: Document the range option next to the existing backfill steps (step 6), including the one-off F-03 command and its expected dry-run count.

**Contract**: Step 6 gains a sub-step: dry run `--from 2026-07-16 --to 2026-07-25` (expect 10 `"day"` lines, 2026-07-20 with nulls), then the push, with the same 409 note. The history-input bullet (`:9`) mentions `--from/--to`.

### Success Criteria:

#### Automated Verification:

- Lab tests pass, including the new range and CLI cases: `python3 -m unittest infra/compose/energy-app/scripts/test_push_energy_analyser.py` (in homelab-2)
- The script still compiles and shows the new options: `python3 infra/compose/energy-app/scripts/push-energy-analyser.py --help | grep -c -- '--from\|--to'` prints 2 or more (in homelab-2)

#### Manual Verification:

- A local dry run against a copy of the production history file with `--from 2026-07-16 --to 2026-07-25` lists the ten days, 2026-07-20 with null totals and the others with plausible totals (house use roughly 10–45 kWh a day, as in the neighbouring stored days)

**Implementation Note**: homelab-2 changes go through a PR there (draft until complete). The plan's own files are committed in energy-analyser with this phase.

---

## Phase 2: Backfill run and production check

### Overview

Install the new script on docker-core, send the ten days once, confirm them in production, and bring the app's docs and roadmap up to date.

### Changes Required:

#### 1. Install and run on docker-core

**Where**: `funky@192.168.50.30`, stack `/srv/homelab/energy-app-stack`

**Intent**: After the homelab-2 PR is merged, install the merged script (backup of the live one first, check the live one matches the previous commit before replacing it), dry-run the range, then push right after a fresh snapshot. Needs the owner's go before the install and the push.

**Contract**: Runbook step 6 as updated in Phase 1. Expect `201 {"status":"created"}`; on `409 capture time conflict` wait for the next refresh and retry.

#### 2. App docs and roadmap

**Files**: `energy-analyser/docs/prerequisites.md` (F-03 row), `docs/logic.md` (`:86`, the history start), `context/foundation/roadmap.md` (F-03 risk text, "2026-07-16 is 72 days back" and "--to 2026-07-26" corrected; deadline 2026-10-30)

**Intent**: Record that the backfill ran, the app's history now starts on 2026-07-16 (2026-07-20 empty), and the command used.

**Contract**: Prose only; no new rule or decision (the ten-day scope is already in `docs/decisions.md`).

### Success Criteria:

#### Automated Verification:

- App checks still pass: `npm test`, `npm run lint`
- The docs record the backfill: `git grep -n "2026-07-16" -- docs/logic.md docs/prerequisites.md` prints at least two lines

#### Manual Verification:

- In production, `daily_energy` holds 2026-07-16 to 2026-07-25: nine days with totals and 2026-07-20 with null totals, all with the backfill push's `captured_at`; days from 2026-07-26 on are unchanged
- The next regular timer push after the backfill returns 201, and the dashboard cards (live state, usage yesterday, bill forecast, Godziny zużycia) still render

---

## Testing Strategy

### Unit Tests:

- Range window: inside-only days, oldest first; today excluded unless in range; the default window unchanged.
- The day rules inside a range: incomplete past day → nulls; late-start day with a 23:00+ sample → totals.
- CLI validation: missing half, reversed range, over 62 days, future `to`.

### Manual Testing Steps:

1. Copy the production history file to a scratch directory and dry-run the range locally; compare the entries with the per-day table above.
2. After the push, query `daily_energy` for 2026-07-16..2026-07-25 and the neighbouring days.
3. Wait for the next timer push and check the dashboard.

## Migration Notes

Rollback of the data is not needed: the rows are new days no regular push touches. If a day turns out wrong, a corrected script can re-send the range; the later `captured_at` wins.

External prerequisites (lessons: name every prerequisite outside the repo): the lab history file on docker-core still holding 2026-07-16 (until about 2026-10-30); SSH access to docker-core; the existing `.env.push` ingest token. No Home Assistant, LLM or app-side change. `docs/prerequisites.md` is updated in Phase 2.

## References

- Roadmap: `context/foundation/roadmap.md` F-03; PRD FR-024 (`context/foundation/prd-v3.md:216`); decision `docs/decisions.md:61`
- Day builder: homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py:255-335`
- Previous backfills: homelab-2 `runbooks/energy-analyser-push.md` steps 6–7

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Date range in the push script

#### Automated

- [x] 1.1 Lab tests pass, including the new range and CLI cases: `python3 -m unittest infra/compose/energy-app/scripts/test_push_energy_analyser.py` (in homelab-2) — e086179
- [x] 1.2 The script still compiles and shows the new options: `python3 infra/compose/energy-app/scripts/push-energy-analyser.py --help | grep -c -- '--from\|--to'` prints 2 or more (in homelab-2) — e086179

#### Manual

- [x] 1.3 A local dry run against a copy of the production history file with `--from 2026-07-16 --to 2026-07-25` lists the ten days, 2026-07-20 with null totals and the others with plausible totals — e086179

### Phase 2: Backfill run and production check

#### Automated

- [x] 2.1 App checks still pass: `npm test`, `npm run lint`
- [x] 2.2 The docs record the backfill: `git grep -n "2026-07-16" -- docs/logic.md docs/prerequisites.md` prints at least two lines

#### Manual

- [x] 2.3 In production, `daily_energy` holds 2026-07-16 to 2026-07-25: nine days with totals and 2026-07-20 with null totals, all with the backfill push's `captured_at`; days from 2026-07-26 on are unchanged
- [x] 2.4 The next regular timer push after the backfill returns 201, and the dashboard cards still render
