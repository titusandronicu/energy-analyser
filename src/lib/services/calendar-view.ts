import type { DailyEnergyRow, RecommendationRow } from "@/types";
import {
  HISTORY_START,
  monthGrid,
  periodBounds,
  periodDays,
  periodLabel,
  quarterMonths,
  type CalendarPeriod,
  type Quarter,
} from "@/lib/calendar/period";
import type { MonthGroup } from "@/lib/bars";
import { formatPeriod } from "@/lib/format/period";
import { kwhLabel } from "@/lib/format/values";
import { formatDayMonth, formatMonth, warsawHour, warsawParts } from "@/lib/format/warsaw-time";
import { dailySeries, type DailySeries } from "@/lib/services/daily-series";
import { MIN_RANKED_DAYS } from "@/lib/services/hourly-usage";
import { FORECAST_HISTORY_START, toRecommendationView, type RecommendationView } from "@/lib/services/recommendation";

// View models for the history calendar (S-15): every figure, status and sentence of the day, month and quarter views
// is decided here, so the components only render. Totals rest on complete days only and are never extrapolated.

// A day's advice is the first recommendation generated at or after this Warsaw hour.
export const MORNING_HOUR = 6;

export const NO_DAY_DATA = "brak danych z tego dnia";
export const INCOMPLETE_DAY = "dane z tego dnia są niepełne";
export const FORECAST_NOT_COLLECTED = "prognoza nie była jeszcze zbierana";
export const NO_FORECAST = "brak prognozy";
export const FORECAST_TOO_FEW = `za mało danych — prognozy zbierane od ${formatDayMonth(FORECAST_HISTORY_START)}`;
export const MARKERS_INCOMPLETE = "znaczniki rekomendacji mogą być niepełne";
export const BEFORE_MORNING = "wygenerowana przed 6:00";
export const NO_RECOMMENDATION = "brak rekomendacji z tego dnia";
export const BEFORE_HISTORY = "brak danych";
// The month or quarter that holds HISTORY_START says its earlier days were never collected, since its day count
// still covers the whole calendar period.
export const HISTORY_START_NOTE = `Dane od ${formatDayMonth(HISTORY_START)} ${HISTORY_START.slice(0, 4)} — wcześniejszych dni aplikacja nie ma`;

// complete: before today with PV, house use and grid import all present; empty: a row with a total missing;
// missing: no row. Today and later days are never complete, whatever their row holds.
export type DayStatus = "complete" | "empty" | "missing" | "today" | "future";

export interface DayCell {
  day: string;
  status: DayStatus;
  hasRecommendation: boolean;
}

// The word each day status reads as in the month grid and its legend.
export const DAY_STATUS_WORD: Record<DayStatus, string> = {
  complete: "dane pełne",
  empty: "dane niepełne",
  missing: "brak danych",
  today: "dziś, dzień jeszcze trwa",
  future: "jeszcze nie nadszedł",
};
export const BEFORE_HISTORY_WORD = "przed początkiem historii";
export const HAS_RECOMMENDATION_WORD = "jest rekomendacja";

// The word for a grid day; a day before HISTORY_START is not "missing" data but outside the history.
export function dayCellWord(cell: DayCell): string {
  return cell.day < HISTORY_START ? BEFORE_HISTORY_WORD : DAY_STATUS_WORD[cell.status];
}

// The grid day's accessible name: "14 września, dane pełne, jest rekomendacja".
export function dayCellName(cell: DayCell): string {
  const parts = [formatDayMonth(cell.day), dayCellWord(cell)];
  if (cell.hasRecommendation) parts.push(HAS_RECOMMENDATION_WORD);
  return parts.join(", ");
}

// The badge text of a total: "Pełne dane: 18 z 30 dni".
export function completeDaysText(completeDays: number, calendarDays: number): string {
  return `Pełne dane: ${String(completeDays)} z ${String(calendarDays)} dni`;
}

// How far the forecast comparison is from its minimum: "3 z 7 potrzebnych dni z prognozą".
export function forecastDaysText(days: number, needed: number): string {
  return `${String(days)} z ${String(needed)} potrzebnych dni z prognozą`;
}

export interface EnergyTotals {
  pvKwh: number;
  loadKwh: number;
  importKwh: number;
  pvLabel: string;
  loadLabel: string;
  importLabel: string;
}

// Sums over the period's complete days, or "za mało danych" below MIN_RANKED_DAYS of them. `calendarDays` is the
// period's length, for "z 18 z 30 dni"; `unfinished` is true while the period still runs (it ends today or later).
export type PeriodTotals =
  | {
      kind: "totals";
      totals: EnergyTotals;
      completeDays: number;
      calendarDays: number;
      // formatPeriod over the complete days: "18 dni: 1–29 września".
      periodLabel: string;
      unfinished: boolean;
    }
  | {
      kind: "insufficient";
      completeDays: number;
      needed: number;
      calendarDays: number;
      unfinished: boolean;
      reason: string;
    };

// Forecast against actual PV over complete days on or after FORECAST_HISTORY_START that carry a forecast.
export type ForecastComparison =
  | {
      kind: "comparison";
      forecastKwh: number;
      actualKwh: number;
      forecastLabel: string;
      actualLabel: string;
      days: number;
      periodLabel: string;
    }
  | { kind: "insufficient"; days: number; needed: number; reason: string };

// Slots reserved for S-17 (rating), S-19 (note) and S-18 (lab summary); empty until those slices fill them.
interface ReservedSlots {
  rating: null;
  note: null;
  summary: null;
}

export interface MonthView extends ReservedSlots {
  kind: "month";
  month: string;
  label: string;
  totals: PeriodTotals;
  unfinishedNote: string | null;
  // HISTORY_START_NOTE for the month that holds HISTORY_START, else null.
  startNote: string | null;
  // Monday-first weeks; null pads the days before the 1st and after the last day.
  grid: (DayCell | null)[][];
  // One slot per calendar day of the month; today and later days are gaps.
  series: { pv: DailySeries; load: DailySeries; import: DailySeries };
  forecast: ForecastComparison;
  // Set when the generation times were cut at the row limit.
  markersNote: string | null;
}

export type QuarterMonth =
  | { kind: "before-history"; month: string; label: string; reason: string }
  | { kind: "month"; month: string; label: string; totals: PeriodTotals };

export interface QuarterView extends ReservedSlots {
  kind: "quarter";
  year: number;
  quarter: Quarter;
  label: string;
  months: QuarterMonth[];
  // Over the complete days of all three months.
  totals: PeriodTotals;
  unfinishedNote: string | null;
  // HISTORY_START_NOTE for the quarter that holds HISTORY_START, else null.
  startNote: string | null;
}

export type DayTotals =
  // `running` for today: the figures so far, any of them possibly missing.
  | {
      kind: "totals";
      running: boolean;
      pvKwh: number | null;
      loadKwh: number | null;
      importKwh: number | null;
      pvLabel: string;
      loadLabel: string;
      importLabel: string;
    }
  | { kind: "none"; reason: string };

export type DayForecast =
  | {
      kind: "comparison";
      running: boolean;
      forecastKwh: number;
      actualKwh: number | null;
      forecastLabel: string;
      actualLabel: string;
    }
  | { kind: "none"; reason: string };

export type RecommendationEntry = Extract<RecommendationView, { kind: "recommendation" }>;

export type DayAdvice =
  | {
      kind: "advice";
      // The morning recommendation, or the day's first when all came before MORNING_HOUR (then `mainNote` says so).
      main: RecommendationEntry;
      mainNote: string | null;
      // The rest of the day's recommendations, oldest first.
      others: RecommendationEntry[];
    }
  | { kind: "none"; reason: string };

export interface DayView extends ReservedSlots {
  kind: "day";
  day: string;
  label: string;
  // Today: the day is still going and its figures are running totals.
  inProgress: boolean;
  totals: DayTotals;
  forecast: DayForecast;
  advice: DayAdvice;
}

const RESERVED: ReservedSlots = { rating: null, note: null, summary: null };

// A usable daily total: finite and not negative (as dailySeries reads it), else null.
function kwh(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function isCompleteDay(row: DailyEnergyRow | undefined, today: string): boolean {
  if (row === undefined || row.day >= today) return false;
  return kwh(row.pv_kwh) !== null && kwh(row.load_kwh) !== null && kwh(row.grid_import_kwh) !== null;
}

function byDay(rows: readonly DailyEnergyRow[]): Map<string, DailyEnergyRow> {
  return new Map(rows.map((row) => [row.day, row]));
}

function dayStatus(day: string, row: DailyEnergyRow | undefined, today: string): DayStatus {
  if (day === today) return "today";
  if (day > today) return "future";
  if (row === undefined) return "missing";
  return isCompleteDay(row, today) ? "complete" : "empty";
}

function energyTotals(rows: DailyEnergyRow[]): EnergyTotals {
  const sum = (field: "pv_kwh" | "load_kwh" | "grid_import_kwh") =>
    rows.reduce((total, row) => total + (kwh(row[field]) ?? 0), 0);
  const pvKwh = sum("pv_kwh");
  const loadKwh = sum("load_kwh");
  const importKwh = sum("grid_import_kwh");
  return {
    pvKwh,
    loadKwh,
    importKwh,
    pvLabel: kwhLabel(pvKwh),
    loadLabel: kwhLabel(loadKwh),
    importLabel: kwhLabel(importKwh),
  };
}

function tooFew(have: number): string {
  return `za mało danych: ${String(have)} z ${String(MIN_RANKED_DAYS)} potrzebnych pełnych dni`;
}

function periodTotals(days: string[], rows: Map<string, DailyEnergyRow>, today: string): PeriodTotals {
  const complete = days.map((day) => rows.get(day)).filter((row): row is DailyEnergyRow => isCompleteDay(row, today));
  const calendarDays = days.length;
  const unfinished = days[days.length - 1] >= today;
  if (complete.length < MIN_RANKED_DAYS) {
    return {
      kind: "insufficient",
      completeDays: complete.length,
      needed: MIN_RANKED_DAYS,
      calendarDays,
      unfinished,
      reason: tooFew(complete.length),
    };
  }
  return {
    kind: "totals",
    totals: energyTotals(complete),
    completeDays: complete.length,
    calendarDays,
    periodLabel: formatPeriod(
      complete.map((row) => row.day),
      today.slice(0, 4),
    ).label,
    unfinished,
  };
}

function forecastComparison(days: string[], rows: Map<string, DailyEnergyRow>, today: string): ForecastComparison {
  const pairs: { day: string; forecast: number; actual: number }[] = [];
  for (const day of days) {
    const row = rows.get(day);
    if (day < FORECAST_HISTORY_START || !isCompleteDay(row, today)) continue;
    const forecast = kwh(row?.pv_forecast_kwh);
    const actual = kwh(row?.pv_kwh);
    if (forecast !== null && actual !== null) pairs.push({ day, forecast, actual });
  }
  if (pairs.length < MIN_RANKED_DAYS) {
    return { kind: "insufficient", days: pairs.length, needed: MIN_RANKED_DAYS, reason: FORECAST_TOO_FEW };
  }
  const forecastKwh = pairs.reduce((total, p) => total + p.forecast, 0);
  const actualKwh = pairs.reduce((total, p) => total + p.actual, 0);
  return {
    kind: "comparison",
    forecastKwh,
    actualKwh,
    forecastLabel: kwhLabel(forecastKwh),
    actualLabel: kwhLabel(actualKwh),
    days: pairs.length,
    periodLabel: formatPeriod(
      pairs.map((p) => p.day),
      today.slice(0, 4),
    ).label,
  };
}

function unfinishedNote(totals: PeriodTotals, what: string): string | null {
  return totals.unfinished ? `${what} jeszcze trwa — liczą się tylko pełne dni, bez szacowania całości` : null;
}

function startNote(p: CalendarPeriod): string | null {
  const { first, last } = periodBounds(p);
  return first < HISTORY_START && HISTORY_START <= last ? HISTORY_START_NOTE : null;
}

export function buildMonthView(
  month: string,
  rows: readonly DailyEnergyRow[],
  recTimes: { times: readonly string[]; truncated: boolean },
  today: string,
): MonthView {
  const period: CalendarPeriod = { kind: "month", month };
  const days = periodDays(period);
  const { last } = periodBounds(period);
  const monthRows = byDay(rows.filter((row) => days.includes(row.day)));
  const recommendationDays = new Set(recTimes.times.map((time) => warsawParts(new Date(time)).dayKey));
  const totals = periodTotals(days, monthRows, today);

  // dailySeries keeps any row inside the window, so today's partial row and later rows are dropped first.
  const past = [...monthRows.values()].filter((row) => row.day < today);

  return {
    kind: "month",
    month,
    label: periodLabel(period),
    totals,
    unfinishedNote: unfinishedNote(totals, "Miesiąc"),
    startNote: startNote(period),
    grid: monthGrid(month).map((week) =>
      week.map((day) =>
        day === null
          ? null
          : { day, status: dayStatus(day, monthRows.get(day), today), hasRecommendation: recommendationDays.has(day) },
      ),
    ),
    series: {
      pv: dailySeries(past, "pv_kwh", last, days.length),
      load: dailySeries(past, "load_kwh", last, days.length),
      import: dailySeries(past, "grid_import_kwh", last, days.length),
    },
    forecast: forecastComparison(days, monthRows, today),
    markersNote: recTimes.truncated ? MARKERS_INCOMPLETE : null,
    ...RESERVED,
  };
}

export function buildQuarterView(
  year: number,
  quarter: Quarter,
  rows: readonly DailyEnergyRow[],
  today: string,
): QuarterView {
  const period: CalendarPeriod = { kind: "quarter", year, quarter };
  const days = periodDays(period);
  const quarterRows = byDay(rows.filter((row) => days.includes(row.day)));
  const months: QuarterMonth[] = quarterMonths(year, quarter).map((month) => {
    const monthPeriod: CalendarPeriod = { kind: "month", month };
    const label = formatMonth(month);
    if (periodBounds(monthPeriod).last < HISTORY_START) {
      return { kind: "before-history", month, label, reason: BEFORE_HISTORY };
    }
    return { kind: "month", month, label, totals: periodTotals(periodDays(monthPeriod), quarterRows, today) };
  });
  const totals = periodTotals(days, quarterRows, today);

  return {
    kind: "quarter",
    year,
    quarter,
    label: periodLabel(period),
    months,
    totals,
    unfinishedNote: unfinishedNote(totals, "Kwartał"),
    startNote: startNote(period),
    ...RESERVED,
  };
}

// The quarter's months for the grouped chart: a month without totals (before the history or under the minimum) is a
// gap, never zero bars.
export function quarterChartMonths(view: QuarterView): MonthGroup[] {
  return view.months.map((month) => {
    const calendarDays = periodDays({ kind: "month", month: month.month }).length;
    if (month.kind === "before-history") {
      return { label: month.label, pv: null, load: null, import: null, completeDays: 0, calendarDays };
    }
    const { totals } = month;
    return totals.kind === "totals"
      ? {
          label: month.label,
          pv: totals.totals.pvKwh,
          load: totals.totals.loadKwh,
          import: totals.totals.importKwh,
          completeDays: totals.completeDays,
          calendarDays,
        }
      : { label: month.label, pv: null, load: null, import: null, completeDays: totals.completeDays, calendarDays };
  });
}

function dayTotals(day: string, row: DailyEnergyRow | undefined, today: string): DayTotals {
  if (row === undefined || day > today) return { kind: "none", reason: NO_DAY_DATA };
  const running = day === today;
  if (!running && !isCompleteDay(row, today)) return { kind: "none", reason: INCOMPLETE_DAY };
  const pvKwh = kwh(row.pv_kwh);
  const loadKwh = kwh(row.load_kwh);
  const importKwh = kwh(row.grid_import_kwh);
  return {
    kind: "totals",
    running,
    pvKwh,
    loadKwh,
    importKwh,
    pvLabel: kwhLabel(pvKwh),
    loadLabel: kwhLabel(loadKwh),
    importLabel: kwhLabel(importKwh),
  };
}

function dayForecast(day: string, row: DailyEnergyRow | undefined, today: string): DayForecast {
  if (day < FORECAST_HISTORY_START) return { kind: "none", reason: FORECAST_NOT_COLLECTED };
  const forecastKwh = kwh(row?.pv_forecast_kwh);
  if (forecastKwh === null || day > today) return { kind: "none", reason: NO_FORECAST };
  const actualKwh = kwh(row?.pv_kwh);
  return {
    kind: "comparison",
    running: day === today,
    forecastKwh,
    actualKwh,
    forecastLabel: kwhLabel(forecastKwh),
    actualLabel: kwhLabel(actualKwh),
  };
}

function historicalEntry(row: RecommendationRow, now: Date): RecommendationEntry {
  const view = toRecommendationView(row, now, { historical: true });
  // A row always maps to a recommendation; only a missing row gives the empty state.
  if (view.kind !== "recommendation") throw new Error("expected a recommendation view");
  return view;
}

function dayAdvice(day: string, recs: readonly RecommendationRow[], now: Date): DayAdvice {
  const ofDay = recs
    .map((row) => ({ row, ms: Date.parse(row.generated_at) }))
    .filter(({ ms }) => Number.isFinite(ms) && warsawHour(ms).dayKey === day)
    .sort((a, b) => a.ms - b.ms);
  if (ofDay.length === 0) return { kind: "none", reason: NO_RECOMMENDATION };
  const morningIndex = ofDay.findIndex(({ ms }) => warsawHour(ms).hour >= MORNING_HOUR);
  const mainIndex = morningIndex === -1 ? 0 : morningIndex;
  return {
    kind: "advice",
    main: historicalEntry(ofDay[mainIndex].row, now),
    mainNote: morningIndex === -1 ? BEFORE_MORNING : null,
    others: ofDay.filter((_, index) => index !== mainIndex).map(({ row }) => historicalEntry(row, now)),
  };
}

export function buildDayView(
  day: string,
  row: DailyEnergyRow | null,
  recs: readonly RecommendationRow[],
  today: string,
  now: Date,
): DayView {
  const dayRow = row !== null && row.day === day ? row : undefined;
  return {
    kind: "day",
    day,
    label: periodLabel({ kind: "day", day }),
    inProgress: day === today,
    totals: dayTotals(day, dayRow, today),
    forecast: dayForecast(day, dayRow, today),
    advice: dayAdvice(day, recs, now),
    ...RESERVED,
  };
}
