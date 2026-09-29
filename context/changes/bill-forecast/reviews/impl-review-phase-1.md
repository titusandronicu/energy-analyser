<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bill Forecast Card (S-07)

- **Plan**: `context/changes/bill-forecast/plan.md`
- **Scope**: Phase 1 of 5
- **Reviewed phases**: 1
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION → resolved (9 fixed, 1 accepted) after triage
- **Findings**: 0 critical, 5 warnings, 5 observations

Commit under review: `2246377`. Nothing here blocks Phase 2.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Automated criteria re-verified against the committed tree: 1.1 PASS (export
idempotent), 1.2 PASS (227 tests), 1.3 PASS, 1.4 PASS. Manual rows 1.5-1.7 rest
on the owner's attestation; see F1.

All six planned changes verdict MATCH. Both load-bearing behaviours were proven
adversarially (~70 accept/reject probes), not merely trusted from the committed
tests: the `no_data` branch rejects all 13 `ok`-only keys, and all five
`settlement` numerics accept a negative while `reference_lag_months` rejects
`-1` and `1.5`. The committed JSON Schema is byte-identical to freshly generated
output. The default fixture push was confirmed on the wire to send exactly
`captured_at`, `contract_version`, `source`, `state`. Data-leakage scan across
all 12 payload bodies: clean against the full `docs/ingest/README.md:26` list.

## Findings

### F1 — Criterion 1.5 is ticked but the staleness fixture is silently defeated

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/push-fixture.mjs:46-51 · plan.md criterion 1.5, plan.md:143
- **Detail**: `stale-generated-at.json` carries `generated_at` 09:30 against `captured_at` 12:00, but a plain `--file` push rewrites it to now (confirmed on the wire by both agents). Only `--keep-generated-at` preserves it, and criterion 1.5 as written does not mention the flag. The criterion is checked off, so either the flag was used or that fixture's purpose went untested; the script prints only the HTTP status, so there was no signal. `plan.md:143` also still claims fixtures are sent "unmodified", now false for any body carrying `generated_at`.
- **Fix A (Recommended)**: Make the rewrite visible — print `generated_at rewritten to now (use --keep-generated-at to preserve it)`; correct plan.md:143 and criterion 1.5 to name the flag.
  - Strength: One line and the operator can never be misled again.
  - Tradeoff: Surfaces rather than prevents the mistake.
  - Confidence: HIGH — the script currently prints only status.
  - Blind spot: Whether the flag was actually used; only the owner knows.
- **Fix B**: Skip the rewrite when `generated_at` already predates `captured_at`.
  - Strength: The fixture works as documented with no flag; "unmodified" becomes true.
  - Tradeoff: Magic conditional behaviour, surprising in a different way.
  - Confidence: MED — easy to implement, harder to explain.
  - Blind spot: Could mask a genuinely stale real payload later.
- **Decision**: FIXED via Fix A

### F2 — The documented pre-commit gate has never run in this clone

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .husky/pre-commit exists; .git/hooks/pre-commit absent; core.hooksPath unset
- **Detail**: CLAUDE.md documents husky + lint-staged running `eslint --fix` and `prettier --write` on commit, but the hook has never fired — not for `2246377` nor any earlier commit. Evidence: HEAD's `contract-v1.schema.json` was already prettier-dirty before Phase 1, and `roadmap.md` is now prettier-dirty because the `| in-progress |` cell widens a table column. CI runs only `eslint .`, so nothing goes red. Pre-existing and repo-wide, not caused by Phase 1.
- **Fix**: `npx husky` to install the hook, then `npm run format` to clear accumulated drift.
  - Strength: Restores the gate CLAUDE.md promises.
  - Tradeoff: The format pass touches unrelated files, so it wants its own commit.
  - Confidence: HIGH — absence verified three ways.
  - Blind spot: None significant; prettier-formatting the schema cannot break the drift test, which compares parsed JSON.
- **Decision**: FIXED

### F3 — Unguarded file read on the new --file path

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/push-fixture.mjs:30-32
- **Detail**: `readFileSync` + `JSON.parse` on the operator-supplied path are unguarded. A missing path prints a raw ENOENT with a 6-frame stack and a Node source excerpt; malformed JSON prints a SyntaxError stack. The previous read path always existed and always parsed, so `--file` introduces this failure class. `scripts/create-ingest-token.mjs:7-10` is the house pattern.
- **Fix**: Wrap the read/parse; print `cannot read <path>: <err.message>` and exit 1.
- **Decision**: FIXED

### F4 — observed_days lacks the uniqueness refine its neighbour has

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ingest/contract.ts:78-80
- **Detail**: `daily_history` carries a uniqueness refine (`:142-144`) that the existing suite pins. `observed_days` is the same shape and accepts a duplicate date, which would skew Phase 3's `formatPeriod` label and any derived day count. Separately `completed_days_used` has no upper bound while its array is capped at 31, so `{ completed_days_used: 9999, observed_days: [] }` passes. Both are shape invariants, but a refine failure 422s the whole push — the blast radius the plan review's F6 was about, which is why this is MEDIUM.
- **Fix A (Recommended)**: Mirror the `daily_history` refine onto `observed_days`; leave the count cross-check to the Phase 3 mapper.
  - Strength: Duplicate dates are a sender bug with no legitimate form, so a 422 is honest and it matches the neighbour exactly; the lab's own bookkeeping stays out of 422 range.
  - Tradeoff: Two places again, which is the shape of the whole split.
  - Confidence: HIGH — neighbouring precedent is unambiguous.
  - Blind spot: Whether the lab could ever legitimately repeat a date.
- **Fix B**: Both checks in the mapper, nothing in zod.
  - Strength: Zero added 422 surface.
  - Tradeoff: Diverges from `daily_history` for no principled reason.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F5 — monthKey accepts month 00, 13 and 99

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ingest/contract.ts:62
- **Detail**: `/^\d{4}-\d{2}$/` is the one date-ish primitive in the file that does not validate its parts; every neighbouring date field uses `z.iso.date()`. Used for `month`, `settlement.reference_period` and `closed_month_check.period`. Phase 3 compares `month` against the current Warsaw month, where `"2026-13"` would read as a wrong month rather than bad data.
- **Fix**: `/^\d{4}-(0[1-9]|1[0-2])$/` — regenerates the schema `pattern` for free.
- **Decision**: FIXED

### F6 — README.md:52 is not covered by Phase 4's documentation item

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: docs/ingest/README.md:52 · plan.md:332
- **Detail**: Phase 4's README item names only the payload list (`:19-21`) and the storage line (`:43`). Line 52 documents `--full` and states push-fixture "sends only the live `state` section", with no mention of `--file` or `--keep-generated-at`. The new flags are documented only in the script header.
- **Fix**: Add `README.md:52` to Phase 4's item.
- **Decision**: FIXED

### F7 — Three verdict fixtures' average disagrees with their own observed_days

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: scripts/fixtures/bill-forecast/verdict-{equal-to-invoice,at-plus-20-pct,above-plus-20-pct}.json
- **Detail**: `average_daily_import_kwh` is 13.4 / 16.8 / 18.5 against actual `observed_days` means of 13.26 / 16.66 / 18.36, because the totals were fixed first and the day rows filled in after. The money chain is self-consistent. The Phase 3 card shows the average and the day period side by side, so a manual push will display a period whose days do not average to the number beside them.
- **Fix**: Adjust the day rows so each mean matches, or accept the ~1% drift as test-data noise.
- **Decision**: FIXED

### F8 — Real household figures and an internal lab path in a public repo

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: docs/ingest/example-v1.json:105 and the 8 `ok` fixtures
- **Detail**: The example and fixtures carry real monthly aggregates (422.7 kWh consumed / 342 fed in for August, a 214.66 PLN invoice, G11 rates) and `pricing.source` names the internal lab path `solar_analyser.tariffs.pge_g11_positions`. The repo is public. Neither is on the `README.md:26` never-send list (which covers hourly readings and CSV rows, not monthly aggregates), and `docs/logic.md:85-95` published the identical figures before this commit; the plan explicitly asked for the real figures. Flagged so the posture is a conscious one, not a regression.
- **Fix**: None required; revisit if lab naming ever becomes sensitive.
- **Decision**: ACCEPTED — pre-existing, conscious posture; no action

### F9 — nonnegative() written inline 12 times against the file's hoist convention

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ingest/contract.ts:78-119
- **Detail**: The file hoists shared primitives (`reading`, `energyKwh`, `factValue`, `factRecord` at `:11-14`) and reuses them. `energyKwh` genuinely cannot be reused here (it is nullable), but a local `nonNegative` or a `plnGross` would match the file's own style and make the deliberate plain `z.number()` in `settlement` visually louder.
- **Fix**: Hoist a `nonNegative` primitive beside the existing ones.
- **Decision**: FIXED

### F10 — range_gross_pln low <= high is enforced nowhere yet

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/ingest/contract.ts:84-87
- **Detail**: An ordering invariant, not a plausibility judgement, so it is the one case where the validation split's boundary is arguable. Deferring to the mapper is defensible (a reversed range is a lab bug, and a refine would 422 the whole push), but nothing covers it today.
- **Fix**: Add it to the Phase 3 mapper's guards and its test list.
- **Decision**: FIXED (guard added to the Phase 3 plan item and its test list)
