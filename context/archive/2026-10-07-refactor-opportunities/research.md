---
date: 2026-10-07T11:23:32+02:00
researcher: Claude (Sonnet 5.5), four read-only sub-agents plus spot checks
git_commit: de23f69de6e5f16c3e7f516e4cdb55fe6265e8c0
branch: main
repository: energy-analyser
topic: "Where are the worthwhile refactor opportunities in the codebase?"
tags: [research, codebase, refactor, services, components, tests, ci]
status: partial
last_updated: 2026-10-07
last_updated_by: Claude (Sonnet 5.5)
---

# Research: Where are the worthwhile refactor opportunities?

**Date**: 2026-10-07T11:23:32+02:00
**Git Commit**: de23f69de6e5f16c3e7f516e4cdb55fe6265e8c0 (branch `main`)
**Repository**: energy-analyser

## Research Question

The change brief was only "refactor-opportunities" (no stated intent). Interpreted as: which concrete, evidence-backed refactors exist across `src/`, the test infrastructure, scripts and CI, and which prior decisions limit them? Nothing was implemented or run (no tests, lint or build).

## Summary

No inline debt exists: grep of `src/` and `scripts/` for `TODO`, `FIXME`, `@ts-expect-error`, `@ts-ignore` and `as any` found nothing, and `console.*` appears only in `src/lib/logger.ts:68`. The opportunities are duplication and misplaced code, not defects. Counts below are from agent greps; the ones marked **(verified)** I re-ran at `de23f69`.

Ranked by value over risk:

1. **Shared local-stack guard module** for tests. Three copies of the `LOCAL_HOSTS` allowlist exist (`tests/e2e/support/env.ts:4`, `tests/integration/support/stack.ts:3`, `tests/integration/support/privileged.ts:4`) **(verified)**; `tests/support/` does not exist. This is the only item with a standing rule (lesson "A safety guard that exists as copies…") and a deferred follow-up (`context/changes/e2e-alert-rules/follow-ups/review-fixes.md:3`).
2. **Page-load boilerplate**: `const supabase = getClient()` inside `orLoadError(...)` appears 14 times in `dashboard.astro`, `dashboard/history.astro`, `dashboard/alerts.astro` **(verified)**.
3. **"Load failed" markup**: the string "Spróbuj odświeżyć stronę." occurs 18 times in 13 files under `src/` **(verified)**; the agent's 7 identical full blocks were not re-counted.
4. **Cross-service constants and helpers**: the 5-minute future-skew constant has 4 copies **(verified)**; `capitalize` has 3 copies **(verified)**; `formatAge` lives in `live-state.ts` but is imported by three other services.
5. Smaller, low-risk items: duplicated API-route helpers, token-minting scripts, workflow boilerplate, test fixture builders, an unused component.

Large-file splits (`bill-forecast.ts`, `live-state.ts`, `calendar-view.ts`, `LiveFlow.tsx`) are possible but lower value; the services agent suggests leaving them until next touched.

## Detailed Findings

### A. Test infrastructure and guards (highest standing priority)

- Guard copies, counted by grep over `tests/`, `src/` and `scripts/` for `LOCAL_HOSTS`, `OVERRIDING_PARAMS`, `DEFAULT_DB_URL`, `jwtRole`: 3 host allowlists; 2 full DB-URL guards (`env.ts:68-97`, `privileged.ts:12-41`); 2 stack-env guards plus `jwtRole` (`env.ts:17-66`, `stack.ts:11-62`). `src/lib/supabase.ts:7-21` holds a weaker third anon-key variant, kept separate because of the `astro:env/server` import (agent reading of `stack.ts:34`). `scripts/push-fixture.mjs:131-141` has a different guard (remote HTTP `BASE_URL`, not a DB).
- Sync mechanism: `tests/integration/db-url-guard.test.ts:22-25` runs one table against both DB guards. It does not cover the stack-env pair or `jwtRole`, so those can drift unnoticed (agent finding, not re-read by me).
- Lesson rule: a copied guard is changed in every copy, and "when a further copy is about to be written, extract a shared pure module" (`context/foundation/lessons.md`). The deferred fix proposes `tests/support/local-guards.ts` with no supabase-js import.
- Other test duplication (agent greps, bodies not diffed): `const now = new Date("2026-09-23T10:00:00Z")` across about 6 src test files; `row(day, …)` builders for `DailyEnergyRow` in 5 test files; the seed token string `local-dev-ingest-token-not-secret` in 8 files; repeated `afterAll` cleanup in at least 6 integration files; `@` alias duplicated in `vitest.config.ts:16-20` and `vitest.integration.config.ts:5-9`.

### B. Services layer (`src/lib`)

- Future-skew constant, 5 minutes, 4 copies **(verified)**: `ingest/contract.ts:9`, `services/alert-evaluation.ts:13`, `services/recommendation.ts:13`, `services/bill-forecast.ts:20`. The parse-age-classify code that uses them sits at 4 sites (`live-state.ts:351-390`, `recommendation.ts:107-135`, `bill-forecast.ts:328-348`, `alert-evaluation.ts:59-64`) with different thresholds and Polish labels, so only the classification step is shareable. Medium risk: labels are asserted in tests.
- `formatAge` is defined in `live-state.ts` and imported by `alert-evaluation.ts:4`, `bill-forecast.ts:8`, `recommendation.ts:6` (agent finding). `live-state.test.ts:5` imports it from `./live-state`, so a move needs a re-export or test edit.
- Time-unit constants: `HOUR_MS` defined in 4 files, `MINUTE_MS` in 2, `DAY_MS` in 2 (agent grep); `warsaw-time.ts:79` already exports `HOUR_MS`.
- `capitalize`/`capitalise`/`capitalized`: `calendar-view.ts:95`, `period-rating.ts:101`, `components/live/FlowNode.tsx:82` **(verified)**; a fourth inline form at `format/status.ts:21` (agent).
- `byDay` identical in `calendar-view.ts:328` and `period-rating.ts:153`; `median` (`usage-insight.ts:91`) and `MIN_RANKED_DAYS` (`hourly-usage.ts:25`) are generic but imported cross-feature (agent).
- Duplicate copy constants: `NO_DAY_DATA`/`DAY_NO_DATA` and `INCOMPLETE_DAY`/`DAY_INCOMPLETE` across `calendar-view.ts:53-54` and `period-rating.ts:37-38`. Do not merge the three `tooFew` variants; their copy differs.
- `{ tone: "insufficient", label: "" }` built in 4 exact copies (`HourlyUsageCard.astro:21`, `calendar-view.ts:92`, `hourly-usage.ts:192`, `usage-insight.ts:173`); `live-state.ts:371` is a non-empty variant (agent).
- Loaders: 14 `.from(...)` calls in services; the column list `day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh` is duplicated at `usage-insight.ts:68` and `calendar-data.ts:17`. A generic `unwrap` helper is a weak candidate.
- Large files: `toBillForecastView` is about 195 lines (`bill-forecast.ts:312-506`); `calendar-view.ts` is 636 lines with about 20 long copy constants; `live-state.ts` is 444 lines with verdict functions at about `:195-340`. All have sibling tests (783, 1159 and 946 test lines).
- Over-exports: about 160 exports have no non-test importer, but none are dead by that scan. Suggested a lint-driven sweep (e.g. knip), not manual.

### C. Components, pages and routes

- `getClient()` wrapper: 14 sites **(verified)**; fix is a `loadSection`-style helper beside `pageClient`/`orLoadError` (`src/lib/page-load.ts`, `or-load-error.ts`). `history.astro` `loadPage` (about 100 lines, `:66-185` per agent) could move to a testable service.
- "Load failed" block: 7 identical full blocks in `MonthView`, `DayView`, `QuarterView`, `AlertRulesPanel`, `history.astro` per agent; keep a `testId` prop because test ids are asserted.
- Findings rendering duplicated between `RecommendationCard.astro` (about `:78-118`) and `DayView.astro` (about `:176-224`), about 45 lines each; only the inner body is shareable (one uses React `DisclosureButton`, the other native `<details>`).
- `SUMMARY_CLASS`, `SUBMIT_CLASS`, `DELETE_CLASS` are character-identical in `AlertRulesPanel.astro:41-48` and `DayNotePanel.astro:21-27`; `AlertNotice.astro` and `NoteNotice.astro` differ only in type import and test id (agent).
- `MagicLinkForm.tsx` and `PasswordSignInForm.tsx` duplicate submit-guard state, the bfcache `pageshow` effect and the email regex (agent, lines 15-45 of each); a hook in `src/components/hooks/` fits the project convention. No component tests exist.
- `LiveFlow.tsx` (392 lines): two identical toggle buttons, inline SVG connector rendering, `buildNodes` data mapping. No component test; riskiest to move.
- API routes: `json()` is duplicated in `src/pages/api/ingest.ts:7` and `src/pages/api/alerts/evaluate.ts:8` **(verified)**. `bearerToken` is duplicated in the services `ingest.ts:26` and `alerts-evaluate.ts:42` **(verified; the ingest agent had placed it at different lines)**. `src/pages/api/auth/signout.ts` lacks `export const prerender = false` **(verified; the only API route file without it)**; no runtime effect under `output: "server"`.
- `src/components/ui/LibBadge.astro`: no importer found in `src`, `tests`, `scripts`, `docs` by agent; `docs/decisions.md:162` mentions it as keeping literal colours. I did not run a build.
- `src/middleware.ts` (80 lines, 520 test lines): no refactor value seen.

### D. Scripts, CI, migrations

- `scripts/create-ingest-token.mjs` and `create-alert-token.mjs` (18 and 20 lines) differ by table name and text.
- `.github/workflows/ci.yml`: the checkout, setup-node, `npm ci` triple repeats in 4 jobs; `source supabase.env` pattern in 3. `.github/actions/local-supabase/action.yml` already sets the pattern for a composite action.
- Contract and retention drift is mostly guarded (`docs/ingest/contract-v1.schema.json` drift test; `ingest-retention.test.ts`). README prose limits (256 KB, 5 minutes, 14 and 35 days, 900 hours) have no test (agent inference from grep).
- Migrations use `create or replace` chains; no refactor, at most a doc of which migration owns each function.

## Code References

- `tests/e2e/support/env.ts:4,68-97`, `tests/integration/support/stack.ts:3,11-62`, `tests/integration/support/privileged.ts:4,12-41` - guard copies
- `tests/integration/db-url-guard.test.ts:22-25` - shared guard test table
- `src/pages/dashboard.astro`, `dashboard/history.astro`, `dashboard/alerts.astro` - 14 `getClient()` sites
- `src/lib/ingest/contract.ts:9`, `services/alert-evaluation.ts:13`, `recommendation.ts:13`, `bill-forecast.ts:20` - skew constants
- `src/lib/services/calendar-view.ts:95`, `period-rating.ts:101`, `src/components/live/FlowNode.tsx:82` - capitalise copies
- `src/pages/api/ingest.ts:7`, `api/alerts/evaluate.ts:8` - duplicated `json()`
- `src/lib/services/ingest.ts:26`, `alerts-evaluate.ts:42` - duplicated `bearerToken`

## Architecture Insights

- Convention holds: zod validation in `src/lib/services`, origin/auth in middleware, errors through `logger.ts`, no `use client`, no manual class concatenation (agent greps over `src`).
- Loader code is mixed with pure view builders in most services; only `calendar-data.ts` is a dedicated loader module.
- Read-side services must not import the zod contract; `src/lib/ingest/retention.ts` exists for that (plan-review F4 of `refactor-push-boundary`).

## Historical Context (from prior changes)

- `context/archive/2026-10-06-refactor-push-boundary/plan.md` - precedent for a behaviour-preserving refactor: golden replay test first (`tests/integration/ingest-golden.test.ts`), then structure change. Explicitly left out: contract shape, the five KNOWN GAP behaviours, SQL guards for direct RPC, rate limiting, editing applied migrations.
- `context/changes/e2e-alert-rules/follow-ups/review-fixes.md:3` and `reviews/impl-review.md:93-99` (F7) - guard-copy extraction deferred until the next guard rule change or a fourth copy. Still open.
- Older "duplicate/extract" findings are mostly fixed (`page-load.ts`, `dayMonthYear` at `format/warsaw-time.ts:59`, `SummaryText.astro`), per the history agent.
- Constraints: 12 `KNOWN GAP` tests pin accepted behaviour and must stay green; `npm test` fails if `docs/ingest/contract-v1.schema.json` drifts, so a pure refactor leaves it unchanged; never edit applied migrations; lessons require plan, plan-review, then implement, and docs updates (`docs/decisions.md`, `logic.md`, `architecture.md`) when rules or decisions change; archives are read-only.
- Open product-level items that are not refactors and should not be bundled: `ingest_push` accepting out-of-contract payloads via direct RPC (`docs/decisions.md:49`), no CI check in `deploy-production.yml`, `e2e` not a required check, real household data in `docs/ingest/example-v1.json` (`docs/decisions.md:92`).

## Related Research

None in `context/changes/**` or `context/archive/**` for this topic beyond `context/domain/domain-distillation.md:217-224` (ranked domain risks; #3 "single complete-day predicate" touches the same files as B above).

## Open Questions

1. Scope for the plan: one change for the test-guard extraction only, or a bundle of low-risk dedupes (B and C)? The lessons favour small, separately reviewed changes. Owner decision needed.
2. Is the weaker anon-key check in `src/lib/supabase.ts:7-21` meant to stay weaker, or should it share the guard's rules?
3. Do any src tests assert on the guard error message strings? Not checked.
4. Evidence gaps: bodies of `buildMonthView`/`buildQuarterView`, most of `toBillForecastView`, `toLiveStateView` verdict logic, the middle of `smoke.mjs`/`push-fixture.mjs`, migration bodies, `alert-rules.ts` beyond line 80, other card components. Test-helper counts (section A) come from grep, not diffing. Dead-export results were not independently re-run.
5. The risk ratings assume the existing tests assert behaviour rather than structure; this was not verified.
