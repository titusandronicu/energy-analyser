# Evidence: discussion

Sources: gh (titusandronicu/energy-analyser, read-only) plus git (`.work/git-log.txt`, HEAD e334854). Window: effective 2026-09-14..2026-10-05 (3 weeks, whole history). Limits hit: the first `gh pr list` with reviews/comments JSON timed out (HTTP 504), so reviews and comments were fetched per PR via `gh api`; PRs listed in two pages (108 PRs, numbers 7-130; the numbers between are issues). Baseline: one human (the owner); the `titusandronicu` identity also posts agent-written replies, so "human review" is effectively zero.

PR attribution: 42 of 108 PRs carry `(#N)` in a squash subject and map via git to files and capabilities. The other 59 merged PRs (#7-#81) were merge-committed, so their number is not in a subject; these were attributed by PR title and scope (inference, one capability per PR, docs-only PRs to `docs`). The 7 closed-unmerged PRs have no commit and are unattributed (mechanical, see below). Cross-cutting means more than 3 capabilities touched.

## Buzz per capability

PRs = merged PRs touching the capability (git-mapped + title-mapped; a PR can count for several). Bot inline = inline review comments by bots (Codex, Sourcery) on those PRs. P1/P2 = Codex-tagged inline findings, bug_risk = Sourcery tagged. Fix commits = commits matching the contract's fix rule (includes planned "impl review fixes"), cross = of those, commits touching more than 3 capabilities. Open bugs = bug-labelled open issues. Plans = archived or in-flight change folders (see Planning).

| capability               | commits (contract) | fix commits (cross) | PRs | bot inline | Codex P1/P2, Sourcery bug_risk | human review | reverts | open bugs | KNOWN GAP tests | debt markers |
| ------------------------ | ------------------ | ------------------- | --- | ---------- | ------------------------------ | ------------ | ------- | --------- | --------------- | ------------ |
| ingest                   | 31                 | 8                   | 11  | 9          | 1 / 5 / 2                      | 0            | 0       | 0         | 0               | 0            |
| access                   | 19                 | 5                   | 9   | 6          | 0 / 5 / 0                      | 0            | 0       | 0         | 3               | 0            |
| live-flow                | 32                 | 7                   | 10  | 9          | 0 / 6 / 0                      | 0            | 0       | 0         | 1               | 0            |
| bill                     | 25                 | 5                   | 9   | 7          | 0 / 7 / 0                      | 0            | 0       | 0         | 2               | 0            |
| advice                   | 37                 | 11                  | 18  | 13         | 0 / 12 / 0                     | 0            | 0       | 0         | 0               | 0            |
| history                  | 26                 | 7                   | 20  | 12         | 0 / 9 / 0                      | 0            | 0       | 0         | 11              | 0            |
| ratings                  | 14                 | 4                   | 12  | 9          | 1 / 6 / 0                      | 0            | 0       | 0         | 2               | 0            |
| notes                    | 8                  | 2                   | 5   | 4          | 0 / 4 / 0                      | 0            | 0       | 0         | 5               | 0            |
| dashboard                | 27                 | 7                   | 6   | 1          | 0 / 1 / 0                      | 0            | 0       | 0         | 0               | 0            |
| platform                 | 45                 | 15                  | 17  | 17         | 0 / 12 / 4                     | 0            | 0       | 0         | 0               | 0            |
| foundations              | 53                 | 10                  | 13  | 7          | 0 / 6 / 0                      | 0            | 0       | 0         | 0               | 0            |
| docs (prose, not ranked) | 233                | 29                  | 29  | 36         | 4 / 29 / 0                     | 0            | 0       | n/a       | n/a             | 0            |
| unmapped                 | 5                  | 0                   | 0   | 0          | 0                              | 0            | 0       | 0         | 0               | 0            |

Counts of fix commits and PRs include cross-cutting commits (cross counts per capability: ingest 13, access 9, live-flow 21, bill 16, advice 25, history 16, ratings 9, notes 7, dashboard 25, platform 20, foundations 28, docs 48 of its totals; so foundations and advice are mostly touched by wide commits, not by dedicated work). The 1 mass commit 13e1df5 is excluded.

evidence: 269 non-merge commits, 108 PRs (101 merged, 7 closed unmerged, 0 open), 22 issues (16 open, 6 closed). Median time to merge 0.13 h (about 8 minutes), max 21.7 h (computed from createdAt/mergedAt of 101 merged PRs). Zero reverts, zero `Revert` or `This reverts` commits, zero merge-style subjects among the 269.
evidence: review activity by account across the 108 PRs: Sourcery bot 98 reviews, 105 issue comments, 16 inline; Codex connector bot 52 reviews, 71 inline, 4 issue comments; github-actions 3 comments; owner account `titusandronicu` 2 reviews, 2 inline, 9 issue comments. All 13 owner-account items are on PR #57 (4), PR #58 (2) and the seven BREAK PRs (7, one comment each). The #57 and #58 items are replies of the form "Fixed in <sha> ... Addressed by Claude Code" to bot findings, i.e. agent-written replies under the owner's account, not independent human review. Human review rounds: none (reported as a finding, no medians).

## Friction

- evidence, planned second pass: nearly every feature PR is followed by a separate "implementation review fixes (F1-Fn)" commit or PR (53 review files under `context/archive/*/reviews/`, 28 of them impl reviews). In the window 28 merged PR titles match review/fix; by capability (PR counts, cross-cutting included): platform 6, history 6, access 5, advice 5, live-flow 4, ratings 4, ingest 3, bill 2, foundations 2, notes 1, dashboard 1. This is the workflow (review gate, rule 5/7 analogue), not breakage; it shows where the review gate found something.
- evidence, real defects found by bot review and fixed before merge: bill (PR #57: central estimate outside its range accepted, `generated_at` in the future accepted; fixed e39f6c8; PR #64 impl-review F1-F9 and 8e05eb0 phase-1 findings, so three fix commits on bill-forecast in 2 days, 2026-09-28/29), live-flow (PR #58: consumption verdict rated from a stale daily row; fixed 8ef3575, needed a new migration to expose `daily_energy.captured_at`), ratings (PR #84: change month rated from post-change days only; Codex P1 on ratings), history (PR #76/#77: suspect hours on the lowest-hours list, three fix commits on grid-export-mismatch on 2026-09-30), ingest (PR #9: Sourcery bug_risk on a rejected RPC promise escaping `handleIngest` and `z.iso.date()` accepting `2026-02-31`).
- evidence, second attempts, same scope fixed several times within days: access/auth four fix commits 2026-09-19..09-29 (CSRF origin behind proxy, double submit, default sign-in link plus restore password sign-in, gradient headings; mixed bug and UI polish), advice parser three commits on 2026-09-25 (451c103, 84dea09, plus #22 "repair main CI"), bill-forecast three (above), grid-export-mismatch three, live-flow-interaction three (8ef3575, 9d1eadb, plus #58).
- evidence, platform fix ratio: 15 of 45 platform commits are fixes; subjects are CI/deploy iteration (`fix: pin valid setup-node action`, `Buildx for attestations`, `bind production server to dedicated IPv6`, `Vitest 4 pin in mutation workflow` #100, `Stryker incremental cache` #112, `keep production pulls within the Micr.us disk` #23). Per false-signals rule 5 this is how CI and deploy work is done; reported as mechanical, not as a broken capability.
- evidence, closed unmerged: 7 of 7 are #122-#128 "BREAK (do not merge)" (mechanical, deliberate, see below). No other PR was closed unmerged, none is open.
- evidence, issues (gh, 22 total): 4 `decision` issues open since 2026-09-25 (#18 sign-in email delivery SMTP and production templates, #19 leaked-password protection, #20 source of forecast confidence, #21 daily history from the lab; the last is likely stale since daily-history-push shipped 2026-09-25), 12 `slice` issues open since 2026-09-27 (S-07..S-20; two labelled `blocked` #45, #53; two `stretch`), 6 closed on 2026-09-27 (#1-#6, the first foundation/slice set). No issue is labelled bug; open bugs = 0 by label.
- inference: several open slice issues name features that the archive shows shipped (S-15 calendar #46 vs 2026-09-30-history-calendar, S-17 ratings #47 vs period-ratings, S-19 notes #49 vs 2026-10-01-day-notes, S-20 remarks #48 vs seasonal-usage-insight, S-18 #50 vs period-summaries partly). Issue state looks stale relative to the archive, or progress is tracked in Linear (dev-hub CLAUDE.md names Linear, team FNK, as the tracker; repo has `.linear.toml`). Treat GitHub issues as an unreliable open-work signal.
- evidence (contract): 7 `Mother Console` and 3 `Cursor Agent` commits are counted as activity only.

## Planning attention

Attributed by change name; 32 archived folders plus 2 in flight under `context/`, skipping `*-repo-map` and `*-domain-distillation` (none present). Counts are folders; dates are archive dates.

- evidence, ingest: push-ingestion-endpoint (09-23), daily-history-push (09-25), history-backfill (09-30), lab-period-summaries (IN FLIGHT, status impl_reviewed, created 2026-10-01), testing-push-to-page-integration (10-01). 5 total, 1 open.
- evidence, access: access-key-sign-in (09-23), testing-access-and-input-abuse (10-02), observability-capture-layer (IN FLIGHT, status implemented, created 10-03, row 5.4 deliberately left open: check production log lines after next deploy). 3 total, 1 open.
- evidence, live-flow: live-state-with-staleness, live-state-flow-visual, live-flow-interaction (20 files, big), grid-export-mismatch, inverter-grid-correction. 5.
- evidence, bill: bill-forecast, bill-accuracy (10 files, largest per-capability folder after live-flow-interaction). 2.
- evidence, advice: todays-recommendation, seasonal-usage-insight, usage-norm-scale, recommendation-card-refresh (21 files). 4.
- evidence, history: history-calendar, history-backfill, data-period-transparency, period-selector, testing-time-and-number-guards. 5.
- evidence, ratings: period-ratings, period-summaries (archived 10-01) plus in-flight lab-period-summaries (shared with ingest). 2 plus 1.
- evidence, notes: day-notes. 1.
- evidence, dashboard: dashboard-glass-restyle, dashboard-refresh-icons-sparklines (56 files, mass rename), frosted-aurora-dashboard, page-landmarks-headings. 4.
- evidence, platform: testing-quality-gates-wiring (10-05, archived by #130 today), plus deploy and CI plans under `context/deployment/` (deploy-plan.md, micrus-runbook.md). 1 plus 2 docs.
- evidence, cross-cutting prose: `context/foundation/` (prd, prd-v2, prd-v3, roadmap, test-plan, lessons, shape-notes), `docs/decisions.md` (10 dated sections, newest 2026-10-05 x2), `context/audits/observability/` (1 audit, 2026-10-03). lab-findings-cleanup and lab-feature-port are lab-facing (unattributed, ingest-adjacent).
- evidence: `docs/decisions.md` has a dated section on each of 8 days; the audit's recommended fixes 1-3 (logger, `throwQueryError`, `getUser` 503) are implemented in observability-capture-layer; fixes 4-9 (real readiness check, ingest rejection logging, lab heartbeat, auth message classification, startup config validation, log retention) have no change folder yet (grep of change names; inference that they remain open).
- inference: planning attention follows the roadmap sequence (feature slices 09-23..10-01, then test rollout phases 2-4 on 10-01..10-05, then observability 10-03..10-05). The newest attention is on testing, quality gates and observability, which are platform/foundations/access, not on new product features.

## Debt markers

- evidence: `git grep -wE 'TODO|FIXME|HACK|XXX'` over all tracked files (excluding the lock file) returns 0 hits; per-capability marker density is 0.0 per 1000 lines for all 12 buckets (lines counted: access 2166, advice 3832, bill 3229, dashboard 699, foundations 2184, history 5664, ingest 3667, live-flow 3299, notes 995, platform 3047, ratings 1690, docs 26812).
- evidence: debt is recorded instead as 24 `KNOWN GAP` test names (pinned, with a comment saying what a fix would change): history 11 (`tests/integration/history-safety.test.ts`), access 3 (`access-abuse`), notes 5 (`day-notes.test.ts` 2 and `notes-parity` 3), bill 2, ratings 2 (`period-rating.test.ts`), live-flow 1 (`staleness-surfaces.test.ts`). test-plan.md names five ingest-store gaps (lower daily total, null daily total, fewer hourly samples, far-future `built_at`, repeated `generated_at`) and three access/input differences (database `btrim` vs server `trim`, trim-then-max, table-level `recommendations` grant). The history-safety tests attribute to history by the capability glob but test ingest store semantics (inference: this is ingest debt as much as history).
- inference: zero markers means debt is tracked in prose and tests, not in code comments; marker density says nothing about quality here.

## Mechanical signals

- 7 closed-unmerged PRs #122-#128: deliberate break-proof throwaways (verify-by-breaking, test-plan phase 4). Not friction.
- Fix-ratio spikes in platform (CI/deploy iteration, rule 5), and the per-feature "impl review fixes" commits (planned review gate, rule 4: the shared cause is the 10x workflow itself).
- Bot review volume (Sourcery 98 reviews, Codex 52) is automation, not human review (rule 7); the owner-account replies on #57/#58 are agent-written.
- Docs buzz: 233 of 269 commits touch docs/context/docs paths (about 87%); rule 8, discussion about capabilities, never ranked. 6f74b8b (format of `context/`) and the PR #37/#38/#39 PRD/roadmap rewrites are prose churn.
- Large PRs by diff size: #57 (+9418/-539, 121 files, live-flow interaction stacked on glass restyle, flow visual and bill forecast), #79 (+4330, history-calendar), #68 (+3955, dashboard icons/sparklines), #59 (+3083, recommendation card), #94 (+2477, Stryker), #118 (+2293, access tests). #57 and #68 are stacked or bundled change sets, not a single risky edit; weight accordingly.
- Spillover: wide fix commits (60ceb75, 8ef3575, 886088a, 7dc3a24, e0f728f touch 5 capabilities each) inflate foundations, advice, dashboard and history fix counts; their subject names the real capability (testing guards, live-flow, dashboard-refresh, period-ratings, inverter-grid-correction). Foundations 28 of 53 and dashboard 25 of 27 commits are cross-cutting.

## Unknowns

- unknown: production errors. The owner-audit (2026-10-03) says there is no error tracker; the new logger writes JSON lines to container logs that nobody has reviewed in this run. Whether the code paths the audit flagged (provider outage reads as signed-out) have occurred is not visible.
- unknown: Linear (FNK) issue state and discussion; `.linear.toml` exists. GitHub issues are probably stale (see Friction).
- unknown: the lab repo (homelab-2) side of the push contract: external consumer of `/api/ingest` (rule 10). Rejections there are logged only in the lab's journal.
- unknown: whether `Mother Console` (7 commits) is a person or automation.
- unknown: 59 merged PRs (#7-#81) were attributed by title, not by files; boundary cases (#17, #41, #75-#78, #82, #85) may belong to more than one capability.
- limit: three weeks of history, one author; no trend over time is meaningful and every concentration is a baseline.

## Commands run

- `/bin/cat context/map/.work/capabilities.tsv`; a python3 pass over `.work/git-log.txt` using the tsv globs (first glob match in file order, longest prefix otherwise) to attribute commits, PR numbers `(#N)`, fix and revert subjects (script and output in the session scratchpad)
- `gh pr list --state all --limit 100` (two pages: latest 100, and `created:<2026-09-24`), `gh pr list --state open`, `gh issue list --state all --limit 200`
- `gh api --paginate repos/titusandronicu/energy-analyser/pulls/N/{reviews,comments}` and `issues/N/comments` for each of 108 PRs; `gh api .../pulls/57/{reviews,comments}` and `.../issues/58/comments` (owner-account bodies only)
- `git ls-files`, `command git grep -wE 'TODO|FIXME|HACK|XXX'`, `command git grep -c 'KNOWN GAP'`, per-folder `git ls-files` counts for `context/archive/*` and `context/changes/*`; headings of `context/audits/observability/*.md`, `docs/decisions.md`, `context/foundation/lessons.md`; front matter of the two in-flight `change.md` files
