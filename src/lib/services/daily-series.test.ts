import { describe, expect, it } from "vitest";
import type { DailyEnergyRow } from "@/types";
import { dailySeries, KPI_SERIES_DAYS, USAGE_SERIES_DAYS } from "./daily-series";

function row(day: string, pv_kwh: number | null): DailyEnergyRow {
  return { day, pv_kwh, load_kwh: null, grid_import_kwh: null, grid_export_kwh: null, pv_forecast_kwh: null };
}

describe("dailySeries", () => {
  it("uses the planned windows", () => {
    expect(KPI_SERIES_DAYS).toBe(14);
    expect(USAGE_SERIES_DAYS).toBe(7);
  });

  it("returns the window oldest first, ending on lastDay", () => {
    // Rows arrive newest first, as loadDailyEnergy returns them.
    const rows = [row("2026-09-24", 5), row("2026-09-23", 4), row("2026-09-22", 3), row("2026-09-21", 2)];
    expect(dailySeries(rows, "pv_kwh", "2026-09-24", 4)).toEqual([2, 3, 4, 5]);
  });

  it("marks a missing day as a gap", () => {
    const rows = [row("2026-09-24", 5), row("2026-09-22", 3), row("2026-09-21", 2)];
    expect(dailySeries(rows, "pv_kwh", "2026-09-24", 4)).toEqual([2, 3, null, 5]);
  });

  it("marks a null total as a gap", () => {
    const rows = [row("2026-09-24", 5), row("2026-09-23", null), row("2026-09-22", 3), row("2026-09-21", 2)];
    expect(dailySeries(rows, "pv_kwh", "2026-09-24", 4)).toEqual([2, 3, null, 5]);
  });

  it("marks a negative or non-finite total as a gap, but keeps zero", () => {
    const rows = [row("2026-09-24", -1), row("2026-09-23", Number.NaN), row("2026-09-22", 0), row("2026-09-21", 2)];
    expect(dailySeries(rows, "pv_kwh", "2026-09-24", 4)).toEqual([2, 0, null, null]);
    expect(dailySeries([row("2026-09-24", Infinity)], "pv_kwh", "2026-09-24", 1)).toEqual([null]);
  });

  it("ignores rows outside the window", () => {
    const rows = [
      row("2026-09-26", 9),
      row("2026-09-25", 8),
      row("2026-09-24", 5),
      row("2026-09-21", 2),
      row("2026-09-20", 1),
    ];
    expect(dailySeries(rows, "pv_kwh", "2026-09-24", 3)).toEqual([null, null, 5]);
  });

  it("returns one entry for a one-day window", () => {
    const rows = [row("2026-09-24", 5), row("2026-09-23", 4)];
    expect(dailySeries(rows, "pv_kwh", "2026-09-24", 1)).toEqual([5]);
    expect(dailySeries(rows, "pv_kwh", "2026-09-22", 1)).toEqual([null]);
  });

  it("returns only gaps without rows", () => {
    expect(dailySeries([], "pv_kwh", "2026-09-24", 3)).toEqual([null, null, null]);
  });

  it("leaves out today's partial row when the window ends yesterday", () => {
    const rows = [row("2026-09-25", 7), row("2026-09-24", 5), row("2026-09-23", 4)];
    expect(dailySeries(rows, "pv_kwh", "2026-09-24", 3)).toEqual([null, 4, 5]);
  });

  it("crosses a month boundary", () => {
    const rows = [row("2026-10-02", 4), row("2026-10-01", 3), row("2026-09-30", 2), row("2026-09-29", 1)];
    expect(dailySeries(rows, "pv_kwh", "2026-10-02", 5)).toEqual([null, 1, 2, 3, 4]);
  });

  it("crosses a year boundary", () => {
    const rows = [row("2027-01-02", 3), row("2027-01-01", 2), row("2026-12-31", 1), row("2026-12-30", 0)];
    expect(dailySeries(rows, "pv_kwh", "2027-01-02", 4)).toEqual([0, 1, 2, 3]);
  });

  it("reads the requested field", () => {
    const rows: DailyEnergyRow[] = [
      { day: "2026-09-24", pv_kwh: 1, load_kwh: 2, grid_import_kwh: 3, grid_export_kwh: 4, pv_forecast_kwh: 5 },
    ];
    expect(dailySeries(rows, "load_kwh", "2026-09-24", 1)).toEqual([2]);
    expect(dailySeries(rows, "grid_import_kwh", "2026-09-24", 1)).toEqual([3]);
    expect(dailySeries(rows, "grid_export_kwh", "2026-09-24", 1)).toEqual([4]);
  });
});
