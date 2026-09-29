<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bill accuracy — Phase 4, parallel pass

- **Plan**: `context/changes/bill-accuracy/plan.md` (now `context/archive/2026-09-27-bill-accuracy/plan.md`)
- **Scope**: Phase 4 of 4
- **Reviewed phases**: 4
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION at review time — one finding fixed after the archive, three resolved by the parallel pass, two fixed late, one accepted, two skipped
- **Findings**: 0 critical, 4 warnings, 5 observations

## Why there are two Phase 4 reviews

Two sessions reviewed Phase 4 concurrently on 2026-09-28 without either knowing about the other. Both wrote to `reviews/impl-review-phase-4.md`; the other session's report is the one that was committed (`bc60293`) and archived (`a58795e`). This file preserves the second pass, which found one defect the other did not.

**The other pass was stronger on the dimension that mattered most.** Its F1 was a real public-safety leak — `docs/prerequisites.md` carried Home Assistant entity-id patterns embedding the inverter serial and the DeyeCloud station id, against `existing-system.md`'s public-safe rule. This pass checked those same serials and correctly established that Phase 4 did not _add_ them (they appear on the `+` side of the diff only because Prettier re-padded the table row), but never checked them against that repo rule, and so reported the privacy dimension as clean when it was not. The other pass also caught three things this one missed entirely: a missing tariff-table row in `docs/prerequisites.md` (its F3), the unamended Phase 2 contract in `plan.md` (F5), and a mis-attributed source on roadmap open question 5 (F6).

This pass's contribution is F1 below, which survived both reviews and the archive.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

All 7 planned items landed. Every threshold, constant, key name and worked figure in the new `docs/logic.md` rule was checked against the deployed `homelab-2` scripts and reconciles — including the quadrature spread, which reproduces 155–361 PLN around 258 from the values the text quotes, and the five places where the deployed code diverges from the plan's contract. Success criterion 4.1 re-verified independently: `npx prettier --check .` exit 0, `npm test` exit 0 (217 tests).

## Findings

### F1 — The lag example states the ratio-to-bill pair backwards

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `docs/logic.md:93`
- **Detail**: "July's was 0.53 against August's 0.81, which on the same 549 kWh moves the estimate from 258 PLN to 392 PLN" maps July/0.53 → 258 and August/0.81 → 392. Inverted: a lower export ratio means less credit and a higher bill. Recomputed from the deployed formula — July 0.53 → credit 232.8, billable 316.2 → **392 PLN**; August 0.81 → credit 355.8, billable 193.2 → **257 PLN**. Three other places state it correctly: `docs/decisions.md:9` in the same commit ("392 PLN against 258"), `plan.md:194`, and `docs/logic.md:95` itself ("155–361 PLN around 258"). It also contradicts the next sentence in its own paragraph, which describes the figure re-basing downward when the new invoice lands. This is the paragraph explaining the most reader-visible behaviour, in the section the owner read to close criterion 4.2.
- **Fix**: "…moves the estimate from 392 PLN to 258 PLN".
- **Decision**: FIXED — corrected 2026-09-28 after the archive. Missed by the parallel pass.

### F2 — "Everything reading the file checks `status`" was false of the deployed Telegram bot

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `docs/logic.md:91` (framing at `:81`)
- **Detail**: The section opens present-tense as deployed behaviour and closed with "Everything reading the file checks `status` before it reads a number." The guard exists in the repo (`homelab-2 apps/telegram-home/bot.py:274`) and the lab page gates (`web/app.js:1299`), but `telegram-home` on docker-core was deliberately not rebuilt, so the live bot still formatted the figure with no `status` gate — which is why Progress item 3.5 is unchecked. True of the source, false of the lab.
- **Fix**: Qualify it, naming the deployed bot as the one reader that does not check `status` until 3.5 lands.
- **Decision**: FIXED by the parallel pass (its F4), independently and with the same wording choice.

### F3 — The closed-month check was described as unconditional

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `docs/logic.md:97`
- **Detail**: "Every run re-prices the reference month…" But `closed_month_check()` returns `None` when the invoice total, consumed, fed-in or factor is missing or the invoice is `<= 0`, and `build_forecast` then omits the key (`if check is not None`). `context/changes/bill-forecast/change.md:21`, written in the same commit, said the opposite and was correct.
- **Fix**: State the condition and the absent key, matching `bill-forecast/change.md:21`.
- **Decision**: FIXED by the parallel pass (its F2).

### F4 — The check's drift figure was −2.7%, not −2.6%

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `docs/logic.md:97`
- **Detail**: `max(0, 423 − 0.8 × 342) × 1.0991 + 44.62 = 208.83` against the 214.66 invoice gives `diff_pct` **−2.7** (the code rounds to 1 dp). The Phase 2 review recorded −2.7% twice. The wrong value was inherited verbatim from `plan.md:191`, so Phase 4 copied a figure the plan already had wrong instead of checking it against the shipped value.
- **Fix**: −2.6% → −2.7%.
- **Decision**: FIXED by the parallel pass (its F7), which also added the 208.83/214.66 figures. `plan.md:191` deliberately keeps −2.6% as part of the preserved original contract.

### F5 — The S-07 roadmap slice uses `Risk` as a changelog

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: `context/foundation/roadmap.md:303`
- **Detail**: S-07's `Risk` field now carries a resolved park/unpark history. Both sentences were added in the same commit, so the park was never recorded in the roadmap while it was in force, and S-07 never appeared in the roadmap's dedicated `## Parked` section. None of the other 20 slices use `Risk` for resolved history.
- **Fix**: Keep it — a slice that was blocked and is now clear is the sequencing context `Risk` carries elsewhere; or move the history to `bill-forecast/change.md` and trim `Risk` back.
- **Decision**: ACCEPTED — the owner chose to record the park and the unpark in the slice, having seen both alternatives.

### F6 — `.prettierignore` cited a clone-local exclusion

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `.prettierignore:1`
- **Detail**: The comment read "git excludes them via `.git/info/exclude`". That file is per-clone and uncommitted, and `.gitignore` had no `.claude/` or worktree entry, so another clone or a fresh agent worktree could commit `.claude/worktrees/**`.
- **Fix**: Add `.claude/worktrees/` to `.gitignore` and point the comment at it.
- **Decision**: FIXED — `.gitignore:29` now carries the entry (`git check-ignore -v` resolves there instead of `.git/info/exclude`), and the comment was updated.

### F7 — Import mismatch sign disagreed with `frame.md`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `context/changes/grid-export-mismatch/change.md:18`
- **Detail**: "Deye 433.6 kWh against PGE's 423 (−2.5%)" — Deye reads 2.5% _higher_, and `frame.md:36` states `+2.5%`. Propagated from `bill-accuracy/change.md:29` rather than introduced here.
- **Fix**: Settle on Deye-relative-to-PGE (`+2.5%`) across all three files.
- **Decision**: FIXED by the parallel pass (its F7).

### F8 — "0 every month so far" rested on one observation

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `docs/logic.md:89`
- **Detail**: The carried-credit bullet said the left-over "has been **0** every month so far". The connector holds only the latest invoice and the settlement history starts empty, so August is the only month on record. `plan.md:62` phrased it as "It has been 0 so far."
- **Fix**: "has been **0** in the one settled month on record (August 2026)".
- **Decision**: FIXED — corrected 2026-09-28 after the archive.

### F9 — `change.md` still says S-07 "is parked"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `context/archive/2026-09-27-bill-accuracy/change.md:11`
- **Detail**: "Raised 2026-09-27 while planning S-07 (bill-forecast), which is parked until this lands." S-07 is now unparked. The historical framing ("Raised …") makes it defensible.
- **Fix**: Past-tense it — "which was parked until this landed".
- **Decision**: SKIPPED — the change is archived and the sentence reads as a record of the time it was written.

## Scope notes (not findings)

Beyond the Phase 4 contract, all defensible: the new "Where each rule runs" table row; the confidence bullet and the closed-month-check paragraph in `logic.md`; the rewrite of the PGE Sensor integration row in `prerequisites.md` (it corrected a statement this change made false); the "State as of" date bump; and the fuller output-key inventory in `bill-forecast/change.md`. The `6f74b8b` hygiene commit was unplanned but was raised to the owner and approved before it was made; it was verified content-free (emphasis markers, table padding and blank lines only, zero word, number or checkbox changed).
