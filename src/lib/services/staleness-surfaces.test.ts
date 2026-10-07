import { MINUTE_MS, HOUR_MS } from "@/lib/format/age";
import { describe, expect, it } from "vitest";
import type { BillForecastRow, LiveStateRow, PeriodSummaryRow, RecommendationRow } from "@/types";
import { FORECAST_FUTURE_SKEW_MS, toBillForecastView } from "./bill-forecast";
import { toLiveStateView } from "./live-state";
import { toTodaySummaryView } from "./period-summary";
import { FUTURE_SKEW_MS, toRecommendationView } from "./recommendation";

// All data here is synthetic.

// One table for every surface that judges the age of a time. The thresholds are written out as literals from
// docs/logic.md ("Live state", "Recommendation", "Today's text", "Bill forecast") and are deliberately NOT imported:
// if a module's constant drifts, its row turns red. The only production imports are the four view mappers and, in
// the last test, the two skew constants whose agreement is the thing proved.

// The app's clock is fixed: 12:00 UTC is 14:00 in Warsaw (CEST, UTC+2) on 23 September 2026. No fake timers.
const NOW = new Date("2026-09-23T12:00:00Z");

// A positive age is in the past, a negative age is ahead of the app's clock.
const timeAt = (ageMs: number) => new Date(NOW.getTime() - ageMs).toISOString();

type Outcome = "current" | "watch" | "problem";
interface Reading {
  outcome: Outcome;
  isStale: boolean;
  label: string;
  // Only the bill forecast: its `isStale` and `outcome` both come from the view kind, so for a current forecast the
  // tone and the month flag are what the edge rows actually pin.
  forecast?: { tone: string; isOtherMonth: boolean };
}

function liveState(ageMs: number): Reading {
  const row: LiveStateRow = { captured_at: timeAt(ageMs), received_at: timeAt(ageMs), state: { battery_soc_pct: 70 } };
  const view = toLiveStateView(row, NOW);
  if (view.kind !== "state") throw new Error("expected a state view");
  const tone = view.status.tone;
  return { outcome: tone === "good" ? "current" : (tone as Outcome), isStale: view.isStale, label: view.status.label };
}

function recommendation(ageMs: number): Reading {
  const row: RecommendationRow = {
    generated_at: timeAt(ageMs),
    language: "pl",
    text: "Synthetic advice.",
    provider: "ollama",
    model: "synthetic-model",
    forecast: { today_kwh: 10, tomorrow_kwh: 12 },
    facts: {},
  };
  const view = toRecommendationView(row, NOW);
  if (view.kind !== "recommendation") throw new Error("expected a recommendation");
  const tone = view.status.tone;
  return { outcome: tone === "good" ? "current" : (tone as Outcome), isStale: view.isStale, label: view.status.label };
}

function todaySummary(ageMs: number): Reading {
  const row: PeriodSummaryRow = {
    kind: "today",
    period: "2026-09-23",
    facts: {},
    narration_text: "Synthetic summary.",
    narration_generated_at: timeAt(ageMs),
    narration_provider: "openrouter",
    narration_model: "synthetic-model",
    built_at: timeAt(ageMs),
  };
  const view = toTodaySummaryView(row, NOW);
  if (view.kind !== "narrated") throw new Error("expected a narrated summary");
  const tone = view.status.tone;
  return { outcome: tone === "good" ? "current" : (tone as Outcome), isStale: view.isStale, label: view.status.label };
}

function billForecast(ageMs: number): Reading {
  const row: BillForecastRow = {
    captured_at: timeAt(0),
    received_at: timeAt(0),
    bill_forecast: {
      status: "ok",
      month: "2026-09",
      generated_at: timeAt(ageMs),
      projected_bill_gross_pln: 200,
      range_gross_pln: { low: 150, high: 250 },
      observed_days: Array.from({ length: 8 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}` })),
    },
  };
  const view = toBillForecastView(row, NOW);
  // A refusal is the bill forecast's way of saying "not current": it shows no figure.
  if (view.kind === "unavailable") return { outcome: "problem", isStale: true, label: view.status.label };
  if (view.kind !== "forecast") throw new Error("expected a forecast or a refusal");
  return {
    outcome: "current",
    isStale: false,
    label: view.status.label,
    forecast: { tone: view.status.tone, isOtherMonth: view.isOtherMonth },
  };
}

const surfaces = {
  "live state": liveState,
  recommendation,
  "today summary": todaySummary,
  "bill forecast": billForecast,
};

// [surface, age in ms (negative: ahead of the clock), outcome, the label when it says something about the age]
const rows: [keyof typeof surfaces, number, Outcome, string | null][] = [
  // Live state: 15 minutes is stale (watch), 2 hours is a problem. Both lines are inclusive on the milder side.
  ["live state", 0, "current", "aktualne"],
  ["live state", 15 * MINUTE_MS, "current", "aktualne"],
  ["live state", 15 * MINUTE_MS + 1, "watch", "dane sprzed 15 min"],
  ["live state", 2 * HOUR_MS, "watch", "dane sprzed 2 godz."],
  ["live state", 2 * HOUR_MS + 1, "problem", "brak nowych danych od 2 godz."],
  // The contract guards captured_at against the future only at receipt and within 5 minutes, and the live view has no
  // future guard of its own, so the only future case that can occur is one within the 5-minute skew: current.
  ["live state", -5 * MINUTE_MS, "current", "aktualne"],

  // Recommendation: 2 hours.
  ["recommendation", 2 * HOUR_MS, "current", "aktualna"],
  ["recommendation", 2 * HOUR_MS + 1, "watch", "sprzed 2 godz."],
  ["recommendation", -5 * MINUTE_MS, "current", "aktualna"],
  ["recommendation", -(5 * MINUTE_MS + 1), "problem", "czas z przyszłości"],

  // Today summary: the recommendation's rule, 2 hours.
  ["today summary", 2 * HOUR_MS, "current", "aktualna"],
  ["today summary", 2 * HOUR_MS + 1, "watch", "sprzed 2 godz."],
  ["today summary", -5 * MINUTE_MS, "current", "aktualna"],
  ["today summary", -(5 * MINUTE_MS + 1), "problem", "czas z przyszłości"],

  // Bill forecast: 30 minutes stale, 5 minutes ahead of the clock a producer clock error. Both refuse the figure.
  ["bill forecast", 30 * MINUTE_MS, "current", null],
  ["bill forecast", 30 * MINUTE_MS + 1, "problem", "wyliczona 30 min temu"],
  ["bill forecast", -5 * MINUTE_MS, "current", null],
  ["bill forecast", -(5 * MINUTE_MS + 1), "problem", "czas wyliczenia z przyszłości"],
];

describe("age-bearing surfaces at their edges", () => {
  it.each(rows)("%s with a time %i ms old reads %s", (surface, ageMs, outcome, label) => {
    const reading = surfaces[surface](ageMs);
    expect(reading.outcome).toBe(outcome);
    expect(reading.isStale).toBe(outcome !== "current");
    if (label !== null) expect(reading.label).toBe(label);
    // The fixture body has no closed-month check, so by docs/logic.md ("Bill forecast": no invoice, no comparison)
    // a current forecast reads "insufficient" (grey), and its month is the clock's month (September 2026).
    if (surface === "bill forecast" && outcome === "current") {
      expect(reading.forecast).toEqual({ tone: "insufficient", isOtherMonth: false });
    }
  });

  // The live view has no future guard (a negative age is clamped to 0 in its label and counts as fresh), unlike the
  // other three surfaces. The contract refuses a future `captured_at` beyond 5 minutes at receipt, so this is only
  // reachable through a stored row that skipped it.
  it("KNOWN GAP: live state with a time more than 5 minutes ahead of the clock still reads current", () => {
    const reading = liveState(-(5 * MINUTE_MS + 1));
    expect(reading.outcome).toBe("current");
    expect(reading.isStale).toBe(false);
    // A future guard should flip this to a problem, as on the recommendation ("czas z przyszłości").
    expect(reading.label).toBe("aktualne");
  });
});

describe("a text from another Warsaw day", () => {
  // 21:59 UTC is 23:59 in Warsaw on 23 September; two minutes later it is 00:01 on the 24th (CEST).
  const written = "2026-09-23T21:59:00Z";
  const readAt = new Date("2026-09-23T22:01:00Z");

  it("reads as another day on the recommendation, two minutes after it was written", () => {
    const row: RecommendationRow = {
      generated_at: written,
      language: "pl",
      text: "Synthetic advice.",
      provider: "ollama",
      model: "synthetic-model",
      forecast: {},
      facts: {},
    };
    const view = toRecommendationView(row, readAt);
    if (view.kind !== "recommendation") throw new Error("expected a recommendation");
    expect(view.status).toEqual({ tone: "problem", label: "z 23 września — dotyczy innego dnia" });
    expect(view.isFromEarlierDay).toBe(true);
    expect(view.isStale).toBe(true);
  });

  it("reads as another day on the today summary, two minutes after it was written", () => {
    const row: PeriodSummaryRow = {
      kind: "today",
      period: "2026-09-23",
      facts: {},
      narration_text: "Synthetic summary.",
      narration_generated_at: written,
      narration_provider: "openrouter",
      narration_model: "synthetic-model",
      built_at: written,
    };
    const view = toTodaySummaryView(row, readAt);
    if (view.kind !== "narrated") throw new Error("expected a narrated summary");
    expect(view.status).toEqual({ tone: "problem", label: "z 23 września — dotyczy innego dnia" });
    expect(view.isStale).toBe(true);
  });
});

describe("the historical recommendation", () => {
  it.each([0, 2 * HOUR_MS + 1, 3 * 24 * HOUR_MS, -(5 * MINUTE_MS + 1)])(
    "never reports stale, current or future-dated for a text %i ms old (negative: in the future)",
    (ageMs) => {
      const row: RecommendationRow = {
        generated_at: timeAt(ageMs),
        language: "pl",
        text: "Synthetic advice.",
        provider: "ollama",
        model: "synthetic-model",
        forecast: {},
        facts: {},
      };
      const view = toRecommendationView(row, NOW, { historical: true });
      if (view.kind !== "recommendation") throw new Error("expected a recommendation");
      expect([view.isStale, view.isCurrent, view.isFutureDated, view.status.tone]).toEqual([
        false,
        false,
        false,
        "insufficient",
      ]);
    },
  );
});

describe("the future skew", () => {
  it("is 5 minutes on the recommendation and on the bill forecast alike", () => {
    // 5 * 60 * 1000 ms, written as a number so a change in either constant is seen here.
    expect(FORECAST_FUTURE_SKEW_MS).toBe(300000);
    expect(FUTURE_SKEW_MS).toBe(300000);
  });
});
