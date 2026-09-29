import { describe, expect, it } from "vitest";
import { CURVE_TENSION, flowPath, MIN_CONNECTOR_SPAN, NODE_GAP } from "./flow-geometry";
import type { Rect } from "./flow-geometry";

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
