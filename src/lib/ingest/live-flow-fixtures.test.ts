import { MINUTE_MS } from "@/lib/format/age";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DailyEnergyRow, LiveStateRow } from "@/types";
import { toLiveStateView } from "@/lib/services/live-state";
import { ingestPayloadV1, type IngestPayloadV1 } from "./contract";

// The live-flow scenarios pushed by scripts/push-fixture.mjs --file (scripts/fixtures/live-flow/). They are
// parsed with the strict contract and rated by the live-state mapper at a fixed clock, so the tones each
// scenario promises (docs/logic.md, "Live state: node verdicts") cannot drift silently.
const fixturesDir = fileURLToPath(new URL("../../../scripts/fixtures/live-flow/", import.meta.url));
const files = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

function load(name: string): IngestPayloadV1 {
  return ingestPayloadV1.parse(JSON.parse(readFileSync(`${fixturesDir}${name}.json`, "utf8")));
}

function toRow(payload: IngestPayloadV1): LiveStateRow {
  return { captured_at: payload.captured_at, received_at: payload.captured_at, state: payload.state };
}

function toDaily(payload: IngestPayloadV1): DailyEnergyRow[] {
  return (payload.daily_history ?? []).map((day) => ({
    day: day.day,
    pv_kwh: day.pv_kwh,
    load_kwh: day.load_kwh,
    grid_import_kwh: day.grid_import_kwh,
    grid_export_kwh: day.grid_export_kwh,
    pv_forecast_kwh: day.pv_forecast_kwh ?? null,
  }));
}

function viewOf(name: string, afterCaptureMs: number) {
  const payload = load(name);
  const now = new Date(Date.parse(payload.captured_at) + afterCaptureMs);
  const view = toLiveStateView(toRow(payload), now, toDaily(payload), payload.captured_at);
  if (view.kind !== "state") throw new Error("expected a state view");
  return view;
}

describe("live-flow fixtures", () => {
  it("has the four documented scenarios", () => {
    expect(files).toEqual(["battery-low.json", "battery-missing.json", "normal.json", "worse.json"]);
  });

  it.each(files)("%s parses with the strict contract and carries state and daily history", (file) => {
    const payload = ingestPayloadV1.parse(JSON.parse(readFileSync(`${fixturesDir}${file}`, "utf8")));
    expect(payload.daily_history?.length).toBeGreaterThanOrEqual(10);
  });

  it("rates normal as good on PV, consumption and battery", () => {
    const { verdicts, isStale, isDegraded } = viewOf("normal", 2 * MINUTE_MS);
    expect(isStale).toBe(false);
    expect(isDegraded).toBe(false);
    expect(verdicts.pv.tone).toBe("good");
    expect(verdicts.home.tone).toBe("good");
    expect(verdicts.battery.tone).toBe("good");
  });

  it("rates worse as watch on PV and consumption with the battery fine", () => {
    const { verdicts } = viewOf("worse", 2 * MINUTE_MS);
    expect(verdicts.pv.tone).toBe("watch");
    expect(verdicts.home.tone).toBe("watch");
    expect(verdicts.battery.tone).toBe("good");
  });

  it("rates battery-low as a battery problem", () => {
    const { verdicts } = viewOf("battery-low", 2 * MINUTE_MS);
    expect(verdicts.battery.tone).toBe("problem");
  });

  it("leaves the battery unrated and marks the snapshot degraded for battery-missing", () => {
    const { verdicts, isDegraded } = viewOf("battery-missing", 2 * MINUTE_MS);
    expect(verdicts.battery.tone).toBe("insufficient");
    expect(isDegraded).toBe(true);
  });

  it("rates nothing when normal is 40 minutes old (the stale scenario)", () => {
    const { verdicts, isStale } = viewOf("normal", 40 * MINUTE_MS);
    expect(isStale).toBe(true);
    expect(verdicts.pv.tone).toBe("insufficient");
    expect(verdicts.home.tone).toBe("insufficient");
    expect(verdicts.battery.tone).toBe("insufficient");
  });
});
