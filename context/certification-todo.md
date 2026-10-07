# Certification to-do (10xBuilder, 10xArchitect, 10xChampion)

Rules in one place: one attempt, one submission window, everything in one round. If you want Architect or Champion, send the Builder form and the extra-badges form in the same window. Windows: 2026-11-04 (chance of a distinction), 2026-12-06, 2027-01-10 (final). The badges form is https://baserow.io/form/Nht4zggvrLgHUE1__yPugj6gLbob449ETNTe9kehLA8. The Builder form link is not recorded here yet.

Status as of 2026-10-07: Architect artifacts complete, Champion proof needs screenshots, Builder not scored (criteria not in the repo).

## Before choosing a window

- [ ] Decide the window and which badges to go for (Builder alone, plus Architect, plus Champion).
- [ ] Save the official 10xBuilder criteria (M1-3) into the repo, for example `context/foundation/certification-criteria.md`, then score the project against them. The earlier "criteria pasted by the user" in `context/foundation/shape-notes.md` were never stored.
- [ ] Save the Builder submission form link next to the badges form link above.

## 10xChampion (code-review pipeline, M5 L2-L3)

- [ ] Screenshot 1: pipeline view with the `code-review` job (run `37309617780`).
- [ ] Screenshot 2: expanded job log, step "Run Claude Code Review", same run.
- [ ] Screenshot 3: the agent's review comment on PR #120 (`github-actions`, titled "Code Review").
- [ ] Optional, stronger proof: label a fresh PR `claude-code-review` close to submission so the run and comment are recent. The workflow only fires on the label.
- [ ] Attach the pipeline definition if the form asks: `.github/workflows/code-review.yml`.
- Reference: `context/champion-evidence.md`.

## 10xArchitect (report, M4)

- [ ] Reread `context/architect-report.md` against the regenerated map. Sections 3-6 describe 2026-10-06; the opening and section 2 were updated.
- [ ] Resolve the refactor mismatch before defending the report: PR #131 is titled "phases 1-2 of 5" but contains both migrations (including `ingest_token_ok`), and the report describes all five phases as done. Check `context/archive/2026-10-06-refactor-push-boundary/plan.md` ticks and say which is true.
- [ ] Check the report prints to about two pages (875 words before the last edits).
- [ ] Prepare to defend each artifact in your own words: map (L2), research (L3), refactor plan (L4), domain notes (L5).
- [ ] Re-run the map once more near submission if `main` moves a lot (the map is tied to a head SHA).

## Project hygiene that a reviewer may notice

- [ ] Archive `context/changes/alert-rules` and `e2e-alert-rules` (PRs merged, status still `impl_reviewed`).
- [ ] Close or revive `lab-period-summaries` (in flight, untouched since 2026-10-01).
- [ ] Verify alert delivery end to end (plan row 4.6: a manual run produces an alarm and a recovery message), or say plainly that it is unverified.
- [ ] Tidy GitHub issues, which are stale (last update 2026-09-27, shipped slices still open), or note that Linear is the tracker.
- [ ] Decide on `.claude/launch.json` (untracked): commit or ignore.
