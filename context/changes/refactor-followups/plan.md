# Refactor follow-ups Implementation Plan

## Overview

Follow-ups to the merged `refactor-opportunities` change (PR #149): fix the low-severity leftovers its review found, finish the safest remaining dedupes, and align the app's anon-key check with the test guards. Delivered as three PRs from one change: PR A (phases 1-3, behaviour-preserving), PR B (phase 4, warn-only anon-key module) and PR C (phase 5, enforcement after production logs are clean).

## Current State Analysis

`research.md` (HEAD `2e5715e`) found no behaviour change or weakened test in the merged refactor, only low-severity leftovers. Remaining deferred items are smaller than first thought. The app's `assertAnonKey` (`src/lib/supabase.ts:6-23`) rejects only `sb_secret_` keys and `service_role` JWTs, and the test guards (`tests/support/local-guards.ts`) additionally require `sb_publishable_` or role `anon`. The production key format is not recorded anywhere in the repo.

## Desired End State

- No leftover copies of `capitalize`, `HOUR_MS` re-export, or misplaced `formatAge` tests; the guard table covers trailing-slash behaviour.
- Test helpers use the shared time units, one seed-token export and one `uniqueUser()`; `LibBadge.astro` is gone; `calendar-view.ts` copy constants and `LiveFlow.tsx`'s `buildNodes` live in their own modules with tests.
- One pure `src/lib/anon-key.ts` classifies keys for both the app and the test guards. Production first warns (labelled, key never logged), then enforces once logs show a clean run.
- `npm run lint` (on `src`, `tests`, `scripts`), `npm test`, `npx astro check`, `npm run build` and the CI jobs `ci`, `smoke`, `integration`, `e2e` are green for every PR.

### Key Discoveries:

- `src/lib/format/age.ts` already exports the time units; 13 test files redefine them (`research.md`, section C).
- `middleware.ts:38` calls `createClient` on every request except the two bearer routes, so a throwing key check is a site-wide 500 (`research.md`, section B); audit row S7 describes the same failure for today's check.
- `tests/support/local-guards.ts` is pure and CI already runs the strict rule through integration and e2e, so the CI key already satisfies it.
- `src/middleware.test.ts:14-29` shows how to mock `astro:env/server` for a module that imports it.
- `LiveFlow.tsx` (393 lines) has no component test; `buildNodes` is pure but not exported.

## What We're NOT Doing

- No change to ingest contract, migrations, `contract.ts`, the three skew aliases, or `wholeNumber` (pinned by a load test).
- No CI composite action, no token-script merge, no `smoke.mjs`/`push-fixture.mjs` shared lib, no split of `toBillForecastView` or `live-state.ts` (owner chose "two safe splits only").
- No shared `row()` builder (only one identical pair of five), no shared test `now` constant (6 different values), no vitest alias merge (5 lines).
- No `Object.freeze` on `NO_STATUS` (nothing mutates it); no import-order change in `alerts-evaluate.ts` (eslint passes).
- No anon-key enforcement before production logs show a clean run; no key value, prefix or length is ever logged.
- No edit to archives or to `context/foundation/test-plan.md`.

## Implementation Approach

Characterize first, then move, with one commit per phase and all gates green after each. PR A carries phases 1-3. Phase 4 ships as PR B. Phase 5 is PR C and starts only after the manual production check at the end of phase 4. Every phase that changes a rule or a decision adds a dated entry to `docs/decisions.md` (lessons).

## Phase 1: Review leftovers

### Overview

Close the low-severity findings of the review of #149.

### Changes Required:

#### 1. Last capitalize copies

**Files**: `src/components/HourlyUsageCard.astro:35`, `src/components/LiveStateCard.astro:127`, `src/components/UsageInsightCard.astro:63`

**Intent**: Use the shared helpers instead of inline `charAt(0).toUpperCase()` code.

**Contract**: `HourlyUsageCard` imports `sentence` from `@/lib/services/calendar-view`; the other two import `capitalize` from `@/lib/format/values`. Rendered text is unchanged.

#### 2. `HOUR_MS` re-export and stale comment

**Files**: `src/lib/format/warsaw-time.ts:77-80`, `src/lib/services/hourly-usage.ts`, `src/lib/format/warsaw-time.test.ts`, `tests/integration/support/keys.ts:2`

**Intent**: Drop `export { HOUR_MS }` and move the "Clock hours in Warsaw" comment back onto the code it describes; importers take `HOUR_MS` from `@/lib/format/age`.

**Contract**: `warsaw-time.ts` still imports `DAY_MS` and `HOUR_MS` from `age.ts` for its own use. The three importers (two have multi-line import blocks, so check with the type check, not only grep) take `HOUR_MS` from `@/lib/format/age`.

#### 3. Tests for `formatAge` where it lives

**Files**: `src/lib/format/age.test.ts` (new), `src/lib/services/live-state.test.ts:318-332`

**Intent**: Move the `formatAge` table (not the "feeds the age label from the capture time" case) next to the function.

**Contract**: Same cases and expected strings; the moved table must go red if `formatAge`'s thresholds are changed.

#### 4. Guard table gaps

**File**: `tests/integration/db-url-guard.test.ts`

**Intent**: Pin the one remaining behavioural difference between the two stack guards.

**Contract**: `requireStackEnv` strips trailing slashes from `SUPABASE_URL`; `requireStack` returns it as given. One case each.

### Success Criteria:

#### Automated Verification:

- No inline capitalize copy remains: `grep -rn "charAt(0).toUpperCase" src` shows only `src/lib/format/values.ts`
- `HOUR_MS` is no longer re-exported: `grep -n "export { HOUR_MS }" src/lib/format/warsaw-time.ts` finds nothing
- New and moved tests pass, including `src/lib/format/age.test.ts`: `npm test`
- Guard table passes with the new cases: `npm run test:integration -- db-url-guard`
- Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build`

#### Manual Verification:

- The three cards render the same capitalised text as before

**Implementation Note**: After this phase and its automated checks, pause for manual confirmation before Phase 2.

---

## Phase 2: Test helper dedupes and LibBadge

### Overview

Share the helpers research found duplicated in tests, and remove the unused component.

### Changes Required:

#### 1. Time units in tests

**Files**: the 13 test files that define `MIN`, `MINUTE`, `HOUR`, `DAY` or their `_MS` forms (`grep -rln "const \(MIN\|MINUTE\|HOUR\|DAY\)\(_MS\)\? = " src tests`), including `tests/integration/ingest-retention.test.ts`, `history-safety.test.ts`, `support/warsaw-day.ts`

**Intent**: Import `MINUTE_MS`, `HOUR_MS`, `DAY_MS` from `@/lib/format/age` instead of redefining them.

**Contract**: Only where the local value equals 60_000, 3_600_000 or 86_400_000; identifiers are renamed to the `_MS` names. `src/lib/services/live-state.test.ts:342` (`const DAY = "2026-09-25"`, a day string) and `src/lib/ingest/contract.ts:70` (write side) are out of scope and stay as they are.

#### 2. One seed token export

**Files**: `tests/integration/support/push.ts:6` (export `SEED_TOKEN`), `ingest-retention.test.ts:17`, `alert-rules.test.ts:42`, `access-abuse.test.ts:30`, `ingest-boundary.test.ts:16`

**Intent**: The four files that redeclare the local seed token import it. `scripts/smoke.mjs`, `supabase/seed.sql` and `docs/ingest/README.md` stay literal.

**Contract**: The token string is unchanged.

#### 3. `uniqueUser`

**Files**: `tests/integration/support/stack.ts:28-29`, `tests/integration/support/privileged.ts:39-40`

**Intent**: One `uniqueUser(prefix)` returning `{ email, password }` with the same shapes as today, used by `ownerClient` and `nonOwnerClient`. `tests/e2e/auth.setup.ts` keeps its own generator.

**Contract**: Email `integration-<prefix>-<Date.now()>-<random>@example.com` shapes and the password shape stay as they are.

#### 4. Remove `LibBadge.astro`

**Files**: `src/components/ui/LibBadge.astro`, `docs/decisions.md:168`

**Intent**: Delete the unused component and drop `LibBadge` from the "keep their literals" sentence. Add a dated decision entry.

**Contract**: Nothing imports it (checked in research); the build and `astro check` confirm.

### Success Criteria:

#### Automated Verification:

- No duration constant is redefined in tests: `grep -rn "const \(MIN\|MINUTE\|HOUR\|DAY\)\(_MS\)\? = " src tests` shows only `src/lib/format/age.ts`, `src/lib/ingest/contract.ts` and `live-state.test.ts:342` (the day string)
- One seed-token declaration in tests: `grep -rn "local-dev-ingest-token-not-secret" tests` shows only `tests/integration/support/push.ts`
- `LibBadge` is gone: `grep -rn "LibBadge" src tests docs` finds nothing
- Unit tests pass: `npm test`
- Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build`
- Integration suite passes in CI: `npm run test:integration`

#### Manual Verification:

- Nothing on the dashboard, history or alerts pages changed visually

---

## Phase 3: Two safe splits

### Overview

Move the `calendar-view.ts` copy constants out, and extract `buildNodes` from `LiveFlow.tsx`, each behind a safety net.

### Changes Required:

#### 1. Calendar copy constants

**Files**: `src/lib/services/calendar-view.ts:50-117` (the exported string and template constants), `src/lib/services/calendar-copy.ts` (new), importers in `src/components/history/*.astro` and `calendar-view.test.ts`

**Intent**: Hold the long Polish copy (the explanation templates, the `*_WORD` constants, `NO_DAY_DATA`-style reasons) in one module. Constants that need `RATING_*`, `MIN_RANKED_DAYS` or sensor-date values import them from where they are defined.

**Contract**: Every string is byte-identical, `calendar-view.ts` stays the home of the view builders, importers are repointed (`MonthView.astro`, `QuarterView.astro`, `HistoryNotes.astro`, `calendar-view.test.ts`), and there is no re-export shim. `DAY_STATUS_WORD` needs `DayStatus`, a type-only import. The existing 783-line test file is the safety net; it may change import lines only, plus one addition: its wording guard (`import * as calendarView`, L772-775, which scans every exported string for /zawyżon\w* od/i) must also scan `import * as calendarCopy from "./calendar-copy"`, otherwise it silently stops covering the moved strings.

#### 2. `buildNodes` extraction

**Files**: `src/components/live/flow-nodes.ts` (new), `src/components/live/flow-nodes.test.ts` (new), `src/components/live/LiveFlow.tsx:70-152`

**Intent**: First write a characterization test of `buildNodes` against the old code, then move `batteryIcon`, `withDirection`, `NodeData` and `buildNodes` unchanged into `flow-nodes.ts`. For the pre-move test, temporarily `export` `buildNodes` and `NodeData` from `LiveFlow.tsx`; after the move the test imports from `flow-nodes.ts`.

**Contract**: Props are built by hand (the live-flow fixture helpers are private) for: battery charging, each charge level and no level, grid import, export and idle, with and without verdicts. The test asserts ids, labels, `value`, `spoken`, `sub`, `terms`, and compares `Icon` by identity with the lucide imports. Importing `LiveFlow.tsx` in vitest is unproven (no test imports a .tsx from `src/components`): try it first; if it cannot load, move first and prove equality of old and new output with a one-off script before keeping the test. The output of the moved function is identical to the old one.

### Success Criteria:

#### Automated Verification:

- Characterization test passes against the old code before the move and against the moved code after: `npm test -- flow-nodes`
- Break check: breaking a `spoken` or icon branch makes `flow-nodes.test.ts` go red
- Existing calendar tests pass with import edits and the added `calendarCopy` scan in the wording guard: `npm test -- calendar-view`
- Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build`
- E2E and smoke pass in CI: `npm run test:e2e`, `npm run smoke`

#### Manual Verification:

- The live flow diagram and its readings view render the same on `/dashboard`
- The history day, month and quarter pages show the same explanations

---

## Phase 4: Anon-key module, warn-only (PR B)

### Overview

One pure classifier shared by the app and the test guards. The app keeps its current rejections and only warns on an unexpected shape.

### Changes Required:

#### 1. Pure classifier

**Files**: `src/lib/anon-key.ts` (new), `src/lib/anon-key.test.ts` (new)

**Intent**: `classifyAnonKey(key)` returns `"publishable"`, `"anon"`, `"secret"`, `"service_role"` or `"other"`, with no `astro:*` import and no logging.

**Contract**: `sb_secret_` prefix is `secret`; `sb_publishable_` prefix is `publishable`; a three-part JWT whose payload role is `service_role` or `anon` is that class; anything else (non-JWT, bad payload, other roles, extra whitespace) is `other`. The payload is decoded as base64url. The table test covers the cases listed in `research.md`: empty, whitespace-padded, two- and four-part tokens, malformed JSON, non-object payload, `authenticated` role.

#### 2. App check

**Files**: `src/lib/supabase.ts`, `src/lib/supabase.test.ts` (new)

**Intent**: `assertAnonKey` uses the classifier. `secret` and `service_role` still throw the same messages as today; `other` logs one `anon_key_unexpected_shape` warning per process with `{ keyClass: "other" }` and nothing derived from the key, and the client is still created.

**Contract**: The warning goes through `createLogger` (`src/lib/logger.ts`) with `APP_VERSION`/`APP_ENV`. The unit test mocks `astro:env/server` as `src/middleware.test.ts:14-29` does, with all five values `supabase.ts` reads (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_ORIGIN`, `APP_VERSION`, `APP_ENV`), and mocks `@supabase/ssr` and `@supabase/supabase-js` with spy factories (no existing test loads the real packages). It asserts: throws for both dangerous classes, no warning for `publishable` and `anon`, exactly one warning across several calls for `other`, and the warning text never contains the key. That a real client is still created is covered by the CI smoke job.

#### 3. Test guards use it

**File**: `tests/support/local-guards.ts` (import by relative path `../../src/lib/anon-key`)

**Intent**: Replace its own `jwtRole`/prefix logic with the classifier, keeping every refusal message and regex the guard table pins (`/secret or service_role/`, `/must be the anon key/`).

**Contract**: Test-side behaviour is unchanged (it still refuses `other`). Rewrite the header comment (lines 5-6 say `supabase.ts` keeps its own check and "is not shared"): the app now shares the classifier and differs only in warning instead of refusing until phase 5.

#### 4. Docs

**Files**: `docs/decisions.md`, `docs/prerequisites.md`, `docs/architecture.md` (security model line)

**Intent**: Decision entry (shared classifier, warn first, why) that amends the 2026-10-07 entry saying `supabase.ts` keeps its own check; prerequisites gets a manual production step: after deploy, search production logs for `anon_key_unexpected_shape`, and the key itself is never written anywhere.

#### 5. Mutation coverage

**File**: `stryker.config.mjs`

**Intent**: Add `src/lib/anon-key.ts` to the explicit `mutate` list: it decides whether a secret key is refused, and the list names files one by one.

**Contract**: One added entry; `npm run mutate` is on demand and not a gate.

### Success Criteria:

#### Automated Verification:

- Classifier table and app-check tests pass: `npm test -- anon-key supabase`
- Guard table still passes unchanged: `npm run test:integration -- db-url-guard`
- Break check: removing the `service_role` branch of the classifier makes both the classifier test and the guard table go red
- `npx playwright test --list` (with env set) still loads the config through the new relative import
- Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build`
- Integration, smoke and e2e pass in CI

#### Manual Verification:

- After this release is deployed to production and has served real requests, the production logs show no `anon_key_unexpected_shape` event (owner checks)
- Sign-in and the dashboard work as before on production

**Implementation Note**: Phase 5 starts only after the production log check above is confirmed.

---

## Phase 5: Enforce the strict anon-key rule (PR C)

### Overview

The app refuses a key that is neither `sb_publishable_` nor a JWT with role `anon`.

### Changes Required:

#### 1. Enforce in the app

**Files**: `src/lib/supabase.ts`, `src/lib/supabase.test.ts`

**Intent**: The `other` class now throws a labelled message ("SUPABASE_ANON_KEY must be an sb_publishable_ key or a JWT with role anon"), like the two dangerous classes. Remove the warn-once code.

**Contract**: The throw happens in the same two factories as today, so the failure mode and its logging (`unhandled_error` in the middleware) are unchanged. Tests assert all three classes throw and the accepted classes do not.

#### 2. Docs

**Files**: `docs/decisions.md`, `docs/prerequisites.md`

**Intent**: Record enforcement and the rollback. Verified: `/api/health` goes through the middleware (`middleware.ts:38` creates the client), so a throwing key check fails the post-deploy check in `deploy-production.yml:116-123` (version must equal the release SHA) and the compose healthcheck, and the deploy rolls back `release.env`. Rollback does not touch `.env.runtime`, so a rejected key stays in that file and must be fixed there; the old image accepts the `other` class, so rollback restores service. Put that sentence in `docs/prerequisites.md`.

### Success Criteria:

#### Automated Verification:

- Tests assert `other` now throws and `publishable`/`anon` do not: `npm test -- supabase`
- Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build`
- Integration, smoke and e2e pass in CI

#### Manual Verification:

- After deploy, sign-in and `/api/health` work on production (owner checks)

---

## Testing Strategy

### Unit Tests:

- New: `age.test.ts`, `flow-nodes.test.ts`, `anon-key.test.ts`, `supabase.test.ts`; extended: the guard table.
- Existing tests change by import lines only. The 12 `KNOWN GAP` tests, `ingest-golden` and `ingest-retention` stay untouched.

### Integration Tests:

- `npm run test:integration` in CI after every phase; the guard table runs without a stack.

### Manual Testing Steps:

1. Open `/dashboard`, `/dashboard/history` and `/dashboard/alerts` after phases 1-3.
2. After phase 4 is deployed, search production logs for `anon_key_unexpected_shape`.
3. After phase 5 is deployed, sign in and open `/api/health`.

## Performance Considerations

None. The anon-key classifier runs per request as the old check did and does the same amount of work.

## Migration Notes

No database migration. Phase 4 and 5 change start-up behaviour of the app on production, so they are separate releases; rollback is the deploy health check and the previous release. `docs/prerequisites.md` gains the manual log check (lesson: name every prerequisite outside the repo).

## References

- Related research: `context/changes/refactor-followups/research.md`
- Merged change: `context/archive/2026-10-07-refactor-opportunities/` (plan, research, `reviews/archive-sha-repoint.md`)
- Failure mode of a bad key: `context/audits/observability/2026-10-03_1812-lab-push-sign-in-dashboard-reads.md`, row S7
- Lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Review leftovers

#### Automated

- [x] 1.1 No inline capitalize copy remains: `grep -rn "charAt(0).toUpperCase" src` shows only `src/lib/format/values.ts` — 0d0984d
- [x] 1.2 `HOUR_MS` is no longer re-exported: `grep -n "export { HOUR_MS }" src/lib/format/warsaw-time.ts` finds nothing — 0d0984d
- [x] 1.3 New and moved tests pass, including `src/lib/format/age.test.ts`: `npm test` — 0d0984d
- [x] 1.4 Guard table passes with the new cases: `npm run test:integration -- db-url-guard` — 0d0984d
- [x] 1.5 Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build` — 0d0984d

#### Manual

- [ ] 1.6 The three cards render the same capitalised text as before

### Phase 2: Test helper dedupes and LibBadge

#### Automated

- [x] 2.1 No duration constant is redefined in tests: `grep -rn "const \(MIN\|MINUTE\|HOUR\|DAY\)\(_MS\)\? = " src tests` shows only `src/lib/format/age.ts`, `src/lib/ingest/contract.ts` and `live-state.test.ts:342` (the day string) — 81740f1
- [x] 2.2 One seed-token declaration in tests: `grep -rn "local-dev-ingest-token-not-secret" tests` shows only `tests/integration/support/push.ts` — 81740f1
- [x] 2.3 `LibBadge` is gone: `grep -rn "LibBadge" src tests docs` finds nothing — 81740f1
- [x] 2.4 Unit tests pass: `npm test` — 81740f1
- [x] 2.5 Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build` — 81740f1
- [x] 2.6 Integration suite passes in CI: `npm run test:integration` — f06f2e4

#### Manual

- [ ] 2.7 Nothing on the dashboard, history or alerts pages changed visually

### Phase 3: Two safe splits

#### Automated

- [x] 3.1 Characterization test passes against the old code before the move and against the moved code after: `npm test -- flow-nodes` — d3ec5c8
- [x] 3.2 Break check: breaking a `spoken` or icon branch makes `flow-nodes.test.ts` go red — d3ec5c8
- [x] 3.3 Existing calendar tests pass with import edits and the added `calendarCopy` scan in the wording guard: `npm test -- calendar-view` — d3ec5c8
- [x] 3.4 Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build` — d3ec5c8
- [x] 3.5 E2E and smoke pass in CI: `npm run test:e2e`, `npm run smoke` — f06f2e4

#### Manual

- [ ] 3.6 The live flow diagram and its readings view render the same on `/dashboard`
- [ ] 3.7 The history day, month and quarter pages show the same explanations

### Phase 4: Anon-key module, warn-only (PR B)

#### Automated

- [ ] 4.1 Classifier table and app-check tests pass: `npm test -- anon-key supabase`
- [ ] 4.2 Guard table still passes unchanged: `npm run test:integration -- db-url-guard`
- [ ] 4.3 Break check: removing the `service_role` branch of the classifier makes both the classifier test and the guard table go red
- [ ] 4.4 `npx playwright test --list` (with env set) still loads the config through the new relative import
- [ ] 4.5 Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build`
- [ ] 4.6 Integration, smoke and e2e pass in CI

#### Manual

- [ ] 4.7 After this release is deployed to production and has served real requests, the production logs show no `anon_key_unexpected_shape` event (owner checks)
- [ ] 4.8 Sign-in and the dashboard work as before on production

### Phase 5: Enforce the strict anon-key rule (PR C)

#### Automated

- [ ] 5.1 Tests assert `other` now throws and `publishable`/`anon` do not: `npm test -- supabase`
- [ ] 5.2 Lint, types and build pass: `npm run lint` (src, tests, scripts), `npx astro check`, `npm run build`
- [ ] 5.3 Integration, smoke and e2e pass in CI

#### Manual

- [ ] 5.4 After deploy, sign-in and `/api/health` work on production (owner checks)
