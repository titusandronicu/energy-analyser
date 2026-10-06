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

// The newest homelab push that carries a bill forecast, as public.bill_forecast exposes it. `bill_forecast`
// is the pushed jsonb (validated by the ingest contract on the way in), so readers still treat its shape as
// untrusted.
export interface BillForecastRow {
  captured_at: string;
  received_at: string;
  bill_forecast: unknown;
}

// A row of public.hourly_energy as the dashboard reads it: one clock hour keyed by the instant it starts
// (`hour_start`, timestamptz). `grid_net_kwh` is signed, import positive and export negative; `samples` is how many
// 5-minute readings the hour rests on (12 for a full hour). Any total may be missing (null).
export interface HourlyEnergyRow {
  hour_start: string;
  load_kwh: number | null;
  grid_net_kwh: number | null;
  pv_kwh: number | null;
  samples: number;
}

// A row of public.day_notes as the history calendar reads it: the signed-in owner's note on one Europe/Warsaw
// calendar day ("YYYY-MM-DD"). `text` is 1–500 characters typed by the user, so it is only ever rendered as escaped
// text. `updated_at` is the timestamptz PostgREST returns as an ISO string.
export interface DayNoteRow {
  day: string;
  text: string;
  updated_at: string;
}

// A row of public.alert_rules as the owner reads it: every column except user_id. `kind` decides what `threshold`
// means (live_stale: minutes of snapshot age; bill_above: PLN). `state`, `last_notified_at`, `last_evaluated_at` and
// `unevaluable_reason` belong to the evaluator. Timestamps are the ISO strings PostgREST returns; `threshold` is numeric.
export interface AlertRuleRow {
  id: number;
  kind: "live_stale" | "bill_above";
  threshold: number;
  label: string | null;
  enabled: boolean;
  renotify_hours: number;
  state: "ok" | "alarm";
  last_notified_at: string | null;
  last_evaluated_at: string | null;
  unevaluable_reason: string | null;
  created_at: string;
  updated_at: string;
}

// A row of public.period_summaries: the lab's plain-language text for today, a completed day or a completed month,
// one row per (kind, period). `period` is the Europe/Warsaw date ("YYYY-MM-DD") for today and day, the month
// ("YYYY-MM") for month. `facts` is the pushed jsonb the text was written from (validated by the ingest contract on
// the way in), so readers still treat its shape as untrusted. The narration columns are all null when the cloud model
// failed and only the facts arrived. `built_at` decides which push's entry is kept (latest wins).
export interface PeriodSummaryRow {
  kind: "today" | "day" | "month";
  period: string;
  facts: unknown;
  narration_text: string | null;
  narration_generated_at: string | null;
  narration_provider: string | null;
  narration_model: string | null;
  built_at: string;
}
