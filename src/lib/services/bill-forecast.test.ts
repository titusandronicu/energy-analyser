import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { BillForecastRow } from "@/types";
import { loadBillForecast } from "./bill-forecast";

const row: BillForecastRow = {
  captured_at: "2026-09-28T10:00:00Z",
  received_at: "2026-09-28T10:00:02Z",
  bill_forecast: { status: "ok" },
};

describe("loadBillForecast", () => {
  // Records the arguments of the query chain and resolves with the given result.
  function mockClient(result: { data: BillForecastRow[] | null; error: { message: string } | null }) {
    const calls: Record<string, unknown[]> = {};
    const chain = {
      from: (...args: unknown[]) => ((calls.from = args), chain),
      select: (...args: unknown[]) => ((calls.select = args), chain),
      limit: (...args: unknown[]) => ((calls.limit = args), chain),
      overrideTypes: () => Promise.resolve(result),
    };
    return { client: chain as unknown as SupabaseClient, calls };
  }

  it("reads one row of the bill_forecast view", async () => {
    const { client, calls } = mockClient({ data: [row], error: null });
    await expect(loadBillForecast(client)).resolves.toEqual(row);
    expect(calls.from).toEqual(["bill_forecast"]);
    // The view already picks the newest push carrying a forecast, so the loader only asks for its columns.
    expect(calls.select).toEqual(["captured_at, received_at, bill_forecast"]);
    expect(calls.limit).toEqual([1]);
  });

  it("returns null when no push carries a forecast", async () => {
    const { client } = mockClient({ data: [], error: null });
    await expect(loadBillForecast(client)).resolves.toBeNull();
  });

  it("throws on a query error so the page shows a load failure", async () => {
    const { client } = mockClient({ data: null, error: { message: "permission denied" } });
    await expect(loadBillForecast(client)).rejects.toThrow("loading bill forecast failed: permission denied");
  });
});
