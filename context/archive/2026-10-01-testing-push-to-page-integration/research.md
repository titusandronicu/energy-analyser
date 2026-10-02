---
date: 2026-10-01T18:20:00+02:00
researcher: Claude (Sonnet 5.5), three read-only subagents plus local spot-checks
git_commit: 30c45da9a0cc8a486fd4805dc2b570e680325b92
branch: main
repository: energy-analyser
topic: "Rollout Phase 2 of test-plan.md: Push-to-page integration (risks #3 and #4)"
tags: [research, codebase, ingest, ingest_push, supabase, smoke, vitest, integration-tests]
status: complete
last_updated: 2026-10-01
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Push-to-page integration (risks #3 and #4)

**Date**: 2026-10-01
**Git Commit**: 30c45da9a0cc8a486fd4805dc2b570e680325b92 (`main`, working tree has the uncommitted test-plan.md §3 edit and this folder)
**Repository**: energy-analyser

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md`.

- **Risk #3**: a change passes the unit tests but the real path from lab push to rendered page is broken. Response to verify: a lab-shaped payload goes through the real route, store and page loader in one run and appears on the right surface.
- **Risk #4**: stored history is silently lost or drifts. Response to verify: duplicate, replayed and out-of-order pushes never downgrade stored data, and a gap stays visible and is not filled.

The plan's wording is a hypothesis; this document verifies or corrects it.

## Summary

1. **The write path is validated in layers and most of risk #4 is already prevented in SQL.** On the inspected path (`POST /api/ingest` → `handleIngest` → zod contract → `ingest_push`, final definition `supabase/migrations/20261001113911_period_summaries_keep_narration.sql`) an exact duplicate returns 200 without writing, changed content at the same `captured_at` returns 409, and an older push cannot overwrite `daily_energy`, `hourly_energy` or `period_summaries` (`where ...captured_at <= excluded.captured_at` at :74 and :94, `built_at <=` at :122). A newer facts-only summary cannot wipe a stored narration (:123). `pv_forecast_kwh` is kept when omitted (:70).
2. **What is not guarded, verified in the same function:** a newer push replaces a stored daily or hourly total with a lower or null one (plain `excluded.*` assignment at :66-69 and :87-90, no `greatest`, no `coalesce` except `pv_forecast_kwh`). A far-future `built_at` locks its summary row (the contract only requires an ISO datetime at `contract.ts:202`). A second recommendation with the same `generated_at` and different text is silently dropped (`on conflict do nothing`, :137).
3. **The plan's #4 wording needs correcting.** "A counter drop undercounts a day" traces to a lab-side Python review whose suspected undercounts were false positives and were fixed in homelab-2; it is not an app-side replay or ordering defect. Roadmap open question 7 is about inconsistent early rows, not replay. "An outage gap reads as zero" has no historical source, and in the inspected loaders and SQL no zero fill exists.
4. **The real gap for #3 is the step between store and page.** No test in `src/**/*.test.ts` (34 files) opens a database connection or renders a page; the loader tests use hand-built chainable fakes and the fixture tests replace "stored row → loader" with a hand-written `toRow` helper. `scripts/smoke.mjs` does cover real pushes to rendered pages over HTTP for state, recommendation, bill forecast and summaries, but not for hourly history, daily-history cells, out-of-order daily or hourly pushes, the recommendation conflict, pruning, gap visibility or a non-owner.
5. **Cheapest layers, by evidence:** a Vitest test with a real anon `@supabase/supabase-js` client can call the exported loaders and `rpc("ingest_push")` directly, no browser and no Astro runtime. The real route, middleware and `.astro` composition need an HTTP test against the server the `smoke` CI job already starts. Neither a non-owner session nor a second ingest token can be created with the anon key alone.

## Detailed Findings

### Write path: order of checks

For `POST /api/ingest`, in order (all anchors are on the inspected path only):

1. `src/pages/api/ingest.ts:19-22`: no anon client → 503. Middleware skips Origin and session for this route (`TOKEN_AUTH_ROUTES`, `src/middleware.ts`).
2. `src/lib/services/ingest.ts:25-28`, `:50-51`: bearer header format only → 401.
3. `:53-55`: `Content-Length` above 256 KiB and a streaming byte cap → 413.
4. `:57-62`: invalid JSON → 400.
5. `src/lib/ingest/contract.ts:214-263`: strict zod schema → 422 with the first issue. `captured_at` at most 5 minutes ahead and at most 14 days old (`:254-261`); unique `daily_history` days, `hourly_history` instants and `period_summaries` (kind, period) pairs. This runs before the token is checked in the database, so a bad token with a bad body gets 422.
6. `ingest_push` (SECURITY DEFINER, anon-executable): token SHA-256 against `ingest_tokens` where not revoked, else P0401 → 401. The payload is not re-validated in SQL.
7. Raw push insert `on conflict (source, captured_at) do nothing`; equal `payload_hash` → `duplicate` (200), different → P0409 → 409.
8. Upserts in one transaction: `daily_energy`, `hourly_energy`, `period_summaries`, `recommendations`.
9. Prune: `ingest_pushes` older than 14 days and `hourly_energy` rows older than 35 days (`:140-141`). Pruning runs only inside a successful new push, so it does not run during a lab outage.

An older-`captured_at` push with a new key still returns 201 `created`; only the data-table `where` clauses decide silently whether anything changes.

### Store semantics per section

| Section                                | Store, key                                            | Conflict rule (final function)                                                                             |
| -------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `state` (required) and `bill_forecast` | `ingest_pushes.payload`, unique (source, captured_at) | never upserted; views read the newest by `captured_at`                                                     |
| `daily_history`                        | `daily_energy`, `day`                                 | overwrite if `stored.captured_at <= incoming`; `pv_forecast_kwh` kept via `coalesce`                       |
| `hourly_history`                       | `hourly_energy`, `hour_start`                         | overwrite if `stored.captured_at <= incoming`, no keep-existing columns                                    |
| `period_summaries`                     | `period_summaries`, (kind, period)                    | overwrite if `stored.built_at <= incoming` and not (incoming narration null while stored narration exists) |
| `recommendation`                       | `recommendations`, `generated_at`                     | first push wins                                                                                            |

`day_notes` is not pushed; the owner writes it through `/api/notes` under RLS.

Views: `live_state` is `source='homelab' order by captured_at desc limit 1` (`20260925123751_live_state_view.sql:16-23`). `bill_forecast` is the same filtered by `payload ? 'bill_forecast'` (`20260929101530_bill_forecast_view.sql:8-20`), so a newer push without the key leaves the previous forecast shown.

### Risk #4: what is prevented, what is not

Prevented in code (this inspected function only):

- Exact replay: 200 `duplicate`; changed replay at the same capture time: 409.
- Older push over `daily_energy`, `hourly_energy` or `period_summaries`: row unchanged. An older push never becomes the newest row of the two views.
- Narration wipe by a newer facts-only entry: blocked. Note the side effect: that whole update is skipped, so its newer facts are skipped too.
- Gap as zero: no `generate_series`, interpolation or zero insert in the 12 migrations. `daily-series.ts:12-15,27-39` treats a missing row, null, non-finite or negative total as a gap; `hourly-usage.ts:18,116` leaves out hours with fewer than 10 of 12 samples. Documented in `docs/logic.md` (:68, :100, :110, :173) and `docs/decisions.md:72`. The subagent could not confirm `calendar-data.ts`, `complete-day.ts` and the rating code have no zero fill beyond a first-hit grep; treat this as not yet verified for those files.

Not guarded:

- **Counter drop and null overwrite**: a newer push with a lower or null `pv_kwh`, `load_kwh`, `grid_import_kwh` or `grid_export_kwh` replaces the stored value in `daily_energy` and `hourly_energy`. The contract allows nullable totals (`contract.ts:12`, `:75-76`). Whether that is a defect or intended "latest wins" is a product decision (see Open Questions).
- **Fewer samples**: a newer push with fewer hourly `samples` replaces a fuller hour.
- **Far-future `built_at`**: locks a summary row against every later entry.
- **Same `generated_at`, different text**: second push silently ignored (201, no update).
- `daily_history` days and `hourly_history` instants have no bounds in the contract beyond uniqueness within a push.

Historical claims in test-plan.md §2, scored one by one:

- #4 "archive 2026-09-25-daily-history-push CRITICAL review": **partial.** The CRITICAL finding F1 exists (`context/archive/2026-09-25-daily-history-push/reviews/impl-review-phases-2-3.md:10,29`) but it concerns the lab's Python sample selection; the reviewer's correction (`:23`) records the suspected undercounts as false positives, fixed in homelab-2.
- #4 "docs/architecture.md latest-wins rule": **partial.** `docs/architecture.md:41,54` states the rule; the exact guard semantics are in `docs/logic.md:23,283` and the SQL.
- #4 "roadmap open question 7": **contradicted** as support for replay or disorder (`roadmap.md:430` is about inconsistent early rows, a lab-side fix).
- #4 "an outage gap reads as zero" and "a narration is wiped": the gap claim has **no historical source found** in the two review directories and an archive grep; the narration claim is **supported** by `logic.md:283` and the migration, with smoke coverage at `scripts/smoke.mjs:544-573`.
- #4 interview Q1: **unverifiable** from the repository.

### Risk #3: read path and the unwired-step question

Pages and loaders (all anchors on `src/pages`, `src/lib/services`):

- `dashboard.astro:15-63` builds one lazy client and loads six cards inside `orLoadError`: `loadDailyEnergy`, `loadLiveState`, `loadDailyRowCapturedAt`, `loadBillForecast`, `loadLatestRecommendation`, `loadTodaySummary`, `loadHourlyEnergy`, composed in `DashboardBody.astro:32-44`.
- `dashboard/history.astro:77-171` inlines `loadPage()`: month, day and quarter views via `loadDailyRange`, `loadRecommendationTimes`, `loadRecommendationsForDay`, `loadNoteDays`, `loadNoteForDay`, `loadPeriodSummary`.
- Chain per pushed section: `state` → `live_state` → `loadLiveState` → `toLiveStateView` → LiveStateCard; `daily_history` → `daily_energy` → `loadDailyEnergy`/`loadDailyRange` → usage and history views; `hourly_history` → `hourly_energy` → `loadHourlyEnergy` → `toHourlyUsageView` → HourlyUsageCard; `recommendation` → `recommendations` → `loadLatestRecommendation` → `toRecommendationView`; `bill_forecast` → `bill_forecast` view → `toBillForecastView`; `period_summaries` → `period_summaries` → `loadTodaySummary`/`loadPeriodSummary`.
- No writer without a reader and no reader selecting a column the writer never fills was found. Column grants match the selected columns (`daily_energy` incl. `captured_at` from `20260929101548`; `hourly_energy.captured_at` granted then revoked, not selected; `period_summaries` narration columns). The one fragile coupling is `daily_energy.captured_at` (the live card's verdict degrades without the grant; `docs/prerequisites.md:74`).
- No test checks the SQL section keys (`p_payload -> 'daily_history'` etc.) against the contract; they are coupled by hand.

Existing tests, scope `src/**/*.test.ts`:

- 34 files (the plan says 31; verified with `find src -name '*.test.ts'`). Zero open a database or HTTP connection; loader tests use chainable fakes cast to `SupabaseClient` (`hourly-usage.test.ts:354-364`, `period-summary.test.ts:17-30`, `calendar-data.test.ts:17-31`) and `ingest.test.ts:10-18` injects a fake `rpc`. The three `*-fixtures.test.ts` files map payload to row with a hand-written `toRow` (e.g. `live-flow-fixtures.test.ts:25-27`), which stands in for the store and loader step.
- `scripts/smoke.mjs` (603 lines): a hand count gave at most 68 steps (49 without `SUPABASE_URL` and `SUPABASE_ANON_KEY`); the plan says about 75. It was not run. It already covers real pushes to rendered pages for state, recommendation, bill-forecast range text, today and day and month summaries, the day-note round trip and a foreign-Origin 403, plus anon-denied reads and owner REST reads (`:379-581`).
- Smoke does not assert: the hourly card (no `hourly-*` check), daily-history cells on `/dashboard/history`, out-of-order `captured_at` for daily or hourly rows, the recommendation conflict, `bill_forecast` key skipping, 14-day and 35-day pruning, a gap staying a gap, or any non-owner page behaviour.
- Historical claim for #3 "none of 93 tests exercised the real entry point": **partial.** The quote is real (`context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-2.md:113,119`) but refers to the lab's Python forecast script in homelab-2, which test-plan.md §7 excludes. It is not evidence about the app's route, store or loader.

### Test infrastructure and where a new suite would run

- **Vitest**: `vitest.config.ts:10-12` has `include: ["src/**/*.test.ts"]`, node environment, no setup files. A new file under `src/` would be picked up by `npm test` in the `ci` job (no Supabase there) and by Stryker (`stryker.config.mjs:11` reuses this config; `mutation.yml` installs Vitest 4 and starts no Supabase). So integration files need a deliberate placement: outside `src/`, an `exclude`, or a second config.
- **CI `smoke` job** (`.github/workflows/ci.yml:28-49`): `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor`, only `API_URL` and `ANON_KEY` kept from `supabase status -o env`, build, server on 127.0.0.1:4321, health poll, `npm run smoke`, `supabase stop` under `if: always()`. A Vitest step after smoke would reuse the started stack; a new job would pay the start cost again. No run logs were read, so CI runtime is unmeasured.
- **Owner's machine**: Docker runs on the UGREEN (`dev-hub/CLAUDE.md`). The Supabase CLI runs through `scripts/remote-docker.sh exec`, and `relay-start` forwards 54321 and 54322 (`remote-docker.sh:22`); Mailpit 54324 is not relayed by default. Starting or changing that stack needs the owner's OK. A test on the Mac needs only port 54321, `SUPABASE_URL` and the anon key.
- **Seed and users** (`supabase/seed.sql:3-4,8-24`): the seed adds the public token `local-dev-ingest-token-not-secret` and a trigger making every new `auth.users` row an owner. Signup works locally without confirmation (`config.toml`), so the anon key can create owners only. A non-owner needs deleting the `app_owners` row or disabling the trigger; a second token needs an insert into `ingest_tokens`, which has all privileges revoked from anon and authenticated (`20260923101001_push_ingestion.sql:65-66`). Both need postgres or service-role access; `package.json` has no `pg` dependency and the repo forbids service-role keys in the app and `.env`. Whether the installed Supabase CLI can run SQL against the local database was not verified.
- **Auth rate limits** that could bite repeated runs: `email_sent = 2` per hour (`config.toml:182`, comment says it needs SMTP) and `sign_in_sign_ups = 30` per 5 minutes per IP; whether local GoTrue enforces them with Mailpit was not tested.
- **Fixtures**: `scripts/fixtures/` has 25 files (bill-forecast 14, live-flow 4, recommendation 7); `live-flow/normal.json` carries state and daily history only. `docs/ingest/example-v1.json` has all sections and is treated as real household data (`docs/decisions.md:13`); `docs/ingest/README.md:63` calls its sections "made-up", which conflicts with that decision. `push-fixture.mjs --hourly-days` is the only synthetic hourly generator and is a CLI, not an importable module. Provenance of the live-flow and recommendation fixtures was not checked.
- Sign-in over HTTP can reuse `smoke.mjs` `request()`/`storeCookies` (:19-47) and the password signup through `/auth/v1/signup`.

### Cheapest layer, by evidence

- **(a) Vitest with a real anon client.** All exported loaders take a `SupabaseClient` and import no Astro globals; `handleIngest(request, deps)` takes injected deps. A test can seed through `rpc("ingest_push")` with the anon key, read as a password-signed-up owner, and call the loaders and view mappers. This gives real replay, order, conflict and RLS-read semantics at no extra stack cost. It cannot import `src/lib/supabase.ts`, `middleware.ts` or `api/health.ts` (they import `astro:env/server`, no alias in `vitest.config.ts`).
- **(b) HTTP against the built server in the `smoke` job.** The only layer that covers the real route, middleware exemption and the `.astro` composition (`dashboard.astro:15-63`, `history.astro:77-171`, `data-testid` markers). All pages are server-rendered; only the React `LiveFlow` island's SSR behaviour was not checked.
- **(c) Browser.** Nothing found in this evidence needs one; §3 of the plan already excludes it.

## Code References

- `src/pages/api/ingest.ts:19-22` - 503 when no anon client; route entry
- `src/lib/services/ingest.ts:25-80` - bearer parse, size caps, JSON, zod, rpc status mapping
- `src/lib/ingest/contract.ts:202,214-263` - `built_at` unbounded; captured_at skew and age limits
- `supabase/migrations/20261001113911_period_summaries_keep_narration.sql:38-52` - raw dedup and 409
- `...keep_narration.sql:64-74` - daily upsert guard; `:70` pv_forecast_kwh coalesce
- `...keep_narration.sql:87-94` - hourly upsert guard
- `...keep_narration.sql:114-123` - summaries guard and narration rule
- `...keep_narration.sql:137,140-141` - recommendation do-nothing; pruning
- `src/pages/dashboard.astro:15-63`, `src/pages/dashboard/history.astro:77-171` - page composition
- `src/lib/supabase.ts:6-60` - anon key assertion; per-request client
- `src/middleware.ts:12-45` - token route exemption; Origin check; owner redirect
- `scripts/smoke.mjs:369-377,379-581` - ingest and REST/RLS steps
- `vitest.config.ts:10-12` - include glob
- `.github/workflows/ci.yml:28-49` - smoke job
- `supabase/seed.sql:3-4,8-24` - public token; every user an owner

## Architecture Insights

- Integrity rules live in SQL, not in TypeScript: the guards sit in one `SECURITY DEFINER` function, so a meaningful test of #4 must run against real Postgres; a mock cannot fail for the right reason.
- The loaders already take their client as a parameter, so the seam for a real-database test exists without refactoring.
- The contract and the SQL are coupled only by section key names and column names; a test that pushes a contract-valid, lab-shaped body and reads it back through the loaders is the only check that covers that coupling.
- The app's refusal of service-role keys is a constraint on test setup, not only on production code.

## Historical Context (from prior changes)

- `context/archive/2026-10-01-testing-time-and-number-guards/` - Phase 1 of this rollout; synthetic fixtures only; oracle-problem rule and KNOWN GAP convention reused here.
- `context/archive/2026-09-27-bill-accuracy/reviews/impl-review-phase-2.md:113,119` - the "none of 93 tests calls main()" finding (lab Python).
- `context/archive/2026-09-25-daily-history-push/reviews/impl-review-phases-2-3.md:10,23,29,39` - undercount finding and its false-positive correction.
- `context/archive/2026-10-01-period-summaries/` - origin of the narration-keep rule and its smoke steps.
- `context/foundation/lessons.md` - prerequisites outside the repo must be named (the Supabase stack on the UGREEN is one for any integration suite); docs stay in step with code.

## Related Research

None in `context/changes/` for this topic. `context/archive/2026-10-01-testing-time-and-number-guards/research.md` covers the time and number guards, not the push path.

## Open Questions

1. **Counter drop and null overwrite**: is a newer push with a lower or null daily or hourly total a defect to guard in SQL, or the intended "latest wins"? The test can pin today's behaviour as a KNOWN GAP either way; a guard is a product decision, not a test decision.
2. **Far-future `built_at`**: add a bound in the contract (like the 5-minute skew on `captured_at`), or pin it as a KNOWN GAP?
3. **Same `generated_at` with different text**: keep the silent drop, or return 409 like the raw push?
4. **Non-owner and second token**: how should a suite get privileged access (a direct Postgres connection through the relayed 54322 with a new dev dependency, the CLI if it can run SQL, or leave these to Phase 3, which covers access abuse)?
5. **Placement**: where do integration files live so `npm test`, the `ci` job and Stryker do not pick them up (outside `src/`, an `exclude`, or a second Vitest config), and does the suite run as a step in the `smoke` job?
6. **Provenance**: `docs/ingest/README.md:63` ("made-up") conflicts with `docs/decisions.md:13` (real household data). Until settled, tests must not copy values from `example-v1.json`; hourly and daily bodies need invented figures.
7. **Gap rule coverage**: `calendar-data.ts`, `complete-day.ts` and the rating code were not individually checked for zero fill.
8. **Not measured**: CI runtime of an added Vitest step, whether local GoTrue enforces the `email_sent` limit, and the React `LiveFlow` island's SSR output.
9. **Plan corrections to backport into `test-plan.md`** (needs the owner's yes, per the skill): 34 test files not 31; smoke has at most 68 steps not about 75 and already covers parts of #3; #3 and #4 evidence cites lab-side reviews; roadmap question 7 does not support #4; the latest-wins rule lives in `docs/logic.md` and the SQL.
