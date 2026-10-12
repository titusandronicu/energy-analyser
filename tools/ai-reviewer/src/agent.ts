// Reusable reviewer: a ToolLoopAgent whose structured output is the single REVIEW_SCHEMA
// contract. Exported as a factory so the CLI entry point and promptfoo evals share it.
import { Output, ToolLoopAgent, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { REVIEW_SCHEMA, type Review } from "./review-schema.ts";
import { SYSTEM_PROMPT, buildUserPrompt, type ReviewInput } from "./prompts.ts";

export const DEFAULT_MODEL = "z-ai/glm-5.3";

export function createReviewer({ apiKey, model = DEFAULT_MODEL }: { apiKey: string; model?: string }) {
  const openrouter = createOpenRouter({ apiKey });
  return new ToolLoopAgent({
    model: openrouter(model),
    instructions: SYSTEM_PROMPT,
    output: Output.object({ schema: REVIEW_SCHEMA }),
    // No tools yet (single-shot scorer); the cap keeps a future tool loop bounded.
    stopWhen: stepCountIs(5),
  });
}

export async function review(
  input: ReviewInput,
  opts: { apiKey: string; model?: string },
): Promise<{ review: Review; usage: unknown }> {
  const result = await createReviewer(opts).generate({ prompt: buildUserPrompt(input) });
  return { review: normalize(result.output), usage: result.usage };
}

// The 1-10 range is only described, not enforced by the schema (provider limitation), so clamp here.
// A non-pass verdict can never be produced by clamping: the verdict is passed through untouched.
export function normalize(r: Review): Review {
  const clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n)));
  return {
    ...r,
    implementationCorrectness: clamp(r.implementationCorrectness),
    idiomaticity: clamp(r.idiomaticity),
    complexity: clamp(r.complexity),
    testRiskCoverage: clamp(r.testRiskCoverage),
    documentation: clamp(r.documentation),
    securitySafety: clamp(r.securitySafety),
  };
}
