// Time units and the age of a timestamp as the dashboard words it. Shared by the services that judge freshness, so none
// of them has to import live-state.ts for it.
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

// How far ahead of this app's clock a producer timestamp may be before it counts as a clock error, not as fresh. The
// live state, the recommendation and the bill forecast each export it under their own name (their tests pin them), and
// the ingest contract has its own copy on the write side.
export const CLOCK_SKEW_MS = 5 * MINUTE_MS;

// "5 min" under an hour, "2 godz." under a day, "3 dni" beyond. A capture time in the future counts as 0.
export function formatAge(ageMs: number): string {
  const age = Math.max(0, ageMs);
  if (age < HOUR_MS) return `${String(Math.floor(age / MINUTE_MS))} min`;
  if (age < DAY_MS) return `${String(Math.floor(age / HOUR_MS))} godz.`;
  const days = Math.floor(age / DAY_MS);
  return days === 1 ? "1 dzień" : `${String(days)} dni`;
}
