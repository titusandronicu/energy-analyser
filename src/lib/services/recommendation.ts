import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationRow } from "@/types";

// The lab narrates roughly hourly; two missed runs make the advice stale.
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const TIME_ZONE = "Europe/Warsaw";
const MISSING = "—";

const CONFIDENCE_LABELS: Record<string, string> = { low: "niska", medium: "średnia", high: "wysoka" };
const PROVIDER_LABELS: Record<string, string> = {
  ollama: "lokalny model",
  openrouter: "OpenRouter",
  ha_conversation: "Home Assistant",
};

export type RecommendationView =
  | { kind: "empty" }
  | {
      kind: "recommendation";
      text: string;
      generatedAtLabel: string;
      isStale: boolean;
      forecast: { todayLabel: string; tomorrowLabel: string; confidenceLabel: string };
      modelLabel: string;
      findings: string[];
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

function warsawParts(date: Date) {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const monthNumber = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, month: "2-digit" }).format(date);
  return {
    dayKey: `${get("year")}-${monthNumber}-${get("day").padStart(2, "0")}`,
    label: `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")}`,
  };
}

// Stale when generated before the start of today in Europe/Warsaw, or more than two hours ago.
export function isStaleRecommendation(generatedAt: Date, now: Date): boolean {
  if (now.getTime() - generatedAt.getTime() > STALE_AFTER_MS) return true;
  return warsawParts(generatedAt).dayKey < warsawParts(now).dayKey;
}

const kwhFormat = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function kwhLabel(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? `${kwhFormat.format(value)} kWh` : MISSING;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function findingsFrom(facts: unknown): string[] {
  const findings = asRecord(facts).local_findings;
  if (!Array.isArray(findings)) return [];
  return findings
    .map((finding) => asRecord(finding).fact)
    .filter((fact): fact is string => typeof fact === "string" && fact.trim() !== "")
    .map((fact) => fact.trim());
}

export function toRecommendationView(row: RecommendationRow | null, now: Date): RecommendationView {
  if (!row) return { kind: "empty" };

  const generatedAt = new Date(row.generated_at);
  const forecast = asRecord(row.forecast);
  const confidence = typeof forecast.confidence === "string" ? CONFIDENCE_LABELS[forecast.confidence] : undefined;
  const provider = PROVIDER_LABELS[row.provider];

  return {
    kind: "recommendation",
    text: row.text.trim(),
    generatedAtLabel: warsawParts(generatedAt).label,
    isStale: isStaleRecommendation(generatedAt, now),
    forecast: {
      todayLabel: kwhLabel(forecast.today_kwh),
      tomorrowLabel: kwhLabel(forecast.tomorrow_kwh),
      confidenceLabel: confidence ?? "nieznana",
    },
    modelLabel: provider ? `${row.model} (${provider})` : row.model,
    findings: findingsFrom(row.facts),
  };
}
