# Alert Rules with Telegram Notifications Implementation Plan

## Overview

The owner manages alert rules in the app (list, create, edit, enable/disable, delete) and the app tells the owner on Telegram when a rule fires. First slice, two rule kinds: `live_stale` (the newest lab snapshot is older than N minutes) and `bill_above` (the projected bill is above X PLN). A scheduled GitHub Actions job calls a bearer-token route that evaluates the rules; the app sends the Telegram message itself. The change adds the project's second owner-facing CRUD entity and the first outbound notification boundary.

## Current State Analysis

- There is no alerting in the app. Lab-side alerting exists: Uptime Kuma gets a heartbeat after each successful lab push and alerts Telegram within about 15 minutes of push silence (`context/foundation/existing-system.md:70-71`, homelab-2 `runbooks/proxmox-nic-hang-and-alerting.md`). It does not catch a lab that keeps pushing stale or degraded data, which is the gap `live_stale` covers.
- Staleness is computed only in TypeScript: `LIVE_STALE_AFTER_MS` 15 min and `LIVE_PROBLEM_AFTER_MS` 2 h on `captured_at` (`src/lib/services/live-state.ts:14-16`, `:350-356`, `:390`). The forecast is judged on `body.generated_at` against `FORECAST_STALE_AFTER_MS` 30 min (`src/lib/services/bill-forecast.ts:16`, `:300-323`). `docs/logic.md:29,255`.
- The bill figure a rule compares is `projected_bill_gross_pln`, and only when `toBillForecastView` returns `kind === "forecast"`; stale, `no_data`, unavailable and under-7-day forecasts expose no figure (`src/lib/services/bill-forecast.ts:286-323`, `MIN_COMPLETE_DAYS` 7, `MAX_PLAUSIBLE_BILL_PLN` 7000).
- `day_notes` is the CRUD template: owner-only table with column grants and four per-operation policies (`supabase/migrations/20261001072438_day_notes.sql`), a service with injected deps (`src/lib/services/day-notes.ts`), a 303-redirect route (`src/pages/api/notes.ts`), no-JS `<details>` forms (`src/components/history/DayNotePanel.astro`), an access-abuse matrix entry (`tests/integration/access-abuse.test.ts:100-103,233-262`) and a DB-limit parity test (`tests/integration/notes-parity.test.ts`).
- A bearer-token route is the `/api/ingest` pattern: `TOKEN_AUTH_ROUTES` exact-path set skips the Origin check and the session lookup (`src/middleware.ts:15-23`); the route builds `createAnonClient()` and `assertAnonKey` rejects service-role keys (`src/pages/api/ingest.ts:19`, `src/lib/supabase.ts:6,25-34`; the key check is private to `createAnonClient()`, routes only call that); the token is checked inside an anon-callable `SECURITY DEFINER` function with `search_path = ''` and restated grants (`20261006130000_ingest_token_ok.sql:14-26`, `20261006120000_ingest_push_sections.sql`). `ingest_tokens` has no scope column, so an alerts cron token must not share it.
- Production Supabase is hosted cloud and migrations are applied by hand (`context/deployment/micrus-runbook.md:92,129`). Runtime secrets live in `.env.runtime` on the VPS (`README.md:125-136`). Mikrus egress to `api.telegram.org` is undocumented.

## Desired End State

- `/dashboard/alerts` lists the owner's rules with their last known state and, when a rule cannot be evaluated, the reason; the owner can add, edit, enable/disable and delete rules there.
- Every ~10 minutes a scheduled workflow calls `POST /api/alerts/evaluate`; the app evaluates every enabled rule and sends one Telegram message on ok→alarm, a reminder every N hours (default 6) while the alarm lasts, and one message when it returns to ok.
- A rule that cannot be evaluated sends nothing and keeps its last known state.
- Verified by: integration tests against a real local Supabase (access, token, state transitions with a fake Telegram fetch), unit tests, the smoke test, and a manual alarm→recovery cycle in Telegram after the production steps.

### Key Discoveries:

- Evaluation runs in TypeScript behind the token route, reusing `toLiveStateView` / `toBillForecastView` and the existing constants, so thresholds are not re-implemented in SQL (`src/lib/services/live-state.ts`, `bill-forecast.ts`).
- The route cannot use an owner session or the service-role key; it reads and writes only through two anon-callable `SECURITY DEFINER` functions guarded by a dedicated token (`ingest_push` pattern).
- The `forecast` view variant carries only formatted Polish labels, not a number: the central figure is read from the raw body at `src/lib/services/bill-forecast.ts:364`, so the view gains a numeric `centralPln` (Phase 3) and every guard stays in front of it.
- Rules are multi-row per owner with no natural key (unlike a note per day), so edit and delete target the row `id`, which must become client-readable, unlike `day_notes`.
- `ingest_pushes` is pruned after 14 days (`20260923101001_push_ingestion.sql:147`), so a `live_stale` rule with no push on record for 14 days sees an empty snapshot; that is an alarm, not "cannot evaluate".

## What We're NOT Doing

- Playwright e2e: a separate follow-up change through `/10x-e2e-setup` and `/10x-e2e`.
- Email delivery, other channels, other rule kinds (recommendation staleness, battery level, daily digest), per-rule destinations.
- Any homelab-2 change: no lab timer, no lab bot change, no Uptime Kuma change. The app reuses the lab's existing bot (owner's decision, 2026-10-06) but only ever calls `sendMessage`: it never polls `getUpdates`, sets a webhook or runs commands, so the lab bot keeps working unchanged.
- A client-side (React) rules UI, or alert history/log tables.
- Alerting on a forecast that is `unavailable`, `no_data` or stale: it is "cannot evaluate", never an alarm.
- Multi-owner support: the evaluator assumes the single owner and one Telegram chat id.
- pg_cron / pg_net, and a lab-side sender.

## Implementation Approach

Four phases, each testable alone: (1) data layer and token, (2) owner CRUD in the app, (3) evaluator and Telegram, (4) scheduling, docs and production steps. Defaults I chose without asking, recorded here for review: the existing lab bot is reused for delivery (owner's decision, 2026-10-06: one bot for everything; the owner copies its `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `/srv/homelab/telegram-home/.env` on docker-core (the same two keys `homelab-2/infra/compose/monitoring/kuma-apply.sh` reads over SSH) into the app's `.env.runtime`, nothing is written to the repo); accepted risk: the same token then lives on the public Mikrus VPS as well as docker-core, and rotating it means updating the lab bot, Uptime Kuma and the app together; reminder default 6 h, range 1-72; unique `(user_id, kind, threshold)` so duplicate rules are refused; strict `>` comparisons (exactly on the line is not an alarm, matching `live-state.ts`); a forecast flagged `isOtherMonth` is "cannot evaluate"; `live_stale` accepts 15-1440 minutes (the app's own stale line is 15); `live_stale` with no push on record is an alarm and a `captured_at` more than 5 minutes in the future is "cannot evaluate"; send first, then record state, so a failed send is retried on the next run instead of being marked as notified; if the Telegram secrets are missing the route answers 503 and records nothing.

## Phase 1: Data layer and alerts token

### Overview

One migration adds the owner-only `alert_rules` table, a separate `alert_tokens` table and two anon-callable `SECURITY DEFINER` functions, plus a mint script and the integration coverage.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261007090000_alert_rules.sql`

**Intent**: Create the rules table and the token table with the same hardening as `day_notes` and `ingest_tokens`, and two functions the evaluator uses instead of a session.

**Contract**:

- `alert_rules`: `id bigint identity`, `user_id uuid default auth.uid()` (FK `auth.users` on delete cascade), `kind` check in (`live_stale`,`bill_above`), `threshold numeric` with a per-kind check (`live_stale`: whole minutes 15-1440; `bill_above`: 1-7000 PLN), `label text null` (≤ 60, not blank when set), `enabled boolean default true`, `renotify_hours int` check 1-72 default 6, evaluator-owned columns `state` check in (`ok`,`alarm`) default `ok`, `last_notified_at`, `last_evaluated_at`, `unevaluable_reason text null`, `created_at`, `updated_at`; `unique (user_id, kind, threshold)`; the `updated_at` trigger as in `day_notes`, plus a second BEFORE UPDATE trigger that resets `state` to `ok` and clears `unevaluable_reason` whenever `enabled` or `threshold` changes (so a re-enabled or edited rule never inherits a stale alarm).
- RLS enabled, `revoke all` from anon/authenticated; column grants: select everything except `user_id`; insert (`kind`,`threshold`,`label`,`enabled`,`renotify_hours`); update (`threshold`,`label`,`enabled`,`renotify_hours`) — `kind` and the evaluator-owned columns are not client-writable; delete. Four per-operation owner policies (`user_id = auth.uid()` plus the `app_owners` check), to `authenticated` only.
- `alert_tokens`: same shape as `ingest_tokens` (`label` unique, `token_hash bytea` unique, `revoked_at`), RLS enabled, all client privileges revoked.
- `alerts_snapshot(p_token text) returns jsonb`: `stable security definer set search_path = ''`; checks the token against `alert_tokens` (raise `P0401` on a miss, same error for unknown and revoked); returns the enabled rules, the newest `homelab` push for the live state (`captured_at`, `received_at`, `payload->'state'`) and the newest `homelab` push that has a `bill_forecast` key (same columns, `payload->'bill_forecast'`), selected straight from `public.ingest_pushes` with the filters the `live_state` / `bill_forecast` views use (no existing definer function reads those `security_invoker` views), in the row shape the loaders produce so the existing mappers apply. Revoke from public/anon/authenticated, then grant execute to anon.
- `alerts_record(p_token text, p_results jsonb) returns void`: same hardening; accepts an array of `{id, state, notified, reason}`, validates `state`, updates only the evaluator-owned columns of existing rules, ignores unknown ids, sets `last_notified_at = now()` only when `notified` is true.

#### 2. Local seed token

**File**: `supabase/seed.sql`

**Intent**: A public local/CI-only alerts token for smoke on the fresh CI stack, as the ingest seed token does (never a migration, never production). It only exists after a reset or first start, so the integration suite does not rely on it.

**Contract**: one `insert into public.alert_tokens` with a documented non-secret label/secret pair.

#### 3. Token mint script

**File**: `scripts/create-alert-token.mjs`

**Intent**: Mint a production alerts token the way `scripts/create-ingest-token.mjs` does.

**Contract**: prints the token once and only a hash `insert into public.alert_tokens` statement; same label regex as the ingest script.

#### 4. Shared limits and types

**File**: `src/lib/services/alert-rules.ts` (constants only in this phase), `src/types.ts`

**Intent**: One source for the limits (stale minutes range, bill range, label length, reminder range) used by zod now and by the parity test; add `AlertRuleRow`.

**Contract**: exported constants named for the migration checks; `AlertRuleRow` mirrors the client-readable columns.

#### 5. Integration tests

**File**: `tests/integration/alert-rules.test.ts`, `tests/integration/access-abuse.test.ts`, `tests/integration/support/privileged.ts`

**Intent**: Prove the access model and the DB limits against the real stack.

**Contract**:

- Access matrix: add `alert_rules` and `alert_tokens` rows (owner reads/writes rules; anon and non-owner get nothing; `alert_tokens` unreadable by everyone; a positive control for each).
- Column grants: the owner cannot write `kind`, `state`, `user_id` or `last_notified_at`.
- Token tests: unknown, empty and revoked tokens get `P0401` and no data; a token inserted by the test (`insertAlertToken`) works; the ingest seed token is refused by both functions; an alerts token is refused by `ingest_push`.
- Parity: the DB checks reject values just outside the shared constants and accept the edges (`23514`).
- `alerts_record` updates only evaluator-owned columns and never `kind`/`threshold`.
- Changing `enabled` or `threshold` on a rule in `alarm` resets it to `ok` and clears the reason; editing `label` does not.
- Add an `insertAlertToken` helper next to `insertToken`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly to the local Supabase: `scripts/remote-docker.sh exec npx supabase migration up`
- Integration suite passes including the new alert tests: `npm run test:integration`
- Unit tests pass: `npm test`
- Lint and type checks pass: `npm run lint` and `npx astro check`
- The mint script prints a token once and a hash-only `insert`: `node scripts/create-alert-token.mjs alerts-local`

#### Manual Verification:

- Read the migration beside the `day_notes` migration: no grant to anon on either table, `search_path = ''`, and the EXECUTE grants restated on both functions

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Owner CRUD in the app

### Overview

The owner manages rules on `/dashboard/alerts`, following the `day_notes` pattern with no client JS.

### Changes Required:

#### 1. Rules service

**File**: `src/lib/services/alert-rules.ts`

**Intent**: Parse the posted form and orchestrate the write with injected deps, as `day-notes.ts` does.

**Contract**: zod `discriminatedUnion("intent")` with `create` (kind, threshold, label, renotify_hours), `update` (id + same fields), `toggle` (id, enabled) and `delete` (id); `coerce.number` bounds from the shared constants; outcomes `created|updated|toggled|deleted|duplicate|invalid|failed` with Polish notice strings; `handleAlertPost` returns the redirect with `?alert=<outcome>`; a unique violation (`23505`) maps to `duplicate`; deleting or toggling a missing id is not an error (same idempotence as notes).

#### 2. Route

**File**: `src/pages/api/alert-rules.ts`

**Intent**: Cookie-authenticated POST; session check, cookie Supabase client, every answer a 303 back to `/dashboard/alerts`.

**Contract**: `export const prerender = false`; behind the Origin check (never in `TOKEN_AUTH_ROUTES`); no `.select()` after writes.

#### 3. Page and components

**File**: `src/pages/dashboard/alerts.astro`, `src/components/alerts/AlertRulesPanel.astro`, `src/components/alerts/AlertNotice.astro`, `src/components/DashboardHeader.astro` and `AppShell.astro`

**Intent**: List the rules with kind, threshold, label, enabled, state (`ok`/`alarm`), last evaluated and, when set, the "cannot evaluate" reason; a create form; per-rule edit in `<details>`; enable/disable button; delete behind a confirm `<details>`; entry from the dashboard navigation.

**Contract**: a loader `loadAlertRules` (query errors via `queryError`), the `current` union in `DashboardHeader.astro` and `AppShell.astro` gains `alerts` and the header gets the link; one `h1`, labelled controls and a `role="status"` notice badge; Polish copy consistent with the notes UI.

#### 4. Path guards and tests

**File**: `src/lib/auth-outage.ts`, `src/middleware.test.ts`, `src/lib/route-guards.test.ts`, `src/lib/services/alert-rules.test.ts`

**Intent**: A POST to the new route needs a signed-in user, and `/dashboard/alerts` stays under `PROTECTED_ROUTES` through the `/dashboard` prefix.

**Contract**: add the route path next to `NOTES_PATH` in `needsUser`; unit tests for `parseAlertForm`, `handleAlertPost` and the notices with synthetic data and `vi.fn` deps, plus the guard cases.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including form parsing, outcomes and guards: `npm test`
- Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`
- Integration suite still passes: `npm run test:integration`

#### Manual Verification:

- On the local stack, signed in as the owner: create one rule of each kind, edit a threshold, disable one, delete one with the confirmation, and see the matching notice each time
- Signed out, a visit to `/dashboard/alerts` redirects to sign-in and a direct POST to `/api/alert-rules` is refused
- The page has one `h1`, labelled form controls and a visible keyboard focus on every action

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Evaluator and Telegram

### Overview

A pure evaluator decides each rule's outcome and the notification to send; a Telegram sender delivers it; a bearer-token route wires both to the two database functions.

### Changes Required:

#### 1. Numeric figure on the forecast view

**File**: `src/lib/services/bill-forecast.ts`, `src/lib/services/bill-forecast.test.ts`

**Intent**: Give the evaluator the central bill figure without duplicating the view's refusal guards.

**Contract**: the `forecast` variant of `toBillForecastView` gains a numeric `centralPln` (gross PLN, the validated `projected_bill_gross_pln`), set only after every existing guard (freshness, `no_data`, range sanity, `MAX_PLAUSIBLE_BILL_PLN`, `MIN_COMPLETE_DAYS`) has passed. Existing labels and behaviour are unchanged; the `unavailable` reason stays display text and is stored as text only.

#### 2. Pure evaluation

**File**: `src/lib/services/alert-evaluation.ts`

**Intent**: For each enabled rule, compute `ok` / `alarm` / `unknown(reason)` from the snapshot and `now`, then the action given the stored state.

**Contract**:

- `live_stale`: a direct comparison on `captured_at` (it does not go through `toLiveStateView`): alarm when `now - captured_at` is strictly greater than the rule's minutes; no push on record is an alarm; `captured_at` more than 5 minutes ahead is `unknown`, using a new constant of that value in the evaluator (`live-state.ts` has no future-skew rule; the forecast's `FORECAST_FUTURE_SKEW_MS` is not shared).
- `bill_above`: evaluates only when `toBillForecastView` returns `kind === "forecast"` and the forecast is not `isOtherMonth`; alarm when `centralPln` is strictly above the threshold; every other kind, and an `isOtherMonth` forecast, is `unknown` with the view's reason (text).
- Action table: `unknown` → no message, keep stored state, record the reason; `ok→alarm` → alarm message; `alarm→alarm` → reminder only when `now - last_notified_at ≥ renotify_hours`; `alarm→ok` → recovery message; `ok→ok` → nothing. Messages are deterministic Polish text built from the rule (label, kind, threshold, the observed value); no LLM.

#### 3. Telegram sender

**File**: `src/lib/services/telegram.ts`

**Intent**: One `sendMessage` call with an injected `fetch`, a 10 s timeout and no secret in any log.

**Contract**: `sendTelegramMessage(deps, {token, chatId, text}) → {ok} | {ok:false, code}`; the token sits in the request URL, so errors are reduced to a status code or `timeout`/`network`, never the URL or response body.

#### 4. Evaluate service and route

**File**: `src/lib/services/alerts-evaluate.ts`, `src/pages/api/alerts/evaluate.ts`, `src/middleware.ts`, `astro.config.mjs`, `.env.example`

**Intent**: `POST /api/alerts/evaluate` reads the bearer token, calls `alerts_snapshot`, evaluates, sends, then calls `alerts_record` with what actually went out.

**Contract**: `TOKEN_AUTH_ROUTES` gains `/api/alerts/evaluate` (exact path), and the "currently `/api/ingest`" note in `CLAUDE.md` is updated in Phase 4; a uniform 401 for a missing or wrong token before any work (as `services/ingest.ts`); 503 `telegram_not_configured` with nothing recorded when `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is missing; both are `envField.string({ context: "server", access: "secret", optional: true })`; a failed send leaves that rule's state unrecorded so the next run retries; the JSON answer carries counts only (`evaluated`, `sent`, `unknown`, `failed`); logging through `locals.log` with no token, chat id or message text.

#### 5. Tests and smoke

**File**: `src/lib/services/alert-evaluation.test.ts`, `src/lib/services/telegram.test.ts`, `src/lib/services/alerts-evaluate.test.ts`, `src/middleware.test.ts`, `src/lib/route-guards.test.ts`, `tests/integration/alerts-evaluate.test.ts`, `scripts/smoke.mjs`, `stryker.config.mjs`

**Intent**: Cover the transition table and the real path with a fake Telegram.

**Contract**: unit — every cell of the action table, both boundaries (exactly on the line is not an alarm), the unknown cases for each non-`forecast` view kind and for `isOtherMonth`, the no-push alarm, the future-skew case, the reminder interval edge; the sender never leaks the token; the route returns 401/503 as specified; the exact-set assertions for `TOKEN_AUTH_ROUTES` in `src/middleware.test.ts` (the exempt-set test and its near-miss list) and `src/lib/route-guards.test.ts` (`toEqual(["/api/ingest"])`) now list both paths. `stryker.config.mjs` adds `alert-evaluation.ts` and the parse code in `alert-rules.ts` to its explicit `mutate` list; `telegram.ts` stays out. Integration — push a live state and a forecast through the real `ingest_push`, create rules as the owner, call the service with a token the test inserts and a fake fetch: alarm, no repeat inside the interval, reminder after it, recovery, and an unknown rule that keeps its state; a failed send is retried. Smoke — the route refuses a missing and a wrong token.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the full action table and sender: `npm test`
- Integration tests pass, including alarm, reminder, recovery and unknown: `npm run test:integration`
- Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`
- Smoke refuses a missing and a wrong token on the evaluate route: `npm run smoke`

#### Manual Verification:

- With a real bot token and chat id in a local `.env`, a rule below the current forecast produces one Telegram message and raising it produces one recovery message
- The local server log for that run contains no bot token, chat id or message text

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Scheduling, docs and production steps

### Overview

A scheduled workflow calls the route, the documentation catches up with the code (`lessons.md`), and the manual production steps are listed and walked through.

### Changes Required:

#### 1. Scheduled workflow

**File**: `.github/workflows/alerts-evaluate.yml`

**Intent**: Every 10 minutes (and on demand) POST to the evaluate route with the alerts token.

**Contract**: `schedule` plus `workflow_dispatch`; the job runs only when the repository variable `ALERTS_ENABLED` is `'true'`, which is the last production step, so merging the workflow cannot produce red runs before the migration, deploy, token and secrets exist; one `curl --fail-with-body` step with no third-party action; token from a repository secret, base URL from a repository variable; a `concurrency` group so runs never overlap; `permissions: {}`. A failed run (route down, 401, 503) shows red in GitHub.

#### 2. Documentation

**File**: `docs/prerequisites.md`, `docs/logic.md`, `docs/decisions.md`, `docs/architecture.md`, `README.md`, `.env.example`, `CLAUDE.md` (`AGENTS.md` is a symlink to it, so one edit)

**Intent**: Keep the docs in step with the code, as `context/foundation/lessons.md` requires, and name every prerequisite outside the repo.

**Contract**:

- `prerequisites.md`: secrets table rows for `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (`.env.runtime` on the VPS), the alerts token (GitHub repository secret; its hash in production `alert_tokens`) and the repository variable; one-time production steps in order — apply the migration before deploying, mint and insert the token, copy the lab bot's `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `/srv/homelab/telegram-home/.env` on docker-core into `.env.runtime` under the same names, and record the app as a new consumer of that token in homelab-2 (docs only; its AGENTS.md asks for documented secret locations) (the secrets table notes that the token is shared with the lab bot and Uptime Kuma, so a rotation touches all three), add the repo secret and the `APP_ORIGIN`-style base-URL variable, verify Mikrus reaches `api.telegram.org`, and only then set `ALERTS_ENABLED=true`.
- `logic.md`: the alert rules section (kinds, strict comparisons, no-push alarm, unknown handling, transitions, reminder, send-then-record).
- `decisions.md`: dated entries — app sends (not the lab), dedicated alerts-token table, GitHub Actions cron, unknown keeps state, the lab bot reused for delivery with its accepted risk.
- `architecture.md`: the new outbound Telegram boundary, the second token route and the alerts token's scope; `CLAUDE.md`: `TOKEN_AUTH_ROUTES` now lists two paths.
- `README.md` env table and `.env.example`: the two new variables.

### Success Criteria:

#### Automated Verification:

- Formatting is clean on the changed docs and workflow: `npx prettier --check docs README.md .github`
- Lint and unit tests still pass: `npm run lint` and `npm test`
- The docs name the new secrets: `grep -c "TELEGRAM_BOT_TOKEN" docs/prerequisites.md README.md .env.example`

#### Manual Verification:

- Mikrus reaches Telegram: from the VPS, `curl -sS -o /dev/null -w '%{http_code}' https://api.telegram.org` answers an HTTP status (read-only check, done by the owner)
- Production steps done in the documented order: migration applied, token minted and inserted, `.env.runtime` secrets set, repository secret and variable added, app deployed, then `ALERTS_ENABLED=true` set last
- A manual `workflow_dispatch` run is green, and a temporary low `bill_above` rule produces an alarm message and, once raised, a recovery message
- A scheduled run appears in the Actions list within about 15 minutes of the first manual run

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

**Addendum (2026-10-06, after the production deploy):** GitHub's scheduler did not start the `*/10` workflow at all in about 80 minutes (the repository's weekly mutation run had started almost 7 hours late), so step 4.7 as written, "a scheduled run appears in the Actions list", cannot be the verification. By the owner's decision the regular trigger became the `alerts-trigger` compose service on the production host (`scripts/alerts-trigger.mjs`, every 5 minutes, token `alerts-vps` in `.env.alerts`), and `alerts-evaluate.yml` is manual only; `ALERTS_ENABLED` is gone. Step 4.7 is therefore verified by the service's log lines (`alerts_trigger`, status 200, about every 5 minutes). The reasons and the rejected options are in `docs/decisions.md` ("alert trigger"). Step 4.6 additionally needs the October forecast to reach 7 complete days (about 8-9 October) before a `bill_above` rule can alarm.

---

## Testing Strategy

### Unit Tests:

- Form parsing and outcomes for the four intents; bounds at both edges of every limit.
- The evaluator's action table, boundaries (strict `>`), no-push alarm, future skew, unknown reasons, reminder interval.
- The Telegram sender: success, non-2xx, timeout, network error, and that no error carries the token.
- Route behaviour (401, 503) with injected deps; middleware and route guards for both new paths.

### Integration Tests:

- Access matrix for both new tables, with positive controls; client column grants.
- Token handling for both functions, including refusal of the ingest token, and of the alerts token by `ingest_push`.
- DB-limit parity with the shared constants.
- The real path: lab push → rules → evaluate with a fake Telegram → state read back (alarm, reminder, recovery, unknown, retry after a failed send).

### Manual Testing Steps:

1. Create rules of both kinds on the local stack and exercise edit, disable and delete.
2. Run the evaluator locally with a real bot and see one alarm and one recovery message.
3. After the production steps, trigger the workflow by hand and watch the cycle with a temporary low threshold, then delete that rule.

## Performance Considerations

A handful of rules and one snapshot read every 10 minutes; the snapshot returns one live row, one forecast row and the rules. The Telegram call has a 10 s timeout, so a slow API cannot hold the route open for the whole workflow window.

## Migration Notes

Additive migration only (two new tables, two functions); no change to `ingest_tokens` or `ingest_push`. Applied by hand to production before the app deploy, since the evaluate route calls the new functions. Rolling back means dropping the two functions and tables; no existing data depends on them.

## References

- Frame brief: none; research was done inline during planning (no `research.md`).
- Similar implementation: `supabase/migrations/20261001072438_day_notes.sql`, `src/lib/services/day-notes.ts:36-120`, `src/pages/api/notes.ts`, `src/components/history/DayNotePanel.astro`
- Token route pattern: `src/middleware.ts:15-23`, `src/pages/api/ingest.ts`, `src/lib/services/ingest.ts`, `supabase/migrations/20261006130000_ingest_token_ok.sql`
- Rule inputs: `src/lib/services/live-state.ts:14-16,350-390`, `src/lib/services/bill-forecast.ts:16-28,286-323`, `docs/logic.md:29,255`
- Existing alerting: `context/foundation/existing-system.md:70-71`; homelab-2 `runbooks/proxmox-nic-hang-and-alerting.md`
- Lessons applied: `context/foundation/lessons.md` (prerequisites, docs in step, plan before implementing)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer and alerts token

#### Automated

- [x] 1.1 Migration applies cleanly to the local Supabase: `scripts/remote-docker.sh exec npx supabase migration up` — 70d571a
- [x] 1.2 Integration suite passes including the new alert tests: `npm run test:integration` — 70d571a
- [x] 1.3 Unit tests pass: `npm test` — 70d571a
- [x] 1.4 Lint and type checks pass: `npm run lint` and `npx astro check` — 70d571a
- [x] 1.5 The mint script prints a token once and a hash-only `insert`: `node scripts/create-alert-token.mjs alerts-local` — 70d571a

#### Manual

- [x] 1.6 Read the migration beside the `day_notes` migration: no grant to anon on either table, `search_path = ''`, and the EXECUTE grants restated on both functions — 70d571a

### Phase 2: Owner CRUD in the app

#### Automated

- [x] 2.1 Unit tests pass, including form parsing, outcomes and guards: `npm test` — 03ecca7
- [x] 2.2 Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build` — 03ecca7
- [x] 2.3 Integration suite still passes: `npm run test:integration` — 03ecca7

#### Manual

- [x] 2.4 On the local stack, signed in as the owner: create one rule of each kind, edit a threshold, disable one, delete one with the confirmation, and see the matching notice each time — 03ecca7
- [x] 2.5 Signed out, a visit to `/dashboard/alerts` redirects to sign-in and a direct POST to `/api/alert-rules` is refused — 03ecca7
- [x] 2.6 The page has one `h1`, labelled form controls and a visible keyboard focus on every action — 03ecca7

### Phase 3: Evaluator and Telegram

#### Automated

- [x] 3.1 Unit tests pass, including the full action table and sender: `npm test` — 128e6c7
- [x] 3.2 Integration tests pass, including alarm, reminder, recovery and unknown: `npm run test:integration` — 128e6c7
- [x] 3.3 Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build` — 128e6c7
- [x] 3.4 Smoke refuses a missing and a wrong token on the evaluate route: `npm run smoke` — 128e6c7

#### Manual

- [x] 3.5 With a real bot token and chat id in a local `.env`, a rule below the current forecast produces one Telegram message and raising it produces one recovery message — 128e6c7
- [x] 3.6 The local server log for that run contains no bot token, chat id or message text — 128e6c7

### Phase 4: Scheduling, docs and production steps

#### Automated

- [x] 4.1 Formatting is clean on the changed docs and workflow: `npx prettier --check docs README.md .github` — 9a592c6
- [x] 4.2 Lint and unit tests still pass: `npm run lint` and `npm test` — 9a592c6
- [x] 4.3 The docs name the new secrets: `grep -c "TELEGRAM_BOT_TOKEN" docs/prerequisites.md README.md .env.example` — 9a592c6

#### Manual

- [x] 4.4 Mikrus reaches Telegram: from the VPS, `curl -sS -o /dev/null -w '%{http_code}' https://api.telegram.org` answers an HTTP status (read-only check, done by the owner)
- [x] 4.5 Production steps done in the documented order: migration applied, token minted and inserted, `.env.runtime` secrets set, repository secret and variable added, app deployed, then `ALERTS_ENABLED=true` set last
- [ ] 4.6 A manual `workflow_dispatch` run is green, and a temporary low `bill_above` rule produces an alarm message and, once raised, a recovery message
- [x] 4.7 A scheduled run appears in the Actions list within about 15 minutes of the first manual run
