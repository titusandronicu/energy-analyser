<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Push Ingestion Endpoint

- **Plan**: context/changes/push-ingestion-endpoint/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated checks re-run on `chore/f01-wrap-up`: `npm test` 24/24, `npm run lint`, `npx astro check` (0 errors) and `npm run build` all pass. The CI `ci` and `smoke` jobs passed on PR #9. Production (`9a094c0`) answered 201 created, 200 duplicate and 401 for a wrong token.

## Findings

### F1 — CLAUDE.md no longer describes the API boundary or test commands

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md:13, CLAUDE.md:49
- **Detail**: CLAUDE.md, which AGENTS.md links to and which future agents read first, still says that every mutating `/api/*` request is Origin-checked. It describes `npm run smoke` as auth-flow only and doesn't list `npm test`, `npm run contract:export`, `/api/ingest`, `docs/ingest/` or the token scripts. The next agent could "fix" the middleware exemption as a CSRF bug, or skip unit tests.
- **Fix**: Update CLAUDE.md: add `npm test` and `contract:export` to Commands, note the bearer-token exemption for `/api/ingest` next to the Origin rule, extend the smoke description to cover ingest, and point to `docs/ingest/README.md`.
- **Decision**: FIXED — CLAUDE.md updated (commands, Push ingestion section, TOKEN_AUTH_ROUTES exception, CI line)

### F2 — Adaptations made during implementation aren't recorded in the plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/push-ingestion-endpoint/plan.md (Phase 1–4 blocks)
- **Detail**: Five intentional departures appear only in commit messages and chat: `daily_energy.captured_at` added so an older retried push can't overwrite newer totals; the insert-then-compare duplicate check instead of select-first; the contract export via Vitest (`UPDATE_INGEST_CONTRACT=1`) instead of a separate script; the migration renamed to `20260923101001` to match production; and `push-fixture.mjs` sending state only unless `--full`. Once archived, the plan will read as if none of this happened.
- **Fix**: Add a short "Implementation notes" addendum to plan.md listing the five adaptations before archiving.
- **Decision**: FIXED — "Implementation Notes" section added to plan.md before References

### F3 — Step 4.3 was verified with a state-only push, and the row wasn't inspected directly

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/push-ingestion-endpoint/plan.md (Progress 4.3)
- **Detail**: The criterion says `push-fixture.mjs` returns 201 and "the row is visible in the Supabase table editor". The production check used a state-only payload (to keep the example's made-up recommendation out of production). Storage is shown by 201 followed by 200 duplicate, which requires the stored row, but nobody looked at the table.
- **Fix**: Accept 201 → 200 duplicate as proof of the stored row, or check `select count(*) from ingest_pushes` once the Supabase connector is signed in again.
- **Decision**: ACCEPTED — 201 created followed by 200 duplicate for the same `captured_at` proves the row is stored (the duplicate path reads it back); state-only payload recorded in the plan's Implementation Notes

### F4 — `ingest_push` trusts the payload shape when called directly

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260923101001_push_ingestion.sql:71
- **Detail**: All shape validation (strict keys, size cap, time window) lives in the app. Anyone holding both the anon key and a valid ingest token could call `/rest/v1/rpc/ingest_push` directly and store a payload the app would reject; a malformed one fails with a generic 500. The anon key is server-only here and the lab holds only the ingest token, so this needs two secrets to leak at once.
- **Fix A ⭐ Recommended**: Accept for v1 and note it in docs/ingest/README.md's Tokens section
  - Strength: The token is already the real trust boundary; no second production migration needed.
  - Tradeoff: Defense in depth stays app-only.
  - Confidence: HIGH — the lab never receives the anon key (existing-system.md push design).
  - Blind spot: Future callers that might get both secrets.
- **Fix B**: Add minimal SQL guards (contract_version = 1, source = 'homelab', captured_at not null, payload size cap) in a new migration
  - Strength: The database rejects malformed pushes even when the app is bypassed.
  - Tradeoff: A second production migration; contract rules partly duplicated in SQL.
  - Confidence: MED — straightforward, but it has to stay in step with the zod contract.
  - Blind spot: How strict to be without duplicating the whole schema.
- **Decision**: FIXED via Fix A — accepted for v1; documented in docs/ingest/README.md (Tokens): pushers get only the ingest token, never the anon key

### F5 — Unauthenticated requests still reach the database

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/ingest.ts:48
- **Detail**: Any bearer string is enough to make the app read up to 256 KB, validate it and call the RPC, which then looks up the token hash. There is no rate limit (the plan excludes it on purpose). For a single-user app on a small VPS this is a minor denial-of-service surface.
- **Fix**: Accept for v1, as the plan's "What We're NOT Doing" already states; revisit with a proxy-level rate limit if the endpoint starts seeing abuse.
- **Decision**: ACCEPTED — v1 risk, consistent with the plan's "What We're NOT Doing"; revisit with a proxy-level rate limit if abuse appears
