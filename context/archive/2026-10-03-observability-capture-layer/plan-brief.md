# Capture Layer — Plan Brief

> Full plan: `context/changes/observability-capture-layer/plan.md`
> Source audit: `context/audits/observability/2026-10-03_1812-lab-push-sign-in-dashboard-reads.md`

## What & Why

The app has no error tracker: its only capture is seven `console.error` calls into 30 MB of rotating Docker logs, with no request id, release or environment, and several failure paths (an auth outage, a failing card) either log too little or nothing. This change adds a tracker-agnostic capture layer so a failure leaves a diagnosable line, and so a provider outage is no longer shown as "signed out".

## Starting Point

Services take an optional `logError(message, detail)` callback whose detail is often just `error.message`. Thirteen loaders rethrow without `cause` or the Postgres code. `orLoadError` logs a bare error with no section. The middleware reads only `data.user` from `getUser()`, which returns an error object for a provider outage, so the owner gets a silent redirect to sign-in.

## Desired End State

Every log line is one JSON object with `requestId`, `version`, `env`, route (pathname only, never the query) and, for failures, a serialized error with code, status, stack and `cause`. Every response produced by a page, endpoint or middleware outcome carries `X-Request-Id`; Astro's 500 page after an unhandled error does not, and the logged line carries the id instead. A failing dashboard card logs its section; a failed sign-in logs an `emailHash`, never an address. When the auth provider is down, `/`, `/dashboard` and the notes POST show a Polish 503 page with the request id and the outage is logged; an ordinary anonymous visitor causes no log line.

## Key Decisions Made

| Decision                   | Choice                                                                                                   | Why (1 sentence)                                                                                      | Source         |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------- |
| Scope                      | Audit fixes 1 to 3 only                                                                                  | Closes the most blindness per unit of effort without a vendor.                                        | Plan (owner)   |
| Auth outage UX             | A 503 "sign-in unavailable" page, not a redirect                                                         | A real 5xx is loggable and honest.                                                                    | Plan (owner)   |
| Environment tag            | New optional `APP_ENV`, `production` in `compose.yaml`                                                   | The CI smoke build and production are both production-mode, so the build mode cannot tell them apart. | Plan (owner)   |
| Sign-in failure identity   | Hashed email (8 hex of SHA-256), no IP                                                                   | Correlates repeated failures without personal data; proxy headers are undocumented.                   | Plan (owner)   |
| Vendor                     | None; the logger is tracker-agnostic                                                                     | A tracker choice belongs to `/10x-infra-research`.                                                    | Plan (owner)   |
| Testability                | Pure `src/lib` modules with injected version and environment                                             | `astro:env/server` does not resolve under vitest.                                                     | Research       |
| 503 mechanism              | Hand-built `Response`, not a rewrite                                                                     | Rewrite status semantics are unverified and a rewrite re-enters the failing auth call.                | Research       |
| 503 routes and testability | One pure `decideAuth` rule for `/`, `/dashboard*` and `POST /api/notes`; no Locals flag, no route guards | The middleware cannot be unit-tested under vitest, and `/` was the missed bookmark path.              | Plan review    |
| Loader errors              | `queryError(what, error)` with `cause`, same message format                                              | Keeps the eight existing `toThrow` assertions passing.                                                | Research       |
| Log format and request id  | JSON lines; generated id, or a safe inbound `X-Request-Id`                                               | Greppable with `jq`; a forged id only affects correlation.                                            | Plan (default) |
| Expired or invalid token   | Signed out, not logged                                                                                   | Expected on stale cookies; logging it would drown real outages.                                       | Plan (default) |

## Scope

**In scope:** logger, request id, `APP_ENV`, middleware context and error boundary, the seven log sites, service error payloads, the loader helper and section labels, auth outage handling (one pure decision rule), docs.

**Out of scope:** any tracker or drain, readiness probe and deploy gate, ingest rejection logging, auth message classification, startup config validation, client-side handlers, custom 500 page, errors thrown after the first byte of a streamed body, lab-side changes.

## Architecture / Approach

Pure modules in `src/lib` (`logger`, `request-id`, `query-error`, `or-load-error`, `auth-outage`) with colocated tests, built bottom-up. `middleware.ts` is the only file that imports `astro:env/server`: it creates the root logger, then per request a child logger on `locals`, sets `X-Request-Id`, wraps the request in a try/catch that logs and rethrows (Astro logs the same stack again in its own format), and applies the result of the pure `decideAuth` for an auth outage. Pages and routes log through `Astro.locals.log`.

## Phases at a Glance

| Phase                                    | What it delivers                                                    | Key risk                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Logger core and request context       | Logger, request id, `APP_ENV`, middleware wiring and boundary       | Setting a header on a response Astro may treat as immutable                |
| 2. Replace the seven console.error sites | All logging through `locals.log`, error objects, `emailHash`        | Five exact test assertions change; a query string must never reach the log |
| 3. Loader cause and section labels       | `queryError` at 13 loaders, labelled `orLoadError` at 18 call sites | `Error` `cause` must type-check under the repo's TS lib                    |
| 4. Auth outage handling                  | Classifier, `decideAuth` rule, 503 page, outage log                 | A fabricated session cookie is needed to prove it by hand                  |
| 5. Docs and verification                 | decisions, architecture, prerequisites, README, CLAUDE.md           | Docs drifting from the code                                                |

**Prerequisites:** none outside the repo; the next deploy sets `APP_ENV=production` from `compose.yaml`.
**Estimated effort:** about 2 to 3 sessions across 5 phases.

## Open Risks & Assumptions

- Astro 7.3.2 rewrite behaviour was not verified, so the 503 deliberately avoids it; the proxy's forwarded headers are undocumented, so no IP is logged.
- Existing readers of the logs (a person running `docker compose logs`) will see JSON; event names change what they grep for.
- `getUser()` classification rests on the auth-js error shapes in the installed version; a library upgrade could change them, which the classifier's unit tests would catch.

## Success Criteria (Summary)

- A provider outage is visible: the owner sees an honest 503 page and the log has one `auth_unavailable` line with the error name and request id.
- Any failing dashboard card, sign-in or note write leaves one JSON line that says what failed, with the Postgres or provider code.
- No `console.*` call remains in `src` except inside the logger, and the existing test suite, lint, type check and build pass.
