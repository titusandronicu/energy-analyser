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
const dailyEnergy = z.strictObject({
  day: z.iso.date(),
  pv_kwh: energyKwh,
  load_kwh: energyKwh,
  grid_import_kwh: energyKwh,
  grid_export_kwh: energyKwh,
});

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
