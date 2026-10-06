import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ALERT_BILL_MAX_PLN,
  ALERT_BILL_MIN_PLN,
  ALERT_LABEL_MAX_LENGTH,
  ALERT_RENOTIFY_DEFAULT_HOURS,
  ALERT_RENOTIFY_MAX_HOURS,
  ALERT_RENOTIFY_MIN_HOURS,
  ALERT_STALE_MAX_MINUTES,
  ALERT_STALE_MIN_MINUTES,
} from "@/lib/services/alert-rules";
import { baseBody, billForecast } from "./support/bodies";
import { nextCapturedAt } from "./support/keys";
import {
  deleteAlertToken,
  insertAlertToken,
  nonOwnerClient,
  removeUser,
  requirePrivileged,
  revokeAlertToken,
  withPrivileged,
} from "./support/privileged";
import { push } from "./support/push";
import { anonClient, ownerClient, requireStack } from "./support/stack";

// Phase 1 of the alert rules (context/changes/alert-rules/plan.md): the owner-only table, the client column grants,
// the DB limits against the shared constants, the alerts token and the two anon-callable functions
// (supabase/migrations/20261007090000_alert_rules.sql). Nothing here relies on seed rows or an empty table: the owner
// is a fresh user, every token is made by the test, and every rule is removed afterwards.

type Client = ReturnType<typeof anonClient>;
type Owner = Awaited<ReturnType<typeof ownerClient>>;

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const INVALID_TOKEN = "P0401";
const INVALID_PARAMETER = "22023";

// The public local/CI token from supabase/seed.sql; it belongs to ingest and must not open the alerts functions.
const INGEST_SEED_TOKEN = "local-dev-ingest-token-not-secret";

// The snapshot the evaluator gets, in the row shape the loaders produce (src/types.ts LiveStateRow, BillForecastRow).
const snapshotSchema = z.object({
  rules: z.array(
    z.object({
      id: z.number(),
      kind: z.string(),
      threshold: z.number(),
      label: z.string().nullable(),
      renotify_hours: z.number(),
      state: z.string(),
      last_notified_at: z.string().nullable(),
    }),
  ),
  live: z
    .object({ captured_at: z.string(), received_at: z.string(), state: z.record(z.string(), z.unknown()) })
    .nullable(),
  forecast: z
    .object({ captured_at: z.string(), received_at: z.string(), bill_forecast: z.record(z.string(), z.unknown()) })
    .nullable(),
});

interface RuleInput {
  kind?: string;
  threshold?: number;
  label?: string | null;
  enabled?: boolean;
  renotify_hours?: number;
}

describe("alert rules: access, column grants, limits and the alerts token", () => {
  let owner: Owner;
  let ownerId: string;
  let anon: Client;
  let stranger: { client: Client; userId: string };
  const tokenLabels: string[] = [];
  // Distinct per case, so unique (user_id, kind, threshold) never meets another case's rule.
  let nextBill = 10;

  beforeAll(async () => {
    requireStack();
    requirePrivileged();
    owner = await ownerClient();
    const { data, error } = await owner.auth.getUser();
    if (error) throw new Error(`reading the owner user failed: ${error.message}`);
    ownerId = data.user.id;
    anon = anonClient();
    stranger = await nonOwnerClient();
  });

  afterAll(async () => {
    // Own rows only: the rules of this run's owner, the tokens made here and the non-owner user.
    await withPrivileged((db) => db.query("delete from public.alert_rules where user_id = $1", [ownerId]));
    for (const label of tokenLabels) await deleteAlertToken(label);
    await removeUser(stranger.userId);
  });

  function takeBill(): number {
    return nextBill++;
  }

  async function newToken(label: string): Promise<{ label: string; token: string }> {
    const made = await insertAlertToken(label);
    tokenLabels.push(made.label);
    return made;
  }

  // Same call shape as the app: no .select() after a write, because clients cannot read user_id.
  async function insertRule(input: RuleInput) {
    return await owner.from("alert_rules").insert(input);
  }

  async function readRules(
    client: Client,
    filter: { kind: string; threshold: number },
  ): Promise<Record<string, unknown>[]> {
    const { data, error } = await client
      .from("alert_rules")
      .select(
        "id, kind, threshold, label, enabled, renotify_hours, state, last_notified_at, last_evaluated_at, unevaluable_reason",
      )
      .eq("kind", filter.kind)
      .eq("threshold", filter.threshold)
      .overrideTypes<Record<string, unknown>[], { merge: false }>();
    expect(error).toBeNull();
    return data ?? [];
  }

  // Inserts a bill_above rule as the owner and returns its row.
  async function createRule(extra: RuleInput = {}): Promise<Record<string, unknown>> {
    const threshold = takeBill();
    const { error } = await insertRule({ kind: "bill_above", threshold, ...extra });
    expect(error).toBeNull();
    const [row] = await readRules(owner, { kind: "bill_above", threshold });
    expect(row).toBeDefined();
    return row;
  }

  async function ruleById(id: unknown): Promise<Record<string, unknown>> {
    const { data, error } = await owner
      .from("alert_rules")
      .select(
        "id, kind, threshold, label, enabled, renotify_hours, state, last_notified_at, last_evaluated_at, unevaluable_reason",
      )
      .eq("id", id)
      .overrideTypes<Record<string, unknown>[], { merge: false }>();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    return (data ?? [])[0];
  }

  describe("column grants: the owner writes only a rule's own settings", () => {
    it("defaults a new rule to enabled, 6-hour reminders, state ok and no evaluator data", async () => {
      const row = await createRule();
      expect(row).toMatchObject({
        enabled: true,
        renotify_hours: ALERT_RENOTIFY_DEFAULT_HOURS,
        state: "ok",
        last_notified_at: null,
        last_evaluated_at: null,
        unevaluable_reason: null,
        label: null,
      });
    });

    it.each([
      { column: "state", value: "alarm" },
      { column: "last_notified_at", value: "2026-10-01T10:00:00Z" },
      { column: "last_evaluated_at", value: "2026-10-01T10:00:00Z" },
      { column: "unevaluable_reason", value: "forged" },
      { column: "user_id", value: "00000000-0000-0000-0000-000000000000" },
    ])("an insert that sets $column is refused and stores nothing", async ({ column, value }) => {
      const threshold = takeBill();
      const { error } = await insertRule({ kind: "bill_above", threshold, [column]: value });
      expect(error).not.toBeNull();
      expect(await readRules(owner, { kind: "bill_above", threshold })).toEqual([]);
    });

    it.each([
      { column: "kind", value: "live_stale" },
      { column: "state", value: "alarm" },
      { column: "last_notified_at", value: "2026-10-01T10:00:00Z" },
      { column: "last_evaluated_at", value: "2026-10-01T10:00:00Z" },
      { column: "unevaluable_reason", value: "forged" },
      { column: "user_id", value: "00000000-0000-0000-0000-000000000000" },
    ])("an update that sets $column is refused and the rule stays as it was", async ({ column, value }) => {
      const before = await createRule();

      const { error } = await owner
        .from("alert_rules")
        .update({ [column]: value })
        .eq("id", before.id);
      expect(error).not.toBeNull();
      expect(await ruleById(before.id)).toEqual(before);
    });

    it("the owner can change threshold, label, enabled and renotify_hours and can delete the rule", async () => {
      const before = await createRule();
      const threshold = takeBill();

      const changed = await owner
        .from("alert_rules")
        .update({ threshold, label: "Invented label", enabled: false, renotify_hours: 12 }, { count: "exact" })
        .eq("id", before.id);
      expect(changed.error).toBeNull();
      expect(changed.count).toBe(1);
      expect(await ruleById(before.id)).toMatchObject({
        threshold,
        label: "Invented label",
        enabled: false,
        renotify_hours: 12,
      });

      const removed = await owner.from("alert_rules").delete({ count: "exact" }).eq("id", before.id);
      expect(removed.error).toBeNull();
      expect(removed.count).toBe(1);
      expect(await readRules(owner, { kind: "bill_above", threshold })).toEqual([]);
    });

    it("a second rule with the same kind and threshold is refused with 23505", async () => {
      const row = await createRule();
      const { error } = await insertRule({ kind: "bill_above", threshold: row.threshold as number });
      expect(error?.code).toBe(UNIQUE_VIOLATION);
    });
  });

  describe("parity: the database checks against the shared constants", () => {
    // Each accepted case needs a threshold of its own (unique per kind); the cases that probe another column use the
    // next free bill figure, which is inside the bill range.
    async function refused(input: RuleInput): Promise<void> {
      const threshold = input.threshold ?? takeBill();
      const { error } = await insertRule({ kind: "bill_above", ...input, threshold });
      expect(error?.code).toBe(CHECK_VIOLATION);
      expect(await readRules(owner, { kind: input.kind ?? "bill_above", threshold })).toEqual([]);
    }

    async function accepted(input: RuleInput): Promise<void> {
      const threshold = input.threshold ?? takeBill();
      const { error } = await insertRule({ kind: "bill_above", ...input, threshold });
      expect(error).toBeNull();
      expect(await readRules(owner, { kind: input.kind ?? "bill_above", threshold })).toHaveLength(1);
    }

    it("live_stale minutes: the edges are accepted, just outside and fractions are refused", async () => {
      await accepted({ kind: "live_stale", threshold: ALERT_STALE_MIN_MINUTES });
      await accepted({ kind: "live_stale", threshold: ALERT_STALE_MAX_MINUTES });
      await refused({ kind: "live_stale", threshold: ALERT_STALE_MIN_MINUTES - 1 });
      await refused({ kind: "live_stale", threshold: ALERT_STALE_MAX_MINUTES + 1 });
      await refused({ kind: "live_stale", threshold: ALERT_STALE_MIN_MINUTES + 0.5 });
    });

    it("bill_above PLN: the edges are accepted, just outside is refused", async () => {
      await accepted({ kind: "bill_above", threshold: ALERT_BILL_MIN_PLN });
      await accepted({ kind: "bill_above", threshold: ALERT_BILL_MAX_PLN });
      await refused({ kind: "bill_above", threshold: ALERT_BILL_MIN_PLN - 0.01 });
      await refused({ kind: "bill_above", threshold: ALERT_BILL_MAX_PLN + 0.01 });
    });

    it("an unknown kind is refused", async () => {
      await refused({ kind: "battery_low", threshold: 50 });
    });

    it("label: 60 characters and null are accepted, 61 characters, empty and spaces-only are refused", async () => {
      await accepted({ label: "x".repeat(ALERT_LABEL_MAX_LENGTH) });
      await accepted({ label: null });
      await refused({ label: "x".repeat(ALERT_LABEL_MAX_LENGTH + 1) });
      await refused({ label: "" });
      await refused({ label: "     " });
    });

    it("renotify_hours: the edges are accepted, just outside is refused", async () => {
      await accepted({ renotify_hours: ALERT_RENOTIFY_MIN_HOURS });
      await accepted({ renotify_hours: ALERT_RENOTIFY_MAX_HOURS });
      await refused({ renotify_hours: ALERT_RENOTIFY_MIN_HOURS - 1 });
      await refused({ renotify_hours: ALERT_RENOTIFY_MAX_HOURS + 1 });
    });

    it("an update outside the limits is refused with 23514 and the rule stays as it was", async () => {
      const before = await createRule();
      for (const change of [
        { threshold: ALERT_BILL_MAX_PLN + 1 },
        { label: "x".repeat(ALERT_LABEL_MAX_LENGTH + 1) },
        { renotify_hours: ALERT_RENOTIFY_MAX_HOURS + 1 },
      ]) {
        const { error } = await owner.from("alert_rules").update(change).eq("id", before.id);
        expect(error?.code).toBe(CHECK_VIOLATION);
      }
      expect(await ruleById(before.id)).toEqual(before);
    });
  });

  describe("the evaluator functions", () => {
    it("the functions are executable by anon only, and the tokens table by nobody", async () => {
      const grants = await withPrivileged((db) =>
        db.query<{ name: string; anon: boolean; authenticated: boolean; public_execute: boolean }>(
          `select p.proname as name,
                  has_function_privilege('anon', p.oid, 'execute') as anon,
                  has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
                  exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute
           from pg_proc p
           where p.oid in ('public.alerts_snapshot(text)'::regprocedure, 'public.alerts_record(text, jsonb)'::regprocedure)
           order by p.proname`,
        ),
      );
      expect(grants.rows).toEqual([
        { name: "alerts_record", anon: true, authenticated: false, public_execute: false },
        { name: "alerts_snapshot", anon: true, authenticated: false, public_execute: false },
      ]);

      const table = await withPrivileged((db) =>
        db.query<{ anon: boolean; authenticated: boolean }>(
          `select has_table_privilege('anon', 'public.alert_tokens', 'select,insert,update,delete') as anon,
                  has_table_privilege('authenticated', 'public.alert_tokens', 'select,insert,update,delete') as authenticated`,
        ),
      );
      expect(table.rows).toEqual([{ anon: false, authenticated: false }]);
    });

    it("a token the test inserted opens the snapshot: enabled rules, the newest live push and the newest forecast push", async () => {
      const { token } = await newToken("snapshot");
      const enabled = await createRule({ label: "Invented enabled rule" });
      const disabled = await createRule({ enabled: false });
      expect(await push(baseBody(nextCapturedAt()))).toEqual({ status: 201, body: { status: "created" } });
      expect(await push({ ...baseBody(nextCapturedAt()), bill_forecast: billForecast() })).toEqual({
        status: 201,
        body: { status: "created" },
      });

      const result = await anon.rpc("alerts_snapshot", { p_token: token });
      expect(result.error).toBeNull();
      const snapshot = snapshotSchema.parse(result.data);

      const ids = snapshot.rules.map((rule) => rule.id);
      expect(ids).toContain(enabled.id);
      expect(ids).not.toContain(disabled.id);
      expect(snapshot.rules.find((rule) => rule.id === enabled.id)).toEqual({
        id: enabled.id,
        kind: "bill_above",
        threshold: enabled.threshold,
        label: "Invented enabled rule",
        renotify_hours: ALERT_RENOTIFY_DEFAULT_HOURS,
        state: "ok",
        last_notified_at: null,
      });
      expect(snapshot.live).not.toBeNull();
      expect(snapshot.live?.state).toHaveProperty("pv_w");
      expect(snapshot.forecast).not.toBeNull();
      expect(snapshot.forecast?.bill_forecast).toHaveProperty("generated_at");
    });

    it.each([
      { kind: "unknown", token: () => `unknown-token-${String(Date.now())}` },
      { kind: "empty", token: () => "" },
      { kind: "ingest seed", token: () => INGEST_SEED_TOKEN },
    ])("a $kind token is refused by both functions with P0401 and no data", async ({ token }) => {
      const row = await createRule();

      const snapshot = await anon.rpc("alerts_snapshot", { p_token: token() });
      expect(snapshot.error?.code).toBe(INVALID_TOKEN);
      expect(snapshot.data).toBeNull();

      const recorded = await anon.rpc("alerts_record", {
        p_token: token(),
        p_results: [{ id: row.id, state: "alarm", notified: true, reason: null }],
      });
      expect(recorded.error?.code).toBe(INVALID_TOKEN);
      expect(await ruleById(row.id)).toEqual(row);
    });

    it("a revoked token is refused by both functions with the same P0401 and changes nothing", async () => {
      const revocable = await newToken("revocable");
      const row = await createRule();
      expect((await anon.rpc("alerts_snapshot", { p_token: revocable.token })).error).toBeNull();

      await revokeAlertToken(revocable.label);

      const snapshot = await anon.rpc("alerts_snapshot", { p_token: revocable.token });
      expect(snapshot.error?.code).toBe(INVALID_TOKEN);
      expect(snapshot.data).toBeNull();
      const recorded = await anon.rpc("alerts_record", {
        p_token: revocable.token,
        p_results: [{ id: row.id, state: "alarm", notified: true, reason: null }],
      });
      expect(recorded.error?.code).toBe(INVALID_TOKEN);
      expect(await ruleById(row.id)).toEqual(row);
    });

    it("an alerts token is refused by ingest_push, and nothing is stored", async () => {
      const { token } = await newToken("not-ingest");
      const capturedAt = nextCapturedAt();

      const refused = await anon.rpc("ingest_push", { p_token: token, p_payload: baseBody(capturedAt) });
      expect(refused.error?.code).toBe(INVALID_TOKEN);
      expect(refused.data).toBeNull();

      const stored = await owner
        .from("ingest_pushes")
        .select("captured_at")
        .eq("captured_at", capturedAt.toISOString())
        .overrideTypes<Record<string, unknown>[], { merge: false }>();
      expect(stored.error).toBeNull();
      expect(stored.data).toEqual([]);
    });

    it.each([
      { who: "an owner", client: () => owner },
      { who: "a non-owner", client: () => stranger.client },
    ])("$who signed in cannot call the functions even with a valid token", async ({ client }) => {
      const { token } = await newToken("signed-in");
      const row = await createRule();

      const snapshot = await client().rpc("alerts_snapshot", { p_token: token });
      expect(snapshot.error).not.toBeNull();
      expect(snapshot.data).toBeNull();
      const recorded = await client().rpc("alerts_record", {
        p_token: token,
        p_results: [{ id: row.id, state: "alarm", notified: true, reason: null }],
      });
      expect(recorded.error).not.toBeNull();
      expect(await ruleById(row.id)).toEqual(row);

      // Control: the same token through anon works.
      expect((await anon.rpc("alerts_snapshot", { p_token: token })).error).toBeNull();
    });

    it("alerts_record changes only the evaluator-owned columns and ignores unknown ids and extra keys", async () => {
      const { token } = await newToken("record");
      const before = await createRule({ label: "Invented kept label", renotify_hours: 9 });

      const recorded = await anon.rpc("alerts_record", {
        p_token: token,
        p_results: [
          // Extra keys a forged body might carry are not columns the function reads.
          {
            id: before.id,
            state: "alarm",
            notified: true,
            reason: "forecast unavailable",
            kind: "live_stale",
            threshold: 99,
            enabled: false,
            label: "forged",
          },
          { id: 999_999_999_999, state: "alarm", notified: true, reason: null },
        ],
      });
      expect(recorded.error).toBeNull();

      const after = await ruleById(before.id);
      expect(after).toMatchObject({
        kind: before.kind,
        threshold: before.threshold,
        label: "Invented kept label",
        enabled: true,
        renotify_hours: 9,
        state: "alarm",
        unevaluable_reason: "forecast unavailable",
      });
      expect(after.last_notified_at).not.toBeNull();
      expect(after.last_evaluated_at).not.toBeNull();

      // notified false keeps last_notified_at; the new state and reason are recorded.
      const second = await anon.rpc("alerts_record", {
        p_token: token,
        p_results: [{ id: before.id, state: "ok", notified: false, reason: null }],
      });
      expect(second.error).toBeNull();
      const kept = await ruleById(before.id);
      expect(kept).toMatchObject({ state: "ok", unevaluable_reason: null, last_notified_at: after.last_notified_at });
    });

    it.each([
      { kind: "an unknown state", results: [{ id: 1, state: "broken", notified: false, reason: null }] },
      { kind: "a missing state", results: [{ id: 1, notified: false, reason: null }] },
      { kind: "a body that is not an array", results: { id: 1, state: "ok" } },
    ])("alerts_record refuses $kind with 22023 and changes nothing", async ({ results }) => {
      const { token } = await newToken("invalid-results");
      const row = await createRule();

      // A valid element next to the bad one proves the whole call is refused, not just the bad element.
      const body = Array.isArray(results)
        ? [{ id: row.id, state: "alarm", notified: true, reason: null }, ...results]
        : results;
      const recorded = await anon.rpc("alerts_record", { p_token: token, p_results: body });
      expect(recorded.error?.code).toBe(INVALID_PARAMETER);
      expect(await ruleById(row.id)).toEqual(row);
    });
  });

  describe("state reset: a rule never inherits a stale alarm", () => {
    async function putInAlarm(token: string, id: unknown): Promise<void> {
      const recorded = await anon.rpc("alerts_record", {
        p_token: token,
        p_results: [{ id, state: "alarm", notified: true, reason: "forecast unavailable" }],
      });
      expect(recorded.error).toBeNull();
      expect(await ruleById(id)).toMatchObject({ state: "alarm", unevaluable_reason: "forecast unavailable" });
    }

    it.each([
      { change: "enabled", update: () => ({ enabled: false }) },
      { change: "threshold", update: () => ({ threshold: ALERT_BILL_MAX_PLN - 1 }) },
    ])("changing $change resets an alarm to ok and clears the reason", async ({ update }) => {
      const { token } = await newToken("reset");
      const row = await createRule();
      await putInAlarm(token, row.id);

      const { error } = await owner.from("alert_rules").update(update()).eq("id", row.id);
      expect(error).toBeNull();
      expect(await ruleById(row.id)).toMatchObject({ state: "ok", unevaluable_reason: null });
    });

    it("re-enabling a disabled rule that the evaluator left in alarm also resets it", async () => {
      const { token } = await newToken("reenable");
      const row = await createRule({ enabled: false });
      await putInAlarm(token, row.id);

      const { error } = await owner.from("alert_rules").update({ enabled: true }).eq("id", row.id);
      expect(error).toBeNull();
      expect(await ruleById(row.id)).toMatchObject({ state: "ok", unevaluable_reason: null });
    });

    it.each([
      { change: "label", update: () => ({ label: "Invented new label" }) },
      { change: "renotify_hours", update: () => ({ renotify_hours: 24 }) },
    ])("changing $change keeps the alarm and the reason", async ({ update }) => {
      const { token } = await newToken("keep");
      const row = await createRule();
      await putInAlarm(token, row.id);

      const { error } = await owner.from("alert_rules").update(update()).eq("id", row.id);
      expect(error).toBeNull();
      expect(await ruleById(row.id)).toMatchObject({ state: "alarm", unevaluable_reason: "forecast unavailable" });
    });

    it("a write that changes neither enabled nor threshold, even to the same values, keeps the alarm", async () => {
      const { token } = await newToken("same");
      const row = await createRule();
      await putInAlarm(token, row.id);

      const { error } = await owner
        .from("alert_rules")
        .update({ enabled: row.enabled as boolean, threshold: row.threshold as number })
        .eq("id", row.id);
      expect(error).toBeNull();
      expect(await ruleById(row.id)).toMatchObject({ state: "alarm" });
    });
  });
});
