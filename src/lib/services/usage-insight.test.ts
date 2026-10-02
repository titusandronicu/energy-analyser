import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { DailyEnergyRow } from "@/types";
import { addDays } from "@/lib/format/warsaw-time";
import { dailyLoadNorm, deltaLabel, HISTORY_DAYS, loadDailyEnergy, median, toUsageInsightView } from "./usage-insight";

// 12:00 in Warsaw (CEST) on 25 September 2026: today is 2026-09-25, yesterday 2026-09-24.
const now = new Date("2026-09-25T10:00:00Z");
const TODAY = "2026-09-25";
const YESTERDAY = "2026-09-24";

function row(day: string, load_kwh: number | null, grid_import_kwh: number | null = null): DailyEnergyRow {
  return { day, pv_kwh: null, load_kwh, grid_import_kwh, grid_export_kwh: null, pv_forecast_kwh: null };
}

// `count` consecutive days ending the day before `before`, all with the same load and purchase.
function daysBefore(before: string, count: number, load: number | null, purchase: number | null = null) {
  return Array.from({ length: count }, (_, i) => row(addDays(before, -(i + 1)), load, purchase));
}

// The ±14-day seasonal window around `anchor` (29 days), all with the same load and purchase.
function seasonalWindow(anchor: string, load: number, purchase: number | null = null, count = 29) {
  return Array.from({ length: count }, (_, i) => row(addDays(anchor, i - 14), load, purchase));
}

function insight(rows: DailyEnergyRow[], clock: Date = now) {
  const v = toUsageInsightView(rows, clock);
  if (v.kind !== "insight") throw new Error("expected an insight view");
  return v;
}

describe("toUsageInsightView", () => {
  it("compares yesterday against the fallback baseline", () => {
    const rows = [row(YESTERDAY, 12.34, 4), ...daysBefore(YESTERDAY, 30, 10, 5)];
    expect(toUsageInsightView(rows, now)).toEqual({
      kind: "insight",
      status: { tone: "watch", label: "powyżej normy" },
      dayLabel: "24 września",
      isYesterday: true,
      load: { kwhLabel: "12,3 kWh", deltaLabel: "+23%", status: "above" },
      purchase: { kwhLabel: "4,0 kWh", deltaLabel: "−20%" },
      series: { load: [10, 10, 10, 10, 10, 10, 12.34], purchase: [5, 5, 5, 5, 5, 5, 4] },
      baseline: {
        kind: "fallback",
        days: 30,
        periodLabel: "30 dni: 25 sierpnia – 23 września",
        crossesSensorChange: false,
      },
      meaning: {
        normKwhLabel: "10,0 kWh",
        band: "high",
        ranges: [
          { band: "low", name: "Niskie", label: "poniżej 8,5 kWh" },
          { band: "normal", name: "W normie", label: "8,5–11,5 kWh" },
          { band: "high", name: "Wysokie", label: "11,5–14,0 kWh" },
          { band: "very_high", name: "Bardzo wysokie", label: "powyżej 14,0 kWh" },
        ],
        verdictSentence: "To więcej niż zwykle (+23% wobec normy).",
        referenceSentence:
          "Dla porównania: typowy dom w Polsce o powierzchni ok. 140 m² ogrzewany pompą ciepła zużywa we wrześniu ok. 13 kWh dziennie (szacunek z danych GUS i branżowych).",
      },
    });
  });

  it("ends the series on the compared day, so the last point is the value shown", () => {
    const rows = [row(TODAY, 50, 9), row(YESTERDAY, 12, 4), ...daysBefore(YESTERDAY, 30, 10, 5)];
    const v = insight(rows);
    expect(v.series.load).toHaveLength(7);
    expect(v.series.purchase).toHaveLength(7);
    expect(v.series.load.at(-1)).toBe(12);
    expect(v.series.purchase.at(-1)).toBe(4);
    // Today's partial row is never in the window.
    expect(v.series.load).not.toContain(50);
  });

  it("ends the series three days back when yesterday and the day before are missing", () => {
    const compared = "2026-09-22";
    const rows = [row(compared, 11, 3), ...daysBefore(compared, 30, 10, 5)];
    const v = insight(rows);
    expect(v.dayLabel).toBe("22 września");
    expect(v.series.load).toEqual([10, 10, 10, 10, 10, 10, 11]);
    expect(v.series.purchase).toEqual([5, 5, 5, 5, 5, 5, 3]);
  });

  it("leaves a trailing gap when the compared day has no purchase", () => {
    const rows = [row(YESTERDAY, 12, null), ...daysBefore(YESTERDAY, 30, 10, 5)];
    const v = insight(rows);
    expect(v.purchase.kwhLabel).toBe("—");
    expect(v.series.purchase).toEqual([5, 5, 5, 5, 5, 5, null]);
    expect(v.series.load.at(-1)).toBe(12);
  });

  // Corrupt data: the series treats a negative daily total as a gap ("negative is null") while the figure beside it
  // is still shown. The two intentionally differ; this pins the corner (impl review F5, behaviour accepted).
  it("draws a gap for a negative load on the compared day while the shown load stays unchanged", () => {
    const rows = [row(YESTERDAY, -2, 4), ...daysBefore(YESTERDAY, 30, 10, 5)];
    const v = insight(rows);
    expect(v.load.kwhLabel).toBe("-2,0 kWh");
    expect(v.series.load).toEqual([10, 10, 10, 10, 10, 10, null]);
    expect(v.series.load.at(-1)).toBeNull();
    expect(v.series.purchase.at(-1)).toBe(4);
  });

  it("uses the latest earlier day when yesterday is missing and names it", () => {
    const rows = [row(YESTERDAY, null), row("2026-09-22", 10), ...daysBefore("2026-09-22", 10, 10)];
    const v = insight(rows);
    expect(v.isYesterday).toBe(false);
    expect(v.dayLabel).toBe("22 września");
    expect(v.baseline).toMatchObject({ kind: "fallback", days: 10 });
  });

  it("takes yesterday from the Warsaw date just after midnight", () => {
    // 22:30 UTC on 24 September is 00:30 on 25 September in Warsaw (CEST): yesterday is 24 September.
    const justAfterMidnight = new Date("2026-09-24T22:30:00Z");
    const rows = [row(TODAY, 50), row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 7, 10)];
    const v = insight(rows, justAfterMidnight);
    expect(v.isYesterday).toBe(true);
    expect(v.dayLabel).toBe("24 września");
    expect(v.load.deltaLabel).toBe("0%");
  });

  it("uses a day exactly 7 days back", () => {
    const rows = [row("2026-09-18", 10), ...daysBefore("2026-09-18", 10, 10)];
    expect(insight(rows).dayLabel).toBe("18 września");
  });

  it("is insufficient without a load in the last 7 days", () => {
    const expected = {
      kind: "insufficient",
      status: { tone: "insufficient", label: "" },
      reason: "brak zużycia z ostatnich 7 dni",
    };
    expect(toUsageInsightView([row("2026-09-17", 10), ...daysBefore("2026-09-17", 30, 10)], now)).toEqual(expected);
    expect(toUsageInsightView([], now)).toEqual(expected);
  });

  it("never compares today", () => {
    const rows = [row(TODAY, 50), row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 10, 10)];
    const v = insight(rows);
    expect(v.dayLabel).toBe("24 września");
    expect(v.load.status).toBe("normal");
    expect(toUsageInsightView([row(TODAY, 50), ...daysBefore(TODAY, 30, null)], now).kind).toBe("insufficient");
  });

  it("chooses the seasonal baseline with at least 20 year-ago days", () => {
    const rows = [row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 30, 30), ...seasonalWindow("2025-09-24", 10, null, 20)];
    const v = insight(rows);
    expect(v.baseline).toMatchObject({ kind: "seasonal", days: 20 });
    expect(v.load).toEqual({ kwhLabel: "10,0 kWh", deltaLabel: "0%", status: "normal" });
  });

  it("covers ±14 days around the month-day, but not 15", () => {
    const rows = [
      row(YESTERDAY, 10),
      ...seasonalWindow("2025-09-24", 10),
      row("2025-09-09", 1000),
      row("2025-10-09", 1000),
    ];
    const v = insight(rows);
    expect(v.baseline).toMatchObject({ kind: "seasonal", days: 29 });
    expect(v.load.status).toBe("normal");
  });

  it("falls back to the last 30 days with fewer than 20 year-ago days", () => {
    const rows = [
      row(YESTERDAY, 10),
      ...daysBefore(YESTERDAY, 30, 10),
      ...seasonalWindow("2025-09-24", 1000, null, 19),
    ];
    const v = insight(rows);
    expect(v.baseline).toMatchObject({ kind: "fallback", days: 30 });
    expect(v.load.status).toBe("normal");
  });

  it("uses only the 30 days before the compared day for the fallback", () => {
    const rows = [row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 30, 10), row(addDays(YESTERDAY, -31), 1000)];
    expect(insight(rows).baseline).toMatchObject({ kind: "fallback", days: 30 });
  });

  it("is insufficient with fewer than 7 fallback days", () => {
    expect(toUsageInsightView([row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 6, 10)], now)).toEqual({
      kind: "insufficient",
      status: { tone: "insufficient", label: "" },
      reason: "potrzeba co najmniej 7 dni z ostatnich 30, jest 6",
    });
    expect(toUsageInsightView([row(YESTERDAY, 10)], now)).toMatchObject({
      reason: "potrzeba co najmniej 7 dni z ostatnich 30, jest 0",
    });
    expect(insight([row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 7, 10)]).baseline).toMatchObject({
      kind: "fallback",
      days: 7,
    });
  });

  it("excludes today and the compared day from the baseline", () => {
    // Yesterday missing: the compared day is 22 September; 23 September and today come after it.
    const rows = [row(TODAY, 1000), row("2026-09-23", null), row("2026-09-22", 10), ...daysBefore("2026-09-22", 7, 10)];
    const v = insight(rows);
    expect(v.baseline).toMatchObject({ kind: "fallback", days: 7 });
    expect(v.load.deltaLabel).toBe("0%");
  });

  it("excludes the compared day's own year from the seasonal window across New Year", () => {
    const jan = new Date("2027-01-06T10:00:00Z"); // compared day 2027-01-05
    const rows = [
      row("2027-01-05", 10),
      ...daysBefore("2027-01-05", 30, 10),
      // 2026-01-05 ± 14 spans 2025-12-22 .. 2026-01-19.
      ...seasonalWindow("2026-01-05", 20),
    ];
    const v = insight(rows, jan);
    expect(v.dayLabel).toBe("5 stycznia");
    expect(v.baseline).toMatchObject({ kind: "seasonal", days: 29 });
    expect(v.load.deltaLabel).toBe("−50%");
  });

  it("falls back when the only data near the month-day is from the compared day's own year", () => {
    const jan = new Date("2027-01-06T10:00:00Z");
    const rows = [row("2027-01-05", 10), ...daysBefore("2027-01-05", 30, 10)];
    expect(insight(rows, jan).baseline).toMatchObject({ kind: "fallback", days: 30 });
  });

  it("maps 29 February to 28 February in a non-leap year", () => {
    const leap = new Date("2028-03-01T10:00:00Z"); // compared day 2028-02-29
    const rows = [row("2028-02-29", 10), ...seasonalWindow("2027-02-28", 10)];
    expect(insight(rows, leap).baseline).toMatchObject({ kind: "seasonal", days: 29 });
  });

  // At ±15% the label shows one decimal so it never contradicts the status.
  it.each([
    [34.5, "+15,0%", "normal"],
    [25.5, "−15,0%", "normal"],
    [34.51, "+15,1%", "above"],
    [25.49, "−15,1%", "below"],
    [34.53, "+15,1%", "above"],
    [34.47, "+14,9%", "normal"],
    [34.2, "+14%", "normal"],
    [34.8, "+16%", "above"],
    [30, "0%", "normal"],
  ])("labels load %d against a median of 30 as %s %s", (load, deltaLabel, status) => {
    const rows = [row(YESTERDAY, load), ...daysBefore(YESTERDAY, 30, 30)];
    expect(insight(rows).load).toMatchObject({ deltaLabel, status });
  });

  // In binary floating point 50 × 1.15 is 57.49999…, so a naive comparison would call exactly +15% "above".
  it.each([
    [50, 57.5],
    [100, 115],
    [3, 3.45],
  ])("keeps exactly +15%% normal against a median of %d despite floating point error", (norm, load) => {
    const rows = [row(YESTERDAY, load), ...daysBefore(YESTERDAY, 7, norm)];
    expect(insight(rows).load).toMatchObject({ deltaLabel: "+15,0%", status: "normal" });
  });

  // The owner's rule: normal or below is good, above +15% worth watching, above +40% a problem; exactly at a line
  // is the milder status.
  it.each([
    [30, { tone: "good", label: "w normie" }],
    [25, { tone: "good", label: "poniżej normy" }],
    [34.5, { tone: "good", label: "w normie" }],
    [34.8, { tone: "watch", label: "powyżej normy" }],
    [42, { tone: "watch", label: "powyżej normy" }],
    [42.3, { tone: "problem", label: "dużo powyżej normy" }],
  ])("rates load %d against a median of 30 as %j", (load, status) => {
    const rows = [row(YESTERDAY, load), ...daysBefore(YESTERDAY, 30, 30)];
    expect(insight(rows).status).toEqual(status);
  });

  it.each([
    [50, 70],
    [3, 4.2],
    [0.7, 0.98],
  ])("keeps exactly +40%% worth watching against a median of %d despite floating point error", (norm, load) => {
    const rows = [row(YESTERDAY, load), ...daysBefore(YESTERDAY, 7, norm)];
    expect(insight(rows).status).toEqual({ tone: "watch", label: "powyżej normy" });
  });

  it("names the seasonal baseline days", () => {
    const rows = [row(YESTERDAY, 10), ...seasonalWindow("2025-09-24", 10, null, 20)];
    // A 2025 baseline against a 2026 day after the sensor change spans it.
    expect(insight(rows).baseline).toEqual({
      kind: "seasonal",
      days: 20,
      periodLabel: "20 dni: 10–29 września 2025",
      crossesSensorChange: true,
    });
  });

  it("names the fallback days actually used, gaps included", () => {
    // 10 days before 22 September, plus one day at the far end of the 30-day window (23 August).
    const rows = [row("2026-09-22", 10), ...daysBefore("2026-09-22", 10, 10), row("2026-08-23", 10)];
    expect(insight(rows).baseline).toEqual({
      kind: "fallback",
      days: 11,
      periodLabel: "11 dni: 23 sierpnia – 21 września",
      crossesSensorChange: false,
    });
  });

  it("skips days without a load everywhere", () => {
    const rows = [
      row(YESTERDAY, 10),
      ...daysBefore(YESTERDAY, 6, 10),
      ...daysBefore(addDays(YESTERDAY, -6), 20, null, 1000),
      ...seasonalWindow("2025-09-24", 10).map((r, i) => (i < 10 ? { ...r, load_kwh: null } : r)),
    ];
    // 19 seasonal days with a load (< 20) and 6 fallback days (< 7): nothing to compare against.
    expect(toUsageInsightView(rows, now)).toMatchObject({
      kind: "insufficient",
      reason: "potrzeba co najmniej 7 dni z ostatnich 30, jest 6",
    });
  });

  it("ignores non-numeric totals", () => {
    const rows = [
      row(YESTERDAY, 10),
      ...daysBefore(YESTERDAY, 7, 10),
      { ...row("2026-09-10", null), load_kwh: "999" as unknown as number },
    ];
    expect(insight(rows).baseline.days).toBe(7);
  });

  it("takes the purchase median over the baseline days that have one", () => {
    const rows = [
      row(YESTERDAY, 10, 6),
      ...daysBefore(YESTERDAY, 4, 10, 4),
      ...daysBefore(addDays(YESTERDAY, -4), 6, 10, null),
    ];
    const v = insight(rows);
    expect(v.baseline.days).toBe(10);
    expect(v.purchase).toEqual({ kwhLabel: "6,0 kWh", deltaLabel: "+50%" });
  });

  it("shows a missing purchase when the day or the baseline has none", () => {
    expect(insight([row(YESTERDAY, 10, null), ...daysBefore(YESTERDAY, 7, 10, 4)]).purchase).toEqual({
      kwhLabel: "—",
      deltaLabel: "—",
    });
    expect(insight([row(YESTERDAY, 10, 4), ...daysBefore(YESTERDAY, 7, 10, null)]).purchase).toEqual({
      kwhLabel: "4,0 kWh",
      deltaLabel: "—",
    });
  });

  it("uses the median, so a few unusual days do not move the norm", () => {
    // 7 ordinary days at 36 and 3 glitch days at 10: the mean would be 28.2 and call 36 "above".
    const rows = [
      row(YESTERDAY, 36, 16),
      ...daysBefore(YESTERDAY, 7, 36, 16),
      ...daysBefore(addDays(YESTERDAY, -7), 3, 10, 30),
    ];
    const v = insight(rows);
    expect(v.status).toEqual({ tone: "good", label: "w normie" });
    expect(v.load).toMatchObject({ deltaLabel: "0%", status: "normal" });
    expect(v.purchase.deltaLabel).toBe("0%");
    expect(v.meaning).toMatchObject({ normKwhLabel: "36,0 kWh", band: "normal" });
  });

  it("takes the mean of the two middle days for an even count", () => {
    const rows = [row(YESTERDAY, 11), ...daysBefore(YESTERDAY, 4, 8), ...daysBefore(addDays(YESTERDAY, -4), 4, 12)];
    // Baseline 8,8,8,8,12,12,12,12: median 10.
    expect(insight(rows).meaning?.normKwhLabel).toBe("10,0 kWh");
    expect(insight(rows).load.deltaLabel).toBe("+10%");
  });

  it("shows a missing purchase change when most baseline days bought nothing", () => {
    const rows = [
      row(YESTERDAY, 10, 3),
      ...daysBefore(YESTERDAY, 5, 10, 0),
      ...daysBefore(addDays(YESTERDAY, -5), 2, 10, 4),
    ];
    expect(insight(rows).purchase).toEqual({ kwhLabel: "3,0 kWh", deltaLabel: "—" });
  });

  it.each([
    [25, "low", { tone: "good", label: "poniżej normy" }],
    [30, "normal", { tone: "good", label: "w normie" }],
    [34.5, "normal", { tone: "good", label: "w normie" }],
    [34.8, "high", { tone: "watch", label: "powyżej normy" }],
    [42, "high", { tone: "watch", label: "powyżej normy" }],
    [42.3, "very_high", { tone: "problem", label: "dużo powyżej normy" }],
  ])("puts load %d in the %s range, matching the badge", (load, band, status) => {
    const v = insight([row(YESTERDAY, load), ...daysBefore(YESTERDAY, 30, 30)]);
    expect(v.meaning?.band).toBe(band);
    expect(v.status).toEqual(status);
  });

  // One decimal would print these days as the edge itself ("34,5 kWh" in "34,5–42,0"), so they get two.
  it.each([
    [34.52, "34,52 kWh", "high"],
    [25.46, "25,46 kWh", "low"],
    [42.04, "42,04 kWh", "very_high"],
    [34.5, "34,5 kWh", "normal"],
    [42, "42,0 kWh", "high"],
    [33, "33,0 kWh", "normal"],
  ])("shows load %d against a median of 30 as %s in the %s range", (load, kwhLabel, band) => {
    const v = insight([row(YESTERDAY, load), ...daysBefore(YESTERDAY, 30, 30)]);
    expect(v.load.kwhLabel).toBe(kwhLabel);
    expect(v.meaning?.band).toBe(band);
  });

  // Exactly +40% is still "high", so a whole "+40%" must not sit next to "dużo więcej".
  it.each([
    [42, "+40,0%", "To więcej niż zwykle (+40,0% wobec normy)."],
    [42.01, "+40,1%", "To dużo więcej niż zwykle (+40,1% wobec normy)."],
    [42.1, "+40,3%", "To dużo więcej niż zwykle (+40,3% wobec normy)."],
    [41.9, "+39,7%", "To więcej niż zwykle (+39,7% wobec normy)."],
    [42.3, "+41%", "To dużo więcej niż zwykle (+41% wobec normy)."],
    [25, "−17%", "To mniej niż zwykle (−17% wobec normy)."],
    [30, "0%", "To tyle, co zwykle (0% wobec normy)."],
  ])("describes load %d against a median of 30 as %s", (load, deltaLabel, verdictSentence) => {
    const v = insight([row(YESTERDAY, load), ...daysBefore(YESTERDAY, 30, 30)]);
    expect(v.load.deltaLabel).toBe(deltaLabel);
    expect(v.meaning?.verdictSentence).toBe(verdictSentence);
  });

  it("names the compared day's month in the comparison", () => {
    const jan = new Date("2027-01-06T10:00:00Z");
    const rows = [row("2027-01-05", 40), ...daysBefore("2027-01-05", 30, 40)];
    expect(insight(rows, jan).meaning?.referenceSentence).toContain("zużywa w styczniu ok. 29 kWh dziennie");
  });

  it("draws no ranges around a zero norm", () => {
    const v = insight([row(YESTERDAY, 2), ...daysBefore(YESTERDAY, 7, 0)]);
    expect(v.meaning).toBeNull();
    expect(v.status).toEqual({ tone: "good", label: "w normie" });
  });
});

// The grid sensor's direction changed on 2026-08-04 (grid-sensor.ts); synthetic rows only.
describe("baseline.crossesSensorChange", () => {
  it("is true for a fallback baseline from before the change", () => {
    const clock = new Date("2026-08-21T10:00:00Z"); // compared day 2026-08-20
    const v = insight([row("2026-08-20", 10), ...daysBefore("2026-08-20", 30, 10)], clock);
    expect(v.baseline).toMatchObject({ kind: "fallback", periodLabel: "30 dni: 21 lipca – 19 sierpnia" });
    expect(v.baseline.crossesSensorChange).toBe(true);
  });

  it("is false for a fallback baseline wholly after the change", () => {
    const clock = new Date("2026-09-30T10:00:00Z"); // compared day 2026-09-29
    const v = insight([row("2026-09-29", 10), ...daysBefore("2026-09-29", 30, 10)], clock);
    expect(v.baseline.kind).toBe("fallback");
    expect(v.baseline.crossesSensorChange).toBe(false);
  });

  it("is true for a seasonal baseline in 2027 that spans the change", () => {
    const clock = new Date("2027-08-11T10:00:00Z"); // compared day 2027-08-10; window 27 July – 24 August 2026
    const v = insight([row("2027-08-10", 10), ...seasonalWindow("2026-08-10", 10)], clock);
    expect(v.baseline).toMatchObject({ kind: "seasonal", days: 29 });
    expect(v.baseline.crossesSensorChange).toBe(true);
  });

  it("is false for a seasonal baseline in 2027 wholly after the change", () => {
    const clock = new Date("2027-09-21T10:00:00Z"); // compared day 2027-09-20; window 6 September – 4 October 2026
    const v = insight([row("2027-09-20", 10), ...seasonalWindow("2026-09-20", 10)], clock);
    expect(v.baseline).toMatchObject({ kind: "seasonal", days: 29 });
    expect(v.baseline.crossesSensorChange).toBe(false);
  });
});

describe("median", () => {
  it.each([
    [[], null],
    [[5], 5],
    [[3, 1, 2], 2],
    [[4, 1, 3, 2], 2.5],
    [[10, 36, 36, 36, 10, 36, 36], 36],
  ])("of %j is %s", (values, expected) => {
    expect(median(values)).toBe(expected);
  });
});

describe("loadDailyEnergy", () => {
  // Records the arguments of the query chain and resolves with the given rows.
  function mockClient(data: DailyEnergyRow[] | null, error: { message: string } | null = null) {
    const calls: Record<string, unknown[]> = {};
    const chain = {
      from: (...args: unknown[]) => ((calls.from = args), chain),
      select: (...args: unknown[]) => ((calls.select = args), chain),
      gte: (...args: unknown[]) => ((calls.gte = args), chain),
      order: (...args: unknown[]) => ((calls.order = args), chain),
      overrideTypes: () => Promise.resolve({ data, error }),
    };
    return { client: chain as unknown as SupabaseClient, calls };
  }

  it(`reads the last ${String(HISTORY_DAYS)} Warsaw days, newest first`, async () => {
    const rows = [row(YESTERDAY, 10)];
    const { client, calls } = mockClient(rows);
    await expect(loadDailyEnergy(client, now)).resolves.toEqual(rows);
    expect(calls.from).toEqual(["daily_energy"]);
    // 400 days before 2026-09-25 (Warsaw); the seasonal window around 2025-09-24 starts on 2025-09-10.
    expect(calls.gte).toEqual(["day", "2025-08-21"]);
    expect(calls.order).toEqual(["day", { ascending: false }]);
  });

  it("selects the columns the cards read", async () => {
    const { client, calls } = mockClient([]);
    await loadDailyEnergy(client, now);
    expect(calls.select).toEqual(["day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh"]);
  });

  it("throws on a load error", async () => {
    const { client } = mockClient(null, { message: "permission denied" });
    await expect(loadDailyEnergy(client, now)).rejects.toThrow("loading daily energy failed: permission denied");
  });

  it("counts the cutoff from the Warsaw date just after midnight", async () => {
    const { client, calls } = mockClient([]);
    await loadDailyEnergy(client, new Date("2026-09-24T22:30:00Z"));
    expect(calls.gte).toEqual(["day", "2025-08-21"]);
  });
});

describe("zero norm", () => {
  // Every baseline day used nothing, so no range or percentage can be drawn around the norm.
  const zero = (load: number) => insight([row(YESTERDAY, load), ...daysBefore(YESTERDAY, 7, 0)]);

  it("keeps the load status normal whatever the day used", () => {
    expect(zero(2).load.status).toBe("normal");
    expect(zero(0.04).load).toEqual({ kwhLabel: "0,0 kWh", deltaLabel: "—", status: "normal" });
  });
});

describe("day figure beside a range edge", () => {
  it("shows two decimals when one would print the same number as an edge the day is not on", () => {
    // Norm 29,98 puts the upper edge at 34,477 (one decimal: 34,5); a day of exactly 34,5 is not on it.
    const v = insight([row(YESTERDAY, 34.5), ...daysBefore(YESTERDAY, 7, 29.98)]);
    expect(v.load.kwhLabel).toBe("34,50 kWh");
  });
});

describe("deltaLabel rounding and signs", () => {
  it("rounds an exact half away from zero, up and down", () => {
    expect(deltaLabel(11.25, 10)).toBe("+13%");
    expect(deltaLabel(8.75, 10)).toBe("−13%");
  });

  it("shows a whole −40% without the far-above edge format", () => {
    expect(deltaLabel(6, 10)).toBe("−40%");
  });
});

describe("baseline across several years and New Year", () => {
  it("reaches every earlier year that has data, not just the newest", () => {
    // Data only two years back: the seasonal window around 24 September 2024 still counts.
    const rows = [row(YESTERDAY, 10), ...seasonalWindow("2024-09-24", 10)];
    expect(insight(rows).baseline).toMatchObject({ kind: "seasonal", days: 29 });
  });

  it("starts one year before the earliest data, so a window around New Year spills into it", () => {
    // 2026-12-24 is compared. December 2024 is the earliest data, and 1-8 January 2024 only lies in the window
    // around 24 December 2023: a year before the earliest year.
    const december2024 = Array.from({ length: 21 }, (_, i) => row(addDays("2024-12-11", i), 10));
    const january2024 = Array.from({ length: 8 }, (_, i) => row(addDays("2024-01-01", i), 10));
    const rows = [row("2026-12-24", 10), ...december2024, ...january2024];
    const v = insight(rows, new Date("2026-12-26T10:00:00Z"));
    // 21 days of December 2024, plus 1-7 January 2024 from the window a year before the earliest data.
    expect(v.baseline).toMatchObject({ kind: "seasonal", days: 28 });
  });
});

describe("dailyLoadNorm", () => {
  it("returns the median and baseline the usage card uses", () => {
    const rows = [row(YESTERDAY, 12.34), ...daysBefore(YESTERDAY, 30, 10)];
    expect(dailyLoadNorm(rows, now)).toEqual({ norm: 10, days: 30, kind: "fallback" });
  });

  it("ignores today's row", () => {
    expect(dailyLoadNorm([row(TODAY, 99), ...daysBefore(TODAY, 10, 10)], now)).toEqual({
      norm: 10,
      days: 9,
      kind: "fallback",
    });
  });

  it("is null when the usage card would say insufficient", () => {
    expect(dailyLoadNorm([], now)).toBeNull();
    expect(dailyLoadNorm([row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 5, 10)], now)).toBeNull();
    expect(toUsageInsightView([row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 5, 10)], now).kind).toBe("insufficient");
  });
});
