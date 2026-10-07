# Evidence: history

Window (contract): 12 months ago..HEAD, effective 2026-09-14..2026-10-07 (whole history, 343 commits total at HEAD e630d36, 281 non-merge, 62 merges). Commits counted: 280 (281 non-merge, minus mass commit 13e1df5). Buckets: ISO week of author date; only 4 weeks of data, so every trend is weak. W38 = 09-14..09-19 (7 commits, repository bootstrap), W39 = 09-23..09-27 (91), W40 = 09-28..10-02 (163), W41 = 10-05..10-07, three days (19). Humans in window: 1, so concentration is a baseline. Counting rules: contract (changes per file, commits once per capability touched, cross-cutting counted for each). Excluded from counts: package-lock.json and image files, so 1748 file changes counted. Attribution: capabilities.tsv (globs first, then longest prefix), now with the 13th id `alerts`; renames folded via the new path. The squash-merge numbers #132 and #133 do not appear in the log (no commit carries them).

## Activity per capability

| capability               | changes | share | commits |
| ------------------------ | ------: | ----: | ------: |
| docs (prose, not ranked) |     903 | 51.7% |     245 |
| platform                 |     129 |  7.4% |      51 |
| ingest                   |      94 |  5.4% |      32 |
| foundations              |      88 |  5.0% |      54 |
| history                  |      86 |  4.9% |      27 |
| advice                   |      86 |  4.9% |      37 |
| live-flow                |      75 |  4.3% |      32 |
| access                   |      74 |  4.2% |      21 |
| bill                     |      55 |  3.1% |      26 |
| dashboard                |      53 |  3.0% |      28 |
| alerts                   |      48 |  2.7% |       5 |
| ratings                  |      26 |  1.5% |      14 |
| notes                    |      19 |  1.1% |       8 |
| unmapped                 |      12 |  0.7% |       5 |

- Excluding docs, 845 code/config changes: platform 15.1%, ingest 10.5%, foundations 10.4%, history 10.2%, advice 10.2%, live-flow 8.9%, access 8.8%, bill 6.5%, dashboard 6.3%, alerts 5.7%, ratings 3.1%, notes 2.2%, unmapped 2.1%. Distribution is still flat: no capability dominates (evidence). Of 280 commits, 148 touch code or config, 132 are docs-only.
- alerts: 48 changes in only 5 commits, all on one day (2026-10-06, PRs #137-#144): feature #137 (18 alerts changes of 45 files), VPS trigger #138, first Playwright e2e test #139, database-guard hardening #143, implementation-review fixes #144. 6.2 changes per commit against a 3.1 average for the other code capabilities (inference: the capability arrived as one large drop plus follow-ups, so its share says nothing about sustained activity). The attribution includes `playwright.config.ts` and `tests/e2e`, so the e2e layer counts as alerts, not platform.
- Unmapped: 18 changes (1.0% of all, 2.1% of code). 12 are files deleted before HEAD (Topbar.astro, Welcome.astro, ForecastCard.astro, pages/index.astro, auth-validation.ts). NEW since the last pass: 6 changes are live files the glob list does not cover: `supabase/migrations/20261006120000_ingest_push_sections.sql`, `20261006130000_ingest_token_ok.sql`, `tests/integration/ingest-boundary.test.ts`, `ingest-golden.test.ts`, `ingest-retention.test.ts` (all five from the push-boundary refactor 11fc526, ingest by content) and `tests/integration/db-url-guard.test.ts` (60e0342, platform/e2e by content). If attributed, ingest would be 94 changes (5.4%), 6 commits unchanged. Mapping gap in capabilities.tsv (patterns `*push_ingestion*` and `tests/integration/push-to-page*` miss the new names); for the map, count these as ingest.
- Agent-authored (Cursor Agent): 3 commits, unchanged (docs 2 changes, advice, bill, live-flow, dashboard, foundations one commit each; the largest is the aurora theme 2a0ba8f). Ambiguous identity "Mother Console": 7 commits, all in W38 (bootstrap and production deploy prep: platform 6 commits, access 2, docs 4, dashboard 1, foundations 1). Both counted as activity, kept out of people evidence. Everything from W41 (alerts, refactor) is the single human account.
- Test share of file changes (test files and tests/): alerts 44% (21 of 48), history 36%, ratings 38%, live-flow 29%, advice 28%, ingest 26%, notes 26%, bill 24%, access 22%, foundations 22%, platform 8%, dashboard 4%. Alerts is the most test-heavy new capability (unit, integration, e2e in the same week); dashboard shell still has almost no test touches (evidence; dashboard.astro is covered by smoke.mjs, see below).
- Migrations: 26 migration file touches (ingest 8, access 6, ratings 3, alerts 2, bill 2, live-flow 2, notes 1, unmapped 2 = the two push-boundary migrations, so ingest 10 by content), includes 9 in-place timestamp renames noted by the contract. Note the alert migrations are named `20261007...` while committed on 2026-10-06 (future-dated names, harmless).

## Top files in top capabilities

(commits touching the file, window-wide)

- platform: scripts/smoke.mjs 21, .github/workflows/ci.yml 9, package.json 8, .gitignore 6, .env.example 6, tests/integration/support/privileged.ts 4.
- ingest: docs/ingest/README.md 17, lib/ingest/contract.test.ts 11, lib/ingest/contract.ts 10, scripts/push-fixture.mjs 10, docs/ingest/contract-v1.schema.json 9, docs/ingest/example-v1.json 5.
- foundations: src/styles/global.css 14, src/types.ts 8, src/lib/format/warsaw-time.ts 7, src/lib/format/glossary.ts 7, edge-percent.test.ts 4, tone-classes.ts 4.
- history: services/calendar-view.test.ts 10, calendar-view.ts 9, pages/dashboard/history.astro 7, hourly-usage.ts 6, hourly-usage.test.ts 5, components/history/DayView.astro 5.
- advice: components/RecommendationCard.astro 13, services/recommendation.ts 11, components/UsageInsightCard.astro 11, services/usage-insight.ts 10 (+ its test 10), recommendation.test.ts 9.
- live-flow: components/LiveStateCard.astro 14, services/live-state.test.ts 13, live-state.ts 12, components/live/LiveFlow.tsx 8, FlowNode.tsx 4.
- access: middleware.ts 5, pages/auth/signin.astro 5, pages/api/auth/signin.ts 4, pages/auth/check-email.astro 4, route-guards.test.ts 3, middleware.test.ts 3.
- bill: services/bill-forecast.ts 11 (+ test 11), components/BillForecastCard.astro 8.
- dashboard: pages/dashboard.astro 17, components/StatusBadge.astro 6, DashboardBody.astro 5, DashboardHeader.astro 4.
- alerts: every alerts file was touched in at most 2 commits (feature plus the review-fix round or the e2e round): services/alert-rules.ts, alert-evaluation.ts, alerts-evaluate.ts, telegram.ts (each with its test), pages/api/alerts/evaluate.ts, components/alerts/AlertRulesPanel.astro, scripts/alerts-trigger.mjs, scripts/create-alert-token.mjs, tests/integration/alert-rules.test.ts, playwright.config.ts, tests/e2e/alert-rules.spec.ts, all at 2. No "top file" is meaningful yet.
- ratings: period-rating.test.ts 8, period-rating.ts 6. notes: day-notes.test.ts 4, HistoryNotes.astro 4.

## Trend

Commits per capability per ISO week (W38 / W39 / W40 / W41):

| capability  | W38 | W39 | W40 | W41 | label                                                                                                        |
| ----------- | --: | --: | --: | --: | ------------------------------------------------------------------------------------------------------------ |
| platform    |   6 |  17 |  17 |  11 | constant per week; W41 is 3 days, so the highest daily rate (e2e config, CI, smoke, privileged test support) |
| foundations |   1 |  12 |  38 |   3 | rising to W40, then back (W40 = aurora theme, observability layer, time/number guards)                       |
| advice      |   0 |  15 |  21 |   1 | rising, then quiet                                                                                           |
| history     |   0 |   3 |  22 |   2 | rising (history-calendar, grid-export-mismatch, period-summaries)                                            |
| ingest      |   0 |  10 |  20 |   2 | rising, then the push-boundary refactor (#131) and observability in W41                                      |
| live-flow   |   0 |   7 |  24 |   1 | rising, then quiet                                                                                           |
| access      |   2 |   9 |   4 |   6 | fading, then renewed in W41 (access-abuse tests #118, observability, middleware touched by alerts #137)      |
| bill        |   0 |   0 |  24 |   2 | new in W40 (bill-forecast, bill-accuracy)                                                                    |
| dashboard   |   1 |   8 |  17 |   2 | rising, then quiet                                                                                           |
| alerts      |   0 |   0 |   0 |   5 | new in W41, all on 10-06                                                                                     |
| ratings     |   0 |   0 |  13 |   1 | new in W40 (period-ratings, lab-period-summaries)                                                            |
| notes       |   0 |   0 |   6 |   2 | new in W40 (day-notes)                                                                                       |
| docs        |   4 |  83 | 140 |  18 | rising (planning docs per change; not ranked)                                                                |

- Code-touching commits per week: W38 6, W39 39, W40 92, W41 11; docs-only: 1, 52, 71, 8.
- Inference: W40 is the highest-volume week for every product capability, a feature campaign sequence, one change folder after another. W41 (three days) is a different mix: a test and quality phase (access-abuse tests, observability, quality-gates wiring), the push-boundary refactor, and one feature (alerts) with its e2e layer. Product-card capabilities (advice, live-flow, bill, dashboard, ratings) go nearly silent in W41 (1-2 commits each). With 4 weeks and one person, labels "rising" mostly reflect when each capability was built, not sustained pressure. Seasonal: not testable.
- Push-boundary refactor (#131-#135): one code commit (11fc526, "phases 1-2 of 5", 22 files, 1683 insertions: `ingest.ts`, `contract.ts`, `retention.ts`, two new migrations, three new integration tests, `access-abuse.test.ts`, `hourly-usage.ts`), plus close-out and archive commits #134 and #135 that are docs only. So in this history the refactor shows as 1 ingest commit (+6 ingest changes, +5 unmapped changes) and 3 docs commits; phases 3-5 are not visible as separate commits (unknown: whether they were planned, deferred or folded in).

## Fix pressure

Heuristic: commit subject matches `^fix(\(|:|!)` or `\b(fix|bug|hotfix|revert)\b` (contract rule). 42 commits match; I removed the same 2 false positives as before by reading subjects: 82e80f0 "ci: add Claude Code review and fix workflows" and 573c6e9 "docs(bill-accuracy): fix the inverted lag example". That leaves 40 fix commits of 280 (14.3%); 39 of them touch code or config, i.e. 39 of 148 code-touching commits (26.4%). Weekly fix commits: W38 4 of 7, W39 11 of 91 (12%), W40 23 of 163 (14%), W41 2 of 19 (11%). Counts below are per commit per capability touched; "cross-cutting" = commit touching more than 3 capability ids (unmapped counts as one id).

| capability  | fix commits | of commits | share | review-triage fixes (subject names review/impl-review/F#) | other fixes |
| ----------- | ----------: | ---------: | ----: | --------------------------------------------------------: | ----------: |
| platform    |          15 |         51 |   29% |                                                         7 |           8 |
| foundations |          10 |         54 |   19% |                                                         7 |           3 |
| advice      |          11 |         37 |   30% |                                                         9 |           2 |
| dashboard   |           7 |         28 |   25% |                                                         4 |           3 |
| ratings     |           4 |         14 |   29% |                                                         3 |           1 |
| ingest      |           8 |         32 |   25% |                                                         7 |           1 |
| history     |           7 |         27 |   26% |                                                         5 |           2 |
| live-flow   |           7 |         32 |   22% |                                                         5 |           2 |
| access      |           5 |         21 |   24% |                                                         0 |           5 |
| bill        |           5 |         26 |   19% |                                                         4 |           1 |
| alerts      |           2 |          5 |   40% |                                                         2 |           0 |
| notes       |           2 |          8 |   25% |                                                         2 |           0 |
| docs        |          30 |        245 |   12% |                                                        20 |          10 |

- Fix vs planned review rounds: 22 of the 40 fix commits (55%) name a review (review, impl-review, F-numbers, triage, findings); they are the planned implementation-review step of the workflow closing a change, not defects found in use. 18 are other fixes. The other-fix set is: CI/deploy iteration (ce6bb5b, ba588f9, 1089ec5, c8e28a9, b44dcb9, f3c46ec, 324ec00), UI polish (3fe6225, 05f1d67, 55caadc, d93729c, 499c758), access behavior (9416081, 7a2ed6d) and four logic fixes after review (3bef11e, 1d7ac4f, 8ef3575, e39f6c8).
- Reverts: 0 commits by subject (`Revert` / `This reverts commit`), none in the full 343-commit history (`git log --grep=^Revert` empty). The word "revert" appears only in the body of fb6a476 (quality-gates wiring, a deliberate-break proof). evidence.
- Cross-cutting fix commits (more than 3 ids): dashboard 7 (all its fix commits), platform 7, live-flow 6, foundations 5, advice 5, ingest 5, history 4, bill 4, ratings 3, access 2, alerts 1, notes 1, docs 14. The two largest spillovers are still review-triage fixes, not bugs: 60ceb75 (time and number guards triage; 5 code capabilities) and 886088a (dashboard-refresh impl-review).
- alerts: both of its fix commits are planned review rounds on the same day as the feature. 468d788 (#144, 25 files; alerts 16 changes) applies the implementation review F1-F8 (`context/changes/alert-rules/follow-ups/review-fixes.md`): at-least-once recording per rule, snapshot returns only timestamps, a 20-rule cap per owner, Telegram 429 stops the run, per-rule try/catch, heartbeat URL, stale text corrected, plus a second migration. These are real behavior and robustness changes (delivery semantics, limits), found by review before any production use as far as this history shows (inference). 60e0342 (#143) hardens the e2e and integration database guards (host/hostaddr/port parameters in a URL; teardown deletes only e2e-shaped emails): a safety fix to the new test layer. 2 of 5 alerts commits (40%) is the highest share, but it is 2 commits; the other three product features show 19-30% on larger counts. Baseline, not a finding.
- Reading the subjects (false-signal rules 5 and 12):
  - Fix share is 19-30% across all product capabilities with no big outlier, so it does not discriminate between them (inference).
  - platform "other" 8: all CI and deploy iteration (Buildx attestations, setup-node pin, IPv6 bind, CSRF origin behind the proxy, Vitest 4 pin for Stryker, Stryker cache key, disk-limit pull fix). Trial-and-error ratio; demoted as mechanical.
  - access "other" 5 are the only fixes that look like real behavior defects in a user path: double submit of the magic-link form (7a2ed6d), "accept Supabase's default sign-in link and restore password sign-in" (9416081, W39, a regression in password sign-in by its own wording), CSRF origin validation behind the production proxy (324ec00), two login-heading UI fixes (3fe6225). Real but small, and early (W38-W39); none in W40-W41.
  - Behavior fixes in time/money logic after review: e39f6c8 (bill: reject a central estimate outside its range and a generated_at in the future), 8ef3575 (live-flow: do not rate consumption from a stale daily row), 3bef11e (ratings: rate the change month from post-change days only), 1d7ac4f (history: keep suspect hours off the lowest list). Caught by review within the same campaign (inference: boundary logic in bill/history/ratings is where the logic bugs were).
  - UI polish: 05f1d67, 55caadc, d93729c, 499c758: iteration, demoted.

## Co-change between capabilities

Commits used: 276 (4 dropped for touching more than 6 capability ids: 2a9e7d7 alerts feature with 7, 40f7be2 observability with 12, 1efe18c time and number guards with 8, 482c54c whole-history grid caveat with 8); unmapped excluded from pairs. Support = shared commits; confidence = shared / commits of the less active side. The code-only view (docs removed, 277 commits entering, 148 touching a code capability) is the meaningful one; docs pairs are listed after. Note the alerts feature commit 2a9e7d7 (the only one that couples alerts with access, bill, dashboard, foundations) is dropped by the contract rule, so those couplings are invisible in the pair table and listed below by hand.

Code-only pairs:

| pair                    | support | confidence |
| ----------------------- | ------: | ---------: |
| advice - foundations    |      18 |       0.49 |
| foundations - live-flow |      15 |       0.47 |
| dashboard - foundations |      13 |       0.46 |
| advice - live-flow      |      13 |       0.41 |
| advice - dashboard      |      12 |       0.43 |
| access - platform       |      11 |       0.52 |
| dashboard - platform    |      11 |       0.39 |
| dashboard - live-flow   |      11 |       0.39 |
| bill - foundations      |      10 |       0.38 |
| ingest - platform       |      10 |       0.31 |
| foundations - history   |       9 |       0.33 |
| advice - bill           |       9 |       0.35 |
| foundations - platform  |       8 |       0.16 |
| bill - dashboard        |       7 |       0.27 |
| advice - history        |       7 |       0.26 |
| bill - ingest           |       7 |       0.27 |

- alerts - platform: 5 of 5 alerts commits (confidence 1.00, but on a base of 5): CI workflow, smoke.mjs, package.json, Playwright config, privileged test support. Mechanical in part (every capability that adds a check extends smoke.mjs and CI). alerts with access, bill, dashboard, foundations: 1 shared commit each, all in 2a9e7d7 (dropped from the table): it edited `middleware.ts` and `route-guards` (token-authenticated route exemption), `AppShell`/`DashboardHeader` (nav link), `bill-forecast.ts` (small additions) and `src/types.ts`. So the new capability touches the shared edges once and then stays inside its own files (evidence: 2 of 5 commits are alerts + docs only, #138 and #143/#144 stay in alerts/platform/docs).
- history - notes: 5 shared of 8 notes commits (confidence 0.62); the notes UI lives under components/history, so this is a structural corridor.
- Docs pairs (prose; shows planning docs travel with code, not a risk): docs-foundations 44 (0.81), docs-platform 37 (0.73), docs-advice 28, docs-live-flow 27 (0.84), docs-ingest 27 (0.84), docs-dashboard 26 (0.93), docs-history 20, docs-bill 19, docs-access 15, docs-ratings 9, docs-notes 6, docs-alerts 4 of 5 (0.80).
- Reading (inference): the product cards (advice, live-flow, bill, history) each co-change with foundations (format helpers, tokens, glossary) and with dashboard (the page that composes them) at about 0.35-0.5 confidence, so a new card typically touches shared format code and dashboard.astro. access - platform is now the strongest code pair (0.52), driven by smoke.mjs, CI and the abuse tests, not by shared source. Ingest co-changes with bill (0.27) and live-flow (0.12) at lower strength: contract changes fan out less than expected. The push-boundary refactor adds no new capability pair (it touches ingest, history via `hourly-usage.ts`, access via `access-abuse.test.ts`, platform; one commit).
- Contract/schema: docs/ingest/contract-v1.schema.json changed in 9 commits, all 9 together with src/lib/ingest/contract.ts. MECHANICAL (generated schema; `npm test` fails on drift): not a hidden contract. Contract vs SQL twin (new measurement): contract.ts changed in 10 commits, 5 of them together with an ingest-related migration (11fc526, 0056976, dc37ab5, 3590152, d66f079); of 9 commits touching ingest-related migrations, 5 also changed contract.ts. In the push-boundary refactor the contract, the service and the SQL function moved in one commit, which is the lockstep the hand-kept twin needs (evidence for that commit; 4 other contract commits with no migration may be TypeScript-only, not checked).

## Hub files and freshness

Hubs by number of distinct partner capabilities (partners seen in at least 2 commits), code files only:

- scripts/smoke.mjs (platform): 11 partners (access, advice, alerts, bill, dashboard, foundations, history, ingest, live-flow, notes, ratings), in 21 commits. It is the shared end-to-end smoke test of auth, ingest, dashboard and now alert markers, so every feature that adds a card or page extends it. Workflow lockstep, guarded by CI (the `smoke` job is required); rule 3, mechanical. alerts is its newest partner.
- src/pages/dashboard.astro (dashboard): 8 code partners, 17 commits. It composes every card, so each new card edits it; true composition point, not mechanical (shared cause: the dashboard is being built up). Rule 4 applies when read with advice/live-flow/bill growth.
- docs/ingest/README.md (ingest): 7 partners, 17 commits. Handoff doc for the lab; prose, rule 8 and 10 (consumer is in homelab-2, outside this repo); the push-boundary refactor edited it again.
- src/lib/services/calendar-view.ts + calendar-view.test.ts (history): 6 partners each, 9-10 commits; builds the history calendar from services of notes, ratings and advice (inference).
- src/components/LiveStateCard.astro (live-flow, 14 commits, 5 partners), src/components/RecommendationCard.astro (advice, 13, 5), src/lib/services/live-state.ts and recommendation.ts (5 partners), UsageInsightCard.astro (5), and NEW in the top list: src/types.ts (foundations, 8 commits, 5 partners: access, advice, bill, history, platform; alerts added types in 2a9e7d7, so 6 with it counted once).
- Top prose hubs: docs/decisions.md (12 partners), docs/logic.md (11), context/foundation/roadmap.md (10), docs/prerequisites.md (10), docs/architecture.md (8). Prose, not ranked; decisions.md and logic.md are written for almost every change including alerts and the refactor.
- Foundations hubs by changes, not by partners: src/styles/global.css (14 commits, tokens and theme), src/types.ts (8), format/warsaw-time.ts (7), format/glossary.ts (7).
- Most-touched code files overall: smoke.mjs 21, docs/ingest/README.md 17, dashboard.astro 17, LiveStateCard.astro 14, global.css 14, live-state.test.ts 13, RecommendationCard.astro 13. None of the alerts files is in the top 12.

Freshness (`git cat-file -e HEAD:<path>`): all 20 named hub and top files exist at HEAD, plus the new alerts files checked (alert-rules.ts, api/alerts/evaluate.ts, playwright.config.ts, tests/e2e, the ingest_push_sections migration). Missing at HEAD (the 12 deleted-file changes in the unmapped bucket): src/components/Topbar.astro, Welcome.astro, ForecastCard.astro, src/pages/index.astro, src/lib/auth-validation.ts: bootstrap template files that were deleted; history that no longer exists (rule 11), not risk.

## Mechanical signals

- Mass commit 13e1df5 (56 renames, archive close) excluded; it is the only exclusion (`.work/excluded-commits.txt`). 6f74b8b (38 files, markdown formatting of context/) is 37 docs changes plus 1 platform; mechanical, formatting only.
- Big but real: dcbb712 (65 files, bootstrap production deploy prepared by "Mother Console" in W38; platform 24, access 14, docs 13) inflates platform and access W38 numbers; 40f7be2 (48 files, observability layer, 12 capability ids) inflates every capability's commit count by 1 and foundations/access by 7-10 changes; 2a9e7d7 (45 files, alerts feature, 7 ids) supplies 18 of alerts' 48 changes and 6 of platform's W41 changes; 1efe18c (25 files, time/number guards, 8 ids). 2a9e7d7, 40f7be2, 1efe18c and 482c54c are the 4 commits dropped from co-change.
- "Review fixes" counted as fix commits: the fix share is mostly a workflow artifact (rule 5/12), 55% of fix commits are named review rounds; alerts shows the same pattern in miniature (feature, then a review-fix commit within hours, 468d788 landed 3.5 hours after the e2e commit).
- Attribution gap: found and fixed after this file was drafted. `capabilities.tsv` now maps the push-boundary refactor files to ingest and the db-url guard to platform, so the Activity table above shows the corrected counts (ingest 94, platform 129, unmapped 12). Percentages in the lines below that name ingest, platform or unmapped were computed before the fix and are off by under one point.
- smoke.mjs and ci.yml hub status: rule 3 and 4 (common cause: every feature adds a check).
- contract-v1.schema.json: generated file, rule 7.
- Docs capability: 51.7% of changes, never a risk.
- Single human, 3 agent commits, 7 automation-like (all W38): concentration is a baseline (rule 6). All 62 merges are excluded; commits carry GitHub squash numbers up to #146, and a `Co-Authored-By: Claude` trailer is on nearly every recent commit (the contract's count of 246 of 269 earlier; not re-counted).

## Unknowns

- unknown: whether any fix commit corresponds to a production incident. Subjects reference review findings, not issues; the discussion agent should check GitHub issues/PRs labeled bug. For alerts, the delivery semantics fixed in #144 (at-least-once, 429 handling) were found in review, not in production, as far as subjects and the follow-up file say.
- unknown: sustained trend. Only 2 full weeks of volume (W39, W40), a 6-day bootstrap and a 3-day W41; "rising" cannot be told from "built in that week". The alerts capability is 5 commits in one day: its true change rate is not measurable yet. Revisit after a month.
- unknown (external): the lab side in homelab-2 consumes the ingest contract, and the VPS service that triggers `/api/alerts/evaluate` (and its heartbeat monitor in Uptime Kuma) lives outside this repo; changes there are invisible here. ingest-vs-lab and trigger-vs-evaluator drift cannot be seen in this history.
- unknown: what happened to phases 3-5 of the push-boundary refactor (#131 says "phases 1-2 of 5"; #134 "epilogue" and #135 archive are docs-only; #132/#133 are not in the log). Whether they were done, dropped or deferred needs the change folder (`context/archive/*refactor-push-boundary`), not read here.
- unknown: pairs that should change together but do not show here: contract.ts vs the SQL `ingest_push` function (5 of 10 contract commits include a migration; the other 5 not inspected, so a drift between the TypeScript twin and the SQL cannot be ruled out from history); services' server limits vs DB limits for notes (the notes-parity test exists but co-change was not measured); the alerts 20-rule cap in SQL vs the service; format helpers (warsaw-time) vs SQL day boundaries; docs/prerequisites.md vs external setup.
- unknown: what "Mother Console" is (homelab host identity, 7 W38 commits) and the 3 Cursor Agent commits' review level.
- unknown: dashboard shell has only 4% test-file changes; coverage of dashboard.astro rests on smoke.mjs (reading tests is out of scope for history).

## Commands run

- python3 context/map/.work/history.py (parses .work/git-log.txt: attribution, counts, weekly buckets, fix share, co-change, hubs); its final pickle line fails because the old scratchpad path is gone (all printed output was complete before that). Re-run from a copy without that line.
- python3 history2.py equivalent: copy of history.py without the pickle dump, exec'd inline, plus the unmodified history2.py logic (fix subjects, code-only co-change, freshness via `git cat-file -e HEAD:<path>`, smoke/mother/agent/big-commit lists, migrations, test share); output saved in the session scratchpad (h2.out), not in .work.
- inline python (true-fix split review-triage vs other with the 2 false positives removed; fix share per week; code-only co-change and alerts pairs; unmapped files; dropped commits; W41 commit list; alerts file list; code-change shares).
- git log --oneline | wc -l; git log --no-merges --oneline | wc -l; git log --merges --oneline | wc -l; git rev-parse --short HEAD
- git log --format='%h %s' -i --grep=revert; git log -i --grep='#13[0-9]'
- git show --stat 11fc526; git show --stat 2a9e7d7; git show -s --format=%b 60e0342; head of context/changes/alert-rules/follow-ups/review-fixes.md
- per-file loop: git log -- src/lib/ingest/contract.ts and the ingest migrations, counting shared commits
