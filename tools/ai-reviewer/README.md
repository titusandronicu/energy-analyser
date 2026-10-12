# ai-reviewer

Team code-review agent (AI SDK 7 `ToolLoopAgent` + OpenRouter). Scores a PR diff on six criteria (1-10) and returns a binding `pass`/`fail` verdict with a Markdown summary; `src/review-schema.ts` is the single contract.

Runs in CI through `.github/workflows/ai-review.yml` and the composite action `.github/actions/ai-reviewer`, which executes the committed bundle `dist/review.js`. **After changing `src/`, run `npm run build` and commit the bundle.**

- Secret: `LLM_PROVIDER_API_KEY` (OpenRouter). Re-run on a PR by adding the `ai-cr:review` label.
- Local: `git diff main | LLM_PROVIDER_API_KEY=... PR_TITLE="x" npm run review`
- Evals: `OPENROUTER_API_KEY=... npm run eval` (promptfoo, three models, two planted-flaw fixtures)
- Requirements: `context/changes/ai-code-review-pipeline/requirements.md`

## Notes

- **The gate is only binding with branch protection.** `ai-review.yml` fails the check on a `fail` verdict, but a failing check blocks merging only if `AI Code Review / review` is a required status check (it is deliberately not in the `main-quality-gates` ruleset yet).
- **Evals vs. the shipped prompt.** `prompts/review.txt` (regenerate with `npm run sync-prompt`) is a copy of `SYSTEM_PROMPT` plus a `{{diff}}` placeholder; a unit test fails if they drift apart.
- **Eval cases** include a clean, tested change that must pass, so a reviewer that rejects everything doesn't go unnoticed.
- `ai-reviewer-check.yml` typechecks, runs the unit tests and fails if `dist/review.js` is stale. Adding the `ai-cr:eval` label to a PR also runs the promptfoo evals in CI.
