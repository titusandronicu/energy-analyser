import { describe, expect, it } from "vitest";
import { CLOCK_SKEW_MS, DAY_MS, formatAge, HOUR_MS, MINUTE_MS } from "./age";

describe("formatAge", () => {
  it.each([
    [0, "0 min"],
    [5 * MINUTE_MS, "5 min"],
    [59 * MINUTE_MS + 59_000, "59 min"],
    [60 * MINUTE_MS, "1 godz."],
    [2 * 60 * MINUTE_MS + 30 * MINUTE_MS, "2 godz."],
    [24 * 60 * MINUTE_MS - 1, "23 godz."],
    [24 * 60 * MINUTE_MS, "1 dzień"],
    [3 * 24 * 60 * MINUTE_MS + 5 * MINUTE_MS, "3 dni"],
    [-5 * MINUTE_MS, "0 min"],
  ])("formats %i ms as %s", (ms, label) => {
    expect(formatAge(ms)).toBe(label);
  });
});

describe("time units", () => {
  it("have their documented values", () => {
    expect(MINUTE_MS).toBe(60_000);
    expect(HOUR_MS).toBe(3_600_000);
    expect(DAY_MS).toBe(86_400_000);
  });

  it("allow a producer clock to run five minutes ahead", () => {
    expect(CLOCK_SKEW_MS).toBe(300_000);
  });
});
