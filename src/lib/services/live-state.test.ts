import { describe, expect, it } from "vitest";
import type { LiveStateRow } from "@/types";
import { formatAge, toLiveStateView } from "./live-state";
import type { BatteryChargeLevel } from "./live-state";

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
      pvWatts: 3420,
      homeLoad: "0,9 kW",
      homeLoadWatts: 850,
      grid: { value: "1,2 kW", direction: "oddawanie do sieci", watts: -1200 },
      battery: {
        value: "1,4 kW",
        direction: "ładowanie",
        watts: -1370,
        socLabel: "74%",
        socPct: 74,
        chargeLevel: "medium",
      },
      today: { pv: "12,3 kWh", bought: "1,2 kWh", sold: "5,0 kWh", periodLabel: "dziś od północy do 12:00" },
      flows: {
        pv: { watts: 3420, moving: true },
        home: { watts: 850, moving: true },
        grid: { watts: -1200, moving: true },
        battery: { watts: -1370, moving: true },
      },
      verdicts: {
        battery: {
          tone: "good",
          word: "dobrze",
          detail: "w normie",
          explanation:
            "Poziom naładowania 74%: od 30% w górę to dobrze, 10–30% warto sprawdzić, poniżej 10% problem. 100% nigdy nie jest złe.",
        },
        pv: null,
        home: null,
      },
    });
  });

  it.each([
    [50, true],
    [-50, true],
    [49, false],
    [-49, false],
    [0, false],
    [null, false],
  ])("moves a fresh flow of %j W: %s", (w, moving) => {
    const v = view(row({}, { pv_w: w, home_load_w: w, grid_w: w, battery_w: w }));
    expect(v.flows).toEqual({
      pv: { watts: w, moving },
      home: { watts: w, moving },
      grid: { watts: w, moving },
      battery: { watts: w, moving },
    });
  });

  it("moves no flow when the snapshot is stale, whatever the watts", () => {
    const v = view(row(), at("2026-09-25T10:15:01Z"));
    expect(v.flows.pv).toEqual({ watts: 3420, moving: false });
    expect(v.flows.home.moving).toBe(false);
    expect(v.flows.grid.moving).toBe(false);
    expect(v.flows.battery.moving).toBe(false);
  });

  it("still moves flows for a degraded but fresh snapshot", () => {
    const v = view(row({}, { source_health: "degraded" }));
    expect(v.flows.pv.moving).toBe(true);
    expect(v.flows.battery.moving).toBe(true);
  });

  it.each([
    [100, "good", "dobrze", "wysoki poziom"],
    [80, "good", "dobrze", "wysoki poziom"],
    [79.9, "good", "dobrze", "wysoki poziom"],
    [79.4, "good", "dobrze", "w normie"],
    [30, "good", "dobrze", "w normie"],
    [29.9, "good", "dobrze", "w normie"],
    [29.5, "good", "dobrze", "w normie"],
    [29.4, "watch", "warto sprawdzić", "niski poziom"],
    [10, "watch", "warto sprawdzić", "niski poziom"],
    [9.9, "watch", "warto sprawdzić", "niski poziom"],
    [9.4, "problem", "problem", "prawie pusta"],
    [0, "problem", "problem", "prawie pusta"],
    [null, "insufficient", "bez oceny", "brak odczytu"],
  ])("rates battery_soc_pct %j as %s (%s, %s)", (battery_soc_pct, tone, word, detail) => {
    const verdict = view(row({}, { battery_soc_pct })).verdicts.battery;
    expect(verdict).toMatchObject({ tone, word, detail });
    expect(verdict.explanation).toMatch(/\.$/);
  });

  it("explains the battery thresholds in the verdict sentence", () => {
    expect(view(row({}, { battery_soc_pct: 100 })).verdicts.battery.explanation).toBe(
      "Poziom naładowania 100%: od 30% w górę to dobrze, 10–30% warto sprawdzić, poniżej 10% problem. 100% nigdy nie jest złe.",
    );
  });

  it("does not rate the battery when the snapshot is stale", () => {
    expect(view(row(), at("2026-09-25T10:15:01Z")).verdicts.battery).toMatchObject({
      tone: "insufficient",
      word: "bez oceny",
      detail: "dane nieaktualne",
    });
  });

  it("leaves pv and home unrated", () => {
    const { verdicts } = view(row());
    expect(verdicts.pv).toBeNull();
    expect(verdicts.home).toBeNull();
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
    [1500, { value: "1,5 kW", direction: "pobór z sieci", watts: 1500 }],
    [-1500, { value: "1,5 kW", direction: "oddawanie do sieci", watts: -1500 }],
    [0, { value: "0,0 kW", direction: null, watts: 0 }],
    [30, { value: "0,0 kW", direction: null, watts: 30 }],
    [-49, { value: "0,0 kW", direction: null, watts: -49 }],
    [-50, { value: "0,1 kW", direction: "oddawanie do sieci", watts: -50 }],
    [null, { value: "—", direction: null, watts: null }],
  ])("labels grid %j", (grid_w, expected) => {
    expect(view(row({}, { grid_w })).grid).toEqual(expected);
  });

  it.each([
    [800, { value: "0,8 kW", direction: "rozładowanie", watts: 800 }],
    [-800, { value: "0,8 kW", direction: "ładowanie", watts: -800 }],
    [0, { value: "0,0 kW", direction: null, watts: 0 }],
    [-20, { value: "0,0 kW", direction: null, watts: -20 }],
    [50, { value: "0,1 kW", direction: "rozładowanie", watts: 50 }],
    [null, { value: "—", direction: null, watts: null }],
  ])("labels battery %j", (battery_w, expected) => {
    expect(view(row({}, { battery_w })).battery).toEqual({
      ...expected,
      socLabel: "74%",
      socPct: 74,
      chargeLevel: "medium",
    });
  });

  it.each([
    [79, "medium"],
    [80, "full"],
    [29, "low"],
    [30, "medium"],
    [9, "warning"],
    [10, "low"],
    [79.9, "full"],
    [29.9, "medium"],
    [9.9, "low"],
    [null, null],
  ])("charges battery_soc_pct %j as level %j", (battery_soc_pct, chargeLevel) => {
    expect(view(row({}, { battery_soc_pct })).battery.chargeLevel).toBe(chargeLevel as BatteryChargeLevel | null);
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
    expect(v.pvWatts).toBeNull();
    expect(v.homeLoad).toBe("—");
    expect(v.homeLoadWatts).toBeNull();
    expect(v.battery.socLabel).toBe("—");
    expect(v.battery.socPct).toBeNull();
    expect(v.battery.chargeLevel).toBeNull();
    expect(v.today).toMatchObject({ pv: "—", bought: "—", sold: "—" });
  });

  it.each([null, "text", 42, [], [1, 2]])("renders dashes for malformed state %j", (malformed) => {
    const v = view(row({ state: malformed }));
    expect(v).toMatchObject({
      isDegraded: false,
      pv: "—",
      pvWatts: null,
      homeLoad: "—",
      homeLoadWatts: null,
      grid: { value: "—", direction: null, watts: null },
      battery: { value: "—", direction: null, watts: null, socLabel: "—", socPct: null, chargeLevel: null },
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
