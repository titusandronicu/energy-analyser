import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyEnergyRow } from "@/types";
import { formatPeriod } from "@/lib/format/period";
import type { Status } from "@/lib/format/status";
import { asNumber, kwhLabel, MISSING, oneDecimal } from "@/lib/format/values";
import { addDays, formatDayMonth, utcMsToDayKey, warsawParts } from "@/lib/format/warsaw-time";

// Enough history for a seasonal window a year back (365 days + 14 days + slack). The seasonal baseline therefore
// only ever reaches one earlier year, even when older data exists.
export const HISTORY_DAYS = 400;
// Yesterday may be missing (late push); the newest day with a load within this many days stands in for it.
export const LOOKBACK_DAYS = 7;
export const SEASONAL_WINDOW_DAYS = 14;
export const MIN_SEASONAL_DAYS = 20;
export const FALLBACK_DAYS = 30;
export const MIN_FALLBACK_DAYS = 7;
// Load more than 15% above/below the baseline mean counts as above/below; exactly ±15% is normal.
export const STATUS_THRESHOLD = 0.15;
// Load more than 40% above the baseline mean is a problem; exactly +40% stays "above" (worth watching).
export const FAR_ABOVE_THRESHOLD = 0.4;
// Absorbs floating point error so an exact ±15% (e.g. 34.5 against a mean of 30) stays normal.
const EPSILON = 1e-9;

export type UsageStatus = "above" | "below" | "normal";

export type UsageInsightView =
  | { kind: "insufficient"; status: Status; reason: string }
  | {
      kind: "insight";
      status: Status;
      dayLabel: string;
      isYesterday: boolean;
      load: { kwhLabel: string; deltaLabel: string; status: UsageStatus };
      purchase: { kwhLabel: string; deltaLabel: string };
      baseline: { kind: "seasonal" | "fallback"; days: number; periodLabel: string };
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

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function statusOf(load: number, baseline: number): UsageStatus {
  if (load > baseline * (1 + STATUS_THRESHOLD) + EPSILON) return "above";
  if (load < baseline * (1 - STATUS_THRESHOLD) - EPSILON) return "below";
  return "normal";
}

// The owner's rule: normal or below is good, above is worth watching, far above is a problem.
function loadStatus(load: number, baseline: number | null): Status {
  const status = baseline === null || baseline === 0 ? "normal" : statusOf(load, baseline);
  if (status === "normal") return { tone: "good", label: "w normie" };
  if (status === "below") return { tone: "good", label: "poniżej normy" };
  if (baseline !== null && load > baseline * (1 + FAR_ABOVE_THRESHOLD) + EPSILON) {
    return { tone: "problem", label: "dużo powyżej normy" };
  }
  return { tone: "watch", label: "powyżej normy" };
}

function insufficient(reason: string): UsageInsightView {
  return { kind: "insufficient", status: { tone: "insufficient", label: "" }, reason };
}

// "+12%", "−8%" (minus sign), "0%"; MISSING without a usable baseline.
function deltaLabel(value: number | null, baseline: number | null): string {
  if (value === null || baseline === null || baseline === 0) return MISSING;
  const raw = (value / baseline - 1) * 100;
  // Round half away from zero, symmetric for increases and decreases.
  const percent = Math.sign(raw) * Math.round(Math.abs(raw) + EPSILON);
  if (percent === 0) return "0%";
  const sign = percent > 0 ? "+" : "−";
  const threshold = STATUS_THRESHOLD * 100;
  if (Math.abs(percent) !== threshold) return `${sign}${String(Math.abs(percent))}%`;
  // At the threshold a whole percent could read "+15%" next to either status, so show one decimal: exactly ±15%
  // is "15,0%" (normal) and anything past it at least "15,1%", decided by the same rule as the status.
  const tenths = Math.round(Math.abs(raw) * 10 + EPSILON) / 10;
  const shown =
    statusOf(value, baseline) === "normal" ? Math.min(tenths, threshold) : Math.max(tenths, threshold + 0.1);
  return `${sign}${oneDecimal.format(shown)}%`;
}

export function toUsageInsightView(rows: DailyEnergyRow[], now: Date): UsageInsightView {
  const today = warsawParts(now).dayKey;
  const yesterday = addDays(today, -1);

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
    return insufficient(`brak zużycia z ostatnich ${String(LOOKBACK_DAYS)} dni`);
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

  let baselineKind: "seasonal" | "fallback";
  let baselineDays: string[];
  if (seasonal.length >= MIN_SEASONAL_DAYS) {
    baselineKind = "seasonal";
    baselineDays = seasonal;
  } else {
    baselineKind = "fallback";
    baselineDays = [];
    for (let offset = 1; offset <= FALLBACK_DAYS; offset++) {
      const key = addDays(compared, -offset);
      if (days.has(key)) baselineDays.push(key);
    }
    if (baselineDays.length < MIN_FALLBACK_DAYS) {
      return insufficient(
        `potrzeba co najmniej ${String(MIN_FALLBACK_DAYS)} dni z ostatnich ${String(FALLBACK_DAYS)}, jest ${String(baselineDays.length)}`,
      );
    }
  }

  const baseline = baselineDays.map((key) => days.get(key)).filter((d): d is Day => d !== undefined);
  const loadMean = mean(baseline.map((d) => d.load));
  const purchaseMean = mean(baseline.map((d) => d.purchase).filter((p): p is number => p !== null));

  return {
    kind: "insight",
    status: loadStatus(comparedDay.load, loadMean),
    dayLabel: formatDayMonth(compared),
    isYesterday: compared === yesterday,
    load: {
      kwhLabel: kwhLabel(comparedDay.load),
      deltaLabel: deltaLabel(comparedDay.load, loadMean),
      status: loadMean === null || loadMean === 0 ? "normal" : statusOf(comparedDay.load, loadMean),
    },
    purchase: {
      kwhLabel: kwhLabel(comparedDay.purchase),
      deltaLabel: deltaLabel(comparedDay.purchase, purchaseMean),
    },
    baseline: {
      kind: baselineKind,
      days: baseline.length,
      periodLabel: formatPeriod(baselineDays, today.slice(0, 4)).label,
    },
  };
}
