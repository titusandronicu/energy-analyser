# Push Ingestion Endpoint Implementation Plan

## Overview

Add `POST /api/ingest`, the only way data enters Energy Analyser. The home lab's existing 5-minute refresh job pushes a versioned, public-safe payload (live state, optionally today's narrated recommendation, and recent daily energy history). The app validates it, and a Postgres `SECURITY DEFINER` function authenticates the bearer token and stores it idempotently, without a Supabase service-role key. This is roadmap foundation F-01; it unlocks S-02 (live state), S-03 (recommendation, the north star) and S-04 (seasonal insight).

## Current State Analysis

- No database schema exists: `supabase/migrations/` is empty; `supabase/config.toml` is configured for local development.
- The only Supabase client is cookie-bound (`src/lib/supabase.ts:25`) and refuses service-role keys (`src/lib/supabase.ts:4`), so writes must use the anon key.
- Middleware rejects every mutating `/api/*` request whose `Origin` differs from `APP_ORIGIN` (`src/middleware.ts:9-16`). A server-to-server push has no browser Origin and would get 403.
- There is no unit-test framework. CI (`.github/workflows/ci.yml`) runs lint, `astro check`, build, and `scripts/smoke.mjs` against a local Supabase started with `npx supabase start`.
- The home lab (homelab-2, `infra/compose/energy-app/scripts/build-energy-agent-briefing.py:311`) already produces a bundle with `generated_at`, `language: "pl"`, `current_state` (pv_w, home_load_w, grid_w, battery_soc_pct, battery_w, pv_today_kwh, grid_import/export_today_kwh, forecast_*), `balance_today`, `sanity_checks`, `local_findings`, a `safety` block and a `prompt`. It has forecast kWh but no explicit forecast-confidence field. `refresh-energy-agent-data.sh` runs every 5 minutes.

## Desired End State

- The home lab (or a fixture script) can `POST /api/ingest` with `Authorization: Bearer <token>` and a v1 JSON payload, and gets:
  - `201 {"status":"created"}` for a new capture time,
  - `200 {"status":"duplicate"}` for an identical re-send,
  - `409` for the same capture time with different content,
  - `401` for a missing, unknown or revoked token,
  - `413` over 256 KB, `400` for malformed JSON, `422` for schema violations (with the first issue path),
  - `503` when Supabase is not configured.
- Stored data: raw pushes (kept 14 days, pruned on insert), one row per local day of energy totals (latest push wins for that day), and one row per distinct recommendation `generated_at`.
- Anonymous and authenticated clients cannot read or write any of these tables directly; the only anon capability is executing `ingest_push`.
- The v1 contract is defined once in zod, exported to a committed JSON Schema + example payload for homelab-2, and a test fails if the committed export drifts.
- No new environment variables and no new app secrets. Tokens live only as SHA-256 hashes in the database.

Verify with: `npm test`, `npm run lint`, `npx astro check`, `npm run build`, and the extended smoke run in CI against local Supabase.

### Key Discoveries:

- Origin check to exempt: `src/middleware.ts:9`.
- Supabase anon-key guard to reuse for a cookie-less client: `src/lib/supabase.ts:4-23`.
- API route pattern (uppercase exports, zod, `prerender = false`): `src/pages/api/health.ts:4`, `src/pages/api/auth/signin.ts`.
- Smoke runner pattern (zero-dependency step table): `scripts/smoke.mjs:37`.
- Lab bundle shape the contract mirrors: homelab-2 `build-energy-agent-briefing.py:311-372`.
- zod is v4 (`package.json`), which ships `z.toJSONSchema()`, so no extra dependency is needed for the export.

## What We're NOT Doing

- No UI, pages or read policies for the stored data — S-02/S-03/S-04 add authenticated read access and views as they consume it.
- No season-adjusted baseline or anomaly logic (S-04).
- No homelab-2 changes; this plan only hands over the contract. The push step is a separate homelab-2 change.
- No rate limiting beyond the token check and size cap (single trusted pusher, 5-minute cadence).
- No forecast-confidence modelling; `recommendation.forecast.confidence` is optional in v1 and S-03 decides how to show its absence.
- No admin UI for tokens; creation and revocation are an owner runbook step (SQL in the Supabase dashboard).
- No service-role key, no direct Postgres connection, no scheduler.

## Implementation Approach

Contract first, so both repos can work against the same artifact. The database owns authentication and idempotency in one transaction: the endpoint only enforces transport concerns (size, JSON, schema) and passes the raw bearer token and the validated payload to `ingest_push`. Keeping the token check inside Postgres means rotation is a row change with no redeploy, and the anon role can do exactly one thing.

## Critical Implementation Details

- **Idempotency identity.** Compare payloads by hashing the `jsonb` value's canonical text inside Postgres (`jsonb` normalises key order and whitespace), not the raw request body. Otherwise a re-serialised but equal payload would be misread as a 409 conflict.
- **Token failure must look uniform.** Missing, unknown and revoked tokens all return the same 401 body, and the endpoint must not reveal which case applied.
- **Local day for daily history.** `daily_history[].day` is the Europe/Warsaw calendar date as sent by the lab. The app stores it as a `date` and never re-derives it from UTC timestamps.
- **Order in the function:** verify the token → check for a duplicate/conflict → insert the raw push → upsert daily rows → insert the recommendation if new → prune raw pushes older than 14 days. All of this runs in one transaction, so a rejected push leaves no partial rows.

## Phase 1: Contract and test tooling

### Overview

Define the v1 push contract in zod, export it for homelab-2, and add Vitest so the contract and later handler logic have fast tests.

### Changes Required:

#### 1. Vitest setup

**File**: `package.json`, `vitest.config.ts`

**Intent**: Add Vitest as a dev dependency with a `test` script so pure TypeScript modules can be unit-tested; resolve the `@/*` alias the same way as `tsconfig.json`.

**Contract**: `npm test` runs `vitest run`; tests live next to their module as `*.test.ts`.

#### 2. Ingest contract module

**File**: `src/lib/ingest/contract.ts`

**Intent**: Single source of truth for the v1 payload. Strict objects (unknown keys rejected) keep private fields from slipping through if the lab bundle grows.

**Contract**: exports `ingestPayloadV1` (zod) and `type IngestPayloadV1`. Shape:

- envelope: `contract_version: 1` (literal), `source: "homelab"` (literal), `captured_at` (ISO 8601 datetime with offset).
- `state` (required): `pv_w`, `home_load_w`, `grid_w`, `battery_w`, `battery_soc_pct` (0–100), `pv_today_kwh`, `grid_import_today_kwh`, `grid_export_today_kwh`: each a finite number or `null`; `source_health` (short string or `null`). Sign conventions are documented: grid positive = import, battery positive = discharge.
- `recommendation` (optional): `generated_at` (datetime), `language` (`"pl"`), `text` (1–4000 chars), `provider` (`"ha_conversation" | "ollama" | "openrouter"`), `model` (≤100 chars), `forecast` { `today_kwh`, `tomorrow_kwh`: number|null, `confidence`: optional `"low" | "medium" | "high"` }, `facts` (strict object: `current_state`, `balance_today` as records of number|string|boolean|null, `local_findings` and `sanity_checks` as arrays of such records, max 50 items each). The lab's `prompt`, `comparison_values` and `safety` are deliberately not accepted.
- `daily_history` (optional): array of at most 62 `{ day: "YYYY-MM-DD", pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh }`, where the energy values are non-negative numbers or `null`, and each `day` is unique within the array.
- `captured_at` must not be more than 5 minutes in the future or older than 14 days relative to validation time (enforced as a refinement with an injectable clock for tests).

#### 3. Contract export for homelab-2

**File**: `docs/ingest/contract-v1.schema.json`, `docs/ingest/example-v1.json`, `scripts/export-ingest-contract` (implementer's choice of runner), `src/lib/ingest/contract.test.ts`

**Intent**: Give homelab-2 a machine-readable schema and a known-good example without it depending on this repo's code, and stop the committed files from drifting silently.

**Contract**: `npm run contract:export` regenerates both files from `ingestPayloadV1` (JSON Schema via `z.toJSONSchema`). The test asserts that (a) the example parses, (b) the generated schema equals the committed file.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Contract tests cover: valid example accepted; unknown top-level and nested keys rejected; `prompt` inside `facts` rejected; `battery_soc_pct` 101 rejected; future and >14-day-old `captured_at` rejected; duplicate `day` in `daily_history` rejected; payload without `recommendation`/`daily_history` accepted
- Committed JSON Schema matches the zod export (drift test)
- Lint and type checks pass: `npm run lint` and `npx astro check`

#### Manual Verification:

- The example payload is recognisably the lab's bundle shape, and contains no private identifiers or network details

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Database schema and ingest function

### Overview

The first migration: tables for tokens, raw pushes, daily energy and recommendations; RLS on everything with no client policies; and the `ingest_push` function as the only anon entry point.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_push_ingestion.sql`

**Intent**: Create storage and the authenticated, idempotent write path in one transaction-safe function.

**Contract**:

- `ingest_tokens`: `id`, `label` (unique), `token_hash` (bytea, SHA-256, unique), `created_at`, `revoked_at` (null = active). Multiple active rows are allowed, so rotation is: add new → switch lab → revoke old.
- `ingest_pushes`: `id`, `source`, `captured_at` (timestamptz), `contract_version`, `payload_hash` (bytea), `payload` (jsonb), `received_at`, `token_id` (FK); unique `(source, captured_at)`.
- `daily_energy`: `day` (date, PK), `pv_kwh`, `load_kwh`, `grid_import_kwh`, `grid_export_kwh` (numeric, nullable), `updated_at`, `push_id` (FK, on delete set null). Kept indefinitely.
- `recommendations`: `id`, `generated_at` (unique), `language`, `text`, `provider`, `model`, `forecast` (jsonb), `facts` (jsonb), `created_at`, `push_id` (FK, on delete set null). Kept indefinitely; S-05 feedback will reference `id`.
- RLS enabled on all four tables, with no policies (reads are added by the consuming slices).
- `public.ingest_push(p_token text, p_payload jsonb) returns jsonb`: `SECURITY DEFINER`, `SET search_path = ''`, fully schema-qualified, hashing with `extensions.digest`. `EXECUTE` revoked from `public` and granted only to `anon`. It returns `{"status":"created"}` or `{"status":"duplicate"}`, and raises distinct SQLSTATEs the endpoint maps to HTTP codes:

```sql
-- errcodes the API layer relies on
raise exception 'invalid ingest token'  using errcode = 'P0401';
raise exception 'capture time conflict' using errcode = 'P0409';
```

- Behaviour: an unknown or revoked hash → P0401. An existing `(source, captured_at)` with an equal `payload_hash` → duplicate, with no writes and no pruning. The same time with a different hash → P0409. Otherwise it inserts the push, upserts every `daily_history` row by `day` (overwriting with the newer push's values), inserts the recommendation `on conflict (generated_at) do nothing`, and deletes `ingest_pushes` with `captured_at < now() - interval '14 days'`.

#### 2. Local/CI seed token

**File**: `supabase/seed.sql`

**Intent**: Make local development and CI able to push with a known, clearly fake token. `seed.sql` runs only on local `supabase start`/`db reset`, never on production `db push`.

**Contract**: inserts one `ingest_tokens` row labelled `local-dev` whose hash matches the documented test token `local-dev-ingest-token-not-secret`.

#### 3. Token creation helper

**File**: `scripts/create-ingest-token.mjs`

**Intent**: Let the owner mint a production token without the app or any service-role key: it prints a random 32-byte token (base64url) once, plus the SQL `insert` of its SHA-256 hash to paste into the Supabase SQL editor.

**Contract**: `node scripts/create-ingest-token.mjs <label>` → stdout: the token and a single `insert into public.ingest_tokens …` statement. It writes nothing to disk.

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local DB: `npx supabase db reset` (via `scripts/remote-docker.sh exec` per dev-hub conventions)
- Anon cannot select or insert on any of the four tables directly (asserted in the Phase 4 smoke run)
- Lint passes: `npm run lint`

#### Manual Verification:

- In the local Supabase, calling `ingest_push` with the seed token and the example payload returns `created`, then `duplicate` on repeat
- `create-ingest-token.mjs` output inserts cleanly and the new token is accepted

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Ingest endpoint and middleware exemption

### Overview

The HTTP surface: transport checks, schema validation, the RPC call, and status-code mapping.

### Changes Required:

#### 1. Cookie-less anon client

**File**: `src/lib/supabase.ts`

**Intent**: Add a server-side Supabase client with no cookie/session handling for machine callers, reusing the existing anon-key guard.

**Contract**: `createAnonClient(): SupabaseClient | null` (null when not configured), with `persistSession: false` and `assertAnonKey` applied.

#### 2. Ingest service

**File**: `src/lib/services/ingest.ts`, `src/lib/services/ingest.test.ts`

**Intent**: Keep the route thin and make the mapping testable without HTTP: parse the bearer token, enforce the size cap, parse JSON, validate with `ingestPayloadV1`, call `ingest_push`, and map the outcome.

**Contract**: `handleIngest(request: Request, deps: { rpc, now }) → { status: number, body: object }`. Mapping: no/blank bearer → 401; body > 262 144 bytes (checked on the actual bytes read, not just `Content-Length`) → 413; bad JSON → 400; zod failure → 422 with `{ error, path }` of the first issue; P0401 → 401; P0409 → 409; `created` → 201; `duplicate` → 200; any other error → 500 with a generic body (details logged server-side, never echoed). All 401s share one body.

#### 3. API route

**File**: `src/pages/api/ingest.ts`

**Intent**: Expose `POST` only, delegating to `handleIngest` with `createAnonClient` and the real clock; 503 when the client is null.

**Contract**: `export const prerender = false`; `export const POST: APIRoute`; JSON responses with `Cache-Control: no-store`.

#### 4. Middleware exemption

**File**: `src/middleware.ts`

**Intent**: Skip the Origin check and the per-request `getUser()` lookup for `/api/ingest` only. It is bearer-authenticated, sends no cookies, and so is not exposed to CSRF.

**Contract**: an exact-path check for `/api/ingest`; every other `/api/*` route keeps the current behaviour.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`, covering every row of the status mapping with a stubbed `rpc`, including a body just over and just under the size cap
- Lint, type check and build pass: `npm run lint`, `npx astro check`, `npm run build`
- Existing auth smoke steps still pass (Origin check unchanged for `/api/auth/*`)

#### Manual Verification:

- Against `npm run dev` + local Supabase, a `curl` with the seed token and the example payload returns 201, then 200 on repeat

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: End-to-end verification and homelab-2 handoff

### Overview

Prove the whole path against a real database in CI, give the owner a fixture push, and document the contract for the homelab-2 change.

### Changes Required:

#### 1. Smoke cases

**File**: `scripts/smoke.mjs`

**Intent**: Add ingest steps that run against the local Supabase in CI with the seed token. Each run uses a unique `captured_at` so the steps stay re-runnable.

**Contract**: new steps: no token → 401; wrong token → 401; valid payload → 201; identical re-send → 200; same time with changed state → 409; unknown field → 422; oversized body → 413; `/api/ingest` without an `Origin` header is not rejected with 403; anon REST `select` on `ingest_pushes` returns no rows or is denied. Ingest steps send JSON rather than forms, so the `request` helper gains a JSON body option.

#### 2. Fixture push script

**File**: `scripts/push-fixture.mjs`

**Intent**: Let the owner push `docs/ingest/example-v1.json` (with `captured_at` set to now) to any environment, to verify a deployment before homelab-2 is wired.

**Contract**: `BASE_URL=… INGEST_TOKEN=… node scripts/push-fixture.mjs` prints the status and body. The token is read from the environment only.

#### 3. Contract README

**File**: `docs/ingest/README.md`

**Intent**: The handoff for the homelab-2 push change: the endpoint, headers, response codes, idempotency and retry rules (retry on 5xx/network errors with the same payload; never retry 4xx), cadence, what must never be sent, the token creation/rotation/revocation runbook, and how to bump `contract_version`.

**Contract**: links to `contract-v1.schema.json` and `example-v1.json`; contains no real token, host or IP.

#### 4. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Run `npm test` in the `ci` job. The smoke job already starts local Supabase, which now applies the migration and seed.

**Contract**: one added step `npm test` after lint.

### Success Criteria:

#### Automated Verification:

- CI `ci` job passes, including `npm test`
- CI `smoke` job passes, including all new ingest steps against local Supabase

#### Manual Verification:

- After a production deploy and a production token has been created, `push-fixture.mjs` returns 201, and the row is visible in the Supabase table editor
- `docs/ingest/README.md` is enough to write the homelab-2 push step without reading this repo's code

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Contract: acceptance of the example, strictness (unknown keys at every level), bounds, time-window refinement with an injected clock, uniqueness of `daily_history` days.
- Service: every status-mapping branch with a stubbed RPC; size cap on bytes read; 401 bodies identical.

### Integration Tests:

- Smoke against local Supabase in CI: real token hashing, duplicate vs conflict via `jsonb` hashing, direct anon table access denied, Origin exemption only for `/api/ingest`.

### Manual Testing Steps:

1. `npx supabase db reset`, then `npm run dev`.
2. `BASE_URL=http://localhost:4321 INGEST_TOKEN=local-dev-ingest-token-not-secret node scripts/push-fixture.mjs` → 201; run the same `captured_at` again → 200.
3. Edit one state value and re-send with the same `captured_at` → 409.
4. Check `daily_energy` and `recommendations` rows in Supabase Studio.

## Performance Considerations

One push every 5 minutes, at most 256 KB, one RPC per push. Pruning is an indexed delete on `captured_at`, usually removing zero or one rows. Nothing affects page latency.

## Migration Notes

This is the first migration, so there's no existing data. The production rollout order is: apply the migration (`supabase db push`), deploy the app, create a production token with `create-ingest-token.mjs`, verify with `push-fixture.mjs`, then hand the token to the homelab-2 push change. `seed.sql` is never applied to production.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-01)
- Push design constraints: `context/foundation/infrastructure.md` ("Home-lab integration: push ingestion")
- Existing system: `context/foundation/existing-system.md`
- Lab bundle shape: homelab-2 `infra/compose/energy-app/scripts/build-energy-agent-briefing.py:311`
- Route pattern: `src/pages/api/health.ts:4`; Origin check: `src/middleware.ts:9`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Contract and test tooling

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — ebe3b5c
- [x] 1.2 Contract tests cover acceptance, strictness, bounds, time window and optional sections — ebe3b5c
- [x] 1.3 Committed JSON Schema matches the zod export (drift test) — ebe3b5c
- [x] 1.4 Lint and type checks pass: `npm run lint` and `npx astro check` — ebe3b5c

#### Manual

- [x] 1.5 Example payload matches the lab bundle shape and contains no private identifiers — ebe3b5c

### Phase 2: Database schema and ingest function

#### Automated

- [x] 2.1 Migration applies on a clean local DB: `npx supabase db reset`
- [x] 2.2 Anon cannot select or insert on the four tables directly (asserted in Phase 4 smoke)
- [x] 2.3 Lint passes: `npm run lint`

#### Manual

- [x] 2.4 `ingest_push` with seed token returns created, then duplicate
- [x] 2.5 `create-ingest-token.mjs` output inserts cleanly and the token is accepted

### Phase 3: Ingest endpoint and middleware exemption

#### Automated

- [ ] 3.1 Unit tests cover every status-mapping branch including size-cap boundaries
- [ ] 3.2 Lint, type check and build pass
- [ ] 3.3 Existing auth smoke steps still pass

#### Manual

- [ ] 3.4 curl against dev server returns 201, then 200 on repeat

### Phase 4: End-to-end verification and homelab-2 handoff

#### Automated

- [ ] 4.1 CI `ci` job passes including `npm test`
- [ ] 4.2 CI `smoke` job passes including all ingest steps

#### Manual

- [ ] 4.3 Production fixture push returns 201 and the row is visible
- [ ] 4.4 `docs/ingest/README.md` is sufficient to write the homelab-2 push step
