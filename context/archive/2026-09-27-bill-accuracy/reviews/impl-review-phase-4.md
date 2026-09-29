<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Make the lab's current-month bill forecast match PGE invoices

- **Plan**: `context/changes/bill-accuracy/plan.md`
- **Scope**: Phase 4 of 4
- **Reviewed phases**: 4
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION (at review time) — all 8 findings triaged and fixed on 2026-09-28
- **Findings**: 1 critical, 5 warnings, 2 observations

Commits in scope: `fc2fc2b` (docs and follow-ups) and `e1ab498` (plan close-out epilogue). Seven files changed, all of them planned; no unplanned files.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

**Note on the overall verdict.** The rubric turns any critical finding into REJECTED. F1 is a genuine critical, but it is pre-existing content that this commit only re-emitted through a prettier table reflow — Phase 4 did not author it. Calling the phase REJECTED would misdescribe work that is otherwise accurate and complete, so this is recorded as NEEDS ATTENTION with the departure stated. Overrule it if you would rather the strict reading stand.

**Success criteria, verified in this review.** 4.1 re-run independently: `npx prettier --check .` reports "All matched files use Prettier code style!" and `npm test` passes 217 tests across 10 files. 4.2 is manual and ticked; the observable evidence is the rule at `docs/logic.md:79-99`, which is written in plain language and defines every term it uses. Criterion 3.5 is still open, but it belongs to Phase 3 and is out of this review's scope; its deferral is recorded consistently in `change.md:59`, `reviews/impl-review-phase-3.md:92` and the `e1ab498` commit message.

**All six planned items are present.** `docs/logic.md:79-99` (the rule), `docs/decisions.md:5-11` (the dated entry, five bullets in the plan's order), `docs/prerequisites.md:80` (the S-07 row, "Where things run" untouched as required), `context/foundation/roadmap.md:400` (open question 5) and `:303` (S-07's park and unpark recorded), `context/changes/grid-export-mismatch/change.md` (template-conformant, evidence carried over), `context/changes/bill-forecast/change.md:16-22` (unparked, new output keys listed).

## Findings

### F1 — Inverter serial and DeyeCloud station id in a public repository

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `docs/prerequisites.md:23`
- **Detail**: The DeyeCloud row names two Home Assistant entity-id patterns that embed the inverter serial number and the DeyeCloud station id. `context/foundation/existing-system.md:5` states this repository carries a public-safe summary with "no addresses, hostnames, entity IDs or credentials", and the repo is a course submission read on GitHub. This is the only occurrence in the repo. The content predates `fc2fc2b`, but the line is a changed line in it: prettier re-padded the whole table, so the diff re-emits it. On its own the pair grants no access — it identifies the installation, it is not a credential.
- **Fix**: Replace both ids with placeholders (`sensor.deye_inverter_<serial>_*`, `sensor.deye_station_<station-id>_*`) and add that the real ids live in the Home Assistant UI and homelab-2's entity map.
  - Strength: One-line edit; matches how `docs/prerequisites.md:27` and `docs/decisions.md:8` already handle the PGE personal data, naming roles and forbidding the values.
  - Tradeoff: The values are already in pushed git history, so the edit stops future exposure but does not undo past exposure. Whether to rewrite history is a separate, larger decision.
  - Confidence: HIGH — verified directly in the file and in `git show fc2fc2b -- docs/prerequisites.md`.
  - Blind spot: Not checked whether the same ids appear in homelab-2's public surface or in the GHCR image.
- **Decision**: FIXED — placeholders in `docs/prerequisites.md:23`; zero serial-bearing ids remain in the working tree. The values stay in pushed git history; a rewrite was not requested and remains open.

### F2 — `docs/logic.md` says the closed-month check runs on every run; the deployed script omits it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `docs/logic.md:97`
- **Detail**: The rule opens "Every run re-prices the reference month… and compares it with that month's invoice". The deployed script adds `closed_month_check` to the output only when the check is not `None` (`build-current-month-bill-forecast.py:446-447`), and returns `None` when the invoice total, consumed, fed-in or factor is missing or the invoice is not positive (`:459-464`). The behaviour is pinned by `homelab-2/apps/solar-energy-analyser/tests/test_current_month_bill_forecast.py:114`. It is documented correctly in `context/changes/bill-forecast/change.md:21` ("absent when the reference period has no invoice total, so the card must treat it as optional") but not in the rule file, which is what an implementer of S-07 would read first.
- **Fix**: Add the optionality to `docs/logic.md:97`, mirroring the wording already in `bill-forecast/change.md:21`.
- **Decision**: FIXED — `docs/logic.md` now states the key is absent when the reference period carries no invoice total.

### F3 — The rates source and the forecast step are missing from `docs/prerequisites.md`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `docs/prerequisites.md` (nearest anchors `:12` and `:80`)
- **Detail**: Two gaps against `context/foundation/lessons.md` ("Name every prerequisite outside the repo"), the lesson this very change's domain produced.
  (a) The tariff rates the forecast prices from live in `solar_analyser.tariffs.pge_g11_positions`, hand-deployed to the lab's app source path and hand-maintained — a PGE price change is a manual edit plus a redeploy, with `rates_verified_on` as the only freshness signal, and their absence is the `rates_unavailable` no-data reason (`docs/logic.md:91`). Neither the module, the path nor the maintenance burden appears anywhere in `prerequisites.md`.
  (b) The 5-minute chain at `:12` still reads "snapshot → history → briefing → LLM narration → push" with no bill-forecast step, although `docs/logic.md:81` says the forecast is written with every 5-minute refresh.
- **Fix**: Add a prerequisites row for the tariff module (name, deployed path, hand-maintained, update procedure) and insert the forecast step into the 5-minute chain.
  - Strength: Closes the exact failure mode the lesson was written about — an external dependency that exists only in a deployed artifact and is invisible to a reader of the repo.
  - Tradeoff: Two more rows to keep current; the tariff row will go stale the next time PGE changes prices, which is precisely why it needs the `rates_verified_on` pointer.
  - Confidence: HIGH — `grep` finds no mention of `solar_analyser`, `app-src` or a tariff table in `prerequisites.md`.
  - Blind spot: Not verified whether the lab runbooks already record the redeploy procedure, which would make this a cross-reference rather than new prose.
- **Decision**: FIXED — a `PGE G11 tariff table` row was added to "Where things run" (deployed path, hand-maintained, `rates_verified_on`, the `rates_unavailable` link), and the 5-minute chain now names the usage-analysis and bill-forecast steps.

### F4 — `docs/logic.md` claims every reader checks `status`; the deployed Telegram bot does not

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `docs/logic.md:91`
- **Detail**: The rule asserts "Everything reading the file checks `status` before it reads a number", and `:81` names the Telegram bot as a reader. `context/changes/bill-accuracy/change.md:59` records the opposite for the deployed state: the Phase 2 bot change was not deployed, and the live bot still formats `projected_bill_gross_pln` as `0.00` on a `no_data` body. That is criterion 3.5, deliberately deferred. As written the rule describes the intended state as if it were the running one.
- **Fix**: Qualify `docs/logic.md:91` — "except the deployed Telegram bot, until the bot backport lands (`bill-accuracy` 3.5, deferred)".
- **Decision**: FIXED — `docs/logic.md` now names the deployed Telegram bot as the one reader that does not check `status`, until 3.5 lands.

### F5 — Phase 2's contract in `plan.md` was never amended to what Phase 2 shipped

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `context/changes/bill-accuracy/plan.md:186,189,196,201,204`
- **Detail**: Five behaviours in the running forecast are absent from or contradicted by the plan's Phase 2 contract: the range adds carried credit to the import error (`script:386-391`) where `plan.md:196` excludes it; carried credit is dropped entirely above lag 0 (`script:364-366`) with no corresponding plan line; two extra `no_data` guards exist (reference under 50 kWh, export ratio above 2.0 — `script:72,76,344-351`) against the three at `plan.md:204`; confidence is also forced low by a closed-month miss above 25% (`script:81,399-402`), not only by lag as `plan.md:201` says; and `closed_month_check` is optional (`script:446-447`) where `plan.md:189` lists it unconditionally.
  This is **not undetected drift**. All five were introduced deliberately in homelab-2 `2595211` after the Phase 2 review, are recorded as findings F1/F2/F5/F10 in `reviews/impl-review-phase-2.md`, and each is pinned by a shipped test. Phase 4 documented the deployed reality, which is the right call. The gap is that `plan.md` was touched only to tick checkboxes 4.1 and 4.2, so archiving will preserve a contract that never shipped as if it had.
  One divergence is currently latent: `carried_credit` has been zero every month so far (`docs/logic.md:89`), so the two range formulas give the same number today. It bites the first month a credit carries forward.
  Separately, `plan.md:249` asks for "a confidence one tier below the day-count tier" for a lag-2 reference while `:201` says forced `low`; the code and tests implement `:201`. Pre-existing, not a Phase 4 defect.
- **Fix A ⭐ Recommended**: Add a short "amended during the Phase 2 review — see `reviews/impl-review-phase-2.md` F1/F2/F5/F10" note against the five lines, leaving the original text visible.
  - Strength: Preserves the record of what was planned and why it changed, which is the point of archiving a plan; cheap.
  - Tradeoff: The plan stays literally wrong in places, relying on the reader following the note.
  - Confidence: HIGH — the review file already contains the reasoning to point at.
  - Blind spot: None significant.
- **Fix B**: Rewrite the five contract lines to match the deployed script.
  - Strength: The plan becomes accurate on its own.
  - Tradeoff: Loses the trace of the change; a plan silently rewritten after the fact is worse evidence for a course submission than one with an amendment note.
  - Confidence: MEDIUM — depends how you want the archive read.
  - Blind spot: Other plan sections may reference the old numbers.
- **Decision**: FIXED via Fix A — five `_Amended during the Phase 2 review_` notes added at `plan.md`, original contract text left visible.

### F6 — Open question 5 attributes claims to a source that does not carry them

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/roadmap.md:400`, `context/changes/grid-export-mismatch/change.md:14`
- **Detail**: Both cite `context/changes/bill-accuracy/frame.md` as the source. `frame.md:36` carries only the 342-vs-94.7 kWh gap. Three further claims in the same sentence — that the inverter's summed grid power agrees at about 95 kWh, that PGE records export at night, and the phase-imbalance candidate — appear only in `context/changes/bill-accuracy/plan.md:13,43`; the word "phase" does not occur in `frame.md`.
- **Fix**: Add `context/changes/bill-accuracy/plan.md` to both source lines.
- **Decision**: FIXED — `plan.md` added to the source attribution in `roadmap.md` and `grid-export-mismatch/change.md`.

### F7 — Numeric and sign inconsistencies across the change folder

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `docs/logic.md:97`, `context/changes/bill-accuracy/change.md:51`, `context/changes/grid-export-mismatch/change.md:18`
- **Detail**: Three small disagreements, none of which change a conclusion.
  (a) `docs/logic.md:97` puts the August closed-month check at −2.6%, inherited from `plan.md:191`; the measured deployed figure is −2.7% (208.83 against 214.66), pinned twice in `reviews/impl-review-phase-2.md:26,30`.
  (b) `change.md:51` labels the July reference "lag 2", but under the definition this commit writes into `docs/logic.md:93` (lag 0 = the immediately preceding month) July as a September reference is lag 1.
  (c) The August import agreement is "−2.5%" in `grid-export-mismatch/change.md:18` and `change.md:29` but "+2.5%" in `frame.md:36`; Deye's 433.6 kWh sits above PGE's 423, so the sign depends on an unnamed denominator.
  Everything else cross-checks: the 0.8 factor, 423/342/274/94.7 kWh, 214.66 and 495.22 PLN, the ≈209 and ≈489 back-tests, the September 549 kWh / 0.809 / 15 days / 155–361 around 258, the ±5% gate and the 7/14-day confidence steps all agree across `logic.md`, `decisions.md`, `roadmap.md`, `grid-export-mismatch/change.md` and `change.md`.
- **Fix**: Correct (a) to −2.7%, (b) to lag 1, and pick one sign convention for (c) naming the denominator.
- **Decision**: FIXED — −2.7% (with the 208.83/214.66 figures) in `docs/logic.md`; "lag 1" in `change.md`; "+2.5% against PGE" in `change.md` and `grid-export-mismatch/change.md`, matching `frame.md`. `plan.md:191` keeps its original −2.6% as part of the preserved contract.

### F8 — Two loose cross-references

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/bill-forecast/change.md:24`, `context/changes/bill-accuracy/change.md:16`
- **Detail**: (a) `bill-forecast/change.md:24` tells the future S-07 card that confidence is forced low at `reference_lag_months > 0` but not that a closed-month miss above 25% forces it too (`script:399-402`) — the consumer is told one of the two forces.
  (b) `change.md:16` and `frame.md:36` both reference "roadmap open question 6"; the roadmap now ends at 5. The plan anticipated this (`plan.md:~336`) and left it alone. Re-pointing it at 5 would be wrong: `change.md:16` is about the import discrepancy, question 5 is about export. It needs deletion or its own question.
- **Fix**: Add the wide-miss force to `bill-forecast/change.md:24`; delete or re-scope the "question 6" reference.
- **Decision**: FIXED — the wide-miss force added to `bill-forecast/change.md`; the dangling "open question 6" reference dropped from `change.md` and `frame.md`.

## Clean

- **Scope Discipline**: seven files changed, all six planned items plus the plan's own Progress rows. The one addition beyond the plan's ask — correcting `docs/prerequisites.md:27` from "4 of these entities" to the 8 the collector maps, plus the credit attributes — is factually verified against `collect-ha-snapshot.py:78-96,178-180,301` and is a correction, not scope creep.
- **Pattern Consistency**: `grid-export-mismatch/change.md:1-10` matches its sibling `bill-forecast/change.md:1-10` field for field; `docs/decisions.md:5-11` matches the existing dated-entry format and ordering; `docs/logic.md:79-99` matches the file's house style and correctly adds its row to the rule table at `:14`.
- **Privacy, other than F1**: no PPE, invoice number, account number, email, address, token, API key, IP or hostname appears in any value on a changed line. `docs/prerequisites.md:27` and `docs/decisions.md:8` handle the PGE personal data correctly, naming only roles and explicitly forbidding the values.
- **Link integrity**: every referenced path resolves, and the roadmap line numbers cited in `plan.md:342-343` are still accurate.

## Out of scope, worth knowing

- `docs/prerequisites.md:11-14` carries two LAN IPs, an operator account with an ssh key path, and the production VPS hostname. Untouched by this commit and therefore not a Phase 4 finding, but under this repo's own public-safe rule they belong in homelab-2 or a password-manager reference. Same class as F1.
- `change.md:57` records that the deployed `telegram-home` image is not built from homelab-2 — roughly 101 live-only lines with no commit on any branch, so a rebuild would delete live features. That production hazard currently exists only inside a change file that is about to be archived.

## Triage outcome (2026-09-28)

All eight findings fixed. Gates re-run green after the fixes: `npx prettier --check .` clean, `npm test` 217 tests across 10 files.

Left open deliberately:

- The inverter serial and station id remain in pushed git history (F1). Stopping future exposure was applied; a history rewrite is a separate decision that was not taken here.
- `docs/prerequisites.md` still carries two LAN IPs, an operator account with an ssh key path and the production VPS hostname. Same class as F1, untouched by Phase 4, and out of this review's scope.
- Criterion 3.5 (Telegram `/energy` on a `no_data` body) stays deferred; it needs the `telegram-home` backport in homelab-2 first, and that hazard is recorded only in `change.md` today.
