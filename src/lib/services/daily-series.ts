import type { DailyEnergyRow } from "@/types";
import { addDays } from "@/lib/format/warsaw-time";

// Sparkline windows: the live card's KPI row shows the previous 14 complete days, the usage card 7 days ending on the
// compared day.
export const KPI_SERIES_DAYS = 14;
export const USAGE_SERIES_DAYS = 7;

// Calendar-indexed: slot i is day i of the window, oldest first. A gap keeps its slot.
export type DailySeries = (number | null)[];

export type DailySeriesField = "pv_kwh" | "load_kwh" | "grid_import_kwh" | "grid_export_kwh";

// `days` entries oldest first, ending on `lastDay` inclusive. A day with no row, a null, non-finite or negative total
// is null (a gap, never 0); rows outside the window are ignored.
export function dailySeries(
  rows: readonly DailyEnergyRow[],
  field: DailySeriesField,
  lastDay: string,
  days: number,
): DailySeries {
  const firstDay = addDays(lastDay, -(days - 1));
  const totals = new Map<string, number | null>();
  for (const row of rows) {
    if (row.day < firstDay || row.day > lastDay) continue;
    const value = row[field];
    totals.set(row.day, typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);
  }
  return Array.from({ length: days }, (_, index) => totals.get(addDays(firstDay, index)) ?? null);
}
