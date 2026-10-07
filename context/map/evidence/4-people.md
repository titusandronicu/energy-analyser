# Evidence: people

Window: 2026-09-14..2026-10-07 (whole history, 3.5 weeks; head e630d36). 281 non-merge commits in the raw pass, 280 counted (mass commit 13e1df5 dropped from per-capability counts here).
Authors in the log: Kamil Nowosad 217, titusandronicu 54 (same owner, GitHub noreply identity used for squash merges), Mother Console 7, Cursor Agent 3.
**humans_in_window = 1.** Kamil Nowosad and titusandronicu are merged into one person (271 human commits, 96%). Mother Console (homelab host identity) and Cursor Agent are activity, not people evidence; Mother Console is flagged unknown (could be automation or a person). Per false-signals rule 6, every concentration number below is a baseline, not a finding. Bus factor of 1 is the team-size baseline and is not reported as a risk.

Attribution: capabilities.tsv (globs first, then longest prefix), now including the new `alerts` capability. A commit counts once for every capability it touches. package-lock.json excluded. Counts are commits (human = Kamil Nowosad + titusandronicu).

## Areas

All high or medium capabilities from the inventory, plus the new `alerts` capability (alert rules, evaluation, Telegram, trigger script): ingest, access, live-flow, bill, platform, foundations, alerts, advice, history, ratings, notes, dashboard. All 12 are covered. docs is prose and is listed only as context. "unmapped" has 7 commits and is not analysed.

## People per capability

Every capability has one human: Kamil Nowosad (owner, same person as titusandronicu). Periods are by author date. Topic groups come from Conventional Commit scopes and subjects of commits touching the capability. The scopes are change ids, so they show which planned changes touched which area.

| Capability          | Human commits (all) | Kamil Nowosad / titusandronicu | Period (human) | Topic groups (scopes, most frequent)                                                                                                                 | Non-human activity                                                                                                     |
| ------------------- | ------------------- | ------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ingest              | 32                  | 24 / 8                         | 09-23..10-06   | push-ingestion-endpoint (7), bill-forecast fields (5), daily-history-push (3), grid-export-mismatch (3), live-flow-interaction (3)                   | none                                                                                                                   |
| access              | 19                  | 13 / 6                         | 09-23..10-06   | auth (3), seasonal-usage-insight (2), todays-recommendation (2), access-key-sign-in (2); 4 fix and 7 feat                                            | Mother Console 2 (09-19: CSRF origin behind proxy; production-deploy prep)                                             |
| live-flow           | 31                  | 25 / 6                         | 09-25..10-05   | dashboard-refresh (7), live-flow-interaction (7), live-state-with-staleness (4), live-state-flow-visual (3), data-period-transparency (3)            | Cursor Agent 1 (frosted aurora theme, cross-cutting)                                                                   |
| bill                | 25                  | 18 / 7                         | 09-28..10-06   | bill-forecast (10), dashboard-refresh (4), recommendation-card-refresh (2), inverter-grid-correction, period-ratings                                 | Cursor Agent 1 (same theme commit)                                                                                     |
| platform            | 45                  | 25 / 20                        | 09-23..10-06   | access-key-sign-in (3), push-ingestion-endpoint (3), bill-forecast (3), alert-rules (2), ci (2 plus 3 ci-type commits), deploy prep, testing         | Mother Console 6 (09-14..09-19: repo init, Buildx attestations, pin setup-node action, IPv6 bind, Micr.us deploy prep) |
| foundations         | 52                  | 38 / 14                        | 09-23..10-06   | dashboard-refresh (6), data-period-transparency (4), recommendation-card-refresh (3), live-flow-interaction (3), dashboard-glass-restyle (3)         | Cursor Agent 1, Mother Console 1 (both cross-cutting)                                                                  |
| alerts              | 5                   | 0 / 5                          | 10-06          | alert-rules (2 scoped; fix 2, feat 2, test 1), all squash-merged on 10-06                                                                            | none                                                                                                                   |
| advice              | 35                  | 27 / 8                         | 09-23..10-05   | dashboard-refresh (5), recommendation-card-refresh (4), data-period-transparency (3), seasonal-usage-insight (3), usage-norm-scale (2); 10 fix of 34 | Cursor Agent 2 (token-class formatting fix; theme commit)                                                              |
| history             | 27                  | 13 / 14                        | 09-26..10-06   | history-calendar (4), grid-export-mismatch (4), data-period-transparency (3), day-notes (2), period-ratings (2)                                      | none                                                                                                                   |
| ratings             | 14                  | 3 / 11                         | 09-30..10-05   | lab-period-summaries (3), period-ratings (3), inverter-grid-correction (3)                                                                           | none                                                                                                                   |
| notes               | 8                   | 3 / 5                          | 09-30..10-05   | day-notes (2), history-calendar (2)                                                                                                                  | none                                                                                                                   |
| dashboard           | 26                  | 22 / 4                         | 09-23..10-06   | live-flow-interaction (4), dashboard-refresh (3), history-calendar (2), seasonal-usage-insight (2), data-period-transparency (2)                     | Cursor Agent 1, Mother Console 1 (cross-cutting)                                                                       |
| docs (context only) | 239                 | 202 / 37                       | 09-23..10-07   | archive (29), bill-forecast and bill-accuracy (12 each), grid-export-mismatch (10)                                                                   | Cursor Agent 2, Mother Console 4                                                                                       |

Reading note: the split between the two names is a workflow artefact (direct commits by Kamil Nowosad, squash-merged PRs by titusandronicu, with the later weeks dominated by merges; alerts was merged entirely under the second name). It is not two people.

## Concentration

- evidence: small team, concentration is the baseline. In every capability one person made 100% of the human commits (ingest 32 of 32, history 27 of 27, ratings 14 of 14, notes 8 of 8, alerts 5 of 5; others 19 to 52, all by the same owner). That is the team-size baseline and is not evidence of a hot spot.
- evidence: capabilities that only one person has ever touched: all 12 analysed capabilities plus docs.
- evidence: capabilities touched by no non-human identity at all: ingest, history, ratings, notes, alerts (so their whole history is one person's, with no ambiguous-identity commits).
- evidence: capabilities with non-human commits are access (2), platform (6), dashboard (2), foundations (2), live-flow (1), bill (1), advice (2). Most come from cross-cutting commits: the Mother Console production-deploy preparation (6 capabilities) and the Cursor Agent frosted-aurora theme (6 capabilities). alerts is the newest capability and has the shortest history (one day of human commits, 5), so its figures say nothing yet about ownership over time.

## Agent co-authorship

evidence: `Co-authored-by: Claude` trailers (first trailer field of each commit in the raw log) are on 256 of 271 human commits (94.5%) and 256 of 281 commits overall (91.1%). By model: Claude Opus 5.5 145, Claude Sonnet 5.5 81, Claude Opus 5 (1M context) 18, Claude Sonnet 5 12. By capability, human commits with a Claude trailer: ingest 32 of 32, access 19 of 19, live-flow 31 of 31, bill 25 of 25, platform 45 of 45, foundations 52 of 52, alerts 5 of 5, advice 35 of 35, history 27 of 27, ratings 14 of 14, notes 8 of 8, dashboard 26 of 26, docs 224 of 239 (94%). The 15 human commits without a trailer are all docs-touching (mostly prose edits). No Codex, Copilot, Gemini or other agent trailers exist; the 10 non-human commits carry no Claude trailer (the Cursor Agent theme commit lists titusandronicu as co-author). Codex appears only as a PR reviewer (chatgpt-codex-connector), not as a commit author. Reading: Claude Code pairing is the working mode in every code capability (100% of human code commits), so the owner steered the change and the agent wrote much of the text; this is context, not a filter. Caveat: only the first trailer per commit is in the log; full commit bodies of squash merges list several Co-Authored-By lines (361 lines across messages), which are not used here.

## Implications

- inference: there is nobody else to ask. "Whom to ask" resolves to the repo owner for every capability; the better source is the planning trail. Per capability, read the archived or active change folder named by the scope (context/archive/<date>-<change-id>/ or context/changes/<change-id>/, for example push-ingestion-endpoint, access-key-sign-in, live-flow-interaction, bill-forecast, history-calendar, alert-rules) and the squash-merged PR it came from. For alerts the trail is context/changes/alert-rules (plan, impl-review, review-fixes).
- inference: all prior attempts and decisions live in `context/archive`, `docs/decisions.md` and PR descriptions, not in anyone else's memory. Before changing platform, read the Mother Console commits of 09-14..09-19 (proxy CSRF origin, IPv6 bind, Buildx, setup-node): they are the earliest deploy attempts and their authorship is unclear.
- evidence: of 124 PRs, all were opened by titusandronicu. Reviews came from the bots sourcery-ai (98 PRs) and chatgpt-codex-connector (60 PRs) and 1 by titusandronicu. Per false-signals rule 7, bot reviews are not human review. There is no second human reviewer anywhere in the PR history.
- inference: a second human appearing would change every number above; re-run this scan then.

## Unknowns

- unknown: who or what "Mother Console" is (7 commits, 2026-09-14..09-19, homelab host identity): a person using a host account, a script, or an agent running on the homelab. Its commits are the initial repository setup and the first production-deploy fixes.
- unknown: whether Cursor Agent commits (3, 2026-09-29) were directed by the owner (very likely, cloud agent; not confirmed).
- unknown: formal ownership (no CODEOWNERS was read for this pass; git-log pass only), who else has repository access, and whether anyone is expected to join. The homelab-2 repo and the external lab consumers of the ingest contract are outside this repository (unknown, external).
- unknown: the 3.5-week history is too short to show who holds knowledge over time; no trend in authorship can be derived, and alerts has under a day of history.
- Not done: the ratio of fix commits per person (one person); no `git blame`; source files not read; trailers other than the first per commit not counted.

## Commands run

- Read capabilities.tsv (now with the alerts globs), git-log.txt (regenerated raw pass; no new git log pass for attribution)
- python3 context/map/.work/people.py (attribution by capabilities.tsv, authors, trailers, scopes; output in .work/people-by-cap.json, now includes alerts)
- python3 inline merge of human counts and Claude trailers per capability and by model
- git log --no-merges --format='%an|%ae' and grep of Co-authored-by / Codex / Copilot / Gemini in commit bodies (read-only)
- gh pr list -R titusandronicu/energy-analyser --state all --limit 300 --json author,reviews (read-only)
