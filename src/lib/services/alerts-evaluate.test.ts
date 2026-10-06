import { describe, expect, it, vi } from "vitest";
import { handleAlertsEvaluate, type AlertsEvaluateDeps, type AlertsRpcResult } from "./alerts-evaluate";

// All data here is synthetic. The route's contract is written from the plan (context/changes/alert-rules/plan.md,
// Phase 3): one 401 for a missing or wrong token before any work, 503 telegram_not_configured with nothing recorded, a
// failed send leaves that rule unrecorded, and the answer and the logs carry no token, chat id or message text.

const now = new Date("2026-09-23T10:00:00Z");
const TOKEN = "SYNTHETIC-alerts-token";
const BOT = "123456:SYNTHETIC-bot-token";
const CHAT = "-1009999";
const HOUR = 3_600_000;

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  kind: "live_stale",
  threshold: 30,
  label: null,
  renotify_hours: 6,
  state: "ok",
  last_notified_at: null,
  ...overrides,
});
const staleLive = { captured_at: new Date(now.getTime() - 2 * HOUR).toISOString(), received_at: "x" };
const freshLive = { captured_at: new Date(now.getTime() - 60_000).toISOString(), received_at: "x" };

function snapshotOf(rules: unknown[], liveRow: unknown = staleLive) {
  return { data: { rules, live: liveRow, forecast: null }, error: null };
}

function build(options: {
  snapshot?: AlertsRpcResult;
  telegram?: AlertsEvaluateDeps["telegram"];
  sendStatus?: number;
}) {
  const send = vi.fn<typeof fetch>(() => Promise.resolve(new Response("{}", { status: options.sendStatus ?? 200 })));
  const log = { error: vi.fn(), warn: vi.fn() };
  const deps = {
    snapshot: vi.fn(() => Promise.resolve(options.snapshot ?? snapshotOf([rule()]))),
    record: vi.fn((_token: string, _results: unknown[]) =>
      Promise.resolve<AlertsRpcResult>({ data: null, error: null }),
    ),
    telegram: options.telegram ?? { botToken: BOT, chatId: CHAT },
    fetch: send,
    now: () => now,
    log,
  } satisfies AlertsEvaluateDeps;
  return { deps, send, log };
}

function call(headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }) {
  return new Request("http://localhost/api/alerts/evaluate", { method: "POST", headers });
}

const UNAUTHORIZED = { status: 401, body: { error: "unauthorized" } };

describe("handleAlertsEvaluate", () => {
  it("returns the same 401 for a missing, malformed or rejected token, before any work", async () => {
    const d = build({});
    const missing = await handleAlertsEvaluate(call({}), d.deps);
    const malformed = await handleAlertsEvaluate(call({ Authorization: "Basic abc" }), d.deps);
    expect(missing).toEqual(UNAUTHORIZED);
    expect(malformed).toEqual(UNAUTHORIZED);
    expect(d.deps.snapshot).not.toHaveBeenCalled();

    const rejected = build({ snapshot: { data: null, error: { code: "P0401", message: "invalid alerts token" } } });
    expect(await handleAlertsEvaluate(call(), rejected.deps)).toEqual(UNAUTHORIZED);
    expect(rejected.deps.record).not.toHaveBeenCalled();
    expect(rejected.send).not.toHaveBeenCalled();
  });

  it.each([
    { botToken: undefined, chatId: CHAT },
    { botToken: BOT, chatId: undefined },
    { botToken: "", chatId: CHAT },
    { botToken: BOT, chatId: "" },
  ])("answers 503 telegram_not_configured and records nothing when a secret is missing (%o)", async (telegram) => {
    const d = build({ telegram });

    expect(await handleAlertsEvaluate(call(), d.deps)).toEqual({
      status: 503,
      body: { error: "telegram_not_configured" },
    });
    expect(d.deps.record).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("a wrong token still gets 401, not 503, when Telegram is not configured", async () => {
    const d = build({
      snapshot: { data: null, error: { code: "P0401", message: "x" } },
      telegram: { botToken: undefined, chatId: undefined },
    });

    expect(await handleAlertsEvaluate(call(), d.deps)).toEqual(UNAUTHORIZED);
  });

  it("sends an alarm, records it as notified and answers with counts only", async () => {
    const d = build({});

    const response = await handleAlertsEvaluate(call(), d.deps);

    expect(response).toEqual({ status: 200, body: { evaluated: 1, sent: 1, unknown: 0, failed: 0 } });
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send.mock.calls[0][0] as string).toBe(`https://api.telegram.org/bot${BOT}/sendMessage`);
    expect(d.deps.record).toHaveBeenCalledWith(TOKEN, [{ id: 1, state: "alarm", notified: true, reason: null }]);
  });

  it("records ok -> ok and an unreminded alarm as not notified, with the evaluated state", async () => {
    const d = build({
      snapshot: snapshotOf([
        rule({ id: 1, threshold: 300, state: "ok" }),
        rule({ id: 2, threshold: 31, state: "alarm", last_notified_at: new Date(now.getTime() - HOUR).toISOString() }),
      ]),
    });

    const response = await handleAlertsEvaluate(call(), d.deps);

    expect(response.body).toEqual({ evaluated: 2, sent: 0, unknown: 0, failed: 0 });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.deps.record).toHaveBeenCalledWith(TOKEN, [
      { id: 1, state: "ok", notified: false, reason: null },
      { id: 2, state: "alarm", notified: false, reason: null },
    ]);
  });

  it("sends a recovery and records ok", async () => {
    const d = build({ snapshot: snapshotOf([rule({ state: "alarm" })], freshLive) });

    await handleAlertsEvaluate(call(), d.deps);

    expect((JSON.parse(d.send.mock.calls[0][1]?.body as string) as { text: string }).text).toMatch(/^WRÓCIŁO DO NORMY/);
    expect(d.deps.record).toHaveBeenCalledWith(TOKEN, [{ id: 1, state: "ok", notified: true, reason: null }]);
  });

  it("keeps the stored state and records the reason for a rule it cannot evaluate, sending nothing", async () => {
    const d = build({ snapshot: snapshotOf([rule({ id: 7, kind: "bill_above", threshold: 100, state: "alarm" })]) });

    const response = await handleAlertsEvaluate(call(), d.deps);

    expect(response.body).toEqual({ evaluated: 1, sent: 0, unknown: 1, failed: 0 });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.deps.record).toHaveBeenCalledWith(TOKEN, [
      { id: 7, state: "alarm", notified: false, reason: "laboratorium jeszcze nie przesłało prognozy" },
    ]);
  });

  it.each([500, 429])("leaves a rule whose send failed with %i unrecorded and counts it", async (sendStatus) => {
    const d = build({
      snapshot: snapshotOf([rule({ id: 1 }), rule({ id: 2, threshold: 40, kind: "live_stale", state: "ok" })]),
      sendStatus,
    });

    const response = await handleAlertsEvaluate(call(), d.deps);

    expect(response).toEqual({ status: 200, body: { evaluated: 2, sent: 0, unknown: 0, failed: 2 } });
    // Nothing to record: both rules stay as they were and are decided again next run.
    expect(d.deps.record).not.toHaveBeenCalled();
    expect(d.log.warn).toHaveBeenCalledWith("alert_send_failed", {
      ruleId: 1,
      type: "alarm",
      code: String(sendStatus),
    });
  });

  it("records the rules that did not fail when another one's send did", async () => {
    const stale = build({ snapshot: snapshotOf([rule({ id: 1 }), rule({ id: 2, threshold: 40 })]) });
    let calls = 0;
    stale.send.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new TypeError("down")) : Promise.resolve(new Response("{}"));
    });

    const response = await handleAlertsEvaluate(call(), stale.deps);

    expect(response.body).toEqual({ evaluated: 2, sent: 1, unknown: 0, failed: 1 });
    expect(stale.deps.record).toHaveBeenCalledWith(TOKEN, [{ id: 2, state: "alarm", notified: true, reason: null }]);
  });

  it("records each sent rule right after its own message, before the next send", async () => {
    const d = build({ snapshot: snapshotOf([rule({ id: 1 }), rule({ id: 2, threshold: 40 })]) });
    const order: string[] = [];
    d.send.mockImplementation(() => {
      order.push("send");
      return Promise.resolve(new Response("{}"));
    });
    d.deps.record.mockImplementation((_token, results) => {
      order.push(`record:${String((results as { id: number }[]).map((r) => r.id))}`);
      return Promise.resolve({ data: null, error: null });
    });

    await handleAlertsEvaluate(call(), d.deps);

    expect(order).toEqual(["send", "record:1", "send", "record:2"]);
  });

  it("stops sending when a record fails, so an earlier message is not repeated and a later one is not sent", async () => {
    const d = build({ snapshot: snapshotOf([rule({ id: 1 }), rule({ id: 2, threshold: 40 })]) });
    d.deps.record.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "down" } });

    expect((await handleAlertsEvaluate(call(), d.deps)).status).toBe(500);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.deps.record).toHaveBeenCalledTimes(1);
  });

  it("sends nothing more after Telegram answers 429, but still records the quiet rules", async () => {
    const d = build({
      snapshot: snapshotOf([rule({ id: 1 }), rule({ id: 2, threshold: 40 }), rule({ id: 3, threshold: 300 })]),
      sendStatus: 429,
    });

    const response = await handleAlertsEvaluate(call(), d.deps);

    expect(response).toEqual({ status: 200, body: { evaluated: 3, sent: 0, unknown: 0, failed: 2 } });
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.deps.record).toHaveBeenCalledWith(TOKEN, [{ id: 3, state: "ok", notified: false, reason: null }]);
  });

  it("does not call record for a snapshot without rules", async () => {
    const d = build({ snapshot: snapshotOf([]) });

    expect(await handleAlertsEvaluate(call(), d.deps)).toEqual({
      status: 200,
      body: { evaluated: 0, sent: 0, unknown: 0, failed: 0 },
    });
    expect(d.deps.record).not.toHaveBeenCalled();
  });

  it("answers 500 when the snapshot cannot be read or has an unexpected shape", async () => {
    const broken = build({ snapshot: { data: null, error: { code: "XX000", message: "boom" } } });
    expect((await handleAlertsEvaluate(call(), broken.deps)).status).toBe(500);
    expect(broken.log.error).toHaveBeenCalledWith("alerts_snapshot_failed", expect.anything());

    const odd = build({ snapshot: { data: { rules: "nope" }, error: null } });
    expect((await handleAlertsEvaluate(call(), odd.deps)).status).toBe(500);
    expect(odd.deps.record).not.toHaveBeenCalled();
  });

  it("answers 500 when the result cannot be recorded", async () => {
    const d = build({});
    d.deps.record.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "bad" } });

    expect((await handleAlertsEvaluate(call(), d.deps)).status).toBe(500);
    expect(d.deps.log.error).toHaveBeenCalledWith("alerts_record_failed", expect.objectContaining({ sent: 1 }));
  });

  it("never puts the token, the chat id or the message text in a log line or the answer", async () => {
    const failing = build({ sendStatus: 500 });
    const sending = build({});
    const answers = [
      await handleAlertsEvaluate(call(), failing.deps),
      await handleAlertsEvaluate(call(), sending.deps),
    ];
    const seen = JSON.stringify([
      answers,
      failing.log.warn.mock.calls,
      failing.log.error.mock.calls,
      sending.log.warn.mock.calls,
      sending.log.error.mock.calls,
    ]);

    for (const secret of [TOKEN, BOT, CHAT, "ALARM", "Dane z domu"]) expect(seen).not.toContain(secret);
  });
});
