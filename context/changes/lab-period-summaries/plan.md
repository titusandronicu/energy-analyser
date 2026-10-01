# Lab Period Summaries Implementation Plan

## Overview

Roadmap F-04 (FR-023, FR-030; it unlocks S-18). The home lab writes three kinds of plain-language text that describe and never advise:

- an explanation of what today's figures mean, refreshed every hour;
- a summary of each completed day;
- a summary of each completed month.

Each text travels with the facts it was written from. The cloud model is the only narrator, so when it fails the facts still go through. The app stores one row per period, and the latest row wins. A one-off backfill covers July–September 2026. Showing the texts is S-18 and not part of this change.

## Current State Analysis

From `context/changes/lab-period-summaries/research.md`:

- **The narration chain** (homelab-2 `infra/compose/energy-app/scripts/run-energy-advisory.py`):
  - Runs about every 55 minutes (`refresh-energy-agent-data.sh:126-138`), live on OpenRouter `openai/gpt-4.1-mini` first.
  - Its prompt is shaped for advice (`:109-170`).
  - `request_json` (`:68-75`) does not catch `ssl.SSLError`/`OSError`. On 2026-09-30 such an error crashed the run before the next provider was tried.
- **Micro-analysis:** 281 of the last 288 observations came from fixed rules on the faulty grid counters (`run-local-micro-analysis.py`). The owner decided to leave them out for now.
- **Data:**
  - `web/data/energy-history.jsonl`: 5-minute rows, about 90 days (first rows drop around 2026-10-30).
  - `private/energy.sqlite3` `energy_snapshot`: not trimmed, since 2026-07-17.
  - The completed-day rule is in `push-energy-analyser.py:255-349` (`daily_counters`, `build_daily_history`): a usable sample at or after 23:00 Warsaw time.
  - Trustworthy: PV and the Solcast forecast. Battery figures are probably fine. Grid import, export and house use are wrong for the whole history (`docs/logic.md:152-188`).
  - There is no weather source.
- **Push** (`push-energy-analyser.py`):
  - `build_payload` (`:515-541`) assembles the sections.
  - `fit_body` drops `hourly_history`, then `bill_forecast`, to stay under 256 KB (`:491-512`).
  - The `recommendation` gate drops facts along with the narration (`:201-231`); that stays as it is.
- **App contract** (`src/lib/ingest/contract.ts`): strict objects, so an unknown section rejects the whole push. Optional sections live at `:189-206`. The schema export and drift test are in `contract.test.ts:55-59`.
- **App storage:**
  - `ingest_push` latest body: `supabase/migrations/20260930081229_hourly_energy.sql:29-136`.
  - Pushes are pruned after 14 days, so summaries need their own table.
  - Precedent for a new table plus an `ingest_push` redefinition: `context/archive/2026-09-28-grid-export-mismatch/plan.md:102-170`.

## Desired End State

- **Contract:** the app accepts an optional `period_summaries` section, a list of entries keyed by `(kind, period)`:
  - `kind` is `today | day | month`;
  - `period` is a Warsaw date for today and day, or `YYYY-MM` for month;
  - every entry carries `facts`, `built_at` and `narration`, which is either `{ text, generated_at, provider, model }` or `null`.
- **Storage:** `public.period_summaries` keeps one row per `(kind, period)`.
  - A push replaces a row only when its `built_at` is newer or equal ("latest wins").
  - Owners can read every column except the push id. Anon gets nothing.
- **Today:** about every hour the lab writes a fresh explanation of today with the cloud model.
- **Completed days:** once a day is complete (it has a usable sample at or after 23:00 Warsaw time), it gets a summary.
- **Completed months:** on the 1st, the previous month gets a summary, but only if it has at least 7 complete days.
- **Incomplete periods** get no summary at all.
- **What the narration says:**
  - It describes PV production against the forecast, battery cycling and the season (taken from the date). It gives no advice, and contains no number that is missing from its facts.
  - Grid import, export and house use stay in the facts with a reliability flag, and the text never quotes them.
- **When the cloud fails:** the entry still goes out with `narration: null`, and a later run fills the narration in. Ollama never narrates these texts.
- **Backfill:** a one-off run has filled 2026-07-16 to 2026-09-30, the days and July, August and September.
- **The advisory and summary scripts** treat an SSL or OS error as a provider failure, not a crash.
- **Docs** state the section, the deploy order and the narration rules.

### Key Discoveries:

- With "latest wins", a later push can replace a narrated entry with a facts-only one. To stop that, the lab's state file keeps each period's last narration and re-sends it until a newer narration replaces it. So the push never downgrades a period.
- Day and month bundles must come from SQLite `energy_snapshot` for anything older than about 90 days. The backfill and month bundles always read SQLite; today reads the live history.
- `fit_body` needs the new section in its drop order: after `hourly_history` and before `bill_forecast`. One push carries at most today, the last 7 days and the last 2 months, so the section is small (well under 64 KB). A 62-day range push would not be (about 150–200 KB): the backfill runs in batches of at most 14 days plus their months, and in range mode a dropped `period_summaries` is an error, not a log line (plan review F1).

## What We're NOT Doing

- **Display (S-18):** no dashboard card and no calendar text. The `summary: null` slot stays.
- **Narration by Ollama or HA** for these texts. Those providers stay only in the advisory chain.
- **Using or fixing the local micro-analysis observations.** That is a separate change.
- **Weather data,** and same-season comparisons (those come about July 2027).
- **Any change to the recommendation block or its gate.**
- **Quoting grid import, export or house use in text,** and any numeric correction of them.
- **Summaries for incomplete days,** or for months with fewer than 7 complete days.
- **PGE data:** it never enters the facts. Raw PGE rows stay in the lab, and showing PGE figures is parked.
- **Day notes:** they never enter the facts.

## Implementation Approach

1. **The app first** (Phase 1): contract, table, `ingest_push` and docs, migrated and deployed before the lab sends anything. The contract is strict, so an earlier lab push would be rejected in full.
2. **Then the lab** (Phase 2): a new script, `build-period-summaries.py`, builds the facts bundles, narrates them through the cloud provider only, runs a numbers check, and keeps a state file. It reuses the advisory's HTTP client with the SSL fix.
3. **Then the push and deploy** (Phase 3): `push-energy-analyser.py` reads the state file into the new section, the backfill runs once, and the docker-core deploy follows the runbook.

## Critical Implementation Details

- **Deploy order:** the production migration and app deploy (Phase 1) must happen before any lab push carries `period_summaries`. Otherwise every push, `state` included, gets 422.
- **Never downgrading narration:** the lab state file (`web/data/period-summaries.json`, keyed `kind:period`) stores facts, `built_at` and the last narration. Re-sends always include the stored narration. A narration is replaced only by a newer successful one.
- **The numbers check:** before a narration is accepted, every number in the text (integers and decimals, with comma or dot) must match a fact value after rounding to the precision shown. Dates and day-of-month numbers that belong to the period are allowed. If any number doesn't match, the narration is dropped, the facts are kept, and a warning is logged.
- **Cadence** (inside the 5-minute refresh, before the push):
  - **Today:** today's facts and narration are built **together** when the stored today entry is older than 55 minutes. Between builds the stored entry is re-sent unchanged (same `built_at`), so the text and its facts always match (plan review F2).
  - **Day:** an entry once the day is complete. A missing narration is retried at most once per hour for 3 days, then logged and left for a `--from/--to` run (plan review F5).
  - **Month:** from the 1st onward, when the month has at least 7 complete days; a missing narration is retried as for a day.
  - **Run budget:** the job uses its own 30 s request timeout and narrates at most 2 periods per run (today first, then the oldest missing), so the push is never held back by minutes. The backfill CLI is not limited (plan review F8).
  - The step is guarded (`|| echo warning`), like the bill forecast.

## Phase 1: App contract and storage

### Overview

Accept, validate and store `period_summaries`, with no UI. Migrate and deploy this before the lab sends the section.

### Changes Required:

#### 1. Contract

**File**: `src/lib/ingest/contract.ts` (+ `contract.test.ts`), `docs/ingest/contract-v1.schema.json` (regenerated), `docs/ingest/example-v1.json`

**Intent**: Add the optional section with strict shapes and size limits, so a bad entry fails validation in the app instead of leaking through.

**Contract**:

- **Section:** `period_summaries` is an optional array of 1–80 entries, with `(kind, period)` unique (refine).
- **Each entry** is a strict object:
  - `kind`: `"today" | "day" | "month"`.
  - `period`: a `YYYY-MM-DD` string for today and day, or `YYYY-MM` for month (refine on kind).
  - `built_at`: datetime with offset.
  - `facts`: a record of at most 40 keys, keys up to 100 characters, values scalar (the existing `factValue`). The key count is a `.refine`, which the exported JSON Schema can't show, so the README states it (plan review F7).
  - `narration`: either null or a strict object of:
    - `text`: 1–1500 characters;
    - `generated_at`: datetime with offset;
    - `provider`: `"openrouter"`;
    - `model`: 1–100 characters.
- **Schema, example and tests:** regenerate the schema with `npm run contract:export`. The example gets one today, one day and one month entry, with synthetic values. Add the section to the `sections()` helper and to the "only state" test (`contract.test.ts:24-30,65-73`).
- **Section tests:** a duplicate key, a period that doesn't match its kind, a null narration accepted, an Ollama provider rejected, and text of 1501 characters rejected.

#### 2. Migration

**File**: `supabase/migrations/<timestamp>_period_summaries.sql` (new)

**Intent**: Store one row per period and keep the latest version. This follows the `hourly_energy` pattern.

**Contract**:

- **Table `public.period_summaries`:**
  - `kind` text, with a check on the three kinds;
  - `period` text;
  - `facts` jsonb, not null;
  - `narration_text`, `narration_generated_at`, `narration_provider` and `narration_model`, all nullable;
  - `built_at` timestamptz, not null;
  - `push_id` bigint, references `ingest_pushes`, `on delete set null`;
  - primary key `(kind, period)`.
- **Lock-down:** RLS on and `revoke all` from anon and authenticated.
- **Access:** an owner column grant on everything except `push_id`, and the inline `app_owners` select policy.
- **`ingest_push`:** redefined from `20260930081229_hourly_energy.sql`'s body (name the source in the header). It inserts each `period_summaries` entry with `on conflict (kind, period) do update … where period_summaries.built_at <= excluded.built_at`. Grants are restated afterwards.

#### 3. Types, fixtures and smoke

**File**: `src/types.ts`, `scripts/push-fixture.mjs`, `scripts/smoke.mjs`, `src/lib/services/ingest.test.ts` (if example-driven)

**Intent**: Keep the tooling in step with the new section.

**Contract**:

- **Row type:** `PeriodSummaryRow { kind; period; facts; narration_text | null; narration_generated_at | null; narration_provider | null; narration_model | null; built_at }`.
- **`push-fixture.mjs`:** strips `period_summaries` from the default state-only push and rewrites `built_at`/`generated_at` like the other sections.
- **Smoke:**
  - `freshPush` refreshes the timestamps.
  - Anon cannot read `period_summaries` (401).
  - A signed-in owner reads the example's 3 rows, and `push_id` is 403.
  - An older `built_at` re-send doesn't replace a row.

#### 4. Docs

**File**: `docs/ingest/README.md`, `docs/architecture.md`, `docs/logic.md`, `docs/decisions.md`, `docs/prerequisites.md`

**Intent**: Record the section, the rules and the deploy order (lessons "Name every prerequisite", "Keep the project docs in step").

**Contract**:

- **README:** a section bullet, what is stored, and the rule "deploy the app first".
- **`architecture.md`:** in "The two LLMs", summaries move from planned to built. Add the storage row.
- **`logic.md`:** the summary rules: kinds, completeness, the 7-day month minimum, latest wins, narration only from the cloud, the numbers check, and no grid figures in text.
- **`decisions.md`:** a 2026-10-01 entry with the owner's decisions.
- **`prerequisites.md`:**
  - one-time production steps: the migration applied before the lab sends the section;
  - LLM configuration: the summary job uses the OpenRouter settings only.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the contract schema drift test: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- The migration applies to a fresh local database: `npx supabase db reset --local`
- Smoke passes against the local stack: `npm run smoke`

#### Manual Verification:

- Pushing the example with `push-fixture.mjs --file` to the local stack stores 3 rows. An older `built_at` re-send leaves them unchanged, and a newer one replaces them.

---

## Phase 2: Lab facts bundles and summary job

### Overview

Build the facts bundles and narrate them with the cloud model under the description-only prompt and the numbers check. Keep the results in a state file. Fix the SSL crash in the shared HTTP client.

### Changes Required:

#### 1. HTTP client fix

**File**: homelab-2 `infra/compose/energy-app/scripts/run-energy-advisory.py` (+ a test file `scripts/test_run_energy_advisory.py`, new)

**Intent**: A dropped TLS connection must count as a provider failure, so the chain moves on instead of crashing.

**Contract**: `request_json` also maps `OSError` (which covers `ssl.SSLError`), `http.client.HTTPException` (for example `IncompleteRead`) and `ValueError` (a JSON decode error) to `ProviderError`, and the OpenRouter response parsing type-checks `choices[0].message.content`. Tests simulate each of the three during the read and expect `ProviderError` (plan review F4).

#### 2. Summary job

**File**: homelab-2 `infra/compose/energy-app/scripts/build-period-summaries.py` (new, + `scripts/test_build_period_summaries.py`)

**Intent**: The single place that decides which periods need a text, builds their facts, narrates them and stores the result.

**Contract**:

- **CLI:**
  - `--state` (default `web/data/period-summaries.json`);
  - `--history` and `--sqlite` (stack defaults);
  - `--from/--to` (inclusive Warsaw days, for the backfill);
  - `--dry-run` (writes to `--out` instead of the state file);
  - `--env` (the `.env.llm` path).
- **It loads `run-energy-advisory.py` by path** (the `load_module` pattern, `build-current-month-bill-forecast.py:85-92`) for `request_json`, `ProviderError` and `load_env` only. It builds its own OpenRouter chat request with its own description-only system message and reuses just the env keys (`OPENROUTER_API_KEY`, `_MODEL`, `_BASE_URL`, `_TEMPERATURE`, `_HTTP_REFERER`, `_X_TITLE`), because `run_openrouter` wraps every prompt in the advisory's advice-shaped `compact_prompt` (plan review F3).
- **Facts.** Plain scalar keys, with Polish month and season names derived from the date:
  - **Day:** `period`, `weekday`, `season`, `pv_kwh`, `pv_forecast_kwh` (the first Solcast value at or after 06:00) and `pv_vs_forecast_pct`; `battery_charged_kwh`, `battery_discharged_kwh` and `battery_soc_min_pct`/`max_pct`; `grid_import_kwh`, `grid_export_kwh` and `load_kwh` with `grid_sensor_reliable: false`.
  - **Month:** `period`, `month_name`, `season`, `complete_days`, `pv_kwh_total`, `pv_kwh_best_day` and `pv_kwh_worst_day` (with their dates), `pv_forecast_total_kwh`, the battery totals, and the same flagged grid fields.
  - **Today:** the same as a day so far, plus `as_of` (Warsaw time).
- **Completeness:** use the push script's `counters_usable` and `daily_counters` (loaded by path) directly, not `build_daily_history`, which lacks battery and SOC and clamps to 62 days. Battery totals come from the chosen row and SOC min/max from the day's rows. Rows come from `energy-history.jsonl` within its ~90 days, and from SQLite `energy_snapshot` only for older days (opened read-only, `captured_at` mapped to `generated_at`, the legacy completeness rule since it has no `counters_ok`) (plan review F6). A month needs at least 7 complete days.
- **Prompt:** Polish, for a reader without energy knowledge, 3–5 sentences.
  - It only describes what happened; no advice, recommendations or settings.
  - It uses only numbers from the facts, and never mentions fields flagged unreliable.
  - It may name the season.
  - The prompt text lives in the script as a constant.
- **Narration:**
  - Provider is OpenRouter only (`OPENROUTER_MODEL`).
  - Any `ProviderError` or a failed numbers check gives `narration: null`, and the failure is logged without the prompt or the key.
- **Cadence and state:** as in Critical Implementation Details. The state file is written atomically, and an unreadable file is never overwritten, following the `pge-settlement-history` guard.
- **Tests, all with synthetic data:**
  - bundle building for day, month and today;
  - the 23:00 completeness rule, and a month with 6 vs 7 complete days;
  - a numbers check that passes and one that fails;
  - a narration never downgraded in the state;
  - the cadence (today at 54 vs 56 minutes with facts and text built together, hourly retries stopping after 3 days, at most 2 narrations per run, the month on the 1st);
  - the `--from/--to` range;
  - a provider error giving `narration: null`.

#### 3. Refresh wiring

**File**: homelab-2 `infra/compose/energy-app/scripts/refresh-energy-agent-data.sh`

**Intent**: Run the job every 5 minutes before the push. A failure only logs a warning.

**Contract**: one guarded step, `build-period-summaries.py … || echo "refresh: warning: period summaries failed" >&2`, after the bill forecast and before the push.

### Success Criteria:

#### Automated Verification:

- Summary job tests pass: `cd infra/compose/energy-app && python3 -m unittest scripts/test_build_period_summaries.py`
- Advisory client tests pass: `cd infra/compose/energy-app && python3 -m unittest scripts/test_run_energy_advisory.py`
- Existing lab tests still pass: `make test-solar-analyser` and `python3 -m unittest scripts/test_push_energy_analyser.py`
- Scripts compile: `python3 -m py_compile` on both scripts; `sh -n` on the refresh script

#### Manual Verification:

- A dry run on docker-core (`--dry-run --out /tmp/…`, read-only on the stack, one real OpenRouter call per period) produces today, yesterday and September 2026 texts. The owner reads them, and they describe without advising, quote no grid figures and read naturally in Polish.

---

## Phase 3: Push, backfill and deploy

### Overview

Send the summaries with each push, run the July–September backfill once, and deploy to docker-core in the documented order.

### Changes Required:

#### 1. Push section

**File**: homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py` (+ `test_push_energy_analyser.py`)

**Intent**: Carry today, the last 7 completed days and the last 2 months from the state file. In range mode, carry the requested range for the backfill.

**Contract**:

- **`load_period_summaries(state_path, now, first_day=None, last_day=None)`:** returns `(entries | None, reason)` and follows the `load_bill_forecast` pattern:
  - size cap and the 18-digit identifier guard;
  - narration only when the provider is OpenRouter;
  - at most 80 entries.
- **Payload:** `build_payload` gains the section.
- **Drop order:** `DROPPABLE_SECTIONS` becomes `("hourly_history", "period_summaries", "bill_forecast")`.
- **Logging:** `main` logs `push: period_summaries N entries` or the reason it was skipped.
- **Range mode:** the existing `--from/--to` sends the summaries in that range. If `fit_body` has to drop `period_summaries` in range mode, the push exits non-zero and names the range (plan review F1).
- **Tests:** an empty or missing state; a facts-only entry; the identifier guard; the drop order under the size cap; range mode.

#### 2. Runbook and deploy

**File**: homelab-2 `runbooks/energy-analyser-push.md`

**Intent**: Document the install set, the order and the backfill.

**Contract**:

- **Install set:** add `build-period-summaries.py` and the updated `run-energy-advisory.py`, `push-energy-analyser.py` and `refresh-energy-agent-data.sh` to the backup, scp and install lists.
- **Pre-check:** the app migration and deploy are live, and the contract has `period_summaries`.
- **Backfill step:**
  1. `build-period-summaries.py --from 2026-07-16 --to 2026-09-30`;
  2. `push-energy-analyser.py --from … --to …` in batches of at most 14 days, each carrying its months: 07-16..07-29, 07-30..08-12, 08-13..08-26, 08-27..09-09, 09-10..09-23, 09-24..09-30 (plan review F1).
- **Rollback:** restore the `.bak` files; the app keeps the rows.

### Success Criteria:

#### Automated Verification:

- Push tests pass: `cd infra/compose/energy-app && python3 -m unittest scripts/test_push_energy_analyser.py`
- All lab tests pass: `make test-solar-analyser` and the two new test files
- The runbook lists the new script: `grep -n "build-period-summaries.py" runbooks/energy-analyser-push.md` prints at least one line

#### Manual Verification:

- With the owner's approval:
  1. The Phase 1 migration is applied in production, and the app is deployed.
  2. The lab scripts are installed on docker-core per the runbook.
  3. The next push logs `period_summaries`.
- After the backfill, production `period_summaries` holds a row for each complete day from 2026-07-16 to 2026-09-30 and for July, August and September. Most rows have narration, and the rows without narration are listed. The owner reads three samples.
- After a day, the today row has been refreshed hourly, and yesterday's day row exists with narration.

---

## Testing Strategy

### Unit Tests:

- **App:** the contract section (shapes, kinds, limits, duplicates, null narration, provider), and the example plus the "only state" test.
- **Lab:**
  - bundles, completeness and the month minimum;
  - the numbers check, the never-downgrade state and the cadence;
  - the SSL error mapping;
  - the push section, its drop order and range mode.

### Integration Tests:

- Smoke on a fresh local stack: anon rejected, owner reads, latest-wins re-send.
- A `push-fixture` check of latest wins locally (Phase 1 manual).

### Manual Testing Steps:

1. Dry-run texts read by the owner (Phase 2).
2. The production order: migration, deploy, lab install, push log (Phase 3).
3. Backfill row counts and narration coverage, plus three samples read (Phase 3).

## Performance Considerations

- **LLM calls:** about 24 today calls a day, plus 1 day call and 1 month call, at about 0.005 USD each. That is roughly 4 USD a month more. The backfill is about 80 calls, around 0.4 USD.
- **Push size:** at most about 10 entries per push in normal operation.
- **App:** each push upserts at most 80 rows on a keyed table.

## Migration Notes

- **App:** a new table and an `ingest_push` redefinition. Apply in production before the lab sends the section. Rollback restores the previous `ingest_push` body; the table can stay.
- **Lab:** the new script and state file. Rollback restores the `.bak` files; with no section in the push, nothing breaks.

## References

- Research: `context/changes/lab-period-summaries/research.md`
- Requirements: `context/foundation/prd-v3.md:215,234-243,126-127,256-261`
- Precedents:
  - `context/archive/2026-09-28-grid-export-mismatch/plan.md` (table plus `ingest_push`)
  - `context/archive/2026-09-27-bill-forecast/plan.md` (optional section, fixtures)
  - `context/archive/2026-09-30-history-backfill/` (range push)
- Grid sensor: `context/archive/2026-09-30-inverter-grid-correction/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: App contract and storage

#### Automated

- [x] 1.1 Unit tests pass, including the contract schema drift test: `npm test` — 19c42ad
- [x] 1.2 Linting passes: `npm run lint` — 19c42ad
- [x] 1.3 Type checks pass: `npx astro check` — 19c42ad
- [x] 1.4 Production build succeeds: `npm run build` — 19c42ad
- [x] 1.5 The migration applies to a fresh local database: `npx supabase db reset --local` — 19c42ad
- [x] 1.6 Smoke passes against the local stack: `npm run smoke` — 19c42ad

#### Manual

- [x] 1.7 Local push-fixture: 3 rows stored; older built_at leaves them, newer replaces them — 19c42ad

### Phase 2: Lab facts bundles and summary job

#### Automated

- [x] 2.1 Summary job tests pass: `python3 -m unittest scripts/test_build_period_summaries.py` — 7101a1a
- [x] 2.2 Advisory client tests pass: `python3 -m unittest scripts/test_run_energy_advisory.py` — 7101a1a
- [x] 2.3 Existing lab tests still pass: `make test-solar-analyser` and the push tests — 7101a1a
- [x] 2.4 Scripts compile: `py_compile` on both scripts; `sh -n` on the refresh script — 7101a1a

#### Manual

- [x] 2.5 Docker-core dry run: today, yesterday and September 2026 texts read by the owner (descriptive, no advice, no grid figures, natural Polish) — eae8269

### Phase 3: Push, backfill and deploy

#### Automated

- [x] 3.1 Push tests pass: `python3 -m unittest scripts/test_push_energy_analyser.py` — dafa9d9
- [x] 3.2 All lab tests pass: `make test-solar-analyser` and the two new test files — dafa9d9
- [x] 3.3 The runbook lists the new script: grep prints at least one line — dafa9d9

#### Manual

- [ ] 3.4 With the owner's approval: production migration and app deploy, lab install, next push logs period_summaries
- [ ] 3.5 Backfill: production rows for each complete day 2026-07-16..09-30 and Jul/Aug/Sep, narration coverage listed, three samples read
- [ ] 3.6 After a day: today row refreshed hourly and yesterday's day row narrated
