<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Alert Rules with Telegram Notifications

- **Plan**: context/changes/alert-rules/plan.md
- **Scope**: Full plan (Phases 1-3 fully done; Phase 4 done except row 4.6, a real production alarm that needs a 7-day forecast, around 8-9 October)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-06
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Re-run on main at 21f9a15: unit 54 files / 1767 tests, integration 10 files / 113 tests, e2e 6/6, smoke 73/73 (including both alerts-evaluate refusals), build, lint, astro check, prettier, migration applies, mint script, docs name the secrets. Phase 4 artefacts and the later VPS trigger (PR #138) were included in the safety review. Drift review: every planned item MATCH, all plan-review decisions implemented; the only drift is stale text from the retired GitHub-cron design.

## Findings

### F1 — Duplicates and lost updates are possible around each run

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/alerts-evaluate.ts:96-129; alerts_record in supabase/migrations/20261007090000_alert_rules.sql
- **Detail**: All sends happen before one record call. A record failure, a restart or an abort mid-run makes the next run re-send everything; nothing locks two runs against each other (the VPS trigger and a manual workflow run can both send an alarm); an owner edit between snapshot and record is overwritten by the old result; alerts_record does not check enabled.
- **Fix A ⭐ Recommended**: Record each rule right after its own send, add `where r.enabled` to the update, document delivery as at-least-once
  - Strength: A crash loses at most one message; small change.
  - Tradeoff: One record call per notified rule; overlap between two runs is reduced, not removed.
  - Confidence: HIGH — the loop already has the per-rule outcome.
  - Blind spot: Needs a new migration for the enabled condition, so a production database push.
- **Fix B**: Add a run lease (a claim row taken in alerts_snapshot)
  - Strength: Removes overlap completely.
  - Tradeoff: A new table and function, and expiry logic for a stuck lease.
  - Confidence: MEDIUM — correct in principle, unmeasured here.
  - Blind spot: Lease expiry after a crashed run.
- **Decision**: FIXED-QUEUED via Fix A (record per rule after each send, `where r.enabled`, at-least-once documented): follow-ups/review-fixes.md

### F2 — Nothing watches the alerter

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/alerts-trigger.mjs, compose.yaml
- **Detail**: If the alerts-trigger container stops or the VPS is down, the stale-data alert can never fire; the only trace is a missing log line. Uptime Kuma watches the lab but not this.
- **Fix A ⭐ Recommended**: Optional ALERTS_HEARTBEAT_URL called after every 2xx answer (like the lab push heartbeat); a Kuma push monitor alerts on silence
  - Strength: Reuses a pattern already in use; optional.
  - Tradeoff: The Kuma monitor is a homelab-2 change; one more value on the VPS.
  - Confidence: HIGH — the lab push does the same.
  - Blind spot: Whether the monitor alerts in time without false alarms.
- **Fix B**: Leave it and rely on the last-checked time on the rules page
  - Strength: No new moving parts.
  - Tradeoff: Only helps when someone looks.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED-QUEUED via Fix A (optional ALERTS_HEARTBEAT_URL in the trigger): follow-ups/review-fixes.md

### F3 — Stale text from the retired GitHub-cron design

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/alerts/AlertRulesPanel.astro:70, docs/architecture.md:108, docs/logic.md:245, src/pages/api/alerts/evaluate.ts:18, scripts/create-alert-token.mjs:15, scripts/smoke.mjs:493
- **Detail**: The page says rules are checked "mniej więcej co 10 minut" but the trigger runs every 5 minutes; architecture.md:108 still describes a scheduled workflow every 10 minutes; four comments and strings still mention the workflow or "scheduled". The applied migration's comment is left alone on purpose.
- **Fix**: Correct the user-facing copy to 5 minutes and reword the others to the VPS service; leave the applied migration untouched.
- **Decision**: FIXED-QUEUED: follow-ups/review-fixes.md

### F4 — The snapshot returns more household data than the evaluator needs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: alerts_snapshot, supabase/migrations/20261007090000_alert_rules.sql:197-217
- **Detail**: It ships the full live state payload while the evaluator only uses captured_at; a leaked alerts token would read household telemetry it never needed. A leaked token can also silence alerts by writing notified: true, so rotation matters. The alerts-prod token is also a repository-level secret.
- **Fix**: Return only captured_at and received_at for the live row, in a new migration, with the route's schema adjusted.
- **Decision**: FIXED-QUEUED: follow-ups/review-fixes.md

### F5 — No cap on rules, and sends are sequential

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: migration lines 9-36, src/lib/services/alerts-evaluate.ts:96
- **Detail**: Nothing limits the number of rules (about 1400 live_stale rules are possible); one stale-data event would send one message per rule, serially with 10 s timeouts, and Telegram's 429 is not handled.
- **Fix**: Cap enabled rules per owner (say 20) in a new migration and treat a 429 as "stop and retry next run".
- **Decision**: FIXED-QUEUED: follow-ups/review-fixes.md

### F6 — One odd forecast payload could block all alerts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/alerts-evaluate.ts:90
- **Detail**: evaluateAlerts has no try/catch, so a throw returns 500 and also blocks live_stale.
- **Fix**: Map a per-rule failure to unknown with a fixed reason.
- **Decision**: FIXED-QUEUED: follow-ups/review-fixes.md

### F7 — The Telegram response body is never consumed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/telegram.ts:31
- **Detail**: The function returns on response.ok without reading or cancelling the body, which can hold sockets or memory until GC.
- **Fix**: `await response.body?.cancel()` (never log the body).
- **Decision**: FIXED-QUEUED: follow-ups/review-fixes.md

### F8 — Migration hygiene in alerts_snapshot and alerts_record

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: migration lines 194-196, 242-260
- **Detail**: alerts_snapshot does not join app_owners, so a removed owner's rules keep firing; malformed p_results raise codes other than the 22023 the comment promises.
- **Fix**: Join app_owners and correct the comment, in the new migration.
- **Decision**: FIXED-QUEUED: follow-ups/review-fixes.md

### F9 — The lab bot's token is on the public VPS

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: docs/prerequisites.md:84,103
- **Detail**: A compromise of the app's .env.runtime yields the lab bot and Kuma notifications as well. It is a documented, deliberate owner decision (2026-10-06).
- **Fix**: Keep the rotation note; consider a dedicated bot and chat when convenient.
- **Decision**: ACCEPTED: the owner's documented decision of 2026-10-06 (shared bot); the rotation note stays

### F10 — No hysteresis on alarm and recovery

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/alert-evaluation.ts
- **Detail**: A value hovering near a threshold flaps alarm and recovery messages; a live_stale threshold near the push interval does the same.
- **Fix**: Add a one-run debounce only if it becomes noisy.
- **Decision**: ACCEPTED: add a debounce only if the messages become noisy

## Triage summary

- Queued to fix: F1 (Fix A), F2 (Fix A), F3, F4, F5, F6, F7, F8 (8), tracked in follow-ups/review-fixes.md
- Accepted: F9, F10
- Skipped / Dismissed: none
