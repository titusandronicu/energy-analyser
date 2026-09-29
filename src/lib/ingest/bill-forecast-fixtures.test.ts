import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toBillForecastView } from "@/lib/services/bill-forecast";
import { ingestPayloadV1 } from "./contract";

// The bodies pushed by scripts/push-fixture.mjs --file (scripts/fixtures/bill-forecast/). Every one must survive
// the strict contract, because a 422 there would stop the whole push.
const fixturesDir = fileURLToPath(new URL("../../../scripts/fixtures/bill-forecast/", import.meta.url));
const files = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

function read(name: string): unknown {
  return JSON.parse(readFileSync(`${fixturesDir}${name}`, "utf8"));
}

describe("bill-forecast fixtures", () => {
  it.each(files)("%s parses with the strict contract and carries a bill forecast", (file) => {
    const result = ingestPayloadV1.safeParse(read(file));
    expect(result.error?.issues).toBeUndefined();
    expect(result.data?.bill_forecast).toBeDefined();
  });

  // lab-shape.json is SYNTHETIC: every value is invented, but it mirrors the shape of the file the lab actually
  // publishes (web/data/current-month-bill-forecast.json on docker-core), including every key its build script
  // emits, the connector's period text and the null-versus-value patterns. It is the preflight for the lab push:
  // the section is sent unchanged, so anything the contract does not declare would be a 422 for the whole push.
  // Refresh its shape (keys, nulls, formats, never real values) whenever the lab script's output changes.
  describe("lab-shape.json", () => {
    const parsed = ingestPayloadV1.safeParse(read("lab-shape.json"));

    it("is accepted by the strict contract exactly as the lab writes it", () => {
      expect(parsed.error?.issues).toBeUndefined();
      expect(parsed.success).toBe(true);
    });

    it("renders as a forecast that names the settled month", () => {
      const forecast = parsed.data?.bill_forecast;
      if (forecast?.status !== "ok") throw new Error("expected the lab-shaped body to be an ok forecast");
      const view = toBillForecastView(
        { captured_at: "2027-03-19T08:15:28Z", received_at: "2027-03-19T08:15:29Z", bill_forecast: forecast },
        new Date("2027-03-19T08:20:00Z"),
      );
      expect(view.kind).toBe("forecast");
      if (view.kind !== "forecast") return;
      expect(view.rangeLabel).toBe("od 141 zł do 322 zł");
      expect(view.basis.referenceMonthLabel).toMatch(/lut\S* 2027/);
      expect(view.basis.referenceMonthLabel).not.toBe("—");
      expect(view.closedMonthCheck?.monthLabel).toBe(view.basis.referenceMonthLabel);
    });
  });
});
