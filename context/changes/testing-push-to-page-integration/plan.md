# Push-to-page integration tests (test plan Phase 2) Implementation Plan

## Overview

Add an integration suite that runs against local Supabase (real Postgres) and proves two things the unit tests cannot: a lab-shaped push goes through the ingest service, the real `ingest_push` store and the real page loaders and shows up on its own surface (risk #3), and duplicate, replayed and out-of-order pushes never downgrade stored data while a gap stays a gap (risk #4). No production code changes. The three holes research found in the store (a newer push with a lower or empty total, a far-future `built_at`, a repeated `generated_at`) are pinned by named `KNOWN GAP` tests, as the owner decided, not fixed.

## Current State Analysis

- The write path is `POST /api/ingest` → `handleIngest` (`src/lib/services/ingest.ts:49`) → the zod contract (`src/lib/ingest/contract.ts:214-263`) → the `ingest_push` SECURITY DEFINER function, whose final definition is `supabase/migrations/20261001113911_period_summaries_keep_narration.sql`. The route file only wires `handleIngest` to `supabase.rpc("ingest_push", { p_token, p_payload })` (`src/pages/api/ingest.ts:25-27`).
- The store guards replay and order in SQL: exact duplicate returns 200, changed content at the same `captured_at` returns 409, an older push cannot overwrite `daily_energy`, `hourly_energy` (`where captured_at <= excluded.captured_at`, :74 and :94) or `period_summaries` (`built_at <=`, :122), a facts-only entry cannot wipe a narration (:123), `pv_forecast_kwh` is kept when omitted (:70).
- Unguarded, verified in that function: a newer push replaces a daily or hourly value with a lower or null one and a fuller hour with fewer `samples`; a far-future `built_at` locks its summary row (the contract only demands an ISO datetime, `contract.ts:202`); a second recommendation with the same `generated_at` is silently dropped (`on conflict do nothing`, :137).
- Every loader takes a `SupabaseClient` and imports no Astro globals (`loadLiveState` `live-state.ts:124`, `loadDailyRange` `calendar-data.ts:13`, `loadHourlyEnergy` `hourly-usage.ts:93`, `loadBillForecast` `bill-forecast.ts:112`, `loadLatestRecommendation` `recommendation.ts:89`, `loadPeriodSummary` `period-summary.ts:37`), and `handleIngest` takes injected deps, so a Vitest test can drive both with a real anon client.
- The 34 test files under `src` open no database and render no page; loader tests use hand-built fakes and the fixture tests map a payload to a row with a hand-written `toRow`. `vitest.config.ts:10-12` includes `src/**/*.test.ts` only, and Stryker reuses that config.
- `scripts/smoke.mjs` already covers real pushes to rendered pages over HTTP for state, recommendation, bill forecast and summaries, but nothing asserts the hourly card.
- Local Supabase: every new local user becomes an owner through a seed trigger (`supabase/seed.sql:8-24`), signup needs no confirmation, the public ingest token is `local-dev-ingest-token-not-secret` (`seed.sql:3-4`), and anon has no table grants, so seeding goes through `rpc("ingest_push")` and reading through an owner session (the pattern in `smoke.mjs:467-581`).

## Desired End State

`npm run test:integration` starts nothing itself; against a reachable local stack it pushes lab-shaped bodies through `handleIngest` and the real store and checks what the owner's loaders return, and it fails loudly when the stack is missing or the URL is not local. `npm test`, the `ci` job and Stryker never collect these files. The `smoke` CI job runs the suite after smoke. The cookbook (`context/foundation/test-plan.md` §6.2) says how to add the next one. Verify by running both suites and reading CI on the PR.

### Key Discoveries:

- The integrity rules live in one SQL function, so a mock cannot fail for the right reason; the oracle for each test is the invented figure pushed or a rule in `docs/logic.md`, never a value read from the code (`context/foundation/test-plan.md` §2 risk response #4).
- `live_state`, `bill_forecast` and the newest recommendation are global (newest by time across all pushes), and the database is never reset between runs (smoke leaves its rows too). A test therefore pushes with a real "now" so its push is the newest, uses its own unique keys (days, hours, periods) and never assumes a key is absent.
- Raw pushes older than 14 days cannot be sent (the contract rejects them, `contract.ts:254-261`), so the 14-day prune is out of reach through the service; the 35-day hourly prune is reachable because `hour_start` has no bound in the contract.
- `src/lib/supabase.ts` and `middleware.ts` import `astro:env/server` and cannot be imported by Vitest; the harness replicates only the anon-key check.
- `docs/ingest/example-v1.json` is treated as real household data: bodies are built from invented figures, and the bill-forecast body reuses `scripts/fixtures/bill-forecast/lab-shape.json`, which `src/lib/ingest/bill-forecast-fixtures.test.ts:129` declares synthetic.

## What We're NOT Doing

- No production change: no new SQL guard, no contract bound, no 409 for a repeated `generated_at`. Owner's decision: the three holes are pinned as `KNOWN GAP` tests and left for a later decision.
- No non-owner session and no second ingest token (both need postgres or service-role access); that is rollout Phase 3 (risks #6 and #7). Owner reads of the granted `ingest_pushes` columns (`source, captured_at, received_at, payload`; `token_id` and `payload_hash` stay hidden) need no privileged access and are used where useful.
- No browser test and no middleware or Origin test; smoke owns the HTTP route and the `.astro` composition, and Phase 3 owns the token exemption.
- No re-test of the narration-keep rule (smoke covers it at `scripts/smoke.mjs:544-573`) and no test of the 14-day raw-push prune.
- No copying of values from `docs/ingest/example-v1.json` or from the live-flow and recommendation fixtures (provenance unconfirmed); no edit to them.
- No change to the Stryker config or to `vitest.config.ts`.

## Implementation Approach

Place the suite outside `src` in `tests/integration/` with its own `vitest.integration.config.ts` and `npm run test:integration`, so `npm test` and Stryker cannot collect it; run it in the `smoke` CI job right after smoke, reusing the already-started stack. Build everything on three real pieces: `handleIngest` with an `rpc` that calls the real `ingest_push` through an anon client, an owner session created by signup, and the exported loaders and view mappers. Isolation rules: tests run sequentially (the global views race otherwise); each test seeds its own first state; absence and prune checks use keys verified absent (far-past days and hours drawn at random and redrawn when occupied); every `captured_at` is strictly increasing; loaded rows are filtered to the test's own keys before a view mapper when the loader returns a window; and any complete Warsaw day the suite puts into the 35-day window keeps every load at or below 1 kWh, so smoke's heaviest hour (at least 5 kWh) stays the heaviest on the dashboard whatever an earlier run left. Every guard test carries a control (a newer push does change the row) so a store that ignored everything could not pass. Known gaps are pinned like in Phase 1 (`context/foundation/test-plan.md` §6.5).

## Phase 1: Integration harness and seed test

### Overview

Create the place, the config, the helpers and one green test, and wire it into CI, so every later phase only adds tests.

### Changes Required:

#### 1. Config and script

**File**: `vitest.integration.config.ts`, `package.json`

**Intent**: A second Vitest config that collects only `tests/integration/**/*.test.ts`, runs files and tests sequentially and allows long timeouts, plus a `test:integration` script.

**Contract**: Same `@` alias as `vitest.config.ts` (`./src`); `test.include: ["tests/integration/**/*.test.ts"]`, `fileParallelism: false`, `testTimeout` and `hookTimeout` 30 s. Script `"test:integration": "vitest run --config vitest.integration.config.ts"`. `vitest.config.ts` stays untouched, so `npm test` and Stryker see no new file.

#### 2. Stack and client helpers

**File**: `tests/integration/support/stack.ts`

**Intent**: One place that reads the stack settings, refuses unsafe ones and hands out clients.

**Contract**: `requireStack()` reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `process.env` and throws an error that names both variables and points at §6.2 of the test plan when either is missing (never skips: a skipped suite would pass CI vacuously); throws when the URL host is not `127.0.0.1` or `localhost` (never against production, as for smoke); throws when the key starts with `sb_secret_` or is a JWT whose role is `service_role` (the repo forbids it; `src/lib/supabase.ts:6-23` cannot be imported because of `astro:env`). `anonClient()` builds a `@supabase/supabase-js` client with `persistSession: false`. `ownerClient()` signs up a user `integration-<timestamp>-<random>@example.com` with a password and returns the client holding that session; every local user is an owner through the seed trigger. Create one owner per test file (`beforeAll`), because local auth limits signups per IP.

#### 3. Push helper and body builders

**File**: `tests/integration/support/push.ts`, `tests/integration/support/bodies.ts`

**Intent**: Push a body exactly the way the route does, and build lab-shaped bodies from invented values.

**Contract**: `push(body)` calls `handleIngest(new Request("http://localhost/api/ingest", { method: "POST", headers: { Authorization: "Bearer local-dev-ingest-token-not-secret", "Content-Type": "application/json" }, body: JSON.stringify(body) }), { rpc: (token, payload) => anon.rpc("ingest_push", { p_token: token, p_payload: payload }), now: () => new Date() })` and returns `{ status, body }`, mirroring `src/pages/api/ingest.ts:25-27`. `bodies.ts` exports `baseBody(capturedAt)` (a minimal valid body with an invented `state`) and small section builders (`dailyRow`, `hourRow`, `summary`, `recommendation`, `billForecast`). Every body is checked with `validateIngestPayload` before it is pushed, so a builder drifting from the contract fails fast. `billForecast` starts from `scripts/fixtures/bill-forecast/lab-shape.json` and rewrites `generated_at` to just before now and `month` to the current Warsaw month key (the fixture is dated 2027-03, so with only `generated_at` rewritten the view says "to prognoza za marzec 2027, nie za bieżący miesiąc"; the contract does not tie `month` to the observed days, so the body still validates); the fixture's own `captured_at` is replaced by `baseBody`'s. `support/keys.ts` holds the key helpers: `freshDays(owner, n)` and `freshHours(owner, n)` draw keys at random from a wide far-past range (days in 1900–2040, hours in 1900–2020; the contract bounds neither and no windowed loader is used for them) and redraw until a direct owner select shows every key absent, so a precondition of absence holds on a database that is never reset; `windowHours(n)` gives whole hours inside the 35-day window for the hourly loader and is used only for positive assertions on the test's own keys. `nextCapturedAt()` returns the real now, bumped by 1 ms when it would not be greater than the value it returned last, so every push is strictly newer than the previous one (an equal `captured_at` with different content is a 409, and an older one would not be the newest live state); the explicit "older push" cases use now minus at least one minute. A `captured_at` is never in the future and always inside 14 days. Never read a value from `docs/ingest/example-v1.json`.

**Note (implementation)**: the far-past `freshHours` described above were replaced by `freshWindowHours` (10 to 28 days back), because `ingest_push` deletes hours older than 35 days in the same call, so an absence check on a far-past hour proves nothing.

#### 4. Seed test

**File**: `tests/integration/seed.test.ts`

**Intent**: One green end-to-end check that proves the harness: a pushed state is the newest live state.

**Contract**: Push `baseBody(now)` with an invented live figure; expect status 201 and `loadLiveState(ownerClient)` to return the same `captured_at` and the pushed figure. The expected figure is the invented literal written in the test.

#### 5. CI step

**File**: `.github/workflows/ci.yml`

**Intent**: Run the suite in the existing `smoke` job after smoke, on the stack that job already started.

**Contract**: A new step after the "Build and run the Node server" step: `source supabase.env` then `SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" npm run test:integration`. The `supabase stop` step with `if: always()` stays last. No new job.

#### 6. Commands lists

**File**: `CLAUDE.md`, `AGENTS.md`, `README.md`

**Intent**: Document the new command wherever `npm test` and `npm run smoke` are listed.

**Contract**: One bullet for `npm run test:integration` in `CLAUDE.md` and in `AGENTS.md` (they duplicate the same command list, `AGENTS.md:13-15`), stating what it needs (reachable local Supabase, `SUPABASE_URL` and `SUPABASE_ANON_KEY`), that it refuses non-local URLs and that it is not part of `npm test`; the same line in `README.md`'s command list and a clause in its CI description (`README.md:56-57` and `:102`).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Unit tests still pass with the same 34 files and 1201 tests and collect no integration file: `npm test`
- Production build passes: `npm run build`
- The seed test passes against a reachable local stack (needs the UGREEN relay or CI): `npm run test:integration`
- The harness refuses a non-local URL: `SUPABASE_URL=https://example.supabase.co SUPABASE_ANON_KEY=x npm run test:integration` exits non-zero with the refusal message

#### Manual Verification:

- Kamil runs `npm run test:integration` twice in a row against the UGREEN stack and both runs are green
- The `smoke` job on the PR runs the new integration step and it is green

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Push to page, one test per section

### Overview

Prove risk #3: each pushed section reaches its own loader through the real store and appears in its view, and lands nowhere else. Add the one real-HTTP check smoke is missing.

### Changes Required:

#### 1. Per-section chain tests

**File**: `tests/integration/push-to-page.test.ts`

**Intent**: For each section a lab push can carry, push a body with invented figures through `push()` and read it back with the owner's loaders and the view mappers, asserting the right surface and a hand-derived label, not the code's output.

**Contract**: A `describe.each`-style table, one row per section, each row stating the pushed figure and the expected result written by hand:

- `state`: `loadLiveState` returns this push's `captured_at`; `toLiveStateView(row, now, [], null)` has `status.label` "aktualne" and `isStale === false`, and `view.pv` equals the invented figure as a hand-written literal in the app's format (decimal comma, one decimal, absolute value, `kW`: 3100 W reads "3,1 kW"). Do not assert the PV and home verdict texts (they depend on the wall-clock hour) or `today.periodLabel` (it changes across Warsaw midnight).
- `daily_history`: `loadDailyRange(first, last)` over the test's own unique days returns exactly the pushed days with the pushed values; `dailySeries(rows, "load_kwh", lastDay, 7)` places them in the right slots.
- `hourly_history`: `loadHourlyEnergy(now)` filtered to the test's own `windowHours` block returns the pushed rows. The block is an incomplete day (5 whole hours that have ended, each with at least 10 samples and non-null load and net), so `toHourlyUsageView(rows, now)` has `kind === "usage"` and `view.hours` is `{ kind: "insufficient", reason: "za mało danych: brak pełnego dnia" }` (`hourly-usage.ts:286-287`). `kind === "usage"` rather than empty, and that reason rather than "brak danych godzinowych", prove the loader fed the view. Do not assert `lastNight` (it carries its own reason, "niepełne dane za ostatnie noce").
- `recommendation`: `loadLatestRecommendation` returns the pushed text; `toRecommendationView(row, now)` is the current, not stale, view.
- `bill_forecast`: `loadBillForecast` returns the pushed `generated_at` and `month`; `toBillForecastView(row, now)` has `kind === "forecast"`, `centralLabel` "ok. 232 zł" and `rangeLabel` "od 141 zł do 322 zł", hand-derived from the fixture's central 231.75 and range 141.2 to 322.3 rounded to whole złoty. Do not assert `dayLabel` (it depends on the current year) or the status text (with the fixture's own invoice the current-month verdict is "problem", more than 20% above the invoice; a fixture fact, not a risk).
- `period_summaries`: `loadPeriodSummary` for the test's `freshDays` day returns the pushed narration text, provider, model and `built_at` (the loader does not select `facts`, `period-summary.ts:17-18`); the pushed facts are read with a direct owner select of `period_summaries`.

Right-surface checks: a push that carries only a daily row creates no hourly row at the test's `freshHours` keys (a direct owner select) and no recommendation at its `generated_at`; a push that carries only `state` leaves the test's `freshDays` keys empty. Key-skip: push A with `bill_forecast`, then a newer push B without it; `loadBillForecast` still returns A's `generated_at` while `loadLiveState` returns B's `captured_at` (`supabase/migrations/20260929101530_bill_forecast_view.sql:8-20`).

Anti-patterns to avoid: mocking the client, asserting a row count only, expected labels taken from the production formatter, reading figures from `example-v1.json`.

#### 2. Hourly card over real HTTP

**File**: `scripts/smoke.mjs`

**Intent**: Close the one push-to-page gap Vitest cannot: the dashboard page, through the real server, shows the hourly card for pushed hours.

**Contract**: Two new steps in the signed-in step list, between the existing dashboard checks (around `:225`) and the sign-out step (`:329`; steps after sign-out hold no session): a push step, then a GET `/dashboard` step. The push body is `freshPush`'s body with `hourly_history` replaced by one complete Warsaw day (every clock hour of a day a few days back: 24 rows, 23 or 25 on a DST day; at least 10 samples each; invented loads in which one hour is the heaviest at 5 kWh or more and every other hour stays well below it). The GET asserts `hourly-status` is present, `hourly-empty-reason` is absent and the heaviest hour's label (for example "20:00–21:00", derived by hand from the invented loads and `docs/logic.md`) appears inside `data-testid="hourly-hours"`. The label exists only because of the new rows: smoke's example already carries 4 hours of 2026-09-21 (inside the 35-day window until about 2026-10-26, so the card may render without any new row), and the empty-reason marker is capitalised ("Brak danych godzinowych.") and rendered only for an empty view, so a bare presence or lowercase-absence check would pass without the push. The step sits after the live-state, recommendation and bill-forecast assertions (`:190`, `:193`, `:208`), which a newer push could otherwise disturb; keep `freshPush`'s state so the newer `live_state` stays valid. Use the same day's keys each run so reruns overwrite with identical values, and a `captured_at` distinct from every other push in the script (an equal one with different content is a 409). Do not copy values from `docs/ingest/example-v1.json`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Unit tests still pass with the same 1201 tests: `npm test`
- The push-to-page tests pass against a reachable local stack: `npm run test:integration`
- Deliberate break: comment out the `hourly_history` section in the hourly row's body builder and the hourly test fails, then restore it

#### Manual Verification:

- Kamil runs `npm run smoke` against a local server and stack and the new hourly step passes
- The `smoke` job on the PR is green with the new smoke step and the integration step

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: History safety: replay, order, gaps and known gaps

### Overview

Prove risk #4 at the store: replays and disorder do not downgrade data, gaps stay gaps, the 35-day prune works, and the three unguarded holes are pinned by `KNOWN GAP` tests.

### Changes Required:

#### 1. Replay and order

**File**: `tests/integration/history-safety.test.ts`

**Intent**: Prove the guards the SQL already has, each with a control that a newer push does change the row.

**Contract**: Each case seeds its own first state, uses its own unique keys and compares with hand-written literals:

- Exact duplicate: the second push returns 200 and the row is unchanged. Changed content at the same `captured_at`: 409 and the first values survive. After both, an owner select of `ingest_pushes` (`source, captured_at, received_at, payload`) at that `captured_at` returns exactly one row.
- Older daily push: push N (newer `captured_at`, total 10), then O (older `captured_at`, same day, total 99): O returns 201 and `loadDailyRange` still shows 10. Control: a push newer than N with total 12 shows 12. The same pair for one hourly row.
- Older state push: after N, an older push O with a different live figure; `loadLiveState` still returns N's `captured_at`.
- `pv_forecast_kwh`: forecast 20 kept when a newer push omits it; replaced when a newer push carries 25.
- Recommendation: a second `generated_at` creates a second row and `loadLatestRecommendation` returns the newer one.

#### 2. Gaps stay gaps and the hourly prune

**File**: `tests/integration/history-safety.test.ts`

**Intent**: Prove "a gap stays visible and is not filled" and that retention removes only what it should.

**Contract**:

- Push days D and D+2 only, drawn from `freshDays` (D+1 verified absent): `loadDailyRange` returns exactly two rows and `dailySeries` over the window gives `[value, null, value]`, never 0 for D+1 (`docs/logic.md:173`).
- Push one complete Warsaw day inside the 35-day window (`windowHours`, every load at or below 1 kWh) with one hour of it replaced by a copy that has fewer than 10 samples and a 40 kWh load: after filtering the loaded rows to the test's own keys, the hourly view's figures leave that hour out (the 10-sample rule, `docs/logic.md`); derive the expected ranking by hand from the invented loads.
  - Note (implementation): the ten-sample test uses 9 versus 10 samples with every load at or below 1 kWh, because the original 40 kWh wording conflicted with the rule that protects smoke's heaviest hour.
- Hourly prune: in one push send an hour 40 days old and an hour 30 days old; an owner's direct select from `hourly_energy` finds the 30-day hour and not the 40-day one. Use distances far from the 35-day line so the DB clock and the test clock cannot disagree.

#### 3. Known gaps

**File**: `tests/integration/history-safety.test.ts`

**Intent**: Pin, by name, the three holes the owner chose not to guard now.

**Contract**: Tests whose names start with `KNOWN GAP`, each with a comment saying what a fix should change so a later fix flips it knowingly:

- A newer push with a lower daily total replaces the higher stored one; a newer push with a null total replaces it with null, and `dailySeries` then shows that day as a gap; a newer hourly push with fewer samples replaces the fuller hour.
- A summary pushed with `built_at` far in the future locks its (kind, period) row: a later entry with a current `built_at` returns 201 and `loadPeriodSummary` still returns the far-future entry.
- A second recommendation with the same `generated_at` and different text returns 201 and the first text stays.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Unit tests still pass with the same 1201 tests: `npm test`
- The history-safety tests pass against a reachable local stack: `npm run test:integration`
- The whole integration suite passes twice in a row on the same database, so it is rerun-safe: `npm run test:integration && npm run test:integration`

#### Manual Verification:

- Kamil reads the three `KNOWN GAP` test names and comments and agrees they say what is pinned and what a fix would change
- The `smoke` job on the PR is green with all integration tests

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Docs and cookbook

### Overview

Record what the rollout phase shipped and what it decided, per `context/foundation/lessons.md` (project docs in step with the code; external prerequisites named).

### Changes Required:

#### 1. Test plan cookbook and stack

**File**: `context/foundation/test-plan.md`

**Intent**: Fill §6.2 and §6.6 and update the stack row so the next integration test follows the same pattern.

**Contract**: §6.2: location (`tests/integration/`), naming, the helpers, the isolation rules (real "now", unique keys per run, own first state, filter loaded windows to own keys, sequential files), the control-per-guard rule, `KNOWN GAP` naming, how to run locally (stack reachable through the relay, `SUPABASE_URL=http://127.0.0.1:54321` and the anon key only) and in CI, and the reference test. §6.6: a 2–3 line Phase 2 note (the store already guarded most of #4; the three pinned holes; the smoke gap closed). §4: the Vitest row mentions the integration config and the smoke row the new step. Do not edit §3 status (the orchestrator does) or §2.

#### 2. Decision record

**File**: `docs/decisions.md`

**Intent**: A dated entry for the owner's decisions of this rollout phase.

**Contract**: Under the implementation date, newest first: the three holes pinned not fixed and why (lab corrections downward can be legitimate; no re-pricing or guarding without a product decision), non-owner and second-token tests deferred to Phase 3, the suite outside `src` with its own config and why (`npm test` and Stryker stay stack-free).

#### 3. Store rules and prerequisite

**File**: `docs/logic.md`, `docs/prerequisites.md`

**Intent**: Say in the rule text what the pinned tests pin, and name the external stack the suite needs.

**Contract**: In the latest-wins paragraphs of `docs/logic.md` (around `:23` and `:283`) state that a newer capture replaces a day or hour even with a lower or empty total, that a far-future `built_at` locks a summary row, and that a repeated `generated_at` keeps the first text, each as "pinned by a KNOWN GAP test". In `docs/prerequisites.md` add the local Supabase stack on the UGREEN (remote Docker, relay on 54321, the 12 migrations applied, changing the stack needs the owner's OK) as a prerequisite of the integration suite.

### Success Criteria:

#### Automated Verification:

- Docs are formatted: `npx prettier --check context/foundation/test-plan.md docs/decisions.md docs/logic.md docs/prerequisites.md CLAUDE.md AGENTS.md README.md`
- Linting passes: `npm run lint`
- §6.2 is filled and the command is documented: `/usr/bin/grep -c "test:integration" context/foundation/test-plan.md CLAUDE.md AGENTS.md README.md`
- The decision entry exists: `/usr/bin/grep -n "pinned" docs/decisions.md`

#### Manual Verification:

- Kamil confirms §6.2 matches how he would add the next integration test

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None added; `npm test` must stay at 34 files and 1201 tests and must not collect `tests/integration`.

### Integration Tests:

- Phase 1 seed; Phase 2 one test per pushed section plus right-surface and key-skip checks; Phase 3 replay, order, `pv_forecast_kwh`, gaps, hourly prune and three `KNOWN GAP` tests. Every guard test has a control.

### Manual Testing Steps:

1. Kamil confirms the UGREEN stack is up, the relay is running and the 12 migrations are applied (`supabase migration list` through `scripts/remote-docker.sh exec`), then runs `npm run test:integration` twice.
2. Kamil runs `npm run smoke` once for the new hourly step.
3. Kamil reads the PR's `smoke` job output.

## Performance Considerations

The suite is sequential and small (tens of pushes, one signup per file). CI runtime is unmeasured; the first PR run gives the number. The signup per file stays well under the local limit of 30 per 5 minutes.

## Migration Notes

None: no schema, contract or production change. Rows the suite leaves in the local database are keyed uniquely per run and never cleaned, like smoke's.

## References

- Related research: `context/changes/testing-push-to-page-integration/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 risks #3 and #4, §6.5 known-gap convention)
- Similar test work: `context/archive/2026-10-01-testing-time-and-number-guards/plan.md`
- Pattern for an owner session and direct reads: `scripts/smoke.mjs:467-581`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration harness and seed test

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 3c6090f
- [x] 1.2 Type checking passes: `npx astro check` — 3c6090f
- [x] 1.3 Unit tests still pass with the same 34 files and 1201 tests and collect no integration file: `npm test` — 3c6090f
- [x] 1.4 Production build passes: `npm run build` — 3c6090f
- [x] 1.5 The seed test passes against a reachable local stack (needs the UGREEN relay or CI): `npm run test:integration` — 3c6090f
- [x] 1.6 The harness refuses a non-local URL: `SUPABASE_URL=https://example.supabase.co SUPABASE_ANON_KEY=x npm run test:integration` exits non-zero with the refusal message — 3c6090f

#### Manual

- [x] 1.7 Kamil runs `npm run test:integration` twice in a row against the UGREEN stack and both runs are green — 3c6090f
- [x] 1.8 The `smoke` job on the PR runs the new integration step and it is green — 3c6090f

### Phase 2: Push to page, one test per section

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 38f19ee
- [x] 2.2 Type checking passes: `npx astro check` — 38f19ee
- [x] 2.3 Unit tests still pass with the same 1201 tests: `npm test` — 38f19ee
- [x] 2.4 The push-to-page tests pass against a reachable local stack: `npm run test:integration` — 38f19ee
- [x] 2.5 Deliberate break: comment out the `hourly_history` section in the hourly row's body builder and the hourly test fails, then restore it — 38f19ee

#### Manual

- [x] 2.6 Kamil runs `npm run smoke` against a local server and stack and the new hourly step passes — 38f19ee
- [x] 2.7 The `smoke` job on the PR is green with the new smoke step and the integration step — 38f19ee

### Phase 3: History safety: replay, order, gaps and known gaps

#### Automated

- [x] 3.1 Linting passes: `npm run lint` — 939d573
- [x] 3.2 Type checking passes: `npx astro check` — 939d573
- [x] 3.3 Unit tests still pass with the same 1201 tests: `npm test` — 939d573
- [x] 3.4 The history-safety tests pass against a reachable local stack: `npm run test:integration` — 939d573
- [x] 3.5 The whole integration suite passes twice in a row on the same database, so it is rerun-safe: `npm run test:integration && npm run test:integration` — 939d573

#### Manual

- [x] 3.6 Kamil reads the three `KNOWN GAP` test names and comments and agrees they say what is pinned and what a fix would change — 939d573
- [x] 3.7 The `smoke` job on the PR is green with all integration tests — 939d573

### Phase 4: Docs and cookbook

#### Automated

- [x] 4.1 Docs are formatted: `npx prettier --check context/foundation/test-plan.md docs/decisions.md docs/logic.md docs/prerequisites.md CLAUDE.md AGENTS.md README.md` — 1bdc6f2
- [x] 4.2 Linting passes: `npm run lint` — 1bdc6f2
- [x] 4.3 §6.2 is filled and the command is documented: `/usr/bin/grep -c "test:integration" context/foundation/test-plan.md CLAUDE.md AGENTS.md README.md` — 1bdc6f2
- [x] 4.4 The decision entry exists: `/usr/bin/grep -n "pinned" docs/decisions.md` — 1bdc6f2

#### Manual

- [x] 4.5 Kamil confirms §6.2 matches how he would add the next integration test — 1bdc6f2
