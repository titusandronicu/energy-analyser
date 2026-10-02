import { describe, expect, it } from "vitest";
import { HISTORY_PATH, periodHref, periodNav } from "./nav";

describe("periodHref", () => {
  it("links openable periods and nothing before the history or after today", () => {
    expect(periodHref({ kind: "month", month: "2026-09" }, "2026-09-30")).toBe(`${HISTORY_PATH}?month=2026-09`);
    expect(periodHref({ kind: "day", day: "2026-07-16" }, "2026-09-30")).toBe(`${HISTORY_PATH}?day=2026-07-16`);
    expect(periodHref({ kind: "day", day: "2026-07-15" }, "2026-09-30")).toBeNull();
    expect(periodHref({ kind: "day", day: "2026-10-01" }, "2026-09-30")).toBeNull();
    expect(periodHref({ kind: "month", month: "2026-11" }, "2026-10-10")).toBeNull();
    expect(periodHref({ kind: "quarter", year: 2026, quarter: 3 }, "2026-09-30")).toBe(
      `${HISTORY_PATH}?quarter=2026-Q3`,
    );
  });
});

describe("periodNav", () => {
  it("names the neighbouring periods and stops at the history start and today", () => {
    const july = periodNav({ kind: "month", month: "2026-07" }, "2026-09-30");
    expect(july.label).toBe("lipiec 2026");
    expect(july.prev).toBeNull();
    expect(july.next).toEqual({ href: `${HISTORY_PATH}?month=2026-08`, label: "Następny miesiąc: sierpień 2026" });

    const today = periodNav({ kind: "day", day: "2026-09-30" }, "2026-09-30");
    expect(today.next).toBeNull();
    expect(today.prev).toEqual({
      href: `${HISTORY_PATH}?day=2026-09-29`,
      label: "Poprzedni dzień: 29 września 2026, wtorek",
    });

    const q3 = periodNav({ kind: "quarter", year: 2026, quarter: 3 }, "2026-09-30");
    expect(q3.prev).toBeNull();
    expect(q3.next).toBeNull();
  });

  it("switches kind around the period's last day, never after today or before the history start", () => {
    const kinds = (nav: ReturnType<typeof periodNav>) => nav.kinds.map((k) => [k.word, k.href, k.current]);
    expect(kinds(periodNav({ kind: "month", month: "2026-09" }, "2026-09-14"))).toEqual([
      ["Dzień", `${HISTORY_PATH}?day=2026-09-14`, false],
      ["Miesiąc", `${HISTORY_PATH}?month=2026-09`, true],
      ["Kwartał", `${HISTORY_PATH}?quarter=2026-Q3`, false],
    ]);
    expect(kinds(periodNav({ kind: "month", month: "2026-08" }, "2026-09-30"))[0][1]).toBe(
      `${HISTORY_PATH}?day=2026-08-31`,
    );
    expect(kinds(periodNav({ kind: "quarter", year: 2026, quarter: 3 }, "2026-10-02"))[1][1]).toBe(
      `${HISTORY_PATH}?month=2026-09`,
    );
    expect(kinds(periodNav({ kind: "day", day: "2026-07-16" }, "2026-09-30"))).toEqual([
      ["Dzień", `${HISTORY_PATH}?day=2026-07-16`, true],
      ["Miesiąc", `${HISTORY_PATH}?month=2026-07`, false],
      ["Kwartał", `${HISTORY_PATH}?quarter=2026-Q3`, false],
    ]);
  });

  it("names the previous and next link for every kind", () => {
    const month = periodNav({ kind: "month", month: "2026-08" }, "2026-09-30");
    expect(month.prev).toEqual({ href: `${HISTORY_PATH}?month=2026-07`, label: "Poprzedni miesiąc: lipiec 2026" });
    expect(month.next).toEqual({ href: `${HISTORY_PATH}?month=2026-09`, label: "Następny miesiąc: wrzesień 2026" });

    const day = periodNav({ kind: "day", day: "2026-09-29" }, "2026-09-30");
    expect(day.next).toEqual({
      href: `${HISTORY_PATH}?day=2026-09-30`,
      label: "Następny dzień: 30 września 2026, środa",
    });

    const quarter = periodNav({ kind: "quarter", year: 2026, quarter: 4 }, "2027-04-15");
    expect(quarter.prev?.label).toMatch(/^Poprzedni kwartał: /);
    expect(quarter.prev?.href).toBe(`${HISTORY_PATH}?quarter=2026-Q3`);
    expect(quarter.next?.label).toMatch(/^Następny kwartał: /);
    expect(quarter.next?.href).toBe(`${HISTORY_PATH}?quarter=2027-Q1`);
  });

  it("keeps every switch openable even for a period wholly before the history start", () => {
    // The URL parser never produces this period, but periodNav is exported: the switch anchors on the history start.
    const nav = periodNav({ kind: "day", day: "2026-01-05" }, "2026-09-30");
    expect(nav.kinds.map((k) => [k.word, k.href, k.current])).toEqual([
      ["Dzień", `${HISTORY_PATH}?day=2026-01-05`, true],
      ["Miesiąc", `${HISTORY_PATH}?month=2026-07`, false],
      ["Kwartał", `${HISTORY_PATH}?quarter=2026-Q3`, false],
    ]);
  });
});
