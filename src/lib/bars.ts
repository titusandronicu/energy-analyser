// Bar rectangles, an optional line and labels for the server-rendered history charts. Pure, so it is tested without a
// DOM. Like the sparkline, every series is calendar-indexed: slot i is day (or month) i, and a gap keeps its slot.
// Unlike the sparkline, the scale starts at zero, so bar heights compare as amounts.
import { oneDecimal } from "@/lib/format/values";

// Mirrors the sparkline: fewer slots with a value than this draw nothing.
export const MIN_BAR_SLOTS = 3;
// Units kept free above the highest value, so a line stroke at the maximum is not clipped.
export const BAR_TOP_PAD = 2;

export interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  // Which of the input series the bar belongs to (its colour).
  seriesIndex: number;
  // Which calendar slot (day or month) the bar sits in.
  slot: number;
}

export interface BarGeometry {
  bars: Bar[];
  // Path of the line series on the bar scale, broken at gaps; null when there is no line series.
  line: string | null;
  // Top of the scale: the largest value over all bars and the line (the bottom is always 0).
  max: number;
}

export interface BarOptions {
  width: number;
  height: number;
  // Space left free in every slot, split evenly on both sides of the slot's group of bars.
  gap: number;
  lineSeries?: readonly (number | null)[];
}

// A drawable amount: finite and not negative. Anything else (null, NaN, infinite, negative) is a gap, never a zero.
function isValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function coordinate(value: number): string {
  return value.toFixed(1);
}

// The horizontal centre of a slot, where its tick label and its line point sit.
export function slotCenter(slot: number, slots: number, width: number): number {
  return ((slot + 0.5) * width) / slots;
}

export function barGeometry(series: readonly (readonly (number | null)[])[], opts: BarOptions): BarGeometry | null {
  const { width, height, gap, lineSeries } = opts;
  const slots = Math.max(0, lineSeries?.length ?? 0, ...series.map((values) => values.length));
  if (slots === 0) return null;

  let filled = 0;
  let max = 0;
  for (let slot = 0; slot < slots; slot++) {
    const values = [...series.map((values) => values[slot]), lineSeries?.[slot]].filter(isValue);
    if (values.length > 0) filled++;
    for (const value of values) if (value > max) max = value;
  }
  if (filled < MIN_BAR_SLOTS) return null;

  const usable = height - BAR_TOP_PAD;
  const heightOf = (value: number) => (max > 0 ? (value / max) * usable : 0);
  const slotWidth = width / slots;
  const barWidth = Math.max(0, slotWidth - gap) / Math.max(1, series.length);

  const bars: Bar[] = [];
  for (let slot = 0; slot < slots; slot++) {
    series.forEach((values, seriesIndex) => {
      const value = values[slot];
      if (!isValue(value)) return;
      const h = heightOf(value);
      bars.push({
        x: round(slot * slotWidth + gap / 2 + seriesIndex * barWidth),
        y: round(height - h),
        w: round(barWidth),
        h: round(h),
        seriesIndex,
        slot,
      });
    });
  }

  let line: string | null = null;
  if (lineSeries !== undefined) {
    // Runs of consecutive non-gap slots; a lone point is drawn as a dot (a zero-length segment with a round cap).
    const runs: string[][] = [];
    let current: string[] = [];
    for (let slot = 0; slot < slots; slot++) {
      const value = lineSeries[slot];
      if (isValue(value)) {
        current.push(`${coordinate(slotCenter(slot, slots, width))},${coordinate(height - heightOf(value))}`);
      } else if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    }
    if (current.length > 0) runs.push(current);
    line = runs.map((run) => (run.length === 1 ? `M${run[0]} L${run[0]}` : `M${run.join(" L")}`)).join(" ");
  }

  return { bars, line, max };
}

// Tick slots for a daily chart: the first day, every 5th day and the last day. A 5th day closer than three slots to the
// last one is dropped, so "30" and "31" never collide at phone width.
export function dayTicks(days: number): number[] {
  if (days <= 0) return [];
  const last = days - 1;
  const ticks = new Set<number>([0]);
  for (let slot = 4; slot < last; slot += 5) {
    if (last - slot >= 3) ticks.add(slot);
  }
  ticks.add(last);
  return [...ticks].sort((a, b) => a - b);
}

export type SlotNoun = "day" | "month";

const NOUNS: Record<SlotNoun, { fallback: string; plural: string; each: string }> = {
  day: { fallback: "dzień", plural: "dni", each: "w każdym dniu z danymi" },
  month: { fallback: "miesiąc", plural: "miesięcy", each: "w każdym miesiącu z danymi" },
};

export interface DescribeOptions {
  // What each slot is called in the label ("14 września", "lipiec 2026"); by default "dzień 14".
  slotLabels?: readonly string[];
  slotNoun?: SlotNoun;
}

// The accessible label: the window, the highest and the lowest slot with a value, and "dane z X z Y dni" when some
// slots are gaps. It never states a trend. Null when the series has no value at all.
export function describeBars(
  subject: string,
  windowLabel: string,
  series: readonly (number | null)[],
  unit = "kWh",
  opts: DescribeOptions = {},
): string | null {
  const noun = NOUNS[opts.slotNoun ?? "day"];
  const present = series
    .map((value, slot) => ({ value, slot }))
    .filter((p): p is { value: number; slot: number } => isValue(p.value));
  if (present.length === 0) return null;

  let highest = present[0];
  let lowest = present[0];
  for (const point of present) {
    if (point.value > highest.value) highest = point;
    if (point.value < lowest.value) lowest = point;
  }
  const name = (slot: number) => opts.slotLabels?.[slot] ?? `${noun.fallback} ${String(slot + 1)}`;
  const amount = (value: number) => `${oneDecimal.format(value)} ${unit}`;
  const gaps =
    present.length < series.length
      ? `, dane z ${String(present.length)} z ${String(series.length)} ${noun.plural}`
      : "";
  const head = `${subject}, ${windowLabel}:`;
  if (highest.value === lowest.value) {
    return `${head} po ${amount(highest.value)} ${noun.each}${gaps}`;
  }
  return `${head} najwięcej ${amount(highest.value)} (${name(highest.slot)}), najmniej ${amount(lowest.value)} (${name(lowest.slot)})${gaps}`;
}

// One quarter month for the grouped chart. A null total is a month without enough complete days: a gap, never 0.
export interface MonthGroup {
  label: string;
  pv: number | null;
  load: number | null;
  import: number | null;
  completeDays: number;
  calendarDays: number;
}

export const MONTH_GROUP_SUBJECTS = ["Produkcja z paneli", "Zużycie domu", "Prąd kupiony z sieci"] as const;

// The grouped chart's series in drawing order: PV, house use, grid import.
export function monthGroupSeries(months: readonly MonthGroup[]): (number | null)[][] {
  return [months.map((m) => m.pv), months.map((m) => m.load), months.map((m) => m.import)];
}

// The grouped chart's accessible label: each series described over the months, then every month's complete days.
export function describeMonthGroups(months: readonly MonthGroup[]): string | null {
  if (months.length === 0) return null;
  const windowLabel = months.length === 1 ? months[0].label : `${months[0].label} – ${months[months.length - 1].label}`;
  const slotLabels = months.map((m) => m.label);
  const parts = monthGroupSeries(months)
    .map((values, index) =>
      describeBars(MONTH_GROUP_SUBJECTS[index], windowLabel, values, "kWh", { slotLabels, slotNoun: "month" }),
    )
    .filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const days = months.map((m) => `${m.label} ${String(m.completeDays)} z ${String(m.calendarDays)}`).join(", ");
  return `${parts.join("; ")}. Pełne dni: ${days}`;
}
