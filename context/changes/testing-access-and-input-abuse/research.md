---
date: 2026-10-05T13:20:00+02:00
researcher: Claude (Sonnet 5.5)
git_commit: b6462668cae62abe7641b4eb1a1e40a3d9d8a454
branch: main
repository: energy-analyser
topic: "Phase 3 access and input abuse: what guards exist for risks #6 and #7 and what a test needs to prove them"
tags: [research, codebase, testing, middleware, origin-check, rls, app_owners, ingest-token, day-notes, rendering]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Sonnet 5.5)
last_updated_note: "Added owner decisions for open questions 1-4"
---

# Research: Phase 3 access and input abuse (risks #6 and #7)

**Date**: 2026-10-05T13:20:00+02:00
**Researcher**: Claude (Sonnet 5.5)
**Git Commit**: b6462668cae62abe7641b4eb1a1e40a3d9d8a454
**Branch**: main
**Repository**: energy-analyser

Nothing was run: no Supabase, no tests, no server. Everything below is read from source by three read-only workers; the decisive anchors (middleware, seed trigger, notes constraint and schema, render grep) were re-read by the parent. Items marked _inferred_ rest on reading, not on a run.

## Research Question

`context/foundation/test-plan.md` §3 Phase 3, "Access and input abuse" (integration + unit):

- **#6** A signed-out or non-owner client reads and writes nothing; a foreign Origin is refused on every mutating route; the token exemption cannot cover a cookie-authenticated route; bad or revoked ingest tokens are refused.
- **#7** Lab text and notes render as literal text; form, server and database limits agree, including line breaks; blank is rejected.

What guards exist today, what is already tested, and what would a test have to do to prove each one?

## Summary

1. **Most guards already exist in code; the gap is tests, plus one harness decision.** On this inspected path (the files listed under Code References), no table lacks RLS, no policy is `using (true)`, and both views are `security_invoker = true` (`supabase/migrations/*`). The Origin check and the token exemption are in one 46-line file (`src/middleware.ts`).
2. **A real non-owner cannot be made with the anon key alone.** In local and CI Supabase, `seed.sql:8-22` adds a trigger that inserts every new `auth.users` row into `app_owners`. Every signup path fires it, and `authenticated` has no write grant on `app_owners`. A non-owner needs postgres or service-role access, or disabling the trigger. `docs/decisions.md:12` already defers non-owner and second-token tests to this phase for that reason. This is the one real design decision for the plan (Open Question 1).
3. **`test-plan.md:90` contradicts the decisions file.** It says Phase 3 "needs a real non-owner session that Phase 2 establishes"; Phase 2 deliberately did not (`docs/decisions.md:12`, archived Phase 2 research.md:116, :169). The plan text is stale and the phase must establish the non-owner itself.
4. **Origin and token rules have one smoke test between them and no unit test.** The single foreign-Origin test is in `scripts/smoke.mjs:313-317`, on `/api/notes`, with a live session. A missing Origin, `"null"`, a trailing-slash `/api/ingest/`, Origin on the auth routes, and a signed-in non-owner are untested.
5. **Rendering has no unsafe sink in `src` or `scripts`, and is tested at two layers.** No `set:html`, `dangerouslySetInnerHTML` or `innerHTML` hit (parent grep over `src` and `scripts`). View-model tests pin that markup stays text; two smoke steps check escaped output on the page. Contract limits accept markup as text by design (`src/lib/ingest/contract.ts`).
6. **Notes limit parity has unit coverage for the server but none for the form attribute or the database.** The server normalises CRLF and lone CR to LF before trim and length (`day-notes.ts:86`). Three real parity differences remain, none yet pinned by a test: code points vs UTF-16 units, `btrim` vs `trim`, and trim-then-max ordering.

## Detailed Findings

### 1. Request guard (`src/middleware.ts`) — observed

- `PROTECTED_ROUTES = ["/dashboard"]` (:5), matched with `pathname.startsWith` (:38). It covers `/dashboard`, `/dashboard/history` and any path that starts with the string.
- Mutating means any method outside `GET`, `HEAD`, `OPTIONS` (:6), and only under `/api/` (:18). The check compares the `Origin` header with `APP_ORIGIN ?? context.url.origin` and returns 403 on any difference (:19-24). A missing header reads as `null` and never equals the expected string, so it is refused (:22).
- `TOKEN_AUTH_ROUTES = Set(["/api/ingest"])` (:10), matched on the exact path (:13). For it the middleware sets `locals.user = null` and calls `next()`, skipping Origin and session. `/api/ingest/` with a trailing slash is not in the set, so on this path it would reach the Origin check (inferred from :13 and :18; not run).
- The Origin check runs before the session lookup (:18-25 before :27), so a foreign Origin gets 403 regardless of sign-in. Astro's own check is off (`astro.config.mjs:13-15`, per the worker), so this middleware is the only CSRF guard on this path.
- A protected path without a user gets `redirect("/auth/signin")` (302, :40). The middleware never returns 401; its only non-redirect refusal is the 403.
- A POST outside `/api/` is not Origin-checked, but no inspected non-API route exports POST (route table below).

**Routes** (11 rows from `src/pages`, per the worker's read of every file; bodies of `dashboard.astro` and `dashboard/history.astro` were read to line ~40 only):

| Route                                                                    | Methods | Guard                                                                                                                     | Mutating               |
| ------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `/dashboard`, `/dashboard/history`                                       | GET     | `PROTECTED_ROUTES`                                                                                                        | no                     |
| `/`, `/auth/signin`, `/auth/check-email`, `/auth/confirm`, `/api/health` | GET     | none needed (public)                                                                                                      | `confirm` sets cookies |
| `/api/auth/signin`, `/api/auth/magic-link`, `/api/auth/signout`          | POST    | Origin check                                                                                                              | yes                    |
| `/api/notes`                                                             | POST    | Origin check plus `locals.user` check in the handler (`notes.ts:13`); not in `PROTECTED_ROUTES` (comment `notes.ts:9-11`) | yes                    |
| `/api/ingest`                                                            | POST    | bearer token via `handleIngest`; exempt from Origin and session                                                           | yes                    |

No route that serves owner data sits outside the guards on this inspected set. The residual risk is structural: protection is a path prefix, so a future owner page outside `/dashboard` would be open and nothing flags it (_inferred_).

**Invoking the guard in a test.** The service functions are exported and pure with injected dependencies (`handleIngest` at `src/lib/services/ingest.ts:49`; `parseNoteForm`, `saveNote`, `handleNotePost` in `day-notes.ts`). The middleware is an exported `onRequest` (`middleware.ts:12`) but imports `astro:middleware` and `astro:env/server`, and `vitest.config.ts` (include `src/**/*.test.ts`) has no Astro plugin. A unit test needs `vi.mock` for those modules and for `@/lib/supabase`, or alias stubs. _Inferred, not tried._ The alternative is a running built server driven by `fetch`, as `scripts/smoke.mjs` does; the 403 and the signed-out redirect need no Supabase session, because the 403 returns before `getUser()` and a missing Supabase client leaves `locals.user` null (`middleware.ts:29-36`).

### 2. Database access (risk #6, owner-only reads) — observed from SQL

- `app_owners` (`20260923150859_owner_read_recommendations.sql:6-20`): RLS on, `select` to `authenticated` limited by policy to the caller's own row, no insert/update/delete grant or policy. Production owner rows are inserted by hand (migration comment :3-4; `docs/prerequisites.md:81`).
- Per-object summary from the migrations (anchors in the worker table): `ingest_tokens` readable by nobody; `ingest_pushes` owner-readable for `source, captured_at, received_at, payload` only (`20260925123751:6-12`); `daily_energy`, `hourly_energy`, `period_summaries` owner-readable by column list; `recommendations` owner-readable by table-level grant (`20260923150859:14`, so `push_id` is readable; the docs only say owners "may read recommendations"); `live_state` and `bill_forecast` are `security_invoker` views; `day_notes` has four policies, each requiring an `app_owners` row (`20261001072438:44-95`). Anon has no grant on any of these.
- `ingest_push` is `security definer` with `search_path = ''`, executable by `anon` only (`20261001113911:148-149`). The token check is `token_hash = digest(coalesce(p_token,''),'sha256') and revoked_at is null`; an unknown, revoked or null token raises `P0401` before any insert. `ingest_tokens` has `revoked_at` and no expiry column. The payload is not schema-validated in SQL, so the token is the trust boundary (migration comment; consequence _inferred_).
- **Seed trigger** (`supabase/seed.sql:8-24`): `seed_make_every_user_owner` after insert on `auth.users`, plus a backfill. `seed.sql:1-2` and `:6-7` say it runs on `supabase start` and `db reset` only and must never become a migration; no migration contains it (worker grep over `supabase/migrations`). `config.toml` has `enable_signup = true`, `enable_confirmations = false`, anonymous sign-ins off (worker, lines 169-209), so every local signup returns a session and fires the trigger.
- Existing integration helpers (`tests/integration/support/stack.ts`): `anonClient`, `ownerClient` (signs up a user, an owner through the trigger), and `requireStack`, which refuses a non-local URL and any non-anon key (:27-63, :53-57 per worker). No existing test reads as anon or as a non-owner (`seed.test.ts`, `push-to-page.test.ts`, `history-safety.test.ts`, per worker).

**What a real non-owner needs** (worker analysis, consistent with `docs/decisions.md:12` and archived Phase 2 research.md:116): `delete from public.app_owners where user_id = …` or `alter table auth.users disable trigger seed_make_every_user_owner` before signup. Both need postgres or service-role privilege. A second ingest token needs `insert into ingest_tokens`, the same privilege. Whether the Supabase CLI or a `pg` connection is usable from CI was not verified.

### 3. Existing tests for risk #6

- Unit: none touches `middleware.ts` or the Origin check (parent-confirmed grep for `middleware|Origin|onRequest` over `src`, `tests`, `scripts`, via the worker). `src/lib/services/ingest.test.ts:32` and `:41` cover `handleIngest` returning the same 401 for a missing, malformed or rejected token and not calling the RPC without a token; that is the handler, not the middleware exemption.
- Smoke (`scripts/smoke.mjs`; `request()` always sends an Origin and does not follow redirects, :33-47): signed-out redirects for home, dashboard and history (:204, :210, :211); signed-out note post goes to sign-in (:205-209); foreign-origin note post is 403 (:313-317); ingest 401 for a missing and a wrong token (:451-452); ingest accepted without Origin (:453); anon-key direct table reads rejected (:465-546); signed-in owner cannot read push token columns (:578-596).
- Not covered anywhere inspected: missing or `"null"` Origin; foreign Origin on the three auth routes; `/api/ingest/` with a trailing slash; `/api/ingest` with cookies or a foreign Origin; a revoked token; a second token; any signed-in non-owner (page or table); safe-method GET with a foreign Origin.

### 4. Notes limits and blank rule (risk #7) — observed

| Layer    | Rule                                                                                                                                                                          | Anchor                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Form     | `maxlength={NOTE_MAX_LENGTH}` and `required` on the textarea                                                                                                                  | `src/components/history/DayNotePanel.astro:71-73`     |
| Constant | `NOTE_MAX_LENGTH = 500`                                                                                                                                                       | `src/lib/services/day-notes.ts:9`                     |
| Server   | CRLF and lone CR become LF (`.replace(/\r\n?/g, "\n")`, :86), then `z.string().trim().min(1).max(NOTE_MAX_LENGTH)` (:80); failure is `"invalid"` and a 303 to `?note=invalid` | `day-notes.ts:74-95`                                  |
| Database | `text not null check (char_length(text) <= 500 and btrim(text) <> '')`                                                                                                        | `supabase/migrations/20261001072438_day_notes.sql:15` |

The recorded review finding (line breaks pushing a note over 500) is fixed by the normalisation: archive `2026-10-01-day-notes/reviews/impl-review.md:49-57`. Unit tests in `src/lib/services/day-notes.test.ts` (per worker line anchors): exactly 500 after trim (:50), 501 rejected (:60), 499 + CRLF accepted (:65), 250 + CRLF + 249 accepted (:75), 250 + CRLF + 250 rejected (:84), lone CR (:89), blank `" \n\t "` rejected (:97), missing text (:101). Smoke posts `"   "` and expects `?note=invalid` (:390-394).

**Parity differences that no test pins** (all derived by reading; the Postgres and browser behaviours are from documented semantics, not run here):

1. **Code points vs UTF-16 units.** zod `.max(500)` and the browser `maxlength` count UTF-16 code units; Postgres `char_length` counts code points. Over this path, an emoji counts as 2 at the form and the server and 1 at the database, so the database is equal or looser; a note the server accepts cannot be refused by the database for length. No test covers an astral character.
2. **`btrim` vs `trim`.** `btrim(text)` with no second argument strips spaces only; zod `.trim()` strips all Unicode whitespace. A tab-or-newline-only text passes the database check but not the server. The server is the effective gate; the database is looser. _Postgres `btrim` semantics are not verified against a live database._
3. **Trim-then-max.** The server counts length after trimming, so 500 characters plus surrounding spaces is accepted by the server, while the browser stops at 500 including the spaces. The server is looser. The database receives the trimmed text.

### 5. Rendering of lab and user text (risk #7) — observed

- The parent grep for `set:html|dangerouslySetInnerHTML|innerHTML` over `src` and `scripts` returned no hits. The worker found no markdown library; `src/lib/format/advice-markdown.ts` returns a structure and the component builds the elements (:1-3 per worker).
- Text sinks found: recommendation narration through `parseAdviceMarkdown` in `RecommendationCard.astro:23` and `DayView.astro:39,164,177,238`, rendered by `AdviceBlocks.astro`; period summaries in `SummaryText.astro:17` (`{text}` in a `whitespace-pre-line` paragraph); notes at `DayNotePanel.astro:53` and in the textarea body (:74). All use Astro `{}` interpolation, which escapes by default.
- Not verified: facts, `local_findings`, `sanity_checks`, pricing source, bill-forecast `message` and `published_values` have no render hit in the worker's grep, but the worker did not open every card (`BillForecast`, `LiveStateCard`, `UsageInsightCard`, `TotalsPanel`), and the worker's grep was weak (shell glob failure). Treat these as unchecked.
- Contract accepts markup as text on purpose: only length limits (examples: narration text max 1500 at `contract.ts:192`, recommendation text max 4000 at :43, fact value max 500 at :16-17), no character-class rule.
- Tests: view-model level `advice-markdown.test.ts:34` (script tag kept as text), `period-summary.test.ts:143-145`, `calendar-view.test.ts:414,418`; page level only in smoke: summary text `<b>pogrubione</b>` shows escaped (`smoke.mjs:318-329`) and a note with `<b>pogrubiona</b>` shows escaped (:366-373). Nothing renders markup in the recommendation narration, the live-state card or the bill forecast on a page.
- Rendering an `.astro` file inside Vitest is not available: no Astro Container API use in `src`, `tests` or `package.json` (worker), and no Astro plugin in the Vitest config. Page-level escaping can be checked only through the running server today.

## Code References

- `src/middleware.ts:5-45` - route list, token exemption, Origin check, session lookup, redirect
- `src/pages/api/notes.ts:9-13` - in-handler user check; why `/api/notes` is not in `PROTECTED_ROUTES`
- `src/lib/services/ingest.ts:49` - `handleIngest`, the exported ingest handler
- `supabase/seed.sql:8-24` - the every-user-is-owner trigger and backfill (local and CI only)
- `supabase/migrations/20260923150859_owner_read_recommendations.sql:6-26` - `app_owners`, owner reads
- `supabase/migrations/20261001113911_period_summaries_keep_narration.sql:13-149` - `ingest_push`, token check, grants
- `supabase/migrations/20261001072438_day_notes.sql:15,44-95` - note constraint and policies
- `src/lib/services/day-notes.ts:9,74-95` - limit constant and `parseNoteForm`
- `src/components/history/DayNotePanel.astro:53,71-74` - note render and form attributes
- `tests/integration/support/stack.ts:27-82` - `requireStack`, `anonClient`, `ownerClient`
- `scripts/smoke.mjs:204-211,313-317,366-373,451-453` - existing guard and render checks
- `docs/decisions.md:12` - Phase 3 deferral and its reason

## Architecture Insights

- The guard is one file plus Postgres RLS; tests so far prove the policy by reading as an owner, never as a non-owner, so a wrong policy would still pass the suite (the plan's "Logged in means owner" challenge).
- Pure service functions with injected dependencies are the project's testing seam; the middleware and the `.astro` templates are the two places without one.
- The suite's anon-key-only rule (`stack.ts:53-57`) is deliberate and also blocks the non-owner test, so the phase must either add a privileged test-only path or accept a different technique.

## Historical Context (from prior changes)

- `docs/decisions.md:12` - non-owner and second-token tests deferred to this phase because they need postgres or service-role access. Supported.
- `context/archive/2026-10-01-testing-push-to-page-integration/research.md:116,169` - the mechanism (delete the `app_owners` row or disable the trigger) and the unverified question whether the CLI can run SQL. Supported; still open.
- `context/foundation/test-plan.md:90` - "needs a real non-owner session that Phase 2 establishes". **Contradicted** by the two entries above; the other part of that sentence (Phase 3 follows Phase 2) holds.
- `context/archive/2026-10-01-day-notes/reviews/impl-review.md:49-57` - line breaks over the limit, fixed by normalisation. Supported by `day-notes.ts:86` and the tests at `day-notes.test.ts:65-89`.
- `context/archive/2026-10-01-day-notes/plan.md:145-149` - a manual check against a second, non-owner user. Partial: the method of creating that user is not recorded in the files the worker read.
- Phase 2 test-plan note (`test-plan.md:202`): "non-owner and second-token tests stay in Phase 3". Supported.

## Related Research

- `context/archive/2026-10-01-testing-push-to-page-integration/research.md`
- `context/archive/2026-10-01-testing-time-and-number-guards/research.md`
- `context/archive/2026-10-01-day-notes/research.md`

## Open Questions

For the owner to decide before `/10x-plan` (per `lessons.md`: defaults only when the owner says so):

1. **How does the suite get a real non-owner and a second ingest token?** Options seen: (a) a test-only privileged SQL path against the local stack (psql or the Supabase CLI via `scripts/remote-docker.sh exec`, and in CI, `docker exec`), disabling the trigger or deleting the owner row; (b) a `pg` dev dependency with a local-only guard like `requireStack`; (c) the service-role key from `supabase status`, which the repo forbids in `.env`, logs and the suite (`stack.ts:53-57`, `CLAUDE.md`); (d) extend `scripts/smoke.mjs` instead, which can only reach the same privileges unless a SQL step is added. Whether the Supabase CLI runs SQL in this setup is unverified.
2. **Middleware layer.** Unit-test `onRequest` with `vi.mock` stubs, or test the guard black-box through the built server (smoke or a new HTTP suite)? The second needs the server in the integration job.
3. **Page-level escaping.** Extend smoke (works today), add the Astro Container API (new tooling), or accept view-model tests plus a static guard test for `set:html`, `dangerouslySetInnerHTML` and `innerHTML`?
4. **Known gaps from the parity analysis.** Are the database looseness on tab-only text and the code-point difference defects to fix, or to pin as `KNOWN GAP` tests as in Phase 2? Same question for the table-level `recommendations` grant that exposes `push_id`.
5. **Unchecked renderers.** The cards for bill forecast, live state, usage insight and totals were not read; the plan should include that read before claiming "everywhere".
6. **Unverified semantics.** Postgres `btrim` on tabs, `char_length` on astral characters, and browser `maxlength` counting come from documented behaviour, not a run in this repo; the plan should pin them with a test rather than assume.

## Owner decisions (2026-10-05, after research)

Answers to Open Questions 1 to 4, chosen by the owner from recommended options. Questions 5 and 6 stay open for the plan.

1. **Non-owner and second token:** test-only SQL through a `pg` dev dependency, with a local-only guard like `requireStack`. No service-role key in the repo or the suite.
2. **Middleware:** unit test of `onRequest` with `vi.mock` for `astro:middleware`, `astro:env/server` and the Supabase client; runs in `npm test`.
3. **Escaping on the page:** extend `scripts/smoke.mjs` with markup payloads for more surfaces, plus a unit test that fails on `set:html`, `innerHTML` or `dangerouslySetInnerHTML` in `src`.
4. **Known gaps:** pin the notes-limit differences (code points vs UTF-16, `btrim` vs `trim`, trim-then-max) and the `recommendations` `push_id` grant as `KNOWN GAP` tests, no production change.
