import { MINUTE_MS, HOUR_MS } from "@/lib/format/age";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleAlertsEvaluate } from "@/lib/services/alerts-evaluate";
import { loadBillForecast, toBillForecastView } from "@/lib/services/bill-forecast";
import { baseBody, billForecast } from "./support/bodies";
import { nextCapturedAt } from "./support/keys";
import { deleteAlertToken, insertAlertToken, requirePrivileged, withPrivileged } from "./support/privileged";
import { push } from "./support/push";
import { anonClient, ownerClient, requireStack } from "./support/stack";

// Phase 3 of the alert rules (context/changes/alert-rules/plan.md): the real handleAlertsEvaluate behind the real
// alerts_snapshot and alerts_record functions, with a live state and a forecast pushed through the real ingest_push, rules
// created as the owner and a fake Telegram (an injected fetch: nothing leaves the machine). The database is never reset
// and alerts_snapshot returns the enabled rules of every owner, so every assertion is on this test's own rules, found by
// their unique labels, and the messages are matched on those labels too. The cases run in order and share state: one
// rule walks through alarm, no repeat, reminder, recovery and a failed send; another keeps its state when it cannot be
// evaluated.

const PLAN_RATE_HOURS = 1;

type Owner = Awaited<ReturnType<typeof ownerClient>>;

interface RuleRow {
  state: string;
  last_notified_at: string | null;
  last_evaluated_at: string | null;
  unevaluable_reason: string | null;
}

describe("alerts evaluate: the real path with a fake Telegram", () => {
  let owner: Owner;
  let ownerId: string;
  let tokenLabel: string;
  let token: string;
  const run = `it-${String(Date.now())}`;
  const billLabel = `${run}-bill`;
  const liveLabel = `${run}-live`;

  beforeAll(async () => {
    requireStack();
    requirePrivileged();
    owner = await ownerClient();
    const { data, error } = await owner.auth.getUser();
    if (error) throw new Error(`reading the owner user failed: ${error.message}`);
    ownerId = data.user.id;
    ({ label: tokenLabel, token } = await insertAlertToken("alerts-evaluate"));
  });

  afterAll(async () => {
    await withPrivileged((db) => db.query("delete from public.alert_rules where user_id = $1", [ownerId]));
    await deleteAlertToken(tokenLabel);
  });

  // A fake Telegram: records the text of every message and answers with `status`.
  function telegram(status = 200) {
    const texts: string[] = [];
    const fake: typeof fetch = (_url, init) => {
      texts.push((JSON.parse(init?.body as string) as { text: string }).text);
      return Promise.resolve(new Response("{}", { status }));
    };
    return { fake, texts };
  }

  async function evaluate(fake: typeof fetch, now: Date = new Date()) {
    const client = anonClient();
    return handleAlertsEvaluate(
      new Request("http://localhost/api/alerts/evaluate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
      {
        snapshot: (t) => client.rpc("alerts_snapshot", { p_token: t }),
        record: (t, results) => client.rpc("alerts_record", { p_token: t, p_results: results }),
        telegram: { botToken: "integration-bot-token", chatId: "-1" },
        fetch: fake,
        now: () => now,
      },
    );
  }

  async function readRule(label: string): Promise<RuleRow> {
    const { data, error } = await owner
      .from("alert_rules")
      .select("state, last_notified_at, last_evaluated_at, unevaluable_reason")
      .eq("label", label)
      .overrideTypes<RuleRow[], { merge: false }>();
    expect(error).toBeNull();
    const [row] = data ?? [];
    expect(data).toHaveLength(1);
    return row;
  }

  const messagesFor = (texts: string[], label: string) => texts.filter((text) => text.includes(label));
  const later = (ms: number) => new Date(Date.now() + ms);

  it("refuses an unknown token without sending or recording", async () => {
    const { fake, texts } = telegram();
    const client = anonClient();

    const response = await handleAlertsEvaluate(
      new Request("http://localhost/api/alerts/evaluate", {
        method: "POST",
        headers: { Authorization: "Bearer nope" },
      }),
      {
        snapshot: (t) => client.rpc("alerts_snapshot", { p_token: t }),
        record: (t, results) => client.rpc("alerts_record", { p_token: t, p_results: results }),
        telegram: { botToken: "integration-bot-token", chatId: "-1" },
        fetch: fake,
        now: () => new Date(),
      },
    );

    expect(response).toEqual({ status: 401, body: { error: "unauthorized" } });
    expect(texts).toEqual([]);
  });

  it("sends one alarm for a bill rule below the forecast and records it", async () => {
    expect(await push({ ...baseBody(nextCapturedAt()), bill_forecast: billForecast() })).toEqual({
      status: 201,
      body: { status: "created" },
    });
    const view = toBillForecastView(await loadBillForecast(owner), new Date());
    if (view.kind !== "forecast") throw new Error(`expected a forecast view, got ${view.kind}`);
    expect(view.centralPln).toBeGreaterThan(2);
    const threshold = Math.floor(view.centralPln) - 1;

    // The live rule's line is the lowest allowed (15 min): the pushed state is seconds old, so it stays ok.
    const created = await owner.from("alert_rules").insert([
      { kind: "bill_above", threshold, label: billLabel, renotify_hours: PLAN_RATE_HOURS },
      { kind: "live_stale", threshold: 15, label: liveLabel, renotify_hours: PLAN_RATE_HOURS },
    ]);
    expect(created.error).toBeNull();

    const { fake, texts } = telegram();
    const response = await evaluate(fake);

    expect(response.status).toBe(200);
    expect(messagesFor(texts, billLabel)).toHaveLength(1);
    expect(messagesFor(texts, billLabel)[0]).toMatch(/^ALARM: /);
    expect(messagesFor(texts, liveLabel)).toEqual([]);
    const bill = await readRule(billLabel);
    expect(bill.state).toBe("alarm");
    expect(bill.last_notified_at).not.toBeNull();
    expect(bill.unevaluable_reason).toBeNull();
    expect((await readRule(liveLabel)).state).toBe("ok");
  });

  it("does not repeat the alarm inside the reminder interval", async () => {
    const before = await readRule(billLabel);
    const { fake, texts } = telegram();

    await evaluate(fake);

    expect(messagesFor(texts, billLabel)).toEqual([]);
    const after = await readRule(billLabel);
    expect(after.state).toBe("alarm");
    expect(after.last_notified_at).toBe(before.last_notified_at);
  });

  it("sends a reminder once the interval has passed", async () => {
    await withPrivileged((db) =>
      db.query(
        "update public.alert_rules set last_notified_at = now() - interval '2 hours' where user_id = $1 and label = $2",
        [ownerId, billLabel],
      ),
    );
    const { fake, texts } = telegram();

    await evaluate(fake);

    expect(messagesFor(texts, billLabel)).toHaveLength(1);
    expect(messagesFor(texts, billLabel)[0]).toMatch(/^PRZYPOMNIENIE: /);
    const bill = await readRule(billLabel);
    expect(Date.now() - Date.parse(bill.last_notified_at ?? "")).toBeLessThan(HOUR_MS);
  });

  it("alarms a stale live state, then sends one recovery when a fresh push arrives", async () => {
    // Twenty minutes on, the pushed state is past the 15-minute line (the forecast, 30-minute line, is still fresh).
    const stale = telegram();
    await evaluate(stale.fake, later(20 * MINUTE_MS));
    expect(messagesFor(stale.texts, liveLabel)).toHaveLength(1);
    expect(messagesFor(stale.texts, liveLabel)[0]).toMatch(/^ALARM: /);
    expect((await readRule(liveLabel)).state).toBe("alarm");

    expect(await push(baseBody(nextCapturedAt()))).toEqual({ status: 201, body: { status: "created" } });
    const fresh = telegram();
    await evaluate(fresh.fake);

    expect(messagesFor(fresh.texts, liveLabel)).toHaveLength(1);
    expect(messagesFor(fresh.texts, liveLabel)[0]).toMatch(/^WRÓCIŁO DO NORMY: /);
    expect((await readRule(liveLabel)).state).toBe("ok");
  });

  it("keeps the state of a rule it cannot evaluate, records why and sends nothing for it", async () => {
    // The newest forecast was generated two hours ago: the bill rule cannot be judged.
    const generatedAt = new Date(Date.now() - 2 * HOUR_MS).toISOString();
    expect(
      await push({ ...baseBody(nextCapturedAt()), bill_forecast: { ...billForecast(), generated_at: generatedAt } }),
    ).toEqual({ status: 201, body: { status: "created" } });
    const { fake, texts } = telegram();

    const response = await evaluate(fake);

    expect(response.status).toBe(200);
    expect(messagesFor(texts, billLabel)).toEqual([]);
    const bill = await readRule(billLabel);
    expect(bill.state).toBe("alarm");
    expect(bill.unevaluable_reason).toMatch(/nieaktualna/);
  });

  it("retries a rule whose send failed on the next run", async () => {
    const later20 = later(20 * MINUTE_MS);
    const failing = telegram(500);
    await evaluate(failing.fake, later20);

    // The message was tried, but nothing was recorded: the rule is still ok and was never notified.
    expect(messagesFor(failing.texts, liveLabel)).toHaveLength(1);
    expect((await readRule(liveLabel)).state).toBe("ok");

    const working = telegram();
    await evaluate(working.fake, later20);

    expect(messagesFor(working.texts, liveLabel)).toHaveLength(1);
    expect(messagesFor(working.texts, liveLabel)[0]).toMatch(/^ALARM: /);
    expect((await readRule(liveLabel)).state).toBe("alarm");
  });
});
