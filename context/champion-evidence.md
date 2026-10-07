# 10xChampion evidence: code-review CI pipeline (M5 L2-L3)

Option chosen: the CI/CD pipeline for code review. Repo: `titusandronicu/energy-analyser`.

| Required proof                              | Where to capture it                                                                       | Link                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Pipeline view with at least one visible job | Actions run page, job `code-review` (success)                                             | https://github.com/titusandronicu/energy-analyser/actions/runs/37309617780 |
| Pipeline or job logs during code review     | Same run, open the step "Run Claude Code Review"                                          | same run                                                                   |
| Agent's code review comment on a PR         | PR #120, comment by `github-actions` titled "Code Review" (labelled `claude-code-review`) | https://github.com/titusandronicu/energy-analyser/pull/120                 |

Definition: `.github/workflows/code-review.yml` (runs when a PR gets the `claude-code-review` label; diff goes to Claude Code on stdin; the result is posted as a sticky PR comment). Companion workflow: `.github/workflows/code-review-fix.yml`. Reusable copy: `ci-templates/claude-review` in dev-hub.

Other runs: success on 2026-10-05 (branches `test/middleware-request-id-and-outage` and `test/access-and-input-abuse`, 34s and 25s); the first runs on 2026-09-23 failed (18-19s) before the 6m40s success, which shows the iteration.

Screenshots to attach (taken by hand, not stored in the repo): run page, expanded log, PR comment.
