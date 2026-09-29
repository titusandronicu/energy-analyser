import { MIN_FLOW_W } from "@/lib/flow-constants";

export type FlowNodeId = "pv" | "home" | "battery" | "grid";

export type ConnectorState =
  | { kind: "idle" }
  // direction 1 runs node to hub, -1 hub to node; `animated` moves the dashes, `dimmed` fades a stale snapshot.
  | { kind: "active"; direction: 1 | -1; animated: boolean; dimmed: boolean };

// One rule per connector: no reading or noise draws the dotted idle line; otherwise the physical direction, motion
// (the mapper's fresh, at least MIN_FLOW_W flag, and not paused) and staleness. PV always feeds the hub and the hub
// always feeds the home; grid import and battery discharge (positive) feed the hub, export and charge leave it.
export function connectorState(
  id: FlowNodeId,
  flow: { watts: number | null; moving: boolean },
  options: { paused: boolean; isStale: boolean },
): ConnectorState {
  const { watts } = flow;
  if (watts === null || Math.abs(watts) < MIN_FLOW_W) return { kind: "idle" };

  let direction: 1 | -1;
  if (id === "pv") direction = 1;
  else if (id === "home") direction = -1;
  else direction = watts > 0 ? 1 : -1;

  return { kind: "active", direction, animated: flow.moving && !options.paused, dimmed: options.isStale };
}
