import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyEnergyRow } from "@/types";
import { formatPeriod } from "@/lib/format/period";
import { referenceUsageSentence } from "@/lib/format/reference-usage";
import type { Status } from "@/lib/format/status";
import { asNumber, kwhLabel, MISSING, oneDecimal } from "@/lib/format/values";
import { addDays, formatDayMonth, utcMsToDayKey, warsawParts } from "@/lib/format/warsaw-time";
import { dailySeries, USAGE_SERIES_DAYS } from "@/lib/services/daily-series";
import type { DailySeries } from "@/lib/services/daily-series";

// Enough history for a seasonal window a year back (365 days + 14 days + slack). The seasonal baseline therefore
// only ever reaches one earlier year, even when older data exists.
export const HISTORY_DAYS = 400;
// Yesterday may be missing (late push); the newest day with a load within this many days stands in for it.
export const LOOKBACK_DAYS = 7;
export const SEASONAL_WINDOW_DAYS = 14;
export const MIN_SEASONAL_DAYS = 20;
export const FALLBACK_DAYS = 30;
export const MIN_FALLBACK_DAYS = 7;
// Load more than 15% above/below the baseline median counts as above/below; exactly ±15% is normal.
export const STATUS_THRESHOLD = 0.15;
// Load more than 40% above the baseline median is a problem; exactly +40% stays "above" (worth watching).
export const FAR_ABOVE_THRESHOLD = 0.4;
// Absorbs floating point error so an exact ±15% (e.g. 34.5 against a median of 30) stays normal.
const EPSILON = 1e-9;

export type UsageStatus = "above" | "below" | "normal";
// Where the compared day falls among the ranges: below / within / above the ±15% band, or more than +40%.
export type UsageBand = "low" | "normal" | "high" | "very_high";

// The day read against the norm in kWh; the range edges are the status thresholds, so the text and the badge agree.
export interface UsageMeaning {
  normKwhLabel: string;
  band: UsageBand;
  ranges: { band: UsageBand; name: string; label: string }[];
  // "To więcej niż zwykle (+23% wobec normy)."
  verdictSentence: string;
  referenceSentence: string;
}

export type UsageInsightView =
  | { kind: "insufficient"; status: Status; reason: string }
  | {
      kind: "insight";
      status: Status;
      dayLabel: string;
      isYesterday: boolean;
      load: { kwhLabel: string; deltaLabel: string; status: UsageStatus };
      purchase: { kwhLabel: string; deltaLabel: string };
      // The USAGE_SERIES_DAYS ending on the compared day, so the last point is the value shown beside it.
      series: { load: DailySeries; purchase: DailySeries };
      baseline: { kind: "seasonal" | "fallback"; days: number; periodLabel: string };
      // null when the norm is zero: no range can be drawn around it.
      meaning: UsageMeaning | null;
    };

// Daily totals for the last HISTORY_DAYS Warsaw days, newest first; RLS returns nothing for non-owners. Errors
// are thrown so the page can show a load failure instead of pretending there is no history.
export async function loadDailyEnergy(client: SupabaseClient, now: Date = new Date()): Promise<DailyEnergyRow[]> {
  const since = addDays(warsawParts(now).dayKey, -HISTORY_DAYS);
  const { data, error } = await client
    .from("daily_energy")
    .select("day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh")
    .gte("day", since)
    .order("day", { ascending: false })
    .overrideTypes<DailyEnergyRow[], { merge: false }>();
  if (error) throw new Error(`loading daily energy failed: ${error.message}`);
  return data;
}

interface Day {
  load: number;
  purchase: number | null;
}

// The compared day's month-day in an earlier year; Feb 29 becomes Feb 28 in a non-leap year.
function anchorIn(year: number, dayKey: string): string {
  const [month, day] = dayKey.slice(5).split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const shifted = new Date(ms).getUTCMonth() !== month - 1;
  return utcMsToDayKey(shifted ? Date.UTC(year, month - 1, day - 1) : ms);
}

// The middle value (the mean of the two middle values for an even count). A few unusual days (guests, a data
// glitch) move it far less than they move a mean.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function statusOf(load: number, baseline: number): UsageStatus {
  if (load > baseline * (1 + STATUS_THRESHOLD) + EPSILON) return "above";
  if (load < baseline * (1 - STATUS_THRESHOLD) - EPSILON) return "below";
  return "normal";
}

function bandOf(load: number, baseline: number | null): UsageBand {
  const status = baseline === null || baseline === 0 ? "normal" : statusOf(load, baseline);
  if (status === "normal") return "normal";
  if (status === "below") return "low";
  return baseline !== null && load > baseline * (1 + FAR_ABOVE_THRESHOLD) + EPSILON ? "very_high" : "high";
}

// The owner's rule: normal or below is good, above is worth watching, far above is a problem.
const BAND_STATUS: Record<UsageBand, Status> = {
  low: { tone: "good", label: "poniżej normy" },
  normal: { tone: "good", label: "w normie" },
  high: { tone: "watch", label: "powyżej normy" },
  very_high: { tone: "problem", label: "dużo powyżej normy" },
};

const BAND_NAME: Record<UsageBand, string> = {
  low: "Niskie",
  normal: "W normie",
  high: "Wysokie",
  very_high: "Bardzo wysokie",
};

const BAND_VERDICT: Record<UsageBand, string> = {
  low: "To mniej niż zwykle",
  normal: "To tyle, co zwykle",
  high: "To więcej niż zwykle",
  very_high: "To dużo więcej niż zwykle",
};

const twoDecimals = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The range edges in kWh: low / normal, normal / high, high / very high.
function rangeEdges(norm: number): [number, number, number] {
  return [norm * (1 - STATUS_THRESHOLD), norm * (1 + STATUS_THRESHOLD), norm * (1 + FAR_ABOVE_THRESHOLD)];
}

// "34,5 kWh", or "34,52 kWh" when one decimal would print the same number as a range edge the day is not on, so
// the day's figure never seems to sit outside the range marked for it (the same idea as deltaLabel at ±15%).
function dayKwhLabel(load: number, norm: number | null): string {
  if (norm === null || norm === 0) return kwhLabel(load);
  const shown = oneDecimal.format(load);
  const collides = rangeEdges(norm).some(
    (edge) => oneDecimal.format(edge) === shown && Math.abs(load - edge) > EPSILON,
  );
  return collides ? `${twoDecimals.format(load)} kWh` : kwhLabel(load);
}

// "30,9 kWh" etc.; the edges shown are the thresholds, and a day exactly on an edge takes the milder range.
function meaningOf(load: number, norm: number | null, dayKey: string): UsageMeaning | null {
  if (norm === null || norm === 0) return null;
  const kwh = (value: number) => oneDecimal.format(value);
  const [low, high, veryHigh] = rangeEdges(norm);
  const band = bandOf(load, norm);
  const range = (b: UsageBand, label: string) => ({ band: b, name: BAND_NAME[b], label });
  return {
    normKwhLabel: kwhLabel(norm),
    band,
    ranges: [
      range("low", `poniżej ${kwh(low)} kWh`),
      range("normal", `${kwh(low)}–${kwh(high)} kWh`),
      range("high", `${kwh(high)}–${kwh(veryHigh)} kWh`),
      range("very_high", `powyżej ${kwh(veryHigh)} kWh`),
    ],
    verdictSentence: `${BAND_VERDICT[band]} (${deltaLabel(load, norm)} wobec normy).`,
    referenceSentence: referenceUsageSentence(dayKey),
  };
}

function insufficient(reason: string): UsageInsightView {
  return { kind: "insufficient", status: { tone: "insufficient", label: "" }, reason };
}

// "+12%", "−8%" (minus sign), "0%"; MISSING without a usable baseline.
export function deltaLabel(value: number | null, baseline: number | null): string {
  if (value === null || baseline === null || baseline === 0) return MISSING;
  const raw = (value / baseline - 1) * 100;
  // Round half away from zero, symmetric for increases and decreases.
  const percent = Math.sign(raw) * Math.round(Math.abs(raw) + EPSILON);
  if (percent === 0) return "0%";
  const sign = percent > 0 ? "+" : "−";
  const whole = Math.abs(percent);
  const threshold = STATUS_THRESHOLD * 100;
  const farAbove = FAR_ABOVE_THRESHOLD * 100;
  // At a threshold a whole percent could read "+15%" (or "+40%") next to either status, so show one decimal:
  // exactly on the line is "15,0%" / "40,0%" (the milder status) and anything past it at least "15,1%" / "40,1%",
  // decided by the same rule as the status.
  let edge: number;
  let milder: boolean;
  if (whole === threshold) {
    edge = threshold;
    milder = statusOf(value, baseline) === "normal";
  } else if (percent > 0 && whole === farAbove) {
    edge = farAbove;
    milder = bandOf(value, baseline) !== "very_high";
  } else {
    return `${sign}${String(whole)}%`;
  }
  const tenths = Math.round(Math.abs(raw) * 10 + EPSILON) / 10;
  const shown = milder ? Math.min(tenths, edge) : Math.max(tenths, edge + 0.1);
  return `${sign}${oneDecimal.format(shown)}%`;
}

type BaselineSelection =
  | { ok: false; reason: string }
  | {
      ok: true;
      today: string;
      compared: string;
      comparedDay: Day;
      kind: "seasonal" | "fallback";
      baselineDays: string[];
      baseline: Day[];
    };

// The compared day and its baseline (seasonal, else the fallback window), or why there is none.
function selectBaseline(rows: DailyEnergyRow[], now: Date): BaselineSelection {
  const today = warsawParts(now).dayKey;

  // Days with a load only; a day without one is skipped everywhere. Today is never compared or a baseline.
  const days = new Map<string, Day>();
  for (const row of rows) {
    const load = asNumber(row.load_kwh);
    if (load === null || row.day >= today) continue;
    days.set(row.day, { load, purchase: asNumber(row.grid_import_kwh) });
  }

  let compared: string | null = null;
  for (let offset = 1; offset <= LOOKBACK_DAYS; offset++) {
    const candidate = addDays(today, -offset);
    if (days.has(candidate)) {
      compared = candidate;
      break;
    }
  }
  const comparedDay = compared === null ? undefined : days.get(compared);
  if (compared === null || comparedDay === undefined) {
    return { ok: false, reason: `brak zużycia z ostatnich ${String(LOOKBACK_DAYS)} dni` };
  }

  // Seasonal: ±14 days around the compared day's month-day in every earlier year that has data (with
  // HISTORY_DAYS of history that is one year). The anchor is at least a year back, so the window never reaches
  // the compared day or the fallback window. Starting one year before the earliest data covers a window around
  // New Year that spills into the earliest year.
  const comparedYear = Number(compared.slice(0, 4));
  const earliestYear = Math.min(...[...days.keys()].map((d) => Number(d.slice(0, 4))));
  const seasonal: string[] = [];
  for (let year = comparedYear - 1; year >= earliestYear - 1; year--) {
    const anchor = anchorIn(year, compared);
    for (let offset = -SEASONAL_WINDOW_DAYS; offset <= SEASONAL_WINDOW_DAYS; offset++) {
      const key = addDays(anchor, offset);
      if (key !== compared && days.has(key)) seasonal.push(key);
    }
  }

  let kind: "seasonal" | "fallback";
  let baselineDays: string[];
  if (seasonal.length >= MIN_SEASONAL_DAYS) {
    kind = "seasonal";
    baselineDays = seasonal;
  } else {
    kind = "fallback";
    baselineDays = [];
    for (let offset = 1; offset <= FALLBACK_DAYS; offset++) {
      const key = addDays(compared, -offset);
      if (days.has(key)) baselineDays.push(key);
    }
    if (baselineDays.length < MIN_FALLBACK_DAYS) {
      return {
        ok: false,
        reason: `potrzeba co najmniej ${String(MIN_FALLBACK_DAYS)} dni z ostatnich ${String(FALLBACK_DAYS)}, jest ${String(baselineDays.length)}`,
      };
    }
  }

  const baseline = baselineDays.map((key) => days.get(key)).filter((d): d is Day => d !== undefined);
  return { ok: true, today, compared, comparedDay, kind, baselineDays, baseline };
}

// The typical daily load (median of the baseline days) with the baseline the usage card would use; null exactly
// when the usage card would say "insufficient". The live card pro-rates it by the hour, so both share one norm.
export function dailyLoadNorm(
  rows: DailyEnergyRow[],
  now: Date,
): { norm: number | null; days: number; kind: "seasonal" | "fallback" } | null {
  const selection = selectBaseline(rows, now);
  if (!selection.ok) return null;
  return {
    norm: median(selection.baseline.map((d) => d.load)),
    days: selection.baseline.length,
    kind: selection.kind,
  };
}

export function toUsageInsightView(rows: DailyEnergyRow[], now: Date): UsageInsightView {
  const selection = selectBaseline(rows, now);
  if (!selection.ok) return insufficient(selection.reason);
  const { today, compared, comparedDay, kind: baselineKind, baselineDays, baseline } = selection;
  const yesterday = addDays(today, -1);

  const loadNorm = median(baseline.map((d) => d.load));
  const purchaseNorm = median(baseline.map((d) => d.purchase).filter((p): p is number => p !== null));

  return {
    kind: "insight",
    status: BAND_STATUS[bandOf(comparedDay.load, loadNorm)],
    dayLabel: formatDayMonth(compared),
    isYesterday: compared === yesterday,
    load: {
      kwhLabel: dayKwhLabel(comparedDay.load, loadNorm),
      deltaLabel: deltaLabel(comparedDay.load, loadNorm),
      status: loadNorm === null || loadNorm === 0 ? "normal" : statusOf(comparedDay.load, loadNorm),
    },
    purchase: {
      kwhLabel: kwhLabel(comparedDay.purchase),
      deltaLabel: deltaLabel(comparedDay.purchase, purchaseNorm),
    },
    series: {
      load: dailySeries(rows, "load_kwh", compared, USAGE_SERIES_DAYS),
      purchase: dailySeries(rows, "grid_import_kwh", compared, USAGE_SERIES_DAYS),
    },
    baseline: {
      kind: baselineKind,
      days: baseline.length,
      periodLabel: formatPeriod(baselineDays, today.slice(0, 4)).label,
    },
    meaning: meaningOf(comparedDay.load, loadNorm, compared),
  };
}
