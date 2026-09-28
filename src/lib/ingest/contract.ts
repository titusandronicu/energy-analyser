import { z } from "zod";

// Push contract v1: the only shape the home lab may send to POST /api/ingest.
// Objects are strict on purpose — an unknown key is rejected, so private fields can't slip in
// if the lab's bundle grows. docs/ingest/ holds the JSON Schema exported from this file.

export const INGEST_CONTRACT_VERSION = 1;
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const MAX_CAPTURE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const reading = z.number().nullable();
const energyKwh = z.number().nonnegative().nullable();
const factValue = z.union([z.number(), z.string().max(500), z.boolean(), z.null()]);
const factRecord = z.record(z.string().max(100), factValue);

// Sign conventions follow the lab: grid positive = import, battery positive = discharge.
const state = z.strictObject({
  pv_w: reading,
  home_load_w: reading,
  grid_w: reading,
  battery_w: reading,
  battery_soc_pct: z.number().min(0).max(100).nullable(),
  pv_today_kwh: energyKwh,
  grid_import_today_kwh: energyKwh,
  grid_export_today_kwh: energyKwh,
  source_health: z.string().max(50).nullable(),
});

// The lab's `prompt`, `comparison_values` and `safety` blocks are deliberately not accepted.
const facts = z.strictObject({
  current_state: factRecord,
  balance_today: factRecord,
  local_findings: z.array(factRecord).max(50),
  sanity_checks: z.array(factRecord).max(50),
});

const recommendation = z.strictObject({
  generated_at: z.iso.datetime({ offset: true }),
  language: z.literal("pl"),
  text: z.string().min(1).max(4000),
  provider: z.enum(["ha_conversation", "ollama", "openrouter"]),
  model: z.string().min(1).max(100),
  forecast: z.strictObject({
    today_kwh: energyKwh,
    tomorrow_kwh: energyKwh,
    confidence: z.enum(["low", "medium", "high"]).optional(),
  }),
  facts,
});

// `day` is the Europe/Warsaw calendar date as the lab computes it; the app never re-derives it.
// `pv_forecast_kwh` is that day's PV forecast as known in the morning.
const dailyEnergy = z.strictObject({
  day: z.iso.date(),
  pv_kwh: energyKwh,
  load_kwh: energyKwh,
  grid_import_kwh: energyKwh,
  grid_export_kwh: energyKwh,
  pv_forecast_kwh: energyKwh.optional(),
});

const monthKey = z.string().regex(/^\d{4}-\d{2}$/);

// The lab's estimate of this month's PGE invoice (docs/logic.md, "Bill forecast (lab)").
// Split on `status` so a `no_data` body can never carry a figure: the app must not be able to read
// `projected_bill_gross_pln` off a body that refused to produce one.
//
// Types here enforce shape and sign only. There is deliberately no plausibility ceiling and no sign
// check on `settlement`: a zod failure 422s the whole push, which would take the live `state` and the
// recommendation down with it. `reference_feed_in_kwh` has been observed negative in the lab, so the
// settlement block stays permissive `z.number()` and the sign check lives in the mapper, where it
// blanks this card alone.
const billForecast = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ok"),
    month: monthKey,
    confidence: z.enum(["low", "medium", "high"]),
    completed_days_used: z.number().int().nonnegative(),
    // `{date, grid_import_kwh}` per complete day the estimate rests on; the card names the period from it.
    observed_days: z.array(z.strictObject({ date: z.iso.date(), grid_import_kwh: z.number().nonnegative() })).max(31),
    average_daily_import_kwh: z.number().nonnegative(),
    projected_import_kwh: z.number().nonnegative(),
    projected_bill_gross_pln: z.number().nonnegative(),
    range_gross_pln: z.strictObject({
      low: z.number().nonnegative(),
      high: z.number().nonnegative(),
    }),
    projected_credit_kwh: z.number().nonnegative(),
    projected_billable_kwh: z.number().nonnegative(),
    credit_left_kwh: z.number().nonnegative(),
    settlement: z.strictObject({
      factor: z.number(),
      reference_period: monthKey,
      reference_lag_months: z.number().int().nonnegative(),
      reference_consumed_kwh: z.number(),
      reference_feed_in_kwh: z.number(),
      export_ratio: z.number(),
      carried_credit_kwh: z.number(),
      carried_credit_basis: z.string().max(100),
      carried_credit_dropped_as_stale: z.boolean(),
      factor_implied: z.boolean(),
    }),
    pricing: z.strictObject({
      source: z.string().max(200),
      rates_verified_on: z.iso.date(),
      variable_gross_pln_per_kwh: z.number().nonnegative(),
      fixed_gross_pln_per_month: z.number().nonnegative(),
    }),
    // Absent when the reference period carries no invoice total, so readers treat it as optional.
    // `diff_pct` is signed by nature.
    closed_month_check: z
      .strictObject({
        period: monthKey,
        computed_gross_pln: z.number().nonnegative(),
        invoice_gross_pln: z.number().nonnegative(),
        diff_pct: z.number(),
        ok: z.boolean(),
      })
      .optional(),
    generated_at: z.iso.datetime({ offset: true }),
    method: z.literal("net_metering_credit_estimate"),
  }),
  z.strictObject({
    status: z.literal("no_data"),
    reason: z.enum(["no_complete_days", "settlement_facts_missing", "rates_unavailable"]),
    message: z.string().max(500),
    generated_at: z.iso.datetime({ offset: true }),
    month: monthKey,
    method: z.literal("net_metering_credit_estimate"),
  }),
]);

export const ingestPayloadV1 = z.strictObject({
  contract_version: z.literal(INGEST_CONTRACT_VERSION),
  source: z.literal("homelab"),
  captured_at: z.iso.datetime({ offset: true }),
  state,
  recommendation: recommendation.optional(),
  daily_history: z
    .array(dailyEnergy)
    .max(62)
    .refine((days) => new Set(days.map((d) => d.day)).size === days.length, {
      message: "daily_history days must be unique",
    })
    .optional(),
  bill_forecast: billForecast.optional(),
});

export type IngestPayloadV1 = z.infer<typeof ingestPayloadV1>;

// Structural validation plus the capture-time window, which depends on the current time.
export function validateIngestPayload(input: unknown, now: Date = new Date()) {
  return ingestPayloadV1
    .superRefine((payload, ctx) => {
      const capturedAt = Date.parse(payload.captured_at);
      if (capturedAt - now.getTime() > MAX_FUTURE_SKEW_MS) {
        ctx.addIssue({ code: "custom", path: ["captured_at"], message: "captured_at is in the future" });
      } else if (now.getTime() - capturedAt > MAX_CAPTURE_AGE_MS) {
        ctx.addIssue({ code: "custom", path: ["captured_at"], message: "captured_at is older than 14 days" });
      }
    })
    .safeParse(input);
}
