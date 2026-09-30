import { describe, expect, it } from "vitest";
import type { DailyEnergyRow, RecommendationRow } from "@/types";
import { addDays } from "@/lib/format/warsaw-time";
import {
  BEFORE_HISTORY,
  BEFORE_MORNING,
  buildDayView,
  buildMonthView,
  buildQuarterView,
  capitalize,
  completeDaysText,
  dayCellName,
  dayCellWord,
  defaultPeriodFromRows,
  defaultPeriodRange,
  FORECAST_EXPLANATION,
  FORECAST_NOT_COLLECTED,
  FORECAST_TOO_FEW,
  forecastDaysText,
  GRID_IMPORT_EXPLANATION,
  GRID_IMPORT_OVERSTATED_FROM,
  GRID_IMPORT_TERM,
  HISTORY_START_NOTE,
  INCOMPLETE_DAY,
  MARKERS_INCOMPLETE,
  MONTH_CHART_NOTE,
  MONTH_NOT_RATED,
  NO_DAY_DATA,
  NO_FORECAST,
  NO_RECOMMENDATION,
  QUARTER_CHART_NOTE,
  quarterChartMonths,
  RATING_EXPLANATION,
  RATING_TERM,
  ratedPeriodRange,
  SELF_SUFFICIENCY_EXPLANATION,
  sentence,
  TOO_FEW_EXPLANATION,
  type DayCell,
  type MonthView,
} from "./calendar-view";
import { isCompleteDay } from "./complete-day";
import { DAY_NO_USE, notRated, rowsNeededFrom } from "./period-rating";

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

describe("defaultPeriodFromRows", () => {
  it("reads the previous and the current month, and the 14 days before them for the rating", () => {
    expect(defaultPeriodRange("2026-09-30")).toEqual({ first: "2026-07-18", last: "2026-09-30" });
    expect(defaultPeriodRange("2026-01-05")).toEqual({ first: "2025-11-17", last: "2026-01-31" });
    // Whichever month it picks, the read reaches 14 days before that month's first day.
    expect(defaultPeriodRange("2026-09-30").first <= rowsNeededFrom("2026-08-01")).toBe(true);
    expect(defaultPeriodRange("2026-09-30").first <= rowsNeededFrom("2026-09-01")).toBe(true);
  });

  it("opens the current month once it has 7 complete days", () => {
    const read = [...rows("2026-08-01", 31), ...rows("2026-09-01", 7)];
    expect(defaultPeriodFromRows(read, "2026-09-08")).toEqual({ kind: "month", month: "2026-09" });
  });

  it("opens the previous month below 7 complete days, whatever the previous month holds", () => {
    // Six complete days, an empty one, and today's partial row, which never counts.
    const read = [
      ...rows("2026-08-01", 31),
      ...rows("2026-09-01", 8, (day) => (day === "2026-09-04" ? { pv_kwh: null } : {})),
    ];
    expect(defaultPeriodFromRows(read, "2026-09-08")).toEqual({ kind: "month", month: "2026-08" });
    expect(defaultPeriodFromRows([], "2026-09-08")).toEqual({ kind: "month", month: "2026-08" });
  });

  it("never opens a month before July 2026", () => {
    expect(defaultPeriodFromRows(rows("2026-07-16", 3), "2026-07-19")).toEqual({ kind: "month", month: "2026-07" });
    expect(defaultPeriodFromRows(rows("2026-07-16", 16), "2026-08-02")).toEqual({ kind: "month", month: "2026-07" });
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
    expect([view.note, view.summary]).toEqual([null, null]);
    expect(view.rating).toEqual(notRated(MONTH_NOT_RATED));
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
    const view = buildDayView("2026-09-27", [row("2026-09-27", { pv_forecast_kwh: 12 })], [], todayKey, now);
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
    expect([view.note, view.summary]).toEqual([null, null]);
    // Only the day's own row was read, so its norm has no days.
    expect(view.rating).toMatchObject({ kind: "insufficient", word: "Za mało danych: 0 z 7" });
  });

  it("says why a missing or empty day has no totals", () => {
    expect(buildDayView("2026-09-14", [], [], todayKey, now).totals).toEqual({ kind: "none", reason: NO_DAY_DATA });
    const empty = buildDayView("2026-09-13", [row("2026-09-13", { load_kwh: null })], [], todayKey, now);
    expect(empty.totals).toEqual({ kind: "none", reason: INCOMPLETE_DAY });
    expect(NO_DAY_DATA).toBe("brak danych z tego dnia");
    expect(INCOMPLETE_DAY).toBe("dane z tego dnia są niepełne");
  });

  it("ignores a row for another day", () => {
    expect(buildDayView("2026-09-14", [row("2026-09-15")], [], todayKey, now).totals.kind).toBe("none");
  });

  it("marks today as in progress with running totals", () => {
    const view = buildDayView(
      todayKey,
      [row(todayKey, { pv_kwh: 3, load_kwh: null, pv_forecast_kwh: 12 })],
      [],
      todayKey,
      now,
    );
    expect(view.inProgress).toBe(true);
    expect(view.totals).toMatchObject({ kind: "totals", running: true, pvLabel: "3,0 kWh", loadLabel: "—" });
    expect(view.forecast).toMatchObject({ kind: "comparison", running: true, actualKwh: 3 });
  });

  it("says the forecast was not collected before 27 September, and when a later day has none", () => {
    const early = buildDayView("2026-09-26", [row("2026-09-26", { pv_forecast_kwh: 20 })], [], todayKey, now);
    expect(early.forecast).toEqual({ kind: "none", reason: FORECAST_NOT_COLLECTED });
    const none = buildDayView("2026-09-28", [row("2026-09-28")], [], todayKey, now);
    expect(none.forecast).toEqual({ kind: "none", reason: NO_FORECAST });
    expect(buildDayView("2026-09-28", [], [], todayKey, now).forecast).toEqual({ kind: "none", reason: NO_FORECAST });
  });

  it("picks the first recommendation from 06:00 Warsaw and keeps the others in time order", () => {
    // 04:10 UTC is 06:10 in Warsaw; 03:50 UTC is 05:50.
    const recs = [rec("2026-09-27T10:00:00Z"), rec("2026-09-27T04:10:00Z"), rec("2026-09-27T03:50:00Z")];
    const view = buildDayView("2026-09-27", [row("2026-09-27")], recs, todayKey, now);
    if (view.advice.kind !== "advice") throw new Error("expected advice");
    expect(view.advice.main.text).toBe("2026-09-27T04:10:00Z");
    expect(view.advice.mainNote).toBeNull();
    expect(view.advice.others.map((o) => o.text)).toEqual(["2026-09-27T03:50:00Z", "2026-09-27T10:00:00Z"]);
  });

  it("falls back to the day's first recommendation when all came before 06:00", () => {
    const recs = [rec("2026-09-27T03:00:00Z"), rec("2026-09-26T22:30:00Z")];
    const view = buildDayView("2026-09-27", [row("2026-09-27")], recs, todayKey, now);
    if (view.advice.kind !== "advice") throw new Error("expected advice");
    expect(view.advice.main.text).toBe("2026-09-26T22:30:00Z");
    expect(view.advice.mainNote).toBe(BEFORE_MORNING);
    expect(view.advice.others.map((o) => o.text)).toEqual(["2026-09-27T03:00:00Z"]);
  });

  it("maps advice through the historical view", () => {
    const view = buildDayView("2026-09-27", [row("2026-09-27")], [rec("2026-09-27T12:00:00Z")], todayKey, now);
    if (view.advice.kind !== "advice") throw new Error("expected advice");
    expect(view.advice.main.status).toEqual({ tone: "insufficient", label: "z 27 września, 14:00" });
    expect(view.advice.main.isStale).toBe(false);
    expect(view.advice.main.findings[0].tone).toBe("watch");
  });

  it("leaves out recommendations from other Warsaw days and says when there is none", () => {
    // 22:30 UTC on the 27th is 00:30 on the 28th in Warsaw.
    const view = buildDayView("2026-09-27", [row("2026-09-27")], [rec("2026-09-27T22:30:00Z")], todayKey, now);
    expect(view.advice).toEqual({ kind: "none", reason: NO_RECOMMENDATION });
  });
});

describe("ratings in the views", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  // Fourteen norm days before September at 75% (import 5 of use 20), then September at the same share.
  const norm = rows(rowsNeededFrom("2026-09-01"), 14);

  it("reads the day or month and the 14 days before it", () => {
    expect(ratedPeriodRange({ kind: "month", month: "2026-09" })).toEqual({ first: "2026-08-18", last: "2026-09-30" });
    expect(ratedPeriodRange({ kind: "day", day: "2026-09-11" })).toEqual({ first: "2026-08-28", last: "2026-09-11" });
  });

  it("leaves the month's totals, grid, charts and forecast unchanged by the norm days read before it", () => {
    const own = buildMonthView("2026-09", september, noTimes, "2026-09-30");
    const widened = buildMonthView("2026-09", [...norm, ...september], noTimes, "2026-09-30");
    expect(widened.totals).toEqual(own.totals);
    expect(widened.grid).toEqual(own.grid);
    expect(widened.series).toEqual(own.series);
    expect(widened.forecast).toEqual(own.forecast);
    expect(widened.unfinishedNote).toEqual(own.unfinishedNote);
  });

  it("rates a completed month from the widened rows", () => {
    const view = buildMonthView("2026-09", [...norm, ...rows("2026-09-01", 30)], noTimes, "2026-10-05");
    expect(view.totals).toMatchObject({ kind: "totals", completeDays: 30 });
    expect(view.rating).toMatchObject({ kind: "rated", band: "neutral", word: "Przeciętny miesiąc", days: 30 });
  });

  it("says the current month is not rated yet", () => {
    const view = buildMonthView("2026-09", [...norm, ...september], noTimes, "2026-09-30");
    expect(view.rating).toEqual(notRated(MONTH_NOT_RATED));
    expect(sentence(MONTH_NOT_RATED)).toBe("Miesiąc jeszcze trwa — oceniamy tylko zakończone miesiące.");
  });

  it("rates a past day against the 14 days before it, keeping the totals to the day's own row", () => {
    const day = row("2026-09-01", { grid_import_kwh: 1 });
    const view = buildDayView("2026-09-01", [...norm, day], [], "2026-10-05", now);
    expect(view.totals).toMatchObject({ kind: "totals", importKwh: 1 });
    // 95% against a norm of 75%: 20 points above.
    expect(view.rating).toMatchObject({ kind: "rated", band: "good", word: "Dobry dzień", days: 14 });
  });

  it("shows no rating for today, a later day, or a day whose totals already say it is missing or incomplete", () => {
    const history = [...norm, ...rows("2026-09-01", 5)];
    expect(buildDayView("2026-09-05", history, [], "2026-09-05", now).rating).toBeNull();
    expect(buildDayView("2026-09-10", [], [], "2026-10-05", now).rating).toBeNull();
    expect(
      buildDayView("2026-09-06", [...history, row("2026-09-06", { load_kwh: null })], [], "2026-10-05", now).rating,
    ).toBeNull();
  });

  it("says why a day with no house use is not rated", () => {
    const view = buildDayView(
      "2026-09-01",
      [...norm, row("2026-09-01", { load_kwh: 0, grid_import_kwh: 0 })],
      [],
      "2026-10-05",
      now,
    );
    expect(view.rating).toEqual(notRated(DAY_NO_USE));
  });

  it("names an inconsistent day", () => {
    const view = buildDayView(
      "2026-09-01",
      [...norm, row("2026-09-01", { grid_import_kwh: 25 })],
      [],
      "2026-10-05",
      now,
    );
    expect(view.rating).toMatchObject({ kind: "inconsistent", word: "Poza oceną" });
  });

  it("never rates the quarter", () => {
    expect(buildQuarterView(2026, 3, [...norm, ...rows("2026-09-01", 30)], "2026-10-05").rating).toBeNull();
  });
});

describe("history start and display helpers", () => {
  it("notes the history start in July 2026 and its quarter only", () => {
    expect(buildMonthView("2026-07", [], noTimes, "2026-09-30").startNote).toBe(HISTORY_START_NOTE);
    expect(HISTORY_START_NOTE).toBe("Dane od 16 lipca 2026 — wcześniejszych dni aplikacja nie ma");
    expect(buildMonthView("2026-08", [], noTimes, "2026-09-30").startNote).toBeNull();
    expect(buildQuarterView(2026, 3, [], "2026-09-30").startNote).toBe(HISTORY_START_NOTE);
    expect(buildQuarterView(2026, 4, [], "2026-10-10").startNote).toBeNull();
  });

  it("names grid days with their status, the history start and a recommendation", () => {
    const view = buildMonthView(
      "2026-07",
      rows("2026-07-16", 3),
      { times: ["2026-07-17T08:00:00Z"], truncated: false },
      "2026-07-20",
    );
    const byDay = new Map(cells(view).map((cell) => [cell.day, cell]));
    const name = (day: string) => {
      const cell = byDay.get(day);
      if (cell === undefined) throw new Error(day);
      return dayCellName(cell);
    };
    expect(name("2026-07-15")).toBe("15 lipca, przed początkiem historii");
    expect(name("2026-07-17")).toBe("17 lipca, dane pełne, jest rekomendacja");
    expect(name("2026-07-19")).toBe("19 lipca, brak danych");
    expect(name("2026-07-20")).toBe("20 lipca, dziś, dzień jeszcze trwa");
    expect(name("2026-07-21")).toBe("21 lipca, jeszcze nie nadszedł");
    const empty = buildMonthView("2026-09", september, noTimes, "2026-09-30");
    const cell = cells(empty).find((c) => c.day === "2026-09-13");
    expect(cell && dayCellWord(cell)).toBe("dane niepełne");
  });

  it("words the day counts", () => {
    expect(completeDaysText(18, 30)).toBe("Pełne dane: 18 z 30 dni");
    expect(forecastDaysText(3, 7)).toBe("3 z 7 potrzebnych dni z prognozą");
  });

  it("maps quarter months to chart groups with gaps for months without totals", () => {
    const view = buildQuarterView(2026, 3, [...rows("2026-07-26", 6), ...rows("2026-08-01", 31)], today());
    expect(quarterChartMonths(view)).toEqual([
      { label: "lipiec 2026", pv: null, load: null, import: null, completeDays: 6, calendarDays: 31 },
      { label: "sierpień 2026", pv: 310, load: 620, import: 155, completeDays: 31, calendarDays: 31 },
      { label: "wrzesień 2026", pv: null, load: null, import: null, completeDays: 0, calendarDays: 30 },
    ]);
    const before = buildQuarterView(2026, 2, [], today());
    expect(quarterChartMonths(before).map((m) => [m.pv, m.completeDays, m.calendarDays])).toEqual([
      [null, 0, 30],
      [null, 0, 31],
      [null, 0, 30],
    ]);
  });
});

describe("history copy", () => {
  it("states the rule values from their constants", () => {
    expect(GRID_IMPORT_OVERSTATED_FROM).toBe("2026-08-04");
    expect(MONTH_CHART_NOTE).toBe(
      "Dni bez danych zostają puste, a dzisiejszy dzień nie jest rysowany, bo jeszcze trwa. Prąd kupiony z sieci jest od 4 sierpnia zawyżony (zobacz „Co to znaczy?”).",
    );
    expect(QUARTER_CHART_NOTE).toBe(
      "Miesiąc z mniej niż 7 pełnymi dniami zostaje pusty. Prąd kupiony z sieci jest od 4 sierpnia zawyżony.",
    );
    expect(TOO_FEW_EXPLANATION).toBe(
      "Gdy okres ma mniej niż 7 pełnych dni, sumy nie są pokazywane, bo mówiłyby więcej, niż wiadomo. Niedokończony miesiąc albo kwartał pokazuje to, co już jest, bez przeliczania na całość.",
    );
    expect(GRID_IMPORT_TERM).toBe("Prąd kupiony z sieci od 4 sierpnia");
    expect(GRID_IMPORT_EXPLANATION).toBe(
      "Od 4 sierpnia 2026 falownik pokazuje więcej prądu kupionego z sieci, niż naprawdę było, zwłaszcza w dzień. Najpewniej to sprawa czujnika prądu, do sprawdzenia na miejscu. Do tego czasu te liczby są zawyżone.",
    );
    expect(SELF_SUFFICIENCY_EXPLANATION).toBe(
      "Jaka część zużycia domu nie była kupiona z sieci, tylko przyszła z paneli albo z baterii. 100% to dzień bez prądu z sieci, 0% to dzień, w którym cały prąd był kupiony.",
    );
    expect(RATING_TERM).toBe("Ocena dnia i miesiąca");
    expect(RATING_EXPLANATION).toBe(
      "Dzień jest porównywany z normą domu: medianą samowystarczalności z pełnych dni wśród 14 dni przed nim. Norma potrzebuje co najmniej 7 takich dni, inaczej dzień nie jest oceniany. Więcej niż 10 punktów procentowych powyżej normy to dobry dzień, więcej niż 10 poniżej to słaby, a wszystko pomiędzy to przeciętny. Zakończony miesiąc jest oceniany tak samo, po medianie odchyleń swoich ocenionych dni. Samowystarczalność idzie głównie za słońcem, więc słoneczne dni wypadają lepiej, a pochmurne gorzej; gdy panele dały mniej niż 70% tego, co zwykle, ocena mówi „Mało słońca”. Zawyżony od 4 sierpnia prąd kupiony z sieci obniża samowystarczalność wszystkich dni podobnie, a dzień jest porównywany z dniami tuż przed nim, więc ocena mało się przez to zmienia. Dni, w których z sieci kupiono więcej, niż dom zużył (np. ładowanie baterii z sieci albo błąd licznika), są „Poza oceną”: nie są oceniane ani liczone do norm.",
    );
    expect(FORECAST_EXPLANATION).toBe(
      "Porównanie prognozy produkcji z tym, co panele naprawdę dały. Prognozy zapisujemy od 27 września 2026, więc wcześniejsze dni nie mają porównania.",
    );
  });

  it("capitalizes a label and ends a sentence with one full stop", () => {
    expect(capitalize(NO_DAY_DATA)).toBe("Brak danych z tego dnia");
    expect(sentence(MARKERS_INCOMPLETE)).toBe("Znaczniki rekomendacji mogą być niepełne.");
    expect(sentence(HISTORY_START_NOTE)).toBe("Dane od 16 lipca 2026 — wcześniejszych dni aplikacja nie ma.");
  });
});
