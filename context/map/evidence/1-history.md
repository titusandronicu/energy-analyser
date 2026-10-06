# Evidence: history

Window (contract): 12 months ago..HEAD, effective 2026-09-14..2026-10-05 (whole history, 331 commits total at HEAD e334854). Commits counted: 268 (269 non-merge, minus mass commit 13e1df5). Buckets: ISO week of author date; only 3 weeks of data, so every trend is weak. W38 = 09-14..09-19 (7 commits, repository bootstrap), W39 = 09-23..09-27 (91), W40 = 09-28..10-02 (163), W41 = 10-05 only, one day (7). Humans in window: 1, so concentration is a baseline. Counting rules: contract (changes per file, commits once per capability touched, cross-cutting counted for each). Excluded from counts: package-lock.json and image files, so 1582 file changes counted (the contract's 1746 includes lockfile and media). Attribution: capabilities.tsv (globs first, then longest prefix); renames folded via the new path.

## Activity per capability

| capability               | changes | share | commits |
| ------------------------ | ------: | ----: | ------: |
| docs (prose, not ranked) |     829 | 52.4% |     233 |
| platform                 |     109 |  6.9% |      45 |
| foundations              |      87 |  5.5% |      53 |
| advice                   |      86 |  5.4% |      37 |
| history                  |      85 |  5.4% |      26 |
| ingest                   |      83 |  5.2% |      31 |
| live-flow                |      75 |  4.7% |      32 |
| access                   |      67 |  4.2% |      19 |
| bill                     |      53 |  3.4% |      25 |
| dashboard                |      51 |  3.2% |      27 |
| ratings                  |      26 |  1.6% |      14 |
| notes                    |      19 |  1.2% |       8 |
| unmapped                 |      12 |  0.8% |       5 |

- Excluding docs, 753 code/config changes: platform 14.5%, foundations 11.6%, advice 11.4%, history 11.3%, ingest 11.0%, live-flow 10.0%, access 8.9%, bill 7.0%, dashboard 6.8%, ratings 3.5%, notes 2.5%, unmapped 1.6%. Distribution is flat: no capability dominates (evidence). Of 268 commits, 142 touch code or config, 126 are docs-only.
- Unmapped: 12 changes (0.8% of all, 1.6% of code), all in files deleted before HEAD (see Hub files and freshness): Topbar.astro, Welcome.astro, ForecastCard.astro, pages/index.astro, auth-validation.ts. Mapping is complete for live code (evidence).
- Agent-authored (Cursor Agent): 3 commits (docs 2 changes, advice, bill, live-flow, dashboard, foundations one commit each; the largest is the aurora theme 2a0ba8f). Ambiguous identity "Mother Console": 7 commits, all in W38 (bootstrap and production deploy prep: platform 6 commits, access 2, docs 4, dashboard 1, foundations 1). Both counted as activity, kept out of people evidence.
- Test share of file changes (test files and tests/): history 36%, live-flow 29%, advice 28%, ingest 27%, ratings 38%, bill 23%, notes 26%, foundations 22%, access 16%, platform 6%, dashboard 4%. Dashboard shell has almost no test touches (evidence; dashboard.astro is covered by smoke.mjs, see below).
- Migrations: 22 migration file touches (ingest 8, access 6, ratings 3, bill 2, live-flow 2, notes 1), includes 9 in-place timestamp renames noted by the contract.

## Top files in top capabilities

(commits touching the file, window-wide)

- platform: scripts/smoke.mjs 19, .github/workflows/ci.yml 7, package.json 7, .gitignore 5, .env.example 5, .github/workflows/code-review.yml 4.
- foundations: src/styles/global.css 14, src/types.ts 7, src/lib/format/warsaw-time.ts 7, src/lib/format/glossary.ts 7, edge-percent.test.ts 4, tone-classes.ts 4.
- advice: components/RecommendationCard.astro 13, services/recommendation.ts 11, components/UsageInsightCard.astro 11, services/usage-insight.ts 10 (+ its test 10).
- history: services/calendar-view.test.ts 10, calendar-view.ts 9, pages/dashboard/history.astro 7, hourly-usage.ts 5, components/history/DayView.astro 5.
- ingest: docs/ingest/README.md 16, lib/ingest/contract.test.ts 11, scripts/push-fixture.mjs 10, docs/ingest/contract-v1.schema.json 9, lib/ingest/contract.ts 9.
- live-flow: components/LiveStateCard.astro 14, services/live-state.test.ts 13, live-state.ts 12, components/live/LiveFlow.tsx 8, FlowNode.tsx 4.
- access: pages/auth/signin.astro 5, middleware.ts 4, pages/api/auth/signin.ts 4, pages/auth/check-email.astro 4, services/magic-link.ts 3.
- bill: services/bill-forecast.ts 10 (+ test 10), components/BillForecastCard.astro 8.
- dashboard: pages/dashboard.astro 17, components/StatusBadge.astro 6, DashboardBody.astro 5.
- ratings: period-rating.test.ts 8, period-rating.ts 6. notes: day-notes.test.ts 4, HistoryNotes.astro 4.

## Trend

Commits per capability per ISO week (W38 / W39 / W40 / W41):

| capability  | W38 | W39 | W40 | W41 | label                                                                           |
| ----------- | --: | --: | --: | --: | ------------------------------------------------------------------------------- |
| platform    |   6 |  17 |  17 |   5 | constant (W38 and W41 spikes are deploy bootstrap and the test-plan phases 3-4) |
| foundations |   1 |  12 |  38 |   2 | rising (W40 = aurora theme, observability layer, time/number guards)            |
| advice      |   0 |  15 |  21 |   1 | rising                                                                          |
| history     |   0 |   3 |  22 |   1 | rising (history-calendar, grid-export-mismatch, period-summaries)               |
| ingest      |   0 |  10 |  20 |   1 | rising                                                                          |
| live-flow   |   0 |   7 |  24 |   1 | rising                                                                          |
| access      |   2 |   9 |   4 |   4 | fading, then renewed in W41 (access-abuse tests #118)                           |
| bill        |   0 |   0 |  24 |   1 | rising (new in W40: bill-forecast, bill-accuracy)                               |
| dashboard   |   1 |   8 |  17 |   1 | rising                                                                          |
| ratings     |   0 |   0 |  13 |   1 | rising (new in W40: period-ratings, lab-period-summaries)                       |
| notes       |   0 |   0 |   6 |   2 | rising (new in W40: day-notes)                                                  |
| docs        |   4 |  83 | 140 |   6 | rising (planning docs per change; not ranked)                                   |

- Inference: W40 is the highest-volume week for every product capability, a feature campaign sequence, one change folder after another (live-state, daily-history, seasonal usage, bill forecast, history calendar, period ratings, day notes, dashboard restyle, then the testing rollout phases 1-4). W41 is one day, so "fading" there means nothing. With 3 weeks and one person, labels "rising" mostly reflect when each capability was built, not sustained pressure. Seasonal: not testable.

## Fix pressure

Heuristic: commit subject matches `^fix(\(|:|!)` or `\b(fix|bug|hotfix|revert)\b` (contract rule). The wider brief regex (regression|broken|incident) added zero extra matches. I removed 2 false positives by reading subjects: 82e80f0 "ci: add Claude Code review and fix workflows" and 573c6e9 "docs(bill-accuracy): fix the inverted lag example". Counts are per commit per capability touched; "cross-cutting" = commit touching more than 3 capabilities.

| capability  | fix commits | of commits | share | review-triage fixes (subject names review/impl-review/F#) | other fixes |
| ----------- | ----------: | ---------: | ----: | --------------------------------------------------------: | ----------: |
| platform    |          13 |         45 |   29% |                                                         5 |           8 |
| foundations |          10 |         53 |   19% |                                                         7 |           3 |
| advice      |          11 |         37 |   30% |                                                         9 |           2 |
| dashboard   |           7 |         27 |   26% |                                                         4 |           3 |
| ratings     |           4 |         14 |   29% |                                                         3 |           1 |
| ingest      |           8 |         31 |   26% |                                                         7 |           1 |
| history     |           7 |         26 |   27% |                                                         5 |           2 |
| live-flow   |           7 |         32 |   22% |                                                         5 |           2 |
| access      |           5 |         19 |   26% |                                                         0 |           5 |
| bill        |           5 |         25 |   20% |                                                         4 |           1 |
| notes       |           2 |          8 |   25% |                                                         2 |           0 |
| docs        |          28 |        233 |   12% |                                                        18 |          10 |

- Reverts: 0 commits by subject (`Revert` / `This reverts commit`), none at all in the 331-commit history. The word "revert" appears only in the body of fb6a476 (quality-gates wiring, a deliberate-break proof). evidence.
- Cross-cutting fix commits (more than 3 capabilities): foundations 5, dashboard 7 (all dashboard fix commits), live-flow 6 (of 7 cross-cutting counts, from review-fix commits that touch many files), platform 6, advice 5, ingest 5, history 4, bill 4, ratings 3, access 2, notes 1. The two largest spillover commits are review-triage fixes, not bugs: 60ceb75 (fix(testing): time and number guards triage; touches 5 code capabilities) and 886088a (dashboard-refresh impl-review).
- Reading the subjects (false-signal rules 5 and 12):
  - Most fix commits (about 60% of code-capability fix attributions) are "implementation review fixes (F1-F7)" closing out a change, produced by the planned review step of the workflow, not defects found in production. Fix share is uniformly 20-30% across all product capabilities, so it does not discriminate between them (inference).
  - platform "other" 8: all CI and deploy iteration (Buildx attestations, setup-node pin, IPv6 bind, CSRF origin behind the proxy, Vitest 4 pin for Stryker, Stryker cache key, disk-limit pull fix). Trial-and-error ratio; demoted as mechanical.
  - access "other" 5 are the only fixes that look like real behavior defects in a user path: double submit of the magic-link form (7a2ed6d), "accept Supabase's default sign-in link and restore password sign-in" (9416081, W39, 8 access file changes, a regression in password sign-in by its own wording), CSRF origin validation behind the production proxy (324ec00), and two login-heading UI fixes (3fe6225). Real but small, and early (W38-W39).
  - Behavior fixes in time/money logic after review: e39f6c8 (bill: reject a central estimate outside its range and a generated_at in the future), 8ef3575 (live-flow: do not rate consumption from a stale daily row), 3bef11e (ratings: rate the change month from post-change days only), 1d7ac4f (history: keep suspect hours off the lowest list). These were caught by review within the same campaign (inference: guards are being added, boundary logic in bill/history/ratings is where the logic bugs were).
  - UI polish: 05f1d67, 55caadc, d93729c, 499c758 (contrast, tap targets, focus indicators): iteration, demoted.

## Co-change between capabilities

Commits used: 265 (3 dropped for touching more than 6 capabilities); unmapped excluded from pairs. Support = shared commits; confidence = shared / commits of the less active side. Code-only view (docs removed, 142 code commits touching at least one code capability) is the meaningful one; docs pairs are listed after.

Code-only pairs:

| pair                    | support | confidence |
| ----------------------- | ------: | ---------: |
| advice - foundations    |      18 |       0.49 |
| foundations - live-flow |      15 |       0.47 |
| advice - live-flow      |      13 |       0.41 |
| advice - dashboard      |      12 |       0.44 |
| dashboard - foundations |      12 |       0.44 |
| dashboard - live-flow   |      11 |       0.41 |
| dashboard - platform    |      10 |       0.37 |
| access - platform       |       9 |       0.47 |
| foundations - history   |       9 |       0.35 |
| ingest - platform       |       9 |       0.29 |
| advice - bill           |       9 |       0.36 |
| bill - foundations      |       9 |       0.36 |
| bill - ingest           |       7 |       0.28 |
| advice - history        |       7 |       0.27 |

- history - notes: 5 shared of 8 notes commits (confidence 0.62); the notes UI lives under components/history, so this is a structural corridor.
- Docs pairs (prose; shows planning docs travel with code, not a risk): docs-foundations 44 (0.83), docs-platform 32, docs-advice 28, docs-live-flow 27 (0.84), docs-ingest 26 (0.84), docs-dashboard 26 (0.96, the dashboard is almost never changed without docs), docs-history 19, docs-bill 19.
- Reading (inference): the product cards (advice, live-flow, bill, history) each co-change with foundations (format helpers, tokens, glossary) and with dashboard (the page that composes them) at about 0.35-0.5 confidence, so a new card typically touches shared format code and dashboard.astro. Ingest co-changes with bill (0.28) and live-flow (0.13) at lower strength: contract changes fan out less than expected.
- Contract/schema: docs/ingest/contract-v1.schema.json changed in 9 commits, all 9 together with src/lib/ingest/contract.ts. MECHANICAL (generated schema; `npm test` fails on drift): not a hidden contract.

## Hub files and freshness

Hubs by number of distinct partner capabilities (partners seen in at least 2 commits), code files only:

- scripts/smoke.mjs (platform): 10 partners, in 19 commits. It is the shared end-to-end smoke test of auth, ingest and dashboard markers, so every feature that adds a card or page extends it. Workflow lockstep, guarded by CI (the `smoke` job is required); rule 3, mechanical.
- src/pages/dashboard.astro (dashboard): 8 partners, 17 commits. It composes every card, so each new card edits it; true composition point, not mechanical (shared cause: the dashboard is being built up). Rule 4 applies when read with advice/live-flow/bill growth.
- docs/ingest/README.md (ingest): 7 partners, 16 commits. Handoff doc for the lab; prose, rule 8 and 10 (consumer is in homelab-2, outside this repo).
- src/lib/services/calendar-view.ts + calendar-view.test.ts (history): 6 partners each, 9-10 commits; builds the history calendar from services of notes, ratings and advice (inference).
- src/components/LiveStateCard.astro (live-flow, 14 commits, 5 partners), src/components/RecommendationCard.astro (advice, 13, 5), src/lib/services/live-state.ts and recommendation.ts (5 partners), UsageInsightCard.astro (5), scripts/push-fixture.mjs (ingest, 5).
- Top prose hubs: docs/decisions.md (11 partners), docs/logic.md (10), context/foundation/roadmap.md (10), docs/prerequisites.md (9), docs/architecture.md (7). Prose, not ranked.
- Foundations hubs by changes, not by partners: src/styles/global.css (14 commits, tokens and theme), src/types.ts (7), format/warsaw-time.ts (7), format/glossary.ts (7).

Freshness (`git cat-file -e HEAD:<path>`): all 20 named hub and top files exist at HEAD. Missing at HEAD (the whole unmapped bucket): src/components/Topbar.astro, Welcome.astro, ForecastCard.astro, src/pages/index.astro, src/lib/auth-validation.ts: bootstrap template files that were deleted; history that no longer exists (rule 11), not risk.

## Mechanical signals

- Mass commit 13e1df5 (56 renames, archive close) excluded. 6f74b8b (38 files, markdown formatting of context/) is 37 docs changes plus 1 platform; mechanical, formatting only.
- Big but real: dcbb712 (65 files, bootstrap production deploy prepared by "Mother Console" in W38; platform 24, access 14, docs 13) inflates platform and access W38 numbers; 40f7be2 (48 files, observability layer, 12 capabilities) is a single cross-cutting commit that touches 12 of the capabilities, so it inflates every capability's commit count by 1 and foundations/access by 7-10 changes. It is one of the 3 commits dropped from co-change (more than 6 capabilities touched).
- "Review fixes" counted as fix commits: the fix share is mostly a workflow artifact (rule 5/12), uniform at 20-30%.
- smoke.mjs and ci.yml hub status: rule 3 and 4 (common cause: every feature adds a check).
- contract-v1.schema.json: generated file, rule 7.
- Docs capability: 52.4% of changes, never a risk.
- Single human, 3 agent commits, 7 automation-like: concentration is a baseline (rule 6).

## Unknowns

- unknown: whether any fix commit corresponds to a production incident. Subjects reference review findings, not issues; the discussion agent should check GitHub issues/PRs labeled bug.
- unknown: sustained trend. Only 2 full weeks of volume (W39, W40) after a 6-day bootstrap; "rising" cannot be told from "built in that week". Revisit after a month.
- unknown (external): the lab side in homelab-2 consumes the ingest contract; contract changes there are invisible here. ingest-vs-lab drift cannot be seen in this history.
- unknown: pairs that should change together but do not show here: ingest contract (src/lib/ingest/contract.ts) vs the SQL `ingest_push` function in supabase/migrations (hand-kept twin; only 8 migration touches in ingest, 9 contract-change commits; I did not read their overlap); services' server limits vs DB limits for notes (the notes-parity test exists but co-change was not measured); format helpers (warsaw-time) vs SQL day boundaries; docs/prerequisites.md vs external setup.
- unknown: what "Mother Console" is (homelab host identity, 7 W38 commits) and the 3 Cursor Agent commits' review level.
- unknown: dashboard shell has only 4% test-file changes; coverage of dashboard.astro rests on smoke.mjs (reading tests is out of scope for history).

## Commands run

- python3 context/map/.work/history.py (parses .work/git-log.txt: attribution, counts, weekly buckets, fix share, co-change, hubs); output in .work/history-out.txt
- python3 context/map/.work/history2.py (fix subjects, code-only co-change, freshness via `git cat-file -e HEAD:<path>`, smoke/mother/agent/big-commit lists); output in .work/history2-out.txt
- inline python (true-fix split: review-triage vs other); output in .work/history3-out.txt
- git log --format='%h %s' -i --grep=revert; git rev-parse --short HEAD; git log --oneline | wc -l
