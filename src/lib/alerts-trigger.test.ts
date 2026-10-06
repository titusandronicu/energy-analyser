import { describe, expect, it, vi } from "vitest";
import { DEFAULT_INTERVAL_SECONDS, parseConfig, pingHeartbeat, runOnce } from "../../scripts/alerts-trigger.mjs";

// scripts/alerts-trigger.mjs is the loop the `alerts-trigger` compose service runs on the production host. Everything
// here is invented: the token and the address are placeholders, and the answers are literals written in the test.

const TOKEN = "invented-alerts-token-for-the-test";
const URL_BASE = "http://[2001:db8::1]:20170";
const config = { url: URL_BASE, token: TOKEN };

const answer = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

describe("parseConfig", () => {
  const valid = { ALERTS_URL: URL_BASE, ALERTS_TOKEN: TOKEN };

  it("accepts the address and the token and defaults the interval to five minutes", () => {
    expect(parseConfig(valid)).toEqual({
      config: { url: URL_BASE, token: TOKEN, intervalMs: 300_000, heartbeatUrl: null },
    });
    expect(DEFAULT_INTERVAL_SECONDS).toBe(300);
  });

  it("drops a trailing slash and surrounding spaces", () => {
    expect(parseConfig({ ALERTS_URL: ` ${URL_BASE}/ `, ALERTS_TOKEN: ` ${TOKEN} ` })).toEqual({
      config: { url: URL_BASE, token: TOKEN, intervalMs: 300_000, heartbeatUrl: null },
    });
  });

  it("reads the interval in whole seconds and accepts both edges, 60 and 3600", () => {
    expect(parseConfig({ ...valid, ALERTS_INTERVAL_SECONDS: "60" })).toMatchObject({ config: { intervalMs: 60_000 } });
    expect(parseConfig({ ...valid, ALERTS_INTERVAL_SECONDS: "3600" })).toMatchObject({
      config: { intervalMs: 3_600_000 },
    });
  });

  it.each(["59", "3601", "0", "-60", "90.5", "five", "NaN"])("refuses an interval of %s", (value) => {
    expect(parseConfig({ ...valid, ALERTS_INTERVAL_SECONDS: value })).toEqual({
      error: "ALERTS_INTERVAL_SECONDS must be a whole number from 60 to 3600",
    });
  });

  it("treats an empty interval as unset", () => {
    expect(parseConfig({ ...valid, ALERTS_INTERVAL_SECONDS: "" })).toMatchObject({ config: { intervalMs: 300_000 } });
  });

  it.each([undefined, "", "   ", "localhost:20170", "ftp://host", "http://"])("refuses the address %j", (value) => {
    expect(parseConfig({ ...valid, ALERTS_URL: value })).toEqual({
      error: "ALERTS_URL must be an http:// or https:// address",
    });
  });

  it.each([undefined, "", "   "])("refuses the token %j", (value) => {
    expect(parseConfig({ ...valid, ALERTS_TOKEN: value })).toEqual({ error: "ALERTS_TOKEN is missing" });
  });

  it("reads an optional heartbeat address, refuses a malformed one and never echoes it", () => {
    const beat = "https://kuma.example/api/push/SYNTHETIC-secret?status=up";
    expect(parseConfig({ ...valid, ALERTS_HEARTBEAT_URL: ` ${beat} ` })).toMatchObject({
      config: { heartbeatUrl: beat },
    });
    expect(parseConfig({ ...valid, ALERTS_HEARTBEAT_URL: "" })).toMatchObject({ config: { heartbeatUrl: null } });
    const refused = parseConfig({ ...valid, ALERTS_HEARTBEAT_URL: "kuma/SYNTHETIC-secret" });
    expect(refused).toEqual({ error: "ALERTS_HEARTBEAT_URL must be an http:// or https:// address" });
  });

  it("never puts the token or the address into an error message", () => {
    const refused = [
      parseConfig({ ALERTS_URL: "not-a-url", ALERTS_TOKEN: TOKEN }),
      parseConfig({ ALERTS_URL: URL_BASE, ALERTS_TOKEN: TOKEN, ALERTS_INTERVAL_SECONDS: "5" }),
    ];
    for (const result of refused) {
      expect(JSON.stringify(result)).not.toContain(TOKEN);
      expect(JSON.stringify(result)).not.toContain(URL_BASE);
    }
  });
});

describe("runOnce", () => {
  it("posts to the evaluate route with the bearer token and reports the four counts", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer(200, { evaluated: 3, sent: 1, unknown: 1, failed: 0 })));

    const result = await runOnce(config, { fetchImpl });

    expect(result).toEqual({ ok: true, status: 200, evaluated: 3, sent: 1, unknown: 1, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(`${URL_BASE}/api/alerts/evaluate`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps only numeric counts from the answer and ignores anything else in it", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(answer(200, { evaluated: "3", sent: 2, unknown: null, failed: Number.NaN, text: "secret" })),
    );

    const result = await runOnce(config, { fetchImpl });

    expect(result).toEqual({
      ok: true,
      status: 200,
      evaluated: undefined,
      sent: 2,
      unknown: undefined,
      failed: undefined,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("still reports success when a 2xx answer is not JSON", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response("ok", { status: 200 })));

    expect(await runOnce(config, { fetchImpl })).toEqual({ ok: true, status: 200 });
  });

  it.each([401, 500, 503])("reports an HTTP %i as a failure without reading the body", async (status) => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer(status, { error: "telegram_not_configured" })));

    expect(await runOnce(config, { fetchImpl })).toEqual({ ok: false, status });
  });

  it("reduces a timeout to the word timeout", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const fetchImpl = vi.fn(() => Promise.reject(timeout));

    expect(await runOnce(config, { fetchImpl })).toEqual({ ok: false, status: null, error: "timeout" });
  });

  it("treats an abort the same way", async () => {
    const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchImpl = vi.fn(() => Promise.reject(aborted));

    expect(await runOnce(config, { fetchImpl })).toEqual({ ok: false, status: null, error: "timeout" });
  });

  it("reduces any other failure to the word network and never carries the request into the result", async () => {
    const refused = new Error(`connect ECONNREFUSED ${URL_BASE} with Authorization: Bearer ${TOKEN}`);
    const fetchImpl = vi.fn(() => Promise.reject(refused));

    const result = await runOnce(config, { fetchImpl });

    expect(result).toEqual({ ok: false, status: null, error: "network" });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain(URL_BASE);
  });

  it("gives up on a call that never answers once the timeout it was given has passed", async () => {
    // A fetch that hangs until its signal fires, like a server that accepts the connection and then says nothing.
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error("aborted"));
          });
        }),
    );

    const result = await runOnce(config, { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 30 });

    expect(result).toEqual({ ok: false, status: null, error: "timeout" });
  });
});

describe("pingHeartbeat", () => {
  it("answers true for a 2xx and false for anything else, without carrying the address into the result", async () => {
    const url = "https://kuma.example/api/push/SYNTHETIC-secret";
    const ok = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    const bad = vi.fn(() => Promise.resolve(new Response("{}", { status: 404 })));
    const down = vi.fn(() => Promise.reject(new TypeError(`fetch failed ${url}`)));

    expect(await pingHeartbeat(url, { fetchImpl: ok as unknown as typeof fetch })).toBe(true);
    expect(ok).toHaveBeenCalledWith(url, { signal: expect.any(AbortSignal) as AbortSignal });
    expect(await pingHeartbeat(url, { fetchImpl: bad as unknown as typeof fetch })).toBe(false);
    expect(await pingHeartbeat(url, { fetchImpl: down as unknown as typeof fetch })).toBe(false);
  });
});
