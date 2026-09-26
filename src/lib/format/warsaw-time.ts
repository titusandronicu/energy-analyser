// Europe/Warsaw date helpers shared by the dashboard cards.
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
const DAY_MS = 24 * 60 * 60 * 1000;

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
