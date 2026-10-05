# Capture Layer Implementation Plan

## Overview

Give Energy Analyser a tracker-agnostic capture layer: one structured JSON logger tagged with a request id, `APP_VERSION` and a new `APP_ENV`; a middleware error boundary; a shared query-error helper that keeps the Postgres code and `cause`; and an honest 503 "sign-in unavailable" response when the auth provider is down. It is fixes 1 to 3 of the observability audit (`context/audits/observability/2026-10-03_1812-lab-push-sign-in-dashboard-reads.md`, section 6) and closes S1, S5, S8, S9, D2, D3, P3 and part of P1. No vendor, no readiness probe, no lab-side change.

## Current State Analysis

- There is no error tracker. Logging is seven raw `console.error` calls into Docker `json-file` logs (10 MB x 3, read by hand): `src/lib/page-load.ts:13`, `src/pages/auth/confirm.ts:19`, `src/pages/api/auth/magic-link.ts:19`, `src/pages/api/auth/signin.ts:18`, `src/pages/api/notes.ts:27` and `:45`, `src/pages/api/ingest.ts:29`. No request id, release or environment on any line.
- Services take an optional `logError?: (message: string, detail: unknown) => void` (`ingest.ts:13`, `magic-link.ts:25,33`, `password-signin.ts:19`, `day-notes.ts:42`). `detail` is `error.message` (a string) at `magic-link.ts:47,68`, `password-signin.ts:38`, `day-notes.ts:112`; a raw object at `ingest.ts:75,82` and `day-notes.ts:116`.
- Thirteen loaders rethrow ``new Error(`<what>: ${error.message}`)`` with no `cause`, dropping the Supabase code, details and hint: `live-state.ts:130,143`, `calendar-data.ts:21,40,58,71,85`, `hourly-usage.ts:102`, `bill-forecast.ts:118`, `recommendation.ts:96`, `period-summary.ts:31,49`, `usage-insight.ts:71`.
- `orLoadError(load)` (`src/lib/page-load.ts:8-16`) logs the bare error and returns null; it has 18 call sites (`dashboard.astro:21,33,39,43,47,51,55,59`; `history.astro:49,102,106,111,118,138,143,148,153,169`) and no test.
- `src/middleware.ts:27-36` reads only `data.user` from `getUser()`; the auth-js client returns `{ data: { user: null }, error }` for a network failure or 5xx (`AuthRetryableFetchError`), so a provider outage reads as signed out and `/dashboard` redirects to sign-in with no log. The Origin 403 (`:22-24`) is unlogged.
- `astro:env/server` does not resolve under vitest (`vitest.config.ts` has only the `@` alias; no stubs). Services avoid it by taking dependencies as arguments; `src/lib/page-load.ts` imports `@/lib/supabase` and so cannot be imported by a test.
- `context.locals` is typed in `src/env.d.ts:1-5` (only `user`). Env vars are declared in `astro.config.mjs:21-29` (`APP_VERSION` default `"development"` at `:26`). `compose.yaml:9` passes `APP_VERSION`; `NODE_ENV` is set only in the Dockerfile and nothing reads it.
- There is no `src/pages/500.astro`; Astro's `handleRequest` already logs a thrown error's stack and renders its default 500.
- No proxy request-id or forwarded-header handling exists anywhere; the Micr.us proxy's forwarded headers are undocumented.

## Desired End State

Every server log line is one JSON object with `ts`, `level`, `event`, `requestId`, `version` (`APP_VERSION`), `env` (`APP_ENV`), the request's `method` and `path`, and, for failures, a serialized `err` with `name`, `message`, `code`, `status`, `details`, `hint`, `stack` and a recursive `cause`. Every response produced by a page, endpoint or middleware outcome carries `X-Request-Id`; Astro's 500 page after an unhandled error does not (the logged line carries the id instead). A failing dashboard card logs which card failed. A failed sign-in logs the route, request id, `emailHash` and the provider's status and code, never an address. When the auth provider is down, `/`, `/dashboard` and the notes POST answer a Polish 503 page (with `Retry-After`, `no-store` and the request id) and log `auth_unavailable`; an anonymous request without a session stays silent. Verified by unit tests for the pure modules plus a manual run against an unreachable Supabase.

### Key Discoveries:

- A pure module with `version`/`environment` injected is the only unit-testable shape (`vitest.config.ts:1-13`; `src/lib/services/magic-link.ts` imports only zod). The middleware stays a thin wrapper.
- `getUser()` never throws for provider failures: it catches `AuthError` and returns it (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2693-2730`), so the error object must be read and classified.
- The 503 is a hand-built `Response`, not a rewrite: rewrite status semantics in Astro 7.3.2 were not verified, and a rewrite would re-enter the failing auth call.
- Loader tests assert `"<what>: <message>"` substrings (`live-state.test.ts:822`, `hourly-usage.test.ts:458`, `bill-forecast.test.ts:41`, `recommendation.test.ts:551`, `usage-insight.test.ts:505`, `period-summary.test.ts:76-78,102-104`), so keeping that message format and adding `cause` breaks none of them.
- Five `toHaveBeenCalledWith` assertions currently expect a bare string detail and must change: `day-notes.test.ts:285,293,303`, `magic-link.test.ts:56`, `password-signin.test.ts:41`. The `toHaveBeenCalled()` ones (`ingest.test.ts:85`, `magic-link.test.ts:84`) survive.

## What We're NOT Doing

- No error tracker or vendor, no log drain, no change to Docker log retention (audit P4).
- No readiness probe, health-check change or deploy-gate change (audit fix 4, findings P2, L6, D1).
- No ingest rejection logging, push identity or 422 detail (audit fix 5, findings L2 to L4); the ingest route only moves onto the new logger.
- No classification of provider failures in the sign-in, magic-link and verify messages (audit fix 7, findings S2 to S4).
- No startup config validation and no logging of the `!supabase` branches (audit fix 8, findings S6, S7).
- No client-side error handlers or error boundary (audit P5), no custom `500.astro` (P6), no lab-side or `homelab-2` change.
- No client IP in logs (owner decision 2026-10-03); no email address in any log line.
- No capture of errors thrown after the first byte of a streamed response body: they surface after `next()` has resolved, so the middleware boundary does not see them (Astro logs them). Frontmatter and loader errors, where this app's failures happen, are caught.

## Implementation Approach

Build bottom-up so each layer exists before anything uses it: the pure logger and request id with the middleware wiring (Phase 1); move the seven log sites and the service payloads onto it (Phase 2); fix the loader error shape and label the dashboard sections (Phase 3); add the auth-outage handling that depends on both the logger and the request id, with its route rule and classification in one pure, unit-tested function (Phase 4); document and prove it end to end (Phase 5). All pure logic lives in `src/lib` with colocated `*.test.ts`; `astro:env/server` is imported only by `middleware.ts`, which builds the root logger.

Owner decisions (2026-10-03): scope is audit fixes 1 to 3; an auth outage shows a 503 page, not a redirect; environment tag via a new `APP_ENV` variable; sign-in failures identified by hashed email only; no new vendor. Defaults chosen in planning, not asked: JSON-lines output; request id generated per request, or taken from an inbound `X-Request-Id` only if it matches `^[A-Za-z0-9._-]{8,64}$` (a forged id only affects log correlation); the 503 applies to `/` (exact), `/dashboard*` and `POST /api/notes`, other routes continue as anonymous; 4xx auth errors other than session-missing (expired or invalid token) are treated as signed out and not logged.

## Phase 1: Logger core and request context

### Overview

A pure structured logger and request-id helper, the `APP_ENV` variable, and the middleware wiring (request id, request-scoped logger on `locals`, `X-Request-Id` header, error boundary, logged Origin 403).

### Changes Required:

#### 1. Structured logger

**File**: `src/lib/logger.ts` (new), `src/lib/logger.test.ts` (new)

**Intent**: One place that turns an event plus fields into a single JSON line, with a faithful error serialization, so every later log call is uniform.

**Contract**: `createLogger({ version, environment, fields?, write?, now? }): Logger` with `Logger = { error(event, fields?), warn(event, fields?), child(fields): Logger }`. Each call writes one JSON line `{ ts, level, event, version, env, ...fields }`. `serializeError(value: unknown)` returns `{ name, message, code?, status?, details?, hint?, stack?, cause? }` for an `Error` or a plain Supabase error object (a `{ message, code, details, hint }` object has no stack), recursing `cause` up to 3 levels and returning `{ value: String(value) }` for anything else; a field named `err` is serialized with it. `emailHash(email: string): string` is the first 8 hex characters of the SHA-256 of the trimmed, lower-cased email. The default `write` is `console.error` with one `eslint-disable-next-line no-console` and a reason (the only console call left in `src` after Phase 2).

#### 2. Request id

**File**: `src/lib/request-id.ts` (new), `src/lib/request-id.test.ts` (new)

**Intent**: Give every request an id for log correlation without trusting arbitrary input.

**Contract**: `requestIdFrom(headers: Headers, generate = () => crypto.randomUUID()): string` returns the inbound `X-Request-Id` only when it matches `^[A-Za-z0-9._-]{8,64}$`, else a generated id.

#### 3. APP_ENV variable

**File**: `astro.config.mjs`, `.env.example`, `compose.yaml`

**Intent**: Tag log lines with the environment. Same pattern as `APP_VERSION`.

**Contract**: add `APP_ENV: envField.string({ context: "server", access: "secret", optional: true, default: "development" })` next to `APP_VERSION` (`astro.config.mjs:26`); `.env.example` gets `APP_ENV=development`; `compose.yaml` environment block gets `APP_ENV: production` (committed, so no VPS secret change). Documentation of the variable is Phase 5.

#### 4. Middleware wiring and locals typing

**File**: `src/middleware.ts`, `src/env.d.ts`

**Intent**: Create the request context once, expose it to every page and route, and log what the middleware itself decides.

**Contract**: `App.Locals` gains `requestId: string` and `log: Logger`. `onRequest` builds a module-level root logger from `APP_VERSION` and `APP_ENV`, then per request: `requestId = requestIdFrom(headers)`, `log = root.child({ requestId, method, path })` where `path` is `context.url.pathname` only, never the query string (`/auth/confirm` carries the one-time `token_hash` and `code` there), sets the two locals, awaits the existing logic, sets `X-Request-Id` on the response, and wraps the whole of it in a try/catch that logs `unhandled_error` with `err` and rethrows (Astro still renders its 500). Astro's own handler logs the same stack again in its text format (`routing/handler.js:102`); the JSON line is the one that carries the request id, and the duplicate is accepted. The foreign-Origin branch logs `origin_rejected` at warn with the expected origin, the received origin capped at 200 characters, and the path. Existing behaviour (token-route exemption, redirect to `/auth/signin`) is unchanged in this phase.

### Success Criteria:

#### Automated Verification:

- Logger and request-id tests pass: `npx vitest run src/lib/logger.test.ts src/lib/request-id.test.ts`
- Linting passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- On `npm run dev`, a page response carries an `X-Request-Id` header, and a request sent with a valid `X-Request-Id` keeps it while an invalid one is replaced

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Replace the seven console.error sites

### Overview

Every log site writes through `locals.log`; services pass the error object so `status` and `code` reach the log; failed sign-ins carry `emailHash`.

### Changes Required:

#### 1. Services pass error objects

**File**: `src/lib/services/magic-link.ts:47,68`, `src/lib/services/password-signin.ts:38`, `src/lib/services/day-notes.ts:112`, and their test files

**Intent**: `logError(message, detail)` keeps its signature, but `detail` becomes the provider's error object instead of `error.message`.

**Contract**: replace `error.message` with `error` at the four call sites; `day-notes.ts:116` and `ingest.ts:75,82` already pass objects. Update the five exact assertions (`day-notes.test.ts:285,293,303`, `magic-link.test.ts:56`, `password-signin.test.ts:41`) to expect the error object (for example `expect.objectContaining({ message: "..." })`, or the same instance for the thrown cause).

#### 2. Routes use the request logger

**File**: `src/pages/auth/confirm.ts`, `src/pages/api/auth/magic-link.ts`, `src/pages/api/auth/signin.ts`, `src/pages/api/notes.ts` (both sites), `src/pages/api/ingest.ts`

**Intent**: Remove all seven `console.error` calls and their eslint-disable comments.

**Contract**: each `logError: (message, detail) => ...` becomes `locals.log.error(message, { err: detail })`; the direct `notes.ts:27` call becomes `locals.log.error("day note post failed", { reason: "supabase_not_configured" })`. In `magic-link.ts` and `signin.ts` the route reads the submitted `email` field before calling the service and logs through `locals.log.child({ emailHash: emailHash(email) })` when it is a non-empty string, so no address is ever logged. The ingest route logs through `locals.log` as well (its existing 500-only logging is otherwise unchanged).

### Success Criteria:

#### Automated Verification:

- Updated service tests pass: `npx vitest run src/lib/services/day-notes.test.ts src/lib/services/magic-link.test.ts src/lib/services/password-signin.test.ts src/lib/services/ingest.test.ts`
- The routes no longer write to the console: `grep -rnE 'console\.(error|warn|log)' src | grep -v '\.test\.ts'` lists only `src/lib/logger.ts` and `src/lib/page-load.ts` (replaced in Phase 3)
- Linting and type check pass: `npm run lint && npx astro check`

#### Manual Verification:

- A failed password sign-in on the dev server writes one JSON line with the route, request id, `emailHash`, and the provider's `status` and `code`, and the line contains no email address
- A failed `/auth/confirm?token_hash=x` writes a log line whose `path` is `/auth/confirm` with no query string

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. The corresponding `- [ ]` checkboxes live in the `## Progress` section.

---

## Phase 3: Loader cause and section labels

### Overview

Loaders keep the Postgres code and `cause`; `orLoadError` says which card failed and carries the request logger.

### Changes Required:

#### 1. Shared query-error helper

**File**: `src/lib/query-error.ts` (new), `src/lib/query-error.test.ts` (new)

**Intent**: One place that builds the rethrown error so the diagnosis survives.

**Contract**: `queryError(what: string, error: { message: string; code?: string; details?: string; hint?: string }): Error` returns ``new Error(`${what}: ${error.message}`, { cause: error })``. The message format is unchanged, which keeps the existing substring assertions passing. Confirm `Error` `cause` type-checks under the repo's TypeScript lib (ES2022); if not, raise `lib` rather than casting.

#### 2. Use it at all 13 loader throws

**File**: `src/lib/services/live-state.ts:130,143`, `calendar-data.ts:21,40,58,71,85`, `hourly-usage.ts:102`, `bill-forecast.ts:118`, `recommendation.ts:96`, `period-summary.ts:31,49`, `usage-insight.ts:71`

**Intent**: Replace each ``throw new Error(`...: ${error.message}`)`` with `throw queryError("...", error)`.

**Contract**: the `what` strings stay exactly as today. Add one assertion in the loader tests that the thrown error's `cause` is the original object, in two loaders (for example `live-state.test.ts` and `calendar-data.test.ts`).

#### 3. Labelled orLoadError on its own pure file

**File**: `src/lib/or-load-error.ts` (new), `src/lib/or-load-error.test.ts` (new), `src/lib/page-load.ts`, `src/pages/dashboard.astro`, `src/pages/dashboard/history.astro`

**Intent**: Make the one logging chokepoint testable and say which section failed.

**Contract**: `orLoadError<T>(section: string, load: () => Promise<T>, log: Logger): Promise<T | null>` catches, calls `log.error("section_load_failed", { section, err })` and returns null. Remove `orLoadError` (and its `console.error`) from `page-load.ts`, which keeps `pageClient`; pages import `orLoadError` from `@/lib/or-load-error`. All 18 call sites pass a stable label and `Astro.locals.log` (for example `dashboard.live-state`, `dashboard.daily-row-time`, `history.daily-range`, `history.day-view`).

### Success Criteria:

#### Automated Verification:

- New helper tests pass: `npx vitest run src/lib/query-error.test.ts src/lib/or-load-error.test.ts`
- Loader tests still pass with the unchanged message format: `npx vitest run src/lib/services`
- No message-only rethrow is left in the loaders: `grep -rnF 'failed: ${error.message}' src/lib/services` returns nothing
- Only the logger itself writes to the console: `grep -rnE 'console\.(error|warn|log)' src | grep -v '\.test\.ts'` lists only `src/lib/logger.ts`
- Linting and type check pass: `npm run lint && npx astro check`

#### Manual Verification:

- With Supabase unreachable on the dev server, the dashboard writes one `section_load_failed` line per failing card, each with its `section`, the request id and the error `cause`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. The corresponding `- [ ]` checkboxes live in the `## Progress` section.

---

## Phase 4: Auth outage handling

### Overview

Read the `getUser()` error, tell an outage from a missing session, answer a 503 on the routes that need a user, and log the outage.

### Changes Required:

#### 1. Classifier, decision and 503 response

**File**: `src/lib/auth-outage.ts` (new), `src/lib/auth-outage.test.ts` (new)

**Intent**: Pure, testable decisions about what an auth error means, which requests need a signed-in user, and what the owner sees, so the middleware only applies the result.

**Contract**: `classifyAuthError(error: { name?: string; status?: number } | null): "outage" | "session-missing" | "other" | null`. `null` for no error; `"session-missing"` for `AuthSessionMissingError`; `"outage"` for `AuthRetryableFetchError`, any `status >= 500`, or `status === 429`; everything else (expired or invalid token) is `"other"`. `decideAuth({ pathname, method, user, error }): { action: "continue" | "redirect-signin" | "unavailable"; logEvent: "auth_unavailable" | null }`: a user-gated request is `pathname === "/"`, a path under `/dashboard`, or `POST /api/notes`; on an `"outage"` a user-gated request is `"unavailable"` with `logEvent: "auth_unavailable"` and any other request is `"continue"` (still logging the outage); with no user and no outage a path under `/dashboard` is `"redirect-signin"`; everything else is `"continue"`, and `"session-missing"` and `"other"` never log. The existing `PROTECTED_ROUTES` constant moves into this module. `unavailableResponse(requestId: string): Response` is a 503 with `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, `Retry-After: 30` and `X-Request-Id`, whose Polish body says sign-in is temporarily unavailable, to retry shortly, and shows the request id; the id is HTML-escaped even though its charset is already restricted.

#### 2. Middleware applies the decision

**File**: `src/middleware.ts`

**Intent**: Stop treating a provider outage as "signed out", with the rule in one place.

**Contract**: read `{ data: { user }, error }` from `getUser()`, set `locals.user`, call `decideAuth`, log `logEvent` through `locals.log` with `err`, and then return `unavailableResponse(requestId)`, `context.redirect("/auth/signin")` or `next()` according to `action`. `index.ts` and `notes.ts` are not changed: the middleware answers before them, and `notes.ts:13` keeps its existing redirect for the no-user case.

### Success Criteria:

#### Automated Verification:

- Classifier, decision and response tests pass: `npx vitest run src/lib/auth-outage.test.ts`
- Full unit suite, lint, type check and build pass: `npm test && npm run lint && npx astro check && npm run build`

#### Manual Verification:

- With Supabase unreachable and a fabricated session cookie, `GET /dashboard` returns 503 with the Polish page, `Retry-After`, `Cache-Control: no-store` and the request id on the page and in the header, and the log has an `auth_unavailable` line whose `err.name` is `AuthRetryableFetchError`
- With no cookie at all, `GET /dashboard` still redirects to `/auth/signin` and writes no log line for the missing session
- `POST /api/notes` during the same outage returns the 503 page
- `GET /` during the same outage returns the 503 page, not a redirect to `/auth/signin`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. The corresponding `- [ ]` checkboxes live in the `## Progress` section.

---

## Phase 5: Docs and verification

### Overview

Record the decision, the variable and the behaviour, as the project lessons require.

### Changes Required:

#### 1. Docs

**File**: `docs/decisions.md`, `docs/architecture.md`, `docs/prerequisites.md`, `README.md`, `CLAUDE.md`

**Intent**: Keep the docs in step with the code.

**Contract**: `docs/decisions.md` gets a dated entry (2026-10-03: JSON logs with request id, version and environment; no tracker yet; auth outage is a 503, not a redirect; hashed email only). `docs/architecture.md` gets a short observability section (logger, request id, error boundary, the 503 rule, what is deliberately not captured). `docs/prerequisites.md`, `README.md` (env table) and `CLAUDE.md` (env var list) name `APP_ENV` (set to `production` by `compose.yaml`, default `development`, no secret). No change to `docs/logic.md` (no rule or threshold changes).

### Success Criteria:

#### Automated Verification:

- `APP_ENV` is named everywhere the env vars are listed: `grep -rl APP_ENV README.md CLAUDE.md .env.example compose.yaml docs/prerequisites.md astro.config.mjs` lists all six files
- Prettier passes on the changed docs: `npx prettier --check README.md CLAUDE.md docs context`

#### Manual Verification:

- `docs/decisions.md` has the dated entry and `docs/architecture.md` describes the logger, the request id and the 503 rule
- After the next production deploy, the first log lines on the VPS show `"env":"production"` and the release SHA as `version`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before considering the change complete. The corresponding `- [ ]` checkboxes live in the `## Progress` section.

---

## Testing Strategy

### Unit Tests:

- Logger: line shape and field order, `child` merges fields, error serialization for `Error`, a plain `{ message, code, details, hint }` object and a non-error value, `cause` recursion capped at 3, `emailHash` stable and case-insensitive, nothing but the supplied fields and the standard ones is written.
- Request id: valid inbound id kept; too short, too long, spaces and `<script>` rejected and replaced.
- Query error: message format unchanged, `cause` is the original object.
- `orLoadError`: returns the value on success, `null` plus one logged line with the section on failure.
- Auth outage: classification table (null, session-missing, retryable fetch, 500, 503, 429, 401, 400); the 503 response status, headers and escaped body.
- Updated service tests for the five changed assertions.

### Integration Tests:

- The existing integration suite (`npm run test:integration`, needs the local Supabase stack) and the CI smoke are unaffected in behaviour; CI runs them.

### Manual Testing Steps:

1. Start the dev server and check `X-Request-Id` on a response (Phase 1).
2. Submit a wrong password and read the JSON log line (Phase 2).
3. Start the server with `SUPABASE_URL` pointing at a closed port and a fabricated session cookie; load `/dashboard` and read the 503 page and the log (Phases 3 and 4).
4. Load `/dashboard` without a cookie and confirm the redirect and the silence (Phase 4).

## Performance Considerations

One `JSON.stringify` per log call and one UUID per request; negligible. An outage logs one `auth_unavailable` line per request that needs a user, and the dashboard reloads itself every 5 minutes, so volume during an outage is small.

## Migration Notes

No data migration. Production needs only the next deploy: `compose.yaml` sets `APP_ENV=production`. Existing log consumers (a person running `docker compose logs`) will see JSON lines instead of free text; `docker compose logs app | jq` reads them. A new log line shape means any ad-hoc grep for the old message text needs the event names (`origin_rejected`, `auth_unavailable`, `section_load_failed`, `unhandled_error`).

## References

- Source audit: `context/audits/observability/2026-10-03_1812-lab-push-sign-in-dashboard-reads.md` (S1, S5, S8, S9, D2, D3, P3, P1)
- Middleware: `src/middleware.ts:12-45`; `getUser` behaviour: `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2693-2730`
- Astro request error handling: `node_modules/astro/dist/core/routing/handler.js:101-107`
- Existing log sites: `src/lib/page-load.ts:13`, `src/pages/api/notes.ts:27,45`, `src/pages/api/ingest.ts:29`
- Lessons applied: prerequisites, docs in step with code, plan before implementing (`context/foundation/lessons.md`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Logger core and request context

#### Automated

- [x] 1.1 Logger and request-id tests pass: `npx vitest run src/lib/logger.test.ts src/lib/request-id.test.ts` — f046a52
- [x] 1.2 Linting passes: `npm run lint` — f046a52
- [x] 1.3 Type check passes: `npx astro check` — f046a52

#### Manual

- [ ] 1.4 On `npm run dev`, a page response carries an `X-Request-Id` header, and a request sent with a valid `X-Request-Id` keeps it while an invalid one is replaced

### Phase 2: Replace the seven console.error sites

#### Automated

- [x] 2.1 Updated service tests pass: `npx vitest run src/lib/services/day-notes.test.ts src/lib/services/magic-link.test.ts src/lib/services/password-signin.test.ts src/lib/services/ingest.test.ts` — 3d57067
- [x] 2.2 The routes no longer write to the console: `grep -rnE 'console\.(error|warn|log)' src | grep -v '\.test\.ts'` lists only `src/lib/logger.ts` and `src/lib/page-load.ts` (replaced in Phase 3) — 3d57067
- [x] 2.3 Linting and type check pass: `npm run lint && npx astro check` — 3d57067

#### Manual

- [ ] 2.4 A failed password sign-in on the dev server writes one JSON line with the route, request id, `emailHash`, and the provider's `status` and `code`, and the line contains no email address
- [ ] 2.5 A failed `/auth/confirm?token_hash=x` writes a log line whose `path` is `/auth/confirm` with no query string

### Phase 3: Loader cause and section labels

#### Automated

- [x] 3.1 New helper tests pass: `npx vitest run src/lib/query-error.test.ts src/lib/or-load-error.test.ts`
- [x] 3.2 Loader tests still pass with the unchanged message format: `npx vitest run src/lib/services`
- [x] 3.3 No message-only rethrow is left in the loaders: `grep -rnF 'failed: ${error.message}' src/lib/services` returns nothing
- [x] 3.4 Linting and type check pass: `npm run lint && npx astro check`
- [x] 3.6 Only the logger itself writes to the console: `grep -rnE 'console\.(error|warn|log)' src | grep -v '\.test\.ts'` lists only `src/lib/logger.ts`

#### Manual

- [ ] 3.5 With Supabase unreachable on the dev server, the dashboard writes one `section_load_failed` line per failing card, each with its `section`, the request id and the error `cause`

### Phase 4: Auth outage handling

#### Automated

- [ ] 4.1 Classifier, decision and response tests pass: `npx vitest run src/lib/auth-outage.test.ts`
- [ ] 4.2 Full unit suite, lint, type check and build pass: `npm test && npm run lint && npx astro check && npm run build`

#### Manual

- [ ] 4.3 With Supabase unreachable and a fabricated session cookie, `GET /dashboard` returns 503 with the Polish page, `Retry-After`, `Cache-Control: no-store` and the request id on the page and in the header, and the log has an `auth_unavailable` line whose `err.name` is `AuthRetryableFetchError`
- [ ] 4.4 With no cookie at all, `GET /dashboard` still redirects to `/auth/signin` and writes no log line for the missing session
- [ ] 4.5 `POST /api/notes` during the same outage returns the 503 page
- [ ] 4.6 `GET /` during the same outage returns the 503 page, not a redirect to `/auth/signin`

### Phase 5: Docs and verification

#### Automated

- [ ] 5.1 `APP_ENV` is named everywhere the env vars are listed: `grep -rl APP_ENV README.md CLAUDE.md .env.example compose.yaml docs/prerequisites.md astro.config.mjs` lists all six files
- [ ] 5.2 Prettier passes on the changed docs: `npx prettier --check README.md CLAUDE.md docs context`

#### Manual

- [ ] 5.3 `docs/decisions.md` has the dated entry and `docs/architecture.md` describes the logger, the request id and the 503 rule
- [ ] 5.4 After the next production deploy, the first log lines on the VPS show `"env":"production"` and the release SHA as `version`
