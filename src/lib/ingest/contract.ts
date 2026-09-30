import { z } from "zod";

// Push contract v1: the only shape the home lab may send to POST /api/ingest.
// Objects are strict on purpose — an unknown key is rejected, so private fields can't slip in
// if the lab's bundle grows. docs/ingest/ holds the JSON Schema exported from this file.

export const INGEST_CONTRACT_VERSION = 1;
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const MAX_CAPTURE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const reading = z.number().nullable();
const energyKwh = z.number().nonnegative().nullable();
// Non-null counterpart of `energyKwh`, for the bill forecast's kWh and PLN figures. Hoisted so the
// deliberate bare `z.number()` inside `settlement` reads as the exception it is.
const nonNegative = z.number().nonnegative();
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

// One clock hour's totals from the lab's 5-minute history. `hour_start` is the instant the hour begins, on a whole
// hour; the app keys hours by that instant and labels them in Europe/Warsaw. `grid_net_kwh` is the hour's net
// import (import positive, export negative), the quantity PGE balances hourly. `samples` is how many 5-minute
// readings the hour rests on (12 for a full hour); the app decides from it whether the hour is complete.
const HOUR_MS = 60 * 60 * 1000;
// A sanity bound on one hour's energy: the house peaked at about 8 kWh in an hour (August 2026), so 50 kWh can only be
// a sensor glitch, which would otherwise be stored and ranked highest. A push carrying one is refused whole (422).
export const MAX_HOURLY_KWH = 50;
// Plain min/max rather than a refine, so the bound also appears in the exported JSON Schema the lab reads. Net grid
// energy is signed (import positive, export negative); zod rejects Infinity and NaN.
const hourlyKwh = z.number().nonnegative().max(MAX_HOURLY_KWH).nullable();
const hourlyNetKwh = z.number().min(-MAX_HOURLY_KWH).max(MAX_HOURLY_KWH).nullable();
const hourlyEnergy = z.strictObject({
  hour_start: z.iso
    .datetime({ offset: true })
    .refine((value) => Date.parse(value) % HOUR_MS === 0, { message: "hour_start must be on a whole hour" }),
  load_kwh: hourlyKwh,
  grid_net_kwh: hourlyNetKwh,
  pv_kwh: hourlyKwh,
  samples: z.number().int().min(0).max(12),
});

// The month part is validated like `z.iso.date()` does it, so "2026-13" is a rejection rather than
// something the card later reports as the wrong month.
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
// The lab's settled periods are the PGE connector's own text, "01.08.2026 - 31.08.2026", which it publishes as
// they are. Accepted beside `monthKey` (never instead of it, so an older sender stays valid); the app names the
// month a period ends in.
const settledPeriod = z.string().regex(/^\d{2}\.(0[1-9]|1[0-2])\.\d{4} - \d{2}\.(0[1-9]|1[0-2])\.\d{4}$/);
const referencePeriod = z.union([monthKey, settledPeriod]);

// The lab's estimate of this month's PGE invoice (docs/logic.md, "Bill forecast (lab)").
// Split on `status` so a `no_data` body can never carry a figure: the app must not be able to read
// `projected_bill_gross_pln` off a body that refused to produce one.
//
// Types here enforce shape and sign only for the money and the observed figures. There is deliberately no
// plausibility ceiling, and no sign check on `settlement` or on the derived kWh figures
// (`projected_import_kwh`, `projected_credit_kwh`, `projected_billable_kwh`, `credit_left_kwh`): a zod failure
// 422s the whole push, which would take the live `state` and the recommendation down with it.
// `reference_feed_in_kwh` has been observed negative in the lab, which gives a negative export ratio and so a
// negative credit. Those fields stay permissive `z.number()` and the sign check is the mapper's job, where it
// blanks this card alone.
const billForecast = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ok"),
    month: monthKey,
    confidence: z.enum(["low", "medium", "high"]),
    completed_days_used: z.number().int().nonnegative(),
    // `{date, grid_import_kwh}` per complete day the estimate rests on; the card names the period from it.
    // Days must be unique, as in `daily_history` below: a repeated date would skew the period label and
    // the day count the card derives from this array. A duplicate is a sender bug with no valid form.
    observed_days: z
      .array(z.strictObject({ date: z.iso.date(), grid_import_kwh: nonNegative }))
      .max(31)
      .refine((days) => new Set(days.map((d) => d.date)).size === days.length, {
        message: "observed_days dates must be unique",
      }),
    average_daily_import_kwh: nonNegative,
    projected_import_kwh: z.number(),
    projected_bill_gross_pln: nonNegative,
    range_gross_pln: z.strictObject({
      low: nonNegative,
      high: nonNegative,
    }),
    projected_credit_kwh: z.number(),
    projected_billable_kwh: z.number(),
    credit_left_kwh: z.number(),
    settlement: z.strictObject({
      factor: z.number(),
      reference_period: referencePeriod,
      reference_lag_months: z.number().int().nonnegative(),
      reference_consumed_kwh: z.number(),
      reference_feed_in_kwh: z.number(),
      export_ratio: z.number(),
      carried_credit_kwh: z.number(),
      carried_credit_basis: z.string().max(100),
      carried_credit_dropped_as_stale: z.boolean(),
      // The factor implied by the connector's two settled sums (a number), or null when the settlement came
      // from the history file, which does not carry it. Older senders sent a boolean, so that stays valid.
      factor_implied: z.union([z.number(), z.boolean()]).nullable(),
    }),
    pricing: z.strictObject({
      source: z.string().max(200),
      rates_verified_on: z.iso.date(),
      variable_gross_pln_per_kwh: nonNegative,
      fixed_gross_pln_per_month: nonNegative,
    }),
    // Absent when the reference period carries no invoice total, so readers treat it as optional.
    // `diff_pct` is signed by nature.
    closed_month_check: z
      .strictObject({
        period: referencePeriod,
        computed_gross_pln: nonNegative,
        invoice_gross_pln: nonNegative,
        diff_pct: z.number(),
        ok: z.boolean(),
      })
      .optional(),
    // The lab's own publication notice (two scalars, no identifiers). The lab writes it into the file and the
    // push sends the file unchanged, so it must be declared; the app never reads it.
    privacy: z
      .strictObject({
        raw_snapshots_public: z.boolean(),
        published_values: z.string().max(200),
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
  // At most 900 hours: 35 days plus daylight-saving slack, for the lab's one-off backfill. A regular push sends
  // the last 48 complete hours.
  hourly_history: z
    .array(hourlyEnergy)
    .max(900)
    .refine((hours) => new Set(hours.map((h) => Date.parse(h.hour_start))).size === hours.length, {
      message: "hourly_history hour_start values must be unique",
    })
    .optional(),
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
