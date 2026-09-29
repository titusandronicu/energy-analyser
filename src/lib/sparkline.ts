// Path data and labels for the server-rendered Sparkline. Pure, so it is tested without a DOM.
// A series is calendar-indexed: slot i is day i of the window, and a gap (null, NaN, infinite) keeps its slot.
import { oneDecimal } from "@/lib/format/values";

// Two points make a line that reads as a trend; three is the least that shows a shape.
export const MIN_SPARKLINE_POINTS = 3;
// Pixels kept free on every side for the stroke.
export const SPARKLINE_PAD = 2;
// A span at or under this is a flat series: it is not scaled min to max.
export const FLAT_SPAN_EPSILON = 1e-9;

export interface SparklineGeometry {
  line: string;
  area: string;
  // Number of non-gap values.
  points: number;
  min: number;
  max: number;
  // The last non-gap value.
  last: number;
  flat: boolean;
}

interface Slot {
  x: number;
  y: number;
}

function isValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function coordinate(value: number): string {
  return value.toFixed(1);
}

export function sparklineGeometry(
  values: readonly (number | null)[],
  width: number,
  height: number,
): SparklineGeometry | null {
  const present = values.filter(isValue);
  if (present.length < MIN_SPARKLINE_POINTS) return null;

  let min = present[0];
  let max = present[0];
  for (const value of present) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const flat = max - min <= FLAT_SPAN_EPSILON;
  const allZero = flat && Math.abs(max) <= FLAT_SPAN_EPSILON;

  const bottom = height - SPARKLINE_PAD;
  const top = SPARKLINE_PAD;
  const step = (width - 2 * SPARKLINE_PAD) / (values.length - 1);
  function yOf(value: number): number {
    if (allZero) return bottom;
    if (flat) return height / 2;
    return bottom - ((value - min) / (max - min)) * (bottom - top);
  }

  // Runs of consecutive non-gap slots.
  const runs: Slot[][] = [];
  let current: Slot[] = [];
  values.forEach((value, index) => {
    if (isValue(value)) {
      current.push({ x: SPARKLINE_PAD + index * step, y: yOf(value) });
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  });
  if (current.length > 0) runs.push(current);

  const point = (slot: Slot) => `${coordinate(slot.x)},${coordinate(slot.y)}`;
  const line = runs
    .map((run) => (run.length === 1 ? `M${point(run[0])} L${point(run[0])}` : `M${run.map(point).join(" L")}`))
    .join(" ");
  const area = runs
    .filter((run) => run.length >= 2)
    .map((run) => {
      const first = run[0];
      const last = run[run.length - 1];
      return `M${run.map(point).join(" L")} L${coordinate(last.x)},${coordinate(height)} L${coordinate(first.x)},${coordinate(height)} Z`;
    })
    .join(" ");

  return {
    line,
    area,
    points: present.length,
    min,
    max,
    last: present[present.length - 1],
    flat,
  };
}

// The accessible label: min, max and the last available value, never a trend. Null exactly when nothing is drawn.
export function describeSeries(
  subject: string,
  windowLabel: string,
  values: readonly (number | null)[],
  unit = "kWh",
): string | null {
  const geometry = sparklineGeometry(values, 1, 1);
  if (!geometry) return null;
  const gaps = geometry.points < values.length ? `, dane z ${geometry.points} z ${values.length} dni` : "";
  const head = `${subject}, ${windowLabel}:`;
  if (geometry.flat) {
    return `${head} bez zmian, ${oneDecimal.format(geometry.last)} ${unit} w każdym dniu z danymi${gaps}`;
  }
  return `${head} od ${oneDecimal.format(geometry.min)} do ${oneDecimal.format(geometry.max)} ${unit}, ostatnia dostępna wartość ${oneDecimal.format(geometry.last)} ${unit}${gaps}`;
}

// The visible caption of a flat series ("bez zmian, 0,0 kWh"), which carries no scale of its own. Null otherwise.
export function flatCaption(values: readonly (number | null)[], unit = "kWh"): string | null {
  const geometry = sparklineGeometry(values, 1, 1);
  if (!geometry?.flat) return null;
  return `bez zmian, ${oneDecimal.format(geometry.last)} ${unit}`;
}
