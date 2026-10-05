import { describe, expect, it } from "vitest";
import { createLogger, emailHash, serializeError } from "./logger";

const NOW = new Date("2026-10-05T10:00:00.000Z");

function capture(fields?: Record<string, unknown>) {
  const lines: string[] = [];
  const log = createLogger({
    version: "abc1234",
    environment: "production",
    fields,
    write: (line) => lines.push(line),
    now: () => NOW,
  });
  return { log, lines, parsed: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>) };
}

describe("createLogger", () => {
  it("writes one JSON line with the standard fields first", () => {
    const { log, lines } = capture();
    log.error("something_failed", { section: "dashboard.live-state" });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      ts: "2026-10-05T10:00:00.000Z",
      level: "error",
      event: "something_failed",
      version: "abc1234",
      env: "production",
      section: "dashboard.live-state",
    });
    expect(Object.keys(JSON.parse(lines[0]) as object).slice(0, 5)).toEqual(["ts", "level", "event", "version", "env"]);
  });

  it("writes warn lines at level warn", () => {
    const { log, parsed } = capture();
    log.warn("origin_rejected");
    expect(parsed()[0]).toMatchObject({ level: "warn", event: "origin_rejected" });
  });

  it("adds the fields of a child to every line, and a call's own fields win over them", () => {
    const { log, parsed } = capture({ requestId: "root" });
    const child = log.child({ requestId: "req-12345678", method: "GET" });
    child.error("a");
    child.error("b", { method: "POST" });
    expect(parsed()[0]).toMatchObject({ requestId: "req-12345678", method: "GET" });
    expect(parsed()[1]).toMatchObject({ requestId: "req-12345678", method: "POST" });
  });

  it("does not let a field overwrite the standard ones", () => {
    const { log, parsed } = capture();
    log.error("real_event", { level: "info", event: "fake", version: "x", env: "y", ts: "never" });
    expect(parsed()[0]).toMatchObject({
      ts: "2026-10-05T10:00:00.000Z",
      level: "error",
      event: "real_event",
      version: "abc1234",
      env: "production",
    });
  });

  it("serializes the err field, including a Supabase-style object and a cause chain", () => {
    const { log, parsed } = capture();
    log.error("loader_failed", { err: { message: "permission denied", code: "42501", details: "d", hint: "h" } });
    expect(parsed()[0].err).toEqual({ message: "permission denied", code: "42501", details: "d", hint: "h" });

    const root = new Error("root cause");
    const wrapped = new Error("loading X failed: boom", { cause: root });
    log.error("loader_failed", { err: wrapped });
    const err = parsed()[1].err as Record<string, unknown>;
    expect(err).toMatchObject({ name: "Error", message: "loading X failed: boom", cause: { message: "root cause" } });
    expect(typeof err.stack).toBe("string");
  });

  it("keeps the event when a field cannot be serialized", () => {
    const { log, parsed } = capture();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => {
      log.error("odd_event", { circular });
    }).not.toThrow();
    expect(parsed()[0]).toMatchObject({ event: "odd_event", logError: "unserializable fields" });
  });
});

describe("serializeError", () => {
  it("keeps name, message, code, status, details, hint and stack", () => {
    const error = Object.assign(new Error("fetch failed"), { status: 0, code: "ECONNREFUSED" });
    expect(serializeError(error)).toMatchObject({
      name: "Error",
      message: "fetch failed",
      status: 0,
      code: "ECONNREFUSED",
    });
  });

  it("follows cause three levels below the error and then stops", () => {
    // Five errors deep: the error itself plus three causes are kept, the fifth is cut.
    const e5 = new Error("e5");
    const e4 = new Error("e4", { cause: e5 });
    const e3 = new Error("e3", { cause: e4 });
    const e2 = new Error("e2", { cause: e3 });
    const e1 = new Error("e1", { cause: e2 });
    const out = serializeError(e1) as { cause: { cause: { cause: Record<string, unknown> } } };
    expect(out.cause.cause.cause.message).toBe("e4");
    expect(out.cause.cause.cause.cause).toBeUndefined();
  });

  it("wraps a value that is not an object", () => {
    expect(serializeError("plain text")).toEqual({ value: "plain text" });
    expect(serializeError(null)).toEqual({ value: "null" });
    expect(serializeError(42)).toEqual({ value: "42" });
  });
});

describe("emailHash", () => {
  it("is 8 hex characters, stable, and ignores case and surrounding spaces", () => {
    const hash = emailHash("Owner@Example.com");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(emailHash("  owner@example.com ")).toBe(hash);
  });

  it("differs between addresses and never contains the address", () => {
    expect(emailHash("a@example.com")).not.toBe(emailHash("b@example.com"));
    expect(emailHash("owner@example.com")).not.toContain("owner");
  });
});
