import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baseBody, billForecast, dailyRow, hourRow, recommendation, summary } from "./support/bodies";
import { emptySummaryDay, freshDays, freshWindowHours, nextCapturedAt } from "./support/keys";
import {
  deleteToken,
  insertToken,
  nonOwnerClient,
  removeUser,
  requirePrivileged,
  revokeToken,
  withPrivileged,
} from "./support/privileged";
import { push } from "./support/push";
import { anonClient, ownerClient, requireStack } from "./support/stack";

// Risk #6: a signed-out, anon or non-owner client reads and writes nothing, and the ingest token rules hold. Every test
// that shows a denial also shows the control (the owner reads or writes what the other client cannot), so a stack that
// denied everyone could not pass. Denied operations come back as an error or as no rows or zero rows affected,
// depending on the grant and the policy; the assertions accept either form but always require that no data came back
// and no row changed. The one gap the owner chose not to fix (the table-level recommendations grant) is pinned by the test whose name starts with "KNOWN GAP".

type Client = ReturnType<typeof anonClient>;
type Owner = Awaited<ReturnType<typeof ownerClient>>;

const CREATED = { status: 201, body: { status: "created" } };

// The public local/CI token from supabase/seed.sql (the same one tests/integration/support/push.ts uses).
const SEED_TOKEN = "local-dev-ingest-token-not-secret";

const instant = (value: unknown): number => Date.parse(typeof value === "string" ? value : "");

interface Read {
  rows: Record<string, unknown>[];
  error: { message: string; code?: string } | null;
}

// Selects `columns`, narrowed by one equality when `filter` is given (else the first rows). Never throws on a denied read.
async function readRows(
  client: Client,
  table: string,
  columns: string,
  filter?: { column: string; value: string },
): Promise<Read> {
  const base = client.from(table).select(columns);
  const query = filter ? base.eq(filter.column, filter.value) : base.limit(5);
  const { data, error } = await query.overrideTypes<Record<string, unknown>[], { merge: false }>();
  return { rows: data ?? [], error };
}

// What the seed pushes wrote, so "no rows" for a stranger means "hidden", not "empty".
interface Seed {
  dailyDay: string;
  hourStart: string;
  summaryDay: string;
  generatedAt: string;
  pushCapturedAt: string;
  noteDay: string;
}

interface Probe {
  name: string;
  table: string;
  columns: string;
  // The one seeded row to look for; undefined for the views, which have one global row.
  filter: (seed: Seed) => { column: string; value: string } | undefined;
}

const PROBES: Probe[] = [
  {
    name: "recommendations",
    table: "recommendations",
    columns: "generated_at",
    filter: (seed) => ({ column: "generated_at", value: seed.generatedAt }),
  },
  {
    name: "ingest_pushes",
    table: "ingest_pushes",
    columns: "source, captured_at",
    filter: (seed) => ({ column: "captured_at", value: seed.pushCapturedAt }),
  },
  {
    name: "daily_energy",
    table: "daily_energy",
    columns: "day, load_kwh",
    filter: (seed) => ({ column: "day", value: seed.dailyDay }),
  },
  {
    name: "hourly_energy",
    table: "hourly_energy",
    columns: "hour_start, load_kwh",
    filter: (seed) => ({ column: "hour_start", value: seed.hourStart }),
  },
  {
    name: "period_summaries",
    table: "period_summaries",
    columns: "kind, period",
    filter: (seed) => ({ column: "period", value: seed.summaryDay }),
  },
  {
    name: "day_notes",
    table: "day_notes",
    columns: "day, text",
    filter: (seed) => ({ column: "day", value: seed.noteDay }),
  },
  { name: "live_state", table: "live_state", columns: "captured_at", filter: () => undefined },
  { name: "bill_forecast", table: "bill_forecast", columns: "captured_at", filter: () => undefined },
];

describe("access abuse: signed-out and non-owner clients read and write nothing", () => {
  let owner: Owner;
  let ownerId: string;
  let anon: Client;
  let stranger: { client: Client; userId: string };
  let strangerId: string | undefined;
  let seed: Seed;
  // Four more far-past days for the write tests, so each test owns its note.
  let writeDays: string[];
  const noteDays: string[] = [];
  const tokenLabels: string[] = [];

  beforeAll(async () => {
    requireStack();
    requirePrivileged();
    owner = await ownerClient();
    const { data, error } = await owner.auth.getUser();
    if (error) throw new Error(`reading the owner user failed: ${error.message}`);
    ownerId = data.user.id;
    anon = anonClient();
    stranger = await nonOwnerClient();
    strangerId = stranger.userId;

    // One fresh row of each kind, one push per section so a section never depends on another's validation.
    const [dailyDay, noteDay, ...rest] = await freshDays(owner, 6);
    writeDays = rest;
    noteDays.push(noteDay, ...writeDays);
    const [hourStart] = await freshWindowHours(owner, 1);
    const summaryDay = await emptySummaryDay(owner);

    const dailyAt = nextCapturedAt();
    expect(await push({ ...baseBody(dailyAt), daily_history: [dailyRow(dailyDay)] })).toEqual(CREATED);
    expect(await push({ ...baseBody(nextCapturedAt()), hourly_history: [hourRow(hourStart)] })).toEqual(CREATED);
    expect(await push({ ...baseBody(nextCapturedAt()), period_summaries: [summary("day", summaryDay)] })).toEqual(
      CREATED,
    );
    const generatedAt = nextCapturedAt();
    expect(await push({ ...baseBody(nextCapturedAt()), recommendation: recommendation(generatedAt) })).toEqual(CREATED);
    expect(await push({ ...baseBody(nextCapturedAt()), bill_forecast: billForecast() })).toEqual(CREATED);

    // The owner's note (the notes are the only client-written table).
    const noted = await owner.from("day_notes").insert({ day: noteDay, text: `Invented seed note ${noteDay}` });
    if (noted.error) throw new Error(`seeding a day note failed: ${noted.error.message}`);

    seed = {
      dailyDay,
      hourStart,
      summaryDay,
      generatedAt: generatedAt.toISOString(),
      pushCapturedAt: dailyAt.toISOString(),
      noteDay,
    };
  });

  afterAll(async () => {
    // Own rows only: the notes of this run's owner, the tokens made here (with the raw pushes stored under them) and
    // the non-owner user. Pushed data is never removed; the suite never resets the database.
    if (noteDays.length > 0) {
      await withPrivileged((db) =>
        db.query("delete from public.day_notes where user_id = $1 and day = any($2::date[])", [ownerId, noteDays]),
      );
    }
    for (const label of tokenLabels) await deleteToken(label);
    if (strangerId !== undefined) await removeUser(strangerId);
  });

  describe("reads", () => {
    it.each(PROBES)("$name: the owner reads the seeded row, anon and a non-owner read nothing", async (probe) => {
      const filter = probe.filter(seed);

      // Control: the owner sees it.
      const own = await readRows(owner, probe.table, probe.columns, filter);
      expect(own.error).toBeNull();
      expect(own.rows).toHaveLength(1);

      // Denied as an error (no grant) or as no rows (policy), never as data.
      for (const [who, client] of [
        ["anon", anon],
        ["non-owner", stranger.client],
      ] as const) {
        const result = await readRows(client, probe.table, probe.columns, filter);
        expect({ who, rows: result.rows }).toEqual({ who, rows: [] });
      }
    });

    it("ingest_tokens: nobody reads a token row, though it exists", async () => {
      const { label } = await insertToken("probe");
      tokenLabels.push(label);

      // Control: the row is there (privileged read).
      const count = await withPrivileged((db) =>
        db.query<{ n: string }>("select count(*)::text as n from public.ingest_tokens where label = $1", [label]),
      );
      expect(count.rows[0].n).toBe("1");

      for (const [who, client] of [
        ["owner", owner],
        ["anon", anon],
        ["non-owner", stranger.client],
      ] as const) {
        const result = await readRows(client, "ingest_tokens", "label", { column: "label", value: label });
        expect({ who, rows: result.rows }).toEqual({ who, rows: [] });
      }
    });

    it("app_owners: an owner sees only their own row, a non-owner and anon see none", async () => {
      // A second owner makes sure the table holds a row that is not the reader's.
      await ownerClient();

      // Control: the owner reads exactly their own row, though the table holds other owners.
      const own = await readRows(owner, "app_owners", "user_id");
      expect(own.error).toBeNull();
      expect(own.rows.map((row) => row.user_id)).toEqual([ownerId]);
      const total = await withPrivileged((db) =>
        db.query<{ n: string }>("select count(*)::text as n from public.app_owners"),
      );
      expect(Number(total.rows[0].n)).toBeGreaterThan(1);

      // The non-owner's own row was removed, and the others are hidden by the policy.
      expect((await readRows(stranger.client, "app_owners", "user_id")).rows).toEqual([]);
      expect((await readRows(anon, "app_owners", "user_id")).rows).toEqual([]);
    });
  });

  describe("day notes cannot be written by anon or a non-owner", () => {
    async function noteText(day: string): Promise<string[]> {
      const read = await readRows(owner, "day_notes", "day, text", { column: "day", value: day });
      expect(read.error).toBeNull();
      return read.rows.map((row) => String(row.text));
    }

    it("insert", async () => {
      const day = writeDays[0];
      const text = `Invented insert note ${day}`;

      // Each attempt is denied as an error or zero rows; either way the owner's read shows no note.
      await anon.from("day_notes").insert({ day, text });
      await stranger.client.from("day_notes").insert({ day, text });
      expect(await noteText(day)).toEqual([]);

      // Control: the owner can insert the same note.
      const { error } = await owner.from("day_notes").insert({ day, text });
      expect(error).toBeNull();
      expect(await noteText(day)).toEqual([text]);
    });

    it("update", async () => {
      const day = writeDays[1];
      const text = `Invented original note ${day}`;
      const { error: insertError } = await owner.from("day_notes").insert({ day, text });
      expect(insertError).toBeNull();

      for (const [who, client] of [
        ["anon", anon],
        ["non-owner", stranger.client],
      ] as const) {
        const { data } = await client
          .from("day_notes")
          .update({ text: `tampered by ${who}` })
          .eq("day", day)
          .select("day")
          .overrideTypes<Record<string, unknown>[], { merge: false }>();
        expect({ who, changed: data ?? [] }).toEqual({ who, changed: [] });
      }
      expect(await noteText(day)).toEqual([text]);

      // Control: the owner can change it.
      const changed = `Invented changed note ${day}`;
      // Same call shape as the app (src/pages/api/notes.ts): no .select(), because clients cannot read user_id, so a
      // RETURNING read of the row is refused even for the owner.
      const { error, count } = await owner
        .from("day_notes")
        .update({ text: changed }, { count: "exact" })
        .eq("day", day);
      expect(error).toBeNull();
      expect(count).toBe(1);
      expect(await noteText(day)).toEqual([changed]);
    });

    it("delete", async () => {
      const day = writeDays[2];
      const text = `Invented kept note ${day}`;
      const { error: insertError } = await owner.from("day_notes").insert({ day, text });
      expect(insertError).toBeNull();

      for (const [who, client] of [
        ["anon", anon],
        ["non-owner", stranger.client],
      ] as const) {
        const { data } = await client
          .from("day_notes")
          .delete()
          .eq("day", day)
          .select("day")
          .overrideTypes<Record<string, unknown>[], { merge: false }>();
        expect({ who, removed: data ?? [] }).toEqual({ who, removed: [] });
      }
      expect(await noteText(day)).toEqual([text]);

      // Control: the owner can delete it.
      const { error, count } = await owner.from("day_notes").delete({ count: "exact" }).eq("day", day);
      expect(error).toBeNull();
      expect(count).toBe(1);
      expect(await noteText(day)).toEqual([]);
    });
  });

  describe("owner column grants", () => {
    it("ingest_pushes: an owner reads source, captured_at, received_at and payload but not token_id or payload_hash", async () => {
      const filter = { column: "captured_at", value: seed.pushCapturedAt };

      const allowed = await readRows(owner, "ingest_pushes", "source, captured_at, received_at, payload", filter);
      expect(allowed.error).toBeNull();
      expect(allowed.rows).toHaveLength(1);
      expect(allowed.rows[0].source).toBe("homelab");

      for (const column of ["token_id", "payload_hash"]) {
        const denied = await readRows(owner, "ingest_pushes", column, filter);
        expect({ column, denied: denied.error !== null, rows: denied.rows }).toEqual({
          column,
          denied: true,
          rows: [],
        });
      }
    });

    // KNOWN GAP: the grant on recommendations is table-level (20260923150859_owner_read_recommendations.sql:14), so an
    // owner can read `push_id`, a database-internal link no client needs. The other tables grant by column list and
    // refuse it (daily_energy below). A fix is a column grant like theirs (revoke select on public.recommendations from
    // authenticated, then grant select on the columns the app reads), which would flip the first expectation.
    it("KNOWN GAP: an owner can read recommendations.push_id although the other tables hide it", async () => {
      const filter = { column: "generated_at", value: seed.generatedAt };

      const gap = await readRows(owner, "recommendations", "push_id", filter);
      expect(gap.error).toBeNull();
      expect(gap.rows).toHaveLength(1);
      expect(typeof gap.rows[0].push_id).toBe("number");

      // Control: daily_energy hides the same column.
      const hidden = await readRows(owner, "daily_energy", "push_id", { column: "day", value: seed.dailyDay });
      expect({ denied: hidden.error !== null, rows: hidden.rows }).toEqual({ denied: true, rows: [] });
    });
  });

  describe("ingest tokens", () => {
    // The anon-key call the route makes (src/pages/api/ingest.ts), with a chosen token.
    function rpcPush(client: Client, token: string, capturedAt: Date) {
      return client.rpc("ingest_push", { p_token: token, p_payload: baseBody(capturedAt) });
    }

    async function storedPushes(capturedAt: Date): Promise<Record<string, unknown>[]> {
      const read = await readRows(owner, "ingest_pushes", "source, captured_at", {
        column: "captured_at",
        value: capturedAt.toISOString(),
      });
      expect(read.error).toBeNull();
      return read.rows;
    }

    it.each([
      { kind: "unknown", token: () => `unknown-token-${String(Date.now())}` },
      { kind: "empty", token: () => "" },
    ])("a $kind token is refused with P0401 and nothing is written", async ({ token }) => {
      const capturedAt = nextCapturedAt();

      const refused = await rpcPush(anon, token(), capturedAt);
      expect(refused.error?.code).toBe("P0401");
      expect(refused.data).toBeNull();
      expect(await storedPushes(capturedAt)).toEqual([]);

      // Control: the same body with the seed token is created, so the refusal above had written nothing.
      expect(await push(baseBody(capturedAt))).toEqual(CREATED);
      expect(await storedPushes(capturedAt)).toHaveLength(1);
    });

    it("a second inserted token is accepted and the push is stored under its label", async () => {
      const second = await insertToken("second");
      tokenLabels.push(second.label);
      const capturedAt = nextCapturedAt();

      const accepted = await rpcPush(anon, second.token, capturedAt);
      expect(accepted.error).toBeNull();
      expect(accepted.data).toEqual({ status: "created" });
      expect(await storedPushes(capturedAt)).toHaveLength(1);

      const stored = await withPrivileged((db) =>
        db.query<{ label: string }>(
          "select t.label from public.ingest_pushes p join public.ingest_tokens t on t.id = p.token_id where p.source = 'homelab' and p.captured_at = $1",
          [capturedAt.toISOString()],
        ),
      );
      expect(stored.rows.map((row) => row.label)).toEqual([second.label]);

      // Control: the seed token still works next to it.
      expect(await push(baseBody(nextCapturedAt()))).toEqual(CREATED);
    });

    it("revoking a token stops the next push and writes nothing", async () => {
      const revocable = await insertToken("revocable");
      tokenLabels.push(revocable.label);

      // While active it works.
      const before = nextCapturedAt();
      expect((await rpcPush(anon, revocable.token, before)).error).toBeNull();
      expect(await storedPushes(before)).toHaveLength(1);

      await revokeToken(revocable.label);

      const after = nextCapturedAt();
      const refused = await rpcPush(anon, revocable.token, after);
      expect(refused.error?.code).toBe("P0401");
      expect(refused.data).toBeNull();
      expect(await storedPushes(after)).toEqual([]);

      // Control: the same body with the seed token is created, so the refusal had written nothing.
      expect(await push(baseBody(after))).toEqual(CREATED);
    });

    it.each([
      { who: "an owner", client: () => owner },
      { who: "a non-owner", client: () => stranger.client },
    ])("$who signed in cannot call ingest_push even with a valid token", async ({ client }) => {
      const capturedAt = nextCapturedAt();

      // The grant is anon only: a permission error (the exact code depends on PostgREST), never a stored push.
      const denied = await rpcPush(client(), SEED_TOKEN, capturedAt);
      expect(denied.error).not.toBeNull();
      expect(denied.data).toBeNull();
      expect(await storedPushes(capturedAt)).toEqual([]);

      // Control: the same body through the anon route is created.
      expect(await push(baseBody(capturedAt))).toEqual(CREATED);
      expect(instant((await storedPushes(capturedAt))[0].captured_at)).toBe(capturedAt.getTime());
    });
  });
});
