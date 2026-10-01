import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ingestPayloadV1, validateIngestPayload, type IngestPayloadV1 } from "@/lib/ingest/contract";
import { warsawMonthKey } from "@/lib/format/warsaw-time";

type State = IngestPayloadV1["state"];
type DailyRow = NonNullable<IngestPayloadV1["daily_history"]>[number];
type HourRow = NonNullable<IngestPayloadV1["hourly_history"]>[number];
type Summary = NonNullable<IngestPayloadV1["period_summaries"]>[number];
type Recommendation = NonNullable<IngestPayloadV1["recommendation"]>;
type BillForecast = NonNullable<IngestPayloadV1["bill_forecast"]>;

// The only fixture the suite may read: declared SYNTHETIC in src/lib/ingest/bill-forecast-fixtures.test.ts.
const LAB_SHAPE = fileURLToPath(new URL("../../../scripts/fixtures/bill-forecast/lab-shape.json", import.meta.url));

// A minimal valid push with an invented live state; every figure here is made up. Pass `state` to change a figure.
export function baseBody(capturedAt: Date, state: Partial<State> = {}): IngestPayloadV1 {
  const body: IngestPayloadV1 = {
    contract_version: 1,
    source: "homelab",
    captured_at: capturedAt.toISOString(),
    state: {
      pv_w: 3100,
      home_load_w: 1450,
      grid_w: -1250,
      battery_w: -400,
      battery_soc_pct: 64,
      pv_today_kwh: 9.8,
      grid_import_today_kwh: 1.2,
      grid_export_today_kwh: 4.5,
      source_health: "ok",
      ...state,
    },
  };
  const checked = validateIngestPayload(body, new Date());
  if (!checked.success) throw new Error(`baseBody drifted from the contract: ${checked.error.issues[0].message}`);
  return body;
}

export function dailyRow(day: string, overrides: Partial<DailyRow> = {}): DailyRow {
  return { day, pv_kwh: 7.5, load_kwh: 10, grid_import_kwh: 3, grid_export_kwh: 1.5, ...overrides };
}

// `hourStart` is an ISO instant on a whole hour, as `freshHours` and `windowHours` return it.
export function hourRow(hourStart: string, overrides: Partial<HourRow> = {}): HourRow {
  return { hour_start: hourStart, load_kwh: 0.5, grid_net_kwh: 0.2, pv_kwh: 0.3, samples: 12, ...overrides };
}

export function summary(kind: Summary["kind"], period: string, overrides: Partial<Summary> = {}): Summary {
  return {
    kind,
    period,
    built_at: new Date().toISOString(),
    facts: { invented_figure: 42 },
    narration: {
      text: "Invented narration for an integration test.",
      generated_at: new Date().toISOString(),
      provider: "openrouter",
      model: "invented-model",
    },
    ...overrides,
  };
}

export function recommendation(generatedAt: Date, overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    generated_at: generatedAt.toISOString(),
    language: "pl",
    text: "Invented recommendation for an integration test.",
    provider: "ollama",
    model: "invented-model",
    forecast: { today_kwh: 12, tomorrow_kwh: 14, confidence: "medium" },
    facts: { current_state: {}, balance_today: {}, local_findings: [], sanity_checks: [] },
    ...overrides,
  };
}

// The synthetic lab-shaped forecast, re-dated so the card treats it as this month's: `generated_at` just before now
// and `month` the current Warsaw month. The contract does not tie `month` to the observed days, so it still validates.
export function billForecast(): BillForecast {
  const fixture = ingestPayloadV1.parse(JSON.parse(readFileSync(LAB_SHAPE, "utf8")));
  const forecast = fixture.bill_forecast;
  if (!forecast) throw new Error("lab-shape.json carries no bill_forecast");
  const now = new Date();
  return { ...forecast, generated_at: new Date(now.getTime() - 60_000).toISOString(), month: warsawMonthKey(now) };
}
