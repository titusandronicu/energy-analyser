import type { DailyEnergyRow } from "@/types";
import { periodDays } from "@/lib/calendar/period";
import { edgePointsLabel } from "@/lib/format/edge-percent";
import { formatPeriod } from "@/lib/format/period";
import type { StatusTone } from "@/lib/format/status";
import { kwhLabel, oneDecimal } from "@/lib/format/values";
import { addDays } from "@/lib/format/warsaw-time";
import { isCompleteDay } from "@/lib/services/calendar-view";
import { MIN_RANKED_DAYS } from "@/lib/services/hourly-usage";
import { median } from "@/lib/services/usage-insight";

// Ratings of a completed day and a completed month (S-17, FR-022): the period's self-sufficiency against the house's
// recent norm. Every number, word and sentence is decided here, so the components only render. A rating describes and
// never advises.

// The norm is the median of the qualifying days in the RATING_WINDOW_DAYS before the rated day, and needs at least
// RATING_MIN_DAYS of them.
export const RATING_WINDOW_DAYS = 14;
export const RATING_MIN_DAYS = MIN_RANKED_DAYS;
// A gap from the norm beyond this many percentage points is good or bad; exactly on it stays neutral.
export const RATING_THRESHOLD_POINTS = 10;
// A day whose PV is below this share of the norm days' median PV gets the low-sun note.
export const LOW_SUN_SHARE = 0.7;

// Absorbs floating point error so a gap of exactly ±10 points stays neutral.
const EPSILON = 1e-9;

export const DAY_RUNNING = "dzień jeszcze trwa";
export const DAY_FUTURE = "dzień jeszcze nie nadszedł";
export const DAY_NO_DATA = "brak danych z tego dnia";
export const DAY_INCOMPLETE = "dane z tego dnia są niepełne";
export const DAY_NO_USE = "dom nie zużył tego dnia prądu, więc nie ma czego oceniać";
export const INCONSISTENT_WORD = "dane niespójne";
export const MONTH_RUNNING = "miesiąc jeszcze trwa";

// The norm is always the recent one: same-season history does not exist yet.
const RECENT_NORM = "ostatnie dni, bo z tej pory roku jest za mało danych";

export type RatingBand = "good" | "neutral" | "bad";

const BAND_TONE: Record<RatingBand, StatusTone> = { good: "good", neutral: "insufficient", bad: "problem" };
const DAY_WORD: Record<RatingBand, string> = {
  good: "Dobry dzień",
  neutral: "Przeciętny dzień",
  bad: "Słaby dzień",
};
const MONTH_WORD: Record<RatingBand, string> = {
  good: "Dobry miesiąc",
  neutral: "Przeciętny miesiąc",
  bad: "Słaby miesiąc",
};

// The day's PV next to the norm days' median PV: "Mało słońca: 10,9 kWh z paneli, zwykle 23,4 kWh."
export interface LowSunNote {
  pvKwh: number;
  normPvKwh: number;
  text: string;
}

export type PeriodRating =
  | {
      kind: "rated";
      band: RatingBand;
      tone: StatusTone;
      // "Dobry dzień" / "Przeciętny miesiąc" …
      word: string;
      // The day's self-sufficiency and its norm in percent; null on a month, which is rated by its median gap.
      value: number | null;
      norm: number | null;
      // The gap in percentage points: value − norm on a day, the median of its days' gaps on a month.
      delta: number;
      // The days the rating rests on (the norm days of a day, the rated days of a month) and their formatPeriod label.
      days: number;
      periodLabel: string;
      basis: string;
      // Days only; null when the sun was not low, and always null on a month.
      lowSun: LowSunNote | null;
    }
  // Too few qualifying days: "za mało danych: 5 z 7".
  | { kind: "insufficient"; tone: StatusTone; word: string; days: number; needed: number; basis: string }
  // The day's grid import exceeds its use; it is not rated and never enters a norm.
  | { kind: "inconsistent"; tone: StatusTone; word: string; basis: string }
  // Not rated at all (today, the future, incomplete days, the current month); the reason says why.
  | { kind: "none"; reason: string };

// A usable daily total: finite and not negative, else null (as calendar-view reads it).
function kwh(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

// 1 − import ÷ use in percent, clamped to 0–100, for a complete day with use above 0; "inconsistent" when the import
// exceeds the use; otherwise null.
export function selfSufficiency(row: DailyEnergyRow | undefined, today: string): number | "inconsistent" | null {
  if (row === undefined || !isCompleteDay(row, today)) return null;
  const load = kwh(row.load_kwh);
  const imported = kwh(row.grid_import_kwh);
  if (load === null || imported === null || load <= 0) return null;
  if (imported > load) return "inconsistent";
  return Math.min(100, Math.max(0, 100 * (1 - imported / load)));
}

// The first day key to load so every day from `first` on has its full norm window.
export function rowsNeededFrom(first: string): string {
  return addDays(first, -RATING_WINDOW_DAYS);
}

function bandOf(delta: number): RatingBand {
  if (delta > RATING_THRESHOLD_POINTS + EPSILON) return "good";
  if (delta < -RATING_THRESHOLD_POINTS - EPSILON) return "bad";
  return "neutral";
}

// "27,4 punktu poniżej normy", "3,5 punktu powyżej normy", or "tyle, ile norma" when the gap rounds to zero.
function gapPhrase(delta: number, band: RatingBand): string {
  if (Math.round(Math.abs(delta) * 10 + EPSILON) === 0) return "tyle, ile norma";
  const points = edgePointsLabel(delta, RATING_THRESHOLD_POINTS, band === "neutral");
  return `${points} ${delta < 0 ? "poniżej" : "powyżej"} normy`;
}

function tooFew(have: number): string {
  return `za mało danych: ${String(have)} z ${String(RATING_MIN_DAYS)}`;
}

// "9 dni: 5–20 września" → "5–20 września", when the count is already said.
function rangeOf(periodLabel: string): string {
  return periodLabel.slice(periodLabel.indexOf(": ") + 2);
}

function byDay(rows: readonly DailyEnergyRow[]): Map<string, DailyEnergyRow> {
  return new Map(rows.map((row) => [row.day, row]));
}

function rateDayIn(day: string, rows: Map<string, DailyEnergyRow>, today: string): PeriodRating {
  if (day === today) return { kind: "none", reason: DAY_RUNNING };
  if (day > today) return { kind: "none", reason: DAY_FUTURE };
  const row = rows.get(day);
  if (row === undefined) return { kind: "none", reason: DAY_NO_DATA };
  if (!isCompleteDay(row, today)) return { kind: "none", reason: DAY_INCOMPLETE };
  const value = selfSufficiency(row, today);
  if (value === null) return { kind: "none", reason: DAY_NO_USE };
  if (value === "inconsistent") {
    return {
      kind: "inconsistent",
      tone: "insufficient",
      word: INCONSISTENT_WORD,
      basis: `Prąd kupiony z sieci (${kwhLabel(row.grid_import_kwh)}) jest większy niż zużycie domu (${kwhLabel(row.load_kwh)}), więc ten dzień nie jest oceniany ani liczony do norm.`,
    };
  }

  // The norm days: qualifying (complete, consistent, use above 0) days in [day − 14, day − 1].
  const normDays: { day: string; value: number; pv: number }[] = [];
  for (let offset = RATING_WINDOW_DAYS; offset >= 1; offset--) {
    const key = addDays(day, -offset);
    const candidate = rows.get(key);
    const share = selfSufficiency(candidate, today);
    const pv = kwh(candidate?.pv_kwh);
    if (typeof share === "number" && pv !== null) normDays.push({ day: key, value: share, pv });
  }
  if (normDays.length < RATING_MIN_DAYS) {
    return {
      kind: "insufficient",
      tone: "insufficient",
      word: tooFew(normDays.length),
      days: normDays.length,
      needed: RATING_MIN_DAYS,
      basis: `Norma to mediana samowystarczalności z pełnych dni wśród ${String(RATING_WINDOW_DAYS)} poprzednich; potrzeba co najmniej ${String(RATING_MIN_DAYS)}, a jest ${String(normDays.length)}.`,
    };
  }

  const norm = median(normDays.map((d) => d.value)) ?? 0;
  const normPv = median(normDays.map((d) => d.pv)) ?? 0;
  const delta = value - norm;
  const band = bandOf(delta);
  const period = formatPeriod(
    normDays.map((d) => d.day),
    today.slice(0, 4),
  );
  const pv = kwh(row.pv_kwh) ?? 0;
  const lowSun =
    pv < LOW_SUN_SHARE * normPv - EPSILON
      ? {
          pvKwh: pv,
          normPvKwh: normPv,
          text: `Mało słońca: ${kwhLabel(pv)} z paneli, zwykle ${kwhLabel(normPv)}.`,
        }
      : null;

  return {
    kind: "rated",
    band,
    tone: BAND_TONE[band],
    word: DAY_WORD[band],
    value,
    norm,
    delta,
    days: period.days,
    periodLabel: period.label,
    basis: `Samowystarczalność ${oneDecimal.format(value)}% — ${gapPhrase(delta, band)}. Norma: mediana z ${period.label} (${RECENT_NORM}).`,
    lowSun,
  };
}

// A completed past day against the median of its recent norm days.
export function rateDay(day: string, rows: readonly DailyEnergyRow[], today: string): PeriodRating {
  return rateDayIn(day, byDay(rows), today);
}

// A completed month: the median of the gaps of its rated days, by the same ±10 points rule. `rows` must reach
// RATING_WINDOW_DAYS before the month (rowsNeededFrom) so its first days have their norm.
export function rateMonth(month: string, rows: readonly DailyEnergyRow[], today: string): PeriodRating {
  if (month >= today.slice(0, 7)) return { kind: "none", reason: MONTH_RUNNING };
  const map = byDay(rows);
  const rated: { day: string; delta: number }[] = [];
  for (const day of periodDays({ kind: "month", month })) {
    const rating = rateDayIn(day, map, today);
    if (rating.kind === "rated") rated.push({ day, delta: rating.delta });
  }
  if (rated.length < RATING_MIN_DAYS) {
    return {
      kind: "insufficient",
      tone: "insufficient",
      word: tooFew(rated.length),
      days: rated.length,
      needed: RATING_MIN_DAYS,
      basis: `Miesiąc jest oceniany z co najmniej ${String(RATING_MIN_DAYS)} ocenionych dni, a ma ich ${String(rated.length)}.`,
    };
  }

  const delta = median(rated.map((d) => d.delta)) ?? 0;
  const band = bandOf(delta);
  const period = formatPeriod(
    rated.map((d) => d.day),
    today.slice(0, 4),
  );
  return {
    kind: "rated",
    band,
    tone: BAND_TONE[band],
    word: MONTH_WORD[band],
    value: null,
    norm: null,
    delta,
    days: period.days,
    periodLabel: period.label,
    basis: `Mediana odchyleń ${String(period.days)} ocenionych dni od ich norm: ${gapPhrase(delta, band)}. Ocenione dni: ${rangeOf(period.label)}. Norma każdego dnia to mediana z ${String(RATING_WINDOW_DAYS)} dni przed nim (${RECENT_NORM}).`,
    lowSun: null,
  };
}
