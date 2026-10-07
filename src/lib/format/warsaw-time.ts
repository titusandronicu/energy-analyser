// Europe/Warsaw date helpers shared by the dashboard cards.
import { DAY_MS, HOUR_MS } from "@/lib/format/age";

const TIME_ZONE = "Europe/Warsaw";

// `dayKey` ("2026-09-23") compares calendar days; `label` ("23 września 2026, 12:00") is what the cards show;
// `time` ("12:00") is its clock part.
// Built once: warsawParts runs several times per request.
const warsawDateTime = new Intl.DateTimeFormat("pl-PL", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const warsawMonthNumber = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, month: "2-digit" });

export function warsawParts(date: Date) {
  const parts = warsawDateTime.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const monthNumber = warsawMonthNumber.format(date);
  const time = `${get("hour")}:${get("minute")}`;
  return {
    dayKey: `${get("year")}-${monthNumber}-${get("day").padStart(2, "0")}`,
    label: `${get("day")} ${get("month")} ${get("year")}, ${time}`,
    time,
  };
}

export function formatWarsawDateTime(date: Date): string {
  return warsawParts(date).label;
}

// Calendar arithmetic on day keys ("YYYY-MM-DD"). A day key is a plain calendar date, so it is handled in UTC
// where every day has 24 hours; DST in Warsaw can't shift it.

export function dayKeyToUtcMs(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function utcMsToDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(dayKey: string, days: number): string {
  return utcMsToDayKey(dayKeyToUtcMs(dayKey) + days * DAY_MS);
}

const dayMonth = new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", day: "numeric", month: "long" });

// "24 września" for "2026-09-24" (day and genitive month, no year).
export function formatDayMonth(dayKey: string): string {
  return dayMonth.format(new Date(dayKeyToUtcMs(dayKey)));
}

// "4 sierpnia 2026" for "2026-08-04" (formatDayMonth plus the year).
export function dayMonthYear(dayKey: string): string {
  return `${formatDayMonth(dayKey)} ${dayKey.slice(0, 4)}`;
}

const monthYear = new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", month: "long", year: "numeric" });

// "wrzesień 2026" for the month key "2026-09" (nominative month, so it reads after "za" or "na").
// The caller checks the key first: a month key comes from pushed jsonb, and an unparsable one would throw here.
export function formatMonth(monthKey: string): string {
  return monthYear.format(new Date(dayKeyToUtcMs(`${monthKey}-01`)));
}

// The Warsaw calendar month ("2026-09") a moment falls in, for comparing a pushed month against "this month".
export function warsawMonthKey(date: Date): string {
  return warsawParts(date).dayKey.slice(0, 7);
}

// Clock hours in Warsaw. An hour is keyed by the UTC instant it starts at (as `hourly_energy.hour_start` is) and
// labelled by its Warsaw date and clock hour. A Warsaw day has 23, 24 or 25 of them: on the spring change 02:00
// does not exist, on the autumn change 02:00 happens twice (first in CEST, then in CET).
const warsawHourFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

// The Warsaw calendar day ("2026-08-01") and clock hour (0–23) of the hour starting at `ms` (UTC milliseconds).
export function warsawHour(ms: number): { dayKey: string; hour: number } {
  const parts = warsawHourFormat.formatToParts(ms);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { dayKey: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

// Every clock hour of a Warsaw day, in order, as its UTC start instant and clock hour: 24 on an ordinary day, 23 on
// the spring change (no 02:00), 25 on the autumn change (02:00 twice). Warsaw is UTC+1 or UTC+2, so the day's hours
// all start between 21:00 UTC the day before and 23:00 UTC on the day; the scan covers that span with slack.
export function warsawDayHours(dayKey: string): { startMs: number; hour: number }[] {
  const from = dayKeyToUtcMs(dayKey) - 3 * HOUR_MS;
  const hours: { startMs: number; hour: number }[] = [];
  for (let ms = from; ms < from + 30 * HOUR_MS; ms += HOUR_MS) {
    const local = warsawHour(ms);
    if (local.dayKey === dayKey) hours.push({ startMs: ms, hour: local.hour });
  }
  return hours;
}

const weekday = new Intl.DateTimeFormat("pl-PL", { timeZone: "UTC", weekday: "long" });

// "sobota" for "2026-08-01".
export function formatWeekday(dayKey: string): string {
  return weekday.format(new Date(dayKeyToUtcMs(dayKey)));
}
