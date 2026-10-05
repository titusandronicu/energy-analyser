# Access and Input Abuse Tests Implementation Plan

## Overview

Rollout Phase 3 of `context/foundation/test-plan.md`: prove risk #6 (a signed-out or non-owner or forged client gets in) and risk #7 (lab text and notes render as markup, or the notes limits disagree) with tests. No production code changes. The owner's decisions after research (research.md, "Owner decisions"): a test-only `pg` helper for the non-owner and second token, a `vi.mock` unit test of the middleware, extended smoke payloads plus a static guard for escaping, and `KNOWN GAP` tests for the gaps the owner chose not to fix.

## Current State Analysis

- The guards exist and are small: `src/middleware.ts:5-45` (route prefix list, exact-path token exemption, Origin check, session lookup), the in-handler user check in `src/pages/api/notes.ts:13`, and Postgres RLS and grants in `supabase/migrations/*`. On the inspected path no table lacks RLS, no policy is `using (true)`, and both views are `security_invoker` (research.md §2).
- Tests do not prove them. No unit test touches the middleware; the only foreign-Origin test is one smoke step on `/api/notes` (`scripts/smoke.mjs:313-317`); no test reads as a non-owner, because every local user is an owner through the seed trigger (`supabase/seed.sql:8-22`) and `stack.ts` is anon-key only by design (`tests/integration/support/stack.ts:53-57`).
- Notes limits: form `maxlength`+`required` (`DayNotePanel.astro:71-73`), zod after CRLF normalisation (`day-notes.ts:80,86`), database `char_length(text) <= 500 and btrim(text) <> ''` (`20261001072438_day_notes.sql:15`). Unit tests cover the server side (`day-notes.test.ts`); three differences between the layers are unpinned (research.md §4).
- Rendering: no `set:html`, `innerHTML` or `dangerouslySetInnerHTML` in `src` or `scripts`; two smoke steps check escaped output (`smoke.mjs:318-329,366-373`). Four cards that render text were not read: `RecommendationFindings`, `RecommendationForecast`, `BillForecastCard`, `UsageInsightCard` (the `LiveStateCard` too).
- The test-plan is stale: §3 says Phase 3 is not started and `test-plan.md:90` claims Phase 2 established a non-owner session; `docs/decisions.md:12` shows it did not.

## Desired End State

- `npm test` fails if the Origin check, the token exemption or the protected-route prefix drift, if a new page or API route is added with no guard entry, or if an unsafe HTML sink appears in `src`.
- `npm run test:integration` proves, with a real non-owner and with anon, that owner-only tables and views return nothing and day notes cannot be written; that unknown, null and revoked ingest tokens are refused while a second valid token works; and that the notes length and blank rules at the database match the documented behaviour, with the known differences pinned.
- Smoke proves markup in lab and user text is shown as text on every surface that renders it.
- Docs, test-plan and decisions say what is now true. Verify by reading `test-plan.md` §3 (Phase 3 `complete`), §5 and §6.4, and by a deliberate break per phase (see Testing Strategy).

### Key Discoveries:

- CI's `supabase start` publishes the database on `127.0.0.1:54322` (`supabase/config.toml` `[db] port`), and `scripts/remote-docker.sh` relays `54321 54322` by default (its `PORTS` default), so a `pg` helper needs no secret beyond the local default postgres connection.
- Vitest cannot resolve `astro:middleware` or `astro:env/server` by default; its docs offer a `resolveId` plugin or `test.alias`, plus a `vi.mock` factory for the exports (Context7, `/vitest-dev/vitest`, "Mocking Non-existing Module"; the docs shown are for v4, the repo runs `vitest ^5.0.1`, so Phase 1 verifies it works).
- `astro:env/server` is imported by five files (`middleware.ts`, `supabase.ts`, `signup.ts`, `config-status.ts`, `pages/api/health.ts`); the stub serves only the middleware test here.
- `middleware.ts:13` matches the token exemption on the exact path, so `/api/ingest/` falls to the Origin check and fails closed (inferred from the code; Phase 1 pins it by test).
- Integration files run one after another and the database is never reset (`test-plan.md` §6.2); the new tests follow its isolation rules (unique emails, own rows, cleanup of what they insert).

## What We're NOT Doing

- No production code, migration or grant changes. The notes-limit differences and the `recommendations.push_id` grant are pinned as `KNOWN GAP` tests, not fixed (owner's decision).
- No service-role key, no `supabase status` output beyond `API_URL` and `ANON_KEY` in CI steps, no secrets in the repo.
- No Astro Container API, no Playwright or browser run (not planned in the test-plan §3).
- No change to the lab's Python code (test-plan §7), no Phase 4 work (CI gate wiring, post-edit hook): the new integration files run in the existing `smoke` job step automatically, and making them required stays Phase 4.
- No new test for password sign-in, magic link or sign-out logic beyond their Origin behaviour.

## Implementation Approach

Cheapest layer first (test-plan principle 1). Phase 1 is pure unit and runs in `npm test`. Phase 2 adds the one new capability, privileged SQL against the local stack, and uses it for the non-owner and token tests; it is the riskiest phase and Phase 3 reuses its helper for database-side notes checks. Phase 4 touches only smoke. Phase 5 updates docs after the facts are known. Decisions made here as defaults, not asked (the owner may object at plan review):

- A non-owner is made by signing up, then `delete from public.app_owners where user_id = …` through the helper; the seed trigger is not disabled, so no global state changes and parallel files stay unaffected.
- The `pg` connection defaults to `postgresql://postgres:postgres@127.0.0.1:54322/postgres` and can be overridden by `SUPABASE_DB_URL`; the helper refuses any host other than `127.0.0.1` or `localhost`, like `requireStack`.
- The middleware test stubs the virtual modules with a Vite `resolveId` plugin in `vitest.config.ts` plus per-test `vi.mock` factories, so no stub files enter `src`.
- The route-inventory test lists `src/pages` files and requires each to have an entry in a hand-written table (guard, method, mutating), failing on a file without an entry or an entry without a file (the fixture-directory pattern, `test-plan.md` §6.5).
- `/api/ingest/` (trailing slash) is pinned as refused with 403, because it fails closed; changing it is a product decision.

## Phase 1: Request-guard unit tests

### Overview

Prove the middleware's rules and the structural guards in `npm test`, with no server and no database.

### Changes Required:

#### 1. Resolve the Astro virtual modules in Vitest

**File**: `vitest.config.ts`

**Intent**: Let `src/middleware.ts` be imported in a unit test without changing production code.

**Contract**: A small Vite plugin with `resolveId` returning the id for `astro:middleware` and `astro:env/server` only, so unresolved ids stop failing the transform; tests supply the exports with `vi.mock(import(...), factory)`. Fallback if Vitest 5 behaves differently from the v4 docs: `test.alias` to two stub files under `tests/support/`, not `src`. Other tests must be unaffected (`npm test` stays green).

#### 2. Middleware table test

**File**: `src/middleware.test.ts` (new)

**Intent**: Pin every rule of `onRequest` from the outside, with a fake context and a `next` spy.

**Contract**: `describe("onRequest")` with `it.each` tables. Cases, each with the expected outcome written by hand (status and whether `next` ran and whether the session lookup ran):

- Mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) on `/api/notes` with Origin missing, `"null"`, foreign, equal to `APP_ORIGIN`: only the equal one passes; the rest return 403 before `getUser`. `APP_ORIGIN` unset falls back to the request origin. A trailing slash or different port on the Origin is refused.
- Safe methods (`GET`, `HEAD`, `OPTIONS`) on `/api/health` with a foreign Origin: not refused.
- `/api/ingest` POST with no Origin and with a foreign Origin: passes to `next` with `locals.user` null and no session lookup; `/api/ingest/` POST, `/api/ingest/x` and `/api/ingestx`: Origin check applies (403 without a matching Origin).
- A cookie-authenticated route (`/api/notes`) is not reachable through the exemption: asserted by the table above plus a test that the exempt set is exactly `/api/ingest` (any added path turns a row red).
- `/dashboard`, `/dashboard/history`, `/dashboardX` with no user redirect to `/auth/signin` (302); with a user they pass; `/auth/signin` and `/api/health` need no user.
- Supabase client missing (`createClient` returns null): `locals.user` is null and a protected path still redirects.
  Use an injected fake client; no wall clock.

#### 3. Route-inventory guard

**File**: `src/lib/route-guards.test.ts` (new)

**Intent**: Make a new owner page or mutating route without a guard decision fail a test, since protection is a path prefix.

**Contract**: Read the file list under `src/pages` with `node:fs`; a hand-written table keyed by route lists method, guard (`middleware-prefix`, `handler-session`, `token`, `public`) and whether it mutates (the 11 routes in research.md §1). Fail on a page file with no entry, an entry with no file, a `.astro` page that loads owner data but is not `middleware-prefix`, and a mutating route that is not under `/api/` (outside the Origin check). Document in a comment that the table is the single place to record a new route's guard.

#### 4. Static sink guard and form-attribute check

**File**: `src/lib/render-safety.test.ts` (new)

**Intent**: Fail on any HTML-injection sink added to `src`, and pin that the note form's attributes still follow the shared constant.

**Contract**: Walk `src` for `.astro`, `.ts`, `.tsx` files and fail on `set:html`, `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `outerHTML`, ignoring this test file; a documented allow list (empty today) for a reviewed exception. A second test reads `src/components/history/DayNotePanel.astro` as text and asserts the textarea has `maxlength={NOTE_MAX_LENGTH}` and `required` and the label text uses the constant (a cheap source check; it is fragile to a markup rewrite, so the failure message says what to look at).

### Success Criteria:

#### Automated Verification:

- Unit tests pass, with the new files collected: `npm test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- A deliberate break turns the matching test red and is reverted: remove the `Origin` comparison; add `/api/notes` to `TOKEN_AUTH_ROUTES`; add `set:html` to a component; add an unlisted page file

#### Manual Verification:

- Reviewer reads the middleware table and confirms each expected value matches the rule in `docs/architecture.md` or `CLAUDE.md` (Environment), not the code.

**Implementation Note**: After this phase's automated verification passes, pause for the human to confirm before Phase 2.

---

## Phase 2: Privileged helper and access integration tests

### Overview

Add the one new capability, a local-only privileged SQL helper, and use it to prove a signed-out, anon or non-owner client reads and writes nothing, and that ingest token rules hold.

### Changes Required:

#### 1. Dependency

**File**: `package.json`, `package-lock.json`

**Intent**: Add `pg` and `@types/pg` as dev dependencies for the helper.

**Contract**: dev dependencies only; no production import of `pg`. `npm ci` and `npm run build` unaffected.

#### 2. Privileged helper

**File**: `tests/integration/support/privileged.ts` (new)

**Intent**: Give tests a way to run SQL as postgres on the local stack, with the same refusals as `requireStack`.

**Contract**: `requirePrivileged()` returns a `pg.Client` URL from `SUPABASE_DB_URL` or the local default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; throws (never skips) when the host is not `127.0.0.1` or `localhost`, and when the stack is not reachable it says to start the relay on 54322. Exports `withPrivileged(fn)` that connects, runs, and always disconnects; `nonOwnerClient()` that signs up like `ownerClient`, removes that user's `app_owners` row through the helper, and returns the session client; `insertToken(label)` / `revokeToken(label)` / `deleteToken(label)` for `ingest_tokens` using `extensions.digest(token,'sha256')` with a unique token and label per test (cleanup in `afterAll`). Test-plan §6.2 gets a line for it (Phase 5).

#### 3. Access integration tests

**File**: `tests/integration/access-abuse.test.ts` (new)

**Intent**: Prove risk #6 against real Postgres and PostgREST.

**Contract**: Each test also shows the control: the owner can read or write what the non-owner cannot, so a stack that denied everyone could not pass.

- For `anon` and a non-owner session: a select on each owner object (`recommendations`, `ingest_pushes`, `daily_energy`, `hourly_energy`, `period_summaries`, `day_notes`, `live_state`, `bill_forecast`) returns no rows or a permission error, never data; `ingest_tokens` and `app_owners` (other users' rows) return nothing. Seed one fresh row of each kind via the existing `push` helper first, so "no rows" means "hidden", not "empty".
- A non-owner and anon cannot insert, update or delete `day_notes` (denied or zero rows affected, verified through the owner's read afterwards).
- Owner column grants: the owner can select `ingest_pushes` `source, captured_at, received_at, payload` and is denied `token_id` and `payload_hash`.
- Ingest tokens: unknown, empty and revoked tokens are refused by `ingest_push` (error code `P0401`, nothing written: check the owner's read), a second inserted token is accepted and labelled, revoking it stops the next push; `authenticated` (non-owner and owner) cannot call `ingest_push` (permission denied).
- `KNOWN GAP`: owners can read `recommendations.push_id` (table-level grant, `20260923150859:14`); the comment says a fix is a column grant like the other tables.
  Use unique emails and token labels, filter reads to the test's own keys, and delete inserted tokens and the extra owner rows in `afterAll`.

### Success Criteria:

#### Automated Verification:

- Dependency installs cleanly: `npm ci`
- Integration tests pass against the local stack: `SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run test:integration` (the stack runs on the UGREEN; start the relay with `scripts/remote-docker.sh relay-start`, ports 54321 and 54322)
- Unit tests, types, lint and build still pass: `npm test`, `npx astro check`, `npm run lint`, `npm run build`
- Deliberate breaks, each turning a named test red and then reverted on the local stack only (never production): grant `select` on `ingest_pushes` to `authenticated` without the owner policy; add a policy `using (true)` to `day_notes`; remove `revoked_at is null` from the token check in a scratch copy of the function

#### Manual Verification:

- CI: the `smoke` job runs the new file in its integration step and `pg` reaches `127.0.0.1:54322` there (confirm on the first PR run).
- The test refuses to start with a `SUPABASE_DB_URL` host that is not local.

**Implementation Note**: Pause for the human to confirm the CI run before Phase 3.

---

## Phase 3: Notes limit parity

### Overview

Pin what each layer does with the same note, including the three known differences, so none can drift silently.

### Changes Required:

#### 1. Unit pins for the server layer

**File**: `src/lib/services/day-notes.test.ts`

**Intent**: Cover what the worker found missing: astral characters, other whitespace, and trim-then-max.

**Contract**: Add cases to `describe("parseNoteForm")` with hand arithmetic in comments: 250 emoji (500 UTF-16 units) accepted and 251 rejected; a note of tabs, non-breaking space and newlines only rejected; 500 characters with surrounding spaces accepted and stored trimmed (trim-then-max). `KNOWN GAP`-prefixed names only where the behaviour differs from the form (the server accepts what the browser would stop).

#### 2. Database-side parity tests

**File**: `tests/integration/notes-parity.test.ts` (new)

**Intent**: Compare the database check with the documented rule, using the owner client for the normal path and the privileged helper only where the owner cannot reach a state.

**Contract**: As an owner: 500 characters inserts, 501 is refused, an empty and a spaces-only text are refused, a newline-only text is the pinned difference. Each case uses its own unique `day` far in the past and deletes its row after. Cases: `char_length` counts code points, so 500 emoji (1000 UTF-16 units) is accepted by the database although the server and the browser refuse it (`KNOWN GAP` pinned: the database is looser, a fix is a code-point or UTF-16 count at the database). A tab-only or newline-only text passes `btrim(text) <> ''` (`KNOWN GAP`: server `trim()` is stricter, a fix is a whitespace regex in the check). The notes saved through the real `saveNote` keep the LF-normalised text (read back equals).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Integration tests pass: `npm run test:integration` (local stack)
- Types and lint pass: `npx astro check`, `npm run lint`
- Deliberate breaks: change `NOTE_MAX_LENGTH` to 499 in a scratch edit; remove the CRLF `replace` in `parseNoteForm`; each turns a named test red

#### Manual Verification:

- The `KNOWN GAP` comments state what a fix would change, and each name starts with `KNOWN GAP`.

**Implementation Note**: Pause for the human to confirm before Phase 4.

---

## Phase 4: Page-level escaping

### Overview

Prove on the real page that lab and user text stays text, on every surface that renders it.

### Changes Required:

#### 1. Survey the unread renderers

**File**: `src/components/RecommendationFindings.astro`, `RecommendationForecast.astro`, `BillForecastCard.astro`, `UsageInsightCard.astro`, `LiveStateCard.astro`, `src/components/history/TotalsPanel.astro`

**Intent**: Read each in full and list which contract fields it renders (research.md open question 5) before choosing payloads.

**Contract**: A short table in the change folder (`context/changes/testing-access-and-input-abuse/render-surfaces.md`) of component, rendered fields and the contract path of each. No code change.

#### 2. Extend smoke

**File**: `scripts/smoke.mjs`

**Intent**: Add markup payloads to the surfaces found, and assert the escaped form on the page.

**Contract**: For each text-bearing surface in the survey that smoke can reach (at least the recommendation narration, the bill-forecast message if rendered, and the live-state fields if rendered), push a synthetic payload containing `<script>`, `<b>`, an attribute-breaking quote and an ampersand, then a step asserting `contains` the escaped form and `notContains` the raw tag, following `smoke.mjs:318-329`. Payloads are invented; no household values. The smoke step count in `test-plan.md` §4 is updated in Phase 5.

### Success Criteria:

#### Automated Verification:

- Smoke passes against the local stack: `BASE_URL=… MAILPIT_URL=… SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run smoke`
- Lint and types pass: `npm run lint`, `npx astro check`
- Deliberate break: add `set:html` to one text component in a scratch edit; both the static guard (Phase 1) and the matching smoke step turn red

#### Manual Verification:

- The survey table matches the components (spot check two).

**Implementation Note**: Pause for the human to confirm before Phase 5.

---

## Phase 5: Docs and test-plan

### Overview

Bring the written record in line, as `lessons.md` requires.

### Changes Required:

#### 1. Prerequisites and decisions

**File**: `docs/prerequisites.md`, `docs/decisions.md`

**Intent**: Record the new external prerequisite and the decisions.

**Contract**: prerequisites: the local DB port 54322 must be reachable for the integration suite (relay default already includes it) and `SUPABASE_DB_URL` is optional and local-only; decisions: a dated entry listing the four owner decisions, the pinned gaps (notes counting, `btrim`, trim-then-max, `push_id` grant), `/api/ingest/` failing closed, and that the earlier "deferred to Phase 3" note is now done.

#### 2. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Fix the stale text and fill the cookbook.

**Contract**: §3 Phase 3 row to `complete` with the change folder path (and Phase 2 to `complete`, since its change is archived); correct `test-plan.md:90` (Phase 3 creates the non-owner itself); §4 add the helper and `pg`, update the smoke step count; §5 mark the access and input suite required after Phase 3 with its location; §6.2 add `privileged.ts` and the delete-owner-row technique; §6.4 replace "TBD" with the guard, Origin, token and non-owner pattern; §6.6 add a Phase 3 note; refresh the Freshness Ledger date.

#### 3. Command notes

**File**: `CLAUDE.md`

**Intent**: Mention that `npm run test:integration` also needs DB port 54322 and what `SUPABASE_DB_URL` does; no other change.

**Contract**: one line in the Commands entry for `test:integration`.

### Success Criteria:

#### Automated Verification:

- Docs formatting passes the pre-commit prettier on `*.md`: `npx prettier --check docs context CLAUDE.md`
- All suites still pass: `npm test`, `npm run test:integration`, `npm run smoke` (local stack)

#### Manual Verification:

- A reader of `test-plan.md` can tell from §3, §5 and §6.4 which suites exist, where they live and how to add one.
- `docs/decisions.md` entry reads correctly and states what was not fixed.

---

## Testing Strategy

### Unit Tests:

- Middleware table (Origin, methods, exemption, redirects, missing client), route inventory, sink guard, form attributes, and the three notes-parity cases.
- Edge cases: Origin missing, `"null"`, trailing slash, other port; `/api/ingest/`, `/api/ingest/x`, `/api/ingestx`; `/dashboardX`; 250 and 251 emoji; whitespace-only notes of tab, non-breaking space and newline; 500 characters plus surrounding spaces.

### Integration Tests:

- Real non-owner and anon sessions against each owner object with a seeded row and an owner control; token unknown, empty, revoked, second valid and revoked again; column grants; database note limits through the owner client.

### Manual Testing Steps:

1. Run the three suites on the local stack and confirm green.
2. Perform the deliberate break named in each phase on a scratch edit and confirm the named test turns red, then revert.
3. Open the first PR and confirm the `smoke` job runs the new integration files.

## Performance Considerations

The unit tests are small. The new integration files add signups and a few SQL statements each; they run in the existing `smoke` job step. Rows created by tests (tokens, extra owner rows, notes) are removed in `afterAll`.

## Migration Notes

None: no schema, grant or production change. A new dev dependency (`pg`) is added; production images do not import it.

## References

- Related research: `context/changes/testing-access-and-input-abuse/research.md`
- Test plan: `context/foundation/test-plan.md` §2 risks #6 and #7, §3 Phase 3, §6.2, §6.4
- Similar implementation: `tests/integration/history-safety.test.ts` (integration with known gaps), `src/lib/services/day-notes.test.ts` (validation unit tests), `scripts/smoke.mjs:318-329` (escaped-text step)
- Prior decision: `docs/decisions.md:12`; Vitest virtual-module docs via Context7 `/vitest-dev/vitest`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Request-guard unit tests

#### Automated

- [x] 1.1 Unit tests pass, with the new files collected: `npm test` — 236e7e5
- [x] 1.2 Type checking passes: `npx astro check` — 236e7e5
- [x] 1.3 Linting passes: `npm run lint` — 236e7e5
- [x] 1.4 A deliberate break turns the matching test red and is reverted: remove the `Origin` comparison; add `/api/notes` to `TOKEN_AUTH_ROUTES`; add `set:html` to a component; add an unlisted page file — 236e7e5

#### Manual

- [ ] 1.5 Reviewer reads the middleware table and confirms each expected value matches the rule in `docs/architecture.md` or `CLAUDE.md` (Environment), not the code

### Phase 2: Privileged helper and access integration tests

#### Automated

- [x] 2.1 Dependency installs cleanly: `npm ci` — 32afb74
- [x] 2.2 Integration tests pass against the local stack: `SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run test:integration` — 32afb74
- [x] 2.3 Unit tests, types, lint and build still pass: `npm test`, `npx astro check`, `npm run lint`, `npm run build` — 32afb74
- [x] 2.4 Deliberate breaks each turn a named test red and are reverted on the local stack only: grant `select` on `ingest_pushes` to `authenticated` without the owner policy; add a policy `using (true)` to `day_notes`; remove `revoked_at is null` from the token check in a scratch copy of the function — 32afb74

#### Manual

- [ ] 2.5 CI: the `smoke` job runs the new file in its integration step and `pg` reaches `127.0.0.1:54322` there (confirm on the first PR run)
- [ ] 2.6 The test refuses to start with a `SUPABASE_DB_URL` host that is not local

### Phase 3: Notes limit parity

#### Automated

- [x] 3.1 Unit tests pass: `npm test`
- [x] 3.2 Integration tests pass: `npm run test:integration` (local stack)
- [x] 3.3 Types and lint pass: `npx astro check`, `npm run lint`
- [x] 3.4 Deliberate breaks: change `NOTE_MAX_LENGTH` to 499 in a scratch edit; remove the CRLF `replace` in `parseNoteForm`; each turns a named test red

#### Manual

- [ ] 3.5 The `KNOWN GAP` comments state what a fix would change, and each name starts with `KNOWN GAP`

### Phase 4: Page-level escaping

#### Automated

- [ ] 4.1 Smoke passes against the local stack: `BASE_URL=… MAILPIT_URL=… SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run smoke`
- [ ] 4.2 Lint and types pass: `npm run lint`, `npx astro check`
- [ ] 4.3 Deliberate break: add `set:html` to one text component in a scratch edit; both the static guard (Phase 1) and the matching smoke step turn red

#### Manual

- [ ] 4.4 The survey table matches the components (spot check two)

### Phase 5: Docs and test-plan

#### Automated

- [ ] 5.1 Docs formatting passes: `npx prettier --check docs context CLAUDE.md`
- [ ] 5.2 All suites still pass: `npm test`, `npm run test:integration`, `npm run smoke` (local stack)

#### Manual

- [ ] 5.3 A reader of `test-plan.md` can tell from §3, §5 and §6.4 which suites exist, where they live and how to add one
- [ ] 5.4 `docs/decisions.md` entry reads correctly and states what was not fixed
