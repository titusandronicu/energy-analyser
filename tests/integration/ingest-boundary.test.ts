import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDailyRange } from "@/lib/services/calendar-data";
import { handleIngest, type IngestResponse } from "@/lib/services/ingest";
import { baseBody, dailyRow } from "./support/bodies";
import { freshDays, nextCapturedAt } from "./support/keys";
import { requirePrivileged, withPrivileged } from "./support/privileged";
import { SEED_TOKEN } from "./support/push";
import { anonClient, ownerClient, requireStack } from "./support/stack";

// Two interactions of the push boundary that no other test pins: which answer a request gets when its token is unknown
// AND its body breaks the contract (the token is checked before the body, so 401), and what the store does with a
// payload that never went through the contract (stored today; the name says what would flip it).

type Owner = Awaited<ReturnType<typeof ownerClient>>;

// The public local/CI token from supabase/seed.sql (the same one tests/integration/support/push.ts uses).

const CREATED = { status: 201, body: { status: "created" } };

describe("ingest boundary: token order and the contract bypass", () => {
  let owner: Owner;
  let anon: ReturnType<typeof anonClient>;
  // The far-past day the bypass test writes; removed afterwards because its negative total is not a value to leave.
  const writtenDays: string[] = [];

  beforeAll(async () => {
    requireStack();
    requirePrivileged();
    owner = await ownerClient();
    anon = anonClient();
  });

  afterAll(async () => {
    // Own row only: the raw push stored with it is pruned by ingest_push after 14 days.
    for (const day of writtenDays) {
      await withPrivileged((db) => db.query("delete from public.daily_energy where day = $1", [day]));
    }
  });

  // The route's wiring (src/pages/api/ingest.ts): the real handleIngest with the real ingest_token_ok and ingest_push
  // behind an anon client.
  // Unlike support/push.ts it does not check the body first, so an invalid body reaches the handler as sent.
  function call(token: string, body: unknown): Promise<IngestResponse> {
    return handleIngest(
      new Request("http://localhost/api/ingest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      {
        tokenOk: (rpcToken) => anon.rpc("ingest_token_ok", { p_token: rpcToken }),
        rpc: (rpcToken, payload) => anon.rpc("ingest_push", { p_token: rpcToken, p_payload: payload }),
        now: () => new Date(),
      },
    );
  }

  // Valid JSON that breaks the contract: a charge level above 100 %.
  function invalidBody(capturedAt: Date) {
    const valid = baseBody(capturedAt);
    return { ...valid, state: { ...valid.state, battery_soc_pct: 101 } };
  }

  // The handler checks the token (ingest_token_ok) before it reads or validates the body, so a request with both faults
  // answers 401 and the body is never looked at.
  it("an unknown token with an invalid body answers 401: the token is checked before the body", async () => {
    const unknownToken = `not-a-real-token-${String(Date.now())}`;

    const response = await call(unknownToken, invalidBody(nextCapturedAt()));
    expect(response).toEqual({ status: 401, body: { error: "unauthorized" } });
  });

  it("controls: a valid token with an invalid body is 422, and a valid body with an unknown token is 401", async () => {
    const invalid = await call(SEED_TOKEN, invalidBody(nextCapturedAt()));
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ error: "invalid payload", path: "state.battery_soc_pct" });

    const unauthorized = await call(`not-a-real-token-${String(Date.now())}`, baseBody(nextCapturedAt()));
    expect(unauthorized).toEqual({ status: 401, body: { error: "unauthorized" } });

    // Control: the same valid body with the seed token is stored.
    expect(await call(SEED_TOKEN, baseBody(nextCapturedAt()))).toEqual(CREATED);
  });

  // KNOWN GAP: the contract is checked by the route, not by ingest_push, so a caller holding a valid token that calls
  // the function directly stores a payload the contract would refuse (docs/ingest/README.md accepts this: the token is
  // the trust boundary). A database guard in ingest_push (or a contract check moved behind it) would flip this test:
  // the rpc would answer an error and the negative total would not be stored.
  it("KNOWN GAP: an out-of-contract payload sent straight to ingest_push with a valid token is stored", async () => {
    const [day] = await freshDays(owner, 1);
    writtenDays.push(day);
    const body = { ...baseBody(nextCapturedAt()), daily_history: [dailyRow(day, { load_kwh: -5 })] };

    // The route's own path refuses it: a negative total is outside the contract.
    const checked = await call(SEED_TOKEN, body);
    expect(checked.status).toBe(422);
    expect(checked.body).toMatchObject({ error: "invalid payload" });
    expect(await loadDailyRange(owner, day, day)).toEqual([]);

    // The same payload straight to the function is created and the row holds the negative total.
    const direct = await anon.rpc("ingest_push", { p_token: SEED_TOKEN, p_payload: body });
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual({ status: "created" });
    expect(await loadDailyRange(owner, day, day)).toEqual([
      { day, pv_kwh: 7.5, load_kwh: -5, grid_import_kwh: 3, grid_export_kwh: 1.5, pv_forecast_kwh: null },
    ]);
  });
});
