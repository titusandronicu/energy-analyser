import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { RecommendationRow } from "@/types";
import {
  FINDING_SEVERITY_CHIP,
  FINDING_TEXT_MAX_CHARS,
  FINDINGS_VISIBLE_MAX,
  FORECAST_HISTORY_START,
  ageStatus,
  earlierDayStatus,
  isStaleRecommendation,
  loadLatestRecommendation,
  toRecommendationView,
} from "./recommendation";

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

  it("is not stale exactly 5 minutes ahead of the clock and stale one millisecond beyond", () => {
    const clock = at("2026-09-23T10:00:00Z");
    expect(isStaleRecommendation(at("2026-09-23T10:05:00Z"), clock)).toBe(false);
    expect(isStaleRecommendation(at("2026-09-23T10:05:00.001Z"), clock)).toBe(true);
  });
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("ageStatus", () => {
  it.each([
    [0, { tone: "good", label: "aktualna" }],
    [2 * HOUR, { tone: "good", label: "aktualna" }],
    [2 * HOUR + 1, { tone: "watch", label: "sprzed 2 godz." }],
    [-5 * MINUTE, { tone: "good", label: "aktualna" }],
    [-(5 * MINUTE + 1), { tone: "problem", label: "czas z przyszłości" }],
    [-3 * HOUR, { tone: "problem", label: "czas z przyszłości" }],
  ])("rates an age of %i ms as %j", (ageMs, status) => {
    expect(ageStatus(ageMs)).toEqual(status);
  });
});

describe("earlierDayStatus", () => {
  it("is a problem naming the day the text was written for", () => {
    expect(earlierDayStatus("2026-09-22")).toEqual({
      tone: "problem",
      label: "z 22 września — dotyczy innego dnia",
    });
    expect(earlierDayStatus("2026-12-31")).toEqual({
      tone: "problem",
      label: "z 31 grudnia — dotyczy innego dnia",
    });
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
      isCurrent: true,
      isFromEarlierDay: false,
      isFutureDated: false,
      forecast: {
        todayLabel: "18,6 kWh",
        tomorrowLabel: "9,2 kWh",
        todayDayLabel: "23 września",
        tomorrowDayLabel: "24 września",
        certainty: CERTAINTY,
      },
      modelLabel: "gemma3:4b (lokalny model)",
      findings: [
        {
          title: null,
          fact: "Forecast.Solar przewiduje 18.6 kWh.",
          meaning: null,
          suggestedCheck: null,
          severity: "unknown",
          tone: "insufficient",
          word: "Bez oceny",
        },
      ],
      moreFindings: [],
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

  it("marks only a good status as current, at its edges", () => {
    const isCurrent = (generated_at: string, clock: string) => {
      const view = toRecommendationView(row({ generated_at }), at(clock));
      return view.kind === "recommendation" && view.isCurrent;
    };
    expect(isCurrent("2026-09-23T09:00:00Z", "2026-09-23T11:00:00Z")).toBe(true);
    expect(isCurrent("2026-09-23T09:00:00Z", "2026-09-23T11:00:01Z")).toBe(false);
    expect(isCurrent("2026-09-22T21:30:00Z", "2026-09-22T22:30:00Z")).toBe(false);
  });

  describe("with a generation time ahead of the clock", () => {
    // `now` is 11:00 UTC: 11:05 is exactly 5 minutes ahead, 11:05:00.001 one millisecond beyond.
    const within = row({ generated_at: "2026-09-23T11:05:00Z" });
    const beyond = row({ generated_at: "2026-09-23T11:05:00.001Z" });
    const mixed = [
      { fact: "ok", severity: "ok" },
      { fact: "warn", severity: "warn" },
    ];

    function recommendationView(r: RecommendationRow) {
      const view = toRecommendationView(r, now);
      if (view.kind !== "recommendation") throw new Error("expected a recommendation");
      return view;
    }

    it("keeps exactly 5 minutes ahead current and not flagged", () => {
      const view = recommendationView(within);
      expect(view.status).toEqual({ tone: "good", label: "aktualna" });
      expect([view.isFutureDated, view.isStale, view.isCurrent]).toEqual([false, false, true]);
    });

    it("flags a time beyond 5 minutes as a clock error, not as an outage or an earlier day", () => {
      const view = recommendationView(beyond);
      expect(view.status).toEqual({ tone: "problem", label: "czas z przyszłości" });
      expect([view.isFutureDated, view.isStale, view.isCurrent, view.isFromEarlierDay]).toEqual([
        true,
        true,
        false,
        false,
      ]);
    });

    it("turns the findings neutral beyond the skew and keeps their tones within it", () => {
      const tones = (r: RecommendationRow) =>
        recommendationView({ ...r, facts: { local_findings: mixed } }).findings.map((f) => f.tone);
      expect(tones(within)).toEqual(["watch", "good"]);
      expect(tones(beyond)).toEqual(["insufficient", "insufficient"]);
    });

    it("is not flagged for a past time, however old", () => {
      expect(recommendationView(row({ generated_at: "2026-09-20T10:00:00Z" })).isFutureDated).toBe(false);
    });
  });
});

function withFindings(local_findings: unknown) {
  const view = toRecommendationView(row({ facts: { local_findings } }), at("2026-09-23T11:00:00Z"));
  if (view.kind !== "recommendation") throw new Error("expected a recommendation");
  return view;
}

describe("findings", () => {
  it("has the severity chips the owner decided, without a problem entry", () => {
    expect(FINDING_SEVERITY_CHIP).toEqual({
      warn: { tone: "watch", word: "Warto sprawdzić" },
      ok: { tone: "good", word: "Dobrze" },
      info: { tone: "insufficient", word: "Informacja" },
      unknown: { tone: "insufficient", word: "Bez oceny" },
    });
    expect(FINDING_TEXT_MAX_CHARS).toBe(500);
    expect(FINDINGS_VISIBLE_MAX).toBe(5);
  });

  it.each([
    ["warn", "warn", "watch", "Warto sprawdzić"],
    ["ok", "ok", "good", "Dobrze"],
    ["info", "info", "insufficient", "Informacja"],
    ["WARN ", "warn", "watch", "Warto sprawdzić"],
    [" Ok", "ok", "good", "Dobrze"],
    [undefined, "unknown", "insufficient", "Bez oceny"],
    [3, "unknown", "insufficient", "Bez oceny"],
    ["critical", "unknown", "insufficient", "Bez oceny"],
    ["", "unknown", "insufficient", "Bez oceny"],
  ])("reads severity %j as %s", (severity, expected, tone, word) => {
    const [finding] = withFindings([{ fact: "F", severity }]).findings;
    expect(finding).toMatchObject({ severity: expected, tone, word });
  });

  it.each([
    ["title only", { title: "T" }, { title: "T", fact: null }],
    ["fact only", { fact: "F" }, { title: null, fact: "F" }],
    ["both", { title: " T ", fact: " F " }, { title: "T", fact: "F" }],
    ["a blank title with a fact", { title: "  ", fact: "F" }, { title: null, fact: "F" }],
    ["a wrong-typed title with a fact", { title: 3, fact: "F" }, { title: null, fact: "F" }],
  ])("keeps a finding with %s", (_name, record, expected) => {
    expect(withFindings([record]).findings).toMatchObject([expected]);
  });

  it.each([
    ["both blank", { title: " ", fact: "" }],
    ["both wrong types", { title: 1, fact: true }],
    ["neither", { severity: "warn", meaning: "M" }],
    ["not a record", null],
  ])("drops a finding with %s", (_name, record) => {
    expect(withFindings([record]).findings).toEqual([]);
  });

  it.each([
    ["missing", {}, null],
    ["a number", { meaning: 5, suggested_check: 5 }, null],
    ["a boolean", { meaning: true, suggested_check: false }, null],
    ["blank", { meaning: "  ", suggested_check: "" }, null],
    ["present", { meaning: " M ", suggested_check: " S " }, "text"],
  ])("reads meaning and suggested_check when %s", (_name, extra, kind) => {
    const [finding] = withFindings([{ fact: "F", ...extra }]).findings;
    expect(finding.meaning).toBe(kind === null ? null : "M");
    expect(finding.suggestedCheck).toBe(kind === null ? null : "S");
  });

  describe("text length", () => {
    const max = FINDING_TEXT_MAX_CHARS;
    it.each(["title", "fact", "meaning", "suggested_check"])("cuts %s only past the limit", (key) => {
      const field = key === "suggested_check" ? "suggestedCheck" : (key as "title" | "fact" | "meaning");
      const base = key === "title" || key === "fact" ? {} : { fact: "F" };
      const read = (value: string) => withFindings([{ ...base, [key]: value }]).findings[0][field];
      expect(read("a".repeat(max))).toBe("a".repeat(max));
      const cut = read("a".repeat(max + 1));
      expect(cut).toBe(`${"a".repeat(max - 1)}…`);
      expect(cut).toHaveLength(max);
      // Over the limit only before trimming: kept whole.
      expect(read(`  ${"a".repeat(max)}  `)).toBe("a".repeat(max));
    });

    it("does not leave half an emoji before the ellipsis", () => {
      // "😀" is two UTF-16 units; placed so the cut would fall between them.
      const value = `${"a".repeat(max - 2)}😀😀`;
      const cut = withFindings([{ fact: value }]).findings[0].fact;
      expect(cut).toBe(`${"a".repeat(max - 2)}…`);
    });
  });

  describe("stale cards", () => {
    const mixed = [
      { fact: "ok", severity: "ok" },
      { fact: "warn", severity: "warn" },
      { fact: "info", severity: "info" },
    ];

    it.each([
      ["a watch (older than 2 hours)", "2026-09-23T06:00:00Z"],
      ["a problem (earlier day)", "2026-09-20T10:00:00Z"],
    ])("makes chips neutral but keeps words and real severity on %s", (_name, generated_at) => {
      const view = toRecommendationView(
        row({ generated_at, facts: { local_findings: mixed } }),
        at("2026-09-23T11:00:00Z"),
      );
      if (view.kind !== "recommendation") throw new Error("expected a recommendation");
      expect(view.findings.map((f) => [f.fact, f.severity, f.tone, f.word])).toEqual([
        ["warn", "warn", "insufficient", "Warto sprawdzić"],
        ["info", "info", "insufficient", "Informacja"],
        ["ok", "ok", "insufficient", "Dobrze"],
      ]);
    });

    it("keeps watch and good tones on a current recommendation", () => {
      expect(withFindings(mixed).findings.map((f) => f.tone)).toEqual(["watch", "insufficient", "good"]);
    });
  });

  describe("historical view", () => {
    const mixed = [
      { fact: "ok", severity: "ok" },
      { fact: "warn", severity: "warn" },
    ];
    // Generated 14:00 Warsaw on 27 September, read three days later.
    const past = row({ generated_at: "2026-09-27T12:00:00Z", facts: { local_findings: mixed } });
    const later = at("2026-09-30T10:00:00Z");

    it("gives a neutral status naming the generation time, never stale or current", () => {
      const view = toRecommendationView(past, later, { historical: true });
      if (view.kind !== "recommendation") throw new Error("expected a recommendation");
      expect(view.status).toEqual({ tone: "insufficient", label: "z 27 września, 14:00" });
      expect(view.isStale).toBe(false);
      expect(view.isCurrent).toBe(false);
    });

    it("keeps the findings' real tones", () => {
      const view = toRecommendationView(past, later, { historical: true });
      if (view.kind !== "recommendation") throw new Error("expected a recommendation");
      expect(view.findings.map((f) => [f.fact, f.tone])).toEqual([
        ["warn", "watch"],
        ["ok", "good"],
      ]);
    });

    it("keeps the forecast relabelling for an earlier day", () => {
      const view = toRecommendationView(past, later, { historical: true });
      if (view.kind !== "recommendation") throw new Error("expected a recommendation");
      expect(view.isFromEarlierDay).toBe(true);
      expect(view.forecast).toMatchObject({ todayDayLabel: "27 września", tomorrowDayLabel: "28 września" });
    });

    it("is not current even for advice generated minutes ago", () => {
      const view = toRecommendationView(row(), at("2026-09-23T10:05:00Z"), { historical: true });
      expect(view.kind === "recommendation" && [view.isStale, view.isCurrent, view.status.tone]).toEqual([
        false,
        false,
        "insufficient",
      ]);
    });

    it("leaves the default view unchanged", () => {
      expect(toRecommendationView(past, later, {})).toEqual(toRecommendationView(past, later));
      const view = toRecommendationView(past, later);
      if (view.kind !== "recommendation") throw new Error("expected a recommendation");
      expect(view.status).toEqual({ tone: "problem", label: "z 27 września — dotyczy innego dnia" });
      expect(view.isStale).toBe(true);
      expect(view.findings.map((f) => f.tone)).toEqual(["insufficient", "insufficient"]);
    });
  });

  it("orders warn, then info and unknown in lab order, then ok", () => {
    const view = withFindings([
      { fact: "ok1", severity: "ok" },
      { fact: "unknown1", severity: "???" },
      { fact: "warn1", severity: "warn" },
      { fact: "info1", severity: "info" },
      { fact: "warn2", severity: "warn" },
      { fact: "ok2", severity: "ok" },
      { fact: "unknown2" },
    ]);
    expect([...view.findings, ...view.moreFindings].map((f) => f.fact)).toEqual([
      "warn1",
      "warn2",
      "unknown1",
      "info1",
      "unknown2",
      "ok1",
      "ok2",
    ]);
  });

  it.each([
    [1, 1, 0],
    [FINDINGS_VISIBLE_MAX, FINDINGS_VISIBLE_MAX, 0],
    [FINDINGS_VISIBLE_MAX + 1, FINDINGS_VISIBLE_MAX, 1],
    [50, FINDINGS_VISIBLE_MAX, 50 - FINDINGS_VISIBLE_MAX],
  ])("splits %i findings into %i visible and %i more", (count, visible, more) => {
    const view = withFindings(Array.from({ length: count }, (_, i) => ({ fact: `f${String(i)}`, severity: "info" })));
    expect(view.findings).toHaveLength(visible);
    expect(view.moreFindings).toHaveLength(more);
    expect([...view.findings, ...view.moreFindings].map((f) => f.fact)).toEqual(
      Array.from({ length: count }, (_, i) => `f${String(i)}`),
    );
  });

  it("splits after ranking, so a late warning is visible", () => {
    const view = withFindings([
      ...Array.from({ length: 6 }, (_, i) => ({ fact: `ok${String(i)}`, severity: "ok" })),
      { fact: "late warning", severity: "warn" },
    ]);
    expect(view.findings[0].fact).toBe("late warning");
    expect(view.moreFindings).toHaveLength(2);
  });
});

describe("provider labels", () => {
  it.each([
    ["ollama", "lokalny model"],
    ["openrouter", "OpenRouter"],
    ["ha_conversation", "Home Assistant"],
  ])("names the %s provider next to the model (%s)", (provider, label) => {
    const v = toRecommendationView(row({ provider, model: "m1" }), at("2026-09-23T10:30:00Z"));
    if (v.kind !== "recommendation") throw new Error("expected a recommendation view");
    expect(v.modelLabel).toBe(`m1 (${label})`);
  });
});

describe("cutting a long finding next to a surrogate", () => {
  const max = FINDING_TEXT_MAX_CHARS;
  const factOf = (text: string) => {
    const v = toRecommendationView(row({ facts: { local_findings: [{ fact: text }] } }), at("2026-09-23T10:30:00Z"));
    if (v.kind !== "recommendation") throw new Error("expected a recommendation view");
    return v.findings[0].fact;
  };

  it("keeps a last character above the surrogate range", () => {
    // U+FF21 (fullwidth A) is above the high-surrogate range: nothing to drop before the ellipsis.
    expect(factOf("\uFF21".repeat(max + 100))).toBe(`${"\uFF21".repeat(max - 1)}…`);
  });

  it.each([
    ["the first high surrogate", "\ud800"],
    ["the last high surrogate", "\udbff"],
  ])("drops %s left at the cut", (_name, lone) => {
    // The unit at index max - 2 ends the cut; a lone high surrogate there must not be left before the ellipsis.
    expect(factOf(`${"a".repeat(max - 2)}${lone}${"b".repeat(20)}`)).toBe(`${"a".repeat(max - 2)}…`);
  });
});

describe("loadLatestRecommendation", () => {
  // Records the arguments of the query chain and resolves with the given result.
  function mockClient(result: { data: RecommendationRow[] | null; error: { message: string } | null }) {
    const calls: Record<string, unknown[]> = {};
    const chain = {
      from: (...args: unknown[]) => ((calls.from = args), chain),
      select: (...args: unknown[]) => ((calls.select = args), chain),
      order: (...args: unknown[]) => ((calls.order = args), chain),
      limit: (...args: unknown[]) => ((calls.limit = args), chain),
      overrideTypes: () => Promise.resolve(result),
    };
    return { client: chain as unknown as SupabaseClient, calls };
  }

  it("reads the newest recommendation", async () => {
    const newest = row();
    const { client, calls } = mockClient({ data: [newest], error: null });
    await expect(loadLatestRecommendation(client)).resolves.toBe(newest);
    expect(calls.from).toEqual(["recommendations"]);
    expect(calls.select).toEqual(["generated_at, language, text, provider, model, forecast, facts"]);
    expect(calls.order).toEqual(["generated_at", { ascending: false }]);
    expect(calls.limit).toEqual([1]);
  });

  it("returns null when there is none", async () => {
    const { client } = mockClient({ data: [], error: null });
    await expect(loadLatestRecommendation(client)).resolves.toBeNull();
  });

  it("throws on a load error", async () => {
    const { client } = mockClient({ data: null, error: { message: "permission denied" } });
    await expect(loadLatestRecommendation(client)).rejects.toThrow("loading recommendation failed: permission denied");
  });
});
