import { describe, expect, it } from "vitest";
import { connector, CURVE_TENSION, flowPath, JUNCTION_GAP, MIN_CONNECTOR_SPAN, NODE_GAP } from "./flow-geometry";
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

// Hub centred on (138, 138), radius 38: the left anchor is at x 96, the right anchor at x 180.
const hub: Rect = { left: 100, top: 100, width: 76, height: 76 };

describe("flowPath constants", () => {
  it("keeps the documented values", () => {
    expect(NODE_GAP).toBe(6);
    expect(CURVE_TENSION).toBe(0.44);
    expect(MIN_CONNECTOR_SPAN).toBe(12);
  });
});

describe("flowPath", () => {
  it("draws PV as a straight line into the hub when the y values match", () => {
    const result = flowPath({ left: 0, top: 118, width: 60, height: 40 }, hub, "left", 1);
    expect(result).toEqual({
      d: "M66.0 138.0 L96.0 138.0",
      start: { x: 66, y: 138 },
      end: { x: 96, y: 138 },
      angle: 0,
    });
  });

  it("draws battery discharge from the node into the hub, pointing left", () => {
    const result = flowPath({ left: 300, top: 118, width: 100, height: 40 }, hub, "right", 1);
    expect(result).toEqual({
      d: "M294.0 138.0 L180.0 138.0",
      start: { x: 294, y: 138 },
      end: { x: 180, y: 138 },
      angle: 180,
    });
  });

  it("draws battery charge from the hub to the node, pointing right", () => {
    const result = flowPath({ left: 300, top: 118, width: 100, height: 40 }, hub, "right", -1);
    expect(result).toEqual({
      d: "M180.0 138.0 L294.0 138.0",
      start: { x: 180, y: 138 },
      end: { x: 294, y: 138 },
      angle: 0,
    });
  });

  it("draws Home forward (hub to node) as an S-curve with horizontal tangents", () => {
    const result = flowPath({ left: 300, top: 20, width: 100, height: 40 }, hub, "right", -1);
    expect(result?.d).toBe("M180.0 138.0 C230.2 138.0 243.8 40.0 294.0 40.0");
    expect(result?.start).toEqual({ x: 180, y: 138 });
    expect(result?.end).toEqual({ x: 294, y: 40 });
    expect(result?.angle).toBe(0);
  });

  it("draws Home reversed with swapped ends and control points", () => {
    const result = flowPath({ left: 300, top: 20, width: 100, height: 40 }, hub, "right", 1);
    expect(result?.d).toBe("M294.0 40.0 C243.8 40.0 230.2 138.0 180.0 138.0");
    expect(result?.start).toEqual({ x: 294, y: 40 });
    expect(result?.end).toEqual({ x: 180, y: 138 });
    expect(result?.angle).toBe(180);
  });

  it("draws Grid import from the node into the hub, pointing left", () => {
    const result = flowPath({ left: 300, top: 216, width: 100, height: 40 }, hub, "right", 1);
    expect(result?.d).toBe("M294.0 236.0 C243.8 236.0 230.2 138.0 180.0 138.0");
    expect(result?.angle).toBe(180);
  });

  it("draws Grid export from the hub to the node, pointing right", () => {
    const result = flowPath({ left: 300, top: 216, width: 100, height: 40 }, hub, "right", -1);
    expect(result?.d).toBe("M180.0 138.0 C230.2 138.0 243.8 236.0 294.0 236.0");
    expect(result?.angle).toBe(0);
  });

  it("returns null when the horizontal span is below the minimum and a path at the minimum", () => {
    // Right anchor 180: a node at left 197 anchors at 191, a span of 11; at 198 the span is 12.
    expect(flowPath({ left: 197, top: 20, width: 100, height: 40 }, hub, "right", 1)).toBeNull();
    expect(flowPath({ left: 198, top: 20, width: 100, height: 40 }, hub, "right", 1)).not.toBeNull();
    // Left anchor 96: a node ending at 79 anchors at 85 (span 11); ending at 78 anchors at 84 (span 12).
    expect(flowPath({ left: 19, top: 118, width: 60, height: 40 }, hub, "left", 1)).toBeNull();
    expect(flowPath({ left: 18, top: 118, width: 60, height: 40 }, hub, "left", 1)).not.toBeNull();
  });

  it("returns null for a node that touches or overlaps the hub", () => {
    expect(flowPath({ left: 100, top: 118, width: 60, height: 40 }, hub, "left", 1)).toBeNull();
    expect(flowPath({ left: 150, top: 20, width: 100, height: 40 }, hub, "right", -1)).toBeNull();
  });

  it("draws a straight line when the y values differ by under half a pixel", () => {
    const result = flowPath({ left: 300, top: 118.4, width: 100, height: 40 }, hub, "right", 1);
    expect(result?.d).toBe("M294.0 138.4 L180.0 138.0");
    const curved = flowPath({ left: 300, top: 118.5, width: 100, height: 40 }, hub, "right", 1);
    expect(curved?.d).toBe("M294.0 138.5 C243.8 138.5 230.2 138.0 180.0 138.0");
  });

  it("returns finite paths for zero-size rects and never NaN", () => {
    const zeroHub: Rect = { left: 100, top: 100, width: 0, height: 0 };
    const zeroNode: Rect = { left: 300, top: 20, width: 0, height: 0 };
    const result = flowPath(zeroNode, zeroHub, "right", 1);
    // Hub anchor 100 + 4, node anchor 300 - 6: span 190, hub centre y 100, node y 20.
    expect(result?.d).toBe("M294.0 20.0 C210.4 20.0 187.6 100.0 104.0 100.0");
    expect(result?.d).not.toContain("NaN");
    const all = flowPath({ left: 0, top: 0, width: 0, height: 0 }, zeroHub, "left", -1);
    expect(all?.d).toBe("M96.0 100.0 C56.4 100.0 45.6 0.0 6.0 0.0");
    expect(all?.angle).toBe(180);
  });
});
