import { describe, expect, it } from "vitest";
import type { DailyEnergyRow, RecommendationRow } from "@/types";
import { addDays } from "@/lib/format/warsaw-time";
import {
  BEFORE_HISTORY,
  BEFORE_MORNING,
  buildDayView,
  buildMonthView,
  buildQuarterView,
  FORECAST_NOT_COLLECTED,
  FORECAST_TOO_FEW,
  INCOMPLETE_DAY,
  isCompleteDay,
  MARKERS_INCOMPLETE,
  NO_DAY_DATA,
  NO_FORECAST,
  NO_RECOMMENDATION,
  type DayCell,
  type MonthView,
} from "./calendar-view";

// All data here is synthetic. The repository is public, so no test uses the owner's real figures; only the shape of
// the production history (which days are missing or empty) is copied.

function row(day: string, overrides: Partial<DailyEnergyRow> = {}): DailyEnergyRow {
  return { day, pv_kwh: 10, load_kwh: 20, grid_import_kwh: 5, grid_export_kwh: 0, pv_forecast_kwh: null, ...overrides };
}

// `count` consecutive days from `first`, each a complete row unless shaped otherwise.
function rows(first: string, count: number, shape: (day: string) => Partial<DailyEnergyRow> = () => ({})) {
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(first, i);
    return row(day, shape(day));
  });
}

const noTimes = { times: [], truncated: false };

// A day well after every fixture period.
function today() {
  return "2026-12-01";
}

function cells(view: MonthView): DayCell[] {
  return view.grid.flat().filter((cell): cell is DayCell => cell !== null);
}

function statusOf(view: MonthView, day: string) {
  return cells(view).find((cell) => cell.day === day)?.status;
}

// September 2026 as production held it on 30 September: missing 14–18 and 22–24, null totals on 13, 19 and 21,
// forecasts on 26–30 (26 untrusted), today's partial row on 30.
const MISSING_SEPT = ["14", "15", "16", "17", "18", "22", "23", "24"].map((d) => `2026-09-${d}`);
const EMPTY_SEPT = ["13", "19", "21"].map((d) => `2026-09-${d}`);
const september = rows("2026-09-01", 30, (day) => ({
  pv_forecast_kwh: day >= "2026-09-26" ? 12 : null,
  ...(EMPTY_SEPT.includes(day) ? { load_kwh: null } : {}),
  ...(day === "2026-09-30" ? { pv_kwh: 3, load_kwh: 4, grid_import_kwh: 1 } : {}),
})).filter((r) => !MISSING_SEPT.includes(r.day));

describe("isCompleteDay", () => {
  it("needs PV, house use and grid import before today", () => {
    expect(isCompleteDay(row("2026-09-29"), "2026-09-30")).toBe(true);
    expect(isCompleteDay(row("2026-09-29", { grid_import_kwh: null }), "2026-09-30")).toBe(false);
    expect(isCompleteDay(row("2026-09-29", { pv_kwh: -1 }), "2026-09-30")).toBe(false);
    // Export and forecast do not matter.
    expect(isCompleteDay(row("2026-09-29", { grid_export_kwh: null }), "2026-09-30")).toBe(true);
    expect(isCompleteDay(undefined, "2026-09-30")).toBe(false);
  });

  it("never counts today or a later day", () => {
    expect(isCompleteDay(row("2026-09-30"), "2026-09-30")).toBe(false);
    expect(isCompleteDay(row("2026-10-01"), "2026-09-30")).toBe(false);
  });
});

describe("buildMonthView", () => {
  it("reports September's missing and empty days and totals over its 18 complete days", () => {
    const view = buildMonthView("2026-09", september, noTimes, "2026-09-30");
    expect(view.label).toBe("wrzesień 2026");
    for (const day of MISSING_SEPT) expect(statusOf(view, day)).toBe("missing");
    for (const day of EMPTY_SEPT) expect(statusOf(view, day)).toBe("empty");
    expect(statusOf(view, "2026-09-30")).toBe("today");
    expect(cells(view).filter((c) => c.status === "complete")).toHaveLength(18);
    expect(view.totals).toEqual({
      kind: "totals",
      totals: {
        pvKwh: 180,
        loadKwh: 360,
        importKwh: 90,
        pvLabel: "180,0 kWh",
        loadLabel: "360,0 kWh",
        importLabel: "90,0 kWh",
      },
      completeDays: 18,
      calendarDays: 30,
      periodLabel: "18 dni: 1–29 września",
      unfinished: true,
    });
    expect(view.unfinishedNote).toBe("Miesiąc jeszcze trwa — liczą się tylko pełne dni, bez szacowania całości");
  });

  it("compares forecast against actual only from 27 September, and says too few below 7 days", () => {
    const view = buildMonthView("2026-09", september, noTimes, "2026-09-30");
    // 27–29 September: three days, today not counted and 26 September untrusted.
    expect(view.forecast).toEqual({ kind: "insufficient", days: 3, needed: 7, reason: FORECAST_TOO_FEW });
    expect(FORECAST_TOO_FEW).toBe("za mało danych — prognozy zbierane od 27 września");
  });

  it("sums the forecast over trusted complete days once there are 7", () => {
    const october = rows("2026-10-01", 9, (day) => ({
      pv_forecast_kwh: day === "2026-10-05" ? null : 8,
      ...(day === "2026-10-03" ? { load_kwh: null } : {}),
    }));
    const view = buildMonthView("2026-10", october, noTimes, "2026-10-10");
    // Nine days, minus the empty 3rd and the forecast-less 5th.
    expect(view.forecast).toEqual({
      kind: "comparison",
      forecastKwh: 56,
      actualKwh: 70,
      forecastLabel: "56,0 kWh",
      actualLabel: "70,0 kWh",
      days: 7,
      periodLabel: "7 dni: 1–9 października",
    });
  });

  it("ignores forecasts before 27 September even on complete days", () => {
    const view = buildMonthView(
      "2026-08",
      rows("2026-08-01", 31, () => ({ pv_forecast_kwh: 5 })),
      noTimes,
      today(),
    );
    expect(view.forecast.kind).toBe("insufficient");
    expect(view.forecast.kind === "insufficient" && view.forecast.days).toBe(0);
  });

  it.each([
    [6, "insufficient"],
    [7, "totals"],
  ])("needs 7 complete days: %i gives %s", (count, kind) => {
    const view = buildMonthView("2026-08", rows("2026-08-01", count), noTimes, "2026-09-30");
    expect(view.totals.kind).toBe(kind);
    if (view.totals.kind === "insufficient") {
      expect(view.totals).toEqual({
        kind: "insufficient",
        completeDays: 6,
        needed: 7,
        calendarDays: 31,
        unfinished: false,
        reason: "za mało danych: 6 z 7 potrzebnych pełnych dni",
      });
    } else {
      expect(view.totals.completeDays).toBe(7);
      expect(view.unfinishedNote).toBeNull();
    }
  });

  it("never counts today or future days, even with full rows", () => {
    // Six complete past days plus full rows for today and the next two days.
    const view = buildMonthView("2026-10", rows("2026-10-01", 9), noTimes, "2026-10-07");
    expect(view.totals.kind).toBe("insufficient");
    expect(view.totals.completeDays).toBe(6);
    expect(statusOf(view, "2026-10-07")).toBe("today");
    expect(statusOf(view, "2026-10-08")).toBe("future");
    expect(statusOf(view, "2026-10-31")).toBe("future");
  });

  it("leaves today and later days as gaps in the daily series", () => {
    const view = buildMonthView("2026-09", september, noTimes, "2026-09-30");
    expect(view.series.pv).toHaveLength(30);
    expect(view.series.pv[29]).toBeNull();
    expect(view.series.pv[28]).toBe(10);
    // A missing day is a gap, an empty day keeps the totals it has.
    expect(view.series.pv[13]).toBeNull();
    expect(view.series.load[12]).toBeNull();
    expect(view.series.pv[12]).toBe(10);
    expect(view.series.import[0]).toBe(5);
  });

  it("ignores rows outside the month", () => {
    const view = buildMonthView("2026-08", [...rows("2026-07-25", 7), ...rows("2026-09-01", 7)], noTimes, today());
    expect(view.totals.completeDays).toBe(0);
    expect(view.series.pv.every((v) => v === null)).toBe(true);
  });

  it("marks days with a recommendation by the Warsaw day", () => {
    const view = buildMonthView(
      "2026-09",
      september,
      // 23:30 Warsaw on the 26th is still the 26th; 22:10 UTC on the 27th is 00:10 on the 28th.
      { times: ["2026-09-26T21:30:00Z", "2026-09-27T22:10:00Z"], truncated: false },
      "2026-09-30",
    );
    expect(
      cells(view)
        .filter((c) => c.hasRecommendation)
        .map((c) => c.day),
    ).toEqual(["2026-09-26", "2026-09-28"]);
    expect(view.markersNote).toBeNull();
  });

  it("says the markers may be incomplete when the times were truncated", () => {
    const view = buildMonthView("2026-09", september, { times: [], truncated: true }, "2026-09-30");
    expect(view.markersNote).toBe(MARKERS_INCOMPLETE);
  });

  it("lays the month out Monday first and reserves the later slices' slots", () => {
    const view = buildMonthView("2026-11", [], noTimes, "2026-11-10");
    expect(view.grid[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(view.grid[0][6]).toEqual({ day: "2026-11-01", status: "missing", hasRecommendation: false });
    expect([view.rating, view.note, view.summary]).toEqual([null, null, null]);
  });
});

describe("buildQuarterView", () => {
  it("shows Q3 2026 from 16 July", () => {
    const history = [...rows("2026-07-16", 16), ...rows("2026-08-01", 31), ...september];
    const view = buildQuarterView(2026, 3, history, "2026-09-30");
    expect(view.label).toBe("III kwartał 2026");
    expect(view.months.map((m) => [m.label, m.kind === "month" ? m.totals.completeDays : m.kind])).toEqual([
      ["lipiec 2026", 16],
      ["sierpień 2026", 31],
      ["wrzesień 2026", 18],
    ]);
    const july = view.months[0];
    expect(july.kind === "month" && july.totals.kind === "totals" && july.totals.periodLabel).toBe(
      "16 dni: 16–31 lipca",
    );
    expect(view.totals).toMatchObject({
      kind: "totals",
      completeDays: 65,
      calendarDays: 92,
      periodLabel: "65 dni: 16 lipca – 29 września",
      unfinished: true,
    });
    expect(view.totals.kind === "totals" && view.totals.totals.pvLabel).toBe("650,0 kWh");
    expect(view.unfinishedNote).toBe("Kwartał jeszcze trwa — liczą się tylko pełne dni, bez szacowania całości");
  });

  it("applies the 7-day minimum per month", () => {
    const view = buildQuarterView(2026, 3, [...rows("2026-07-26", 6), ...rows("2026-08-01", 31)], today());
    expect(view.months[0].kind === "month" && view.months[0].totals.kind).toBe("insufficient");
    expect(view.months[1].kind === "month" && view.months[1].totals.kind).toBe("totals");
    expect(view.totals).toMatchObject({ kind: "totals", completeDays: 37, unfinished: false });
    expect(view.unfinishedNote).toBeNull();
  });

  it("shows months before 16 July 2026 as no data", () => {
    const view = buildQuarterView(2026, 2, [], today());
    expect(view.months).toEqual([
      { kind: "before-history", month: "2026-04", label: "kwiecień 2026", reason: BEFORE_HISTORY },
      { kind: "before-history", month: "2026-05", label: "maj 2026", reason: BEFORE_HISTORY },
      { kind: "before-history", month: "2026-06", label: "czerwiec 2026", reason: BEFORE_HISTORY },
    ]);
    expect(view.totals.kind).toBe("insufficient");
    expect([view.rating, view.note, view.summary]).toEqual([null, null, null]);
  });

  it("counts an unfinished quarter's later months as having no complete days", () => {
    const view = buildQuarterView(2026, 4, rows("2026-10-01", 10), "2026-10-10");
    expect(view.months.map((m) => m.kind === "month" && m.totals.completeDays)).toEqual([9, 0, 0]);
    expect(view.totals).toMatchObject({ kind: "totals", completeDays: 9, unfinished: true });
  });
});

function rec(generated_at: string, text = generated_at): RecommendationRow {
  return {
    generated_at,
    language: "pl",
    text,
    provider: "ollama",
    model: "m",
    forecast: { today_kwh: 12, tomorrow_kwh: 9 },
    facts: { local_findings: [{ fact: "F", severity: "warn" }] },
  };
}

describe("buildDayView", () => {
  const now = new Date("2026-09-30T10:00:00Z");
  const todayKey = "2026-09-30";

  it("shows a complete past day's totals", () => {
    const view = buildDayView("2026-09-27", row("2026-09-27", { pv_forecast_kwh: 12 }), [], todayKey, now);
    expect(view.label).toBe("27 września 2026, niedziela");
    expect(view.inProgress).toBe(false);
    expect(view.totals).toEqual({
      kind: "totals",
      running: false,
      pvKwh: 10,
      loadKwh: 20,
      importKwh: 5,
      pvLabel: "10,0 kWh",
      loadLabel: "20,0 kWh",
      importLabel: "5,0 kWh",
    });
    expect(view.forecast).toEqual({
      kind: "comparison",
      running: false,
      forecastKwh: 12,
      actualKwh: 10,
      forecastLabel: "12,0 kWh",
      actualLabel: "10,0 kWh",
    });
    expect([view.rating, view.note, view.summary]).toEqual([null, null, null]);
  });

  it("says why a missing or empty day has no totals", () => {
    expect(buildDayView("2026-09-14", null, [], todayKey, now).totals).toEqual({ kind: "none", reason: NO_DAY_DATA });
    const empty = buildDayView("2026-09-13", row("2026-09-13", { load_kwh: null }), [], todayKey, now);
    expect(empty.totals).toEqual({ kind: "none", reason: INCOMPLETE_DAY });
    expect(NO_DAY_DATA).toBe("brak danych z tego dnia");
    expect(INCOMPLETE_DAY).toBe("dane z tego dnia są niepełne");
  });

  it("ignores a row for another day", () => {
    expect(buildDayView("2026-09-14", row("2026-09-15"), [], todayKey, now).totals.kind).toBe("none");
  });

  it("marks today as in progress with running totals", () => {
    const view = buildDayView(
      todayKey,
      row(todayKey, { pv_kwh: 3, load_kwh: null, pv_forecast_kwh: 12 }),
      [],
      todayKey,
      now,
    );
    expect(view.inProgress).toBe(true);
    expect(view.totals).toMatchObject({ kind: "totals", running: true, pvLabel: "3,0 kWh", loadLabel: "—" });
    expect(view.forecast).toMatchObject({ kind: "comparison", running: true, actualKwh: 3 });
  });

  it("says the forecast was not collected before 27 September, and when a later day has none", () => {
    const early = buildDayView("2026-09-26", row("2026-09-26", { pv_forecast_kwh: 20 }), [], todayKey, now);
    expect(early.forecast).toEqual({ kind: "none", reason: FORECAST_NOT_COLLECTED });
    const none = buildDayView("2026-09-28", row("2026-09-28"), [], todayKey, now);
    expect(none.forecast).toEqual({ kind: "none", reason: NO_FORECAST });
    expect(buildDayView("2026-09-28", null, [], todayKey, now).forecast).toEqual({ kind: "none", reason: NO_FORECAST });
  });

  it("picks the first recommendation from 06:00 Warsaw and keeps the others in time order", () => {
    // 04:10 UTC is 06:10 in Warsaw; 03:50 UTC is 05:50.
    const recs = [rec("2026-09-27T10:00:00Z"), rec("2026-09-27T04:10:00Z"), rec("2026-09-27T03:50:00Z")];
    const view = buildDayView("2026-09-27", row("2026-09-27"), recs, todayKey, now);
    if (view.advice.kind !== "advice") throw new Error("expected advice");
    expect(view.advice.main.text).toBe("2026-09-27T04:10:00Z");
    expect(view.advice.mainNote).toBeNull();
    expect(view.advice.others.map((o) => o.text)).toEqual(["2026-09-27T03:50:00Z", "2026-09-27T10:00:00Z"]);
  });

  it("falls back to the day's first recommendation when all came before 06:00", () => {
    const recs = [rec("2026-09-27T03:00:00Z"), rec("2026-09-26T22:30:00Z")];
    const view = buildDayView("2026-09-27", row("2026-09-27"), recs, todayKey, now);
    if (view.advice.kind !== "advice") throw new Error("expected advice");
    expect(view.advice.main.text).toBe("2026-09-26T22:30:00Z");
    expect(view.advice.mainNote).toBe(BEFORE_MORNING);
    expect(view.advice.others.map((o) => o.text)).toEqual(["2026-09-27T03:00:00Z"]);
  });

  it("maps advice through the historical view", () => {
    const view = buildDayView("2026-09-27", row("2026-09-27"), [rec("2026-09-27T12:00:00Z")], todayKey, now);
    if (view.advice.kind !== "advice") throw new Error("expected advice");
    expect(view.advice.main.status).toEqual({ tone: "insufficient", label: "z 27 września, 14:00" });
    expect(view.advice.main.isStale).toBe(false);
    expect(view.advice.main.findings[0].tone).toBe("watch");
  });

  it("leaves out recommendations from other Warsaw days and says when there is none", () => {
    // 22:30 UTC on the 27th is 00:30 on the 28th in Warsaw.
    const view = buildDayView("2026-09-27", row("2026-09-27"), [rec("2026-09-27T22:30:00Z")], todayKey, now);
    expect(view.advice).toEqual({ kind: "none", reason: NO_RECOMMENDATION });
  });
});
