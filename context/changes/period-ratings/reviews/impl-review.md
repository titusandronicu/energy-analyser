<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Period Ratings

- **Plan**: context/changes/period-ratings/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

The automated criteria were re-run on main at 97d1820:

- 850 tests, lint, astro check (0 errors), the build and the docs grep (4 lines) all pass.
- All 11 Progress rows are ticked with evidence: 2.6 and 2.7 on the local stack, 2.8 in production (b9a7829).
- Plan-review fixes F1–F4 are all in the code, and every "What We're NOT Doing" item held.

## Findings

### F1 — The "synthetic" rating fixture reproduces real production figures

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/period-rating.test.ts:23-70, 133-140, 170-172; docs/logic.md:169, 174-175
- **Detail**: The fixture comment says all its data is synthetic, but the printed figures match production exactly:
  - the real 07-28 import and use (19,8 / 16,3 kWh);
  - the 09-11 PV of 10,9 kWh and its usual 23,4 kWh;
  - the norm and day values 58,3% and 30,9%, over the dates 28 August – 10 September.
    `docs/logic.md` also repeats the real examples. This goes against the rule to commit synthetic fixtures only. The data itself is low-sensitivity (daily kWh), but the comment claims something the data doesn't honour.
- **Fix**: Perturb the fixture so no printed figure matches production (for example 07-28 → 20,4 / 15,1 kWh and different percentages), update the expected strings, and make the logic.md examples illustrative rather than real.
- **Decision**: FIXED — synthetic values throughout the fixture and in edge-percent tests; logic.md examples illustrative (dates keep the calendar shape)

### F2 — "Dane niespójne" may call a real day an error

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/period-rating.ts:93, 136-142; docs/logic.md:169
- **Detail**: A day whose grid import exceeds the house's use is labelled "dane niespójne" and its basis says the data is inconsistent. The docs name a legitimate cause: the battery charging from the grid (`docs/logic.md:103`). The early-July rows (question 7) look like counter faults, but a future day with grid charging would be called an error too.
- **Fix A ⭐ Recommended**: Keep these days out of ratings and norms, but use neutral wording: "Poza oceną: z sieci kupiono więcej, niż dom zużył (np. ładowanie baterii z sieci albo błąd licznika)."
  - Strength: Correct whichever the cause, and the rule is unchanged.
  - Tradeoff: Less pointed for the early-July glitches.
  - Confidence: HIGH — only the copy changes.
  - Blind spot: Whether grid charging actually happens on this installation.
- **Fix B**: Keep "dane niespójne" and settle question 7 with the lab first.
  - Strength: Precise if these days are always glitches.
  - Tradeoff: Wrong the day grid charging is used.
  - Confidence: MED — depends on the lab's answer.
  - Blind spot: The inverter's grid-charge setting over time.
- **Decision**: FIXED via Fix A — badge "Poza oceną" with the neutral basis; rule unchanged (not rated, out of norms); docs updated

### F3 — Polish wording nits in generated sentences

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/period-rating.ts:161, 193
- **Detail**: Two wording issues:
  - "…potrzeba co najmniej 7, a jest N" should read "a są N" for 2–4, and reads awkwardly for 0. The month form "a ma ich N" reads well for every N.
  - "Norma: mediana z 13 dni: 28 sierpnia – 10 września" has two colons in a row.
- **Fix**: Use "a jest ich N" (or the month's "a ma ich N"), and put the period in brackets: "Norma: mediana z 13 dni (28 sierpnia – 10 września), …".
- **Decision**: FIXED — "a jest ich N" and the bracketed norm period

### F4 — Badge text and capitalisation handled in the component

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/history/RatingPanel.astro:28, 32; src/components/StatusBadge.astro:10-11
- **Detail**: Two small inconsistencies:
  - `RatingPanel` builds `{ tone, label: "" }` Status objects in the template and capitalises some words itself, while the rated words arrive capitalised from the service.
  - `StatusBadge`'s comment still says its `text` override is "for a card that rates nothing".
- **Fix**: Have the service return the badge text already capitalised for every kind, and update the StatusBadge comment.
- **Decision**: FIXED — every rating carries tone and capitalised badge text (notRated helper); RatingPanel only renders; StatusBadge comment updated

### F5 — Two small test gaps

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/services/period-rating.test.ts
- **Detail**: No test covers a norm window that crosses a year boundary (for example 2027-01-03), and none covers a month median over an even count that straddles ±10.
- **Fix**: Add both tests.
- **Decision**: FIXED — year-boundary window test and even-count month median test

### F6 — Months before the history show "za mało danych: 0 z 7"

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/period-rating.ts (rateMonth)
- **Detail**: A completed month with no history (June 2026 or earlier) would read "za mało danych: 0 z 7" if it could be opened. Today `parsePeriod` blocks months before July 2026, so this is latent.
- **Fix**: Leave as is, since it can't be reached; or give 0 rated days its own "brak danych" wording.
- **Decision**: FIXED — a completed month with no rated days reads "Brak danych z tego miesiąca"

### F7 — The documented clamp is effectively dead

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/period-rating.ts:94; docs/logic.md:167
- **Detail**: Import > use returns "inconsistent" before the clamp, so `max(0, …)` never applies. "Clamped to 0–100%" in `logic.md` is harmless but slightly misleading.
- **Fix**: Say in `logic.md` that a day with import above use is not rated, so the value stays within 0–100% on its own.
- **Decision**: FIXED — logic.md states days with import above use are not rated; clamp kept as a rounding guard
