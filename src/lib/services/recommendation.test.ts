import { describe, expect, it } from "vitest";
import type { RecommendationRow } from "@/types";
import { FORECAST_HISTORY_START, isStaleRecommendation, toRecommendationView } from "./recommendation";

const CERTAINTY = { tone: "insufficient", label: "jeszcze nie wiadomo — prognozy zbierane od 27 września" };

function row(overrides: Partial<RecommendationRow> = {}): RecommendationRow {
  return {
    generated_at: "2026-09-23T10:00:00Z",
    language: "pl",
    text: "  Utrzymaj rezerwę baterii na 20%.\nNie ładuj z sieci.  ",
    provider: "ollama",
    model: "gemma3:4b",
    forecast: { today_kwh: 18.6, tomorrow_kwh: 9.2, confidence: "medium" },
    facts: { local_findings: [{ fact: "Forecast.Solar przewiduje 18.6 kWh." }] },
    ...overrides,
  };
}

// Warsaw is UTC+2 in late September (CEST).
const at = (iso: string) => new Date(iso);

describe("isStaleRecommendation", () => {
  it("is fresh when generated earlier the same Warsaw day within 2 hours", () => {
    expect(isStaleRecommendation(at("2026-09-23T10:00:00Z"), at("2026-09-23T11:30:00Z"))).toBe(false);
  });

  it("is not stale at exactly 2 hours", () => {
    expect(isStaleRecommendation(at("2026-09-23T10:00:00Z"), at("2026-09-23T12:00:00Z"))).toBe(false);
  });

  it("is stale just over 2 hours the same day", () => {
    expect(isStaleRecommendation(at("2026-09-23T10:00:00Z"), at("2026-09-23T12:00:01Z"))).toBe(true);
  });

  it("is stale when generated yesterday in Warsaw even if under 2 hours ago", () => {
    // 23:30 Warsaw on the 22nd vs 00:30 Warsaw on the 23rd — one hour apart.
    expect(isStaleRecommendation(at("2026-09-22T21:30:00Z"), at("2026-09-22T22:30:00Z"))).toBe(true);
  });

  it("uses the Warsaw day, not the UTC day, at midnight", () => {
    // 00:10 and 01:40 Warsaw on the 23rd are the 22nd in UTC for the first one — same Warsaw day.
    expect(isStaleRecommendation(at("2026-09-22T22:10:00Z"), at("2026-09-22T23:40:00Z"))).toBe(false);
  });
});

describe("toRecommendationView", () => {
  const now = at("2026-09-23T11:00:00Z");

  it("returns the empty state without a row", () => {
    expect(toRecommendationView(null, now)).toEqual({
      kind: "empty",
      status: { tone: "insufficient", label: "laboratorium jeszcze nic nie przesłało" },
    });
  });

  it("builds the Polish card for a fresh recommendation", () => {
    expect(toRecommendationView(row(), now)).toEqual({
      kind: "recommendation",
      status: { tone: "good", label: "aktualna" },
      text: "Utrzymaj rezerwę baterii na 20%.\nNie ładuj z sieci.",
      generatedAtLabel: "23 września 2026, 12:00",
      isStale: false,
      isFromEarlierDay: false,
      forecast: {
        todayLabel: "18,6 kWh",
        tomorrowLabel: "9,2 kWh",
        todayDayLabel: "23 września",
        tomorrowDayLabel: "24 września",
        certainty: CERTAINTY,
      },
      modelLabel: "gemma3:4b (lokalny model)",
      findings: ["Forecast.Solar przewiduje 18.6 kWh."],
    });
  });

  it("marks a recommendation from yesterday as stale", () => {
    const view = toRecommendationView(row({ generated_at: "2026-09-22T20:00:00Z" }), now);
    expect(view.kind === "recommendation" && view.isStale).toBe(true);
  });

  it.each([
    ["2026-09-23T09:00:00Z", { tone: "good", label: "aktualna" }],
    ["2026-09-23T09:00:00Z", { tone: "good", label: "aktualna" }, "2026-09-23T11:00:00Z"],
    ["2026-09-23T09:00:00Z", { tone: "watch", label: "sprzed 2 godz." }, "2026-09-23T11:00:01Z"],
    ["2026-09-23T06:00:00Z", { tone: "watch", label: "sprzed 5 godz." }],
    // 23:30 Warsaw on the 22nd, seen at 00:30 Warsaw on the 23rd: one hour old, but about another day.
    ["2026-09-22T21:30:00Z", { tone: "problem", label: "z 22 września — dotyczy innego dnia" }, "2026-09-22T22:30:00Z"],
    // 00:10 Warsaw on the 23rd is still the 22nd in UTC: same Warsaw day.
    ["2026-09-22T22:10:00Z", { tone: "good", label: "aktualna" }, "2026-09-22T23:40:00Z"],
    ["2026-09-20T10:00:00Z", { tone: "problem", label: "z 20 września — dotyczy innego dnia" }],
  ])("rates a recommendation generated at %s as %j", (generated_at, status, clock = "2026-09-23T11:00:00Z") => {
    const view = toRecommendationView(row({ generated_at }), at(clock));
    expect(view.kind === "recommendation" && view.status).toEqual(status);
  });

  it("marks advice generated before today in Warsaw as from an earlier day, whatever its age", () => {
    // 23:30 Warsaw on the 22nd, read an hour later at 00:30 on the 23rd.
    const late = toRecommendationView(row({ generated_at: "2026-09-22T21:30:00Z" }), at("2026-09-22T22:30:00Z"));
    expect(late.kind === "recommendation" && late.isFromEarlierDay).toBe(true);
    // 00:10 Warsaw on the 23rd, read the same Warsaw day, five hours later.
    const early = toRecommendationView(row({ generated_at: "2026-09-22T22:10:00Z" }), at("2026-09-23T03:10:00Z"));
    expect(early.kind === "recommendation" && early.isFromEarlierDay).toBe(false);
  });

  it("dates the forecast history from 27 September 2026", () => {
    expect(FORECAST_HISTORY_START).toBe("2026-09-27");
  });

  it.each(["low", "medium", "high", undefined, "certain"])(
    "shows certainty as not known yet whatever the lab's confidence (%s)",
    (confidence) => {
      const view = toRecommendationView(row({ forecast: { today_kwh: 1, tomorrow_kwh: 2, confidence } }), now);
      expect(view.kind === "recommendation" && view.forecast.certainty).toEqual(CERTAINTY);
    },
  );

  it("names the forecast days by the Warsaw day the advice was generated", () => {
    const now = at("2026-09-24T08:00:00Z");
    // 21:59 UTC is 23:59 on the 23rd in Warsaw; 22:00 UTC is already 00:00 on the 24th.
    const before = toRecommendationView(row({ generated_at: "2026-09-23T21:59:00Z" }), now);
    expect(before.kind === "recommendation" && before.forecast).toMatchObject({
      todayDayLabel: "23 września",
      tomorrowDayLabel: "24 września",
    });
    const after = toRecommendationView(row({ generated_at: "2026-09-23T22:00:00Z" }), now);
    expect(after.kind === "recommendation" && after.forecast).toMatchObject({
      todayDayLabel: "24 września",
      tomorrowDayLabel: "25 września",
    });
    // Across a month end, read a day later: the days still belong to the advice, not to the reading.
    const monthEnd = toRecommendationView(row({ generated_at: "2026-09-30T10:00:00Z" }), at("2026-10-01T10:00:00Z"));
    expect(monthEnd.kind === "recommendation" && monthEnd.forecast).toMatchObject({
      todayDayLabel: "30 września",
      tomorrowDayLabel: "1 października",
    });
  });

  it("shows a dash for missing or non-numeric forecast values", () => {
    const view = toRecommendationView(row({ forecast: { today_kwh: null, tomorrow_kwh: "9" } }), now);
    expect(view.kind === "recommendation" && view.forecast).toMatchObject({
      todayLabel: "—",
      tomorrowLabel: "—",
      certainty: CERTAINTY,
    });
  });

  it("keeps the raw model name for an unknown provider", () => {
    const view = toRecommendationView(row({ provider: "other", model: "x-1" }), now);
    expect(view.kind === "recommendation" && view.modelLabel).toBe("x-1");
  });

  it.each([null, "text", [], { local_findings: "no" }, { local_findings: [null, { fact: 3 }, { fact: "  " }] }])(
    "returns no findings for malformed facts %j",
    (facts) => {
      const view = toRecommendationView(row({ facts }), now);
      expect(view.kind === "recommendation" && view.findings).toEqual([]);
    },
  );
});
