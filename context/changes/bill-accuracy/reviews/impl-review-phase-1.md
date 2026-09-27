<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bill accuracy

- **Plan**: `context/changes/bill-accuracy/plan.md`
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-09-27
- **Verdict**: REJECTED → all 10 findings FIXED and re-verified (see Decisions)
- **Findings**: 2 critical, 6 warnings, 2 observations
- **Commits reviewed**: homelab-2@159a060, energy-analyser@c20addf

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria verified

- 1.1 `make test-solar-analyser` — PASS, 60 tests (39 baseline)
- 1.2 privacy — PASS, both `*_never_carries_account_details` tests named and green; break-verified
- 1.4 append-if-new — PASS, `test_records_each_billing_period_exactly_once`; break-verified
- 1.3 (manual) — correctly still `[ ]`; the plan defers it to Phase 3, so genuinely pending, not sham-checked

## What matched

All four entity ids exact including the `solar_` prefixes; the three attribute mappings exact; the 7-key row shape, append-if-new, 36-row retention and non-error-on-missing all match; every planned test case exists and asserts against the written files; the privacy mechanism is sound (fixed four-key `raw_entities`, everything else float-or-None, fake account strings planted in the fixture and grepped for in output). The sibling-script choice faithfully follows `append-energy-history.py`. The one EXTRA (the sidecar test edit at `scripts/test_collect_ha_snapshot.py:51-54`) is a justified consequence of the new ATTRIBUTE_MAP keys, not scope creep.

## Findings

### F1 — An unreadable history is silently replaced by a single row

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (data safety)
- **Location**: append-pge-settlement-history.py:79-85, :127-134
- **Detail**: `read_lines` swallows `OSError`/`UnicodeDecodeError` and returns `[]`, so `append_row` builds `lines = [row]` and `write_lines` atomically replaces the file. Reproduced independently: a 3-period history plus one `0xff` byte became ONE line, exit 0, "appended ..." on stdout, nothing on stderr. Same path fires on transient EACCES or an ownership flip (F6). This file is the only record of closed billing periods once the connector moves on — the very series Phase 1 exists to build. Loss is silent and unrecoverable.
- **Fix A ⭐ Recommended**: Distinguish missing from unreadable — if `path.exists()` and the read raises, print to stderr and return 0 without writing.
  - Strength: Preserves the file, keeps the refresh alive, ~4 lines.
  - Tradeoff: A corrupt history stops accumulating until noticed; needs F8's stderr fix to be visible.
  - Confidence: HIGH — reproduced both the bug and the fix shape.
  - Blind spot: Nothing alerts on a stuck history; it just stops growing.
- **Fix B**: Read tolerantly with `errors="surrogateescape"` and write unknown bytes back verbatim.
  - Strength: Keeps appending through corruption, losing nothing.
  - Tradeoff: Carries corruption forward; fuzzy encoding contract.
  - Confidence: MEDIUM — round-tripping needs care.
  - Blind spot: Interaction with the 36-row trim.
- **Decision**: FIXED via Fix A — read_lines now distinguishes missing from unreadable; reproduced the fix (file byte-identical, exit 0, stderr message). Regression tests added.

### F2 — The writer is never called, and no plan step owns wiring it

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: N/A (absent); plan.md:93 vs :174, :268
- **Detail**: Phase 1's File line says "a small sibling script called from `refresh-energy-agent-data.sh`". Nothing calls it (no reference outside its own test), and the script has no default paths, so `web/data/pge-settlement-history.jsonl` exists nowhere but the commit message and test temp dirs. The deferral to Phase 2 was accepted during implementation, but Phase 2's item 4 covers only the forecast's `--history`/`--snapshot` switch and guard. Phase 2 item 3 reads the file (:174) and Phase 3 installs it (:268) — so as written the forecast's preferred data source is never produced.
- **Fix**: Add the writer call to Phase 2's item 4 contract, next to the existing history append, with its own guard.
- **Decision**: FIXED in code and in the plan (owner's call): the refresh now calls the writer, guarded; Phase 1's contract records it, Phase 2's item 4 is told to preserve it; new step 1.5.

### F3 — The billing period is published unvalidated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (privacy)
- **Location**: append-pge-settlement-history.py:42-47
- **Detail**: Every other field is hard-typed through `number_or_none`. The period is the one free-text value that survives, checked only against HA's sentinels; a state of `"PPE 590000000000000123 owner@example.com"` passes into `reference_period` verbatim. nginx serves `web/data` at `/` (only `/private/` restricted), so both the snapshot and this file are publicly fetchable. The privacy mechanism is otherwise sound; this is the one live channel.
- **Fix A ⭐ Recommended**: Validate `^\d{2}\.\d{2}\.\d{4} - \d{2}\.\d{2}\.\d{4}$`, else None.
  - Strength: Closes the text channel; makes "closed period" enforceable.
  - Tradeoff: A connector format change becomes a hard stop rather than silently wrong rows; needs F8.
  - Confidence: HIGH — format confirmed from the live entity.
  - Blind spot: Whether the connector ever localises the separator.
- **Fix B**: Keep verbatim, assert the shape in a test only.
  - Strength: No runtime change; documents the expectation.
  - Tradeoff: Publish path stays open to whatever HA reports.
  - Confidence: MEDIUM.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — PERIOD_RE enforces DD.MM.YYYY - DD.MM.YYYY, else no row.

### F4 — Write failures escape main() and will kill the refresh

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: append-pge-settlement-history.py:101-135, :162
- **Detail**: The comment at :148 states "the refresh runs under `set -eu`: an unusable snapshot must not stop it", but only the snapshot read is guarded. A non-writable directory raises `PermissionError` from `mkstemp`; :162's `chmod` can raise too. ENOSPC, a read-only mount or ownership drift would abort the refresh, taking the cross-check, both plans, the advisory and the push with it.
- **Fix**: Wrap the `append_row` + `chmod` block in `except OSError`, print to stderr, return 0.
- **Decision**: FIXED — append_row + chmod wrapped in except OSError, stderr, return 0; test with a non-writable directory.

### F5 — NaN/Infinity pass the completeness check and emit invalid JSON

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (correctness)
- **Location**: append-pge-settlement-history.py:33-39, :130
- **Detail**: Confirmed: states of `"nan"` and `"Infinity"` build a row and serialize as bare `NaN`/`Infinity`, which `JSON.parse` rejects — in a browser-fetched file. `None in (...)` doesn't catch them, and the collector's sentinel set has `"nan"` but not `"inf"`. `as_float` is inherited from `append-energy-history.py`, so the gap pre-exists there.
- **Fix**: Gate `as_float` on `math.isfinite`, add `"inf"`/`"-inf"`/`"infinity"` to the collector's sentinels, pass `allow_nan=False` to `dumps`.
- **Decision**: FIXED — as_float and the collector's number_or_none both gate on math.isfinite; allow_nan=False on dumps.

### F6 — write_lines preserves mode but not ownership, unlike its precedent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / data safety
- **Location**: append-pge-settlement-history.py:108-116
- **Detail**: `append-energy-history.py:105-108` does `os.chown(tmp, st_uid, st_gid)` with a `PermissionError` fallback; this omits it. The timer runs as root while `energy-api` also mounts `web/` read-write, so after one root run the file is root-owned and a later non-root run lands in F1 or F4.
- **Fix**: Copy the precedent's `os.chown` + `PermissionError` pass exactly.
- **Decision**: FIXED — os.chown with the precedent's PermissionError fallback. No test (needs a second uid).

### F7 — "Newest" credit entry is chosen by list position, never by date

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (correctness)
- **Location**: collect-ha-snapshot.py:188-214
- **Detail**: Returns the first dict, trusting the connector's sort. That sort was verified in the connector source (newest-first by `insertToGridDate`), documented, and openly pinned by a test (a reversed list is asserted to give the *oldest* value), so it is correct today. But the guarantee is borrowed, not enforced: a connector reordering, or upstream's string sort meeting a non-ISO date, silently yields the wrong period's carried credit, which is published and feeds the forecast with nothing to detect it.
- **Fix A ⭐ Recommended**: Select by `max()` over entries with a parseable `insertToGridDate`, falling back to position.
  - Strength: Makes the guarantee local; ~5 lines.
  - Tradeoff: More code for a case that cannot happen today.
  - Confidence: HIGH.
  - Blind spot: The date's real format is known from one sample only.
- **Fix B**: Leave it and record `insertToGridDate` in the row so a mislabelled row is detectable afterwards.
  - Strength: Cheaper; adds forensics.
  - Tradeoff: Detects rather than prevents.
  - Confidence: MEDIUM.
  - Blind spot: Nothing would read that field yet.
- **Decision**: FIXED via Fix A — newest chosen by insertToGridDate, falling back to list position; the test that pinned the old positional rule now asserts order does not matter.

### F8 — Failure messages go to stdout, so a persistent failure is invisible

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: append-pge-settlement-history.py:149, :152, :157, :160
- **Detail**: `collect-ha-snapshot.py` uses `file=sys.stderr` and the refresh routes warnings to `>&2`. Since this script deliberately exits 0 on failure, stdout-only messages mean a permanently failing writer never shows in journald's error stream. F1, F3 and F4's fixes all depend on this to be noticeable.
- **Fix**: `file=sys.stderr` on the failure paths; keep the success line on stdout.
- **Decision**: FIXED — genuine failures go to stderr; routine no-ops ('already recorded', 'no complete settlement facts') stay on stdout so journald's error stream is not spammed every 5 minutes.

### F9 — Retention trims by append order and counts unparsable lines

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: append-pge-settlement-history.py:131-132
- **Detail**: `lines[-limit:]` counts junk lines toward the 36, so corruption can evict a real period, unrecoverably.
- **Fix**: Trim only rows that parse and carry a `reference_period`.
- **Decision**: FIXED — trim_to_limit counts only rows that parse, so a corrupt line cannot evict a real period.

### F10 — The energy-app README's retention list wasn't updated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: infra/compose/energy-app/README.md:355-374
- **Detail**: The plan said retention follows "the history-file convention in the energy-app README"; the behaviour does, but the README's refresh steps and Default-retention list still mention only `energy-history.jsonl`. `lessons.md`'s "keep docs in step" applies.
- **Fix**: Add the new file to both lists, or fold into Phase 3's docs step.
- **Decision**: FIXED — energy-app README gained refresh step 4 (list renumbered) and a retention entry.
