# Refactor opportunities Implementation Plan

## Overview

A behaviour-preserving cleanup in four phases: one shared guard module for the three copied local-stack test guards, then the cheap duplicates found by research in `src/lib`, in the API routes and page frontmatter, and in the Astro components. No user-visible text, route, schema or contract changes.

## Current State Analysis

Research (`research.md`, HEAD `de23f69`) found no inline debt, only duplication. In scope here:

- Three copies of the local-host allowlist and two near-verbatim DB-URL and stack-env guards in `tests/e2e/support/env.ts`, `tests/integration/support/stack.ts`, `tests/integration/support/privileged.ts`. `tests/support/` does not exist. `tests/integration/db-url-guard.test.ts` covers only the two DB-URL guards, not `requireStack`, `requireStackEnv` or `jwtRole`.
- `getClient()` inside `orLoadError(...)` repeated 14 times in `dashboard.astro`, `dashboard/history.astro`, `dashboard/alerts.astro`.
- The sentence "Spróbuj odświeżyć stronę." hand-written 18 times in 13 files under `src/components` and `src/pages`.
- A 5-minute skew constant in 3 read-side services, `formatAge` in `live-state.ts` imported by three unrelated services, `capitalize` in 3 files, an empty "insufficient" status in 4 files, `byDay` twice, one column list twice, `json()` twice in API routes, `bearerToken` twice in services, one API route without the `prerender` flag.

## Desired End State

- One pure module `tests/support/local-guards.ts` backs all three test guards; its refusals are covered by one shared test table that includes the stack-env guards.
- Each duplicate above exists once. Existing exported names that tests import keep working or the test import line is updated; no assertion changes.
- `npm run lint`, `npm test`, `npx astro check`, `npm run build`, `npm run contract:export` (no diff) and the CI `integration` and `e2e` jobs are green after every phase.

### Key Discoveries:

- `tests/integration/db-url-guard.test.ts:22-25` already imports across `tests/e2e` and `tests/integration`, so a relative import of a shared module works for both vitest and Playwright.
- `src/lib/supabase.ts:7-21` has its own runtime anon-key check (weaker than the test one). It is left alone (decision below).
- `src/lib/services/live-state.load.test.ts:8` pins that `live-state` builds its `Intl` formatter on import, and `staleness-surfaces.test.ts:230-231` pins `FORECAST_FUTURE_SKEW_MS` and `FUTURE_SKEW_MS` at 300000; both constrain the moves below.
- `src/lib/ingest/contract.ts` (Stryker mutate set, write side) has its own skew and hour constants; it stays untouched.
- Astro components have no unit tests; page frontmatter is covered only by build, type check and the e2e alert-rules spec.

## What We're NOT Doing

- No change to `src/lib/supabase.ts` anon-key rules; the weaker app-side check stays (owner decision).
- Not merging the `tooFew` variants, `wholeNumber` (pinned by the `live-state` load test), the `toFixed(1)` SVG helpers, or the 12 `KNOWN GAP` pins.
- No large-file splits (`bill-forecast.ts`, `live-state.ts`, `calendar-view.ts`, `LiveFlow.tsx`), no test fixture builders or seed-token constants, no CI composite action, no token-script merge, no `LibBadge.astro` deletion (needs a `docs/decisions.md:162` edit and owner confirmation), no `contract.ts`, migration, schema or `INGEST_CONTRACT_VERSION` change.
- No edit to `context/foundation/test-plan.md` (frozen strategy), to archives, or to other changes' reviews.

## Implementation Approach

Characterize first, then move: add tests that pin current behaviour, make the move, keep the same tests green. One change, one PR, four phases, one commit per phase. Each phase leaves all gates green. Phase 1 comes first because it is the only lesson-backed item and the safety-critical one.

## Phase 1: Shared local-stack guard module

### Overview

Replace three copies of a safety guard with one pure module, covered by one table (lesson "A safety guard that exists as copies is fixed in all copies at once").

### Changes Required:

#### 1. Extend the shared guard table first

**File**: `tests/integration/db-url-guard.test.ts`

**Intent**: Pin current refusals of `requireStack` and `requireStackEnv` before moving code, so the extraction is checked against the old behaviour.

**Contract**: Add a second `describe.each` over `requireStack` (integration) and `requireStackEnv` (e2e) with `SUPABASE_URL`/`SUPABASE_ANON_KEY` set and restored per test. It must refuse: a non-local host, a non-URL, `https:`, an `sb_secret_` key, a JWT with `role: service_role`, a non-anon JWT, a key that is neither `sb_publishable_` nor role `anon`; it must accept the local URL with an `sb_publishable_` key and with a JWT of role `anon`; missing values must throw; no refusal contains the key. Refusal messages must still match `/Refusing|must/` as today.

#### 2. Create the shared module

**File**: `tests/support/local-guards.ts` (new)

**Intent**: Hold the single copy of `LOCAL_HOSTS`, `jwtRole`, the DB-URL resolution (default URL, overriding-parameter refusal) and the stack URL/key checks. No supabase-js, no `pg`, no Node-only globals beyond `Buffer` and `process`.

**Contract**: `resolveLocalDbUrl(context: string): string` and `resolveLocalStack(context: string): { url: string; anonKey: string }`, where `context` supplies the wording ("integration suite", "e2e run", "e2e teardown") so each caller keeps its current refusal text. Messages must not echo passwords or keys. Behaviour per case is exactly today's.

#### 3. Point the three callers at it

**Files**: `tests/e2e/support/env.ts`, `tests/integration/support/stack.ts`, `tests/integration/support/privileged.ts`

**Intent**: Keep the exported names (`requireStackEnv`, `requireDbUrl`, `requireStack`, `requirePrivileged`) and their return types; reduce each body to a call into the shared module with its own wording. Remove the local `LOCAL_HOSTS`, `jwtRole`, `OVERRIDING_PARAMS`, `DEFAULT_DB_URL`. Update the comment in `stack.ts` that says the rule is replicated.

**Contract**: `requireStackEnv` still returns `url` without trailing slash; `requireStack` returns `url` as given (today's difference is kept). The e2e RECIPE text stays in `env.ts`.

#### 4. Record the decision

**File**: `docs/decisions.md`

**Intent**: Dated entry: the three test guards share one module; `src/lib/supabase.ts` keeps its own runtime check on purpose (it imports `astro:env/server` and the owner chose not to change production behaviour).

### Success Criteria:

#### Automated Verification:

- Guard table passes against the OLD copies before the move: `npm run test:integration -- db-url-guard`
- Same table passes after the move: `npm run test:integration -- db-url-guard`
- `grep -rn "LOCAL_HOSTS" tests` returns exactly one definition (in `tests/support/local-guards.ts`)
- Lint and types pass: `npm run lint` and `npx astro check`
- Unit tests pass: `npm test`
- E2E config still loads: `npx playwright test --list`

#### Manual Verification:

- CI `integration` and `e2e` jobs are green on the PR (the local stack needs the owner's OK to start)
- Temporarily setting `SUPABASE_URL=http://example.com` makes `npm run test:integration` refuse with the same wording as before

**Implementation Note**: After this phase and its automated checks, pause for manual confirmation before Phase 2.

---

## Phase 2: Shared time and status helpers in `src/lib`

### Overview

Remove the duplicated constants and helpers in `src/lib` without changing any label or threshold.

### Changes Required:

#### 1. Time units, skew and `formatAge`

**File**: `src/lib/format/age.ts` (new); importers `src/lib/services/live-state.ts`, `alert-evaluation.ts`, `bill-forecast.ts`, `recommendation.ts`, `src/lib/format/warsaw-time.ts`

**Intent**: One home for `MINUTE_MS`, `HOUR_MS`, `DAY_MS`, a `CLOCK_SKEW_MS` (5 minutes) and `formatAge`, so unrelated services stop importing `live-state`. The three services keep exporting `LIVE_FUTURE_SKEW_MS`, `FORECAST_FUTURE_SKEW_MS`, `FUTURE_SKEW_MS` as aliases of the shared value (tests pin those names).

**Contract**: `formatAge` output is unchanged for every input. `warsaw-time.ts` keeps exporting `HOUR_MS` (hourly-usage imports it). `live-state.test.ts` imports `formatAge` from the new module; `live-state.load.test.ts` keeps its intent by probing another export of `live-state` that exists after the move (a test import/probe edit only, no assertion value changes). `src/lib/ingest/contract.ts` is not touched.

#### 2. `capitalize`

**File**: `src/lib/format/values.ts`; remove copies in `calendar-view.ts:95`, `period-rating.ts:101`, `src/components/live/FlowNode.tsx:82`, inline copy in `format/status.ts:21`

**Intent**: One exported `capitalize`; `calendar-view.test.ts:10` import line is updated; `LiveFlow.tsx` and `FlowNode.tsx` import it.

**Contract**: Same result as `text.charAt(0).toUpperCase() + text.slice(1)` for all strings (check the three existing bodies agree on the empty string before merging; if one differs, keep that one separate and say so in the commit).

#### 3. One empty status

**File**: `src/lib/format/status.ts`; sites `HourlyUsageCard.astro:21`, `calendar-view.ts:92`, `hourly-usage.ts:192`, `usage-insight.ts:173`

**Intent**: Export `NO_STATUS` (`{ tone: "insufficient", label: "" }`) next to `LOAD_FAILED` and use it at the four sites. `live-state.ts:371` has a non-empty label and is left alone.

**Contract**: If `NEUTRAL` is exported from `calendar-view.ts` and imported by `MonthView.astro`/`DayView.astro`/tests, replace those imports; nothing else about the view models changes.

#### 4. Small shared pieces

**Files**: `src/lib/services/complete-day.ts` (`byDay`, from `calendar-view.ts:328` and `period-rating.ts:153`), `src/lib/services/calendar-data.ts` (export a `DAILY_COLUMNS` string used also by `usage-insight.ts:68`)

**Intent**: One copy each. The column list text must stay byte-identical.

#### 5. Record the decision

**File**: `docs/decisions.md`

**Intent**: Dated entry: skew constants share one value but keep their names; `contract.ts` and `wholeNumber` deliberately not merged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass with no assertion edits: `npm test`
- Lint and types pass: `npm run lint` and `npx astro check`
- Build passes: `npm run build`
- Contract schema unchanged: `npm run contract:export` leaves `git diff --stat docs/ingest` empty
- `grep -rn "function capitali" src` shows one definition
- `grep -rn "tone: \"insufficient\", label: \"\"" src` shows only `NO_STATUS`
- Integration suite passes in CI: `npm run test:integration`

#### Manual Verification:

- Dashboard and `/dashboard/history` render with the same status words and ages as before (compare against production or a pre-change screenshot)

---

## Phase 3: API route and page-load helpers

### Overview

Share the route plumbing and the repeated Supabase-client-or-fallback wrapper.

### Changes Required:

#### 1. JSON response helper

**Files**: `src/lib/http.ts` (new), `src/pages/api/ingest.ts:7`, `src/pages/api/alerts/evaluate.ts:8`, and `src/pages/api/health.ts` only if its inline headers are identical

**Intent**: One `jsonNoStore(status, body)` with `Cache-Control: no-store` and `application/json; charset=utf-8`.

**Contract**: Response status, headers and body bytes are unchanged for every route.

#### 2. Bearer token parser

**Files**: `src/lib/services/bearer-token.ts` (new) with a unit test; `src/lib/services/ingest.ts:26`, `alerts-evaluate.ts:42`

**Intent**: One `bearerToken(request)`. The ingest stage order (header, token, Content-Length, streamed read, JSON parse, validate, RPC) and the 401 for a bad token independent of the body stay exactly as they are.

**Contract**: Same regex semantics; the new test pins a missing header, `Bearer x`, `bearer x` (case-insensitive), extra spaces, a token with inner whitespace (null), trailing whitespace.

#### 3. Prerender flag

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Add `export const prerender = false` as CLAUDE.md requires. No runtime change under `output: "server"`.

#### 4. Client-or-fallback helper

**Files**: `src/lib/load-with-client.ts` (new, pure, generic over the client type so it is testable without `astro:env`) with a unit test; the uniform sites in `src/pages/dashboard.astro`, `dashboard/history.astro`, `dashboard/alerts.astro`

**Intent**: Replace `const supabase = getClient(); return supabase ? await loadX(supabase, …) : FALLBACK` with one call. Sites that use the client more than once (the `dashboard.live-state` loader) stay as written.

**Contract**: `withClient(getClient, load, fallback)` returns `fallback` without calling `load` when the client is `null`; otherwise returns `await load(client)`; errors propagate so `orLoadError` still logs them with the same section name.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the two new tests: `npm test`
- Lint, types, build pass: `npm run lint`, `npx astro check`, `npm run build`
- Integration suite passes (ingest and alerts-evaluate paths): `npm run test:integration`
- Smoke test passes against a local server and local Supabase only: `npm run smoke`
- `grep -c "const supabase = getClient()" src/pages/dashboard.astro src/pages/dashboard/history.astro src/pages/dashboard/alerts.astro` is lower than 14 in total; the sites that remain are listed in the commit message

#### Manual Verification:

- `/dashboard`, `/dashboard/history` and `/dashboard/alerts` load with data as before
- `npm run test:e2e` (alert rules) passes on a local stack

---

## Phase 4: Component dedupes

### Overview

Make the refresh hint and the shared form button classes single-source in the UI.

### Changes Required:

#### 1. Refresh hint component

**Files**: `src/components/RefreshHint.astro` (new); the 18 occurrences in `RecommendationCard`, `HourlyUsageCard`, `TodaySummaryCard`, `BillForecastCard`, `UsageInsightCard`, `LiveStateCard`, `AlertRulesPanel`, `MonthView`, `DayView`, `DayNotePanel`, `QuarterView`, `TotalsPanel`, and `pages/dashboard/history.astro:254`

**Intent**: Render the one sentence in one place. The surrounding `StatusBadge` wrappers and every `data-testid` stay where they are.

**Contract**: Props: an optional `class` merged with `cn()` for the `mt-2` variant. Default classes are `text-muted-foreground text-sm`. Rendered text is byte-identical.

#### 2. Shared form button classes

**Files**: `src/components/ui/form-classes.ts` (new); `src/components/alerts/AlertRulesPanel.astro:41-48`, `src/components/history/DayNotePanel.astro:21-27`

**Intent**: Export the three character-identical constants (`SUMMARY_CLASS`, `SUBMIT_CLASS`, `DELETE_CLASS`) once and import them in both panels; `OUTLINE_CLASS`, `INPUT_CLASS`, `LABEL_CLASS` stay local.

**Contract**: Rendered class strings are identical, so the e2e alert-rules locators are unaffected.

### Success Criteria:

#### Automated Verification:

- `grep -rn "Spróbuj odświeżyć stronę" src` shows only `RefreshHint.astro`
- Lint, types, build pass: `npm run lint`, `npx astro check`, `npm run build`
- Unit tests pass: `npm test`
- `grep -rn "SUBMIT_CLASS =" src` shows one definition
- E2E alert-rules passes in CI: `npm run test:e2e`

#### Manual Verification:

- Alerts page and a day-note form look unchanged (buttons, summary row)
- A card in a load-error state still shows the hint text and the same status badge (check in a dev server with Supabase unreachable, or via the built HTML of the component)

---

## Testing Strategy

### Unit Tests:

- New: `bearer-token`, `load-with-client`. Extended: guard table in `db-url-guard.test.ts`.
- All other existing tests stay unchanged except import lines (`formatAge`, `capitalize`, `NEUTRAL` if exported).
- The 12 `KNOWN GAP` tests, `ingest-golden`, `ingest-retention` and the contract drift test must pass untouched.

### Integration Tests:

- `npm run test:integration` after Phases 1 to 3, authoritative in CI; local runs need the relay and the owner's explicit OK.

### Manual Testing Steps:

1. Open `/dashboard`, `/dashboard/history`, `/dashboard/alerts` and compare with before.
2. Point `SUPABASE_URL` at a non-local host and confirm both test guards refuse as before.

## Performance Considerations

None: only moves and de-duplication.

## Migration Notes

No migration, no schema, no production step. `docs/prerequisites.md` is unaffected. Nothing to roll back beyond reverting a phase commit.

## References

- Related research: `context/changes/refactor-opportunities/research.md`
- Deferred follow-up that this closes: `context/changes/e2e-alert-rules/follow-ups/review-fixes.md:3`
- Lesson: `context/foundation/lessons.md` ("A safety guard that exists as copies is fixed in all copies at once")
- Precedent: `context/archive/2026-10-06-refactor-push-boundary/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared local-stack guard module

#### Automated

- [x] 1.1 Guard table passes against the OLD copies before the move: `npm run test:integration -- db-url-guard` — 11727ea
- [x] 1.2 Same table passes after the move: `npm run test:integration -- db-url-guard` — 11727ea
- [x] 1.3 `grep -rn "LOCAL_HOSTS" tests` returns exactly one definition (in `tests/support/local-guards.ts`) — 11727ea
- [x] 1.4 Lint and types pass: `npm run lint` and `npx astro check` — 11727ea
- [x] 1.5 Unit tests pass: `npm test` — 11727ea
- [x] 1.6 E2E config still loads: `npx playwright test --list` — 11727ea

#### Manual

- [ ] 1.7 CI `integration` and `e2e` jobs are green on the PR (the local stack needs the owner's OK to start)
- [ ] 1.8 Temporarily setting `SUPABASE_URL=http://example.com` makes `npm run test:integration` refuse with the same wording as before

### Phase 2: Shared time and status helpers in `src/lib`

#### Automated

- [x] 2.1 Unit tests pass with no assertion edits: `npm test` — 8e3bd4b
- [x] 2.2 Lint and types pass: `npm run lint` and `npx astro check` — 8e3bd4b
- [x] 2.3 Build passes: `npm run build` — 8e3bd4b
- [x] 2.4 Contract schema unchanged: `npm run contract:export` leaves `git diff --stat docs/ingest` empty — 8e3bd4b
- [x] 2.5 `grep -rn "function capitali" src` shows one definition — 8e3bd4b
- [x] 2.6 `grep -rn "tone: \"insufficient\", label: \"\"" src` shows only `NO_STATUS` — 8e3bd4b
- [ ] 2.7 Integration suite passes in CI: `npm run test:integration`

#### Manual

- [ ] 2.8 Dashboard and `/dashboard/history` render with the same status words and ages as before (compare against production or a pre-change screenshot)

### Phase 3: API route and page-load helpers

#### Automated

- [x] 3.1 Unit tests pass, including the two new tests: `npm test` — 242746d
- [x] 3.2 Lint, types, build pass: `npm run lint`, `npx astro check`, `npm run build` — 242746d
- [ ] 3.3 Integration suite passes (ingest and alerts-evaluate paths): `npm run test:integration`
- [ ] 3.4 Smoke test passes against a local server and local Supabase only: `npm run smoke`
- [x] 3.5 `grep -c "const supabase = getClient()"` over the three pages is lower than 14 in total; remaining sites listed in the commit message — 242746d

#### Manual

- [ ] 3.6 `/dashboard`, `/dashboard/history` and `/dashboard/alerts` load with data as before
- [ ] 3.7 `npm run test:e2e` (alert rules) passes on a local stack

### Phase 4: Component dedupes

#### Automated

- [x] 4.1 `grep -rn "Spróbuj odświeżyć stronę" src` shows only `RefreshHint.astro`
- [x] 4.2 Lint, types, build pass: `npm run lint`, `npx astro check`, `npm run build`
- [x] 4.3 Unit tests pass: `npm test`
- [x] 4.4 `grep -rn "SUBMIT_CLASS =" src` shows one definition
- [ ] 4.5 E2E alert-rules passes in CI: `npm run test:e2e`

#### Manual

- [ ] 4.6 Alerts page and a day-note form look unchanged (buttons, summary row)
- [ ] 4.7 A card in a load-error state still shows the hint text and the same status badge
