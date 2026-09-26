import { formatDayMonth } from "@/lib/format/warsaw-time";

// Which days a figure rests on (FR-018): "1 dzień: 24 września", "2 dni: 23–24 września" or
// "18 dni: 27 sierpnia – 25 września".
// The range runs from the first to the last day even when days in between are missing; the year is shown on
// both ends only when the range spans two years.
export function formatPeriod(dayKeys: string[]): { days: number; label: string } {
  const unique = [...new Set(dayKeys)].sort();
  if (unique.length === 0) {
    throw new Error("formatPeriod needs at least one day");
  }

  const days = unique.length;
  const count = `${days} ${days === 1 ? "dzień" : "dni"}`;
  const first = unique[0];
  const last = unique[unique.length - 1];
  if (first === last) {
    return { days, label: `${count}: ${formatDayMonth(first)}` };
  }

  const firstYear = first.slice(0, 4);
  const lastYear = last.slice(0, 4);
  let range: string;
  if (firstYear !== lastYear) {
    range = `${formatDayMonth(first)} ${firstYear} – ${formatDayMonth(last)} ${lastYear}`;
  } else if (first.slice(0, 7) === last.slice(0, 7)) {
    // Same month: the month is named once, "23–24 września".
    range = `${String(Number(first.slice(8)))}–${formatDayMonth(last)}`;
  } else {
    range = `${formatDayMonth(first)} – ${formatDayMonth(last)}`;
  }
  return { days, label: `${count}: ${range}` };
}
