import type { SupabaseClient } from "@supabase/supabase-js";
import { HOUR_MS } from "@/lib/format/age";
import { addDays } from "@/lib/format/warsaw-time";

const MAX_DRAWS = 25;
const DAY_RANGE_START = Date.UTC(1900, 0, 1);
const DAY_RANGE_END = Date.UTC(2020, 11, 31);
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

// `n` distinct far-past calendar days ("YYYY-MM-DD", ascending, 1900-01-01 to 2020-12-31), none stored in daily_energy.
// The contract bounds no day. The range ends years before the dashboard's 400-day usage baseline and never reaches the
// future, and no windowed loader reads these days, so they never touch what smoke renders.
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

// A run of 7 consecutive far-past days (`first` ... `first + 6`) that no daily row occupies. A push uses some of them,
// the rest must stay gaps, so a loaded range holds exactly the pushed days even though the database is never reset.
export async function emptyWeek(owner: SupabaseClient): Promise<string[]> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const [first] = await freshDays(owner, 1);
    const week = Array.from({ length: 7 }, (_, i) => addDays(first, i));
    const { data, error } = await owner.from("daily_energy").select("day").in("day", week);
    if (error) throw new Error(`checking daily_energy keys failed: ${error.message}`);
    if (data.length === 0) return week;
  }
  throw new Error("could not find 7 consecutive unused days");
}

// A far-past day with no daily row and no period summary of its own.
export async function emptySummaryDay(owner: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const [day] = await freshDays(owner, 1);
    const { data, error } = await owner.from("period_summaries").select("period").eq("kind", "day").eq("period", day);
    if (error) throw new Error(`checking period_summaries keys failed: ${error.message}`);
    if (data.length === 0) return day;
  }
  throw new Error("could not find an unused summary day");
}

// `n` distinct whole hours (ISO instants, ascending) between 10 and 28 days back, none stored in hourly_energy. There
// is no far-past variant on purpose: ingest_push deletes every hour older than 35 days in the same call, so a far-past
// hour can never hold a row and an "absent" check on one proves nothing. The range stays clear of smoke's day (4 days
// back), the complete day the history-safety test pushes (7 days back) and the prune test's 30-day hour. Complete days
// the suite pushes into the window keep every load at or below 1 kWh; single loads pushed to these hours (incomplete
// blocks) may be higher but must stay far below smoke's 9.5 kWh, as they sit inside the dashboard's window.
export function freshWindowHours(owner: SupabaseClient, n: number, now: Date = new Date()): Promise<string[]> {
  const nowHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  return drawAbsent(
    n,
    () => new Date(nowHour - randomBetween(10 * 24, 28 * 24) * HOUR_MS).toISOString(),
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

const OLDER_MIN_AGE_MS = 60_000;
const OLDER_JITTER_MS = 60_000;
const usedOlder = new Set<number>();

// A captured_at the real now minus one to two minutes: older than any push made through `nextCapturedAt`, never in the
// future and well inside the contract's 14 days. The millisecond jitter keeps it from equalling another push's
// captured_at (an equal one with different content is a 409); a value already handed out is redrawn.
export function olderCapturedAt(): Date {
  for (;;) {
    const ms = Date.now() - OLDER_MIN_AGE_MS - Math.floor(Math.random() * OLDER_JITTER_MS);
    if (!usedOlder.has(ms)) {
      usedOlder.add(ms);
      return new Date(ms);
    }
  }
}
