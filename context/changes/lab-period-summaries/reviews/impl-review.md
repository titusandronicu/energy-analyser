<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Lab Period Summaries

- **Plan**: context/changes/lab-period-summaries/plan.md
- **Scope**: Full plan (3.6 still pending: it needs a day to pass)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Code reviewed: energy-analyser 0056976 and homelab-2 bd42189 + 77124ad.

Automated checks re-run on 2026-10-01, all passing:

- **energy-analyser:** `npm test` (952), lint, `astro check` (0 errors), build.
- **Lab:** `test_build_period_summaries`, `test_run_energy_advisory`, `test_push_energy_analyser` (108), `make test-solar-analyser`, `py_compile`, `sh -n`, and the runbook grep (9 lines).

Not re-run, because they need the local Supabase stack on the UGREEN: `supabase db reset` and smoke. Both passed at 19c42ad.

## Findings

### F1 — A range push always collides with the timer's push (409)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: homelab-2 infra/compose/energy-app/scripts/push-energy-analyser.py:689
- **Detail**:
  - **Cause:** `captured_at` is the snapshot's `generated_at`. Once `.env.push` exists, the timer has already pushed that `captured_at` with different content. `ingest_push` then answers `409 capture time conflict` to every `--from/--to` push, and to any manual push after a manual build.
  - **Effect on the backfill:** all 6 batches got 409 on 2026-10-01. The backfill only went through by stopping the timer and renaming `.env.push` (runbook 77124ad), which is fragile: if the file isn't restored, live pushes stop silently.
  - **It will recur:** the runbook says facts-only entries are retried only by another range run.
- **Fix A ⭐ Recommended**: In range mode, stamp `captured_at = now` and refuse the push when the snapshot is older than 15 minutes; then remove the pause-the-timer steps from the runbook.
  - Strength: Batches and the timer can't collide any more. About 5 lines in `main` and `build_payload`. `daily_energy` and `hourly_energy` stay correct, because their upserts keep the newest `captured_at` and the values are the same.
  - Tradeoff: For up to one refresh (5 min), the live state looks fresher than its snapshot.
  - Confidence: HIGH — `ingest_push` only requires `captured_at` to be unique per source.
  - Blind spot: The dashboard's freshness label isn't checked for that 5-minute skew.
- **Fix B**: Keep the runbook workaround and make it a script in homelab-2 with a `trap` that restores `.env.push`.
  - Strength: No change to the push semantics.
  - Tradeoff: A production timer pause stays part of every range run.
  - Confidence: MEDIUM — it worked once, by hand.
  - Blind spot: An interrupted SSH session before the trap fires.
- **Decision**: FIXED (Fix A)

### F2 — The numbers check accepts invented numbers

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: homelab-2 infra/compose/energy-app/scripts/build-period-summaries.py:468-481
- **Detail**:
  - **How it compares:** a bare integer passes when it is within ±0.5 of _any_ reliable fact, whatever its unit. Numbers written as words are never checked.
  - **Proven false accepts:** "o 7% mniej niż prognoza" passes because of the 7.4 kWh discharged. "w ciągu 8 godzin" passes because of the 8.1 kWh charged. "dwa razy więcej" isn't checked at all.
  - **Also loose:** any bare number equal to the `as_of` hour passes anywhere in the text.
  - **Why it matters:** FR-030 requires that the text adds no numbers of its own.
- **Fix**: Tie each number to its unit (`%`/`procent` only against `*_pct` facts, `kWh` only against `*_kwh` facts). A bare integer with no unit must equal an integer fact exactly. Add a deny pattern for comparison and number words (`razy`, `dwukrotn*`, `połow*`, `dwa|dwie|trzy…`).
  - Strength: Closes the false accepts found; the tests already have the fixtures.
  - Tradeoff: More texts rejected, so more facts-only entries and retries.
  - Confidence: MEDIUM — the effect on real texts is unmeasured; re-run the dry run before deploying.
  - Blind spot: The 66 texts already stored weren't re-checked against a stricter rule.
- **Decision**: FIXED

### F3 — A range run keeps nothing when it's interrupted

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 infra/compose/energy-app/scripts/build-period-summaries.py:526-534, 776-788, 859-873
- **Detail**:
  - **Saved only at the end:** the state is written once, after the whole run. Ctrl-C, SIGTERM or an uncaught error loses every paid narration from that run.
  - **No stop on failures:** if OpenRouter is down, the run still tries every entry (up to about 80 × 30 s).
  - **Uncaught config error:** `try_narrate` catches only `ProviderError` and `NarrationRejected`. A bad `OPENROUTER_TEMPERATURE` raises `ValueError` and kills the run, every 5 minutes in regular mode.
- **Fix**: In range mode, write the state after each successful narration. Stop after 3 provider errors in a row. Have `try_narrate` catch `Exception` and log only the error type and the sanitized message.
- **Decision**: FIXED

### F4 — Old facts-only entries take the retry budget from recent days

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 infra/compose/energy-app/scripts/build-period-summaries.py:754-788
- **Detail**:
  - **How it retries:** regular runs retry every facts-only day or month in the state, oldest first, 2 per run.
  - **The risk:** after a range run with many failures, old entries keep the budget. Yesterday can then use up its 3-day window with few attempts.
  - **Wasted spend:** old entries outside the push window (7 days plus 2 months) only reach the app with another range push, so narrating them in a regular run costs money for nothing.
- **Fix**: In regular mode, retry only the periods in the push window (`push.summary_periods(now)`), newest first.
- **Decision**: FIXED

### F5 — The runbook names the wrong migration version

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: homelab-2 runbooks/energy-analyser-push.md:41, 45
- **Detail**: Pre-check 8 names `20261001091500_period_summaries.sql`, and its SQL checks `version = '20261001091500'`. Production recorded the migration as `20261001094118`, so the check returns no row although the migration is applied.
- **Fix**: Replace `20261001091500` with `20261001094118` in both places.
- **Decision**: FIXED

### F6 — A newer facts-only entry can wipe a stored narration in the database

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261001094118_period_summaries.sql:135-143
- **Detail**:
  - **The gap:** "never downgrade" is enforced only in the lab's state file.
  - **When it bites:** if the state file is deleted or replaced (`read_state` treats a missing file as empty), the lab rebuilds the last 7 days and the last month as facts-only with `built_at = now`. The upsert then clears the stored narrations.
- **Fix**: In a new migration that redefines `ingest_push`, add `and (excluded.narration_text is not null or public.period_summaries.narration_text is null)` to the conflict `where`.
- **Decision**: FIXED

### F7 — The docs miss a few rules and deviations that were built

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: docs/prerequisites.md:52; docs/logic.md:269-280
- **Detail**:
  - **Wrong in `prerequisites.md:52`:** it says the advisory "writes every user-facing text … and the period summaries". `build-period-summaries.py` writes them, OpenRouter only.
  - **Missing from `logic.md`:**
    - the forbidden-words backstop;
    - no today entry before 00:30;
    - the extra month facts (`days_in_month`, `pv_forecast_days`, `pv_vs_forecast_pct`);
    - the state-file lock;
    - the `as_of` hour exemption in the numbers check.
  - **Plan deviations not recorded in the plan:**
    - there is no size cap on the state file;
    - the refresh step runs only when `.env.llm` exists;
    - the tightened `IDENTIFIER_PATTERN` (which also affects `bill_forecast`).
  - Lesson "Keep the project docs in step with the code".
- **Fix**: Correct `prerequisites.md:52` and add these rules to `logic.md`'s summaries section. Note the three deviations in the plan.
- **Decision**: FIXED

### F8 — Cut-off texts are accepted, and the length limit is counted differently

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 infra/compose/energy-app/scripts/build-period-summaries.py:418, 513-521; push-energy-analyser.py:560
- **Detail**:
  - **Cut-off texts:** `finish_reason` is never checked, so a text cut off by `max_tokens=500` (or by a reasoning model) is stored.
  - **Length mismatch:** Python counts code points and zod counts UTF-16 units. A text near 1500 characters that contains emoji passes the lab's checks, and then the app rejects the whole push with 422 every 5 minutes until the entry leaves the push window.
- **Fix**: Reject the text unless `finish_reason == "stop"`, and measure its length as `len(text.encode("utf-16-le")) // 2` in both scripts.
- **Decision**: FIXED

## Success criteria

- **Passing:** all automated criteria for Phases 1–3, as re-run above.
- **Manual:**
  - 1.7, 2.5, 3.4 and 3.5 are ticked, with evidence: the 3.5 production query showed 62/62 complete days plus 3 months with text, and the 15 skipped days are incomplete in `daily_energy`.
  - 3.6 is pending.
  - A data point to check separately: the month facts give 2026-08-03 as 1.1 kWh of PV.

## Triage

All 8 fixed on branch `fix/period-summaries-review` in both repos (2026-10-01):

- **homelab-2:** F1–F5 and F8. 183 unit tests and 139 solar-analyser tests pass, with a break check for each fix.
- **energy-analyser:** F6 (migration `20261001113911_period_summaries_keep_narration.sql`, plus a smoke step) and F7 (docs and the plan's deviations note). 952 tests pass.

The stricter numbers check (F2) was run on 6 stored production texts. 5 pass; the July month text is rejected for "cztery" (a number written as a word), as intended. Stored texts are not re-checked.

Still to do, with the owner's approval:

- a local `db reset` and smoke run for F6;
- the F6 production migration and app deploy;
- the lab install and a dry run on docker-core.
