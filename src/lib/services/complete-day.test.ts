import { describe, expect, it } from "vitest";
import type { DailyEnergyRow } from "@/types";
import { isCompleteDay, kwh } from "./complete-day";

// All data here is synthetic.

function row(day: string, overrides: Partial<DailyEnergyRow> = {}): DailyEnergyRow {
  return { day, pv_kwh: 10, load_kwh: 20, grid_import_kwh: 5, grid_export_kwh: 0, pv_forecast_kwh: null, ...overrides };
}

describe("kwh", () => {
  it("reads a finite, non-negative number as it is, zero included", () => {
    expect(kwh(12.5)).toBe(12.5);
    expect(kwh(0)).toBe(0);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a negative number", -0.1],
    ["a numeric string", "5"],
  ])("reads %s as no value", (_name, value) => {
    expect(kwh(value)).toBeNull();
  });
});

describe("isCompleteDay", () => {
  const today = "2026-09-30";

  it("counts an ordinary past day with all three totals", () => {
    expect(isCompleteDay(row("2026-09-15"), today)).toBe(true);
  });

  it("counts a day with zero totals, since zero is a reading", () => {
    expect(isCompleteDay(row("2026-09-15", { pv_kwh: 0, grid_import_kwh: 0 }), today)).toBe(true);
  });

  it("counts the day before today but never today or a later day", () => {
    expect(isCompleteDay(row("2026-09-29"), today)).toBe(true);
    expect(isCompleteDay(row("2026-09-30"), today)).toBe(false);
    expect(isCompleteDay(row("2026-10-01"), today)).toBe(false);
  });

  it("is false for a missing row and for each missing or unusable total", () => {
    expect(isCompleteDay(undefined, today)).toBe(false);
    expect(isCompleteDay(row("2026-09-15", { pv_kwh: null }), today)).toBe(false);
    expect(isCompleteDay(row("2026-09-15", { load_kwh: Number.NaN }), today)).toBe(false);
    expect(isCompleteDay(row("2026-09-15", { grid_import_kwh: -1 }), today)).toBe(false);
  });

  it.each(["2026-03-29", "2026-10-25"])("treats the DST day %s like any other day", (dst) => {
    // Day keys are plain calendar dates, so the 23- and 25-hour days are complete once they are over.
    const next = dst === "2026-03-29" ? "2026-03-30" : "2026-10-26";
    expect(isCompleteDay(row(dst), next)).toBe(true);
    expect(isCompleteDay(row(dst), dst)).toBe(false);
  });
});
