import { describe, expect, it } from "vitest";
import {
  addMonths,
  adjacent,
  defaultMonth,
  HISTORY_START,
  isOpenable,
  monthGrid,
  parsePeriod,
  periodContaining,
  periodDays,
  periodInstants,
  periodLabel,
  quarterMonths,
  toSearch,
  type CalendarPeriod,
} from "./period";

const today = "2026-09-30";
const parse = (query: string, day = today) => parsePeriod(new URLSearchParams(query), day);

describe("parsePeriod", () => {
  it("starts the history on 16 July 2026", () => {
    expect(HISTORY_START).toBe("2026-07-16");
  });

  it("returns the default without a calendar parameter, whatever else the URL holds", () => {
    expect(parse("")).toBe("default");
    expect(parse("utm=x")).toBe("default");
  });

  it.each([
    ["day=2026-09-14", { kind: "day", day: "2026-09-14" }],
    ["day=2026-07-16", { kind: "day", day: "2026-07-16" }],
    ["day=2026-09-30", { kind: "day", day: "2026-09-30" }],
    ["month=2026-09", { kind: "month", month: "2026-09" }],
    ["month=2026-07", { kind: "month", month: "2026-07" }],
    ["quarter=2026-Q3", { kind: "quarter", year: 2026, quarter: 3 }],
    ["day=2026-09-14&utm=x", { kind: "day", day: "2026-09-14" }],
  ])("reads %s", (query, period) => {
    expect(parse(query)).toEqual(period);
  });

  it.each([
    "day=2026-9-14",
    "day=2026-09-31",
    "day=2026-02-30",
    "day=14.09.2026",
    "day=",
    "month=2026-13",
    "month=2026-9",
    "month=2026-09-01",
    "quarter=2026-Q5",
    "quarter=2026-q3",
    "quarter=2026Q3",
    "quarter=2026-Q0",
  ])("rejects the malformed %s", (query) => {
    expect(parse(query)).toBeNull();
  });

  it("rejects combined or repeated parameters", () => {
    expect(parse("day=2026-09-14&month=2026-09")).toBeNull();
    expect(parse("month=2026-09&quarter=2026-Q3")).toBeNull();
    expect(parse("month=2026-09&month=2026-08")).toBeNull();
  });

  it("rejects periods that end before 16 July 2026", () => {
    expect(parse("day=2026-07-15")).toBeNull();
    expect(parse("month=2026-06")).toBeNull();
    expect(parse("quarter=2026-Q2")).toBeNull();
    // Overlapping the start is enough.
    expect(parse("month=2026-07")).not.toBeNull();
  });

  it("rejects periods that start after today", () => {
    expect(parse("day=2026-10-01")).toBeNull();
    expect(parse("month=2026-10")).toBeNull();
    expect(parse("quarter=2026-Q4")).toBeNull();
    // A period that has started is allowed, even unfinished.
    expect(parse("quarter=2026-Q4", "2026-10-01")).toEqual({ kind: "quarter", year: 2026, quarter: 4 });
    expect(parse("month=2026-10", "2026-10-01")).toEqual({ kind: "month", month: "2026-10" });
  });
});

describe("defaultMonth", () => {
  it("opens the current month at 7 complete days and the previous one at 6", () => {
    expect(defaultMonth("2026-10-09", 7)).toBe("2026-10");
    expect(defaultMonth("2026-10-09", 6)).toBe("2026-09");
  });

  it("never opens a month before July 2026", () => {
    expect(defaultMonth("2026-07-20", 3)).toBe("2026-07");
    expect(defaultMonth("2026-08-03", 2)).toBe("2026-07");
  });

  it("steps back across New Year", () => {
    expect(defaultMonth("2027-01-04", 0)).toBe("2026-12");
  });
});

describe("periodDays", () => {
  it("lists a day, a month and a quarter in calendar order", () => {
    expect(periodDays({ kind: "day", day: "2026-09-14" })).toEqual(["2026-09-14"]);
    const september = periodDays({ kind: "month", month: "2026-09" });
    expect(september).toHaveLength(30);
    expect([september[0], september[29]]).toEqual(["2026-09-01", "2026-09-30"]);
    expect(periodDays({ kind: "month", month: "2028-02" })).toHaveLength(29);
    const q3 = periodDays({ kind: "quarter", year: 2026, quarter: 3 });
    expect(q3).toHaveLength(92);
    expect([q3[0], q3[91]]).toEqual(["2026-07-01", "2026-09-30"]);
  });

  it("counts a DST month by calendar days, not hours", () => {
    expect(periodDays({ kind: "month", month: "2026-10" })).toHaveLength(31);
    expect(periodDays({ kind: "month", month: "2027-03" })).toHaveLength(31);
  });
});

describe("periodInstants", () => {
  it("ends at the next Warsaw day's start", () => {
    expect(periodInstants({ kind: "day", day: "2026-09-27" })).toEqual({
      fromMs: Date.parse("2026-09-26T22:00:00Z"),
      toMs: Date.parse("2026-09-27T22:00:00Z"),
    });
  });

  it("covers 25 hours on the autumn change and 23 on the spring change", () => {
    expect(periodInstants({ kind: "day", day: "2026-10-25" })).toEqual({
      fromMs: Date.parse("2026-10-24T22:00:00Z"),
      toMs: Date.parse("2026-10-25T23:00:00Z"),
    });
    expect(periodInstants({ kind: "day", day: "2027-03-28" })).toEqual({
      fromMs: Date.parse("2027-03-27T23:00:00Z"),
      toMs: Date.parse("2027-03-28T22:00:00Z"),
    });
  });

  it("spans a month whose Warsaw offset changes inside it", () => {
    expect(periodInstants({ kind: "month", month: "2026-10" })).toEqual({
      fromMs: Date.parse("2026-09-30T22:00:00Z"),
      toMs: Date.parse("2026-10-31T23:00:00Z"),
    });
  });
});

describe("periodLabel", () => {
  it.each<[CalendarPeriod, string]>([
    [{ kind: "day", day: "2026-09-14" }, "14 września 2026, poniedziałek"],
    [{ kind: "month", month: "2026-09" }, "wrzesień 2026"],
    [{ kind: "quarter", year: 2026, quarter: 3 }, "III kwartał 2026"],
    [{ kind: "quarter", year: 2026, quarter: 4 }, "IV kwartał 2026"],
  ])("names %j as %s", (period, label) => {
    expect(periodLabel(period)).toBe(label);
  });
});

describe("adjacent", () => {
  it("steps by one period of the same kind", () => {
    expect(adjacent({ kind: "day", day: "2026-09-01" }, today)).toEqual({
      prev: { kind: "day", day: "2026-08-31" },
      next: { kind: "day", day: "2026-09-02" },
    });
    expect(adjacent({ kind: "month", month: "2026-08" }, today)).toEqual({
      prev: { kind: "month", month: "2026-07" },
      next: { kind: "month", month: "2026-09" },
    });
  });

  it("stops at 16 July 2026 and at today", () => {
    expect(adjacent({ kind: "day", day: "2026-07-16" }, today).prev).toBeNull();
    expect(adjacent({ kind: "day", day: "2026-09-30" }, today).next).toBeNull();
    expect(adjacent({ kind: "month", month: "2026-07" }, today).prev).toBeNull();
    expect(adjacent({ kind: "month", month: "2026-09" }, today).next).toBeNull();
    expect(adjacent({ kind: "quarter", year: 2026, quarter: 3 }, today)).toEqual({ prev: null, next: null });
  });

  it("steps quarters across New Year", () => {
    expect(adjacent({ kind: "quarter", year: 2027, quarter: 1 }, "2027-02-01")).toEqual({
      prev: { kind: "quarter", year: 2026, quarter: 4 },
      next: null,
    });
  });
});

describe("isOpenable", () => {
  it("opens a day equal to the history start and refuses the day before", () => {
    expect(isOpenable({ kind: "day", day: "2026-07-16" }, today)).toBe(true);
    expect(isOpenable({ kind: "day", day: "2026-07-15" }, today)).toBe(false);
  });

  it("opens a day equal to today and refuses the day after", () => {
    expect(isOpenable({ kind: "day", day: "2026-09-30" }, today)).toBe(true);
    expect(isOpenable({ kind: "day", day: "2026-10-01" }, today)).toBe(false);
  });

  it("opens a month or quarter that only overlaps the window", () => {
    // July 2026 ends on the 31st, after 16 July; October begins on today.
    expect(isOpenable({ kind: "month", month: "2026-07" }, today)).toBe(true);
    expect(isOpenable({ kind: "month", month: "2026-10" }, "2026-10-01")).toBe(true);
    expect(isOpenable({ kind: "month", month: "2026-10" }, today)).toBe(false);
  });
});

describe("adjacent across the new year", () => {
  it("steps a month between December and January", () => {
    expect(adjacent({ kind: "month", month: "2026-12" }, "2027-01-15")).toEqual({
      prev: { kind: "month", month: "2026-11" },
      next: { kind: "month", month: "2027-01" },
    });
    expect(adjacent({ kind: "month", month: "2027-01" }, "2027-01-15").prev).toEqual({
      kind: "month",
      month: "2026-12",
    });
  });

  it("does not offer January from December while today is still in December", () => {
    expect(adjacent({ kind: "month", month: "2026-12" }, "2026-12-31").next).toBeNull();
    expect(adjacent({ kind: "month", month: "2026-12" }, "2027-01-01").next).toEqual({
      kind: "month",
      month: "2027-01",
    });
  });

  it("steps a day between 31 December and 1 January", () => {
    expect(adjacent({ kind: "day", day: "2026-12-31" }, "2027-01-01")).toEqual({
      prev: { kind: "day", day: "2026-12-30" },
      next: { kind: "day", day: "2027-01-01" },
    });
    expect(adjacent({ kind: "day", day: "2027-01-01" }, "2027-01-01")).toEqual({
      prev: { kind: "day", day: "2026-12-31" },
      next: null,
    });
    expect(adjacent({ kind: "day", day: "2026-12-31" }, "2026-12-31").next).toBeNull();
  });
});

describe("toSearch", () => {
  it.each<CalendarPeriod>([
    { kind: "day", day: "2026-09-14" },
    { kind: "month", month: "2026-09" },
    { kind: "quarter", year: 2026, quarter: 3 },
  ])("round-trips %j through parsePeriod", (period) => {
    expect(parse(toSearch(period).slice(1))).toEqual(period);
  });

  it("builds the URL query", () => {
    expect(toSearch({ kind: "quarter", year: 2026, quarter: 3 })).toBe("?quarter=2026-Q3");
  });
});

describe("periodContaining", () => {
  it("finds the month and quarter of a day", () => {
    expect(periodContaining("day", "2026-09-14")).toEqual({ kind: "day", day: "2026-09-14" });
    expect(periodContaining("month", "2026-09-14")).toEqual({ kind: "month", month: "2026-09" });
    expect(periodContaining("quarter", "2026-09-14")).toEqual({ kind: "quarter", year: 2026, quarter: 3 });
    expect(periodContaining("quarter", "2026-10-01")).toEqual({ kind: "quarter", year: 2026, quarter: 4 });
  });
});

describe("month keys", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-07", 3)).toBe("2026-10");
  });

  it("lists a quarter's months", () => {
    expect(quarterMonths(2026, 3)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(quarterMonths(2026, 1)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("monthGrid", () => {
  it("pads a month starting on a Sunday to Monday-first weeks", () => {
    // 1 November 2026 is a Sunday.
    const weeks = monthGrid("2026-11");
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks[1][0]).toBe("2026-11-02");
    expect(weeks[5]).toEqual(["2026-11-30", null, null, null, null, null, null]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("needs no padding for a Monday-first February of 28 days", () => {
    // 1 February 2027 is a Monday.
    const weeks = monthGrid("2027-02");
    expect(weeks).toHaveLength(4);
    expect(weeks.flat()).not.toContain(null);
  });

  it("puts every day of September 2026 once, starting on a Tuesday", () => {
    const weeks = monthGrid("2026-09");
    expect(weeks[0]).toEqual([
      null,
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(weeks.flat().filter((d) => d !== null)).toEqual(periodDays({ kind: "month", month: "2026-09" }));
  });
});
