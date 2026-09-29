<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Bill Forecast Card (S-07)

- **Plan**: `context/changes/bill-forecast/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-28
- **Verdict**: REVISE → SOUND after triage (all 10 findings fixed)
- **Findings**: 2 critical, 6 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | FAIL    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

Overall REVISE rather than RETHINK despite two FAILs: the approach is right and
every fix is one clause, additive, or a wording correction. But F1 and F2 both
sit in phases 1–2 and should be fixed before any code is written.

## Grounding

14/14 paths ✓, symbols ✓, phase↔Progress 5/5 matched by number and name ✓,
28/28 success criteria mapped 1:1 ✓, brief↔plan ✓.
`docs/reference/contract-surfaces.md` absent — opt-in convention, skipped.

## Findings

### F1 — Newest-push view is not a valid pattern for an optional section

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Read path; Migration Notes
- **Detail**: The plan claims `live_state` as precedent, but that view works only because `state` is required (`contract.ts:66`). Every optional section in this repo goes into its own accumulating table — `daily_history` → `daily_energy`, `recommendation` → `recommendations`, both written by `ingest_push` (`20260925151509_daily_forecast.sql:55-90`) and read straight from the table. No existing code reads an optional payload section through a newest-push view. Consequence: any single push omitting `bill_forecast` blanks the card, discarding a good forecast from a minute earlier. Phase 1 item #4 guarantees this by keeping the default fixture push state-only; a lab rollback does the same.
- **Fix A ⭐ Recommended**: Filter the view to pushes that carry the section (`where p.payload ? 'bill_forecast'`)
  - Strength: One clause; keeps the view shape; composes correctly with the 30-minute `generated_at` rule so row presence and staleness stop being conflated.
  - Tradeoff: Still a newest-row read with no history — fine for a recomputed snapshot.
  - Confidence: HIGH — the grant and policy are on `ingest_pushes`, so the predicate changes nothing about access.
  - Blind spot: Phase 5 check 5.5 was written expecting row disappearance to blank the figure; needs rewording to test the `generated_at` rule.
- **Fix B**: Persist to its own table like the other optional sections
  - Strength: Structurally immune; matches the repo's actual rule for optional sections.
  - Tradeoff: Changes the `SECURITY DEFINER` `ingest_push` function plus a table and retention decision — far larger than Phase 2, for a snapshot nobody wants history of.
  - Confidence: MEDIUM — correct by pattern, function change unscoped.
  - Blind spot: Whether a `month` upsert key behaves well across a month boundary.
- **Decision**: FIXED via Fix A

### F2 — The card is permanently stale in every fixture and smoke run

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 1 item #3 vs Phase 3 freshness rule vs Phase 4 check 4.4
- **Detail**: Phase 1 bakes a `bill_forecast` block into `docs/ingest/example-v1.json` with a fixed `generated_at`; Phase 3 blanks the figure past 30 minutes. The example is stale the day after it is committed, so the happy path is never rendered by any fixture or smoke run. This makes criteria 1.6 and 4.4 unpassable as written. The repo already solved this exact problem: `example-v1.json` carries a fixed `recommendation.generated_at`, which is why `smoke.mjs:53` overrides it at run time.
- **Fix**: Override `bill_forecast.generated_at` to now in `push-fixture.mjs` (beside the `captured_at` override at `:17`) and in `smoke.mjs`, mirroring `smoke.mjs:53`. Keep the committed example's timestamp fixed.
  - Strength: Reuses the codebase's own solution; the committed fixture stays deterministic for the strict-parse and drift tests.
  - Tradeoff: Two more scripts in Phase 1's scope.
  - Confidence: HIGH — both override sites verified.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — Manual test steps 2-7 have no tooling and no budget

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Testing Strategy — Manual Testing Steps; criterion 4.6
- **Detail**: Steps 2–7 need ~7 hand-built bodies. `push-fixture.mjs` reads a hardcoded path (`:15`) with one flag, `--full` (`:17`); `smoke.mjs` has no flags and two hardcoded bodies. The only routes are editing the committed `example-v1.json` (which the strict parse at `contract.test.ts:15` and the drift test depend on, so variants risk landing in a commit) or unbudgeted tooling.
- **Fix**: Add a `--file <path>` flag to `push-fixture.mjs` and a `scripts/fixtures/bill-forecast/` directory of variant bodies, as Phase 1 scope.
  - Strength: Makes all eight manual steps runnable and repeatable; keeps the tracked fixture clean.
  - Tradeoff: ~30 minutes plus a small directory of test data.
  - Confidence: HIGH — both scripts' full option surface verified.
  - Blind spot: None significant.
- **Decision**: FIXED

### F4 — smoke.mjs appears in no phase but can break on the new card's copy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — Changes Required (omission)
- **Detail**: `smoke.mjs` asserts against the whole dashboard HTML with `notContains`: "Nieaktualna" (`:92`), "Dane nieaktualne" (`:97`), "Nie udało się wczytać porównania" (`:103`). A fourth card whose Polish refusal copy contains any of those substrings breaks an existing smoke step, and CI runs it. No phase lists the file.
- **Fix**: Add `scripts/smoke.mjs` to Phase 4's Changes Required, with a constraint that the new card's copy avoids those three substrings, plus a marker assertion for the new card.
- **Decision**: FIXED

### F5 — Phase 5 has no preflight and no rollback for a 422 that stops all ingestion

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 5 — Lab push and production
- **Detail**: Phase 5 names the 422 risk and mitigates nothing. Because the contract is strict, one field mismatch in the real lab file stops every push — live state and recommendation included — until someone reverts the lab. Criterion 5.1 detects this only once it is live. The brief flags the field list as the plan's weakest assumption, making this the most likely failure in the change.
- **Fix**: Add a preflight before enabling the lab push: run the real `current-month-bill-forecast.json` through the deployed contract (`ingestPayloadV1.safeParse`, or one `push-fixture.mjs --file` call with a throwaway body), and state the rollback as reverting the lab script.
  - Strength: Turns a production ingestion outage into a local failed assertion for minutes of work.
  - Tradeoff: One more gate before the payoff step.
  - Confidence: HIGH — the strict-object 422 behaviour is verified.
  - Blind spot: Whether the lab file is readable from the dev machine or only on the lab host.
- **Decision**: FIXED

### F6 — nonnegative() on settlement turns an observed bad value into a full-push 422

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 item #1 vs Implementation Approach
- **Detail**: The validation split was chosen so a bill problem would not blank live state. Phase 1 then puts `nonnegative()` on the settlement figures including `reference_feed_in_kwh` — exactly the field observed negative in `impl-review-phase-2.md:50-51` — so a negative there 422s the entire push, the outcome the decision was meant to avoid. The design is right for the derived values: that negative input produced positive-but-absurd `credit_left_kwh` and range figures, which the mapper's ceiling catches as intended. Only the raw settlement disclosure becomes an outage.
- **Fix A ⭐ Recommended**: Plain `z.number()` on the settlement block; sign checks in the mapper alongside the plausibility ceiling
  - Strength: Delivers the rationale actually chosen — a bad settlement figure blanks this card and nothing else.
  - Tradeoff: Nonsense is stored in `ingest_pushes` and future readers of that block must guard it.
  - Confidence: HIGH — the failure mode is documented from a real payload.
  - Blind spot: None significant.
- **Fix B**: Keep `nonnegative()` and record the consequence in Open Risks
  - Strength: A malformed payload fails loudly and the lab must fix it; one place to read the rules.
  - Tradeoff: Accepts a known dashboard-wide outage path.
  - Confidence: HIGH — the behaviour is certain; only the preference is open.
  - Blind spot: How quickly a 422 would actually be noticed.
- **Decision**: FIXED via Fix A

### F7 — No check that the forecast's month is the current month

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — refusal paths
- **Detail**: The card is titled "the current month" but never checks the body's `month` against the current Warsaw month. A forecast generated 23:58 on the last day of a month and read at 00:05 the next day is inside the 30-minute window and would be presented as this month's projection. Distinct from the lagging reference month (`settlement.reference_period`), which was deliberately disclosed rather than hidden.
- **Fix**: Compare `month` with `warsawParts(now).dayKey.slice(0, 7)` and, on a mismatch, downgrade the badge to `problem` naming the actual month — following `isFromEarlierDay` (`recommendation.ts:59-61`, `:73-75`), not adding a seventh blanking path.
  - Strength: The repo's established handling for wrong-period data is relabel-and-keep-showing (`RecommendationCard.astro:65-75`). No new concept.
  - Tradeoff: A seventh state to specify and test.
  - Confidence: HIGH — precedent read directly.
  - Blind spot: `warsawParts` exposes no month key, so this adds a small derivation; `warsaw-time.ts` is the house place for it.
- **Decision**: FIXED

### F8 — "No rounding" contradicts the whole-złoty formatter

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: What We're NOT Doing; brief's Key Decisions vs Phase 3 item #2
- **Detail**: "What We're NOT Doing" says no rounding and the brief has a "Rounding | None" row, but Phase 3 specifies `plnLabel` at whole złoty, which rounds 258.43 to "258 zł". Same word, two meanings — display precision versus recomputing the figure.
- **Fix**: Reword both to say no _recomputation or re-scaling_, and state whole-złoty display precision as the deliberate choice it is.
- **Decision**: FIXED

### F9 — Two factual errors in the plan's prose

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 item #1
- **Detail**: Tested against this project's zod 4.6.5: `z.toJSONSchema` emits `oneOf` for a discriminated union, not `anyOf` as the plan says. The `.finite()` rationale ("`z.number()` alone accepts `Infinity`") is wrong for this version — plain `z.number()` already rejects both `Infinity` and `NaN`. The same probe confirmed the union round-trips without throwing and serialises byte-identically across calls, so the drift assertion holds and the plan's highest-risk claim is sound.
- **Fix**: Correct both sentences; drop `.finite()` or keep it without the false rationale.
- **Decision**: FIXED

### F10 — credit_left_kwh is accepted but never shown

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 / Phase 4
- **Detail**: When banked credit exceeds the month's import, billable energy is zero and the projection floors at the 44.62 PLN fixed fee. The card would show a strikingly low figure, trivially green against the last invoice, with nothing explaining why — `credit_left_kwh` is in the contract but never rendered.
- **Fix**: Add one line to the "Na podstawie" block when `credit_left_kwh > 0`.
- **Decision**: FIXED
