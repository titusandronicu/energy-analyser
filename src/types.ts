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

// The newest homelab snapshot as public.live_state exposes it. `state` is the pushed jsonb (validated by the
// ingest contract on the way in), so readers still treat its shape as untrusted.
export interface LiveStateRow {
  captured_at: string;
  received_at: string;
  state: unknown;
}

// A row of public.daily_energy as the dashboard reads it: one Europe/Warsaw calendar day ("YYYY-MM-DD") of
// totals pushed by the home lab. Any total may be missing (null) for a day.
export interface DailyEnergyRow {
  day: string;
  pv_kwh: number | null;
  load_kwh: number | null;
  grid_import_kwh: number | null;
  grid_export_kwh: number | null;
  pv_forecast_kwh: number | null;
}
