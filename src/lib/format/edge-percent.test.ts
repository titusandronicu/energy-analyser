import { describe, expect, it } from "vitest";
import { edgePercentLabel, edgePointsLabel } from "./edge-percent";

describe("edgePercentLabel", () => {
  it.each([
    [20.0, 20, true, "+20,0%"],
    [20.3, 20, false, "+20,3%"],
    // Past the edge but rounding to the edge: clamped to one tenth beyond it.
    [20.04, 20, false, "+20,1%"],
    // Short of the edge but rounding to it or beyond: clamped to the edge.
    [19.96, 20, true, "+20,0%"],
    [-15.04, 15, true, "−15,0%"],
    [-15.4, 15, false, "−15,4%"],
  ])("labels %d against an edge of %d (milder %s) as %s", (raw, edge, milder, expected) => {
    expect(edgePercentLabel(raw, edge, milder)).toBe(expected);
  });
});

describe("edgePointsLabel", () => {
  it.each([
    [10.0, 10, true, "10,0 punktu"],
    [-10.0, 10, true, "10,0 punktu"],
    [10.1, 10, false, "10,1 punktu"],
    [-10.1, 10, false, "10,1 punktu"],
    // Past the edge but rounding to it: one tenth beyond it.
    [10.02, 10, false, "10,1 punktu"],
    // Short of the edge but rounding to it: the edge.
    [9.98, 10, true, "10,0 punktu"],
    [-25.387, 10, false, "25,4 punktu"],
    [4.532, 10, true, "4,5 punktu"],
    [0, 10, true, "0,0 punktu"],
  ])("labels %d against an edge of %d (milder %s) as %s", (raw, edge, milder, expected) => {
    expect(edgePointsLabel(raw, edge, milder)).toBe(expected);
  });
});
