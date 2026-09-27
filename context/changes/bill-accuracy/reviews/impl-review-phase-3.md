<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bill accuracy

- **Plan**: context/changes/bill-accuracy/plan.md
- **Scope**: Phase 3 of 4
- **Reviewed phases**: 3
- **Date**: 2026-09-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 4 observations

Reviewed: `homelab-2@362e9d3` (2 files), `energy-analyser@599ca2f` (plan.md, change.md), and the deployed state on `docker-core` and the UGREEN, which this phase changed without leaving a diff.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Every contract bullet of Phase 3 is met, and all twelve checkable claims in the rewritten runbook paragraph were verified line-by-line against the code. The warnings are: one reliability defect introduced by an out-of-contract edit, two inaccurate sentences, two undocumented runbook procedures, and one deliberately deferred criterion.

## Findings

### F1 — The new HA fallback always exceeds the 255-character `input_text` cap

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: infra/homeassistant/packages/gemini_home_reports.yaml:87-93 (cap at :7, guard at :53)
- **Detail**: Measured by rendering the folded scalar with realistic values: the old fallback was 212-214 characters and always fit `input_text.home_report_last_text` (`max: 255`). The rewritten one is 243 constant characters plus five numeric placeholders and renders at **259-261**, always over the cap. The guard at :53 is `truncate(255, true, '')`, and Jinja's default `truncate` leeway is 5, so a value of 256-260 is returned **unchanged** — exactly the common range here. `input_text.set_value` then receives an over-length value, HA rejects it, and the entity silently keeps the previous report while `tts.speak` at :59 speaks the new one. Only the LLM-failure path is affected, which is the path meant to be the safety net. Speech itself is unaffected (:59 uses the untruncated text).
- **Fix A (Recommended)**: Shorten the new clause so the rendered string fits in all cases — e.g. `Za oddaną energię przysługuje opust 0,8, rozliczany miesięcznie.`, which brings the constant part to about 213 and the worst case to about 243.
  - Strength: Keeps the sentence whole and spoken as written; no behaviour change anywhere else.
  - Tradeoff: Constrains future wording of this fallback; the cap stays implicit.
  - Confidence: HIGH — lengths measured directly from the file, not estimated.
  - Blind spot: Have not checked the other scripts' fallbacks for the same latent overflow.
- **Fix B**: Make the guard deterministic with `truncate(255, true, '', 0)` at :53.
  - Strength: Fixes the whole class, including `home_report`'s longer fallback.
  - Tradeoff: The new clause is then cut mid-sentence rather than kept; treats the symptom.
  - Confidence: HIGH — leeway semantics confirmed against the rendered lengths.
  - Blind spot: Other callers of the same guard not surveyed.
- **Decision**: FIXED via Fix A + Fix B — the fallback clause shortened to "Za oddaną energię przysługuje opust 0,8, rozliczany miesięcznie." (renders 229-239, was 259-261) and the guard at :53 changed to `truncate(255, true, '', 0)` so the leeway can no longer let an over-length value through. YAML re-validated, redeployed to the UGREEN (backup .bak-20260927203929), HA config check exit=0, reload_all 200, logs clean.

### F2 — The `change.md` deferral note overstates two facts

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (accuracy)
- **Location**: context/changes/bill-accuracy/change.md, appended "Phase 3 deploy" section
- **Detail**: This note is the sole justification for leaving 3.5 open and will be the brief for the follow-up backport, so its precision matters. Two errors. (1) It lists `battery_plan_ack` among symbols that "exist nowhere in homelab-2's git history on any branch". The server endpoint `handle_battery_plan_ack` **is** in history at `infra/compose/energy-app/scripts/pge-upload-api.py:76,116`, added by `1b3ca89`; only the bot-side client is absent. A reader who greps will find hits and mistrust the whole note. (2) "about 101 lines ahead" is the count of live-only lines in a diff, while the net difference is 62 lines (949 against 887); the note does not say which it means.
- **Fix**: Narrow the claim to the bot-side client (`BATTERY_PLAN_POLL_INTERVAL`, `PENDING_BATTERY_PLAN`, and the caller of `battery_plan_ack` — noting the server endpoint exists at `pge-upload-api.py:116`), and say "101 live-only lines, 62 net".
- **Decision**: FIXED — the drift pre-check loop now covers all seven scripts the install loop touches (refresh-energy-agent-data.sh keeps its own diff above, for the .env.push caveat), with a note that a first install diffs as a whole file; the backup loop now matches the install loop exactly and also backs up app-src/{tariffs,billing}.py.

### F3 — The runbook's drift check and backup loop skip this change's two newest scripts

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: runbooks/energy-analyser-push.md:20-31 (drift pre-check), :43-46 (backup loop)
- **Detail**: The install loop at :48-52 covers eight scripts, but the drift pre-check covers only four and the backup loop only five. `build-current-month-bill-forecast.py` and `append-pge-settlement-history.py` — the two scripts this change introduces — are in neither. A future operator following the runbook gets no drift warning and no backup for them, and would overwrite server-side changes silently. This is the same blind spot that produced the telegram-home surprise this phase uncovered; today's backups exist only because they were taken by hand outside the runbook.
- **Fix**: Add both scripts to the drift pre-check list and the backup loop, so all three lists cover the same set.
  - Strength: Closes a demonstrated failure mode; the lists are meant to agree and now visibly do not.
  - Tradeoff: Touches a Phase 3 file again after the phase commit.
  - Confidence: HIGH — the three lists were extracted and compared directly.
  - Blind spot: Other runbooks may have the same list-drift pattern; not surveyed.
- **Decision**: FIXED — added an explicit app-src install step to runbooks/energy-analyser-push.md with the commands actually used (-m 0644), the 2026-09-27 finding that the host had no tariffs.py and a Jul 17 billing.py, and a note that homelab-energy-api imports solar_analyser at start-up (pge-upload-api.py:18-19) so it keeps the old modules until restarted while the refresh scripts pick them up next run.

### F4 — No runbook procedure for installing the `solar_analyser` sources into `app-src`

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: runbooks/energy-analyser-push.md:55 (requirement only); no install step anywhere in runbooks/
- **Detail**: The plan's Intent for Phase 3 said to deploy the `solar_analyser` sources "using the runbook's copy to `/tmp` and `sudo install` flow" and to "Record the new files in the runbook". The sources were deployed — the host was missing `tariffs.py` entirely and carried a Jul 17 `billing.py` — and the requirement is stated at :55, but the procedure was never written down. The deploy is therefore not reproducible from the runbook, and the next person hits the same missing-`tariffs.py` failure with no documented remedy. This is also the lessons.md rule "Name every prerequisite outside the repo" applied to a one-time production step.
- **Fix**: Add the `app-src` install step to `runbooks/energy-analyser-push.md` next to the script install, with the `-m 0644` mode actually used and a note that the API container mounts `app-src` read-only so it must be restarted to pick up changes.
  - Strength: Makes the deploy reproducible and records a prerequisite the lessons register already demands.
  - Tradeoff: Slightly enlarges a runbook that is already long.
  - Confidence: HIGH — `grep -rn app-src runbooks/` returns only the requirement and an env var.
  - Blind spot: Whether the API container was ever restarted to pick up the new `billing.py` was not verified.
- **Decision**: FIXED — the note now says "101 lines present only on the live side, 62 net", narrows the missing symbols to the bot-side client, and records that the server half (handle_battery_plan_ack, pge-upload-api.py:116, commit 1b3ca89) is in the repo.

### F5 — Criterion 3.5 is unmet; Phase 3 is not complete

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/bill-accuracy/plan.md:416
- **Detail**: Telegram `/energy` prints the forecast line and it is now credit-aware, because the output keys stayed compatible. But on a `no_data` body the live bot still prints `0.00 PLN`: the running `telegram-home` image is not built from the repo and carries undocumented features a rebuild would delete. Deferred deliberately by the owner on 2026-09-27 with the reason recorded, and correctly left unchecked. Recorded here so the archive step does not read Phase 3 as fully done. Precedent exists for the fix: `1b3ca89` backported docker-core server drift the same way.
- **Fix**: Open the backport change (repo first, per AGENTS.md), then rebuild `telegram-home` with the Phase 2 bot change on top, then check 3.5.
- **Decision**: ACCEPTED — the reason is recorded in change.md and that is enough for now; no separate change folder is opened until someone picks up the backport.

### F6 — The runbook says "every run" publishes `closed_month_check`

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (accuracy)
- **Location**: runbooks/solar-energy-analyser-validation.md:211-213
- **Detail**: `closed_month_check` returns `None`, and the key is omitted, whenever `invoice_gross_pln`, `consumed_kwh`, `feed_in_kwh` or `factor` is missing or the invoice is `<= 0` (`build-current-month-bill-forecast.py:459-465`), and it is never computed on a `no_data` run. The rest of the sentence is correct.
- **Fix**: Change to "publishes `closed_month_check` whenever the reference invoice amount is known".
- **Decision**: FIXED — reworded to "Whenever the reference invoice amount is known, the run also re-applies the formula ...".

### F7 — The runbook's `no_data` sentence describes the repo, not the lab

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (accuracy)
- **Location**: runbooks/solar-energy-analyser-validation.md:214-216
- **Detail**: "so consumers show the reason instead of a zero amount" is true of `web/app.js`, which is deployed, and of `bot.py` in the repo — but not of the running Telegram bot, which prints `0.00 PLN` (see F5). An operator reading this runbook would conclude the behaviour is live everywhere.
- **Fix**: Qualify it — the lab page honours the reason; the Telegram bot will once the backport lands.
- **Decision**: FIXED — the sentence now says the lab page shows the reason while the Telegram bot still prints 0.00 PLN until its image is rebuilt from the repo, pointing at the bill-accuracy change notes.

### F8 — The prompt lost its prohibition on claiming financial gain

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: infra/homeassistant/packages/gemini_home_reports.yaml:84-86
- **Detail**: The removed sentence banned discussing financial gain outright (`nie wolno mówić o finansowym zysku`); the replacement bans only PLN amounts. The model is now told a benefit exists (0.8 kWh back per kWh) with nothing forbidding it from framing that as savings, so "to się opłaca" is newly reachable without naming a currency. The global guard at :38 (`Rozróżniaj bilans energetyczny od finansowego`) is related but weaker. Note the interaction with F1: any added clause must fit the character budget.
- **Fix**: Add a short clause such as `Nie oceniaj zysku finansowego.` to the `facts` prompt (the prompt, not the length-constrained fallback).
- **Decision**: FIXED — added "i nie oceniaj zysku finansowego" to the facts prompt (the prompt is not length-capped; only the fallback is). Redeployed and reloaded.

### F9 — Criterion 3.4 names a scheduled run that does not exist

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/bill-accuracy/plan.md:415
- **Detail**: 3.4 reads "after the next scheduled run", but `gemini_home_reports.yaml` defines only `script:` entries — no automation and no time trigger. The reports are invoked by Google Home routines, so there is no scheduled run to wait for. The evidence behind the ticked box is the deployed prompt text plus a clean `reload_all` and all five scripts re-registered, not an observed report. Also worth noting: the framing was added to `energy_report` only, so the combined `home_report` script still describes the same household with no settlement context — it never said net-billing, so 3.4 holds either way.
- **Fix**: Either trigger one report to observe it, or reword the criterion to match how reports are actually invoked.
- **Decision**: FIXED — verified by observation instead of rewording. Rather than firing script.energy_report (which speaks through the office display), ran the gemini-home-reports runbook's documented silent `ai_task.generate_data` health check against `ai_task.free_models_router` with the deployed prompt text. HTTP 200, and the returned Polish report mentions no net-billing, no PLN amount and no financial-gain claim. 3.4 now rests on an observed run, not only on the deployed text. The criterion's "scheduled run" wording is still inaccurate — reports are invoked by Google Home routines — but is left as the plan wrote it.
