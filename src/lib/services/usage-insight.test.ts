import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { DailyEnergyRow } from "@/types";
import { addDays } from "@/lib/format/warsaw-time";
import { HISTORY_DAYS, loadDailyEnergy, toUsageInsightView } from "./usage-insight";

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
      dayLabel: "24 września",
      isYesterday: true,
      load: { kwhLabel: "12,3 kWh", deltaLabel: "+23%", status: "above" },
      purchase: { kwhLabel: "4,0 kWh", deltaLabel: "−20%" },
      baseline: { kind: "fallback", days: 30 },
    });
  });

  it("uses the latest earlier day when yesterday is missing and names it", () => {
    const rows = [row(YESTERDAY, null), row("2026-09-22", 10), ...daysBefore("2026-09-22", 10, 10)];
    const v = insight(rows);
    expect(v.isYesterday).toBe(false);
    expect(v.dayLabel).toBe("22 września");
    expect(v.baseline).toEqual({ kind: "fallback", days: 10 });
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
    expect(toUsageInsightView([row("2026-09-17", 10), ...daysBefore("2026-09-17", 30, 10)], now)).toEqual({
      kind: "insufficient",
    });
    expect(toUsageInsightView([], now)).toEqual({ kind: "insufficient" });
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
    expect(v.baseline).toEqual({ kind: "seasonal", days: 20 });
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
    expect(v.baseline).toEqual({ kind: "seasonal", days: 29 });
    expect(v.load.status).toBe("normal");
  });

  it("falls back to the last 30 days with fewer than 20 year-ago days", () => {
    const rows = [
      row(YESTERDAY, 10),
      ...daysBefore(YESTERDAY, 30, 10),
      ...seasonalWindow("2025-09-24", 1000, null, 19),
    ];
    const v = insight(rows);
    expect(v.baseline).toEqual({ kind: "fallback", days: 30 });
    expect(v.load.status).toBe("normal");
  });

  it("uses only the 30 days before the compared day for the fallback", () => {
    const rows = [row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 30, 10), row(addDays(YESTERDAY, -31), 1000)];
    expect(insight(rows).baseline).toEqual({ kind: "fallback", days: 30 });
  });

  it("is insufficient with fewer than 7 fallback days", () => {
    expect(toUsageInsightView([row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 6, 10)], now)).toEqual({
      kind: "insufficient",
    });
    expect(insight([row(YESTERDAY, 10), ...daysBefore(YESTERDAY, 7, 10)]).baseline).toEqual({
      kind: "fallback",
      days: 7,
    });
  });

  it("excludes today and the compared day from the baseline", () => {
    // Yesterday missing: the compared day is 22 September; 23 September and today come after it.
    const rows = [row(TODAY, 1000), row("2026-09-23", null), row("2026-09-22", 10), ...daysBefore("2026-09-22", 7, 10)];
    const v = insight(rows);
    expect(v.baseline).toEqual({ kind: "fallback", days: 7 });
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
    expect(v.baseline).toEqual({ kind: "seasonal", days: 29 });
    expect(v.load.deltaLabel).toBe("−50%");
  });

  it("falls back when the only data near the month-day is from the compared day's own year", () => {
    const jan = new Date("2027-01-06T10:00:00Z");
    const rows = [row("2027-01-05", 10), ...daysBefore("2027-01-05", 30, 10)];
    expect(insight(rows, jan).baseline).toEqual({ kind: "fallback", days: 30 });
  });

  it("maps 29 February to 28 February in a non-leap year", () => {
    const leap = new Date("2028-03-01T10:00:00Z"); // compared day 2028-02-29
    const rows = [row("2028-02-29", 10), ...seasonalWindow("2027-02-28", 10)];
    expect(insight(rows, leap).baseline).toEqual({ kind: "seasonal", days: 29 });
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
  ])("labels load %d against a mean of 30 as %s %s", (load, deltaLabel, status) => {
    const rows = [row(YESTERDAY, load), ...daysBefore(YESTERDAY, 30, 30)];
    expect(insight(rows).load).toMatchObject({ deltaLabel, status });
  });

  // In binary floating point 50 × 1.15 is 57.49999…, so a naive comparison would call exactly +15% "above".
  it.each([
    [50, 57.5],
    [100, 115],
    [3, 3.45],
  ])("keeps exactly +15%% normal against a mean of %d despite floating point error", (mean, load) => {
    const rows = [row(YESTERDAY, load), ...daysBefore(YESTERDAY, 7, mean)];
    expect(insight(rows).load).toMatchObject({ deltaLabel: "+15,0%", status: "normal" });
  });

  it("skips days without a load everywhere", () => {
    const rows = [
      row(YESTERDAY, 10),
      ...daysBefore(YESTERDAY, 6, 10),
      ...daysBefore(addDays(YESTERDAY, -6), 20, null, 1000),
      ...seasonalWindow("2025-09-24", 10).map((r, i) => (i < 10 ? { ...r, load_kwh: null } : r)),
    ];
    // 19 seasonal days with a load (< 20) and 6 fallback days (< 7): nothing to compare against.
    expect(toUsageInsightView(rows, now)).toEqual({ kind: "insufficient" });
  });

  it("ignores non-numeric totals", () => {
    const rows = [
      row(YESTERDAY, 10),
      ...daysBefore(YESTERDAY, 7, 10),
      { ...row("2026-09-10", null), load_kwh: "999" as unknown as number },
    ];
    expect(insight(rows).baseline.days).toBe(7);
  });

  it("averages purchases over the baseline days that have one", () => {
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
});

describe("loadDailyEnergy", () => {
  // Records the arguments of the query chain and resolves with the given rows.
  function mockClient(data: DailyEnergyRow[]) {
    const calls: Record<string, unknown[]> = {};
    const chain = {
      from: (...args: unknown[]) => ((calls.from = args), chain),
      select: (...args: unknown[]) => ((calls.select = args), chain),
      gte: (...args: unknown[]) => ((calls.gte = args), chain),
      order: (...args: unknown[]) => ((calls.order = args), chain),
      overrideTypes: () => Promise.resolve({ data, error: null }),
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

  it("counts the cutoff from the Warsaw date just after midnight", async () => {
    const { client, calls } = mockClient([]);
    await loadDailyEnergy(client, new Date("2026-09-24T22:30:00Z"));
    expect(calls.gte).toEqual(["day", "2025-08-21"]);
  });
});
