# 10xChampion evidence: code-review CI pipeline (M5 L2-L3)

Option chosen: A, the CI/CD pipeline for code review (M5 L2-L3). Option B, the team artifact registry (M5 L4), is not attempted; the official text requires only one of the two (`context/foundation/certification-criteria.md`, section 2b). Repo: `titusandronicu/energy-analyser`.

Two pipelines exist. The **primary evidence is the M5 L2-L3 pipeline** (PR #163): a review agent built on AI SDK 7 that scores a diff on six criteria, gives a binding pass/fail verdict, comments on the PR, labels it `ai-cr:passed` / `ai-cr:failed` and fails the check on `fail`. The earlier label-driven Claude Code pipeline (`code-review.yml`, PR #120) stays as a second, independent proof.

## Primary: AI Code Review agent (PR #163)

| Required proof (the three the official text asks for) | Where to capture it                                                                            | Link                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Pipeline view with at least one visible job           | Actions run page, job `review` (success)                                                       | https://github.com/titusandronicu/energy-analyser/actions/runs/38266639726 |
| Pipeline or job logs during code review               | Same run, open the step "Run ./.github/actions/ai-reviewer" (it logs the token usage and cost) | same run                                                                   |
| Agent's code review comment on a PR                   | PR #163, comment "AI Code Review: pass" with a score table, label `ai-cr:passed`               | https://github.com/titusandronicu/energy-analyser/pull/163                 |

Iteration worth showing (the gate works in both directions): run `38264337016` on the first commit returned **fail**, and the agent's real findings (a stray `node_modules` symlink committed by mistake, unfenced PR title/body in the prompt, `master` vs `main` in the requirements) were fixed; run `38264657608` then returned **pass**.

Definition: `.github/workflows/ai-review.yml` (every PR to `main`, plus the `ai-cr:review` label to re-run) calls the composite action `.github/actions/ai-reviewer`, which runs the committed bundle built from `tools/ai-reviewer/` (AI SDK 7 `ToolLoopAgent`, structured output from one zod schema, OpenRouter). Companion: `.github/workflows/ai-reviewer-check.yml` (typecheck, unit tests, fails if the committed bundle is stale; the `ai-cr:eval` label also runs the promptfoo evals: three models, three cases including a clean change that must pass; run `38266255275`, 7 of 9 pass, the two misses are on the React-migration case where two models did not name all three planted flaws).

Limits to state plainly: the verdict only blocks a merge if `AI Code Review / review` is a required check, which it is not yet; the diff excludes lockfiles and the generated bundle; the evals are a first, small set.

## Earlier: label-driven Claude Code review (PR #120)

| Required proof                              | Where to capture it                                                                    | Link                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Pipeline view with at least one visible job | Actions run page, job `code-review` (success)                                          | https://github.com/titusandronicu/energy-analyser/actions/runs/37309617780 |
| Pipeline or job logs during code review     | Same run, step "Run Claude Code Review"                                                | same run                                                                   |
| Agent's code review comment on a PR         | PR #120, comment by `github-actions` titled "Code Review" (label `claude-code-review`) | https://github.com/titusandronicu/energy-analyser/pull/120                 |

Definition: `.github/workflows/code-review.yml` (runs when a PR gets the `claude-code-review` label; diff goes to Claude Code on stdin; the result is posted as a sticky PR comment). Companion workflow: `.github/workflows/code-review-fix.yml`. Reusable copy: `ci-templates/claude-review` in dev-hub.

Other runs: success on 2026-10-05 (branches `test/middleware-request-id-and-outage` and `test/access-and-input-abuse`, 34s and 25s); the first runs on 2026-09-23 failed (18-19s) before the 6m40s success, which shows the iteration.

Screenshots to attach (taken by hand, not stored in the repo): for the primary pipeline, the run page, the expanded agent step and the PR #163 comment with its label.
