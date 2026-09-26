import { describe, expect, it } from "vitest";
import { formatPeriod } from "./period";

describe("formatPeriod", () => {
  it("names a single day", () => {
    expect(formatPeriod(["2026-09-24"])).toEqual({ days: 1, label: "1 dzień: 24 września" });
  });

  it("spans the first and last day of a range with gaps", () => {
    expect(formatPeriod(["2026-09-25", "2026-08-27", "2026-09-01", "2026-09-10"])).toEqual({
      days: 4,
      label: "4 dni: 27 sierpnia – 25 września",
    });
  });

  it("counts duplicate days once", () => {
    expect(formatPeriod(["2026-09-24", "2026-09-24"])).toEqual({ days: 1, label: "1 dzień: 24 września" });
    expect(formatPeriod(["2026-09-23", "2026-09-24", "2026-09-23"])).toEqual({
      days: 2,
      label: "2 dni: 23–24 września",
    });
  });

  it("names the month once for a range within one month", () => {
    expect(formatPeriod(["2026-09-01", "2026-09-18"])).toEqual({ days: 2, label: "2 dni: 1–18 września" });
  });

  it("adds the year to both ends across New Year", () => {
    expect(formatPeriod(["2026-12-20", "2027-01-18"])).toEqual({
      days: 2,
      label: "2 dni: 20 grudnia 2026 – 18 stycznia 2027",
    });
  });

  it("throws on an empty list", () => {
    expect(() => formatPeriod([])).toThrow();
  });
});
