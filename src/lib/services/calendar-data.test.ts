import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { DailyEnergyRow, DayNoteRow, RecommendationRow } from "@/types";
import { periodInstants } from "@/lib/calendar/period";
import {
  loadDailyRange,
  loadNoteDays,
  loadNoteForDay,
  loadRecommendationsForDay,
  loadRecommendationTimes,
  RECOMMENDATION_TIMES_LIMIT,
} from "./calendar-data";

// All data here is synthetic.

// Records the arguments of the query chain and resolves with the given result.
function mockClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: Record<string, unknown[]> = {};
  const chain = {
    from: (...args: unknown[]) => ((calls.from = args), chain),
    select: (...args: unknown[]) => ((calls.select = args), chain),
    gte: (...args: unknown[]) => ((calls.gte = args), chain),
    lte: (...args: unknown[]) => ((calls.lte = args), chain),
    lt: (...args: unknown[]) => ((calls.lt = args), chain),
    eq: (...args: unknown[]) => ((calls.eq = args), chain),
    order: (...args: unknown[]) => ((calls.order = args), chain),
    limit: (...args: unknown[]) => ((calls.limit = args), chain),
    maybeSingle: (...args: unknown[]) => ((calls.maybeSingle = args), chain),
    overrideTypes: () => Promise.resolve(result),
  };
  return { client: chain as unknown as SupabaseClient, calls };
}

const failure = { data: null, error: { message: "boom" } };

describe("loadDailyRange", () => {
  it("reads the period's days inclusive, oldest first", async () => {
    const rows: DailyEnergyRow[] = [
      { day: "2026-09-01", pv_kwh: 1, load_kwh: 2, grid_import_kwh: 3, grid_export_kwh: 0, pv_forecast_kwh: null },
    ];
    const { client, calls } = mockClient({ data: rows, error: null });
    await expect(loadDailyRange(client, "2026-09-01", "2026-09-30")).resolves.toEqual(rows);
    expect(calls.from).toEqual(["daily_energy"]);
    expect(calls.select).toEqual(["day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh"]);
    expect(calls.gte).toEqual(["day", "2026-09-01"]);
    expect(calls.lte).toEqual(["day", "2026-09-30"]);
    expect(calls.order).toEqual(["day", { ascending: true }]);
  });

  it("throws on an error", async () => {
    await expect(loadDailyRange(mockClient(failure).client, "2026-09-01", "2026-09-30")).rejects.toThrow("boom");
  });
});

describe("loadRecommendationTimes", () => {
  it("reads only the generation times over the half-open instant range, with the row cap as limit", async () => {
    const { client, calls } = mockClient({ data: [{ generated_at: "2026-09-27T05:00:00+00:00" }], error: null });
    // October 2026 ends on the autumn change: the range ends at Warsaw midnight of 1 November, in CET.
    const { fromMs, toMs } = periodInstants({ kind: "month", month: "2026-10" });
    await expect(loadRecommendationTimes(client, fromMs, toMs)).resolves.toEqual({
      times: ["2026-09-27T05:00:00+00:00"],
      truncated: false,
    });
    expect(calls.from).toEqual(["recommendations"]);
    expect(calls.select).toEqual(["generated_at"]);
    expect(calls.gte).toEqual(["generated_at", "2026-09-30T22:00:00.000Z"]);
    expect(calls.lt).toEqual(["generated_at", "2026-10-31T23:00:00.000Z"]);
    expect(calls.order).toEqual(["generated_at", { ascending: true }]);
    expect(calls.limit).toEqual([1000]);
  });

  it("marks the times as truncated when the limit comes back full", async () => {
    const full = Array.from({ length: RECOMMENDATION_TIMES_LIMIT }, () => ({ generated_at: "2026-09-27T05:00:00Z" }));
    const result = await loadRecommendationTimes(mockClient({ data: full, error: null }).client, 0, 1);
    expect(result.truncated).toBe(true);
    const short = await loadRecommendationTimes(mockClient({ data: full.slice(1), error: null }).client, 0, 1);
    expect(short.truncated).toBe(false);
  });

  it("throws on an error", async () => {
    await expect(loadRecommendationTimes(mockClient(failure).client, 0, 1)).rejects.toThrow("boom");
  });
});

describe("loadRecommendationsForDay", () => {
  it("reads the full rows of one Warsaw day, oldest first", async () => {
    const rows: RecommendationRow[] = [
      {
        generated_at: "2026-09-27T05:00:00Z",
        language: "pl",
        text: "T",
        provider: "ollama",
        model: "m",
        forecast: {},
        facts: {},
      },
    ];
    const { client, calls } = mockClient({ data: rows, error: null });
    // The autumn change day has 25 hours: the range ends at the next day's CET midnight.
    const { fromMs, toMs } = periodInstants({ kind: "day", day: "2026-10-25" });
    await expect(loadRecommendationsForDay(client, fromMs, toMs)).resolves.toEqual(rows);
    expect(calls.select).toEqual(["generated_at, language, text, provider, model, forecast, facts"]);
    expect(calls.gte).toEqual(["generated_at", "2026-10-24T22:00:00.000Z"]);
    expect(calls.lt).toEqual(["generated_at", "2026-10-25T23:00:00.000Z"]);
    expect(calls.order).toEqual(["generated_at", { ascending: true }]);
  });

  it("throws on an error", async () => {
    await expect(loadRecommendationsForDay(mockClient(failure).client, 0, 1)).rejects.toThrow("boom");
  });
});

describe("loadNoteForDay", () => {
  it("reads the one note of the day", async () => {
    const row: DayNoteRow = { day: "2026-09-14", text: "Synthetic note", updated_at: "2026-09-14T18:30:00+00:00" };
    const { client, calls } = mockClient({ data: row, error: null });
    await expect(loadNoteForDay(client, "2026-09-14")).resolves.toEqual(row);
    expect(calls.from).toEqual(["day_notes"]);
    expect(calls.select).toEqual(["day, text, updated_at"]);
    expect(calls.eq).toEqual(["day", "2026-09-14"]);
    expect(calls.maybeSingle).toEqual([]);
  });

  it("returns null when the day has no note", async () => {
    await expect(loadNoteForDay(mockClient({ data: null, error: null }).client, "2026-09-14")).resolves.toBeNull();
  });

  it("throws on an error", async () => {
    await expect(loadNoteForDay(mockClient(failure).client, "2026-09-14")).rejects.toThrow("boom");
  });
});

describe("loadNoteDays", () => {
  it("reads only the days that carry a note, inclusive, oldest first", async () => {
    const { client, calls } = mockClient({ data: [{ day: "2026-09-03" }, { day: "2026-09-30" }], error: null });
    await expect(loadNoteDays(client, "2026-09-01", "2026-09-30")).resolves.toEqual(["2026-09-03", "2026-09-30"]);
    expect(calls.from).toEqual(["day_notes"]);
    expect(calls.select).toEqual(["day"]);
    expect(calls.gte).toEqual(["day", "2026-09-01"]);
    expect(calls.lte).toEqual(["day", "2026-09-30"]);
    expect(calls.order).toEqual(["day", { ascending: true }]);
  });

  it("throws on an error", async () => {
    await expect(loadNoteDays(mockClient(failure).client, "2026-09-01", "2026-09-30")).rejects.toThrow("boom");
  });
});
