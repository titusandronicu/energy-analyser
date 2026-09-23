import { describe, expect, it } from "vitest";
import type { RecommendationRow } from "@/types";
import { isStaleRecommendation, toRecommendationView } from "./recommendation";

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
    expect(toRecommendationView(null, now)).toEqual({ kind: "empty" });
  });

  it("builds the Polish card for a fresh recommendation", () => {
    expect(toRecommendationView(row(), now)).toEqual({
      kind: "recommendation",
      text: "Utrzymaj rezerwę baterii na 20%.\nNie ładuj z sieci.",
      generatedAtLabel: "23 września 2026, 12:00",
      isStale: false,
      forecast: { todayLabel: "18,6 kWh", tomorrowLabel: "9,2 kWh", confidenceLabel: "średnia" },
      modelLabel: "gemma3:4b (lokalny model)",
      findings: ["Forecast.Solar przewiduje 18.6 kWh."],
    });
  });

  it("marks a recommendation from yesterday as stale", () => {
    const view = toRecommendationView(row({ generated_at: "2026-09-22T20:00:00Z" }), now);
    expect(view.kind === "recommendation" && view.isStale).toBe(true);
  });

  it.each([
    ["low", "niska"],
    ["medium", "średnia"],
    ["high", "wysoka"],
    [undefined, "nieznana"],
    ["certain", "nieznana"],
  ])("labels confidence %s as %s", (confidence, label) => {
    const view = toRecommendationView(row({ forecast: { today_kwh: 1, tomorrow_kwh: 2, confidence } }), now);
    expect(view.kind === "recommendation" && view.forecast.confidenceLabel).toBe(label);
  });

  it("shows a dash for missing or non-numeric forecast values", () => {
    const view = toRecommendationView(row({ forecast: { today_kwh: null, tomorrow_kwh: "9" } }), now);
    expect(view.kind === "recommendation" && view.forecast).toEqual({
      todayLabel: "—",
      tomorrowLabel: "—",
      confidenceLabel: "nieznana",
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
