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

  // Every fixture, rendered through the real view model. The expected outcomes are listed by hand per file name
  // (hand arithmetic in the comments, from docs/logic.md), never read off the mapper, and the table must match the
  // directory exactly: a file nobody classified, or an entry without a file, fails, so a new fixture cannot be
  // added unreviewed. Contract-invalid bodies (a negative central) cannot live in this directory at all, because the
  // loop above requires the strict contract; those are inline cases in bill-forecast.test.ts.
  //
  // `minutesAfter` is the app clock relative to the body's own `generated_at` (5 minutes unless said otherwise).
  type Expected =
    | { kind: "forecast"; tone: string; minutesAfter?: number }
    | { kind: "unavailable"; tone: string; label?: string; reason: string; minutesAfter?: number };

  const expected: Record<string, Expected> = {
    // Range end 9500 is above the 7000 ceiling.
    "above-plausibility-ceiling.json": {
      kind: "unavailable",
      tone: "problem",
      label: "nierealna kwota",
      reason: "7000 zł",
    },
    // Closed-month amounts 8123.45 and 8201.90 are above the 7000 ceiling, which the contract does not check.
    "closed-month-amount-above-ceiling.json": {
      kind: "unavailable",
      tone: "problem",
      label: "nierealna kwota",
      reason: "7000 zł",
    },
    // Invoice 191.05, central 231.75: 191.05 x 1.2 = 229.26 < 231.75, so above +20% -> problem.
    "lab-shape.json": { kind: "forecast", tone: "problem" },
    // A projected credit of -12.5 kWh is a negative derived figure.
    "negative-derived-kwh.json": {
      kind: "unavailable",
      tone: "problem",
      label: "błędne dane w wyliczeniu",
      reason: "ujemne lub nieczytelne",
    },
    // No closed-month check, so no invoice and no verdict.
    "no-closed-month-check.json": { kind: "forecast", tone: "insufficient" },
    "no-data-no-complete-days.json": {
      kind: "unavailable",
      tone: "insufficient",
      reason: "po pierwszym pełnym dniu",
    },
    "no-data-rates-unavailable.json": {
      kind: "unavailable",
      tone: "problem",
      label: "brak ceny prądu",
      reason: "ceny prądu",
    },
    "no-data-settlement-facts-missing.json": {
      kind: "unavailable",
      tone: "insufficient",
      reason: "PGE nie rozliczyło",
    },
    // 7 observed days pass the gate. Central 256.31 is above the invoice figure but not past invoice x 1.2 -> watch.
    "seven-complete-days.json": { kind: "forecast", tone: "watch" },
    // 6 observed days are one short of the 7 needed.
    "six-complete-days.json": { kind: "unavailable", tone: "insufficient", reason: "jest 6 dni z 7 potrzebnych" },
    // Generated 31 minutes before the clock, one minute past the 30-minute window.
    "stale-generated-at.json": {
      kind: "unavailable",
      tone: "problem",
      label: "wyliczona 31 min temu",
      reason: "ma już 31 min",
      minutesAfter: 31,
    },
    // Invoice 200, central 260: 200 x 1.2 = 240 < 260 -> problem.
    "verdict-above-plus-20-pct.json": { kind: "forecast", tone: "problem" },
    // Invoice 200, central 240 = 200 x 1.2, exactly on the line -> the milder status, watch.
    "verdict-at-plus-20-pct.json": { kind: "forecast", tone: "watch" },
    // Invoice 200, central 200 -> at the invoice, good.
    "verdict-equal-to-invoice.json": { kind: "forecast", tone: "good" },
  };

  it("classifies every fixture file, and only files that exist", () => {
    expect(Object.keys(expected).sort()).toEqual(files);
  });

  it.each(Object.entries(expected))("%s renders as its documented outcome", (file, outcome) => {
    const forecast = ingestPayloadV1.parse(read(file)).bill_forecast;
    if (!forecast) throw new Error(`${file} carries no bill forecast`);
    const clock = new Date(Date.parse(forecast.generated_at) + (outcome.minutesAfter ?? 5) * 60_000);
    const view = toBillForecastView(
      { captured_at: clock.toISOString(), received_at: clock.toISOString(), bill_forecast: forecast },
      clock,
    );
    expect(view.kind).toBe(outcome.kind);
    if (view.kind === "empty") return;
    expect(view.status.tone).toBe(outcome.tone);
    if (view.kind === "unavailable" && outcome.kind === "unavailable") {
      expect(view.reason).toContain(outcome.reason);
      if (outcome.label !== undefined) expect(view.status.label).toBe(outcome.label);
    }
  });

  // A negative derived kWh figure must reach the card's mapper (which blanks it), not stop at a 422.
  it("negative-derived-kwh.json is stored by the contract and refused by the card", () => {
    const forecast = ingestPayloadV1.parse(read("negative-derived-kwh.json")).bill_forecast;
    const view = toBillForecastView(
      { captured_at: "2026-09-23T09:58:00Z", received_at: "2026-09-23T09:58:02Z", bill_forecast: forecast },
      new Date("2026-09-23T10:00:00Z"),
    );
    expect(view).toMatchObject({ kind: "unavailable", status: { label: "błędne dane w wyliczeniu" } });
  });

  // lab-shape.json is SYNTHETIC: every value is invented, but it mirrors the shape of the file the lab actually
  // publishes (web/data/current-month-bill-forecast.json on docker-core), including every key its build script
  // emits, the connector's period text and the null-versus-value patterns. It is the preflight for the lab push:
  // the section is sent unchanged, so anything the contract does not declare would be a 422 for the whole push.
  // Refresh its shape (keys, nulls, formats, never real values) whenever the lab script's output changes.
  // Any change to the keys of current-month-bill-forecast.json (top level or inside `settlement`) needs a contract
  // change deployed first, and this file refreshed in shape, or every push 422s (docs/ingest/README.md).
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
