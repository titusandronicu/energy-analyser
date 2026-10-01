import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { PeriodSummaryRow } from "@/types";
import { LOAD_FAILED } from "@/lib/format/status";
import {
  loadPeriodSummary,
  loadTodaySummary,
  toSummaryView,
  todaySummaryStatus,
  toTodaySummaryView,
} from "./period-summary";
import { STALE_AFTER_MS } from "./recommendation";

// All data here is synthetic.

// Records the arguments of the query chain (every `eq` call, in order) and resolves with the given result.
function mockClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: Record<string, unknown[]> = {};
  const eqs: unknown[][] = [];
  const chain = {
    from: (...args: unknown[]) => ((calls.from = args), chain),
    select: (...args: unknown[]) => ((calls.select = args), chain),
    eq: (...args: unknown[]) => (eqs.push(args), chain),
    order: (...args: unknown[]) => ((calls.order = args), chain),
    limit: (...args: unknown[]) => ((calls.limit = args), chain),
    maybeSingle: (...args: unknown[]) => ((calls.maybeSingle = args), chain),
    overrideTypes: () => Promise.resolve(result),
  };
  return { client: chain as unknown as SupabaseClient, calls, eqs };
}

const failure = { data: null, error: { message: "boom" } };

const COLUMNS =
  "kind, period, facts, narration_text, narration_generated_at, narration_provider, narration_model, built_at";

function row(overrides: Partial<PeriodSummaryRow> = {}): PeriodSummaryRow {
  return {
    kind: "today",
    period: "2026-09-23",
    facts: { secret_figure: 4242 },
    narration_text: "  Dziś słońca było sporo.\nBateria wystarczyła do wieczora.  ",
    narration_generated_at: "2026-09-23T10:05:00Z",
    narration_provider: "openrouter",
    narration_model: "synthetic-model",
    built_at: "2026-09-23T10:00:00Z",
    ...overrides,
  };
}

// Warsaw is UTC+2 in late September (CEST).
const at = (iso: string) => new Date(iso);

describe("loadTodaySummary", () => {
  it("reads the newest today row by name-listed columns, never *", async () => {
    const stored = row();
    const { client, calls, eqs } = mockClient({ data: [stored], error: null });
    await expect(loadTodaySummary(client)).resolves.toEqual(stored);
    expect(calls.from).toEqual(["period_summaries"]);
    expect(calls.select).toEqual([COLUMNS]);
    expect(COLUMNS.split(", ")).toHaveLength(8);
    expect(eqs).toEqual([["kind", "today"]]);
    expect(calls.order).toEqual(["period", { ascending: false }]);
    expect(calls.limit).toEqual([1]);
  });

  it("returns null when there is no today row", async () => {
    await expect(loadTodaySummary(mockClient({ data: [], error: null }).client)).resolves.toBeNull();
  });

  it("throws on an error", async () => {
    await expect(loadTodaySummary(mockClient(failure).client)).rejects.toThrow("loading today's summary failed: boom");
  });
});

describe("loadPeriodSummary", () => {
  it("reads one row by kind and period with the same eight columns", async () => {
    const stored = row({ kind: "month", period: "2026-08" });
    const { client, calls, eqs } = mockClient({ data: stored, error: null });
    await expect(loadPeriodSummary(client, "month", "2026-08")).resolves.toEqual(stored);
    expect(calls.from).toEqual(["period_summaries"]);
    expect(calls.select).toEqual([COLUMNS]);
    expect(eqs).toEqual([
      ["kind", "month"],
      ["period", "2026-08"],
    ]);
    expect(calls.maybeSingle).toEqual([]);
  });

  it("returns null when the lab wrote nothing for the period", async () => {
    const { client } = mockClient({ data: null, error: null });
    await expect(loadPeriodSummary(client, "day", "2026-09-14")).resolves.toBeNull();
  });

  it("throws on an error", async () => {
    await expect(loadPeriodSummary(mockClient(failure).client, "day", "2026-09-14")).rejects.toThrow(
      "loading the day summary failed: boom",
    );
  });
});

describe("toSummaryView", () => {
  it("shows a day's text trimmed, with its generation time and the day it covers", () => {
    const view = toSummaryView(row({ kind: "day", period: "2026-09-22" }), "day");
    expect(view).toEqual({
      kind: "narrated",
      text: "Dziś słońca było sporo.\nBateria wystarczyła do wieczora.",
      // 10:05 UTC is 12:05 Warsaw.
      generatedAtLabel: "23 września 2026, 12:05",
      periodLabel: "22 września 2026, wtorek",
    });
  });

  it("names a month by its month and year", () => {
    const view = toSummaryView(row({ kind: "month", period: "2026-08" }), "month");
    expect(view).toMatchObject({ kind: "narrated", periodLabel: "sierpień 2026" });
  });

  it("falls back to built_at when the text has no generation time", () => {
    const view = toSummaryView(row({ narration_generated_at: null }), "day");
    expect(view).toMatchObject({ kind: "narrated", generatedAtLabel: "23 września 2026, 12:00" });
  });

  it.each([null, "", "   \n\t "])("maps narration %j to pending, with the period and no figures", (narration_text) => {
    const view = toSummaryView(row({ kind: "day", period: "2026-09-22", narration_text }), "day");
    expect(view).toEqual({ kind: "pending", periodLabel: "22 września 2026, wtorek" });
  });

  it("never exposes facts", () => {
    for (const narration_text of ["Tekst.", null]) {
      const view = toSummaryView(row({ narration_text }), "day");
      expect(JSON.stringify(view)).not.toContain("4242");
      expect(view).not.toHaveProperty("facts");
    }
  });
});

describe("toTodaySummaryView", () => {
  const now = at("2026-09-23T11:00:00Z");

  it("is empty without a row", () => {
    expect(toTodaySummaryView(null, now)).toEqual({ kind: "empty" });
  });

  it("builds the narrated card for a current text", () => {
    expect(toTodaySummaryView(row(), now)).toEqual({
      kind: "narrated",
      text: "Dziś słońca było sporo.\nBateria wystarczyła do wieczora.",
      generatedAtLabel: "23 września 2026, 12:05",
      periodLabel: "23 września 2026, środa",
      status: { tone: "good", label: "aktualna" },
      isStale: false,
    });
  });

  it("treats built_at exactly 2 hours old as current and one millisecond over as stale", () => {
    const builtAt = at("2026-09-23T09:00:00Z");
    const exact = toTodaySummaryView(
      row({ built_at: builtAt.toISOString() }),
      new Date(builtAt.getTime() + STALE_AFTER_MS),
    );
    expect(exact).toMatchObject({ status: { tone: "good", label: "aktualna" }, isStale: false });
    const over = toTodaySummaryView(
      row({ built_at: builtAt.toISOString() }),
      new Date(builtAt.getTime() + STALE_AFTER_MS + 1),
    );
    expect(over).toMatchObject({ status: { tone: "watch", label: "sprzed 2 godz." }, isStale: true });
  });

  it("words an older text from today by its age", () => {
    const view = toTodaySummaryView(row({ built_at: "2026-09-23T06:00:00Z" }), now);
    expect(view).toMatchObject({ status: { tone: "watch", label: "sprzed 5 godz." }, isStale: true });
  });

  it("reads a text from an earlier day as about another day, whatever its age", () => {
    // 23:30 Warsaw on the 22nd, seen at 00:30 Warsaw on the 23rd: one hour old, but about another day.
    const view = toTodaySummaryView(
      row({ period: "2026-09-22", built_at: "2026-09-22T21:30:00Z" }),
      at("2026-09-22T22:30:00Z"),
    );
    expect(view).toMatchObject({
      status: { tone: "problem", label: "z 22 września — dotyczy innego dnia" },
      periodLabel: "22 września 2026, wtorek",
      isStale: true,
    });
    const old = toTodaySummaryView(row({ period: "2026-09-20", built_at: "2026-09-20T21:30:00Z" }), now);
    expect(old).toMatchObject({ status: { tone: "problem", label: "z 20 września — dotyczy innego dnia" } });
  });

  it("uses the Warsaw day, not the UTC day, at midnight", () => {
    // 00:10 Warsaw on the 23rd is still the 22nd in UTC: the period is the 23rd and the text is current.
    const view = toTodaySummaryView(row({ built_at: "2026-09-22T22:10:00Z" }), at("2026-09-22T23:40:00Z"));
    expect(view).toMatchObject({ status: { tone: "good", label: "aktualna" }, isStale: false });
  });

  it("shows a built_at in the future as current, not an error", () => {
    const view = toTodaySummaryView(row({ built_at: "2026-09-23T11:05:00Z" }), now);
    expect(view).toMatchObject({ status: { tone: "good", label: "aktualna" }, isStale: false });
  });

  it.each([null, "  "])("is pending for a row from today with narration %j", (narration_text) => {
    expect(toTodaySummaryView(row({ narration_text }), now)).toEqual({
      kind: "pending",
      periodLabel: "23 września 2026, środa",
    });
  });

  it.each([null, "  "])("is empty for a row from an earlier day with narration %j", (narration_text) => {
    expect(toTodaySummaryView(row({ period: "2026-09-22", narration_text }), now)).toEqual({ kind: "empty" });
  });

  it("never exposes facts", () => {
    const view = toTodaySummaryView(row(), now);
    expect(JSON.stringify(view)).not.toContain("4242");
    expect(view).not.toHaveProperty("facts");
  });
});

describe("todaySummaryStatus", () => {
  const now = at("2026-09-23T11:00:00Z");

  it("keeps the status of a narrated text", () => {
    expect(todaySummaryStatus(toTodaySummaryView(row(), now))).toEqual({ tone: "good", label: "aktualna" });
  });

  it("is neutral for a row without text", () => {
    expect(todaySummaryStatus({ kind: "pending", periodLabel: "x" })).toEqual({
      tone: "insufficient",
      label: "opis jeszcze się nie pojawił",
    });
  });

  it("is neutral when nothing was pushed", () => {
    expect(todaySummaryStatus({ kind: "empty" })).toEqual({
      tone: "insufficient",
      label: "laboratorium jeszcze nic nie przesłało",
    });
  });

  it("is the shared load failure for null", () => {
    expect(todaySummaryStatus(null)).toBe(LOAD_FAILED);
  });
});
