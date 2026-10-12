# ai-reviewer

Team code-review agent (AI SDK 7 `ToolLoopAgent` + OpenRouter). Scores a PR diff on six criteria (1-10) and returns a binding `pass`/`fail` verdict with a Markdown summary; `src/review-schema.ts` is the single contract.

Runs in CI through `.github/workflows/ai-review.yml` and the composite action `.github/actions/ai-reviewer`, which executes the committed bundle `dist/review.js`. **After changing `src/`, run `npm run build` and commit the bundle.**

- Secret: `LLM_PROVIDER_API_KEY` (OpenRouter). Re-run on a PR by adding the `ai-cr:review` label.
- Local: `git diff main | LLM_PROVIDER_API_KEY=... PR_TITLE="x" npm run review`
- Evals: `OPENROUTER_API_KEY=... npm run eval` (promptfoo, three models, two planted-flaw fixtures)
- Requirements: `context/changes/ai-code-review-pipeline/requirements.md`
