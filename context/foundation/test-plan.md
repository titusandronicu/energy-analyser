# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-05

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src`, `scripts`, `supabase`
(111 commits in the last 30 days; excluding docs, archive, fixtures, build
output).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                               | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Stale or outage-old data (live state, advice, forecast, summaries) is shown as if it were current                                                                                                                     | High   | High       | interview Q1, Q2; existing-system.md (lab outages 13–19 and 21–25 Sept with no alert); PRD v3 FR-004; hot-spot dir `src/lib/services` (72 commits/30d)                                                                                                                                                                                                                                         |
| 2   | A wrong money figure (bill forecast, rating) is shown with a normal status and acted on                                                                                                                               | High   | High       | interview Q2; docs/decisions.md (stale forecast shown "ok" 2.4× too high, negative input giving a 41M PLN range, false "good" verdict); archive 2026-09-27-bill-accuracy reviews; hot-spot dir `src/lib/services` (72 commits/30d)                                                                                                                                                             |
| 3   | A change passes the unit tests but the real path from lab push to rendered page is broken (unwired, wrong shape or order)                                                                                             | High   | High       | interview Q2 ("review caught it late"); archive 2026-09-27-bill-accuracy reviews (a lab-side unwired-writer finding of the same shape, not about the app); test-base profile: all 34 test files under `src` are pure logic or mocked clients, none opens a database or renders a page; the smoke script covers part of the real path but not hourly history, daily history cells or non-owners |
| 4   | Stored history is silently lost or drifts: replayed or out-of-order pushes downgrade data, a newer push with a lower or empty total overwrites a higher stored one, a narration is wiped, an outage gap reads as zero | High   | Medium     | interview Q1; docs/logic.md and docs/decisions.md latest-wins and narration-keep rules; archive 2026-10-01-period-summaries (narration-keep fix); archive 2026-09-25-daily-history-push review (lab-side counter finding, a false positive fixed in the lab). Research found no historical source for "an outage gap reads as zero": treat it as a hypothesis                                  |
| 5   | Day, month and "enough data" decisions are wrong at the boundary (Warsaw midnight, DST, year end, completed period, ties)                                                                                             | Medium | High       | interview Q3 (services and view logic); archive reviews (kWh rounding at range edges, the 15-minute capture rule); hot-spot dirs `src/lib/format` (33 commits/30d), `src/components/history` (30 commits/30d)                                                                                                                                                                                  |
| 6   | A non-owner or forged client gets in (owner-only reads or column grants wrong, Origin check or the token exemption widened)                                                                                           | High   | Medium     | PRD v3 single-user constraint; tech-stack.md custom Origin check and AGENTS.md rule on token-authenticated routes; archive 2026-09-23-access-key-sign-in and 2026-10-01-day-notes; hot-spot dirs `src/pages/auth` (15 commits/30d), `src/components/auth` (13 commits/30d). No interview signal                                                                                                |
| 7   | Lab text or user notes render as markup, or the notes length limit differs between form, server and database                                                                                                          | Medium | Medium     | archive 2026-10-01-day-notes review (line breaks push a note over the 500-character limit); PRD v3 non-goals on advice and numbers                                                                                                                                                                                                                                                             |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                             | Must challenge                                                                                     | Context `/10x-research` must ground                                                                                                                                                                                                                                                                                                                                                              | Likely cheapest layer                                              | Anti-pattern to avoid                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| #1   | Past each surface's age threshold, or on an earlier day, the page shows last-known data with an explicit stale flag and age, and never reads as current; a time ahead of the clock is a problem, never current          | "A fresh push means every section is fresh"; "the badge and the shown time use the same timestamp" | Which timestamp and threshold each surface uses (live state, advice, forecast, summaries); where the flag renders; how the current time is injected                                                                                                                                                                                                                                              | unit with an injected clock, plus one integration on the real page | Expected label copied from the implementation; tests that depend on the wall clock                                                         |
| #2   | Implausible, stale, other-month or too-thin inputs give a refusal or neutral state, and a known fixture gives an independently hand-computed figure                                                                     | "A contract-valid payload is plausible"; "status ok means fresh and right"                         | Which layer owns each guard (contract versus view model); tariff and settlement inputs; synthetic fixtures with the real file's shape                                                                                                                                                                                                                                                            | unit and contract tests with a hand-computed oracle                | Oracle lifted from the code under test; fixtures carrying real household values, including an example file whose provenance is unconfirmed |
| #3   | A payload shaped like the lab's goes through the real route, store and page loader in one run and appears on the right surface                                                                                          | "All units green means the feature works"; "the writer is wired in"                                | Real entry points (ingest, sign-in, page loaders); what the smoke script covers and what it does not (no hourly card, no daily history cells, no out-of-order daily or hourly pushes); how to run the local stack in CI                                                                                                                                                                          | integration against local Supabase                                 | Mocking the client at the boundary under test; promoting the check to a browser                                                            |
| #4   | Duplicate, replayed and out-of-order pushes never downgrade stored data; a gap stays visible and is not filled                                                                                                          | "An idempotent push is a correct push"; "a missing day equals zero"                                | Store semantics and conflict rules; retention windows (raw pushes 14 days, hourly 35 days); daily-total rules; migration history. Research (change testing-push-to-page-integration): replay, older-push and narration-wipe are already guarded in SQL; a lower or null daily or hourly total from a newer push is not guarded, so pin it as a known gap unless the owner decides it is a defect | integration against real Postgres, unit for pure derivations       | Mocking Postgres; asserting row counts only                                                                                                |
| #5   | Each boundary decision matches the rule written in docs/logic.md at and around the edge                                                                                                                                 | "The UTC day equals the Warsaw day"; undefined ties, ranges and "latest"                           | Thresholds and period rules; how the current time is injected; DST and year-end behaviour                                                                                                                                                                                                                                                                                                        | parameterised unit tables                                          | Expected values copied from the code; wall-clock dependence; range checks on rounded display strings                                       |
| #6   | A signed-out or non-owner client reads and writes nothing; a foreign Origin is refused on every mutating route; the token exemption cannot cover a cookie-authenticated route; bad or revoked ingest tokens are refused | "Logged in means owner"; "row-level security on means safe"                                        | Route guard lists, policies and column grants; how to create a real non-owner (local and CI users are all owners through the seed)                                                                                                                                                                                                                                                               | integration with a real non-owner session against local Supabase   | Testing only the happy session; relying on seed users that are all owners; mocking auth                                                    |
| #7   | Lab text and notes render as literal text; form, server and database limits agree, including line breaks; blank is rejected                                                                                             | "The form's maxlength equals the server limit"; "one smoke sample proves escaping"                 | Render paths for lab-supplied text; notes validation layers and their limits                                                                                                                                                                                                                                                                                                                     | unit for validation parity, render check in integration            | HTML snapshot without meaning; asserting escaped output with the same escaper                                                              |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name               | Goal (one line)                                                                         | Risks covered | Test types         | Status       | Change folder                                                |
| --- | ------------------------ | --------------------------------------------------------------------------------------- | ------------- | ------------------ | ------------ | ------------------------------------------------------------ |
| 1   | Time and number guards   | Prove stale, money and boundary behaviour at the cheapest layer                         | #1, #2, #5    | unit + contract    | complete     | context/archive/2026-10-01-testing-time-and-number-guards/   |
| 2   | Push-to-page integration | Prove a lab-shaped push reaches the right page and history survives replay and disorder | #3, #4        | integration        | complete     | context/archive/2026-10-01-testing-push-to-page-integration/ |
| 3   | Access and input abuse   | Prove non-owner, Origin and token rules and notes and lab-text handling                 | #6, #7        | integration + unit | implementing | context/changes/testing-access-and-input-abuse/              |
| 4   | Quality-gates wiring     | Make the new suites required in CI and add an optional post-edit check                  | cross-cutting | gates              | not started  | —                                                            |

**Status vocabulary** (fixed — parser literals):

| Value           | Meaning                                                             |
| --------------- | ------------------------------------------------------------------- |
| `not started`   | No change folder for this rollout phase yet.                        |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done. |
| `researched`    | `research.md` exists in the change folder.                          |
| `planned`       | `plan.md` exists with a `## Progress` section.                      |
| `implementing`  | Progress section has at least one `[x]` and at least one `[ ]`.     |
| `complete`      | Progress section is fully `[x]`.                                    |

Phase order follows cost × signal: Phase 1 is the cheapest layer and covers
three of the four High × High risks; Phase 2 needs the local stack and reuses
Phase 1's fixtures; Phase 3 makes its own real non-owner session (Phase 2
deliberately did not: the anon-key suite cannot, see `docs/decisions.md`
2026-10-05) through a test-only privileged `pg` connection; Phase 4 locks in
what Phases 1–3 deliver. Browser end-to-end and
visual diffs are not in the rollout: no interview answer or PRD line makes
them a risk. Revisit at the next refresh.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                | Tool                               | Version | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration   | Vitest                             | 5.x     | `vitest.config.ts` includes `src/**/*.test.ts` only (44 files, all pure logic or mocked clients, including the request-guard tests); a small Vite plugin resolves `astro:middleware` and `astro:env/server` so the middleware can be imported, and tests mock their exports; node environment; no coverage config. `vitest.integration.config.ts` includes `tests/integration/**/*.test.ts` (`npm run test:integration`, local Supabase)           |
| end-to-end over HTTP | the smoke script (`npm run smoke`) | n/a     | 71 steps (70 counted from a run plus the escaping step added in Phase 3; 52 without the Supabase env vars) against a built server, local Supabase and Mailpit, now including a complete-day hourly step for the hourly card and one step that checks markup in the recommendation text and its findings is shown as text; runs in one CI job, and the integration suite runs after it in the same job; not a browser run; never against production |
| browser e2e          | none yet                           | n/a     | Not planned in this rollout (see §3); Playwright's setup project with `storageState` is the current pattern if it is added later                                                                                                                                                                                                                                                                                                                   |
| API mocking          | none yet                           | n/a     | Add only at the network edge if a phase needs it                                                                                                                                                                                                                                                                                                                                                                                                   |
| accessibility        | none yet                           | n/a     | The smoke script checks landmark and heading presence only                                                                                                                                                                                                                                                                                                                                                                                         |
| lint, types, build   | ESLint, `astro check`, Astro build | n/a     | Already required in CI                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Stack grounding tools (current session):**

- Docs: Context7 — checked Playwright's auth setup project with `storageState` and that its `webServer` starts before global setup; checked: 2026-10-01
- Search: Exa — available, not used (no stack question needed a search); checked: 2026-10-01
- Runtime/browser: Claude in Chrome — available, not used; no Playwright MCP exposed; checked: 2026-10-01
- Provider/platform: Supabase, GitHub and Linear MCPs — available; local Supabase on the UGREEN is what Phases 2–3 need; not used here; checked: 2026-10-01

Test-base profile: meaningful for logic (Vitest configured, 34 test files
across services, format, ingest and calendar helpers), bare elsewhere (the
request guard, pages, API routes, components and the database layer have no
tests of their own).

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                               | Where              | Required?                    | Catches                                                                      |
| ---------------------------------- | ------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| lint + typecheck + build           | local + CI         | required                     | syntactic / type drift                                                       |
| existing unit tests                | local + CI         | required                     | logic regressions in pure code                                               |
| smoke against local Supabase       | CI                 | required                     | broken sign-in, ingest and page rendering end to end                         |
| time and number guard tests        | local + CI         | required after §3 Phase 1    | stale-as-fresh, wrong figures, boundary errors                               |
| push-to-page integration suite     | CI on PR           | required after §3 Phase 2    | broken real path, history downgrade on replay or disorder                    |
| access and input integration suite | CI on PR           | required after §3 Phase 3    | non-owner access, Origin and token rule drift, unsafe notes and lab text     |
| request-guard unit tests           | local + CI         | required (in `npm test`)     | Origin, token exemption, protected-route prefix, unlisted routes, HTML sinks |
| post-edit check on the services    | local (agent loop) | recommended after §3 Phase 4 | regressions at edit time                                                     |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: next to the unit, as `<module>.test.ts` under `src/`.
- **Naming**: `<module>.test.ts`; synthetic data only, never real household or lab values.
- **Reference test**: `src/lib/services/period-summary.test.ts` (injected clock, mock query chain, boundary cases).
- **Reference for an injected clock with literal thresholds**: `src/lib/services/staleness-surfaces.test.ts`. One fixed ISO clock (CEST or CET in a comment, no fake timers), one `it.each` table with a row per surface, the thresholds written as literals from `docs/logic.md` and not imported, so a drifting constant turns its own row red. Per row: exactly at the threshold, one millisecond beyond, a time ahead of the clock at the skew edge and one millisecond beyond, and a text written just before Warsaw midnight.
- **Run locally**: `npm test` (single file: `npx vitest run <path>`).

### 6.2 Adding an integration test

- **Location**: `tests/integration/<topic>.test.ts`, outside `src`, with its own config `vitest.integration.config.ts`. `npm test` and Stryker never collect it. Files run one after another, not in parallel.
- **Helpers** (`tests/integration/support/`):
  - `stack.ts`: `requireStack` refuses a missing env, a non-local or non-`http:` URL and any key that is not an anon key (`sb_publishable_` or a JWT with role `anon`), and never skips; `anonClient`; `ownerClient` signs up a user (every local user is an owner through the seed trigger).
  - `push.ts`: `push()` mirrors the route (`handleIngest` plus `rpc("ingest_push")`) with the public seed token.
  - `bodies.ts`: `baseBody`, `dailyRow`, `hourRow`, `summary`, `recommendation`, `billForecast`, with invented figures only; `billForecast` re-dates `generated_at` and `month` of `scripts/fixtures/bill-forecast/lab-shape.json`.
  - `keys.ts`: `freshDays`, `emptyWeek`, `emptySummaryDay`, `freshWindowHours`, `windowHours`, `nextCapturedAt`, `olderCapturedAt`.
  - `warsaw-day.ts`: the clock hours of a Warsaw day (23 to 25).
  - `privileged.ts`: the one place the suite runs as postgres. `requirePrivileged` resolves `SUPABASE_DB_URL` or the local default `postgresql://postgres:postgres@127.0.0.1:54322/postgres` and refuses any host but 127.0.0.1 or localhost; `withPrivileged(fn)`; `nonOwnerClient()` signs up and then deletes that user's `app_owners` row (the seed trigger stays enabled, so no global state changes); `insertToken`, `revokeToken`, `deleteToken` for a second ingest token (label made unique); `removeUser`. Use it only for states the anon-key client cannot reach, and always remove what a test creates in `afterAll`.
- **Isolation**: the database is never reset, and `live_state`, `bill_forecast` and the newest recommendation are global. So:
  - Use the real "now" with a strictly increasing `captured_at` (`nextCapturedAt`).
  - Each test seeds its own first state.
  - Keys for absence checks are drawn far in the past and verified absent first (`freshDays`, `emptyWeek`, `emptySummaryDay`).
  - Filter a loaded window to the test's own keys before a view mapper.
  - A positive assertion on a shared row uses a value that differs per run (derived from the millisecond clock, so a stored row of an earlier run is very unlikely to equal it).
- **Pitfall, hourly keys**: `ingest_push` deletes every hour older than 35 days in the same call, so a far-past hour never holds a row and an "absent" check on one proves nothing. Hourly keys that must stay stored, or be proven absent, come from `freshWindowHours` (10 to 28 days back, loads well under 1 kWh).
- **Dashboard interaction**: every complete Warsaw day the suite puts in the 35-day window keeps every load at or below 1 kWh (single loads in incomplete blocks may be higher but stay far below smoke's 9.5 kWh), because smoke's day (4 days back, heaviest hour 9.5 kWh) must stay the heaviest on the dashboard. The history-safety complete day is 7 days back.
- **Control per guard**: every guard test also shows that a newer push does change the row, so a store that ignored every push could not pass.
- **Known gaps**: pinned as in §6.5. The name starts with `KNOWN GAP` and the comment says what a fix would change. There are five: lower daily total, null daily total, fewer hourly samples, far-future `built_at`, repeated `generated_at`.
- **Reading back**: use the owner's real loaders and view mappers. Some columns are not loaded or not readable (`loadPeriodSummary` omits `facts`; `hourly_energy.captured_at` is not readable by owners), so read those with a direct owner select. Owners can read `ingest_pushes` columns `source, captured_at, received_at, payload`, not `token_id` or `payload_hash`.
- **Expected values**: invented literals, or hand arithmetic in a comment. Never read them from `docs/ingest/example-v1.json` or the live-flow and recommendation fixtures (provenance unconfirmed).
- **Run locally**: the stack runs on the UGREEN. Start the relay (`scripts/remote-docker.sh relay-start`) and take only `API_URL` and `ANON_KEY`: `scripts/remote-docker.sh exec npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)='` (as CI does; the unfiltered output also carries secret keys, which must not reach logs, `.env` or commits). Then `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<anon key> npm run test:integration` (the relay's default also carries 54322, which the access tests need). The suite overwrites the newest live, bill and recommendation rows and prunes old rows (every push prunes raw pushes older than 14 days and hours older than 35 days), so run it only on a stack that receives no real lab pushes. Prerequisite details: `docs/prerequisites.md`.
- **Run in CI**: the step follows smoke in the `smoke` job and reuses its stack; a smoke failure skips it.
- **Ordering with smoke**: both push the newest `live_state` and `bill_forecast`. The suite pushes `captured_at` = now, newer than smoke's `freshPush` (now minus 60 s), so smoke within about 60 s after the suite fails two steps: "dashboard shows the bill forecast card" and "dashboard shows the fresh live state" (as when smoke is rerun within a minute; the live state step can pass by coincidence when the last file's state push carries the same figure). Run smoke first or wait over a minute. In CI smoke runs first.
- **Owner writes**: write to `day_notes` with `{ count: "exact" }` and no `.select()`, like the app; asking for the row back is refused for the owner too, because `user_id` is not readable.
- **Reference tests**: `tests/integration/history-safety.test.ts` (replay, order, gaps, prune, known gaps), `tests/integration/push-to-page.test.ts` (a lab-shaped push read back through the loaders and view mappers), `tests/integration/access-abuse.test.ts` (anon and non-owner reads and writes with an owner control, ingest tokens, column grants), `tests/integration/notes-parity.test.ts` (the database check next to the server rule).

### 6.3 Adding an e2e test

- TBD — not planned in this rollout; see §3 for why. Add a phase through `--refresh` if a browser-only risk appears.

### 6.4 Adding a test for a new API endpoint

- **Record the guard**: add the route to the table in `src/lib/route-guards.test.ts` (method, guard `middleware-prefix`, `handler-session`, `token` or `public`, mutates yes or no). The test fails on a page or route with no entry, so a new owner page outside `/dashboard` cannot ship unguarded.
- **Origin and token rules**: add a row to the tables in `src/middleware.test.ts` (fake context, `next` spy, hand-written expected status and whether the session lookup ran). A new mutating `/api/*` route needs no row if it is cookie-authenticated: the table already proves a missing, `"null"`, foreign or differently shaped Origin is refused. Never add a cookie-authenticated route to the token exemption; the exact-set test turns red if you do.
- **Reads and writes by a non-owner**: in `tests/integration/access-abuse.test.ts` seed a fresh row, read it as anon and as `nonOwnerClient()`, then as the owner as the control. Accept an error or no rows for a denial, but require that no data came back and no row changed.
- **Ingest tokens**: `insertToken`, `revokeToken`, `deleteToken` from `privileged.ts`; call `ingest_push` directly with the anon client, expect `P0401` for an unknown, empty or revoked token and check through the owner that nothing was written.
- **Run**: `npm test` for the unit tables; `npm run test:integration` against the local stack for the rest.

### 6.5 Adding a test for time, boundary or "enough data" logic

- **Clock**: pass `now` or `today` as an argument; a fixed ISO string with the Warsaw offset in a comment (UTC+1 winter, UTC+2 summer). No fake timers, no wall clock, no TZ setting.
- **Expected values**: a literal from `docs/logic.md` or hand arithmetic written in a comment next to the case. Never import the production constant or read the figure off the code under test; the arithmetic in the comment is what makes the test independent.
- **Edges**: for every threshold, the exact edge (the milder status) and one unit beyond (1 ms where the unit allows); both sides of each day and month boundary, the two DST days (23 and 25 hours) and the year end; for "enough data" rules, exactly one day short and exactly enough.
- **Tables**: `it.each` with one row per surface or boundary and the expected outcome listed by hand per row. For a directory of fixtures, a table keyed by file name that fails on a file without an entry or an entry without a file, so a new fixture cannot be added unclassified.
- **Known gaps**: a hole the owner chose not to guard is pinned by a test whose name starts with `KNOWN GAP` and whose comment says what a fix should change, so a later fix flips it knowingly. Display rounding is a source of such gaps: compare the unrounded value and check what the text prints beside it.
- **Reference tests**: `src/lib/services/staleness-surfaces.test.ts`, `src/lib/ingest/bill-forecast-fixtures.test.ts`, `src/lib/services/period-rating.test.ts`.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

- **Phase 1 (time and number guards):** most thresholds already had exact-edge tests; the real value was two behaviour holes that tests alone could not prove (a future time read as current; a closed-month amount had no ceiling), so the phase paired each with a small guard. Check what a guard protects against before testing it: the contract already rejected negative money, so the sign guard is defence in depth only.
- A "synthetic" example fixture can carry real household values; confirm provenance before copying one, and keep new fixtures fully invented.
- **Phase 2 (push-to-page integration):** the store already guarded most of risk #4 in SQL (replay, order, narration), so the real finds were three unguarded holes, pinned and not fixed (a newer lower or empty total, a far-future `built_at`, a repeated `generated_at`), and that far-past hourly keys are pruned by every push, which makes an absence check on them meaningless.
- The smoke gap for the hourly card is closed by a complete-day step in `scripts/smoke.mjs`; the non-owner and second-token tests stay in Phase 3.
- **Phase 3 (access and input abuse):** the guards were right, and what was missing was proof. The finds were about assumptions, not code: the research said zod counts UTF-16 units (it counts code points, like Postgres, so emoji are not a gap); owners cannot ask for a written `day_notes` row back (`RETURNING` needs the unreadable `user_id`); and a non-owner needs a privileged connection that the anon-key suite deliberately lacks, so the phase added `privileged.ts`. Three differences are pinned as `KNOWN GAP` tests (database `btrim` vs server `trim`, trim-then-max, the table-level `recommendations` grant). Running smoke twice within a minute fails the bill-forecast step (an ordering effect already documented under §6.2), which looks like a regression when it is not.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **The lab's Python code** — it lives in a separate repository with its own tests; this plan stays on the app. Re-evaluate if the lab scripts move into this repository. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-05
- Stack versions last verified: 2026-10-01
- AI-native tool references last verified: 2026-10-01 (none referenced)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
