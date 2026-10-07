import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS } from "@/lib/format/age";
import {
  dayKeyToUtcMs,
  dayMonthYear,
  formatDayMonth,
  formatMonth,
  formatWeekday,
  utcMsToDayKey,
  warsawDayHours,
  warsawHour,
  warsawMonthKey,
  warsawParts,
} from "./warsaw-time";

// Expected values come from the Warsaw offsets (UTC+1 in winter, UTC+2 in summer), written by hand.
describe("warsawParts", () => {
  it.each([
    // Winter (UTC+1): 22:59:59Z is 23:59 on the same day, 23:00:00Z is midnight of the next one.
    ["2026-01-15T22:59:59Z", "2026-01-15", "23:59", "15 stycznia 2026, 23:59"],
    ["2026-01-15T23:00:00Z", "2026-01-16", "00:00", "16 stycznia 2026, 00:00"],
    // Summer (UTC+2): 21:59:59Z is 23:59, 22:00:00Z is midnight of the next day.
    ["2026-07-15T21:59:59Z", "2026-07-15", "23:59", "15 lipca 2026, 23:59"],
    ["2026-07-15T22:00:00Z", "2026-07-16", "00:00", "16 lipca 2026, 00:00"],
  ])("reads %s as Warsaw day %s at %s", (iso, dayKey, time, label) => {
    expect(warsawParts(new Date(iso))).toEqual({ dayKey, time, label });
  });

  it("rolls the year at Warsaw midnight, 23:00Z on 31 December", () => {
    expect(warsawParts(new Date("2026-12-31T22:59:59Z")).dayKey).toBe("2026-12-31");
    expect(warsawParts(new Date("2026-12-31T23:00:00Z")).dayKey).toBe("2027-01-01");
  });
});

describe("warsawMonthKey", () => {
  it.each([
    // Winter month end (UTC+1): 22:59:59Z on 31 January is still January in Warsaw.
    ["2026-01-31T22:59:59Z", "2026-01"],
    ["2026-01-31T23:00:00Z", "2026-02"],
    // Summer month end (UTC+2): 21:59:59Z on 31 July is still July.
    ["2026-07-31T21:59:59Z", "2026-07"],
    ["2026-07-31T22:00:00Z", "2026-08"],
    // Year end (UTC+1).
    ["2026-12-31T22:59:59Z", "2026-12"],
    ["2026-12-31T23:00:00Z", "2027-01"],
  ])("puts %s in %s", (iso, month) => {
    expect(warsawMonthKey(new Date(iso))).toBe(month);
  });
});

describe("dayKeyToUtcMs and utcMsToDayKey", () => {
  it.each(["2026-03-29", "2026-10-25", "2026-12-31", "2027-01-01"])("round-trips %s", (dayKey) => {
    expect(dayKeyToUtcMs(dayKey)).toBe(Date.parse(`${dayKey}T00:00:00Z`));
    expect(utcMsToDayKey(dayKeyToUtcMs(dayKey))).toBe(dayKey);
  });

  it("keeps a day key at 24 hours across both DST changes and the new year", () => {
    // Warsaw's offset changes on 29 March and 25 October, but a day key is a plain calendar date.
    expect(dayKeyToUtcMs("2026-03-30") - dayKeyToUtcMs("2026-03-29")).toBe(DAY_MS);
    expect(dayKeyToUtcMs("2026-10-26") - dayKeyToUtcMs("2026-10-25")).toBe(DAY_MS);
    expect(dayKeyToUtcMs("2027-01-01") - dayKeyToUtcMs("2026-12-31")).toBe(DAY_MS);
  });

  it("turns a UTC instant into its UTC date, one second either side of midnight", () => {
    expect(utcMsToDayKey(Date.parse("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
    expect(utcMsToDayKey(Date.parse("2027-01-01T00:00:00Z"))).toBe("2027-01-01");
    expect(utcMsToDayKey(Date.parse("2026-03-29T23:59:59Z"))).toBe("2026-03-29");
    expect(utcMsToDayKey(Date.parse("2026-10-25T23:59:59Z"))).toBe("2026-10-25");
  });
});

describe("formatDayMonth and formatMonth", () => {
  it("names the day and the genitive month", () => {
    expect(formatDayMonth("2026-03-29")).toBe("29 marca");
    expect(formatDayMonth("2026-10-25")).toBe("25 października");
    expect(formatDayMonth("2027-01-01")).toBe("1 stycznia");
  });

  it("names the nominative month and the year", () => {
    expect(formatMonth("2026-09")).toBe("wrzesień 2026");
    expect(formatMonth("2026-12")).toBe("grudzień 2026");
    expect(formatMonth("2027-01")).toBe("styczeń 2027");
  });
});

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
