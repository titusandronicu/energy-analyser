<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Daily History Push

- **Plan**: context/changes/daily-history-push/plan.md
- **Scope**: Phases 2 and 3 of 3
- **Reviewed phases**: 2, 3
- **Date**: 2026-09-25
- **Verdict**: REJECTED
- **Findings**: 1 critical, 5 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

The phase 3 code in homelab-2 was reviewed at `origin/energy-push-daily-history`, because PR #19 was merged before its last two commits (fixed by homelab-2 PR #21). The day rules match the plan and the approved adaptations. Tests pass (30 push tests, 36 app tests). Correction (2026-09-25, after triage): the suspected undercounts on 16 August (21.3 vs 25.3) and 3 September (23.4 vs 25.9) were false positives. The higher values came from the 00:00 sample, which still carried the previous day's total. The production values are correct.

## Findings

### F1 — Day totals can undercount when a counter drops late in the day

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: homelab-2 infra/compose/energy-app/scripts/push-energy-analyser.py:198-253
- **Detail**: "Latest usable sample" trusts whatever the last sample says. When a Deye counter dips late in the day, or when a legacy row has a zero-filled PV counter with consumed still above 0 (the collector fills gaps with 0 and estimates load from import), the day is pushed too low. Suspected in production for 2026-08-16 and 2026-09-03; on inspection both were the 00:00 carry-over of the previous day, not a real dip, so production is correct. Every push re-sends 35 days with latest-wins, so a wrong value would also overwrite a good one.
- **Fix**: Treat daily counters as never decreasing. Within a day, ignore a sample whose PV, load, import or export is below 95% of that counter's running maximum for the day (except in the first 30 minutes after midnight). Add tests for a late dip and the zero-filled legacy pattern. Then re-send 62 days so production corrects the affected days.
  - Strength: It removes the whole class of bad samples, and the repair is automatic through latest-wins.
  - Tradeoff: A genuine counter correction downwards by the inverter would be ignored for that day.
  - Confidence: HIGH — Deye "today" counters only rise within a day.
  - Blind spot: How often Deye Cloud revises a day's total downward.
- **Decision**: FIXED: 95% running-max dip filter per counter plus ignoring pre-00:30 carry-over samples (homelab-2 d17ff9a); re-push not needed, production values verified correct

### F2 — A partial day can be frozen as final

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: homelab-2 push-energy-analyser.py:245-247
- **Detail**: Today is pushed as partial. If the lab goes offline before 21:00, as during the NIC hangs, later pushes skip that day as incomplete, so the partial row stays in production and looks final. A day that ends between 21:00 and midnight also loses its evening energy but counts as complete.
- **Fix A ⭐ Recommended**: Send incomplete past days in the window with null totals, so a stale partial is cleared (S-04 skips nulls; the forecast is kept by the coalesce rule), and raise the completeness cutoff to 23:00.
  - Strength: The app never keeps a partial day as final, and nothing else changes.
  - Tradeoff: Days with evening outages disappear from S-04 instead of showing slightly low totals.
  - Confidence: HIGH — latest-wins already applies to nulls.
  - Blind spot: None significant.
- **Fix B**: Add a `complete` flag to the contract and let the app decide.
  - Strength: The app keeps partial data and can label it.
  - Tradeoff: A contract change in both repos for little benefit.
  - Confidence: MED.
  - Blind spot: S-04 and S-11 would both need the flag.
- **Decision**: FIXED (Fix A): incomplete past days (last sample before 23:00) sent with null totals; cutoff 23:00

### F3 — Heartbeat errors can leak the monitor URL and fail the push

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 push-energy-analyser.py:336-347
- **Detail**: A malformed URL raises `ValueError`/`InvalidURL` before the `try`. The traceback prints the full push URL, including its token, into journald, and the script exits 1 after a successful push. Tests don't cover when the heartbeat fires.
- **Fix**: Build the request inside the `try`, catch `Exception`, log only the exception type, and test that `main` pings only after a 2xx and never prints the URL.
- **Decision**: FIXED: heartbeat never raises or prints its URL; tests for when it fires

### F4 — Future-dated history rows are not rejected

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 push-energy-analyser.py:230-235
- **Detail**: Only rows dated after today are dropped. If the VM clock jumps ahead and NTP corrects it, those rows win "latest" for today.
- **Fix**: Skip rows more than 10 minutes after `now`, and add a test.
- **Decision**: FIXED: rows more than 10 minutes in the future skipped

### F5 — Runbook steps are not safe to repeat

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 runbooks/energy-analyser-push.md:44-63; runbooks/proxmox-nic-hang-and-alerting.md:33-37
- **Detail**: Re-running a step the same day overwrites the `.bak-<date>` backups with the new files, the NIC `sed` adds the `post-up` line again, and rebuilding `.env.push` drops the heartbeat URL.
- **Fix**: Use timestamped or `cp -n` backups, guard the NIC edit with a `grep` check, skip rebuilding `.env.push` when it exists, and document the heartbeat variable in the push runbook.
- **Decision**: FIXED: timestamped backups, guarded NIC edit, .env.push not overwritten, heartbeat documented

### F6 — homelab-2 main was behind docker-core

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: homelab-2 main (PR #19 merged at fdf6a4e)
- **Detail**: The `counters_ok` rule and the heartbeat were running on docker-core but missing from main.
- **Fix**: Merge homelab-2 PR #21 (opened on 2026-09-25); draft PRs from now on.
- **Decision**: PENDING OWNER: merge homelab-2 PR #21

### F7 — Whole history file loaded, and trimmed in place, every run

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 push-energy-analyser.py:258; append-energy-history.py:76-79
- **Detail**: About 20 MB is parsed every 5 minutes (fine today), and `trim_lines` rewrites the file in place, so a crash mid-write could lose history.
- **Fix**: Stream rows lazily, and write the trimmed file to a temp file followed by `os.replace`.
- **Decision**: FIXED: history streamed; atomic trim with os.replace
