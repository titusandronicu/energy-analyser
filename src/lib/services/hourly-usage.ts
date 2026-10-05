import type { SupabaseClient } from "@supabase/supabase-js";
import type { HourlyEnergyRow } from "@/types";
import { formatPeriod } from "@/lib/format/period";
import type { Status } from "@/lib/format/status";
import { asNumber, kwhLabel } from "@/lib/format/values";
import {
  addDays,
  formatDayMonth,
  formatWeekday,
  HOUR_MS,
  warsawDayHours,
  warsawHour,
  warsawParts,
} from "@/lib/format/warsaw-time";
import { queryError } from "@/lib/query-error";

// The app keeps 35 days of hourly figures (ingest_push prunes older hours); the card reads the same span.
export const HOURLY_HISTORY_DAYS = 35;
// A full hour rests on 12 five-minute readings; with 10 or more it is complete. Fewer is a gap in the lab's history
// and the hour is left out of every figure.
export const MIN_HOUR_SAMPLES = 10;
// Day rankings need at least this many complete days; below it the card says "za mało dni".
export const MIN_RANKED_DAYS = 7;
// Hour rankings need at least one complete day, so they never rest on a few stray hours; without one the card says
// "za mało danych: brak pełnego dnia".
export const MIN_RANKED_HOUR_DAYS = 1;
export const RANKED_HOURS = 5;
export const RANKED_DAYS = 3;
// A night runs from 22:00 local time to 06:00 the next day.
export const NIGHT_START_HOUR = 22;
export const NIGHT_END_HOUR = 6;
// "Last night" is the most recent complete night among this many most recent nights that have ended.
export const LAST_NIGHT_LOOKBACK = 3;

export const NO_HOURLY_DATA = "brak danych godzinowych";
export const INCOMPLETE_NIGHTS = "niepełne dane za ostatnie noce";
export const NO_COMPLETE_DAY = "za mało danych: brak pełnego dnia";

export interface RankedHour {
  hourStart: string;
  dayKey: string;
  dayLabel: string;
  weekday: string;
  // "20:00–21:00"; both hours of the autumn change read "02:00–03:00".
  hourLabel: string;
  loadKwh: number;
  loadLabel: string;
  gridDrawKwh: number;
  gridDrawLabel: string;
}

export interface RankedDay {
  dayKey: string;
  dayLabel: string;
  weekday: string;
  loadKwh: number;
  loadLabel: string;
}

export type Ranking<T> =
  | { kind: "ranked"; highest: T[]; lowest: T[] }
  // "za mało dni: 4 z 7"; `completeDays` is the count the card may show on its own.
  | { kind: "insufficient"; reason: string; completeDays: number };

export type LastNight =
  { complete: true; label: string; gridDrawKwh: number; gridDrawLabel: string } | { complete: false; reason: string };

export type HourlyUsageView =
  | { kind: "empty"; status: Status; reason: string }
  | {
      kind: "usage";
      lastNight: LastNight;
      // Over every complete night in the window; null when there is none.
      nightAverage: { gridDrawKwh: number; gridDrawLabel: string; nights: number } | null;
      hours: Ranking<RankedHour>;
      days: Ranking<RankedDay>;
      window: {
        // The days the complete hours come from: "30 dni: 1–30 sierpnia".
        label: string;
        completeDays: number;
        completenessRule: string;
      };
    };

// The instant the window starts: Warsaw midnight HOURLY_HISTORY_DAYS days before today.
function windowStartMs(now: Date): number {
  return warsawDayHours(addDays(warsawParts(now).dayKey, -HOURLY_HISTORY_DAYS))[0].startMs;
}

// Hourly totals for the last HOURLY_HISTORY_DAYS Warsaw days, newest first; RLS returns nothing for non-owners. At
// most 36 × 25 = 900 rows, under PostgREST's default row cap. The read stops at `now`: the contract accepts any whole
// hour, so a bad future row would otherwise sort first and could push real hours past the cap. Errors are thrown so
// the page can show a load failure instead of pretending there is no history.
export async function loadHourlyEnergy(client: SupabaseClient, now: Date = new Date()): Promise<HourlyEnergyRow[]> {
  const since = new Date(windowStartMs(now)).toISOString();
  const { data, error } = await client
    .from("hourly_energy")
    .select("hour_start, load_kwh, grid_net_kwh, pv_kwh, samples")
    .gte("hour_start", since)
    .lt("hour_start", now.toISOString())
    .order("hour_start", { ascending: false })
    .overrideTypes<HourlyEnergyRow[], { merge: false }>();
  if (error) throw queryError("loading hourly energy failed", error);
  return data;
}

interface Hour {
  startMs: number;
  dayKey: string;
  hour: number;
  load: number;
  // max(grid_net_kwh, 0): the hour's net import, what PGE bills after hourly balancing.
  gridDraw: number;
}

// Complete when it rests on MIN_HOUR_SAMPLES or more readings and carries both house use and net grid; an hour
// without either value cannot be ranked or summed, so it counts as a gap too.
function completeHour(row: HourlyEnergyRow): Hour | null {
  const startMs = Date.parse(row.hour_start);
  const load = asNumber(row.load_kwh);
  const net = asNumber(row.grid_net_kwh);
  if (!Number.isFinite(startMs) || load === null || net === null) return null;
  if (typeof row.samples !== "number" || row.samples < MIN_HOUR_SAMPLES) return null;
  const { dayKey, hour } = warsawHour(startMs);
  return { startMs, dayKey, hour, load, gridDraw: Math.max(net, 0) };
}

// "20:00–21:00".
function hourLabel(hour: number): string {
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return `${pad(hour)}–${pad((hour + 1) % 24)}`;
}

// "noc z 1 na 2 sierpnia", "noc z 31 lipca na 1 sierpnia": the night starting on `dayKey`.
export function nightName(dayKey: string): string {
  const next = addDays(dayKey, 1);
  const from = dayKey.slice(0, 7) === next.slice(0, 7) ? String(Number(dayKey.slice(8))) : formatDayMonth(dayKey);
  return `noc z ${from} na ${formatDayMonth(next)}`;
}

// The clock hours of the night starting on `dayKey`: 22:00 and 23:00 of that day, 00:00–05:00 of the next. That is
// 8 hours, 7 across the spring change and 9 across the autumn change.
function nightHourStarts(dayKey: string): number[] {
  const evening = warsawDayHours(dayKey).filter((h) => h.hour >= NIGHT_START_HOUR);
  const morning = warsawDayHours(addDays(dayKey, 1)).filter((h) => h.hour < NIGHT_END_HOUR);
  return [...evening, ...morning].map((h) => h.startMs);
}

// The night's grid draw when all its hours are complete, else null. Export in a night hour is not subtracted.
function nightDraw(dayKey: string, hours: Map<number, Hour>): number | null {
  let sum = 0;
  for (const ms of nightHourStarts(dayKey)) {
    const hour = hours.get(ms);
    if (hour === undefined) return null;
    sum += hour.gridDraw;
  }
  return sum;
}

// Grid draw above house use by more than this marks an hour's house use as suspect for the lowest list. Found in
// production on 2026-09-30: 7 of 547 complete hours showed ~0.2 kWh of house use against ~1.9 kWh from the grid at
// night, where a normal night hour uses ~1.0 kWh.
export const SUSPECT_GRID_MARGIN_KWH = 0.5;

export function isSuspectLowHour(hour: { loadKwh: number; gridDrawKwh: number }): boolean {
  return hour.gridDrawKwh - hour.loadKwh > SUSPECT_GRID_MARGIN_KWH;
}

// Highest first; the more recent wins a tie. Lowest first; the more recent also wins a tie.
function rank<T>(items: T[], value: (item: T) => number, recency: (item: T) => number | string, count: number) {
  const byRecency = (a: T, b: T) => {
    const ra = recency(a);
    const rb = recency(b);
    return ra === rb ? 0 : ra < rb ? 1 : -1;
  };
  const highest = [...items].sort((a, b) => value(b) - value(a) || byRecency(a, b)).slice(0, count);
  const lowest = [...items].sort((a, b) => value(a) - value(b) || byRecency(a, b)).slice(0, count);
  return { highest, lowest };
}

function tooFewDays(completeDays: number, needed: number) {
  return {
    kind: "insufficient" as const,
    reason: `za mało dni: ${String(completeDays)} z ${String(needed)}`,
    completeDays,
  };
}

function empty(reason: string): HourlyUsageView {
  return { kind: "empty", status: { tone: "insufficient", label: "" }, reason };
}

export function toHourlyUsageView(rows: HourlyEnergyRow[], now: Date): HourlyUsageView {
  const nowMs = now.getTime();
  const fromMs = windowStartMs(now);

  // Complete hours in the window that have ended, keyed by their UTC start.
  const hours = new Map<number, Hour>();
  let anyRow = false;
  for (const row of rows) {
    const startMs = Date.parse(row.hour_start);
    if (!(startMs >= fromMs && startMs + HOUR_MS <= nowMs)) continue;
    anyRow = true;
    const hour = completeHour(row);
    if (hour !== null) hours.set(hour.startMs, hour);
  }
  if (!anyRow) return empty(NO_HOURLY_DATA);
  if (hours.size === 0) {
    return empty(`${NO_HOURLY_DATA}: żadna godzina nie ma co najmniej ${String(MIN_HOUR_SAMPLES)} z 12 odczytów`);
  }

  // Complete days: every clock hour of the Warsaw date present and complete (23, 24 or 25 hours).
  const dayKeys = [...new Set([...hours.values()].map((h) => h.dayKey))].sort();
  const completeDays: RankedDay[] = [];
  for (const dayKey of dayKeys) {
    let load = 0;
    let complete = true;
    for (const { startMs } of warsawDayHours(dayKey)) {
      const hour = hours.get(startMs);
      if (hour === undefined) {
        complete = false;
        break;
      }
      load += hour.load;
    }
    if (complete) {
      completeDays.push({
        dayKey,
        dayLabel: formatDayMonth(dayKey),
        weekday: formatWeekday(dayKey),
        loadKwh: load,
        loadLabel: kwhLabel(load),
      });
    }
  }

  // Nights: every night that has ended and touches a complete hour; complete when all its hours are.
  const nightKeys = new Set<string>();
  for (const h of hours.values()) {
    if (h.hour >= NIGHT_START_HOUR) nightKeys.add(h.dayKey);
    else if (h.hour < NIGHT_END_HOUR) nightKeys.add(addDays(h.dayKey, -1));
  }
  const nightDraws = new Map<string, number>();
  for (const dayKey of nightKeys) {
    const starts = nightHourStarts(dayKey);
    if (starts[starts.length - 1] + HOUR_MS > nowMs) continue;
    const draw = nightDraw(dayKey, hours);
    if (draw !== null) nightDraws.set(dayKey, draw);
  }

  // The most recent night that has ended starts yesterday (after 06:00 today) or the day before.
  const today = warsawParts(now).dayKey;
  const newestNight = nightHourStarts(addDays(today, -1)).every((ms) => ms + HOUR_MS <= nowMs)
    ? addDays(today, -1)
    : addDays(today, -2);
  let lastNight: LastNight = { complete: false, reason: INCOMPLETE_NIGHTS };
  for (let offset = 0; offset < LAST_NIGHT_LOOKBACK; offset++) {
    const dayKey = addDays(newestNight, -offset);
    const draw = nightDraws.get(dayKey);
    if (draw !== undefined) {
      lastNight = { complete: true, label: nightName(dayKey), gridDrawKwh: draw, gridDrawLabel: kwhLabel(draw) };
      break;
    }
  }

  const draws = [...nightDraws.values()];
  const average = draws.length === 0 ? null : draws.reduce((a, b) => a + b, 0) / draws.length;

  const rankedHours: RankedHour[] = [...hours.values()].map((h) => ({
    hourStart: new Date(h.startMs).toISOString(),
    dayKey: h.dayKey,
    dayLabel: formatDayMonth(h.dayKey),
    weekday: formatWeekday(h.dayKey),
    hourLabel: hourLabel(h.hour),
    loadKwh: h.load,
    loadLabel: kwhLabel(h.load),
    gridDrawKwh: h.gridDraw,
    gridDrawLabel: kwhLabel(h.gridDraw),
  }));

  return {
    kind: "usage",
    lastNight,
    nightAverage:
      average === null ? null : { gridDrawKwh: average, gridDrawLabel: kwhLabel(average), nights: draws.length },
    hours:
      completeDays.length < MIN_RANKED_HOUR_DAYS
        ? { kind: "insufficient", reason: NO_COMPLETE_DAY, completeDays: completeDays.length }
        : {
            kind: "ranked",
            highest: rank(
              rankedHours,
              (h) => h.loadKwh,
              (h) => h.hourStart,
              RANKED_HOURS,
            ).highest,
            // An hour that drew from the grid far more than the house used is left out of the lowest list: its house
            // use is suspect (a load reading drop-out, or the battery charging from the grid), not a quiet hour.
            lowest: rank(
              rankedHours.filter((h) => !isSuspectLowHour(h)),
              (h) => h.loadKwh,
              (h) => h.hourStart,
              RANKED_HOURS,
            ).lowest,
          },
    days:
      completeDays.length < MIN_RANKED_DAYS
        ? tooFewDays(completeDays.length, MIN_RANKED_DAYS)
        : {
            kind: "ranked",
            ...rank(
              completeDays,
              (d) => d.loadKwh,
              (d) => d.dayKey,
              RANKED_DAYS,
            ),
          },
    window: {
      label: formatPeriod(dayKeys, today.slice(0, 4)).label,
      completeDays: completeDays.length,
      completenessRule: `Liczą się tylko pełne godziny (co najmniej ${String(MIN_HOUR_SAMPLES)} z 12 odczytów co 5 minut) i pełne dni (wszystkie godziny dnia pełne).`,
    },
  };
}
