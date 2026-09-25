<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Daily History Push

- **Plan**: context/changes/daily-history-push/plan.md
- **Scope**: Phase 1 of 3
- **Reviewed phases**: 1
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Every planned item matches. The new `ingest_push` differs from the original only in the planned forecast lines, and its security settings, error codes, grants and latest-wins clause are unchanged. Gates on d66f079: the migration applies on a clean database; unit tests, lint, type check and build pass; a local full push stored the forecasts (17.5 and 10.4); the break check went red.

## Findings

### F1 — A stored forecast can be overwritten with null

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260925150014_daily_forecast.sql:59-72
- **Detail**: The upsert sets `pv_forecast_kwh = excluded.pv_forecast_kwh`. A missing key and an explicit null both become NULL, so any later push that re-sends a day without its forecast wipes it. That can happen after a lab restart, with an older lab build, or if the lab keeps forecasts for fewer days than it re-sends. The plan's "never replaced by null" guarantee depends entirely on the lab.
- **Fix A ⭐ Recommended**: Keep a known forecast: `pv_forecast_kwh = coalesce(excluded.pv_forecast_kwh, public.daily_energy.pv_forecast_kwh)`.
  - Strength: The database enforces the rule, so a lab bug can't erase forecast history, which S-11 depends on.
  - Tradeoff: A wrong forecast can only be corrected with a new non-null value, never cleared back to null.
  - Confidence: HIGH — one-line change; the morning forecast never legitimately becomes unknown.
  - Blind spot: None significant.
- **Fix B**: Leave the SQL and document the lab rule ("omitting the key clears the stored forecast") in the ingest README.
  - Strength: Keeps latest-wins uniform across all columns.
  - Tradeoff: Relies on every future lab change remembering the rule.
  - Confidence: MED — depends on discipline in another repo.
  - Blind spot: Lab restarts that lose in-memory state.
- **Decision**: FIXED (Fix A): coalesce keeps a stored forecast; verified locally (push without forecast kept 17.5; a new value replaced it); README states the rule

### F2 — Direct RPC calls skip validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260925150014_daily_forecast.sql:1-15
- **Detail**: Anon can call `/rest/v1/rpc/ingest_push` directly and skip zod. The token check still runs first, but a token holder could then store `"NaN"` or negative values. The same gap already exists for the other daily columns and recommendation fields; the function comment says input is "validated by the API layer", which is only true on the API path.
- **Fix**: Reword the function comment to state that the ingest token is the trust boundary and that direct RPC input is not schema-validated. No code change.
- **Decision**: FIXED: function comment names the ingest token as the trust boundary

### F3 — No test for an explicit null forecast

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/ingest/contract.test.ts:104-120
- **Detail**: The README documents "may be null", but the tests only cover a value, a missing key and a negative value.
- **Fix**: Add one case: `pv_forecast_kwh: null` passes.
- **Decision**: FIXED: test for an explicit null forecast

### F4 — No rollback note for the function replacement

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/deployment/micrus-runbook.md (Database migrations and rollback)
- **Detail**: The runbook's rollback section covers the live-state migration only. Rolling this one back means re-running the original `ingest_push` body; the column can stay, because the old function never reads it.
- **Fix**: Add that rollback to the runbook's migration section.
- **Decision**: FIXED: rollback for the function replacement added to the runbook
