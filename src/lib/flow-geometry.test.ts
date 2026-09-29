import { describe, expect, it } from "vitest";
import { connector, JUNCTION_GAP } from "./flow-geometry";
import type { Rect } from "./flow-geometry";

// Junction centred on (120, 120), radius 20, so connectors stop 24 px from its centre.
const junction: Rect = { left: 100, top: 100, width: 40, height: 40 };
const STOP = 20 + JUNCTION_GAP;

function distanceToJunction(point: { x: number; y: number }): number {
  return Math.hypot(point.x - 120, point.y - 120);
}

describe("connector", () => {
  it("runs level from a node on the left and stops at the junction radius plus the gap", () => {
    const node: Rect = { left: 0, top: 100, width: 60, height: 40 };
    const result = connector(node, junction, "left", 1);
    expect(result.start).toEqual({ x: 60, y: 120 });
    expect(result.end.x).toBeCloseTo(120 - STOP);
    expect(result.end.y).toBeCloseTo(120);
    expect(result.angle).toBeCloseTo(0);
    expect(result.mid.x).toBeCloseTo((60 + 120 - STOP) / 2);
  });

  it("slopes down and right from a node above-left", () => {
    const result = connector({ left: 0, top: 0, width: 60, height: 40 }, junction, "left", 1);
    expect(result.start).toEqual({ x: 60, y: 20 });
    expect(result.angle).toBeGreaterThan(0);
    expect(result.angle).toBeLessThan(90);
    expect(distanceToJunction(result.end)).toBeCloseTo(STOP);
  });

  it("slopes down and left from a node above-right (anchored on its left edge)", () => {
    const result = connector({ left: 180, top: 0, width: 60, height: 40 }, junction, "right", 1);
    expect(result.start).toEqual({ x: 180, y: 20 });
    expect(result.angle).toBeGreaterThan(90);
    expect(result.angle).toBeLessThan(180);
    expect(distanceToJunction(result.end)).toBeCloseTo(STOP);
  });

  it("slopes up and right from a node below-left", () => {
    const result = connector({ left: 0, top: 200, width: 60, height: 40 }, junction, "left", 1);
    expect(result.start).toEqual({ x: 60, y: 220 });
    expect(result.angle).toBeGreaterThan(-90);
    expect(result.angle).toBeLessThan(0);
    expect(distanceToJunction(result.end)).toBeCloseTo(STOP);
  });

  it("slopes up and left from a node below-right", () => {
    const result = connector({ left: 180, top: 200, width: 60, height: 40 }, junction, "right", 1);
    expect(result.start).toEqual({ x: 180, y: 220 });
    expect(result.angle).toBeGreaterThan(-180);
    expect(result.angle).toBeLessThan(-90);
    expect(distanceToJunction(result.end)).toBeCloseTo(STOP);
  });

  it("swaps start and end and turns the arrow around when the direction is reversed", () => {
    const node: Rect = { left: 0, top: 0, width: 60, height: 40 };
    const forward = connector(node, junction, "left", 1);
    const back = connector(node, junction, "left", -1);
    expect(back.start).toEqual(forward.end);
    expect(back.end).toEqual(forward.start);
    expect(back.mid.x).toBeCloseTo(forward.mid.x);
    expect(back.mid.y).toBeCloseTo(forward.mid.y);
    expect(Math.abs(back.angle - forward.angle)).toBeCloseTo(180);
  });

  it("handles a node whose anchor sits on the junction centre without NaN", () => {
    const node: Rect = { left: 80, top: 100, width: 40, height: 40 };
    for (const direction of [1, -1] as const) {
      const result = connector(node, junction, "left", direction);
      expect(result.start).toEqual({ x: 120, y: 120 });
      expect(result.end).toEqual({ x: 120, y: 120 });
      expect(result.mid).toEqual({ x: 120, y: 120 });
      expect(result.angle).toBe(0);
    }
  });

  it("collapses to the anchor when the node is closer than the stop distance", () => {
    const node: Rect = { left: 60, top: 100, width: 50, height: 40 };
    const result = connector(node, junction, "left", 1);
    expect(result.start).toEqual({ x: 110, y: 120 });
    expect(result.end).toEqual({ x: 110, y: 120 });
    expect(Number.isFinite(result.angle)).toBe(true);
  });
});
