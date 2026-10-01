import type { SupabaseClient } from "@supabase/supabase-js";
import { HOUR_MS } from "@/lib/format/warsaw-time";

const MAX_DRAWS = 25;
const DAY_RANGE_START = Date.UTC(1900, 0, 1);
const DAY_RANGE_END = Date.UTC(2040, 11, 31);
const HOUR_RANGE_START = Date.UTC(1900, 0, 1);
const HOUR_RANGE_END = Date.UTC(2020, 11, 31);
const WINDOW_DAYS = 35;

function randomBetween(from: number, to: number): number {
  return from + Math.floor(Math.random() * (to - from));
}

// Draws `n` distinct keys with `draw` until a lookup says none of them is stored. The database is never reset
// between runs, so a test that needs "this key is absent" has to check instead of assuming.
async function drawAbsent(
  n: number,
  draw: () => string,
  isAnyStored: (keys: string[]) => Promise<boolean>,
): Promise<string[]> {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt++) {
    const keys = new Set<string>();
    while (keys.size < n) keys.add(draw());
    const list = [...keys].sort();
    if (!(await isAnyStored(list))) return list;
  }
  throw new Error(`could not draw ${String(n)} unused keys in ${String(MAX_DRAWS)} attempts`);
}

// `n` distinct far-past calendar days ("YYYY-MM-DD", ascending), none stored in daily_energy. The contract bounds no
// day, and no windowed loader is used for them, so they never touch what smoke renders.
export function freshDays(owner: SupabaseClient, n: number): Promise<string[]> {
  return drawAbsent(
    n,
    () => new Date(randomBetween(DAY_RANGE_START, DAY_RANGE_END)).toISOString().slice(0, 10),
    async (days) => {
      const { data, error } = await owner.from("daily_energy").select("day").in("day", days);
      if (error) throw new Error(`checking daily_energy keys failed: ${error.message}`);
      return data.length > 0;
    },
  );
}

// `n` distinct far-past whole hours (ISO instants, ascending), none stored in hourly_energy.
export function freshHours(owner: SupabaseClient, n: number): Promise<string[]> {
  return drawAbsent(
    n,
    () => new Date(Math.floor(randomBetween(HOUR_RANGE_START, HOUR_RANGE_END) / HOUR_MS) * HOUR_MS).toISOString(),
    async (hours) => {
      const { data, error } = await owner.from("hourly_energy").select("hour_start").in("hour_start", hours);
      if (error) throw new Error(`checking hourly_energy keys failed: ${error.message}`);
      return data.length > 0;
    },
  );
}

// `n` consecutive whole hours (ISO instants, ascending) inside the 35-day window, ending with the last hour that has
// ended. For positive assertions on the test's own keys only: they are not verified absent.
export function windowHours(n: number, now: Date = new Date()): string[] {
  if (n < 1 || n > WINDOW_DAYS * 24) throw new Error(`windowHours: ${String(n)} hours do not fit the window`);
  const lastStart = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS - HOUR_MS;
  return Array.from({ length: n }, (_, i) => new Date(lastStart - (n - 1 - i) * HOUR_MS).toISOString());
}

let lastCapturedAt = 0;

// The real now, bumped by 1 ms when it would not be greater than the previous value, so every push is strictly newer
// than the one before (an equal captured_at with different content is a 409). Never in the future by more than that
// bump, and always inside the contract's 14-day window.
export function nextCapturedAt(): Date {
  const ms = Math.max(Date.now(), lastCapturedAt + 1);
  lastCapturedAt = ms;
  return new Date(ms);
}
