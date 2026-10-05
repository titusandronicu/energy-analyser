import type { SupabaseClient } from "@supabase/supabase-js";
import type { PeriodSummaryRow } from "@/types";
import { periodLabel } from "@/lib/calendar/period";
import { LOAD_FAILED, type Status } from "@/lib/format/status";
import { formatMonth, formatWarsawDateTime, warsawParts } from "@/lib/format/warsaw-time";
import { FUTURE_SKEW_MS, STALE_AFTER_MS, ageStatus, earlierDayStatus } from "@/lib/services/recommendation";
import { queryError } from "@/lib/query-error";

// The lab's plain-language texts for today, a completed day and a completed month (S-18). Each loader reads only the
// signed-in owner's rows; RLS returns nothing for non-owners. Errors are thrown so the page can show a load failure
// instead of pretending nothing was written.

// What the app reads of a stored text. `facts` (the untrusted jsonb the text was written from) is deliberately not
// part of it: nothing shows it, so it is not even loaded.
export type PeriodSummaryText = Omit<PeriodSummaryRow, "facts">;

// The columns the owner may read, less `facts`: `push_id` is not granted, so `select *` would fail.
const SUMMARY_COLUMNS =
  "kind, period, narration_text, narration_generated_at, narration_provider, narration_model, built_at";

// Today's text for the dashboard: the `today` row with the newest period up to `today` (one row exists per Warsaw day,
// and a row dated after today, from a skewed lab clock, must not read as current), or null.
export async function loadTodaySummary(client: SupabaseClient, today: string): Promise<PeriodSummaryText | null> {
  const { data, error } = await client
    .from("period_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("kind", "today")
    .lte("period", today)
    .order("period", { ascending: false })
    .limit(1)
    .overrideTypes<PeriodSummaryText[], { merge: false }>();
  if (error) throw queryError("loading today's summary failed", error);
  return data[0] ?? null;
}

// The text of one completed day ("2026-09-27") or month ("2026-09"), or null when the lab wrote none. The primary key
// (kind, period) keeps it to at most one row.
export async function loadPeriodSummary(
  client: SupabaseClient,
  kind: "day" | "month",
  period: string,
): Promise<PeriodSummaryText | null> {
  const { data, error } = await client
    .from("period_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("kind", kind)
    .eq("period", period)
    .maybeSingle()
    .overrideTypes<PeriodSummaryText | null, { merge: false }>();
  if (error) throw queryError(`loading the ${kind} summary failed`, error);
  return data;
}

// What the calendar shows for a completed day or month: the text with when it was written and the period it covers,
// or `pending` when the lab has the period's facts but no text yet (no figures are shown for it).
export type SummaryView =
  | { kind: "narrated"; text: string; generatedAtLabel: string; periodLabel: string }
  | { kind: "pending"; periodLabel: string };

// What the dashboard shows for today: `empty` when nothing usable was pushed. A narrated text carries its status and
// whether it is stale (older than two hours, more than five minutes ahead of the clock, or about an earlier day).
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
function narrationText(row: PeriodSummaryText): string | null {
  const text = row.narration_text?.trim() ?? "";
  return text === "" ? null : text;
}

// When the text was written; a row without that time falls back to when its entry was built, and a row with neither
// readable (the columns are timestamptz, so this is a safety net) has none.
function writtenAt(row: PeriodSummaryText): Date | null {
  for (const value of [row.narration_generated_at, row.built_at]) {
    if (value === null) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function generatedAtLabel(row: PeriodSummaryText): string {
  const at = writtenAt(row);
  return at === null ? "w nieznanym czasie" : formatWarsawDateTime(at);
}

// "27 września 2026, niedziela" for a day row, "wrzesień 2026" for a month row.
function coveredLabel(period: string, kind: "day" | "month"): string {
  return kind === "day" ? periodLabel({ kind: "day", day: period }) : formatMonth(period);
}

// `kind` is the calendar view the row is shown on; the caller has already chosen a completed day or month.
export function toSummaryView(row: PeriodSummaryText, kind: "day" | "month"): SummaryView {
  const label = coveredLabel(row.period, kind);
  const text = narrationText(row);
  if (text === null) return { kind: "pending", periodLabel: label };
  return { kind: "narrated", text, generatedAtLabel: generatedAtLabel(row), periodLabel: label };
}

// The badge of the dashboard card: a narrated text carries its own status; `empty` and `pending` are neutral, with the
// recommendation card's wording for "nothing received yet"; null is a failed load.
export function todaySummaryStatus(view: TodaySummaryView | null): Status {
  if (view === null) return LOAD_FAILED;
  if (view.kind === "narrated") return view.status;
  if (view.kind === "pending") return { tone: "insufficient", label: "opis jeszcze się nie pojawił" };
  return { tone: "insufficient", label: "laboratorium jeszcze nic nie przesłało" };
}

// A row from an earlier day without a text is `empty`: it would otherwise say a finished day's text has not appeared
// yet. A row from an earlier day with a text is shown, marked as about another day; a row from today without one is
// `pending`. Staleness is the recommendation's rule (more than two hours old, or about an earlier day), measured from
// the time the card shows as "Wygenerowano", so the badge and the label always agree.
export function toTodaySummaryView(row: PeriodSummaryText | null, now: Date): TodaySummaryView {
  if (row === null) return { kind: "empty" };

  const isFromEarlierDay = row.period < warsawParts(now).dayKey;
  const text = narrationText(row);
  if (text === null) {
    return isFromEarlierDay ? { kind: "empty" } : { kind: "pending", periodLabel: coveredLabel(row.period, "day") };
  }

  const at = writtenAt(row);
  const ageMs = at === null ? null : now.getTime() - at.getTime();
  const status: Status = isFromEarlierDay
    ? earlierDayStatus(row.period)
    : ageMs === null
      ? { tone: "watch", label: "nieznany czas wygenerowania" }
      : ageStatus(ageMs);
  return {
    kind: "narrated",
    text,
    generatedAtLabel: generatedAtLabel(row),
    periodLabel: coveredLabel(row.period, "day"),
    status,
    isStale: isFromEarlierDay || ageMs === null || ageMs > STALE_AFTER_MS || ageMs < -FUTURE_SKEW_MS,
  };
}
