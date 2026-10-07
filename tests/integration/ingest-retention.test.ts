import { MINUTE_MS, HOUR_MS, DAY_MS } from "@/lib/format/age";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HOURLY_RETENTION_DAYS, RAW_PUSH_RETENTION_DAYS } from "@/lib/ingest/retention";
import { baseBody, hourRow } from "./support/bodies";
import { nextCapturedAt } from "./support/keys";
import { requirePrivileged, withPrivileged } from "./support/privileged";
import { push, SEED_TOKEN } from "./support/push";
import { anonClient, ownerClient, requireStack } from "./support/stack";

// The SQL retention windows (ingest.prune() in supabase/migrations/20261006120000_ingest_push_sections.sql) must match
// the constants in src/lib/ingest/retention.ts. A push is stored and then pruned by the same ingest_push call, so one
// push per side of each window is enough: a row older than the window is already gone when the call returns, a row
// younger than it stays. The rows sit 5 minutes either side of the boundary so the check never depends on now().

type Owner = Awaited<ReturnType<typeof ownerClient>>;

// The public local/CI token from supabase/seed.sql (the same one tests/integration/support/push.ts uses).

const MARGIN_MS = 5 * MINUTE_MS;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

interface StoredHour {
  hour_start: string;
  load_kwh: number | null;
  samples: number;
}

describe("ingest retention: the SQL windows match the TypeScript constants", () => {
  let owner: Owner;
  let anon: ReturnType<typeof anonClient>;
  // Rows this test may leave behind: the raw push kept at +5 minutes and the hour kept at +2 hours.
  const keptCaptures: string[] = [];
  const keptHours: string[] = [];

  beforeAll(async () => {
    requireStack();
    requirePrivileged();
    owner = await ownerClient();
    anon = anonClient();
  });

  afterAll(async () => {
    // Own rows only: the raw push is pruned anyway by any push 10 minutes later, the hour is not.
    if (keptCaptures.length > 0) {
      await withPrivileged((db) =>
        db.query("delete from public.ingest_pushes where source = 'homelab' and captured_at = any($1::timestamptz[])", [
          keptCaptures,
        ]),
      );
    }
    for (const hour of keptHours) {
      await withPrivileged((db) => db.query("delete from public.hourly_energy where hour_start = $1", [hour]));
    }
  });

  it("raw pushes: one older than the window is pruned by its own call, one younger stays", async () => {
    const now = Date.now();
    // A random millisecond offset keeps every run's captured_at unique, so no call ever answers 409.
    const unique = Math.floor(Math.random() * 1000);
    const old = new Date(now - RAW_PUSH_RETENTION_DAYS * DAY_MS - MARGIN_MS - unique);
    const kept = new Date(now - RAW_PUSH_RETENTION_DAYS * DAY_MS + MARGIN_MS + unique);
    keptCaptures.push(kept.toISOString());

    // baseBody validates against the contract's 14-day window, so it is built with the current time and then moved;
    // the direct call (as in access-abuse.test.ts) is not schema-validated.
    for (const capturedAt of [old, kept]) {
      const stored = await anon.rpc("ingest_push", {
        p_token: SEED_TOKEN,
        p_payload: { ...baseBody(new Date()), captured_at: capturedAt.toISOString() },
      });
      expect(stored.error).toBeNull();
      expect(stored.data).toEqual({ status: "created" });
    }

    const { data, error } = await owner
      .from("ingest_pushes")
      .select("captured_at")
      .eq("source", "homelab")
      .in("captured_at", [old.toISOString(), kept.toISOString()])
      .overrideTypes<{ captured_at: string }[], { merge: false }>();
    expect(error).toBeNull();
    expect((data ?? []).map((row) => Date.parse(row.captured_at))).toEqual([kept.getTime()]);
  });

  it("hourly rows: an hour older than the window is pruned by its own call, a younger one stays", async () => {
    const now = Date.now();
    // `old` ends at least 5 minutes before the cutoff; `kept` starts at least 55 minutes after it, whatever the minute.
    const oldMs = Math.floor((now - HOURLY_RETENTION_DAYS * DAY_MS - MARGIN_MS) / HOUR_MS) * HOUR_MS;
    const old = new Date(oldMs).toISOString();
    const kept = new Date(oldMs + 2 * HOUR_MS).toISOString();
    keptHours.push(kept);

    // Values from the millisecond clock: a stored row of an earlier run is very unlikely to equal them. Loads stay
    // at or below 1 kWh (0.400 to 0.799).
    const capturedAt = nextCapturedAt();
    const ms = capturedAt.getTime();
    const load = round3(0.4 + (ms % 400) / 1000);
    expect(
      await push({
        ...baseBody(capturedAt),
        hourly_history: [hourRow(old, { load_kwh: load, samples: 11 }), hourRow(kept, { load_kwh: load, samples: 11 })],
      }),
    ).toEqual({ status: 201, body: { status: "created" } });

    const { data, error } = await owner
      .from("hourly_energy")
      .select("hour_start, load_kwh, samples")
      .in("hour_start", [old, kept])
      .overrideTypes<StoredHour[], { merge: false }>();
    expect(error).toBeNull();
    expect(
      (data ?? []).map((row) => ({ at: Date.parse(row.hour_start), load: row.load_kwh, samples: row.samples })),
    ).toEqual([{ at: Date.parse(kept), load, samples: 11 }]);
  });
});
