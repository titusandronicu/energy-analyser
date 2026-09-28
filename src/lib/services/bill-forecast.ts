import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillForecastRow } from "@/types";

// Newest pushed bill forecast via the bill_forecast view; RLS returns nothing for non-owners. Errors are
// thrown so the page can show a load failure instead of pretending there is no forecast.
export async function loadBillForecast(client: SupabaseClient): Promise<BillForecastRow | null> {
  const { data, error } = await client
    .from("bill_forecast")
    .select("captured_at, received_at, bill_forecast")
    .limit(1)
    .overrideTypes<BillForecastRow[], { merge: false }>();
  if (error) throw new Error(`loading bill forecast failed: ${error.message}`);
  return data[0] ?? null;
}
