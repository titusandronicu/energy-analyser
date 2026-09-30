import type { DailyEnergyRow, RecommendationRow } from "@/types";
import {
  addMonths,
  defaultMonth,
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
import type { Status } from "@/lib/format/status";
import { kwhLabel } from "@/lib/format/values";
import { formatDayMonth, formatMonth, warsawHour, warsawParts } from "@/lib/format/warsaw-time";
import { isCompleteDay, kwh } from "@/lib/services/complete-day";
import { dailySeries, type DailySeries } from "@/lib/services/daily-series";
import { MIN_RANKED_DAYS } from "@/lib/services/hourly-usage";
import {
  DAY_NO_USE,
  LOW_SUN_SHARE,
  MONTH_RUNNING,
  notRated,
  RATING_MIN_DAYS,
  RATING_THRESHOLD_POINTS,
  RATING_WINDOW_DAYS,
  rateDay,
  rateMonth,
  rowsNeededFrom,
  type PeriodRating,
} from "@/lib/services/period-rating";
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

// The first Warsaw day the inverter over-reports grid import (most likely a current-sensor fault, docs/logic.md).
export const GRID_IMPORT_OVERSTATED_FROM = "2026-08-04";

// "4 sierpnia 2026".
function dayMonthYear(day: string): string {
  return `${formatDayMonth(day)} ${day.slice(0, 4)}`;
}

const GRID_IMPORT_OVERSTATED = `Prąd kupiony z sieci jest od ${formatDayMonth(GRID_IMPORT_OVERSTATED_FROM)} zawyżony`;

// The caption under the month's daily charts.
export const MONTH_CHART_NOTE = `Dni bez danych zostają puste, a dzisiejszy dzień nie jest rysowany, bo jeszcze trwa. ${GRID_IMPORT_OVERSTATED} (zobacz „Co to znaczy?”).`;
// The caption under the quarter's grouped chart.
export const QUARTER_CHART_NOTE = `Miesiąc z mniej niż ${String(MIN_RANKED_DAYS)} pełnymi dniami zostaje pusty. ${GRID_IMPORT_OVERSTATED}.`;

// The "Co to znaczy?" entries that state a rule's value.
export const TOO_FEW_EXPLANATION = `Gdy okres ma mniej niż ${String(MIN_RANKED_DAYS)} pełnych dni, sumy nie są pokazywane, bo mówiłyby więcej, niż wiadomo. Niedokończony miesiąc albo kwartał pokazuje to, co już jest, bez przeliczania na całość.`;
export const GRID_IMPORT_TERM = `Prąd kupiony z sieci od ${formatDayMonth(GRID_IMPORT_OVERSTATED_FROM)}`;
export const GRID_IMPORT_EXPLANATION = `Od ${dayMonthYear(GRID_IMPORT_OVERSTATED_FROM)} falownik pokazuje więcej prądu kupionego z sieci, niż naprawdę było, zwłaszcza w dzień. Najpewniej to sprawa czujnika prądu, do sprawdzenia na miejscu. Do tego czasu te liczby są zawyżone.`;
export const FORECAST_EXPLANATION = `Porównanie prognozy produkcji z tym, co panele naprawdę dały. Prognozy zapisujemy od ${dayMonthYear(FORECAST_HISTORY_START)}, więc wcześniejsze dni nie mają porównania.`;
// The "Co to znaczy?" entries for the day and month ratings (S-17), their numbers taken from the rating constants.
export const SELF_SUFFICIENCY_TERM = "Samowystarczalność";
export const SELF_SUFFICIENCY_EXPLANATION =
  "Jaka część zużycia domu nie była kupiona z sieci, tylko przyszła z paneli albo z baterii. 100% to dzień bez prądu z sieci, 0% to dzień, w którym cały prąd był kupiony.";
export const RATING_TERM = "Ocena dnia i miesiąca";
export const RATING_EXPLANATION = `Dzień jest porównywany z normą domu: medianą samowystarczalności z pełnych dni wśród ${String(RATING_WINDOW_DAYS)} dni przed nim. Norma potrzebuje co najmniej ${String(RATING_MIN_DAYS)} takich dni, inaczej dzień nie jest oceniany. Więcej niż ${String(RATING_THRESHOLD_POINTS)} punktów procentowych powyżej normy to dobry dzień, więcej niż ${String(RATING_THRESHOLD_POINTS)} poniżej to słaby, a wszystko pomiędzy to przeciętny. Zakończony miesiąc jest oceniany tak samo, po medianie odchyleń swoich ocenionych dni. Samowystarczalność idzie głównie za słońcem, więc słoneczne dni wypadają lepiej, a pochmurne gorzej; gdy panele dały mniej niż ${String(Math.round(LOW_SUN_SHARE * 100))}% tego, co zwykle, ocena mówi „Mało słońca”. Zawyżony od ${formatDayMonth(GRID_IMPORT_OVERSTATED_FROM)} prąd kupiony z sieci obniża samowystarczalność wszystkich dni podobnie, a dzień jest porównywany z dniami tuż przed nim, więc ocena mało się przez to zmienia. Dni, w których z sieci kupiono więcej, niż dom zużył (np. ładowanie baterii z sieci albo błąd licznika), są „Poza oceną”: nie są oceniane ani liczone do norm.`;

// A running month's rating slot still says why it is not rated, under the grey "Bez oceny" badge.
export const MONTH_NOT_RATED = `${MONTH_RUNNING} — oceniamy tylko zakończone miesiące`;

// The views' badges rate nothing, so they keep the neutral tone.
export const NEUTRAL: Status = { tone: "insufficient", label: "" };

// "brak danych" → "Brak danych", for badges and short labels.
export function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

// "brak danych" → "Brak danych.", for a view-model phrase shown as a sentence.
export function sentence(text: string): string {
  return `${capitalize(text)}.`;
}

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

// Slots reserved for S-19 (note) and S-18 (lab summary); empty until those slices fill them. The rating (S-17) is
// filled on the day and month views and stays null on the quarter.
interface ReservedSlots {
  note: null;
  summary: null;
}

export interface MonthView extends ReservedSlots {
  kind: "month";
  month: string;
  label: string;
  totals: PeriodTotals;
  // The completed month's rating; while the month runs, "none" with MONTH_NOT_RATED as the reason.
  rating: PeriodRating;
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
  // The quarter is not rated.
  rating: null;
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
  // The day's rating; null when there is nothing worth saying (today, the future, or a day whose missing or
  // incomplete data the totals already name).
  rating: PeriodRating | null;
}

const RESERVED: ReservedSlots = { note: null, summary: null };

// The month the calendar opens on without a period in the URL, from the rows of the current and the previous month
// (read together, so the chosen month needs no second read): defaultMonth over the current month's complete days.
export function defaultPeriodFromRows(rows: readonly DailyEnergyRow[], today: string): CalendarPeriod {
  const current = today.slice(0, 7);
  const complete = rows.filter((row) => row.day.startsWith(current) && isCompleteDay(row, today)).length;
  return { kind: "month", month: defaultMonth(today, complete) };
}

// The days defaultPeriodFromRows needs, the previous and the current month, reaching RATING_WINDOW_DAYS before the
// previous month (rowsNeededFrom) so whichever month it picks has its rating's norm days.
export function defaultPeriodRange(today: string): { first: string; last: string } {
  const current = today.slice(0, 7);
  return {
    first: rowsNeededFrom(`${addMonths(current, -1)}-01`),
    last: periodBounds({ kind: "month", month: current }).last,
  };
}

// The daily rows a day or month view reads: its own days plus the RATING_WINDOW_DAYS before them, for the rating.
// Totals, grid, charts and forecast still use only the period's own days.
export function ratedPeriodRange(p: CalendarPeriod): { first: string; last: string } {
  const { first, last } = periodBounds(p);
  return { first: rowsNeededFrom(first), last };
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

// The month's rating over all the rows read (they reach RATING_WINDOW_DAYS before the month); a running month says it
// is not rated yet.
function monthRating(month: string, rows: readonly DailyEnergyRow[], today: string): PeriodRating {
  const rating = rateMonth(month, rows, today);
  return rating.kind === "none" ? notRated(MONTH_NOT_RATED) : rating;
}

// The day's rating, or null when the view has nothing to add: today and later days are not over, and a missing or
// incomplete day already says so in its totals. A day with no house use says why it has no rating.
function dayRating(day: string, rows: readonly DailyEnergyRow[], today: string): PeriodRating | null {
  const rating = rateDay(day, rows, today);
  return rating.kind === "none" && rating.reason !== DAY_NO_USE ? null : rating;
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
    rating: monthRating(month, rows, today),
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
    rating: null,
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

// `rows` are the day's row and the RATING_WINDOW_DAYS before it (ratedPeriodRange); only the day's own row gives the
// totals and the forecast.
export function buildDayView(
  day: string,
  rows: readonly DailyEnergyRow[],
  recs: readonly RecommendationRow[],
  today: string,
  now: Date,
): DayView {
  const dayRow = rows.find((row) => row.day === day);
  return {
    kind: "day",
    day,
    label: periodLabel({ kind: "day", day }),
    inProgress: day === today,
    totals: dayTotals(day, dayRow, today),
    forecast: dayForecast(day, dayRow, today),
    advice: dayAdvice(day, recs, now),
    rating: dayRating(day, rows, today),
    ...RESERVED,
  };
}
