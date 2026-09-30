import { describe, expect, it } from "vitest";
import { dayMonthYear, formatWeekday, HOUR_MS, warsawDayHours, warsawHour } from "./warsaw-time";

describe("warsawHour", () => {
  it("labels an hour by its Warsaw date and clock hour in summer (UTC+2)", () => {
    expect(warsawHour(Date.parse("2026-08-01T20:00:00Z"))).toEqual({ dayKey: "2026-08-01", hour: 22 });
    // 22:00 UTC is already midnight of the next Warsaw day.
    expect(warsawHour(Date.parse("2026-08-01T22:00:00Z"))).toEqual({ dayKey: "2026-08-02", hour: 0 });
  });

  it("labels an hour in winter (UTC+1)", () => {
    expect(warsawHour(Date.parse("2026-01-15T23:00:00Z"))).toEqual({ dayKey: "2026-01-16", hour: 0 });
    expect(warsawHour(Date.parse("2026-01-15T22:00:00Z"))).toEqual({ dayKey: "2026-01-15", hour: 23 });
  });

  it("labels both 02:00 hours of the autumn change", () => {
    expect(warsawHour(Date.parse("2026-10-25T00:00:00Z"))).toEqual({ dayKey: "2026-10-25", hour: 2 });
    expect(warsawHour(Date.parse("2026-10-25T01:00:00Z"))).toEqual({ dayKey: "2026-10-25", hour: 2 });
  });
});

describe("warsawDayHours", () => {
  it("has 24 hours on an ordinary day, starting at Warsaw midnight", () => {
    const hours = warsawDayHours("2026-08-01");
    expect(hours).toHaveLength(24);
    expect(hours[0]).toEqual({ startMs: Date.parse("2026-07-31T22:00:00Z"), hour: 0 });
    expect(hours[23]).toEqual({ startMs: Date.parse("2026-08-01T21:00:00Z"), hour: 23 });
  });

  it("has 23 hours on the spring change, without 02:00", () => {
    const hours = warsawDayHours("2026-03-29");
    expect(hours).toHaveLength(23);
    expect(hours.map((h) => h.hour)).not.toContain(2);
    expect(hours[0].startMs).toBe(Date.parse("2026-03-28T23:00:00Z"));
    expect(hours[22].startMs).toBe(Date.parse("2026-03-29T21:00:00Z"));
  });

  it("has 25 hours on the autumn change, with 02:00 twice", () => {
    const hours = warsawDayHours("2026-10-25");
    expect(hours).toHaveLength(25);
    expect(hours.filter((h) => h.hour === 2)).toHaveLength(2);
    expect(hours[0].startMs).toBe(Date.parse("2026-10-24T22:00:00Z"));
    expect(hours[24].startMs).toBe(Date.parse("2026-10-25T22:00:00Z"));
  });

  it("returns consecutive hours", () => {
    for (const day of ["2026-03-29", "2026-08-01", "2026-10-25"]) {
      const starts = warsawDayHours(day).map((h) => h.startMs);
      starts.slice(1).forEach((ms, i) => {
        expect(ms - starts[i]).toBe(HOUR_MS);
      });
    }
  });
});

describe("formatWeekday", () => {
  it("names the weekday in Polish", () => {
    expect(formatWeekday("2026-08-01")).toBe("sobota");
    expect(formatWeekday("2026-08-03")).toBe("poniedziałek");
  });
});

describe("dayMonthYear", () => {
  it("names the day, the genitive month and the year", () => {
    expect(dayMonthYear("2026-08-04")).toBe("4 sierpnia 2026");
    expect(dayMonthYear("2027-01-02")).toBe("2 stycznia 2027");
  });
});
