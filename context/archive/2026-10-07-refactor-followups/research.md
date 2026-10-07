---
date: 2026-10-07T12:00:00+02:00
researcher: Claude (Sonnet 5.5), four read-only sub-agents plus spot checks
git_commit: 2e5715e4d81f1803659302792c9cf230f0ab6c3a
branch: refactor/refactor-followups (from main)
repository: energy-analyser
topic: "Follow-ups to the merged refactor-opportunities change: review it, align the supabase.ts anon-key check, and re-size the deferred dedupes"
tags: [research, codebase, refactor, review, supabase, tests, ci]
status: partial
last_updated: 2026-10-07
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Follow-ups to `refactor-opportunities`

**Date**: 2026-10-07
**Git Commit**: 2e5715e4d81f1803659302792c9cf230f0ab6c3a (`main`, after PR #149 and #150)
**Repository**: energy-analyser

## Research Question

Three items, from `change.md`: (A) the merged change has no impl-review, so was behaviour preserved and anything weakened? (B) what would aligning the app's anon-key check in `src/lib/supabase.ts` with the test guards take, and what does it risk? (C) which deferred dedupes are still real on current `main`, and how big are they? Nothing was run or edited; the status is **partial** because the production key format cannot be seen from the repo.

## Summary

- **A. Review: no behaviour change and no weakened test found.** Two reviewers read `git diff de23f69 61e876a` (phases 1-2 and 3-4). Every old guard refusal path exists in `tests/support/local-guards.ts`; no assertion was removed or loosened; the only changed test hunks are import lines plus the `live-state.load.test.ts` probe. Findings are low severity only (list in A below). Not run: tests, builds, Stryker.
- **B. Anon-key alignment is a production risk, not a refactor.** `assertAnonKey` (`src/lib/supabase.ts:6-23`) rejects only `sb_secret_` keys and `service_role` JWTs. A stricter rule (also require `sb_publishable_` or role `anon`) fails closed: every non-token request would return 500, including sign-in. The production key's format is not recorded anywhere in the repo, so the owner has to check it before any such change. CI already passes the strict rule (integration and e2e use it).
- **C. Remaining dedupes: smaller than first thought.** Best payoff per line: test time-unit constants (13 test files redefine them), one shared seed-token export (5 test files), a `uniqueUser()` helper (2 files), and three leftover `capitalize` copies in `.astro` cards. The research claim "same `now` constant in about 6 test files" was wrong: 6 files have 6 different values, only 1 value is shared by 2 files.

## Detailed Findings

### A. Review of the merged change

Observed unless marked inferred.

- **Guards (`tests/support/local-guards.ts`).** Trimming, empty-value handling, host allowlist (`127.0.0.1`, `localhost`, hostname read so `127.0.0.1@evil` is refused), `http:` only, `sb_secret_` and `service_role` refusal, the "must be `sb_publishable_` or role `anon`" check, and the `host`/`hostaddr`/`port` query-parameter refusal (case-insensitive) all match the old copies. `requireStackEnv` still strips trailing slashes (`tests/e2e/support/env.ts:21`); `requireStack` still does not. No refusal message interpolates the key or the DB URL.
- **Wording changed (cosmetic).** e2e messages now say "only runs against a local stack" and "Use the anon (publishable) key." No test or script was found that matches the old strings; the table only matches `/Refusing/`, `/secret or service_role/`, `/must be the anon key/`.
- **Test coverage gaps in the new table (observed).** No case for trailing-slash stripping in `requireStackEnv`, and none distinguishing the two callers' wording.
- **Test hunks.** `db-url-guard.test.ts` is additive. `calendar-view.test.ts` and `live-state.test.ts` changed import lines only. `live-state.load.test.ts` now probes `toLiveStateView(null, …).status.tone`; it still dynamically imports `./live-state`, which still builds `wholeNumber` at `live-state.ts:146`, so import-crash detection is kept.
- **Phase 3/4.** `jsonNoStore`, `bearerToken` regex and `health.ts` bytes are identical to the old code; the ingest stage order is unchanged; `withClient`'s `client === null` is equivalent to the old truthiness check because `createClient` returns a client or `null`; all converted sites keep the same fallback values and `orLoadError` section names; the 3 unconverted sites are justified (`dashboard.astro:39`, `history.astro:124,170`). The refresh sentence now exists once (`RefreshHint.astro:10`), 19 call sites in the diff (the plan said 18). `form-classes.ts` constants are character-identical to the removed ones. `tests/e2e/alert-rules.spec.ts` was untouched and its role/label/text locators do not depend on moved classes (not run).
- **Low-severity leftovers (observed):**
  1. Three more copies of the capitalize pattern: `HourlyUsageCard.astro:35`, `LiveStateCard.astro:127`, `UsageInsightCard.astro:63` (re-checked by grep).
  2. `src/lib/format/warsaw-time.ts:77-80`: the "Clock hours in Warsaw…" comment now sits above `export { HOUR_MS };`, a re-export; `hourly-usage.ts` could import `HOUR_MS` from `age.ts` and the re-export could go.
  3. `NO_STATUS` is one shared object; nothing in the diff mutates a status (other `.astro`/`.tsx` callers not checked).
  4. `formatAge` has no `age.test.ts`; its tests still sit in `live-state.test.ts:318`.
  5. `signout.ts` gained `export const prerender = false`, an unlisted but harmless change (no effect under `output: "server"`).
  6. `alerts-evaluate.ts` import order is not alphabetical (cosmetic).

### B. The anon-key check

- **What it does now (observed).** `src/lib/supabase.ts:6-23`: throws for a key starting `sb_secret_` and for a JWT whose payload role is `service_role`; every other key passes, including non-JWTs and roles such as `authenticated`. It is called only inside `createAnonClient` (`supabase.ts:30`) and `createClient` (`supabase.ts:40`), on every call, with no startup check; `astro.config.mjs:24` declares the key an optional secret string with no format validation.
- **Where it runs.** `src/middleware.ts:38` calls `createClient` on every request except the two bearer routes (`/api/ingest`, `/api/alerts/evaluate`, `middleware.ts:15`); route handlers for sign-in, notes, alert rules and sign-out call it too, and the two token routes call `createAnonClient` outside any try/catch. A throw is logged by the middleware catch as `unhandled_error` and becomes a 500. `/api/health` is not exempt from the middleware (inferred from the exemption set; `health.ts` not read), so a failing check would probably fail the deploy health check as well. The audit `context/audits/observability/2026-10-03_1812-lab-push-sign-in-dashboard-reads.md` row S7 already describes this failure mode for the current check.
- **Production key format: unknown.** Docs say only "anon key" (`README.md:83,135`, `docs/architecture.md:63`, `docs/prerequisites.md:81`); the runtime file is `.env.runtime` on the VPS (not in the repo). `docs/prerequisites.md:26` and `context/foundation/test-plan.md:173` document the strict rule for the test suites only.
- **CI:** `ci.yml:43-46,64,84` passes the local stack's `ANON_KEY` to the build, server, smoke, integration and e2e, so that key already satisfies the strict rule in integration and e2e.
- **Tests.** No unit test of `supabase.ts`. `assertAnonKey` is not exported, so a test reaches it only through `createAnonClient`/`createClient` with `astro:env/server` mocked, as `src/middleware.test.ts:14-29` does (`vitest.config.ts:5-14` registers the virtual module). Tests can import `src/` by relative path or `@/`; Playwright honouring tsconfig `paths` was not verified (relative imports avoid the question).
- **Options (analysis, not a decision):**
  - (a) Extract a pure `anonKeyProblem(key)` module in `src/lib` (no `astro:*` import), used by `supabase.ts` and `local-guards.ts`: one rule everywhere, but production now throws for any key that is not `sb_publishable_` or role `anon`, including whitespace-padded keys (the test side trims, `supabase.ts` does not).
  - (b) Keep two copies and add one table test that pins where they must agree: no production change, drift risk stays.
  - (c) Leave as is: the app already refuses the dangerous keys, which matches the README.
  - Mitigations if (a) is chosen: decode the production key out of band first; consider a labelled configuration error; rely on `deploy-production.yml`'s health check and rollback (lines 105-122, not read in full).

### C. Remaining dedupes, re-sized on `main`

- **Time units in tests.** `const MIN|MINUTE|HOUR|DAY(_MS) = …` is redefined in 13 files under `src` and `tests` (grep); `src/lib/format/age.ts:3-5` now exports the values. Names differ (`MIN`, `MINUTE`, `MINUTE_MS`). Pure rename; value low-medium, risk low.
- **Date constants.** Not a duplicate worth sharing: 6 test files have 6 different `now` values; only `2026-09-23T10:00:00Z` is in two (`alert-evaluation.test.ts:16`, `alerts-evaluate.test.ts:8`).
- **Builders.** Of 5 `DailyEnergyRow` `row()` builders, only the pair in `complete-day.test.ts:7-9` and `calendar-view.test.ts:47-49` is byte-identical; the other three differ in signature and defaults. The two `rule()` builders (`alert-evaluation.test.ts:21`, `alerts-evaluate.test.ts:14`) have equal defaults but different typing.
- **Seed token** `local-dev-ingest-token-not-secret`: 8 files outside archives (5 in `tests/integration`, plus `scripts/smoke.mjs:10`, `supabase/seed.sql:4`, `docs/ingest/README.md:73`). The SQL, script and docs must stay literal; the 4 test files that redeclare it could import one export from `tests/integration/support/push.ts:6`.
- **Random users.** `stack.ts:28-29` and `privileged.ts:39-40` generate the same password and near-identical emails and sign-up handling; `tests/e2e/auth.setup.ts` uses its own `randomUUID` shape. A `uniqueUser(prefix)` for the two integration files is possible.
- **Cleanup and config.** The `afterAll` cleanup differs per table except 3 near-identical lines (`alerts-evaluate:51-52`, `access-abuse:189-190`, `alert-rules:99-100`); the `@` alias block is identical in `vitest.config.ts:16-20` and `vitest.integration.config.ts:5-9`.
- **Workflows.** The checkout + setup-node(22, npm cache) + `npm ci` triple is identical in 5 places (4 jobs in `ci.yml`, `mutation.yml`); checkout appears 9 times and setup-node 7 across workflows, all with the same pinned SHAs. `ci`, `smoke`, `integration` are required checks (`.github/rulesets/main-quality-gates.json`), so a composite-action typo would break required gates; only a PR run verifies it.
- **Scripts.** `create-ingest-token.mjs` and `create-alert-token.mjs` share 10 identical lines (4-13) and differ by table name and message text; merging changes documented commands. `smoke.mjs` and `push-fixture.mjs` share only about 25 lines (Warsaw day helper, `HOUR_MS`, fetch-with-token); `smoke.mjs` runs in the required `smoke` job. Asymmetry (observed): `push-fixture.mjs:131-146` refuses remote hosts, `smoke.mjs` has no host guard.
- **`LibBadge.astro`.** 13 lines; no importer in `src`, `tests`, `scripts`, `docs`; the only live mention is `docs/decisions.md:168` ("Other pages (`auth/*`, `LibBadge`, `button`) keep their literals"). Deleting needs that sentence edited and, per the earlier plan, the owner's confirmation.
- **Large files (inferred from structure; bodies of `buildMonthView`, `buildQuarterView`, `toBillForecastView` not read).** `bill-forecast.ts` 506 lines (`toBillForecastView` about 195, 1159 test lines); `live-state.ts` 433 (`toLiveStateView` about 82, 947 test lines); `calendar-view.ts` 623 (about 20 copy constants, 783 test lines); `LiveFlow.tsx` 393 with no component test (`buildNodes` is pure but not exported). The three services are well pinned; `LiveFlow.tsx` is not. The earlier advice (leave until next touched) still holds; the lowest-risk splits are moving the `calendar-view.ts` copy constants out and extracting `buildNodes` after a characterization test.
- **New duplication from #149: none found.** Leftovers it deliberately kept: the three skew aliases, `contract.ts:9,70` (write side), and literal `24 * 60 * 60 * 1000` in `calendar/period.ts:61`, `contract.ts:10`, `dashboard.astro:103,113`.

## Code References

- `src/lib/supabase.ts:6-23` - current `assertAnonKey`
- `tests/support/local-guards.ts` - shared test-side key and host rules
- `src/middleware.ts:15,38` - bearer-route exemption and per-request `createClient`
- `src/lib/format/age.ts:3-5` - shared time units
- `src/components/HourlyUsageCard.astro:35`, `LiveStateCard.astro:127`, `UsageInsightCard.astro:63` - leftover capitalize copies
- `src/lib/format/warsaw-time.ts:77-80` - stale comment above the `HOUR_MS` re-export
- `tests/integration/support/push.ts:6` - natural home for a shared seed-token export
- `src/components/ui/LibBadge.astro`, `docs/decisions.md:168` - unused component and its one mention

## Architecture Insights

- The strict and weak anon-key rules differ on purpose today (`docs/decisions.md`, 2026-10-07 entry), because the app-side check runs per request on the live site while the test-side check only runs in test runs.
- Read-side services must not import the zod contract (`src/lib/ingest/retention.ts` exists for that), which is why `contract.ts` keeps its own skew and hour constants.
- Tests may import `src/` code (many integration tests use `@/`), so a pure rules module in `src/lib` is reachable from `tests/support/`.

## Historical Context (from prior changes)

- `context/archive/2026-10-07-refactor-opportunities/plan.md` - "What We're NOT Doing" lists every item here; `research.md` and `reviews/archive-sha-repoint.md` are its evidence.
- `docs/decisions.md` (2026-10-07 entries) - records that `supabase.ts` keeps its weaker check on purpose.
- `context/foundation/lessons.md` - a copied safety guard is fixed in all copies at once; plan before implementing, and put research's open questions to the owner first.
- `context/audits/observability/2026-10-03_1812-lab-push-sign-in-dashboard-reads.md` rows S6 and S7 - unset key is silent, a bad key is a per-request 500.

## Related Research

- `context/archive/2026-10-07-refactor-opportunities/research.md` (the original sweep).

## Open Questions

1. **What is the production `SUPABASE_ANON_KEY`?** Only the owner can check `/opt/energy-analyser/.env.runtime`: is it a JWT with role `anon` or an `sb_publishable_` key? Without that, option B(a) cannot be judged safe. The value must not be written into the repo.
2. **Which of A/B/C become changes?** The review leftovers (A) and the safest dedupes (C) are small; B is a production-behaviour decision. Splitting them into separate changes would match the lessons.
3. **Delete `LibBadge.astro`?** Owner confirmation is needed, plus a one-line edit in `docs/decisions.md:168`.
4. **Evidence gaps:** no tests, builds or Stryker were run; `health.ts`, `deploy-production.yml` beyond the health check, `Dockerfile`, the middle of `smoke.mjs`, and the bodies of the large functions were not read; whether Playwright honours tsconfig `paths` was not verified; the 13-file time-constant count is from grep and the rename was not tested.
