# Certification to-do (10xBuilder, 10xArchitect, 10xChampion)

Rules in one place: one attempt, one submission window, everything in one round. If you want Architect or Champion, send the Builder form and the extra-badges form in the same window. Windows: 2026-11-04 (chance of a distinction), 2026-12-06, 2027-01-10 (final). The badges form is https://baserow.io/form/Nht4zggvrLgHUE1__yPugj6gLbob449ETNTe9kehLA8. The Builder form link is not recorded here yet.

Status as of 2026-10-07 (later): Architect report updated to the current state and its open questions resolved; Champion proof still needs screenshots; Builder scored against the saved criteria (all met); the Builder form link is still not recorded. The README now has a section on the three badges and these rules.

## Before choosing a window

- [ ] Decide the window and which badges to go for (Builder alone, plus Architect, plus Champion).
- [x] Save the official 10xBuilder criteria (M1-3) into the repo and score the project against them: done in `context/foundation/certification-criteria.md` (English summary, a proof for each requirement, the dates and rules, the verbatim Polish text). All five mandatory requirements and the optional public URL are met; for a distinction only the submission date (2026-11-04) is open.
- [ ] Save the Builder submission form link next to the badges form link above (the course said it would share the form by week 3 at the latest).

## 10xChampion (code-review pipeline, M5 L2-L3)

- [ ] Screenshot 1: pipeline view with the `code-review` job (run `37309617780`).
- [ ] Screenshot 2: expanded job log, step "Run Claude Code Review", same run.
- [ ] Screenshot 3: the agent's review comment on PR #120 (`github-actions`, titled "Code Review").
- [ ] Optional, stronger proof: label a fresh PR `claude-code-review` close to submission so the run and comment are recent. The workflow only fires on the label.
- [ ] Attach the pipeline definition if the form asks: `.github/workflows/code-review.yml`.
- Reference: `context/champion-evidence.md`.

## 10xArchitect (report, M4)

- [x] Reread `context/architect-report.md` against the regenerated map. Sections 3-6 describe the 2026-10-06 refactor and say so; the opening names the map head (`e630d36`) and the 10 commits since; section 7 is new (two smaller refactors, the warn-first anon-key release, and a gate that turned out not to be real). The map itself was not regenerated, see the last item of this block.
- [x] Resolve the refactor mismatch: PR #131 is titled "phases 1-2 of 5" because it was squash-merged as a draft while commits were still coming, but its five phase commits, both migrations (including `ingest_token_ok`) and the docs are all in it, the plan's 22 ticks carry its squash SHA, and `reviews/archive-sha-repoint.md` records the repoint. The report is right and says so in section 6.
- [x] Check the report length: 1,070 words now (939 before this update, 875 before that). That is about two printed pages; confirm the official page limit, which is not recorded in the repo.
- [ ] Prepare to defend each artifact in your own words: map (L2), research (L3), refactor plan (L4), domain notes (L5).
- [ ] Re-run the map once more near submission if `main` moves a lot (the map is tied to a head SHA).

## Project hygiene that a reviewer may notice

- [ ] Archive `context/changes/alert-rules` and `e2e-alert-rules` (PRs merged, status still `impl_reviewed`).
- [ ] Close or revive `lab-period-summaries` (in flight, untouched since 2026-10-01).
- [ ] Verify alert delivery end to end (plan row 4.6: a manual run produces an alarm and a recovery message), or say plainly that it is unverified.
- [ ] Tidy GitHub issues, which are stale (last update 2026-09-27, shipped slices still open), or note that Linear is the tracker.
- [ ] Decide on `.claude/launch.json` (untracked): commit or ignore.
