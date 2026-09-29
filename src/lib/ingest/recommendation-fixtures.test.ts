import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RecommendationRow } from "@/types";
import { parseAdviceMarkdown, splitAdviceLead } from "@/lib/format/advice-markdown";
import { toRecommendationView, type RecommendationView } from "@/lib/services/recommendation";
import { ingestPayloadV1 } from "./contract";

// The recommendation states pushed by scripts/push-fixture.mjs --file (scripts/fixtures/recommendation/). They are
// parsed with the strict contract and mapped at a fixed clock, so the states each fixture promises (status tone,
// chip tones, lead and remainder of the advice) cannot drift silently.
const fixturesDir = fileURLToPath(new URL("../../../scripts/fixtures/recommendation/", import.meta.url));
const files = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

// Warsaw is UTC+2 in September. The clock is the moment each fixture is read at.
const NOW_CURRENT = new Date("2026-09-29T09:00:00+02:00");
const NOW_STALE = new Date("2026-09-29T10:00:00+02:00");
const NOW_BY_FILE: Record<string, Date> = {
  "current.json": NOW_CURRENT,
  "older-than-2h.json": NOW_STALE,
  "earlier-day.json": NOW_CURRENT,
  "no-findings.json": NOW_CURRENT,
  "one-block.json": NOW_CURRENT,
  "colon-list.json": NOW_CURRENT,
  "odd-findings.json": NOW_CURRENT,
};

function rowOf(file: string): RecommendationRow {
  const payload = ingestPayloadV1.parse(JSON.parse(readFileSync(`${fixturesDir}${file}`, "utf8")));
  if (!payload.recommendation) throw new Error(`${file} has no recommendation`);
  const { generated_at, language, text, provider, model, forecast, facts } = payload.recommendation;
  return { generated_at, language, text, provider, model, forecast, facts };
}

function viewOf(file: string) {
  const view: RecommendationView = toRecommendationView(rowOf(file), NOW_BY_FILE[file]);
  if (view.kind !== "recommendation") throw new Error("expected a recommendation view");
  return view;
}

function splitOf(file: string) {
  return splitAdviceLead(parseAdviceMarkdown(viewOf(file).text));
}

describe("recommendation fixtures", () => {
  it("has the seven documented states", () => {
    expect(files).toEqual([
      "colon-list.json",
      "current.json",
      "earlier-day.json",
      "no-findings.json",
      "odd-findings.json",
      "older-than-2h.json",
      "one-block.json",
    ]);
    expect(Object.keys(NOW_BY_FILE).sort()).toEqual(files);
  });

  it.each(files)("%s parses with the strict contract and carries a recommendation", (file) => {
    expect(rowOf(file).text.length).toBeGreaterThan(0);
  });

  it("maps current to a current card with three findings, ordered warn, info, ok", () => {
    const view = viewOf("current.json");
    expect(view.status.tone).toBe("good");
    expect(view.isCurrent).toBe(true);
    expect(view.isFromEarlierDay).toBe(false);
    expect(view.findings.map((finding) => finding.severity)).toEqual(["warn", "info", "ok"]);
    expect(view.findings.map((finding) => finding.tone)).toEqual(["watch", "insufficient", "good"]);
    expect(view.moreFindings).toEqual([]);
    expect(view.findings.every((finding) => finding.meaning !== null && finding.suggestedCheck !== null)).toBe(true);
  });

  it("splits current into a heading and paragraph lead with three blocks behind the disclosure", () => {
    const { lead, rest } = splitOf("current.json");
    expect(lead).toHaveLength(2);
    expect(rest).toHaveLength(3);
  });

  it("maps older-than-2h to a watch card with neutral chips that keep their words", () => {
    const view = viewOf("older-than-2h.json");
    expect(view.status.tone).toBe("watch");
    expect(view.isCurrent).toBe(false);
    expect(view.isStale).toBe(true);
    expect(view.findings.map((finding) => finding.tone)).toEqual(["insufficient", "insufficient", "insufficient"]);
    expect(view.findings.map((finding) => finding.word)).toEqual(["Warto sprawdzić", "Informacja", "Dobrze"]);
  });

  it("maps earlier-day to a problem card from another day with neutral chips that keep their words", () => {
    const view = viewOf("earlier-day.json");
    expect(view.status.tone).toBe("problem");
    expect(view.isCurrent).toBe(false);
    expect(view.isFromEarlierDay).toBe(true);
    expect(view.findings.map((finding) => finding.tone)).toEqual(["insufficient", "insufficient", "insufficient"]);
    expect(view.findings.map((finding) => finding.word)).toEqual(["Warto sprawdzić", "Informacja", "Dobrze"]);
  });

  it("maps no-findings to a current card with no findings", () => {
    const view = viewOf("no-findings.json");
    expect(view.isCurrent).toBe(true);
    expect(view.findings).toEqual([]);
    expect(view.moreFindings).toEqual([]);
  });

  it("shows the whole one-block advice and leaves nothing behind the disclosure", () => {
    const { lead, rest } = splitOf("one-block.json");
    expect(lead).toHaveLength(1);
    expect(rest).toEqual([]);
  });

  it("keeps the colon intro line and its list in the lead of colon-list", () => {
    const { lead, rest } = splitOf("colon-list.json");
    expect(lead.map((block) => block.type)).toEqual(["paragraph", "list"]);
    expect(rest).toHaveLength(2);
  });

  it("keeps only the valid findings of odd-findings, five visible and two behind the disclosure", () => {
    const view = viewOf("odd-findings.json");
    expect(view.isCurrent).toBe(true);
    expect([...view.findings, ...view.moreFindings].map((finding) => finding.severity)).toEqual([
      "warn",
      "warn",
      "info",
      "unknown",
      "info",
      "ok",
      "ok",
    ]);
    expect(view.findings).toHaveLength(5);
    expect(view.moreFindings).toHaveLength(2);
    // Wrong-typed title, meaning and suggested check count as missing; the fact is kept.
    const wrongTyped = view.moreFindings[0];
    expect(wrongTyped.title).toBeNull();
    expect(wrongTyped.meaning).toBeNull();
    expect(wrongTyped.suggestedCheck).toBeNull();
    expect(wrongTyped.fact).not.toBeNull();
    // The 500-character fact is kept whole, and its "WARN " severity is read case-insensitively after trim.
    expect(view.findings[1].fact).toHaveLength(500);
    expect(view.findings[1].word).toBe("Warto sprawdzić");
    expect(view.findings[3].word).toBe("Bez oceny");
  });
});
