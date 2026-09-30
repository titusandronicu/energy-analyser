import type { DailyEnergyRow } from "@/types";

// Which daily rows count as complete, shared by the calendar's view models and the period ratings, so neither has to
// import the other.

// A usable daily total: finite and not negative (as dailySeries reads it), else null.
export function kwh(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

// A day before today with PV, house use and grid import all present. Today and later days are never complete,
// whatever their row holds.
export function isCompleteDay(row: DailyEnergyRow | undefined, today: string): boolean {
  if (row === undefined || row.day >= today) return false;
  return kwh(row.pv_kwh) !== null && kwh(row.load_kwh) !== null && kwh(row.grid_import_kwh) !== null;
}
