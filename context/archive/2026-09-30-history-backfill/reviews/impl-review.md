<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: History Backfill

- **Plan**: context/changes/history-backfill/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Runbook's "re-send after a day-rule change" misses the backfilled days

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 runbooks/energy-analyser-push.md:91 (step 6)
- **Detail**: Step 6 says to re-run the `--days 62` push after any change to the day rules, so that days already stored are corrected. `--days 62` no longer reaches 2026-07-16..25. If the rules change while those days are still in the lab file (until about 2026-10-30), they would silently keep the old values.
- **Fix**: Add one clause to step 6 saying to also repeat the `--from 2026-07-16 --to 2026-07-25` push while the lab still holds those rows.
- **Decision**: FIXED — runbook step 6 sentence added (titusandronicu/homelab-2#38)

### F2 — Owner's decision recorded only in logic.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: docs/logic.md (Daily totals, new bullet); docs/decisions.md
- **Detail**: The decision to keep the unbalanced early-July days as they were sent is written only in logic.md. The lesson "Keep the project docs in step with the code" requires every product decision to get a dated entry in docs/decisions.md, and there is none.
- **Fix**: Add a dated 2026-09-30 entry to docs/decisions.md (keep the unbalanced early-July days as sent; why: same counters and rules as the stored days, and a filter would be a new rule) and reference it from the logic.md bullet.
- **Decision**: FIXED — dated 2026-09-30 entry in docs/decisions.md, referenced from the logic.md bullet

### F3 — Range CLI test depends on the wall clock at Warsaw midnight

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 infra/compose/energy-app/scripts/test_push_energy_analyser.py (MainDailyRangeTest.test_bad_ranges_are_refused)
- **Detail**: The test computes `today` from `datetime.now()`, and `main()` then takes its own `now`. If Warsaw midnight falls between the two calls, the "to after today" case becomes valid, and the test fails. The window is microseconds wide.
- **Fix**: Accept the risk, or pass a fixed past `today` by patching `push.datetime` for that case.
- **Decision**: FIXED — the "--to after today" case uses 2099 dates (titusandronicu/homelab-2#38)

### F4 — Phase 1 Progress rows cite the PR-branch commit, not the squash on main

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/history-backfill/plan.md (Progress 1.1–1.3)
- **Detail**: Rows 1.1–1.3 cite homelab-2 commit e086179, the PR-branch commit. main holds the squash merge 8f23a37. It is a homelab-2 SHA either way, so the archive's SHA check can't resolve it in energy-analyser.
- **Fix**: Leave it as is; the PR (titusandronicu/homelab-2#37) links the two commits.
- **Decision**: FIXED — Progress 1.1–1.3 repointed to 8f23a37, the squash merge on homelab-2 main
