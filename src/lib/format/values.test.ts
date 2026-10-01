// All data here is synthetic.
import { describe, expect, it } from "vitest";
import { asNumber, asRecord, plnLabel } from "./values";

// plnLabel joins the amount and "zł" with a plain space; Intl.NumberFormat("pl-PL") groups thousands with a no-break space (U+00A0).
const nbsp = " ";

describe("asNumber", () => {
  it.each([
    [0, 0],
    [-4.5, -4.5],
    [12.34, 12.34],
  ])("passes the finite number %j through", (value, result) => {
    expect(asNumber(value)).toBe(result);
  });

  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["a numeric string", "12.5"],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a boolean", true],
    ["an array holding a number", [5]],
    ["an object", { value: 5 }],
  ])("reads %s as not a number", (_name, value) => {
    expect(asNumber(value)).toBeNull();
  });
});

describe("asRecord", () => {
  it("returns a plain object unchanged", () => {
    const value = { a: 1 };
    expect(asRecord(value)).toBe(value);
  });

  it.each([
    ["an array", [1, 2]],
    ["null", null],
    ["undefined", undefined],
    ["a string", "abc"],
    ["a number", 7],
    ["a boolean", false],
  ])("reads %s as an empty record", (_name, value) => {
    expect(asRecord(value)).toEqual({});
  });
});

describe("plnLabel", () => {
  // Whole złoty, halves away from zero: the card shows estimates, not grosze.
  it.each([
    [0, `0 zł`],
    [257.73, `258 zł`],
    [360.4, `360 zł`],
    [214.5, `215 zł`],
    [214.49, `214 zł`],
    [0.5, `1 zł`],
    [0.49, `0 zł`],
  ])("shows %d as %j", (value, label) => {
    expect(plnLabel(value)).toBe(label);
  });

  it.each([
    [-12.4, `-12 zł`],
    [-12.5, `-13 zł`],
  ])("keeps the sign of the negative %d", (value, label) => {
    expect(plnLabel(value).replace("−", "-")).toBe(label);
  });

  it.each([
    [1234, `1234 zł`],
    [1234567.8, `1${nbsp}234${nbsp}568 zł`],
  ])("shows the large value %d as %j", (value, label) => {
    expect(plnLabel(value)).toBe(label);
  });

  it.each([NaN, Infinity, null, undefined, "258", {}])("shows a dash for %j", (value) => {
    expect(plnLabel(value)).toBe("—");
  });
});
