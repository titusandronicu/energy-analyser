import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyEnergyRow, DayNoteRow, RecommendationRow } from "@/types";

// Range loaders for the history calendar (S-15). Each reads only the chosen period's rows; RLS returns nothing for
// non-owners. Errors are thrown so the page can show a load failure instead of pretending the period is empty.

// PostgREST's row cap (supabase/config.toml max_rows). The generation times are read with this explicit limit, so a
// full page means the list may have been cut.
export const RECOMMENDATION_TIMES_LIMIT = 1000;

// Daily totals for the Warsaw days `from` to `to` inclusive (day keys), oldest first. A month is at most 31 rows and a
// quarter 92.
export async function loadDailyRange(client: SupabaseClient, from: string, to: string): Promise<DailyEnergyRow[]> {
  const { data, error } = await client
    .from("daily_energy")
    .select("day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh")
    .gte("day", from)
    .lte("day", to)
    .order("day", { ascending: true })
    .overrideTypes<DailyEnergyRow[], { merge: false }>();
  if (error) throw new Error(`loading daily energy range failed: ${error.message}`);
  return data;
}

// When each recommendation in [fromMs, toMs) was generated, oldest first; only the times, for the month grid's
// markers. `truncated` is true when the limit was reached, so the markers may be incomplete.
export async function loadRecommendationTimes(
  client: SupabaseClient,
  fromMs: number,
  toMs: number,
): Promise<{ times: string[]; truncated: boolean }> {
  const { data, error } = await client
    .from("recommendations")
    .select("generated_at")
    .gte("generated_at", new Date(fromMs).toISOString())
    .lt("generated_at", new Date(toMs).toISOString())
    .order("generated_at", { ascending: true })
    .limit(RECOMMENDATION_TIMES_LIMIT)
    .overrideTypes<{ generated_at: string }[], { merge: false }>();
  if (error) throw new Error(`loading recommendation times failed: ${error.message}`);
  return { times: data.map((row) => row.generated_at), truncated: data.length >= RECOMMENDATION_TIMES_LIMIT };
}

// Full recommendations generated in [fromMs, toMs), one Warsaw day, oldest first. No explicit limit or truncation flag:
// PostgREST's 1000-row cap is irrelevant for one day, which holds about 24 (one an hour).
export async function loadRecommendationsForDay(
  client: SupabaseClient,
  fromMs: number,
  toMs: number,
): Promise<RecommendationRow[]> {
  const { data, error } = await client
    .from("recommendations")
    .select("generated_at, language, text, provider, model, forecast, facts")
    .gte("generated_at", new Date(fromMs).toISOString())
    .lt("generated_at", new Date(toMs).toISOString())
    .order("generated_at", { ascending: true })
    .overrideTypes<RecommendationRow[], { merge: false }>();
  if (error) throw new Error(`loading recommendations for the day failed: ${error.message}`);
  return data;
}

// The signed-in owner's note on one Warsaw day (S-19), or null when there is none. RLS returns only the user's own
// rows, and unique (user_id, day) keeps it to at most one.
export async function loadNoteForDay(client: SupabaseClient, day: string): Promise<DayNoteRow | null> {
  const { data, error } = await client
    .from("day_notes")
    .select("day, text, updated_at")
    .eq("day", day)
    .maybeSingle()
    .overrideTypes<DayNoteRow | null, { merge: false }>();
  if (error) throw new Error(`loading the day note failed: ${error.message}`);
  return data;
}

// The days from `from` to `to` inclusive (day keys) that carry a note, oldest first; only the keys, for the month
// grid's markers. A month is at most 31 rows.
export async function loadNoteDays(client: SupabaseClient, from: string, to: string): Promise<string[]> {
  const { data, error } = await client
    .from("day_notes")
    .select("day")
    .gte("day", from)
    .lte("day", to)
    .order("day", { ascending: true })
    .overrideTypes<{ day: string }[], { merge: false }>();
  if (error) throw new Error(`loading the note days failed: ${error.message}`);
  return data.map((row) => row.day);
}
