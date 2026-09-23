// Shared entity types.

// A row of public.recommendations as the dashboard reads it. `forecast` and `facts` are jsonb pushed by the
// home lab (validated by the ingest contract on the way in), so readers still treat their shape as untrusted.
export interface RecommendationRow {
  generated_at: string;
  language: string;
  text: string;
  provider: string;
  model: string;
  forecast: unknown;
  facts: unknown;
}
