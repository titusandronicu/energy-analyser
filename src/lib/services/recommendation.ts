import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationRow } from "@/types";
import type { Status } from "@/lib/format/status";
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

export type RecommendationView =
  | { kind: "empty"; status: Status }
  | {
      kind: "recommendation";
      status: Status;
      text: string;
      generatedAtLabel: string;
      isStale: boolean;
      forecast: {
        todayLabel: string;
        tomorrowLabel: string;
        todayDayLabel: string;
        tomorrowDayLabel: string;
        certainty: Status;
      };
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

// Stale when generated before the start of today in Europe/Warsaw, or more than two hours ago.
export function isStaleRecommendation(generatedAt: Date, now: Date): boolean {
  if (now.getTime() - generatedAt.getTime() > STALE_AFTER_MS) return true;
  return warsawParts(generatedAt).dayKey < warsawParts(now).dayKey;
}

// Good when from today within two hours, worth watching when from today but older, a problem when from an
// earlier Warsaw day (the advice was about another day).
function recommendationStatus(generatedAt: Date, now: Date): Status {
  const generatedDay = warsawParts(generatedAt).dayKey;
  if (generatedDay < warsawParts(now).dayKey) {
    return { tone: "problem", label: `z ${formatDayMonth(generatedDay)} — dotyczy innego dnia` };
  }
  const ageMs = now.getTime() - generatedAt.getTime();
  if (ageMs > STALE_AFTER_MS) return { tone: "watch", label: `sprzed ${formatAge(ageMs)}` };
  return { tone: "good", label: "aktualna" };
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
  if (!row) return { kind: "empty", status: { tone: "insufficient", label: "laboratorium jeszcze nic nie przesłało" } };

  const generatedAt = new Date(row.generated_at);
  const forecast = asRecord(row.forecast);
  // The lab's "today" and "tomorrow" are relative to when it generated the advice, not to when it is read.
  const forecastDay = warsawParts(generatedAt).dayKey;
  const provider = PROVIDER_LABELS[row.provider];

  return {
    kind: "recommendation",
    status: recommendationStatus(generatedAt, now),
    text: row.text.trim(),
    generatedAtLabel: formatWarsawDateTime(generatedAt),
    isStale: isStaleRecommendation(generatedAt, now),
    forecast: {
      todayLabel: kwhLabel(forecast.today_kwh),
      tomorrowLabel: kwhLabel(forecast.tomorrow_kwh),
      todayDayLabel: formatDayMonth(forecastDay),
      tomorrowDayLabel: formatDayMonth(addDays(forecastDay, 1)),
      certainty: { ...FORECAST_CERTAINTY },
    },
    modelLabel: provider ? `${row.model} (${provider})` : row.model,
    findings: findingsFrom(row.facts),
  };
}
