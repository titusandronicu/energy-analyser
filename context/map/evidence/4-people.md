# Evidence: people

Window: 2026-09-14..2026-10-05 (whole history, 3 weeks). 269 non-merge commits in the raw pass, 268 counted (mass commit 13e1df5 dropped from per-capability counts here).
Authors in the log: Kamil Nowosad 217, titusandronicu 42 (same owner, GitHub noreply identity used for squash merges), Mother Console 7, Cursor Agent 3.
**humans_in_window = 1.** Kamil Nowosad and titusandronicu are merged into one person. Mother Console (homelab host identity) and Cursor Agent are activity, not people evidence; Mother Console is flagged unknown (could be automation or a person). Per false-signals rule 6, every concentration number below is a baseline, not a finding. Bus factor of 1 is the team-size baseline and is not reported as a risk.

Attribution: capabilities.tsv (globs first, then longest prefix). A commit counts once for every capability it touches. package-lock.json excluded. Counts are commits (human = Kamil Nowosad + titusandronicu).

## Areas

All high or medium capabilities from the inventory (ingest, access, live-flow, bill, platform, foundations = high; advice, history, ratings, notes, dashboard = medium). All 11 are covered. Top 5 by counted changes needed no additions. docs is prose and is listed only as context. "unmapped" has 5 commits and is not analysed.

## People per capability

Every capability has one human: Kamil Nowosad (owner, same person as titusandronicu). Periods are by author date. Topic groups come from Conventional Commit scopes and subjects of commits touching the capability. The scopes are change ids, so they show which planned changes touched which area.

| Capability          | Human commits (all) | Kamil Nowosad / titusandronicu | Period (human) | Topic groups (scopes, most frequent)                                                                                                                 | Non-human activity                                                                                                     |
| ------------------- | ------------------- | ------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ingest              | 31                  | 24 / 7                         | 09-23..10-05   | push-ingestion-endpoint (7), bill-forecast fields (5), daily-history-push (3), grid-export-mismatch (3), lab-period-summaries (2)                    | none                                                                                                                   |
| access              | 17                  | 13 / 4                         | 09-23..10-05   | access-key-sign-in, auth, middleware, migrations; 4 fix and 6 feat                                                                                   | Mother Console 2 (09-19: CSRF origin behind proxy; production-deploy prep)                                             |
| live-flow           | 31                  | 25 / 6                         | 09-25..10-05   | dashboard-refresh (7), live-flow-interaction (7), live-state-with-staleness (4), live-state-flow-visual (3), inverter-grid-correction                | Cursor Agent 1 (frosted aurora theme, cross-cutting)                                                                   |
| bill                | 24                  | 18 / 6                         | 09-28..10-05   | bill-forecast (10), dashboard-refresh (4), recommendation-card-refresh (2), inverter-grid-correction                                                 | Cursor Agent 1 (same theme commit)                                                                                     |
| platform            | 39                  | 25 / 14                        | 09-23..10-05   | CI (ci scope 2 plus 3 ci-type commits), deploy prep, access-key and ingest migrations/config, testing                                                | Mother Console 6 (09-14..09-19: repo init, Buildx attestations, pin setup-node action, IPv6 bind, Micr.us deploy prep) |
| foundations         | 51                  | 38 / 13                        | 09-23..10-05   | dashboard-refresh (6), data-period-transparency (4), recommendation-card-refresh (3), live-flow-interaction (3), glass restyle (3)                   | Cursor Agent 1, Mother Console 1 (both cross-cutting)                                                                  |
| advice              | 35                  | 27 / 8                         | 09-23..10-05   | dashboard-refresh (5), recommendation-card-refresh (4), data-period-transparency (3), seasonal-usage-insight (3), usage-norm-scale (2); 10 fix of 37 | Cursor Agent 2 (token-class formatting fix; theme commit)                                                              |
| history             | 26                  | 13 / 13                        | 09-26..10-05   | history-calendar (4), grid-export-mismatch (4), data-period-transparency (3), day-notes, period-ratings                                              | none                                                                                                                   |
| ratings             | 14                  | 3 / 11                         | 09-30..10-05   | lab-period-summaries (3), period-ratings (3), inverter-grid-correction (3)                                                                           | none                                                                                                                   |
| notes               | 8                   | 3 / 5                          | 09-30..10-05   | day-notes (2), history-calendar (2)                                                                                                                  | none                                                                                                                   |
| dashboard           | 25                  | 22 / 3                         | 09-23..10-05   | live-flow-interaction (4), dashboard-refresh (3), history-calendar (2), seasonal-usage-insight (2)                                                   | Cursor Agent 1, Mother Console 1 (cross-cutting)                                                                       |
| docs (context only) | 227                 | 202 / 25                       | 09-23..10-05   | archive (29), bill-forecast and bill-accuracy (12 each), grid-export-mismatch (10)                                                                   | Cursor Agent 2, Mother Console 4                                                                                       |

Reading note: the split between the two names is a workflow artefact (direct commits by Kamil Nowosad, squash-merged PRs by titusandronicu, with the later weeks dominated by merges). It is not two people.

## Concentration

- evidence: small team, concentration is the baseline. In every capability one person made 100% of the human commits (ingest 31 of 31, history 26 of 26, ratings 14 of 14, notes 8 of 8; others 24 to 51, all by the same owner). That is the team-size baseline and is not evidence of a hot spot.
- evidence: capabilities that only one person has ever touched: all 11 analysed capabilities plus docs.
- evidence: capabilities touched by no non-human identity at all: ingest, history, ratings, notes (so their whole history is one person's, with no ambiguous-identity commits).
- evidence: capabilities with non-human commits are access (2), platform (6), dashboard (2), foundations (2), live-flow (1), bill (1), advice (2). Most come from cross-cutting commits: the Mother Console production-deploy preparation (6 capabilities) and the Cursor Agent frosted-aurora theme (6 capabilities).

## Agent co-authorship

evidence: `Co-authored-by: Claude` trailers on human commits, by capability: ingest 31 of 31, access 17 of 17, live-flow 31 of 31, bill 24 of 24, platform 39 of 39, foundations 51 of 51, advice 35 of 35, history 26 of 26, ratings 14 of 14, notes 8 of 8, dashboard 25 of 25, docs 214 of 227 (94%). Caveat: this was computed from the trailer text on all commits in the capability; the non-human commits appear not to carry it, but that was not verified one by one. Reading: Claude Code pairing is the working mode in every capability (about 99% of human code commits), so the owner steered the change and the agent wrote much of the text; this is context, not a filter. The 13 docs commits without a trailer are mostly prose edits.

## Implications

- inference: there is nobody else to ask. "Whom to ask" resolves to the repo owner for every capability; the better source is the planning trail. Per capability, read the archived change folder named by the scope (context/archive/<date>-<change-id>/, for example push-ingestion-endpoint, access-key-sign-in, live-flow-interaction, bill-forecast, history-calendar) and the squash-merged PR it came from.
- inference: all prior attempts and decisions live in `context/archive`, `docs/decisions.md` and PR descriptions, not in anyone else's memory. Before changing platform, read the Mother Console commits of 09-14..09-19 (proxy CSRF origin, IPv6 bind, Buildx, setup-node): they are the earliest deploy attempts and their authorship is unclear.
- evidence: of 108 PRs, all were opened by titusandronicu. Reviews came from the bots chatgpt-codex-connector (52 PRs) and sourcery-ai (98 PRs) and 1 by titusandronicu. Per false-signals rule 7, bot reviews are not human review. There is no second human reviewer anywhere in the PR history.
- inference: a second human appearing would change every number above; re-run this scan then.

## Unknowns

- unknown: who or what "Mother Console" is (7 commits, 2026-09-14..09-19, homelab host identity): a person using a host account, a script, or an agent running on the homelab. Its commits are the initial repository setup and the first production-deploy fixes.
- unknown: whether Cursor Agent commits (3, 2026-09-29) were directed by the owner (very likely, cloud agent; not confirmed).
- unknown: formal ownership (no CODEOWNERS was read for this pass; git-log pass only), who else has repository access, and whether anyone is expected to join. The homelab-2 repo and the external lab consumers of the ingest contract are outside this repository (unknown, external).
- unknown: the 3-week history is too short to show who holds knowledge over time; no trend in authorship can be derived.
- Not done: the ratio of fix commits per person (one person); no `git blame`; source files not read.

## Commands run

- Read capabilities.tsv, scan-contract.md, git-log.txt (existing raw pass; no new git calls)
- python3 context/map/.work/people.py (attribution by capabilities.tsv, authors, trailers, scopes; output in .work/people-by-cap.json)
- python3 inline merge of human counts per capability
- gh pr list -R titusandronicu/energy-analyser --state all --limit 200 --json author,reviews (read-only)
