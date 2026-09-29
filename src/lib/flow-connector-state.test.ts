import { describe, expect, it } from "vitest";
import { connectorState } from "./flow-connector-state";
import { MIN_FLOW_W } from "./flow-constants";

const fresh = { paused: false, isStale: false };

function active(direction: 1 | -1, animated = true, dimmed = false) {
  return { kind: "active", direction, animated, dimmed };
}

describe("connectorState direction", () => {
  it("PV always feeds the hub", () => {
    expect(connectorState("pv", { watts: 3100, moving: true }, fresh)).toEqual(active(1));
    expect(connectorState("pv", { watts: -3100, moving: true }, fresh)).toEqual(active(1));
  });

  it("the hub always feeds the home", () => {
    expect(connectorState("home", { watts: 900, moving: true }, fresh)).toEqual(active(-1));
    expect(connectorState("home", { watts: -900, moving: true }, fresh)).toEqual(active(-1));
  });

  it("grid import feeds the hub and export leaves it", () => {
    expect(connectorState("grid", { watts: 1800, moving: true }, fresh)).toEqual(active(1));
    expect(connectorState("grid", { watts: -1800, moving: true }, fresh)).toEqual(active(-1));
  });

  it("battery discharge feeds the hub and charge leaves it", () => {
    expect(connectorState("battery", { watts: 500, moving: true }, fresh)).toEqual(active(1));
    expect(connectorState("battery", { watts: -500, moving: true }, fresh)).toEqual(active(-1));
  });
});

describe("connectorState idle", () => {
  it("is idle for a missing reading", () => {
    for (const id of ["pv", "home", "grid", "battery"] as const) {
      expect(connectorState(id, { watts: null, moving: false }, fresh)).toEqual({ kind: "idle" });
    }
  });

  it("is active at exactly MIN_FLOW_W and idle one watt below, in both signs", () => {
    expect(MIN_FLOW_W).toBe(50);
    expect(connectorState("grid", { watts: 50, moving: true }, fresh)).toEqual(active(1));
    expect(connectorState("grid", { watts: 49, moving: false }, fresh)).toEqual({ kind: "idle" });
    expect(connectorState("grid", { watts: -50, moving: true }, fresh)).toEqual(active(-1));
    expect(connectorState("grid", { watts: -49, moving: false }, fresh)).toEqual({ kind: "idle" });
    expect(connectorState("battery", { watts: -50, moving: true }, fresh)).toEqual(active(-1));
    expect(connectorState("battery", { watts: -49, moving: false }, fresh)).toEqual({ kind: "idle" });
    expect(connectorState("pv", { watts: 0, moving: false }, fresh)).toEqual({ kind: "idle" });
  });

  it("stays idle when stale", () => {
    expect(connectorState("grid", { watts: 30, moving: false }, { paused: false, isStale: true })).toEqual({
      kind: "idle",
    });
    expect(connectorState("pv", { watts: null, moving: false }, { paused: true, isStale: true })).toEqual({
      kind: "idle",
    });
  });
});

describe("connectorState motion and staleness", () => {
  it("is not animated but dimmed on a stale snapshot", () => {
    expect(connectorState("grid", { watts: 2000, moving: false }, { paused: false, isStale: true })).toEqual(
      active(1, false, true),
    );
  });

  it("is not animated when paused, even if the flow is moving", () => {
    expect(connectorState("pv", { watts: 3100, moving: true }, { paused: true, isStale: false })).toEqual(
      active(1, false, false),
    );
  });

  it("is not animated when the mapper says the flow is not moving", () => {
    expect(connectorState("pv", { watts: 3100, moving: false }, fresh)).toEqual(active(1, false, false));
  });

  it("is animated only when moving and not paused, and dimmed follows staleness alone", () => {
    expect(connectorState("battery", { watts: -500, moving: true }, fresh)).toEqual(active(-1, true, false));
    expect(connectorState("battery", { watts: -500, moving: true }, { paused: true, isStale: true })).toEqual(
      active(-1, false, true),
    );
  });
});
