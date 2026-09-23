import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { handleIngest, MAX_INGEST_BODY_BYTES, type IngestDeps, type IngestRpcResult } from "./ingest";

const examplePath = fileURLToPath(new URL("../../../docs/ingest/example-v1.json", import.meta.url));
const example = readFileSync(examplePath, "utf8");
const now = new Date("2026-09-23T12:01:00+02:00");

function deps(result: IngestRpcResult = { data: { status: "created" }, error: null }) {
  const rpc = vi.fn<IngestDeps["rpc"]>(() => Promise.resolve(result));
  const logError = vi.fn();
  return { rpc, logError, now: () => now };
}

function push(body: string, headers: Record<string, string> = { Authorization: "Bearer test-token" }) {
  return new Request("http://localhost/api/ingest", { method: "POST", headers, body });
}

describe("handleIngest", () => {
  it("returns 201 and passes the token and validated payload to the RPC", async () => {
    const d = deps();
    expect(await handleIngest(push(example), d)).toEqual({ status: 201, body: { status: "created" } });
    expect(d.rpc).toHaveBeenCalledWith("test-token", expect.objectContaining({ source: "homelab" }));
  });

  it("returns 200 for a duplicate", async () => {
    const response = await handleIngest(push(example), deps({ data: { status: "duplicate" }, error: null }));
    expect(response).toEqual({ status: 200, body: { status: "duplicate" } });
  });

  it("returns the same 401 for a missing, malformed or rejected token", async () => {
    const missing = await handleIngest(push(example, {}), deps());
    const malformed = await handleIngest(push(example, { Authorization: "Basic abc" }), deps());
    const rejected = await handleIngest(push(example), deps({ data: null, error: { code: "P0401", message: "x" } }));
    expect(missing).toEqual({ status: 401, body: { error: "unauthorized" } });
    expect(malformed).toEqual(missing);
    expect(rejected).toEqual(missing);
  });

  it("does not call the RPC without a token", async () => {
    const d = deps();
    await handleIngest(push(example, {}), d);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it("returns 409 for a capture-time conflict", async () => {
    const response = await handleIngest(push(example), deps({ data: null, error: { code: "P0409", message: "x" } }));
    expect(response.status).toBe(409);
  });

  it("returns 400 for malformed JSON", async () => {
    expect((await handleIngest(push("{not json"), deps())).status).toBe(400);
  });

  it("returns 422 with the path of the first schema issue", async () => {
    const payload = JSON.parse(example) as { state: Record<string, unknown> };
    payload.state.battery_soc_pct = 101;
    const response = await handleIngest(push(JSON.stringify(payload)), deps());
    expect(response.status).toBe(422);
    expect(response.body.path).toBe("state.battery_soc_pct");
  });

  it("accepts a body exactly at the size cap and rejects one byte over it", async () => {
    // Sizes are in bytes; the example contains multi-byte Polish characters.
    const padTo = (size: number) =>
      example.replace(/}\s*$/, "") + " ".repeat(size - Buffer.byteLength(example.trimEnd())) + "}";
    const atCap = await handleIngest(push(padTo(MAX_INGEST_BODY_BYTES)), deps());
    const overCap = await handleIngest(push(padTo(MAX_INGEST_BODY_BYTES + 1)), deps());
    expect(atCap.status).toBe(201);
    expect(overCap).toEqual({ status: 413, body: { error: "payload too large" } });
  });

  it("rejects an oversized Content-Length before reading the body", async () => {
    const request = push(example, {
      Authorization: "Bearer test-token",
      "Content-Length": String(MAX_INGEST_BODY_BYTES + 1),
    });
    expect((await handleIngest(request, deps())).status).toBe(413);
  });

  it("returns a generic 500 and logs the detail on other RPC errors", async () => {
    const d = deps({ data: null, error: { code: "42501", message: "permission denied" } });
    expect(await handleIngest(push(example), d)).toEqual({ status: 500, body: { error: "ingest failed" } });
    expect(d.logError).toHaveBeenCalled();
  });

  it("returns 500 on an unexpected RPC result", async () => {
    expect((await handleIngest(push(example), deps({ data: { status: "weird" }, error: null }))).status).toBe(500);
  });
});
