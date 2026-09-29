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
