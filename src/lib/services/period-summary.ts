import type { SupabaseClient } from "@supabase/supabase-js";
import type { PeriodSummaryRow } from "@/types";
import { periodLabel } from "@/lib/calendar/period";
import type { Status } from "@/lib/format/status";
import { formatDayMonth, formatMonth, formatWarsawDateTime, warsawParts } from "@/lib/format/warsaw-time";
import { formatAge } from "@/lib/services/live-state";
import { isStaleRecommendation } from "@/lib/services/recommendation";

// The lab's plain-language texts for today, a completed day and a completed month (S-18). Each loader reads only the
// signed-in owner's rows; RLS returns nothing for non-owners. Errors are thrown so the page can show a load failure
// instead of pretending nothing was written.

// The eight columns the owner may read: `push_id` is not granted, so `select *` would fail. `facts` is the data the
// text was written from; it is loaded with the row but no view reads or exposes it.
const SUMMARY_COLUMNS =
  "kind, period, facts, narration_text, narration_generated_at, narration_provider, narration_model, built_at";

// Today's text for the dashboard: the `today` row with the newest period (one row exists per Warsaw day), or null.
export async function loadTodaySummary(client: SupabaseClient): Promise<PeriodSummaryRow | null> {
  const { data, error } = await client
    .from("period_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("kind", "today")
    .order("period", { ascending: false })
    .limit(1)
    .overrideTypes<PeriodSummaryRow[], { merge: false }>();
  if (error) throw new Error(`loading today's summary failed: ${error.message}`);
  return data[0] ?? null;
}

// The text of one completed day ("2026-09-27") or month ("2026-09"), or null when the lab wrote none. The primary key
// (kind, period) keeps it to at most one row.
export async function loadPeriodSummary(
  client: SupabaseClient,
  kind: "day" | "month",
  period: string,
): Promise<PeriodSummaryRow | null> {
  const { data, error } = await client
    .from("period_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("kind", kind)
    .eq("period", period)
    .maybeSingle()
    .overrideTypes<PeriodSummaryRow | null, { merge: false }>();
  if (error) throw new Error(`loading the ${kind} summary failed: ${error.message}`);
  return data;
}

// What the calendar shows for a completed day or month: the text with when it was written and the period it covers,
// or `pending` when the lab has the period's facts but no text yet (no figures are shown for it).
export type SummaryView =
  | { kind: "narrated"; text: string; generatedAtLabel: string; periodLabel: string }
  | { kind: "pending"; periodLabel: string };

// What the dashboard shows for today: `empty` when nothing usable was pushed. A narrated text carries its status and
// whether it is stale (older than two hours, or about an earlier day).
export type TodaySummaryView =
  | { kind: "empty" }
  | { kind: "pending"; periodLabel: string }
  | {
      kind: "narrated";
      text: string;
      generatedAtLabel: string;
      periodLabel: string;
      status: Status;
      isStale: boolean;
    };

// The trimmed text, or null when the row has none (null or blank): the lab's text is untrusted and shown as given.
function narrationText(row: PeriodSummaryRow): string | null {
  const text = row.narration_text?.trim() ?? "";
  return text === "" ? null : text;
}

// When the text was written; a row without that time falls back to when its entry was built.
function generatedAtLabel(row: PeriodSummaryRow): string {
  return formatWarsawDateTime(new Date(row.narration_generated_at ?? row.built_at));
}

// "27 września 2026, niedziela" for a day row, "wrzesień 2026" for a month row.
function coveredLabel(period: string, kind: "day" | "month"): string {
  return kind === "day" ? periodLabel({ kind: "day", day: period }) : formatMonth(period);
}

// `kind` is the calendar view the row is shown on; the caller has already chosen a completed day or month.
export function toSummaryView(row: PeriodSummaryRow, kind: "day" | "month"): SummaryView {
  const label = coveredLabel(row.period, kind);
  const text = narrationText(row);
  if (text === null) return { kind: "pending", periodLabel: label };
  return { kind: "narrated", text, generatedAtLabel: generatedAtLabel(row), periodLabel: label };
}

// Same wording as the recommendation card: good when built within two hours, worth watching when older, a problem
// when the text is about an earlier Warsaw day.
function todayStatus(row: PeriodSummaryRow, now: Date, isFromEarlierDay: boolean, isStale: boolean): Status {
  if (isFromEarlierDay) return { tone: "problem", label: `z ${formatDayMonth(row.period)} — dotyczy innego dnia` };
  if (isStale) return { tone: "watch", label: `sprzed ${formatAge(now.getTime() - Date.parse(row.built_at))}` };
  return { tone: "good", label: "aktualna" };
}

// A row from an earlier day without a text is `empty`: it would otherwise say a finished day's text has not appeared
// yet. A row from an earlier day with a text is shown, marked as about another day; a row from today without one is
// `pending`. Staleness uses the recommendation's rule, measured from `built_at` (how fresh the figures are).
export function toTodaySummaryView(row: PeriodSummaryRow | null, now: Date): TodaySummaryView {
  if (row === null) return { kind: "empty" };

  const isFromEarlierDay = row.period < warsawParts(now).dayKey;
  const text = narrationText(row);
  if (text === null) {
    return isFromEarlierDay ? { kind: "empty" } : { kind: "pending", periodLabel: coveredLabel(row.period, "day") };
  }

  const builtAt = new Date(row.built_at);
  const isStale = isFromEarlierDay || isStaleRecommendation(builtAt, now);
  return {
    kind: "narrated",
    text,
    generatedAtLabel: generatedAtLabel(row),
    periodLabel: coveredLabel(row.period, "day"),
    status: todayStatus(row, now, isFromEarlierDay, isStale),
    isStale,
  };
}
