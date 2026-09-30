// The history calendar's periods (S-15): a Warsaw day, a calendar month or a quarter, read from and written to the
// page URL (`?day=2026-09-14`, `?month=2026-09`, `?quarter=2026-Q3`). Every view, range and link derives from here.
import {
  addDays,
  dayKeyToUtcMs,
  formatDayMonth,
  formatMonth,
  formatWeekday,
  utcMsToDayKey,
  warsawDayHours,
} from "@/lib/format/warsaw-time";
import { MIN_RANKED_DAYS } from "@/lib/services/hourly-usage";

// The first Warsaw day the app holds daily totals for; nothing before it can be opened.
export const HISTORY_START = "2026-07-16";

export type Quarter = 1 | 2 | 3 | 4;
export type PeriodKind = "day" | "month" | "quarter";

export type CalendarPeriod =
  { kind: "day"; day: string } | { kind: "month"; month: string } | { kind: "quarter"; year: number; quarter: Quarter };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;
const PARAMS: readonly PeriodKind[] = ["day", "month", "quarter"];
const ROMAN: Record<Quarter, string> = { 1: "I", 2: "II", 3: "III", 4: "IV" };

// "2026-09" → "2026-10"; month keys are calendar months, so no time zone is involved.
export function addMonths(month: string, months: number): string {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + months;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// The inclusive last day key of a month: the day before the next month's first.
function lastDayOfMonth(month: string): string {
  return addDays(`${addMonths(month, 1)}-01`, -1);
}

export function quarterMonths(year: number, quarter: Quarter): [string, string, string] {
  const first = `${String(year)}-${String(quarter * 3 - 2).padStart(2, "0")}`;
  return [first, addMonths(first, 1), addMonths(first, 2)];
}

function quarterOfMonth(month: string): { year: number; quarter: Quarter } {
  return { year: Number(month.slice(0, 4)), quarter: (Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1) as Quarter };
}

// First and last day key of a period, inclusive.
export function periodBounds(p: CalendarPeriod): { first: string; last: string } {
  if (p.kind === "day") return { first: p.day, last: p.day };
  if (p.kind === "month") return { first: `${p.month}-01`, last: lastDayOfMonth(p.month) };
  const [first, , last] = quarterMonths(p.year, p.quarter);
  return { first: `${first}-01`, last: lastDayOfMonth(last) };
}

// Every day key of the period, oldest first.
export function periodDays(p: CalendarPeriod): string[] {
  const { first, last } = periodBounds(p);
  const count = Math.round((dayKeyToUtcMs(last) - dayKeyToUtcMs(first)) / (24 * 60 * 60 * 1000)) + 1;
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

// The instants a period covers, as the half-open range [Warsaw midnight of its first day, Warsaw midnight of the day
// after its last day). The next day's start is the exclusive end, so a 23- or 25-hour DST day is covered exactly.
export function periodInstants(p: CalendarPeriod): { fromMs: number; toMs: number } {
  const { first, last } = periodBounds(p);
  return { fromMs: warsawDayHours(first)[0].startMs, toMs: warsawDayHours(addDays(last, 1))[0].startMs };
}

// A period can be opened when it overlaps [HISTORY_START, today].
export function isOpenable(p: CalendarPeriod, today: string): boolean {
  const { first, last } = periodBounds(p);
  return last >= HISTORY_START && first <= today;
}

function parseValue(kind: PeriodKind, value: string): CalendarPeriod | null {
  if (kind === "day") {
    // The round trip rejects dates that don't exist ("2026-02-30") and years Date.UTC maps elsewhere ("0050").
    if (!DAY_PATTERN.test(value) || utcMsToDayKey(dayKeyToUtcMs(value)) !== value) return null;
    return { kind: "day", day: value };
  }
  if (kind === "month") {
    return MONTH_PATTERN.test(value) ? { kind: "month", month: value } : null;
  }
  const match = QUARTER_PATTERN.exec(value);
  return match ? { kind: "quarter", year: Number(match[1]), quarter: Number(match[2]) as Quarter } : null;
}

// The period the URL asks for. No calendar parameter is "default" (the page picks a month with defaultMonth); a
// malformed value, more than one calendar parameter (or one given twice), or a period wholly before HISTORY_START
// or after `today` is null, and the page redirects to the default. Other parameters are ignored.
export function parsePeriod(params: URLSearchParams, today: string): CalendarPeriod | "default" | null {
  const given = PARAMS.filter((kind) => params.has(kind));
  if (given.length === 0) return "default";
  if (given.length > 1) return null;
  const kind = given[0];
  const values = params.getAll(kind);
  if (values.length !== 1) return null;
  const period = parseValue(kind, values[0]);
  return period !== null && isOpenable(period, today) ? period : null;
}

// The month the calendar opens on: the current month once it has MIN_RANKED_DAYS complete days, else the previous
// one, but never a month before HISTORY_START's.
export function defaultMonth(today: string, completeDaysInCurrentMonth: number): string {
  const current = today.slice(0, 7);
  if (completeDaysInCurrentMonth >= MIN_RANKED_DAYS) return current;
  const previous = addMonths(current, -1);
  const first = HISTORY_START.slice(0, 7);
  return previous < first ? first : previous;
}

// "14 września 2026, poniedziałek", "wrzesień 2026", "III kwartał 2026".
export function periodLabel(p: CalendarPeriod): string {
  if (p.kind === "day") return `${formatDayMonth(p.day)} ${p.day.slice(0, 4)}, ${formatWeekday(p.day)}`;
  if (p.kind === "month") return formatMonth(p.month);
  return `${ROMAN[p.quarter]} kwartał ${String(p.year)}`;
}

function shift(p: CalendarPeriod, step: 1 | -1): CalendarPeriod {
  if (p.kind === "day") return { kind: "day", day: addDays(p.day, step) };
  if (p.kind === "month") return { kind: "month", month: addMonths(p.month, step) };
  const [first] = quarterMonths(p.year, p.quarter);
  return { kind: "quarter", ...quarterOfMonth(addMonths(first, step * 3)) };
}

// The neighbouring periods of the same kind, or null where one would lie wholly before HISTORY_START or after today.
export function adjacent(
  p: CalendarPeriod,
  today: string,
): { prev: CalendarPeriod | null; next: CalendarPeriod | null } {
  const prev = shift(p, -1);
  const next = shift(p, 1);
  return { prev: isOpenable(prev, today) ? prev : null, next: isOpenable(next, today) ? next : null };
}

// The period of the given kind that contains a day, for switching between day, month and quarter.
export function periodContaining(kind: PeriodKind, day: string): CalendarPeriod {
  if (kind === "day") return { kind: "day", day };
  if (kind === "month") return { kind: "month", month: day.slice(0, 7) };
  return { kind: "quarter", ...quarterOfMonth(day.slice(0, 7)) };
}

// "?day=2026-09-14", "?month=2026-09", "?quarter=2026-Q3": what parsePeriod reads back.
export function toSearch(p: CalendarPeriod): string {
  if (p.kind === "day") return `?day=${p.day}`;
  if (p.kind === "month") return `?month=${p.month}`;
  return `?quarter=${String(p.year)}-Q${String(p.quarter)}`;
}

// The month as Monday-first weeks of day keys, with null before the first and after the last day.
export function monthGrid(month: string): (string | null)[][] {
  const days = periodDays({ kind: "month", month });
  // getUTCDay: 0 is Sunday; Monday-first puts Monday at 0 and Sunday at 6.
  const offset = (new Date(dayKeyToUtcMs(days[0])).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(offset).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
