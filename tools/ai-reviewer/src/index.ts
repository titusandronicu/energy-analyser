// CLI / action entry point. Diff from DIFF_FILE (CI) or stdin (`git diff | npm run review`),
// PR_TITLE / PR_BODY from env. Prints the review as JSON on stdout; logs go to stderr.
import { readFileSync } from "node:fs";
import { review } from "./agent.ts";

const apiKey = process.env.LLM_PROVIDER_API_KEY;
if (!apiKey) {
  console.error("LLM_PROVIDER_API_KEY is not set");
  process.exit(2);
}

const diff = readFileSync(process.env.DIFF_FILE ?? 0, "utf8");
if (!diff.trim()) {
  console.error("Empty diff, nothing to review");
  process.exit(2);
}

const { review: result, usage } = await review(
  { title: process.env.PR_TITLE ?? "(local run)", body: process.env.PR_BODY, diff },
  { apiKey, model: process.env.REVIEW_MODEL || undefined },
);
console.error("usage:", JSON.stringify(usage));
console.log(JSON.stringify(result, null, 2));
