# Night-Time Grid Draw and Highest/Lowest Consumption Hours Implementation Plan

## Overview

Show the owner how much the house draws from the grid at night, and which hours and days had the highest and lowest
house use, so they can work out what was running on those days. The lab sends hourly totals computed from the
inverter's 5-minute history; the app stores 35 days of them and ranks them using complete data only.

This plan follows the frame (`context/changes/grid-export-mismatch/frame.md`). The change started as "why does PGE
record export the inverter never sees". The frame explained 342/423 kWh (PGE bills on hourly-balanced values),
confirmed night export, ruled out the phase-imbalance cause, and found the inverter's grid reading over-reports net
import by a load-dependent ~265 kWh a month while agreeing with PGE at night within about ±10%. The owner then asked
for this feature (`change.md`, 2026-09-30).

## Current State Analysis

From the frame (verified 2026-09-30 against the owner's August eBOK CSV and the lab's 5-minute history):

- PGE's "En. Czynna zbilansowana" = `pobrana − oddana` per hour; summed hourly net reproduces the invoice (423.5 /
  341.5 kWh). Raw registers read 549.7 / 467.7.
- Night 00–06, 27 complete nights from Aug 4: inverter import 6.87 kWh/night against PGE 6.22 (balanced) and 7.51
  (raw). The inverter's grid reading is usable at night.
- From Aug 4 the inverter over-reports net import at every hour, by 0.1–0.4 kWh/h at night and up to 0.8 kWh/h in
  the evening, growing with house load: a CT placement or polarity fault to check on site. Aug 1–3 behave
  differently.
- August's extremes: the house used 113 and 131 kWh on 1–2 Aug (normal 28–43), about 8 kW for hours including at
  night.

In the code:

- The lab already aggregates 5-minute history into hourly averages (`avg_home_load_w`, `avg_grid_w`, `avg_pv_w`, …),
  but keeps only 48 hours for its own notes (homelab-2 `infra/compose/energy-app/scripts/aggregate-energy-history-hourly.py`,
  run from `refresh-energy-agent-data.sh:56`). Nothing hourly reaches the app.
- The push builds `daily_history` from the same history (homelab-2 `push-energy-analyser.py:262-318`,
  `build_payload` `:389-413`), with a `--history-days` option (`:335-340`, `:468`) and a body-size fitter
  `fit_body` (`:376`).
- The app contract has optional `daily_history` (`src/lib/ingest/contract.ts:56-63`, `:168-174`: at most 62 unique
  days). `ingest_push` upserts `daily_energy` from it (`supabase/migrations/20260925151509_daily_forecast.sql:55-75`,
  newer capture wins) and prunes `ingest_pushes` after 14 days (`:92`). Owners read `daily_energy` through column
  grants (`20260925162240_owner_read_daily_energy.sql`).
- The ingest body limit is 256 KiB (`src/lib/services/ingest.ts:3`); the lab pushes every 5 minutes
  (`docs/ingest/README.md:17`).
- Dashboard cards follow one pattern: a service with a pure view mapper and unit tests (`src/lib/services/*.ts`),
  an Astro card using `CardHeading` and `Panel`, composed in `src/components/DashboardBody.astro`; plain-language terms
  live in `src/lib/format/glossary.ts`.
- Roadmap S-10 (usage profile) says only hour-of-day aggregates may leave the lab, "never single readings or
  timestamps" (`context/foundation/roadmap.md`, S-10 Risk). Its day/night shares overlap this change.

## Desired End State

- A "Godziny zużycia" card below the card grid on `/dashboard` shows:
  - last night's grid draw (22:00–06:00), named as "noc z 1 na 2 sierpnia", next to the average of the complete
    nights in the window;
  - the 5 highest and 5 lowest hours of house use, each with its date, clock hour, house use and grid draw;
  - the 3 highest and 3 lowest days of house use, each with its date, weekday and total;
  - the window the rankings rest on and the completeness rule, in words;
  - a note that daytime grid draw from the inverter may be overstated until its sensor is checked.
- Rankings use complete data only; with too little data the card says so instead of ranking.
- The app keeps 35 days of hourly figures; the lab sends the last 48 complete hours every push.
- `docs/decisions.md`, `docs/logic.md`, `docs/architecture.md`, `docs/prerequisites.md`, `docs/ingest/README.md` and
  the roadmap describe the new section, rules, rule change and follow-ups.

### Key Discoveries:

- `hourly_history` as a whole-window list each push would retain ~75 KB × 288 pushes/day × 14 days in
  `ingest_pushes`, about 300 MB; sending only the last 48 complete hours keeps each push to a few KB. The app
  accumulates hours by upsert, as it does for days.
- Net hourly grid draw (import positive) is the same quantity PGE bills on (hourly balancing), so a later PGE-based
  check compares like with like.
- Daylight-saving days have 23 or 25 clock hours in Europe/Warsaw (next: 2026-10-25, 25 hours); a "complete day" must
  mean every clock hour of that local day, not 24 rows.

## What We're NOT Doing

- Fixing the inverter's grid reading (CT placement or polarity). It is an on-site check, recorded as a follow-up.
- Using the PGE hourly CSV as a source (considered; manual and lagging). No "both sources" reconciliation.
- Weekday/weekend shares and the hour-of-day profile: the rest of S-10 stays on the roadmap.
- A calendar or date picker (S-15), charts, or an intraday kW chart (`docs/decisions.md:32` stays).
- Ranking grid draw separately: grid draw is shown beside each house-use hour, not ranked.
- Keeping hourly data beyond 35 days.
- Explaining _why_ an hour was high: the card points at the hour; the owner investigates.

## Implementation Approach

App first, lab second, as for every contract change (the contract rejects unknown keys, `contract.ts:4-6`). Phase 1
adds the optional section and storage, so the deployed app accepts pushes with or without it. Phase 2 adds pure
ranking rules and the read path, with unit tests. Phase 3 adds the card. Phase 4 changes the lab push, deploys in
order, backfills 35 days once, and updates the roadmap.

## Critical Implementation Details

- **State sequencing** — production order is fixed: apply the Phase 1 migration and deploy the app, then deploy the
  lab push, then run the one-off backfill. A lab push with `hourly_history` against an app without the field is
  rejected with 422 and the whole push is lost, including `state`.
- **Timing & lifecycle** — an hour is sent only once complete (its end ≤ the capture time). The in-progress hour is
  never sent, so a partial hour can't overwrite a complete one. Upserts keep the newer capture, as `daily_energy`
  does, so a later recount (more samples arrived) replaces an earlier one.
- **User experience spec** — the night named "noc z 1 na 2 sierpnia" runs 1 Aug 22:00 to 2 Aug 06:00 local time;
  "last night" is the most recent night whose 06:00 end has passed. A night counts as complete only with all 8 hours
  complete.

## Phase 1: Contract and storage

### Overview

The app accepts an optional `hourly_history` section and stores it for 35 days, readable by owners only.

### Changes Required:

#### 1. Contract section

**File**: `src/lib/ingest/contract.ts`

**Intent**: Accept per-clock-hour totals from the lab without breaking pushes that omit them.

**Contract**: optional `hourly_history: HourlyEnergy[]`, at most 900 entries (35 days plus DST slack, for the
backfill), `hour_start` values unique. `HourlyEnergy` is a strict object: `hour_start` (ISO datetime with offset, on
a whole hour), `load_kwh`, `grid_net_kwh` (import positive, export negative; may be negative, not bounded at 0),
`pv_kwh`, `samples` (integer 0–12, the 5-minute readings behind the hour). `load_kwh` and `pv_kwh` use the existing
`energyKwh`; `energyKwh` is non-negative (`contract.ts:12`), so `grid_net_kwh` gets a new signed schema (a finite
number within ± the same magnitude, nullable like `energyKwh`). The section copies `daily_history`'s shape:
`.max(…)` plus a uniqueness refine (`contract.ts:168-174`). Regenerate `docs/ingest/contract-v1.schema.json`
(`npm run contract:export`).

#### 2. Storage and ingest

**File**: `supabase/migrations/<timestamp>_hourly_energy.sql` (new)

**Intent**: Store hours, keep the newer capture, prune after 35 days, and let only owners read them.

**Contract**: table `public.hourly_energy` (`hour_start timestamptz primary key`, `load_kwh`, `grid_net_kwh`,
`pv_kwh` numeric, `samples smallint`, `captured_at timestamptz`, `push_id` references `ingest_pushes(id)`
**on delete set null**, since pushes are pruned at 14 days and hours are kept 35), RLS enabled, and
`revoke all … from anon, authenticated` as in `20260923101001_push_ingestion.sql:59-65`. `ingest_push` is redefined
from its latest body (`20260925151509_daily_forecast.sql:14-101`; no later migration touches it), unchanged except
that it upserts `hourly_energy` from `hourly_history` (newer `captured_at` wins, as for `daily_energy`) and deletes
rows with `hour_start < now() − 35 days`. The function's revoke/grant is restated after `create or replace`
(`:99-100`). Owners get `select` on every column except `push_id` through column grants plus the owner-only
policy used for `daily_energy` (`20260925162240_owner_read_daily_energy.sql`). Anon and non-owners read nothing.

#### 3. Fixtures, fixture tooling and docs

**File**: `docs/ingest/example-v1.json`, `scripts/push-fixture.mjs`, `src/lib/ingest/contract.test.ts`,
`docs/ingest/README.md`, `docs/architecture.md`

**Intent**: Document the section, show it in the example push, and keep the fixture tooling from writing made-up hours
where it shouldn't.

**Contract**: the example carries a few synthetic `hourly_history` entries. `push-fixture.mjs` strips
`hourly_history` in its default state-only mode, next to `recommendation`, `daily_history` and `bill_forecast`
(`:91-96`), so a production verify push never writes example hours. `--shift-days` shifts `hour_start` as it shifts
`daily_history` days (`:139-148`). `contract.test.ts`'s `sections()` helper (`:25-26`) covers the new section. Smoke
does not assert stored example hours: they are older than 35 days soon after the example date and would be pruned on
insert. The README states: complete hours only, the last 48 per push, a one-off `--hourly-hours` backfill, net sign
convention, `samples` meaning. The architecture data-flow names `hourly_energy`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including new contract cases (accepts a valid section; rejects a duplicate `hour_start`, a
  non-whole hour, `samples` over 12, more than 900 entries; accepts a push without the section): `npm test`
- The committed schema matches the contract: `npm run contract:export` then `git diff --exit-code docs/ingest/contract-v1.schema.json`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- The migration applies on a reset local database: `supabase db reset --local` (through `scripts/remote-docker.sh` in dev-hub)
- Local smoke passes, with the example push now carrying `hourly_history`: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`

#### Manual Verification:

- On the local stack, a push with `hourly_history` fills `hourly_energy`; a second push with a newer `captured_at`
  and changed values for the same hour replaces them; an older capture does not
- As a signed-in owner, `hourly_energy` is readable through the API without `push_id`; anonymous access returns nothing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Rules and read path

### Overview

Pure, tested rules turn stored hours into the card's figures; a loader reads them.

### Changes Required:

#### 1. Hourly usage service

**File**: `src/lib/services/hourly-usage.ts` (new), `src/lib/services/hourly-usage.test.ts` (new)

**Intent**: Decide completeness, nights and rankings in one place, so the card only renders.

**Contract**: `loadHourlyEnergy(supabase, now)` reads the last 35 days. `toHourlyUsageView(rows, now)` returns
either a refusal (no data, or a load error) or: `lastNight` (label, grid draw kWh, completeness), `nightAverage`
(average over complete nights, with their count), `highestHours`/`lowestHours` (up to 5 each: local date, weekday,
clock hour, house use kWh, grid draw kWh), `highestDays`/`lowestDays` (up to 3 each: local date, weekday, total
house use kWh), and the window text. Rules:

- An hour is complete when `samples ≥ 10` (constant `MIN_HOUR_SAMPLES`); only complete hours are ranked.
- A day is complete when every clock hour of that Europe/Warsaw date is present and complete (23, 24 or 25 hours);
  only complete days are ranked.
- A night is 22:00–06:00 local, named by both dates ("noc z 1 na 2 sierpnia"); complete when all 8 hours are.
  Night grid draw is the sum of `max(grid_net_kwh, 0)` over its hours, the hourly-balanced import PGE bills and the
  quantity the frame verified (within ~10%); night export is not subtracted.
- "Last night" is the most recent complete night among the last 3 whose 06:00 end has passed, shown by its name;
  when none of the 3 is complete the card says "niepełne dane za ostatnie noce" and shows no figure.
- Hours are keyed by their UTC start and labelled in Europe/Warsaw through a new hour helper in
  `src/lib/format/warsaw-time.ts` (it has day helpers only: `warsawParts`, `dayKeyToUtcMs`, `addDays`, …).
- Ties go to the more recent hour or day.
- Day rankings need at least 7 complete days (`MIN_RANKED_DAYS`); below that the day lists are replaced by
  "za mało dni" with the count. Hour rankings need at least one complete day.

Tests cover: completeness at 9/10 samples, a 23- and a 25-hour DST day, a night across midnight and across the DST
change, night draw ignoring an exporting hour, last night falling back to an earlier complete night and to the
"niepełne dane" state, ties, the 7-day minimum, an empty window, and a **synthetic** fixture shaped like the frame's
August example (two days at ~8 kW for hours, quiet nights, gap hours). It does not use the owner's real data: the
repository is read on GitHub.

#### 2. Documentation of the rules

**File**: `docs/logic.md`

**Intent**: A reader of the repository can follow how the card decides.

**Contract**: a "Godziny zużycia" section stating every constant and rule above, and that daytime grid draw is
shown with a caveat.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the cases listed above: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- The rules are documented: `git grep -n "MIN_HOUR_SAMPLES\|Godziny zużycia" -- docs/logic.md` prints at least two lines

#### Manual Verification:

- The synthetic August-shaped fixture, read through the view, ranks its two ~8 kW days highest and one of their
  evening hours among the highest hours, the pattern of the frame's worked example

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: The card

### Overview

A "Godziny zużycia" card on the dashboard renders the view.

### Changes Required:

#### 1. Card and dashboard

**File**: `src/components/HourlyUsageCard.astro` (new), `src/components/DashboardBody.astro`, `src/pages/dashboard.astro`

**Intent**: Show night draw, ranked hours and ranked days in plain Polish, full width below the card grid and inside
the main landmark.

**Contract**: the card uses `CardHeading` (an icon such as `Clock`) and `Panel`, loads through the page's
`orLoadError` so a failure only affects this card, and shows: last night and its average; two short lists of hours
("Najwyższe" / "Najniższe"); two short lists of days; the window and completeness rule; the daytime-grid caveat;
refusal states ("brak danych godzinowych", "za mało dni: N z 7", "niepełne dane za ostatnie noce"). House use leads
each hour row; grid draw sits beside it. No new chart dependency, no client JavaScript.

#### 2. Synthetic hourly data for the local stack

**File**: `scripts/push-fixture.mjs`, `docs/ingest/README.md`

**Intent**: Make the card checkable locally without anyone's real consumption data.

**Contract**: a new option, `--hourly-days <n>` (1–35), generates `n` days of synthetic `hourly_history` ending at
the last complete hour: a plausible daily load shape, two high-load days, and a few gap hours with `samples < 10`. It
is local and CI only, like the rest of the fixture tool's data.

#### 3. Glossary and decision

**File**: `src/lib/format/glossary.ts`, `docs/decisions.md`

**Intent**: Explain "pobór z sieci w nocy" and "zużycie domu" in plain words; record the rule reversal.

**Contract**: glossary entries used by the card's "Co to znaczy?" block. A dated `docs/decisions.md` entry: hourly
totals per clock hour may now leave the lab (reversing S-10's "never single readings or timestamps"; still no
sub-hour readings or raw PGE rows), the inverter as the source, house use as the ranking, 35-day retention, 48-hour
pushes, and the daytime caveat, citing the frame.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- The decision is recorded: `git grep -n "hourly_history\|Godziny zużycia" -- docs/decisions.md` prints at least one line

#### Manual Verification:

- On the local stack after `push-fixture.mjs --hourly-days 35`, the card shows last night, 5+5 hours and 3+3 days, the window
  text and the caveat, at 1440px and 390px without clipping or horizontal scroll
- With 3 days of data the day lists say "za mało dni: 3 z 7" and the hour lists still show; with no hourly data the
  card shows its empty state and the other cards are unaffected
- The card is inside the main landmark, its heading is an `h2`, and the lists read in a sensible order in the
  accessibility tree

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Lab push, production and roadmap

### Overview

The lab sends the last 48 complete hours every push; production is deployed in order and backfilled once; the
roadmap and prerequisites record the result and the follow-ups.

### Changes Required:

#### 1. Lab push (homelab-2)

**File**: homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py`, `test_push_energy_analyser.py`

**Intent**: Build `hourly_history` from the 5-minute history the push already reads.

**Contract**: `build_hourly_history(rows, now, hours=48)` groups rows by UTC clock hour and keeps only hours whose end
≤ `now`. Per hour: `load_kwh` = mean `home_load_w` / 1000, `grid_net_kwh` = mean `grid_w` / 1000 (import positive,
the sign verified 2026-07-22), `pv_kwh` = mean `pv_w` / 1000, `samples` = the number of rows with a `grid_w`, capped at 12 (timer jitter can put 13 readings in one hour). A new
`--hourly-hours` option (1–840, default 48) serves the backfill. `build_payload` adds the section when non-empty.
`fit_body` (`:376-386`) today drops only `bill_forecast` and returns an over-limit body unchanged; it is reworked
to drop `hourly_history` first, then `bill_forecast`, and to report which section it dropped, and `main()`'s note
(`:486-488`) follows. `read_history` is a one-pass generator (`:320-332`), so the history is materialised once
(`list`) and passed to both `build_daily_history` and `build_hourly_history`. Hours are keyed in UTC with the
existing `LOCAL_TZ` (`:77`) used only for labels in tests. Tests: `fit_body` drop order and its report, hour grouping, the partial current hour
excluded, sign, the samples count, the option bounds, and a payload without history.

#### 2. Production rollout

**File**: homelab-2 runbook or deploy notes; energy-analyser `docs/prerequisites.md`

**Intent**: Deploy in the safe order and fill 35 days once.

**Contract**: (1) apply the Phase 1 migration and deploy the app; (2) deploy the lab push; (3) run the push once with
`--hourly-hours 840`; (4) confirm rows in `hourly_energy`. `docs/prerequisites.md` names the lab push's
`hourly_history` and the backfill step.

#### 3. Roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: Keep the roadmap truthful about S-10 and the export question.

**Contract**: S-10's Risk line records the rule change and that this change delivers the night draw and
highest/lowest hours and days, with weekday/weekend shares and the profile still to come. Open question 5 is rewritten
with the frame's findings (hourly balancing explains 342/423; night export is real; the open part is the inverter's
load-dependent over-reading) and names the on-site CT check and per-phase data collection as the follow-up.

### Success Criteria:

#### Automated Verification:

- Lab tests pass: `python3 -m unittest infra/compose/energy-app/scripts/test_push_energy_analyser.py` (in homelab-2)
- App checks still pass: `npm test`, `npm run lint`
- The roadmap and prerequisites carry the change: `git grep -n "hourly_history" -- docs/prerequisites.md context/foundation/roadmap.md` prints at least two lines
- After the draft PR is opened the CI `ci` and `smoke` jobs are green

#### Manual Verification:

- In production, after the backfill, `hourly_energy` holds about 35 days of hours, and new hours arrive with each push
- The production card shows last night's grid draw close to what PGE's CSV shows for a recent night (within ~10%), and
  the highest days match what the owner remembers or the frame's August example where still in the window
- The export-mismatch follow-up (on-site CT check, per-phase data) is recorded in roadmap open question 5

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Contract: valid section, duplicates, non-whole hours, bounds, the 900 cap, absence.
- Rules: sample threshold, DST days, nights across midnight and DST, ties, the 7-day minimum, empty data, August extremes.
- Lab: hourly grouping, partial-hour exclusion, sign, samples (including the cap at 12), option bounds.

### Integration Tests:

- Local smoke with the example push carrying `hourly_history`.
- Local stack: upsert and pruning behaviour, owner-only reads.

### Manual Testing Steps:

1. Backfill 35 days on the local stack from a fixture and open `/dashboard` at 1440px and 390px.
2. Remove days to cross the 7-day threshold, and remove all hourly data.
3. In production after the backfill, compare last night with a PGE CSV night.

## Performance Considerations

About 840 rows in `hourly_energy`; each push adds ≤ 48 upserts. Each push grows by about 48 × 90 B ≈ 4 KB, so the
14 days of retained raw pushes grow by about 4 KB × 288 × 14 ≈ 17 MB. The one-off backfill push is ~75 KB, under the
256 KiB limit.

## Migration Notes

One additive migration (new table, redefined `ingest_push`, grants). Rollback: the lab stops sending the section
(the contract field is optional) and the card shows its empty state; the table can stay.

## References

- Frame: `context/changes/grid-export-mismatch/frame.md`
- Similar implementation: F-02 `context/archive/2026-09-25-daily-history-push/`, `supabase/migrations/20260925151509_daily_forecast.sql:55-92`
- Lab push: homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py:262-413`
- Hourly aggregation precedent: homelab-2 `infra/compose/energy-app/scripts/aggregate-energy-history-hourly.py`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Contract and storage

#### Automated

- [x] 1.1 Unit tests pass, including new contract cases (accepts a valid section; rejects a duplicate `hour_start`, a non-whole hour, `samples` over 12, more than 900 entries; accepts a push without the section): `npm test` — 3590152
- [x] 1.2 The committed schema matches the contract: `npm run contract:export` then `git diff --exit-code docs/ingest/contract-v1.schema.json` — 3590152
- [x] 1.3 Linting passes: `npm run lint` — 3590152
- [x] 1.4 Type checks pass: `npx astro check` — 3590152
- [x] 1.5 Production build succeeds: `npm run build` — 3590152
- [x] 1.6 The migration applies on a reset local database: `supabase db reset --local` (through `scripts/remote-docker.sh` in dev-hub) — 3590152
- [x] 1.7 Local smoke passes, with the example push now carrying `hourly_history`: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` — 3590152

#### Manual

- [x] 1.8 On the local stack, a push with `hourly_history` fills `hourly_energy`; a second push with a newer `captured_at` and changed values for the same hour replaces them; an older capture does not — 3590152
- [x] 1.9 As a signed-in owner, `hourly_energy` is readable through the API without `push_id`; anonymous access returns nothing — 3590152

### Phase 2: Rules and read path

#### Automated

- [x] 2.1 Unit tests pass, including the cases listed above: `npm test` — 132c643
- [x] 2.2 Linting passes: `npm run lint` — 132c643
- [x] 2.3 Type checks pass: `npx astro check` — 132c643
- [x] 2.4 The rules are documented: `git grep -n "MIN_HOUR_SAMPLES\|Godziny zużycia" -- docs/logic.md` prints at least two lines — 132c643

#### Manual

- [x] 2.5 The synthetic August-shaped fixture, read through the view, ranks its two ~8 kW days highest and one of their evening hours among the highest hours, the pattern of the frame's worked example — 132c643

### Phase 3: The card

#### Automated

- [x] 3.1 Unit tests pass: `npm test` — f82a7e1
- [x] 3.2 Linting passes: `npm run lint` — f82a7e1
- [x] 3.3 Type checks pass: `npx astro check` — f82a7e1
- [x] 3.4 Production build succeeds: `npm run build` — f82a7e1
- [x] 3.5 The decision is recorded: `git grep -n "hourly_history\|Godziny zużycia" -- docs/decisions.md` prints at least one line — f82a7e1

#### Manual

- [x] 3.6 On the local stack after `push-fixture.mjs --hourly-days 35`, the card shows last night, 5+5 hours and 3+3 days, the window text and the caveat, at 1440px and 390px without clipping or horizontal scroll — f82a7e1
- [x] 3.7 With 3 days of data the day lists say "za mało dni: 3 z 7" and the hour lists still show; with no hourly data the card shows its empty state and the other cards are unaffected — f82a7e1
- [x] 3.8 The card is inside the main landmark, its heading is an `h2`, and the lists read in a sensible order in the accessibility tree — f82a7e1

### Phase 4: Lab push, production and roadmap

#### Automated

- [x] 4.1 Lab tests pass: `python3 -m unittest infra/compose/energy-app/scripts/test_push_energy_analyser.py` (in homelab-2) — b946339
- [x] 4.2 App checks still pass: `npm test`, `npm run lint` — 5410ef4
- [x] 4.3 The roadmap and prerequisites carry the change: `git grep -n "hourly_history" -- docs/prerequisites.md context/foundation/roadmap.md` prints at least two lines — 5410ef4
- [x] 4.4 After the draft PR is opened the CI `ci` and `smoke` jobs are green — b79b1cf

#### Manual

- [x] 4.5 In production, after the backfill, `hourly_energy` holds about 35 days of hours, and new hours arrive with each push — 1d7ac4f
- [x] 4.6 The production card shows last night's grid draw close to what PGE's CSV shows for a recent night (within ~10%), and the highest days match what the owner remembers or the frame's August example where still in the window — 1d7ac4f
- [x] 4.7 The export-mismatch follow-up (on-site CT check, per-phase data) is recorded in roadmap open question 5 — 1d7ac4f
