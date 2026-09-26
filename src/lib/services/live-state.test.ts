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
    expect(toLiveStateView(null, now)).toEqual({
      kind: "empty",
      status: { tone: "insufficient", label: "laboratorium jeszcze nic nie przesłało" },
    });
  });

  it("builds the Polish card for a fresh snapshot", () => {
    expect(toLiveStateView(row(), now)).toEqual({
      kind: "state",
      status: { tone: "good", label: "aktualne" },
      capturedAtLabel: "25 września 2026, 12:00",
      ageLabel: "5 min",
      isStale: false,
      isDegraded: false,
      pv: "3,4 kW",
      homeLoad: "0,9 kW",
      grid: { value: "1,2 kW", direction: "oddawanie do sieci" },
      battery: { value: "1,4 kW", direction: "ładowanie", socLabel: "74%" },
      today: { pv: "12,3 kWh", bought: "1,2 kWh", sold: "5,0 kWh", periodLabel: "dziś od północy do 12:00" },
    });
  });

  it("is not stale at exactly 15 minutes", () => {
    expect(view(row(), at("2026-09-25T10:15:00Z")).isStale).toBe(false);
  });

  it("is stale at 15 minutes and 1 second", () => {
    expect(view(row(), at("2026-09-25T10:15:01Z")).isStale).toBe(true);
  });

  it.each([
    ["2026-09-25T10:15:00Z", { tone: "good", label: "aktualne" }],
    ["2026-09-25T10:15:01Z", { tone: "watch", label: "dane sprzed 15 min" }],
    ["2026-09-25T12:00:00Z", { tone: "watch", label: "dane sprzed 2 godz." }],
    ["2026-09-25T12:00:01Z", { tone: "problem", label: "brak nowych danych od 2 godz." }],
    ["2026-09-27T10:00:00Z", { tone: "problem", label: "brak nowych danych od 2 dni" }],
  ])("rates a snapshot captured at 10:00 UTC, seen at %s, as %j", (clock, status) => {
    expect(view(row(), at(clock)).status).toEqual(status);
  });

  it("rates a fresh but degraded snapshot as worth watching", () => {
    expect(view(row({}, { source_health: "degraded" })).status).toEqual({
      tone: "watch",
      label: "niepełne dane z Home Assistant",
    });
  });

  it("lets staleness win over a degraded source", () => {
    const degraded = row({}, { source_health: "degraded" });
    expect(view(degraded, at("2026-09-25T10:40:00Z")).status).toEqual({ tone: "watch", label: "dane sprzed 40 min" });
    expect(view(degraded, at("2026-09-25T13:00:00Z")).status).toEqual({
      tone: "problem",
      label: "brak nowych danych od 3 godz.",
    });
  });

  it("states the today period up to the Warsaw capture time", () => {
    // 22:05 UTC is 00:05 on 26 September in Warsaw (CEST); 07:30 UTC in winter (CET) is 08:30.
    expect(view(row({ captured_at: "2026-09-25T22:05:00Z" }), at("2026-09-25T22:06:00Z")).today.periodLabel).toBe(
      "dziś od północy do 00:05",
    );
    expect(view(row({ captured_at: "2026-12-10T07:30:00Z" }), at("2026-12-10T07:31:00Z")).today.periodLabel).toBe(
      "dziś od północy do 08:30",
    );
  });

  it("names the capture day when the snapshot is from an earlier Warsaw day", () => {
    // 21:50 UTC is 23:50 on 25 September in Warsaw; read at 00:10 on the 26th.
    expect(view(row({ captured_at: "2026-09-25T21:50:00Z" }), at("2026-09-25T22:10:00Z")).today.periodLabel).toBe(
      "25 września od północy do 23:50",
    );
  });

  it.each([
    [1500, { value: "1,5 kW", direction: "pobór z sieci" }],
    [-1500, { value: "1,5 kW", direction: "oddawanie do sieci" }],
    [0, { value: "0,0 kW", direction: null }],
    [30, { value: "0,0 kW", direction: null }],
    [-49, { value: "0,0 kW", direction: null }],
    [-50, { value: "0,1 kW", direction: "oddawanie do sieci" }],
    [null, { value: "—", direction: null }],
  ])("labels grid %j", (grid_w, expected) => {
    expect(view(row({}, { grid_w })).grid).toEqual(expected);
  });

  it.each([
    [800, { value: "0,8 kW", direction: "rozładowanie" }],
    [-800, { value: "0,8 kW", direction: "ładowanie" }],
    [0, { value: "0,0 kW", direction: null }],
    [-20, { value: "0,0 kW", direction: null }],
    [50, { value: "0,1 kW", direction: "rozładowanie" }],
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
    expect(v.today).toMatchObject({ pv: "—", bought: "—", sold: "—" });
  });

  it.each([null, "text", 42, [], [1, 2]])("renders dashes for malformed state %j", (malformed) => {
    const v = view(row({ state: malformed }));
    expect(v).toMatchObject({
      isDegraded: false,
      pv: "—",
      homeLoad: "—",
      grid: { value: "—", direction: null },
      battery: { value: "—", direction: null, socLabel: "—" },
      today: { pv: "—", bought: "—", sold: "—", periodLabel: "dziś od północy do 12:00" },
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
