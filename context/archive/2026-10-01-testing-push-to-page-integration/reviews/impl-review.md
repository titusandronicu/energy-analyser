<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Push-to-page integration tests (test plan Phase 2)

- **Plan**: context/changes/testing-push-to-page-integration/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION (all 10 findings fixed after triage; APPROVED after fixes)
- **Findings**: 0 critical, 5 warnings, 5 observations

Automated verification re-run for the review (worktree `energy-analyser-wt-integration`, branch `testing-push-to-page-integration`, 6 commits on `origin/main` 30c45da, PR #98): `npm run lint` clean, `npx astro check` 0 errors, `npm test` 34 files and 1201 tests, `npm run build` ok, `npm run test:integration` 3 files and 24 tests green against the UGREEN stack, the non-local URL refusal exits 1, `test:integration` is documented in test-plan.md (2), CLAUDE.md (1), AGENTS.md (symlink, 1) and README.md (1), and the decision entry exists. CI on PR #98 was green (`ci` 1m20s, `smoke` 2m10s with the new integration step). Manual rows 1.7, 2.6, 3.6 and 4.5 were confirmed by the owner; 1.8, 2.7 and 3.7 are the CI result.

Plan-drift review: every planned item MATCH except two justified adaptations (far-past hour keys replaced by `freshWindowHours` because `ingest_push` prunes hours older than 35 days in the same call; the Phase 3 ten-sample hourly test rebuilt around a 9-versus-10 sample control because the plan's own text conflicted with the 1 kWh rule). No "What We're NOT Doing" item was violated: no change under `src/`, `supabase/`, `vitest.config.ts` or `stryker.config.mjs`; no value from `docs/ingest/example-v1.json` or the live-flow and recommendation fixtures; `npm test` and Stryker cannot collect `tests/integration`. Five `KNOWN GAP` tests cover the plan's three holes.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — The right-surface negative checks cannot fail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `tests/integration/push-to-page.test.ts:222-231` and `:243-245`
- **Detail**: The daily-only test asserts that three random absent hour keys hold no row and that no recommendation exists at `generatedAt`, a value taken from `nextCapturedAt()` that is never put in any payload. The state-only test asserts that three random far-past days hold no daily row. A store that wrongly wrote hourly, recommendation or daily rows would key them from the payload, never from these unrelated keys, so these assertions pass whatever the store does. Only the controls (the push did land on its own surface) are real. Risk #3's "lands nowhere else" half is therefore unproven.
- **Fix**: Compare table counts before and after the push: `recommendations` and `daily_energy` unchanged, `hourly_energy` not greater (a prune on the same push can only remove rows). The suite is sequential, so the counts are stable.
  - Strength: A spurious write from the wrong section raises a count, so the check can fail for the right reason; no random keys needed.
  - Tradeoff: A concurrent writer (a lab push to the same stack) would make the count move; the suite already assumes no one else writes.
  - Confidence: HIGH — head counts on owner-readable tables are what the loaders' RLS already allows.
  - Blind spot: Another process writing to the stack during the run was not considered.
- **Decision**: FIXED (before/after table counts; break-checked: a stray recommendation raised the count and failed the test)

### F2 — The note on running smoke after the suite names only one failing step

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/foundation/test-plan.md` §6.2 "Ordering with smoke", `docs/prerequisites.md` ("Order with smoke")
- **Detail**: The note says smoke within about 60 s after the suite fails the "bill forecast card" step. `live_state` is also newest by `captured_at` (`20260925123751_live_state_view.sql:22`) and smoke's `freshPush` uses now minus 60 s, so smoke's "dashboard shows the fresh live state" step (expects "3,1 kW") fails too whenever the suite's last state push carries another figure. It passed in this run only because the last file to run, `seed.test.ts`, pushes 3137 W, which reads "3,1 kW": a coincidence of file order.
- **Fix**: Name both steps in the note and keep "run smoke first or wait over a minute" as the rule.
- **Decision**: FIXED (both smoke steps named in section 6.2 and prerequisites.md)

### F3 — The documented command prints every key unfiltered

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `docs/prerequisites.md` ("Env"), `context/foundation/test-plan.md` §6.2 "How to run"
- **Detail**: Both say to take only `API_URL` and `ANON_KEY` from `scripts/remote-docker.sh exec npx supabase status -o env`, but the command as written prints the service-role and secret keys to the terminal, where anything that captures output keeps them. CI already filters (`| grep -E '^(API_URL|ANON_KEY)='`, `ci.yml:40`).
- **Fix**: Put the same filter in the documented command, not only in the warning.
- **Decision**: FIXED (grep filter in the documented command)

### F4 — `freshDays` says "far past" but its range reaches into the usage baseline

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `tests/integration/support/keys.ts:5-6` and `:29-41`
- **Detail**: The day range is 1900-01-01 to 2040-12-31. About 10% of draws are future days (harmless today: the usage baseline skips days on or after today, `usage-insight.ts:223`), but about 0.8% fall inside `HISTORY_DAYS` (400 days, `usage-insight.ts:15`), so roughly 10 to 15% of runs leave a stray invented row in the local usage baseline. The comment "never touch what smoke renders" is not strictly true.
- **Fix**: End the range well before the 400-day window, for example `Date.UTC(2020, 11, 31)`, and correct the comment.
- **Decision**: FIXED (day range ends 2020-12-31, comment corrected)

### F5 — The per-run shifts overclaim that rows can "never equal" an earlier run's

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `tests/integration/push-to-page.test.ts:80-84`, `history-safety.test.ts:279-282` and `:341-345`, test-plan §6.2
- **Detail**: The shift has 50 values in the hourly_history test, 5 in the day-7 test and 40 in the prune test (the prune also varies `pv` over 1000 values). A rerun in the same clock hour, or on the same Warsaw day for the day-7 test, therefore has a 2% to 20% chance of identical values, so "can never equal" is wrong. The day-7 test still discriminates (9 samples versus a stored 10); the hourly_history test then relies on the 201 plus the shift alone.
- **Fix**: Derive a finer per-run figure (three decimals from the millisecond clock, or a counter) and soften the comments and the §6.2 sentence to "very unlikely to equal".
- **Decision**: FIXED (three-decimal per-run figures, wording softened to very unlikely to equal)

### F6 — The far-future `built_at` KNOWN GAP comment misdescribes what a fix does to the test

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `tests/integration/history-safety.test.ts:425-428` and `:447-449`, and the repeated-`generated_at` test at `:458-461`
- **Detail**: The comment says a contract bound on `built_at` "would flip" the test because the later current entry would replace the far-future one. With a bound, the far-future push itself would return 422, so the test would fail at the push, before reaching the gap assertion. The repeated-`generated_at` 409 fix likewise fails at the second `CREATED`, not at a flipped assertion. The other three comments are accurate.
- **Fix**: Reword both comments to say what the fixed behaviour is and which line of the test changes first.
- **Decision**: FIXED (comments say what the fixed behaviour is and which line fails first)

### F7 — The smoke regex does not prove today's push reached the card on a persistent stack

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `scripts/smoke.mjs:275-283`
- **Detail**: The regexp requires "20:00–21:00" within 500 characters after the first "Najwyższe" that follows `hourly-hours`; its comment calls it "the first entry". On a persistent local stack earlier smoke days (day 4 of previous dates) also hold 9.5 kWh at hour 20, so the step can pass even if today's push did not reach the card. CI starts from a fresh stack, so it is sound there.
- **Fix**: Also require the pushed day's date label in the same block, or loosen the comment to what the regexp checks.
- **Decision**: FIXED (regexp also requires the pushed day's own label; smoke 70 of 70)

### F8 — `requireStack` accepts any key that is not obviously secret and any local host

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `tests/integration/support/stack.ts:3`, `:37-53` and `:65-75`; docs/prerequisites.md
- **Detail**: Keys are a deny-list (`sb_secret_` prefix, JWT role `service_role`): an opaque string, an upper-case prefix or a JWT with another role passes. The URL check is a host allow-list, but `127.0.0.1` is not proof of a dev stack: an SSH tunnel to a real project would pass, `ownerClient()` would sign up an `integration-…@example.com` user there before anything proves the seed token exists, and every push prunes and overwrites the newest live, bill and recommendation rows. The docs say the suite "never resets" but do not warn about overwriting and pruning on a stack that also receives real lab pushes. The sign-up address uses the reserved `@example.com` and local auth has no SMTP, so no real mail goes out.
- **Fix A ⭐ Recommended**: Accept only a key that is an `sb_publishable_` string or a JWT with `role === "anon"`, trim the key, require `http:`, and add one sentence to §6.2 and `prerequisites.md` that the suite overwrites the newest live, bill and recommendation rows and prunes old rows, so it must only run on a stack that receives no real lab pushes
  - Strength: Fails closed on any key shape that is not the anon key; the doc warning covers what a host check cannot.
  - Tradeoff: A future CLI key format would need the allow-list updated.
  - Confidence: HIGH — the local anon key is a JWT with role anon and new CLI versions print `sb_publishable_` keys.
  - Blind spot: The exact shapes a local `supabase status` prints on other CLI versions.
- **Fix B**: Keep the deny-list and only add the documentation warning
  - Strength: No code change.
  - Tradeoff: Leaves non-secret-looking wrong keys accepted.
  - Confidence: MEDIUM — depends on nobody pointing the suite at a tunnelled project.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A (anon key allow-list, http only, overwrite and prune warning in the docs)

### F9 — Two statements in the docs are slightly off

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `docs/logic.md:222`, `context/foundation/test-plan.md` §6.2 and `keys.ts:70-71`
- **Detail**: `logic.md` says a newer capture replaces a stored day with whatever it carries, even a null total, but a missing `pv_forecast_kwh` keeps the stored one (`coalesce`, `20261001113911_period_summaries_keep_narration.sql:78`). §6.2 and the `keys.ts` comment say window hours stay at or below 1 kWh, but the hourly_history test pushes loads up to 1.59 kWh in an incomplete day (harmless, below smoke's 9.5 kWh; the "complete day at most 1 kWh" rule itself holds).
- **Fix**: Add "except `pv_forecast_kwh`, which is kept when omitted" to the `logic.md` sentence and reword the other two to say complete days stay at or below 1 kWh.
- **Decision**: FIXED (pv_forecast_kwh exception and the complete-day wording)

### F10 — `plan.md` still describes the two adapted designs

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/testing-push-to-page-integration/plan.md` Phase 1 change 3 and Phase 3 change 2
- **Detail**: Phase 1 still names `freshHours` (far-past hour keys, which the store prunes) and Phase 3 still describes the 40 kWh ten-sample hour. Both adaptations are justified and documented in the cookbook, but the plan, which `/10x-archive` freezes, would mislead a future reader.
- **Fix**: Add one inline note in each of the two Phase blocks (not in Progress): the far-past `freshHours` was replaced by `freshWindowHours` because `ingest_push` deletes hours older than 35 days in the same call, and the ten-sample test uses 9 versus 10 samples with every load at or below 1 kWh.
- **Decision**: FIXED (two inline notes in the plan's Phase blocks)
