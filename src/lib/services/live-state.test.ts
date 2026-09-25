import { describe, expect, it } from "vitest";
import type { LiveStateRow } from "@/types";
import { formatAge, toLiveStateView } from "./live-state";

const state = {
  pv_w: 3420,
  home_load_w: 850,
  grid_w: -1200,
  battery_w: -1370,
  battery_soc_pct: 74,
  pv_today_kwh: 12.34,
  grid_import_today_kwh: 1.2,
  grid_export_today_kwh: 5,
  source_health: "ok",
};

function row(overrides: Partial<LiveStateRow> = {}, stateOverrides: Record<string, unknown> = {}): LiveStateRow {
  return {
    captured_at: "2026-09-25T10:00:00Z",
    received_at: "2026-09-25T10:00:02Z",
    state: { ...state, ...stateOverrides },
    ...overrides,
  };
}

// Warsaw is UTC+2 in late September (CEST).
const at = (iso: string) => new Date(iso);
const now = at("2026-09-25T10:05:00Z");

function view(r: LiveStateRow, clock: Date = now) {
  const v = toLiveStateView(r, clock);
  if (v.kind !== "state") throw new Error("expected a state view");
  return v;
}

describe("toLiveStateView", () => {
  it("returns the empty state without a row", () => {
    expect(toLiveStateView(null, now)).toEqual({ kind: "empty" });
  });

  it("builds the Polish card for a fresh snapshot", () => {
    expect(toLiveStateView(row(), now)).toEqual({
      kind: "state",
      capturedAtLabel: "25 września 2026, 12:00",
      ageLabel: "5 min",
      isStale: false,
      isDegraded: false,
      pv: "3,4 kW",
      homeLoad: "0,9 kW",
      grid: { value: "1,2 kW", direction: "oddawanie do sieci" },
      battery: { value: "1,4 kW", direction: "ładowanie", socLabel: "74%" },
      today: { pv: "12,3 kWh", bought: "1,2 kWh", sold: "5,0 kWh" },
    });
  });

  it("is not stale at exactly 15 minutes", () => {
    expect(view(row(), at("2026-09-25T10:15:00Z")).isStale).toBe(false);
  });

  it("is stale at 15 minutes and 1 second", () => {
    expect(view(row(), at("2026-09-25T10:15:01Z")).isStale).toBe(true);
  });

  it.each([
    [1500, { value: "1,5 kW", direction: "pobór z sieci" }],
    [-1500, { value: "1,5 kW", direction: "oddawanie do sieci" }],
    [0, { value: "0,0 kW", direction: null }],
    [null, { value: "—", direction: null }],
  ])("labels grid %j", (grid_w, expected) => {
    expect(view(row({}, { grid_w })).grid).toEqual(expected);
  });

  it.each([
    [800, { value: "0,8 kW", direction: "rozładowanie" }],
    [-800, { value: "0,8 kW", direction: "ładowanie" }],
    [0, { value: "0,0 kW", direction: null }],
    [null, { value: "—", direction: null }],
  ])("labels battery %j", (battery_w, expected) => {
    expect(view(row({}, { battery_w })).battery).toEqual({ ...expected, socLabel: "74%" });
  });

  it.each([
    ["degraded", true],
    ["ok", false],
    [null, false],
  ])("marks source_health %j as degraded: %s", (source_health, degraded) => {
    expect(view(row({}, { source_health })).isDegraded).toBe(degraded);
  });

  it("shows a dash for missing or non-numeric values", () => {
    const v = view(
      row(
        {},
        {
          pv_w: null,
          home_load_w: "850",
          battery_soc_pct: null,
          pv_today_kwh: null,
          grid_import_today_kwh: "1",
          grid_export_today_kwh: Number.NaN,
        },
      ),
    );
    expect(v.pv).toBe("—");
    expect(v.homeLoad).toBe("—");
    expect(v.battery.socLabel).toBe("—");
    expect(v.today).toEqual({ pv: "—", bought: "—", sold: "—" });
  });

  it.each([null, "text", 42, [], [1, 2]])("renders dashes for malformed state %j", (malformed) => {
    const v = view(row({ state: malformed }));
    expect(v).toMatchObject({
      isDegraded: false,
      pv: "—",
      homeLoad: "—",
      grid: { value: "—", direction: null },
      battery: { value: "—", direction: null, socLabel: "—" },
      today: { pv: "—", bought: "—", sold: "—" },
    });
    expect(v.capturedAtLabel).toBe("25 września 2026, 12:00");
  });
});

describe("formatAge", () => {
  const MIN = 60 * 1000;

  it.each([
    [0, "0 min"],
    [5 * MIN, "5 min"],
    [59 * MIN + 59_000, "59 min"],
    [60 * MIN, "1 godz."],
    [2 * 60 * MIN + 30 * MIN, "2 godz."],
    [24 * 60 * MIN - 1, "23 godz."],
    [24 * 60 * MIN, "1 dzień"],
    [3 * 24 * 60 * MIN + 5 * MIN, "3 dni"],
    [-5 * MIN, "0 min"],
  ])("formats %i ms as %s", (ms, label) => {
    expect(formatAge(ms)).toBe(label);
  });

  it("feeds the age label from the capture time", () => {
    expect(view(row(), at("2026-09-25T12:30:00Z")).ageLabel).toBe("2 godz.");
    expect(view(row(), at("2026-09-28T10:00:00Z")).ageLabel).toBe("3 dni");
  });
});
