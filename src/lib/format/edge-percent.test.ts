import { describe, expect, it } from "vitest";
import { edgePercentLabel } from "./edge-percent";

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
