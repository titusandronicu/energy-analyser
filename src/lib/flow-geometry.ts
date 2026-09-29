// Connector geometry for the live flow diagram. Pure, so it is tested without a component runner.
// Rects are plain numbers relative to the stage that holds the diagram.
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Connector {
  start: Point;
  end: Point;
  // Where the arrowhead sits, and the direction (degrees, SVG orientation: 0 = right, 90 = down) it points.
  mid: Point;
  angle: number;
}

// Space kept between a connector and the junction circle.
export const JUNCTION_GAP = 4;
// Space kept between a flow path and its node's edge, so the arrowhead does not touch the icon tile.
export const NODE_GAP = 6;
// Control points sit this share of the horizontal span in from each end (the artboards' 80/180).
export const CURVE_TENSION = 0.44;
// Below this horizontal span nothing is drawn (a narrow phone leaves no room for a connector).
export const MIN_CONNECTOR_SPAN = 12;
// Under this vertical difference the path is a straight line.
const STRAIGHT_DY = 0.5;

export interface FlowPath {
  d: string;
  // The path's own ends in its direction of travel; the arrowhead tip sits at `end`.
  start: Point;
  end: Point;
  // The chevron's rotation: connectors always leave and enter horizontally, so it is never diagonal.
  angle: 0 | 180;
}

const fmt = (n: number): string => n.toFixed(1);

// One-left, hub, three-right arrangement: every connector meets the hub horizontally at its vertical centre and the
// node at the vertical middle of its facing edge, as a straight line (equal y) or an S-curve with horizontal tangents.
// direction 1 runs node to hub, -1 hub to node; reversing swaps start, end and the control points, so the same curve
// is drawn the other way. Returns null when the horizontal span is under MIN_CONNECTOR_SPAN or the node overlaps the hub.
export function flowPath(nodeRect: Rect, hubRect: Rect, side: "left" | "right", direction: 1 | -1): FlowPath | null {
  const hubCentre: Point = { x: hubRect.left + hubRect.width / 2, y: hubRect.top + hubRect.height / 2 };
  const reach = hubRect.width / 2 + JUNCTION_GAP;
  const nodeAnchor: Point =
    side === "left"
      ? { x: nodeRect.left + nodeRect.width + NODE_GAP, y: nodeRect.top + nodeRect.height / 2 }
      : { x: nodeRect.left - NODE_GAP, y: nodeRect.top + nodeRect.height / 2 };
  const hubAnchor: Point = { x: side === "left" ? hubCentre.x - reach : hubCentre.x + reach, y: hubCentre.y };

  const span = side === "left" ? hubAnchor.x - nodeAnchor.x : nodeAnchor.x - hubAnchor.x;
  if (!Number.isFinite(span) || span < MIN_CONNECTOR_SPAN) return null;

  const start = direction === 1 ? nodeAnchor : hubAnchor;
  const end = direction === 1 ? hubAnchor : nodeAnchor;
  const angle = end.x > start.x ? 0 : 180;

  if (Math.abs(end.y - start.y) < STRAIGHT_DY) {
    return { d: `M${fmt(start.x)} ${fmt(start.y)} L${fmt(end.x)} ${fmt(end.y)}`, start, end, angle };
  }

  const run = span * CURVE_TENSION * (angle === 0 ? 1 : -1);
  const d = `M${fmt(start.x)} ${fmt(start.y)} C${fmt(start.x + run)} ${fmt(start.y)} ${fmt(end.x - run)} ${fmt(end.y)} ${fmt(end.x)} ${fmt(end.y)}`;
  return { d, start, end, angle };
}

// The node's anchor is its edge facing the junction at vertical middle: the right edge for a node on the left,
// the left edge for a node on the right. The line stops at the junction circle's radius plus JUNCTION_GAP.
// direction 1 runs from the node to the junction, -1 the reverse (start and end swap).
export function connector(nodeRect: Rect, junctionRect: Rect, side: "left" | "right", direction: 1 | -1): Connector {
  const anchor: Point = {
    x: side === "left" ? nodeRect.left + nodeRect.width : nodeRect.left,
    y: nodeRect.top + nodeRect.height / 2,
  };
  const centre: Point = {
    x: junctionRect.left + junctionRect.width / 2,
    y: junctionRect.top + junctionRect.height / 2,
  };
  const radius = junctionRect.width / 2 + JUNCTION_GAP;

  const dx = centre.x - anchor.x;
  const dy = centre.y - anchor.y;
  const length = Math.hypot(dx, dy);
  // A node that touches (or overlaps) the junction's reach has nothing left to draw: the line collapses to a point.
  const reach = length === 0 ? 0 : Math.max(0, length - radius);
  const stop: Point =
    length === 0 ? anchor : { x: anchor.x + (dx / length) * reach, y: anchor.y + (dy / length) * reach };

  const start = direction === 1 ? anchor : stop;
  const end = direction === 1 ? stop : anchor;
  const sx = end.x - start.x;
  const sy = end.y - start.y;

  return {
    start,
    end,
    mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    angle: sx === 0 && sy === 0 ? 0 : (Math.atan2(sy, sx) * 180) / Math.PI,
  };
}
