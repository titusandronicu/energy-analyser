import { HOUR_MS } from "@/lib/format/age";

// Written on purpose without the app's own warsaw-time helpers (a mirror of `warsawDayHours` in scripts/smoke.mjs), so
// the hours a test pushes are built by a second, independent implementation of Europe/Warsaw rules.
const warsawClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function warsawHourAt(ms: number): { dayKey: string; hour: number } {
  const parts = Object.fromEntries(warsawClock.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { dayKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

// The Warsaw calendar day `daysBack` days before the Warsaw day of `now` ("YYYY-MM-DD").
export function warsawDayBefore(now: Date, daysBack: number): string {
  const today = warsawHourAt(now.getTime()).dayKey;
  return new Date(Date.parse(`${today}T00:00:00Z`) - daysBack * 24 * HOUR_MS).toISOString().slice(0, 10);
}

// Every clock hour of a Warsaw day, in order: its UTC start instant (ISO) and its clock hour. 24 on an ordinary day,
// 23 on the spring change, 25 on the autumn change. The day's midnight is the UTC midnight minus the Warsaw offset
// (+1 h or +2 h); the hours then run in whole-hour steps until the Warsaw date changes.
export function warsawDayHours(dayKey: string): { hourStart: string; hour: number }[] {
  const utcMidnight = Date.parse(`${dayKey}T00:00:00Z`);
  const midnight = [1, 2]
    .map((offsetHours) => utcMidnight - offsetHours * HOUR_MS)
    .find((ms) => warsawHourAt(ms).dayKey === dayKey && warsawHourAt(ms).hour === 0);
  if (midnight === undefined) throw new Error(`could not find the Warsaw midnight of ${dayKey}`);
  const hours: { hourStart: string; hour: number }[] = [];
  for (let ms = midnight; warsawHourAt(ms).dayKey === dayKey; ms += HOUR_MS) {
    hours.push({ hourStart: new Date(ms).toISOString(), hour: warsawHourAt(ms).hour });
  }
  return hours;
}
