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
  const { recommendation, daily_history, bill_forecast, hourly_history } = payload;
  if (!recommendation || !daily_history || !bill_forecast || !hourly_history) {
    throw new Error("example must include every section");
  }
  return { recommendation, days: daily_history, billForecast: bill_forecast, hours: hourly_history };
}

// The example carries the `ok` body; the `no_data` branch is built explicitly where it is needed.
function okForecast(payload: IngestPayloadV1) {
  const { billForecast } = sections(payload);
  if (billForecast.status !== "ok") throw new Error("example must carry a bill forecast with status ok");
  return billForecast;
}

const noDataForecast = {
  status: "no_data",
  reason: "no_complete_days",
  message: "Ten miesiąc nie ma jeszcze ani jednego zakończonego dnia.",
  generated_at: "2026-09-23T11:55:00+02:00",
  month: "2026-09",
  method: "net_metering_credit_estimate",
} as const;

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
      delete p.bill_forecast;
      delete p.hourly_history;
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

  it("accepts a day with an unknown (null) PV forecast", () => {
    const payload = withChanges((p) => (sections(p).days[0].pv_forecast_kwh = null));
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

  it("accepts the bill forecast in the committed example", () => {
    expect(okForecast(validExample).method).toBe("net_metering_credit_estimate");
    expect(validateIngestPayload(example, now).success).toBe(true);
  });

  it("accepts a bill forecast without the closed-month check", () => {
    const payload = withChanges((p) => delete okForecast(p).closed_month_check);
    expect(validateIngestPayload(payload, now).success).toBe(true);
  });

  it("accepts a bill forecast that refuses to produce a figure", () => {
    const payload = withChanges((p) => (p.bill_forecast = noDataForecast));
    expect(validateIngestPayload(payload, now).success).toBe(true);
  });

  it("rejects a refusing bill forecast that still carries a figure", () => {
    const payload = withChanges((p) =>
      Object.assign(p, { bill_forecast: { ...noDataForecast, projected_bill_gross_pln: 258 } }),
    );
    expect(firstIssuePath(payload)).toBe("bill_forecast");
  });

  // Deliberate, like the settlement block below: a negative feed-in gives a negative export ratio and so a
  // negative credit, and the mapper's sign guard blanks the card instead of the push failing.
  it.each(["projected_import_kwh", "projected_credit_kwh", "projected_billable_kwh", "credit_left_kwh"] as const)(
    "accepts a negative %s rather than failing the whole push",
    (field) => {
      const payload = withChanges((p) => (okForecast(p)[field] = -1));
      expect(validateIngestPayload(payload, now).success).toBe(true);
    },
  );

  it("rejects a negative average daily import", () => {
    expect(firstIssuePath(withChanges((p) => (okForecast(p).average_daily_import_kwh = -1)))).toBe(
      "bill_forecast.average_daily_import_kwh",
    );
  });

  it("rejects a negative projected bill", () => {
    expect(firstIssuePath(withChanges((p) => (okForecast(p).projected_bill_gross_pln = -1)))).toBe(
      "bill_forecast.projected_bill_gross_pln",
    );
  });

  // Deliberate: the lab has published a negative `reference_feed_in_kwh`, and a 422 here would take the
  // live state and the recommendation down with it. The sign check lives in the card's mapper, where it
  // blanks this one card. See the comment above `billForecast` in contract.ts.
  it("accepts a negative settlement figure rather than failing the whole push", () => {
    const payload = withChanges((p) => (okForecast(p).settlement.reference_feed_in_kwh = -342));
    expect(validateIngestPayload(payload, now).success).toBe(true);
  });

  it("rejects an unknown key inside the bill forecast", () => {
    expect(firstIssuePath(withChanges((p) => Object.assign(okForecast(p), { tariff_secret: "x" })))).toBe(
      "bill_forecast",
    );
  });

  it("rejects an unsupported forecast method", () => {
    expect(firstIssuePath(withChanges((p) => Object.assign(okForecast(p), { method: "flat_rate" })))).toBe(
      "bill_forecast.method",
    );
  });

  it("rejects a month outside 01-12", () => {
    expect(firstIssuePath(withChanges((p) => (okForecast(p).month = "2026-13")))).toBe("bill_forecast.month");
    expect(firstIssuePath(withChanges((p) => (okForecast(p).month = "2026-00")))).toBe("bill_forecast.month");
  });

  it("accepts the lab's period text and a numeric or null implied factor", () => {
    const payload = withChanges((p) => {
      const forecast = okForecast(p);
      forecast.settlement.reference_period = "01.08.2026 - 31.08.2026";
      forecast.settlement.factor_implied = 0.8;
      if (forecast.closed_month_check) forecast.closed_month_check.period = "01.08.2026 - 31.08.2026";
    });
    expect(validateIngestPayload(payload, now).success).toBe(true);
    expect(
      validateIngestPayload(
        withChanges((p) => (okForecast(p).settlement.factor_implied = null)),
        now,
      ).success,
    ).toBe(true);
  });

  it("rejects a reference period that is neither a month nor the lab's period text", () => {
    expect(firstIssuePath(withChanges((p) => (okForecast(p).settlement.reference_period = "August 2026")))).toBe(
      "bill_forecast.settlement.reference_period",
    );
  });

  it("rejects a repeated day in observed_days", () => {
    expect(
      firstIssuePath(
        withChanges((p) => {
          const forecast = okForecast(p);
          forecast.observed_days = [forecast.observed_days[0], { ...forecast.observed_days[0] }];
        }),
      ),
    ).toBe("bill_forecast.observed_days");
  });

  it("accepts a payload without a bill forecast", () => {
    const payload = withChanges((p) => delete p.bill_forecast);
    expect(validateIngestPayload(payload, now).success).toBe(true);
  });

  it("accepts the hourly history in the committed example", () => {
    expect(sections(validExample).hours.length).toBeGreaterThan(0);
    expect(validateIngestPayload(example, now).success).toBe(true);
  });

  it("accepts a payload without hourly history", () => {
    const payload = withChanges((p) => delete p.hourly_history);
    expect(validateIngestPayload(payload, now).success).toBe(true);
  });

  it("accepts a negative net grid energy (an exporting hour) and an unknown (null) one", () => {
    expect(
      validateIngestPayload(
        withChanges((p) => (sections(p).hours[0].grid_net_kwh = -2.4)),
        now,
      ).success,
    ).toBe(true);
    expect(
      validateIngestPayload(
        withChanges((p) => (sections(p).hours[0].grid_net_kwh = null)),
        now,
      ).success,
    ).toBe(true);
  });

  it("rejects negative house use in an hour", () => {
    expect(firstIssuePath(withChanges((p) => (sections(p).hours[0].load_kwh = -0.1)))).toBe(
      "hourly_history.0.load_kwh",
    );
  });

  it("rejects a repeated hour in hourly history", () => {
    const payload = withChanges((p) => {
      const { hours } = sections(p);
      hours[1] = { ...hours[1], hour_start: hours[0].hour_start };
    });
    expect(firstIssuePath(payload)).toBe("hourly_history");
  });

  it("rejects the same hour written with a different offset", () => {
    const payload = withChanges((p) => {
      const { hours } = sections(p);
      hours[0] = { ...hours[0], hour_start: "2026-09-23T08:00:00+02:00" };
      hours[1] = { ...hours[1], hour_start: "2026-09-23T06:00:00Z" };
    });
    expect(firstIssuePath(payload)).toBe("hourly_history");
  });

  it("rejects an hour that does not start on a whole hour", () => {
    expect(firstIssuePath(withChanges((p) => (sections(p).hours[0].hour_start = "2026-09-23T08:30:00+02:00")))).toBe(
      "hourly_history.0.hour_start",
    );
  });

  it("rejects an hour start without an offset", () => {
    expect(firstIssuePath(withChanges((p) => (sections(p).hours[0].hour_start = "2026-09-23T08:00:00")))).toBe(
      "hourly_history.0.hour_start",
    );
  });

  it.each([13, -1, 10.5])("rejects %s samples in an hour", (samples) => {
    expect(firstIssuePath(withChanges((p) => (sections(p).hours[0].samples = samples)))).toBe(
      "hourly_history.0.samples",
    );
  });

  it("accepts 900 hours and rejects 901", () => {
    const hoursFrom = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        hour_start: new Date(Date.parse("2026-08-20T00:00:00Z") + i * 60 * 60 * 1000).toISOString(),
        load_kwh: 0.5,
        grid_net_kwh: 0.2,
        pv_kwh: 0,
        samples: 12,
      }));
    expect(
      validateIngestPayload(
        withChanges((p) => (p.hourly_history = hoursFrom(900))),
        now,
      ).success,
    ).toBe(true);
    expect(firstIssuePath(withChanges((p) => (p.hourly_history = hoursFrom(901))))).toBe("hourly_history");
  });

  it("rejects an unknown key inside an hour", () => {
    expect(firstIssuePath(withChanges((p) => Object.assign(sections(p).hours[0], { phase_l1_w: 1 })))).toBe(
      "hourly_history.0",
    );
  });
});
