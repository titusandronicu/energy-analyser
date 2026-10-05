import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { DailyEnergyRow, LiveStateRow } from "@/types";
import { addDays } from "@/lib/format/warsaw-time";
import { expectedPvShare, formatAge, loadDailyRowCapturedAt, loadLiveState, toLiveStateView } from "./live-state";
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
// A KPI series with no data at all: KPI_SERIES_DAYS gaps.
const NULL_DAYS = Array.from({ length: 14 }, () => null);

function view(r: LiveStateRow, clock: Date = now, daily?: DailyEnergyRow[] | null, rowCapturedAt?: string | null) {
  const v = toLiveStateView(r, clock, daily, rowCapturedAt);
  if (v.kind !== "state") throw new Error("expected a state view");
  return v;
}

const PV_EARLY = "Produkcja PV jest oceniana od 15:00, gdy większość dziennej produkcji jest już za nami.";
const HOME_NO_HISTORY = "Brak danych historii, więc nie ma normy zużycia do porównania.";

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
      grid: { value: "1,2 kW", direction: "oddawanie do sieci", watts: -1200 },
      battery: {
        value: "1,4 kW",
        direction: "ładowanie",
        watts: -1370,
        socLabel: "74%",
        socPct: 74,
        chargeLevel: "medium",
        charging: true,
      },
      today: { pv: "12,3 kWh", bought: "1,2 kWh", sold: "5,0 kWh", periodLabel: "dziś od północy do 12:00" },
      balance: { watts: 2570, label: "+2,6 kW", word: "nadwyżka" },
      series: { pv: NULL_DAYS, bought: NULL_DAYS, sold: NULL_DAYS },
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
        pv: { tone: "insufficient", word: "bez oceny", detail: "za wcześnie", explanation: PV_EARLY },
        home: { tone: "insufficient", word: "bez oceny", detail: "brak danych historii", explanation: HOME_NO_HISTORY },
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
    [800, { value: "0,8 kW", direction: "rozładowanie", watts: 800 }, false],
    [-800, { value: "0,8 kW", direction: "ładowanie", watts: -800 }, true],
    [0, { value: "0,0 kW", direction: null, watts: 0 }, false],
    [-20, { value: "0,0 kW", direction: null, watts: -20 }, false],
    [50, { value: "0,1 kW", direction: "rozładowanie", watts: 50 }, false],
    [null, { value: "—", direction: null, watts: null }, false],
  ])("labels battery %j", (battery_w, expected, charging) => {
    expect(view(row({}, { battery_w })).battery).toEqual({
      ...expected,
      socLabel: "74%",
      socPct: 74,
      chargeLevel: "medium",
      charging,
    });
  });

  it.each([
    [-50, true],
    [-49, false],
    [-1370, true],
    [800, false],
    [null, false],
  ])("flags battery charging for %j W: %s", (battery_w, charging) => {
    expect(view(row({}, { battery_w })).battery.charging).toBe(charging);
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
    expect(v.homeLoad).toBe("—");
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
      homeLoad: "—",
      grid: { value: "—", direction: null, watts: null },
      battery: {
        value: "—",
        direction: null,
        watts: null,
        socLabel: "—",
        socPct: null,
        chargeLevel: null,
        charging: false,
      },
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

// Verdicts for PV and consumption. 2026-09-25 (CEST, UTC+2) unless stated; captures are given in UTC.
const DAY = "2026-09-25";

function daily(day: string, fields: Partial<DailyEnergyRow> = {}): DailyEnergyRow {
  return {
    day,
    pv_kwh: null,
    load_kwh: null,
    grid_import_kwh: null,
    grid_export_kwh: null,
    pv_forecast_kwh: null,
    ...fields,
  };
}

// Today's row plus `count` earlier days with a load of 20 kWh, so the norm is 20 kWh a day.
function history(today: Partial<DailyEnergyRow> | null, count = 30, day = DAY): DailyEnergyRow[] {
  const earlier = Array.from({ length: count }, (_, i) => daily(addDays(day, -(i + 1)), { load_kwh: 20 }));
  return today === null ? earlier : [daily(day, today), ...earlier];
}

// The daily row's capture time relative to the snapshot's: `lagMs` earlier (negative: later), or absent.
const sameTime = (captured: Date) => captured.toISOString();
const behind = (lagMs: number) => (captured: Date) => new Date(captured.getTime() - lagMs).toISOString();

// A capture at the given Warsaw time on DAY, read a minute later. By default today's daily row was captured with
// the snapshot; `rowAt` overrides its capture time.
function verdictsAt(
  warsaw: string,
  rows: DailyEnergyRow[] | null | undefined,
  stateOverrides: Record<string, unknown> = {},
  day = DAY,
  rowAt: (captured: Date) => string | null | undefined = sameTime,
) {
  const captured = new Date(`${day}T${warsaw}:00+02:00`);
  return view(
    row({ captured_at: captured.toISOString() }, stateOverrides),
    new Date(captured.getTime() + 60_000),
    rows,
    rowAt(captured),
  ).verdicts;
}

describe("expectedPvShare", () => {
  it("is not rated before 15:00", () => {
    expect(expectedPvShare(9, 14.99)).toBeNull();
  });

  it("starts at the month's 15:00 share (September 0.80)", () => {
    expect(expectedPvShare(9, 15)).toBeCloseTo(0.8, 10);
  });

  it("interpolates linearly up to the done hour (September, 17.9)", () => {
    // Halfway between 15:00 and 17:54 (the done hour 17.9 is 17:54).
    expect(expectedPvShare(9, 16.45)).toBeCloseTo(0.9, 10);
  });

  it("is 1.0 from the done hour on", () => {
    expect(expectedPvShare(9, 17.9)).toBe(1);
    expect(expectedPvShare(9, 22)).toBe(1);
  });

  it("is 1.0 from 15:00 when the day is already done (December, 14.8)", () => {
    expect(expectedPvShare(12, 15)).toBe(1);
    expect(expectedPvShare(12, 14.9)).toBeNull();
  });

  it("uses the June done hour (19.7) late in the day", () => {
    expect(expectedPvShare(6, 19.7)).toBe(1);
    expect(expectedPvShare(6, 19.6)).toBeLessThan(1);
  });
});

describe("PV verdict", () => {
  // September 15:00 expects 0.80 of the forecast: forecast 10 kWh means 8 kWh so far.
  const rows = history({ pv_forecast_kwh: 10 });
  const pv = (kwh: number | null, at15 = "15:00") => verdictsAt(at15, rows, { pv_today_kwh: kwh }).pv;

  it.each([
    [6.8, "good", "85,0% oczekiwanego"],
    [6.79, "watch", "84,9% oczekiwanego"],
    [4.8, "watch", "60,0% oczekiwanego"],
    [4.79, "problem", "59,9% oczekiwanego"],
    [7.52, "good", "94% oczekiwanego"],
    [8, "good", "100% oczekiwanego"],
    [10, "good", "125% oczekiwanego"],
    [0, "problem", "0% oczekiwanego"],
  ])("rates %j kWh at 15:00 as %s (%s)", (kwh, tone, detail) => {
    expect(pv(kwh)).toMatchObject({ tone, detail });
  });

  it("explains the figures in a full sentence", () => {
    expect(pv(7.52).explanation).toBe(
      "Do 15:00 wyprodukowano 7,5 kWh, a wg prognozy na dziś (10,0 kWh) do tej pory powinno być ok. 8,0 kWh, czyli 94% oczekiwanego: od 85% dobrze, 60–85% warto sprawdzić, poniżej 60% problem.",
    );
  });

  it("is not rated at 14:59 but is at 15:00", () => {
    expect(pv(8, "14:59")).toMatchObject({ tone: "insufficient", word: "bez oceny", detail: "za wcześnie" });
    expect(pv(8, "15:00")).toMatchObject({ tone: "good" });
  });

  it("expects more of the forecast later in the day", () => {
    // 16:27 in September expects 0.80 + 0.20 * 1.45 / 2.9 = 0.90 of the forecast, so 9 kWh is exactly on target.
    expect(pv(9, "16:27")).toMatchObject({ tone: "good", detail: "100% oczekiwanego" });
    expect(pv(7.65, "16:27")).toMatchObject({ tone: "good", detail: "85,0% oczekiwanego" });
    expect(pv(7.64, "16:27")).toMatchObject({ tone: "watch" });
  });

  it("expects the whole forecast after the done hour", () => {
    expect(pv(8.5, "18:00")).toMatchObject({ tone: "good", detail: "85,0% oczekiwanego" });
    expect(pv(8.49, "18:00")).toMatchObject({ tone: "watch" });
  });

  it("expects the whole forecast late in a June day (20:00, done 19.7)", () => {
    const june = "2026-06-15";
    const juneRows = history({ pv_forecast_kwh: 10 }, 30, june);
    expect(verdictsAt("20:00", juneRows, { pv_today_kwh: 6 }, june).pv).toMatchObject({
      tone: "watch",
      detail: "60,0% oczekiwanego",
    });
    expect(verdictsAt("20:00", juneRows, { pv_today_kwh: 5.99 }, june).pv).toMatchObject({ tone: "problem" });
  });

  it("expects the whole forecast from 15:00 in December (done hour before 15:00)", () => {
    const december = "2026-12-10";
    // 15:00 CET is UTC+1, so build the clock from UTC directly.
    const captured = new Date("2026-12-10T14:00:00Z");
    const decRows = history({ pv_forecast_kwh: 2 }, 30, december);
    const v = view(
      row({ captured_at: captured.toISOString() }, { pv_today_kwh: 1.7 }),
      new Date(captured.getTime() + 60_000),
      decRows,
    );
    expect(v.verdicts.pv).toMatchObject({ tone: "good", detail: "85,0% oczekiwanego" });
  });

  it("is not rated without today's forecast", () => {
    const noForecast = history({ pv_forecast_kwh: null });
    expect(verdictsAt("16:00", noForecast, { pv_today_kwh: 8 }).pv).toMatchObject({
      tone: "insufficient",
      detail: "brak prognozy",
    });
    expect(verdictsAt("16:00", history({ pv_forecast_kwh: 0 }), { pv_today_kwh: 8 }).pv.detail).toBe("brak prognozy");
  });

  it("is not rated without today's row", () => {
    expect(verdictsAt("16:00", history(null), { pv_today_kwh: 8 }).pv.detail).toBe("brak prognozy");
  });

  it("ignores a row for another day", () => {
    const wrongDay = [daily("2026-09-24", { pv_forecast_kwh: 10 }), daily("2026-09-26", { pv_forecast_kwh: 10 })];
    expect(verdictsAt("16:00", wrongDay, { pv_today_kwh: 8 }).pv.detail).toBe("brak prognozy");
  });

  it("is not rated without pv_today_kwh in the snapshot", () => {
    expect(pv(null)).toMatchObject({ tone: "insufficient", detail: "brak odczytu" });
  });

  it("uses the snapshot's total, not the row's pv_kwh", () => {
    const lagging = history({ pv_forecast_kwh: 10, pv_kwh: 1 });
    expect(verdictsAt("15:00", lagging, { pv_today_kwh: 8 }).pv).toMatchObject({ tone: "good" });
  });

  it("does not depend on the norm: a row with a forecast and too little history still rates", () => {
    expect(verdictsAt("15:00", history({ pv_forecast_kwh: 10 }, 3), { pv_today_kwh: 8 }).pv).toMatchObject({
      tone: "good",
    });
  });

  it.each([undefined, []])("says there is no history for %j rows once it is 15:00", (rows) => {
    expect(verdictsAt("15:00", rows, { pv_today_kwh: 8 }).pv).toMatchObject({
      tone: "insufficient",
      detail: "brak danych historii",
    });
  });

  it("says the history is unavailable when loading it failed (null)", () => {
    const pvVerdict = verdictsAt("15:00", null, { pv_today_kwh: 8 }).pv;
    expect(pvVerdict).toMatchObject({ tone: "insufficient", word: "bez oceny", detail: "historia niedostępna" });
    expect(pvVerdict.explanation).toBe("Nie udało się wczytać historii dziennej, więc ten odczyt nie jest oceniany.");
    expect(verdictsAt("14:59", null, { pv_today_kwh: 8 }).pv.detail).toBe("za wcześnie");
  });

  it("judges the capture's Warsaw day, not today's", () => {
    // Captured 23:50 on the 25th, read on the 26th: the 25th's row and the 25th's clock apply (done hour passed).
    const captured = new Date("2026-09-25T23:50:00+02:00");
    const rows25 = history({ pv_forecast_kwh: 10 });
    const v = view(
      row({ captured_at: captured.toISOString() }, { pv_today_kwh: 9 }),
      new Date("2026-09-25T23:55:00+02:00"),
      rows25,
    );
    expect(v.verdicts.pv).toMatchObject({ tone: "good", detail: "90% oczekiwanego" });
  });
});

describe("consumption verdict", () => {
  // Norm 20 kWh a day; at 12:00 the pro-rated norm is 10 kWh.
  const rows = (load: number | null) => history({ load_kwh: load });
  const home = (load: number | null, at12 = "12:00") => verdictsAt(at12, rows(load), {}).home;

  it.each([
    [10, "good", "0% wobec normy"],
    [11.5, "good", "+15,0% wobec normy"],
    [11.51, "watch", "+15,1% wobec normy"],
    [14, "watch", "+40,0% wobec normy"],
    [14.01, "problem", "+40,1% wobec normy"],
    [12, "watch", "+20% wobec normy"],
    [16, "problem", "+60% wobec normy"],
    [8, "good", "−20% wobec normy"],
    [0, "good", "−100% wobec normy"],
  ])("rates %j kWh at 12:00 as %s (%s)", (load, tone, detail) => {
    expect(home(load)).toMatchObject({ tone, detail });
  });

  it("explains the figures in a full sentence", () => {
    expect(home(12).explanation).toBe(
      "Do 12:00 zużyto 12,0 kWh, a norma dla tej pory dnia to ok. 10,0 kWh (dzienna 20,0 kWh proporcjonalnie do godziny), czyli +20% wobec normy: do +15% dobrze, od +15% do +40% warto sprawdzić, powyżej +40% problem. Mniejsze zużycie nigdy nie jest złe.",
    );
  });

  it("pro-rates the norm by the hours elapsed", () => {
    // 18:00 expects 15 kWh; 17.25 is exactly +15%.
    expect(home(17.25, "18:00")).toMatchObject({ tone: "good", detail: "+15,0% wobec normy" });
    expect(home(17.26, "18:00")).toMatchObject({ tone: "watch" });
  });

  it("is not rated before 06:00 but is at 06:00", () => {
    expect(home(3, "05:59")).toMatchObject({ tone: "insufficient", word: "bez oceny", detail: "za wcześnie" });
    expect(home(5, "06:00")).toMatchObject({ tone: "good", detail: "0% wobec normy" });
  });

  it("is not rated without today's load", () => {
    expect(home(null)).toMatchObject({ tone: "insufficient", detail: "brak odczytu" });
    expect(verdictsAt("12:00", history(null), {}).home.detail).toBe("brak odczytu");
  });

  it("is not rated without a norm (the compared day plus 6 baseline days)", () => {
    expect(verdictsAt("12:00", history({ load_kwh: 12 }, 7), {}).home).toMatchObject({
      tone: "insufficient",
      detail: "za mało danych",
    });
    expect(verdictsAt("12:00", history({ load_kwh: 10 }, 8), {}).home).toMatchObject({ tone: "good" });
  });

  it("ignores a row for another day", () => {
    const wrongDay = history(null).map((r) => r);
    wrongDay.push(daily("2026-09-26", { load_kwh: 10 }));
    expect(verdictsAt("12:00", wrongDay, {}).home.detail).toBe("brak odczytu");
  });

  it.each([undefined, []])("says there is no history for %j rows", (noRows) => {
    expect(verdictsAt("12:00", noRows, {}).home).toMatchObject({
      tone: "insufficient",
      detail: "brak danych historii",
    });
  });

  it("says the history is unavailable when loading it failed (null)", () => {
    const homeVerdict = verdictsAt("12:00", null, {}).home;
    expect(homeVerdict).toMatchObject({ tone: "insufficient", word: "bez oceny", detail: "historia niedostępna" });
    expect(homeVerdict.explanation).toBe("Nie udało się wczytać historii dziennej, więc ten odczyt nie jest oceniany.");
    expect(verdictsAt("05:59", null, {}).home.detail).toBe("za wcześnie");
  });

  describe("age of today's row", () => {
    const MIN = 60_000;
    const homeAt = (rowAt: (captured: Date) => string | null | undefined) =>
      verdictsAt("12:00", rows(10), {}, DAY, rowAt).home;

    it.each([
      ["captured with the snapshot", sameTime],
      ["exactly 15 minutes behind", behind(15 * MIN)],
      ["newer than the snapshot", behind(-2 * MIN)],
    ])("rates a row %s", (_name, rowAt) => {
      expect(homeAt(rowAt)).toMatchObject({ tone: "good", detail: "0% wobec normy" });
    });

    it("does not rate a row 15 minutes and 1 second behind", () => {
      expect(homeAt(behind(15 * MIN + 1000))).toMatchObject({
        tone: "insufficient",
        word: "bez oceny",
        detail: "historia nieaktualna",
      });
    });

    it.each([null, undefined, "not a date"])("does not rate without a usable row time (%j)", (rowAt) => {
      expect(homeAt(() => rowAt)).toMatchObject({
        tone: "insufficient",
        word: "bez oceny",
        detail: "brak czasu historii",
      });
    });

    it("never rates an earlier push's partial total against the new snapshot's time", () => {
      // A 06:00 push stored 5 kWh; a state-only push at 12:00 left it. Norm 20 kWh gives 10 kWh by noon, so
      // reading 5 kWh as consumption to 12:00 would be a false "good" at -50%.
      const v = verdictsAt("12:00", rows(5), {}, DAY, behind(6 * 60 * MIN)).home;
      expect(v).toMatchObject({ tone: "insufficient", detail: "historia nieaktualna" });
      expect(v.tone).not.toBe("good");
    });

    it("keeps the earlier gates first: stale snapshot, early hour and missing history win", () => {
      const captured = new Date("2026-09-25T12:00:00+02:00");
      const stale = view(
        row({ captured_at: captured.toISOString() }),
        new Date(captured.getTime() + 16 * MIN),
        rows(10),
        null,
      );
      expect(stale.verdicts.home.detail).toBe("dane nieaktualne");
      expect(verdictsAt("05:59", rows(3), {}, DAY, () => null).home.detail).toBe("za wcześnie");
      expect(verdictsAt("12:00", [], {}, DAY, () => null).home.detail).toBe("brak danych historii");
    });

    it("leaves PV rating unaffected by the row's age", () => {
      expect(verdictsAt("15:00", history({ pv_forecast_kwh: 10 }), { pv_today_kwh: 8 }, DAY, () => null).pv.tone).toBe(
        "good",
      );
    });
  });
});

describe("stale snapshots", () => {
  it("rate neither PV nor consumption", () => {
    const rows = history({ pv_forecast_kwh: 10, load_kwh: 10 });
    const captured = new Date("2026-09-25T16:00:00+02:00");
    const v = view(
      row({ captured_at: captured.toISOString() }, { pv_today_kwh: 8 }),
      new Date(captured.getTime() + 16 * 60_000),
      rows,
    );
    expect(v.verdicts.pv).toMatchObject({ tone: "insufficient", word: "bez oceny", detail: "dane nieaktualne" });
    expect(v.verdicts.home).toMatchObject({ tone: "insufficient", word: "bez oceny", detail: "dane nieaktualne" });
  });

  it("still rate a degraded but fresh snapshot", () => {
    const rows = history({ pv_forecast_kwh: 10, load_kwh: 10 });
    const v = verdictsAt("16:00", rows, { source_health: "degraded", pv_today_kwh: 9 });
    expect(v.pv.tone).toBe("good");
    expect(v.home.tone).not.toBe("insufficient");
  });
});

describe("system balance", () => {
  const balance = (pv_w: unknown, home_load_w: unknown, clock: Date = now, extra: Record<string, unknown> = {}) =>
    view(row({}, { pv_w, home_load_w, ...extra }), clock).balance;

  it.each([
    [3100, 900, 2200, "+2,2 kW", "nadwyżka"],
    [900, 1300, -400, "\u22120,4 kW", "niedobór"],
    [849, 800, 49, "0,0 kW", "zbilansowany"],
    [800, 849, -49, "0,0 kW", "zbilansowany"],
    [850, 800, 50, "+0,1 kW", "nadwyżka"],
    [800, 850, -50, "\u22120,1 kW", "niedobór"],
    [1200, 1200, 0, "0,0 kW", "zbilansowany"],
  ])("pv %j W minus home load %j W is %j W: %s", (pv, home, watts, label, word) => {
    expect(balance(pv, home)).toEqual({ watts, label, word });
  });

  it("is computed from the unrounded watts", () => {
    // The panel and home figures display as 3,1 and 1,0 kW (difference 2,1), the unrounded 2011 W as 2,0 kW.
    const b = balance(3060, 1049);
    expect(b.label).toBe("+2,0 kW");
    expect(b.watts).toBe(2011);
  });

  it.each([
    ["pv_w missing", null, 900],
    ["home_load_w missing", 3100, null],
    ["both missing", null, null],
    ["pv_w undefined", undefined, 900],
    ["a non-numeric pv_w", "3100", 900],
    ["a non-numeric home_load_w", 3100, "900"],
    ["a NaN reading", Number.NaN, 900],
  ])("shows a dash and no word when %s, never a zero", (_name, pv, home) => {
    expect(balance(pv, home)).toEqual({ watts: null, label: "—", word: null });
  });

  it("is still computed for a stale snapshot", () => {
    const v = view(row({}, { pv_w: 3100, home_load_w: 900 }), at("2026-09-25T10:40:00Z"));
    expect(v.isStale).toBe(true);
    expect(v.balance).toEqual({ watts: 2200, label: "+2,2 kW", word: "nadwyżka" });
  });

  it("is still computed for a degraded snapshot", () => {
    const b = balance(900, 1300, now, { source_health: "degraded" });
    expect(b).toEqual({ watts: -400, label: "\u22120,4 kW", word: "niedobór" });
  });
});

describe("daily series", () => {
  // One row per day from `first` to `last` (inclusive) with pv, purchase and export totals of the day-of-month.
  function totalsRows(first: string, last: string): DailyEnergyRow[] {
    const rows: DailyEnergyRow[] = [];
    for (let key = last; key >= first; key = addDays(key, -1)) {
      const dayOfMonth = Number(key.slice(8));
      rows.push(daily(key, { pv_kwh: dayOfMonth, grid_import_kwh: dayOfMonth + 0.5, grid_export_kwh: 0 }));
    }
    return rows;
  }

  it("ends the day before the capture day and never plots the capture day's own row", () => {
    // Captured on the 25th; the 25th's row is a partial (99) and must stay out.
    const rows = [
      daily(DAY, { pv_kwh: 99, grid_import_kwh: 99, grid_export_kwh: 99 }),
      ...totalsRows("2026-09-01", "2026-09-24"),
    ];
    const { series } = view(row(), now, rows);
    expect(series).toEqual({
      pv: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
      bought: [11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5, 20.5, 21.5, 22.5, 23.5, 24.5],
      sold: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("ends the day before the capture day even when the snapshot was captured on an earlier day than now", () => {
    // Captured on the 23rd, read on the 25th: the window ends on the 22nd, not on the day before `now`.
    const captured = new Date("2026-09-23T10:00:00Z");
    const v = view(row({ captured_at: captured.toISOString() }), now, totalsRows("2026-09-01", "2026-09-24"));
    expect(v.series?.pv).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it("draws gaps for missing days and null totals, never zeros", () => {
    const rows = [
      daily("2026-09-24", { pv_kwh: 5 }),
      daily("2026-09-22", { pv_kwh: null, grid_import_kwh: 1 }),
      daily("2026-09-21", { pv_kwh: 4 }),
    ];
    const { series } = view(row(), now, rows);
    expect(series?.pv).toEqual([...NULL_DAYS.slice(0, 10), 4, null, null, 5]);
    expect(series?.bought).toEqual([...NULL_DAYS.slice(0, 11), 1, null, null]);
  });

  it("gives 14 gaps per series for empty or absent history", () => {
    const expected = { pv: NULL_DAYS, bought: NULL_DAYS, sold: NULL_DAYS };
    expect(view(row(), now, []).series).toEqual(expected);
    expect(view(row(), now, undefined).series).toEqual(expected);
  });

  it("has no series when loading the history failed, while the chips still say the history is unavailable", () => {
    const v = verdictsAt("16:00", null, { pv_today_kwh: 8 });
    expect(v.pv.detail).toBe("historia niedostępna");
    expect(v.home.detail).toBe("historia niedostępna");
    const captured = new Date(`${DAY}T16:00:00+02:00`);
    const failed = view(row({ captured_at: captured.toISOString() }), new Date(captured.getTime() + 60_000), null);
    expect(failed.series).toBeNull();
  });
});

describe("loaders", () => {
  // Records the arguments of the query chain and resolves with the given result.
  function mockClient(result: { data: unknown[] | null; error: { message: string } | null }) {
    const calls: Record<string, unknown[]> = {};
    const chain = {
      from: (...args: unknown[]) => ((calls.from = args), chain),
      select: (...args: unknown[]) => ((calls.select = args), chain),
      eq: (...args: unknown[]) => ((calls.eq = args), chain),
      limit: (...args: unknown[]) => ((calls.limit = args), chain),
      overrideTypes: () => Promise.resolve(result),
    };
    return { client: chain as unknown as SupabaseClient, calls };
  }

  describe("loadLiveState", () => {
    it("reads the newest snapshot from the live_state view", async () => {
      const snapshot = row();
      const { client, calls } = mockClient({ data: [snapshot], error: null });
      await expect(loadLiveState(client)).resolves.toBe(snapshot);
      expect(calls.from).toEqual(["live_state"]);
      expect(calls.select).toEqual(["captured_at, received_at, state"]);
      expect(calls.limit).toEqual([1]);
    });

    it("returns null when there is no snapshot", async () => {
      const { client } = mockClient({ data: [], error: null });
      await expect(loadLiveState(client)).resolves.toBeNull();
    });

    it("throws on a load error", async () => {
      const { client } = mockClient({ data: null, error: { message: "permission denied" } });
      await expect(loadLiveState(client)).rejects.toThrow("loading live state failed: permission denied");
    });

    it("keeps the Postgres code and details as the error's cause", async () => {
      const original = { message: "permission denied", code: "42501", details: "no grant" };
      const { client } = mockClient({ data: null, error: original });
      await expect(loadLiveState(client)).rejects.toMatchObject({ cause: original });
    });
  });

  describe("loadDailyRowCapturedAt", () => {
    it("reads when the day's row was captured", async () => {
      const { client, calls } = mockClient({ data: [{ captured_at: "2026-09-25T10:00:00Z" }], error: null });
      await expect(loadDailyRowCapturedAt(client, "2026-09-25")).resolves.toBe("2026-09-25T10:00:00Z");
      expect(calls.from).toEqual(["daily_energy"]);
      expect(calls.select).toEqual(["captured_at"]);
      expect(calls.eq).toEqual(["day", "2026-09-25"]);
      expect(calls.limit).toEqual([1]);
    });

    it("returns null when the day has no row", async () => {
      const { client } = mockClient({ data: [], error: null });
      await expect(loadDailyRowCapturedAt(client, "2026-09-25")).resolves.toBeNull();
    });

    it("throws on a load error", async () => {
      const { client } = mockClient({ data: null, error: { message: "column grant missing" } });
      await expect(loadDailyRowCapturedAt(client, "2026-09-25")).rejects.toThrow(
        "loading daily row time failed: column grant missing",
      );
    });
  });
});

describe("expected PV share table", () => {
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))("has a usable curve for month %j", (month) => {
    const start = expectedPvShare(month, 15);
    const later = expectedPvShare(month, 16);
    expect(start).toBeGreaterThan(0.5);
    expect(start).toBeLessThanOrEqual(1);
    // Never falls during the afternoon, and is the whole day's PV by the evening.
    expect(later).toBeGreaterThanOrEqual(start ?? Number.NaN);
    expect(expectedPvShare(month, 23)).toBe(1);
  });
});

describe("battery level label", () => {
  it.each([
    [29.4, "29%"],
    [29.9, "30%"],
    [74.5, "75%"],
  ])("shows %j as a whole percent (%s)", (battery_soc_pct, label) => {
    expect(view(row({}, { battery_soc_pct })).battery.socLabel).toBe(label);
  });
});

describe("verdict explanations", () => {
  const STALE = at("2026-09-25T10:15:01Z");
  const staleVerdicts = () => view(row(), STALE, history({ pv_forecast_kwh: 10, load_kwh: 5 }), sameTime(now)).verdicts;

  it("explains a stale snapshot for each node", () => {
    const v = staleVerdicts();
    expect(v.battery.explanation).toBe("Migawka jest nieaktualna, więc poziom naładowania nie jest oceniany.");
    expect(v.pv.explanation).toBe("Migawka jest nieaktualna, więc ten odczyt nie jest oceniany.");
    expect(v.home.explanation).toBe("Migawka jest nieaktualna, więc ten odczyt nie jest oceniany.");
  });

  it("explains an unrated PV verdict", () => {
    const noForecast = verdictsAt("15:00", history({ pv_forecast_kwh: null })).pv;
    expect(noForecast).toMatchObject({ detail: "brak prognozy" });
    expect(noForecast.explanation).toBe("Brak prognozy produkcji na dziś, więc produkcja PV nie jest oceniana.");

    const noReading = verdictsAt("15:00", history({ pv_forecast_kwh: 10 }), { pv_today_kwh: null }).pv;
    expect(noReading).toMatchObject({ detail: "brak odczytu" });
    expect(noReading.explanation).toBe("Brak odczytu dzisiejszej produkcji, więc produkcja PV nie jest oceniana.");

    const noHistory = verdictsAt("15:00", []).pv;
    expect(noHistory).toMatchObject({ detail: "brak danych historii" });
    expect(noHistory.explanation).toBe("Brak danych historii, więc nie ma prognozy na dziś do porównania.");
  });

  it("explains an unrated consumption verdict", () => {
    const early = verdictsAt("05:59", history({ load_kwh: 1 })).home;
    expect(early.explanation).toBe(
      "Zużycie domu jest oceniane od 06:00, gdy dzienne zużycie ma już z czym się porównać.",
    );

    const noTime = verdictsAt("12:00", history({ load_kwh: 10 }), {}, DAY, () => null).home;
    expect(noTime.explanation).toBe(
      "Nie wiadomo, z kiedy pochodzi dzisiejsze zużycie w historii, więc zużycie domu nie jest oceniane.",
    );

    const old = verdictsAt("12:00", history({ load_kwh: 10 }), {}, DAY, behind(16 * 60_000)).home;
    expect(old.explanation).toBe(
      "Dzisiejsze zużycie w historii pochodzi z wcześniejszego odczytu niż ta migawka, więc zużycie domu nie jest oceniane.",
    );

    const noLoad = verdictsAt("12:00", history({ load_kwh: null })).home;
    expect(noLoad.explanation).toBe("Brak dzisiejszego zużycia, więc zużycie domu nie jest oceniane.");
  });

  it("does not rate consumption against a norm of zero", () => {
    // Every earlier day used nothing, so the norm is 0 and a ratio against it would be meaningless.
    const zeroNorm = [daily(DAY, { load_kwh: 5 }), ...history(null).map((d) => ({ ...d, load_kwh: 0 }))];
    const v = verdictsAt("12:00", zeroNorm).home;
    expect(v).toMatchObject({ tone: "insufficient", detail: "za mało danych" });
    expect(v.explanation).toBe(
      "Za mało dni z historii, by wyznaczyć normę zużycia, więc zużycie domu nie jest oceniane.",
    );
  });
});

describe("PV share label just below a line", () => {
  // September 15:00 expects 8 kWh of a 10 kWh forecast. A share that rounds up to the line while still under it must
  // read one tenth below, so the number never contradicts the badge.
  const pv = (kwh: number) => verdictsAt("15:00", history({ pv_forecast_kwh: 10 }), { pv_today_kwh: kwh }).pv;

  it("reads 84,9% for a share of 84,96%, which is still worth watching", () => {
    expect(pv(6.7968)).toMatchObject({ tone: "watch", detail: "84,9% oczekiwanego" });
  });

  it("reads 59,9% for a share of 59,96%, which is still a problem", () => {
    expect(pv(4.7968)).toMatchObject({ tone: "problem", detail: "59,9% oczekiwanego" });
  });
});
