import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationRow } from "@/types";
import type { Status, StatusTone } from "@/lib/format/status";
import { asRecord, kwhLabel } from "@/lib/format/values";
import { addDays, formatDayMonth, formatWarsawDateTime, warsawParts } from "@/lib/format/warsaw-time";
import { formatAge } from "@/lib/services/live-state";

// The lab narrates roughly hourly; two missed runs make the advice stale.
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
// The app stores forecasts from this Warsaw day on; certainty can only be computed from that history (S-11).
export const FORECAST_HISTORY_START = "2026-09-27";

// Until S-11 measures forecast accuracy the certainty is not known, whatever the lab's optional `confidence` says:
// it never states its basis.
const FORECAST_CERTAINTY: Status = {
  tone: "insufficient",
  label: `jeszcze nie wiadomo — prognozy zbierane od ${formatDayMonth(FORECAST_HISTORY_START)}`,
};
const PROVIDER_LABELS: Record<string, string> = {
  ollama: "lokalny model",
  openrouter: "OpenRouter",
  ha_conversation: "Home Assistant",
};

// Lab findings are free-form records; the mapper names the keys it reads (`title`, `fact`, `meaning`,
// `suggested_check`, `severity`) and guards each one, because pushed jsonb is untrusted.
export type FindingSeverity = "warn" | "ok" | "info" | "unknown";

// The chip a finding shows for its severity: colour tone plus its own word, so a green "Dobrze" never reads as the
// card's own "aktualna" badge. The lab has no "problem" level, so there is no problem entry.
export const FINDING_SEVERITY_CHIP: Record<FindingSeverity, { tone: StatusTone; word: string }> = {
  warn: { tone: "watch", word: "Warto sprawdzić" },
  ok: { tone: "good", word: "Dobrze" },
  info: { tone: "insufficient", word: "Informacja" },
  unknown: { tone: "insufficient", word: "Bez oceny" },
};
// Longest text kept for a finding field (the ingest contract already caps scalar strings at 500, so a valid row
// never reaches the cut); longer text is cut to one character less plus an ellipsis, never over this length.
export const FINDING_TEXT_MAX_CHARS = 500;
// Findings shown in the card itself; the rest go behind the disclosure.
export const FINDINGS_VISIBLE_MAX = 5;

// Lower sorts first: warnings, then information and unrated (equal rank, lab order kept), then ok.
const SEVERITY_RANK: Record<FindingSeverity, number> = { warn: 0, info: 1, unknown: 1, ok: 2 };

export interface RecommendationFinding {
  // At least one of title and fact is non-null.
  title: string | null;
  fact: string | null;
  meaning: string | null;
  suggestedCheck: string | null;
  severity: FindingSeverity;
  tone: StatusTone;
  word: string;
}

export type RecommendationView =
  | { kind: "empty"; status: Status }
  | {
      kind: "recommendation";
      status: Status;
      text: string;
      generatedAtLabel: string;
      isStale: boolean;
      // True exactly when the status is good (today, within two hours): the only state that may animate.
      isCurrent: boolean;
      // Generated before today in Warsaw: its "today" and "tomorrow" are other days than the reader's.
      isFromEarlierDay: boolean;
      forecast: {
        todayLabel: string;
        tomorrowLabel: string;
        todayDayLabel: string;
        tomorrowDayLabel: string;
        certainty: Status;
      };
      modelLabel: string;
      findings: RecommendationFinding[];
      // Findings beyond FINDINGS_VISIBLE_MAX, in the same order.
      moreFindings: RecommendationFinding[];
    };

// Newest recommendation by generated_at; RLS returns nothing for non-owners. Errors are thrown so the page
// can show a load failure instead of pretending there is no advice.
export async function loadLatestRecommendation(client: SupabaseClient): Promise<RecommendationRow | null> {
  const { data, error } = await client
    .from("recommendations")
    .select("generated_at, language, text, provider, model, forecast, facts")
    .order("generated_at", { ascending: false })
    .limit(1)
    .overrideTypes<RecommendationRow[], { merge: false }>();
  if (error) throw new Error(`loading recommendation failed: ${error.message}`);
  return data[0] ?? null;
}

function isFromEarlierDay(generatedAt: Date, now: Date): boolean {
  return warsawParts(generatedAt).dayKey < warsawParts(now).dayKey;
}

// Stale when generated before the start of today in Europe/Warsaw, or more than two hours ago.
export function isStaleRecommendation(generatedAt: Date, now: Date): boolean {
  if (now.getTime() - generatedAt.getTime() > STALE_AFTER_MS) return true;
  return isFromEarlierDay(generatedAt, now);
}

// Good when from today within two hours, worth watching when from today but older, a problem when from an
// earlier Warsaw day (the advice was about another day).
function recommendationStatus(generatedAt: Date, now: Date): Status {
  const generatedDay = warsawParts(generatedAt).dayKey;
  if (isFromEarlierDay(generatedAt, now)) {
    return { tone: "problem", label: `z ${formatDayMonth(generatedDay)} — dotyczy innego dnia` };
  }
  const ageMs = now.getTime() - generatedAt.getTime();
  if (ageMs > STALE_AFTER_MS) return { tone: "watch", label: `sprzed ${formatAge(ageMs)}` };
  return { tone: "good", label: "aktualna" };
}

// Trimmed text, or null for a blank or non-string value; over FINDING_TEXT_MAX_CHARS it is cut and ends in "…".
function findingText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "") return null;
  if (text.length <= FINDING_TEXT_MAX_CHARS) return text;
  const cut = text.slice(0, FINDING_TEXT_MAX_CHARS - 1);
  // Never leave half of a surrogate pair (an emoji) in front of the ellipsis.
  const lastUnit = cut.charCodeAt(cut.length - 1);
  return `${lastUnit >= 0xd800 && lastUnit <= 0xdbff ? cut.slice(0, -1) : cut}…`;
}

function findingSeverity(value: unknown): FindingSeverity {
  const word = typeof value === "string" ? value.trim().toLowerCase() : "";
  return word === "warn" || word === "ok" || word === "info" ? word : "unknown";
}

// A stale card never claims freshness through colour: every chip is neutral but keeps its severity word.
function findingsFrom(facts: unknown, isStale: boolean): RecommendationFinding[] {
  const findings = asRecord(facts).local_findings;
  if (!Array.isArray(findings)) return [];
  const mapped: RecommendationFinding[] = [];
  for (const raw of findings) {
    const record = asRecord(raw);
    const title = findingText(record.title);
    const fact = findingText(record.fact);
    if (title === null && fact === null) continue;
    const severity = findingSeverity(record.severity);
    const chip = FINDING_SEVERITY_CHIP[severity];
    mapped.push({
      title,
      fact,
      meaning: findingText(record.meaning),
      suggestedCheck: findingText(record.suggested_check),
      severity,
      tone: isStale ? "insufficient" : chip.tone,
      word: chip.word,
    });
  }
  // Array.prototype.sort is stable, so the lab's own order holds within a rank.
  return mapped.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function toRecommendationView(row: RecommendationRow | null, now: Date): RecommendationView {
  if (!row) return { kind: "empty", status: { tone: "insufficient", label: "laboratorium jeszcze nic nie przesłało" } };

  const generatedAt = new Date(row.generated_at);
  const forecast = asRecord(row.forecast);
  // The lab's "today" and "tomorrow" are relative to when it generated the advice, not to when it is read.
  const forecastDay = warsawParts(generatedAt).dayKey;
  const provider = PROVIDER_LABELS[row.provider];
  const status = recommendationStatus(generatedAt, now);
  const isStale = isStaleRecommendation(generatedAt, now);
  const findings = findingsFrom(row.facts, isStale);

  return {
    kind: "recommendation",
    status,
    text: row.text.trim(),
    generatedAtLabel: formatWarsawDateTime(generatedAt),
    isStale,
    isCurrent: !isStale,
    isFromEarlierDay: isFromEarlierDay(generatedAt, now),
    forecast: {
      todayLabel: kwhLabel(forecast.today_kwh),
      tomorrowLabel: kwhLabel(forecast.tomorrow_kwh),
      todayDayLabel: formatDayMonth(forecastDay),
      tomorrowDayLabel: formatDayMonth(addDays(forecastDay, 1)),
      certainty: { ...FORECAST_CERTAINTY },
    },
    modelLabel: provider ? `${row.model} (${provider})` : row.model,
    findings: findings.slice(0, FINDINGS_VISIBLE_MAX),
    moreFindings: findings.slice(FINDINGS_VISIBLE_MAX),
  };
}
