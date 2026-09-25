import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ingestPayloadV1, validateIngestPayload, type IngestPayloadV1 } from "./contract";

const schemaPath = fileURLToPath(new URL("../../../docs/ingest/contract-v1.schema.json", import.meta.url));
const examplePath = fileURLToPath(new URL("../../../docs/ingest/example-v1.json", import.meta.url));

// `npm run contract:export` sets this to regenerate the committed JSON Schema instead of checking it.
const exporting = process.env.UPDATE_INGEST_CONTRACT === "1";

const exportedSchema = z.toJSONSchema(ingestPayloadV1);
const example: unknown = JSON.parse(readFileSync(examplePath, "utf8"));
const validExample = ingestPayloadV1.parse(example);
const now = new Date("2026-09-23T12:01:00+02:00");

function withChanges(mutate: (payload: IngestPayloadV1) => void) {
  const payload = structuredClone(validExample);
  mutate(payload);
  return payload;
}

function sections(payload: IngestPayloadV1) {
  const { recommendation, daily_history } = payload;
  if (!recommendation || !daily_history) throw new Error("example must include every section");
  return { recommendation, days: daily_history };
}

function firstIssuePath(input: unknown) {
  const result = validateIngestPayload(input, now);
  expect(result.success).toBe(false);
  return result.error?.issues[0]?.path.join(".");
}

describe("ingest contract v1", () => {
  it("keeps the committed JSON Schema in sync with the zod contract", () => {
    if (exporting) writeFileSync(schemaPath, `${JSON.stringify(exportedSchema, null, 2)}\n`);
    // Compared as parsed JSON so Prettier's formatting of the committed file doesn't count as drift.
    expect(JSON.parse(readFileSync(schemaPath, "utf8"))).toEqual(exportedSchema);
  });

  it("accepts the committed example payload", () => {
    expect(validateIngestPayload(example, now).success).toBe(true);
  });

  it("accepts a payload with only the required state section", () => {
    const payload = withChanges((p) => {
      delete p.recommendation;
      delete p.daily_history;
    });
    expect(validateIngestPayload(payload, now).success).toBe(true);
  });

  it("rejects unknown top-level keys", () => {
    expect(firstIssuePath(withChanges((p) => Object.assign(p, { customer_id: "123" })))).toBe("");
  });

  it("rejects unknown nested keys", () => {
    expect(firstIssuePath(withChanges((p) => Object.assign(p.state, { ha_token: "x" })))).toBe("state");
  });

  it("rejects the lab prompt inside facts", () => {
    expect(firstIssuePath(withChanges((p) => Object.assign(sections(p).recommendation.facts, { prompt: "..." })))).toBe(
      "recommendation.facts",
    );
  });

  it("rejects a battery state of charge above 100%", () => {
    expect(firstIssuePath(withChanges((p) => (p.state.battery_soc_pct = 101)))).toBe("state.battery_soc_pct");
  });

  it("rejects an unsupported contract version", () => {
    expect(firstIssuePath(withChanges((p) => Object.assign(p, { contract_version: 2 })))).toBe("contract_version");
  });

  it("rejects a capture time more than 5 minutes in the future", () => {
    const payload = withChanges((p) => (p.captured_at = "2026-09-23T12:07:00+02:00"));
    expect(firstIssuePath(payload)).toBe("captured_at");
  });

  it("accepts a capture time just inside the future skew", () => {
    const payload = withChanges((p) => (p.captured_at = "2026-09-23T12:05:00+02:00"));
    expect(validateIngestPayload(payload, now).success).toBe(true);
  });

  it("rejects a capture time older than 14 days", () => {
    const payload = withChanges((p) => (p.captured_at = "2026-09-09T12:00:00+02:00"));
    expect(firstIssuePath(payload)).toBe("captured_at");
  });

  it("rejects duplicate days in daily history", () => {
    const payload = withChanges((p) => {
      const { days } = sections(p);
      days[1] = { ...days[1], day: days[0].day };
    });
    expect(firstIssuePath(payload)).toBe("daily_history");
  });

  it("rejects negative energy totals", () => {
    expect(firstIssuePath(withChanges((p) => (sections(p).days[0].pv_kwh = -1)))).toBe("daily_history.0.pv_kwh");
  });

  it("accepts a day with a PV forecast", () => {
    const payload = withChanges((p) => (sections(p).days[0].pv_forecast_kwh = 12.5));
    expect(validateIngestPayload(payload, now).success).toBe(true);
  });

  it("accepts a day without a PV forecast", () => {
    const payload = withChanges((p) => {
      for (const d of sections(p).days) delete d.pv_forecast_kwh;
    });
    expect(validateIngestPayload(payload, now).success).toBe(true);
  });

  it("rejects a negative PV forecast", () => {
    expect(firstIssuePath(withChanges((p) => (sections(p).days[0].pv_forecast_kwh = -1)))).toBe(
      "daily_history.0.pv_forecast_kwh",
    );
  });
});
