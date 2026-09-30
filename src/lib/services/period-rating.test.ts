import { describe, expect, it } from "vitest";
import type { DailyEnergyRow } from "@/types";
import { addDays } from "@/lib/format/warsaw-time";
import {
  DAY_FUTURE,
  DAY_INCOMPLETE,
  DAY_NO_DATA,
  DAY_NO_USE,
  DAY_RUNNING,
  INCONSISTENT_WORD,
  LOW_SUN_SHARE,
  MONTH_NO_DATA,
  MONTH_RUNNING,
  NOT_RATED_WORD,
  notRated,
  RATING_MIN_DAYS,
  RATING_THRESHOLD_POINTS,
  RATING_WINDOW_DAYS,
  rateDay,
  rateMonth,
  rowsNeededFrom,
  selfSufficiency,
  type PeriodRating,
} from "./period-rating";
import { SENSOR_CHANGE_DAY_BASIS, SENSOR_CHANGE_RATING_BASIS } from "./grid-sensor";

// All data here is synthetic. The repository is public, so no test uses the owner's real figures: the production
// history's shape is copied (which days are missing, empty or inconsistent), and every value is invented, so no printed
// figure matches production.

function row(day: string, pv: number | null, load: number | null, imported: number | null): DailyEnergyRow {
  return { day, pv_kwh: pv, load_kwh: load, grid_import_kwh: imported, grid_export_kwh: 0, pv_forecast_kwh: null };
}

// [day, pv, load, import]; null marks a row whose totals are missing. Days absent here have no row at all
// (08-04 – 08-27, 09-14 – 09-18, 09-22 – 09-24). With a use of 20 kWh, self-sufficiency is 100 − 5 × import.
const FIXTURE: DailyEnergyRow[] = (
  [
    // The early rows: import above use on 07-27, 07-28, 07-30, 08-02 and 08-03 (roadmap open question 7).
    ["2026-07-26", 27, 23, 11.5],
    ["2026-07-27", 19, 12.5, 17],
    ["2026-07-28", 30.2, 15.1, 20.4],
    ["2026-07-29", 31, 21, 13.5],
    ["2026-07-30", 33, 11, 15.5],
    ["2026-08-01", 23, 25, 17.5],
    ["2026-08-02", 25, 13.5, 16],
    ["2026-08-03", 17, 9.5, 11],
    ["2026-08-28", 25, 20, 6.8], // 66%
    ["2026-08-29", 12, 20, 11.8], // 41%
    ["2026-08-30", 23, 20, 7.4], // 63%
    ["2026-08-31", null, null, null],
    ["2026-09-01", 18, 20, 9.2], // 54%
    ["2026-09-02", 27, 20, 7.2], // 64%
    ["2026-09-03", 22.6, 20, 8.7], // 56,5%
    ["2026-09-04", 15, 20, 12.8], // 36%
    ["2026-09-05", 21, 20, 8.9], // 55,5%
    ["2026-09-06", 17, 20, 10.2], // 49%
    ["2026-09-07", 24, 20, 8.2], // 59%
    ["2026-09-08", 26.5, 20, 7], // 65%
    ["2026-09-09", 25.5, 20, 7.6], // 62%
    ["2026-09-10", 13, 20, 12.6], // 37%
    ["2026-09-11", 9.6, 20, 14.3], // 28,5%
    ["2026-09-12", 20.5, 20, 7.5], // 62,5%
    ["2026-09-13", null, null, null],
    ["2026-09-19", null, null, null],
    ["2026-09-20", 14, 20, 12.4], // 38%
    ["2026-09-21", null, null, null],
    ["2026-09-25", 8.5, 20, 14.8], // 26%
    ["2026-09-26", 10, 20, 13.8], // 31%
    ["2026-09-27", 22, 20, 8.4], // 58%
    ["2026-09-28", 24, 20, 7.4], // 63%
    ["2026-09-29", 21, 20, 8], // 60%
  ] as [string, number | null, number | null, number | null][]
).map(([day, pv, load, imported]) => row(day, pv, load, imported));

// Early October: September is a completed month.
const TODAY = "2026-10-05";

function rated(rating: PeriodRating) {
  if (rating.kind !== "rated") throw new Error(`expected a rated result, got ${rating.kind}`);
  return rating;
}

// `count` consecutive days from `first` with a use of 20 kWh and the given self-sufficiency and PV.
function steadyDays(first: string, count: number, share: number, pv = 20): DailyEnergyRow[] {
  return Array.from({ length: count }, (_, i) => row(addDays(first, i), pv, 20, (20 * (100 - share)) / 100));
}

// A day in the sensor-change window after the mixed day (08-04 – 08-17).
const SENSOR_RATING: PeriodRating = {
  kind: "inconsistent",
  tone: "insufficient",
  word: INCONSISTENT_WORD,
  basis: SENSOR_CHANGE_RATING_BASIS,
};
// The mixed change day itself (08-03).
const CHANGE_DAY_RATING: PeriodRating = { ...SENSOR_RATING, basis: SENSOR_CHANGE_DAY_BASIS };

describe("constants", () => {
  it("uses a 14-day window, 7 days minimum, ±10 points and 70% for low sun", () => {
    expect(RATING_WINDOW_DAYS).toBe(14);
    expect(RATING_MIN_DAYS).toBe(7);
    expect(RATING_THRESHOLD_POINTS).toBe(10);
    expect(LOW_SUN_SHARE).toBe(0.7);
  });
});

describe("selfSufficiency", () => {
  it("is 1 − import ÷ use in percent", () => {
    expect(selfSufficiency(row("2026-09-01", 10, 20, 5), TODAY)).toBeCloseTo(75, 9);
  });

  it("is 100% with no import and 0% when import equals use", () => {
    expect(selfSufficiency(row("2026-09-01", 10, 20, 0), TODAY)).toBe(100);
    expect(selfSufficiency(row("2026-09-01", 10, 20, 20), TODAY)).toBe(0);
  });

  it("is inconsistent when import exceeds use", () => {
    expect(selfSufficiency(row("2026-07-28", 30.2, 15.1, 20.4), TODAY)).toBe("inconsistent");
  });

  it("is null for use 0, an incomplete day, today and a missing row", () => {
    expect(selfSufficiency(row("2026-09-01", 10, 0, 0), TODAY)).toBeNull();
    expect(selfSufficiency(row("2026-09-01", 10, null, 5), TODAY)).toBeNull();
    expect(selfSufficiency(row(TODAY, 10, 20, 5), TODAY)).toBeNull();
    expect(selfSufficiency(undefined, TODAY)).toBeNull();
  });
});

describe("rowsNeededFrom", () => {
  it("reaches 14 days before the first day", () => {
    expect(rowsNeededFrom("2026-09-01")).toBe("2026-08-18");
  });
});

describe("rateDay on the production-shaped history", () => {
  it("rates 2026-09-11 Słaby dzień with low sun", () => {
    const rating = rated(rateDay("2026-09-11", FIXTURE, TODAY));
    expect(rating.band).toBe("bad");
    expect(rating.tone).toBe("problem");
    expect(rating.word).toBe("Słaby dzień");
    expect(rating.days).toBe(13);
    expect(rating.periodLabel).toBe("13 dni: 28 sierpnia – 10 września");
    expect(rating.norm).toBeCloseTo(56.5, 9);
    expect(rating.value).toBeCloseTo(28.5, 9);
    expect(rating.delta).toBeCloseTo(-28, 9);
    expect(rating.basis).toBe(
      "Samowystarczalność 28,5% — 28,0 punktu poniżej normy. Norma: mediana z 13 dni (28 sierpnia – 10 września), ostatnie dni, bo z tej pory roku jest za mało danych.",
    );
    expect(rating.lowSun).toEqual({
      pvKwh: 9.6,
      normPvKwh: 22.6,
      text: "Mało słońca: 9,6 kWh z paneli, zwykle 22,6 kWh.",
    });
  });

  it("rates 2026-09-12 Przeciętny dzień", () => {
    const rating = rated(rateDay("2026-09-12", FIXTURE, TODAY));
    expect(rating.band).toBe("neutral");
    expect(rating.tone).toBe("insufficient");
    expect(rating.word).toBe("Przeciętny dzień");
    expect(rating.days).toBe(13);
    expect(rating.norm).toBeCloseTo(55.5, 9);
    expect(rating.value).toBeCloseTo(62.5, 9);
    expect(rating.delta).toBeCloseTo(7, 9);
    expect(rating.basis).toMatch(/^Samowystarczalność 62,5% — 7,0 punktu powyżej normy\. Norma: mediana z 13 dni \(/);
    expect(rating.lowSun).toBeNull();
  });

  it("reads Za mało danych: 5 z 7 on 2026-09-29", () => {
    // Qualifying days in 09-15 – 09-28: 09-20, 09-25, 09-26, 09-27, 09-28.
    expect(rateDay("2026-09-29", FIXTURE, TODAY)).toMatchObject({
      kind: "insufficient",
      tone: "insufficient",
      word: "Za mało danych: 5 z 7",
      days: 5,
      needed: 7,
      basis:
        "Norma to mediana samowystarczalności z pełnych dni wśród 14 poprzednich; potrzeba co najmniej 7, a jest ich 5.",
    });
  });

  it("reads Poza oceną on 2026-07-28", () => {
    const rating = rateDay("2026-07-28", FIXTURE, TODAY);
    expect(INCONSISTENT_WORD).toBe("Poza oceną");
    expect(rating).toMatchObject({ kind: "inconsistent", tone: "insufficient", word: INCONSISTENT_WORD });
    expect(rating.kind === "inconsistent" && rating.basis).toBe(
      "Z sieci kupiono więcej (20,4 kWh), niż dom zużył (15,1 kWh) — np. ładowanie baterii z sieci albo błąd licznika — więc ten dzień nie jest oceniany ani liczony do norm.",
    );
  });

  it("puts the early days in the sensor-change window under the sensor basis", () => {
    // 08-03 has import above use too, but the mixed-day basis wins; 08-04 would have a norm of only 3 days.
    expect(rateDay("2026-08-03", FIXTURE, TODAY)).toEqual(CHANGE_DAY_RATING);
    expect(rateDay("2026-08-04", [...FIXTURE, row("2026-08-04", 20, 20, 10)], TODAY)).toEqual(SENSOR_RATING);
  });

  it("does not rate missing or incomplete days", () => {
    expect(rateDay("2026-09-15", FIXTURE, TODAY)).toEqual(notRated(DAY_NO_DATA));
    expect(rateDay("2026-09-13", FIXTURE, TODAY)).toEqual(notRated(DAY_INCOMPLETE));
  });

  it("gives an unrated day the grey Bez oceny badge and its reason as a sentence", () => {
    expect(rateDay("2026-09-15", FIXTURE, TODAY)).toEqual({
      kind: "none",
      tone: "insufficient",
      word: NOT_RATED_WORD,
      reason: DAY_NO_DATA,
      basis: "Brak danych z tego dnia.",
    });
    expect(NOT_RATED_WORD).toBe("Bez oceny");
  });
});

describe("rateDay", () => {
  const norm = steadyDays("2026-06-17", 14, 50);

  function rateWith(share: number, pv = 20) {
    return rateDay("2026-07-01", [...norm, ...steadyDays("2026-07-01", 1, share, pv)], TODAY);
  }

  it.each([
    [60, "neutral", "Przeciętny dzień", "10,0 punktu powyżej normy"],
    [40, "neutral", "Przeciętny dzień", "10,0 punktu poniżej normy"],
    [60.1, "good", "Dobry dzień", "10,1 punktu powyżej normy"],
    [39.9, "bad", "Słaby dzień", "10,1 punktu poniżej normy"],
    [50, "neutral", "Przeciętny dzień", "tyle, ile norma"],
  ])("rates %d%% against a norm of 50%% as %s", (share, band, word, gap) => {
    const rating = rated(rateWith(share));
    expect(rating.band).toBe(band);
    expect(rating.word).toBe(word);
    expect(rating.basis).toContain(`— ${gap}. Norma: mediana z 14 dni (17–30 czerwca), ostatnie dni`);
  });

  it("maps the bands to green, grey and red", () => {
    expect(rated(rateWith(70)).tone).toBe("good");
    expect(rated(rateWith(50)).tone).toBe("insufficient");
    expect(rated(rateWith(30)).tone).toBe("problem");
  });

  it("notes low sun only below 70% of the norm days' PV", () => {
    expect(rated(rateWith(50, 14)).lowSun).toBeNull();
    expect(rated(rateWith(50, 13.9)).lowSun).toEqual({
      pvKwh: 13.9,
      normPvKwh: 20,
      text: "Mało słońca: 13,9 kWh z paneli, zwykle 20,0 kWh.",
    });
  });

  it("needs 7 qualifying days in the 14 before", () => {
    const day = steadyDays("2026-07-01", 1, 50);
    expect(rateDay("2026-07-01", [...steadyDays("2026-06-24", 6, 50), ...day], TODAY)).toMatchObject({
      kind: "insufficient",
      word: "Za mało danych: 6 z 7",
    });
    expect(rated(rateDay("2026-07-01", [...steadyDays("2026-06-24", 7, 50), ...day], TODAY)).days).toBe(7);
    // A day 15 days back is outside the window.
    expect(rateDay("2026-07-01", [...steadyDays("2026-06-10", 7, 50), ...day], TODAY)).toMatchObject({
      kind: "insufficient",
      word: "Za mało danych: 0 z 7",
    });
  });

  it("leaves inconsistent, incomplete and zero-use days out of the norm", () => {
    const rows = [
      ...steadyDays("2026-06-24", 6, 50),
      row("2026-06-17", 20, 10, 12),
      row("2026-06-18", 20, null, 5),
      row("2026-06-19", 20, 0, 0),
      ...steadyDays("2026-07-01", 1, 50),
    ];
    expect(rateDay("2026-07-01", rows, TODAY)).toMatchObject({ kind: "insufficient", word: "Za mało danych: 6 z 7" });
  });

  it("does not rate today, the future or a day with use 0", () => {
    const rows = [...norm, ...steadyDays("2026-07-01", 5, 50)];
    expect(rateDay("2026-07-03", rows, "2026-07-03")).toEqual(notRated(DAY_RUNNING));
    expect(rateDay("2026-07-04", rows, "2026-07-03")).toEqual(notRated(DAY_FUTURE));
    expect(rateDay("2026-07-01", [...norm, row("2026-07-01", 5, 0, 0)], TODAY)).toEqual(notRated(DAY_NO_USE));
  });

  it("builds a norm window across the new year", () => {
    const rows = [...steadyDays("2026-12-20", 14, 50), ...steadyDays("2027-01-03", 1, 50)];
    const rating = rated(rateDay("2027-01-03", rows, "2027-01-10"));
    expect(rating.days).toBe(14);
    expect(rating.periodLabel).toBe("14 dni: 20 grudnia 2026 – 2 stycznia 2027");
    expect(rating.basis).toContain("Norma: mediana z 14 dni (20 grudnia 2026 – 2 stycznia 2027), ostatnie dni");
  });
});

describe("the sensor-change window", () => {
  // Steady 50% days from the start of the history to the end of August: every day has a full norm.
  const history = steadyDays("2026-07-16", 47, 50);

  it("reads Poza oceną from 08-03 to 08-17, even with a full norm: 08-03 as the mixed day, later days by their norm", () => {
    expect(rateDay("2026-08-03", history, TODAY)).toEqual(CHANGE_DAY_RATING);
    for (const day of ["2026-08-04", "2026-08-10", "2026-08-17"]) {
      expect(rateDay(day, history, TODAY)).toEqual(SENSOR_RATING);
    }
  });

  it("rates 08-02 and 08-18 normally, 08-18 on post-change days only", () => {
    expect(rated(rateDay("2026-08-02", history, TODAY)).periodLabel).toBe("14 dni: 19 lipca – 1 sierpnia");
    const after = rated(rateDay("2026-08-18", history, TODAY));
    expect(after.periodLabel).toBe("14 dni: 4–17 sierpnia");
    expect(after.band).toBe("neutral");
  });

  it("names the sensor rather than the import above use on a window day", () => {
    const rows = history.map((r) => (r.day === "2026-08-10" ? row("2026-08-10", 20, 10, 15) : r));
    expect(rateDay("2026-08-10", rows, TODAY)).toEqual(SENSOR_RATING);
  });

  it("rates August from 18 August only, whatever the pre-change norm", () => {
    // As in production, the history before the change is short: from 07-27, 08-01 and 08-02 have under 7 norm days.
    const short = history.filter((r) => r.day >= "2026-07-27");
    expect(rated(rateMonth("2026-08", short, TODAY)).periodLabel).toBe("14 dni: 18–31 sierpnia");
    // Without totals on 08-31 (as in production), the rated days are 18–30 August.
    const withoutLast = short.map((r) => (r.day === "2026-08-31" ? row("2026-08-31", null, null, null) : r));
    expect(rated(rateMonth("2026-08", withoutLast, TODAY)).periodLabel).toBe("13 dni: 18–30 sierpnia");
    // Even with a full pre-change norm for 08-01 and 08-02, the month rests on its post-change days only.
    expect(rateDay("2026-08-01", history, TODAY).kind).toBe("rated");
    expect(rated(rateMonth("2026-08", history, TODAY)).periodLabel).toBe("14 dni: 18–31 sierpnia");
  });
});

describe("rateMonth", () => {
  // June's second half as the norm base, then July's first days at the given self-sufficiency.
  function july(days: number, share: number) {
    return [...steadyDays("2026-06-17", 14, 50), ...steadyDays("2026-07-01", days, share)];
  }

  it.each([
    [65, "good", "good", "Dobry miesiąc"],
    [50, "neutral", "insufficient", "Przeciętny miesiąc"],
    [35, "bad", "problem", "Słaby miesiąc"],
  ])("rates a month of %d%% days against 50%% as %s", (share, band, tone, word) => {
    const rating = rated(rateMonth("2026-07", july(7, share), TODAY));
    expect(rating).toMatchObject({ band, tone, word, days: 7, periodLabel: "7 dni: 1–7 lipca", lowSun: null });
    expect(rating.value).toBeNull();
    expect(rating.norm).toBeNull();
  });

  it("names the count and the period of the rated days", () => {
    expect(rated(rateMonth("2026-07", july(7, 65), TODAY)).basis).toBe(
      "Mediana odchyleń 7 ocenionych dni od ich norm: 15,0 punktu powyżej normy. Ocenione dni: 1–7 lipca. Norma każdego dnia to mediana z 14 dni przed nim (ostatnie dni, bo z tej pory roku jest za mało danych).",
    );
  });

  it("needs 7 rated days", () => {
    expect(rateMonth("2026-07", july(6, 50), TODAY)).toMatchObject({
      kind: "insufficient",
      word: "Za mało danych: 6 z 7",
      days: 6,
      needed: 7,
    });
    expect(rated(rateMonth("2026-07", july(7, 50), TODAY)).days).toBe(7);
  });

  it("does not rate the current or a future month", () => {
    expect(rateMonth("2026-10", FIXTURE, TODAY)).toEqual(notRated(MONTH_RUNNING));
    expect(rateMonth("2026-11", FIXTURE, TODAY)).toEqual(notRated(MONTH_RUNNING));
    expect(rateMonth("2026-09", FIXTURE, "2026-09-30")).toEqual(notRated(MONTH_RUNNING));
  });

  it("says Brak danych z tego miesiąca for a completed month with no rated day", () => {
    expect(rateMonth("2026-06", FIXTURE, TODAY)).toMatchObject({
      kind: "insufficient",
      tone: "insufficient",
      word: MONTH_NO_DATA,
      days: 0,
      needed: 7,
    });
    expect(MONTH_NO_DATA).toBe("Brak danych z tego miesiąca");
  });

  it("takes an even count's median gap as the mean of the middle two, and 9 and 11 stay neutral", () => {
    // Each July day keeps a norm of exactly 50%: at least 8 of its 14 norm days are 50% (June's, and 07-03).
    const shares = [30, 30, 50, 59, 61, 70, 70, 70];
    const rows = [
      ...steadyDays("2026-06-17", 14, 50),
      ...shares.flatMap((share, i) => steadyDays(addDays("2026-07-01", i), 1, share)),
    ];
    const rating = rated(rateMonth("2026-07", rows, TODAY));
    expect(rating.days).toBe(8);
    expect(rating.delta).toBeCloseTo(10, 9);
    expect(rating.band).toBe("neutral");
    expect(rating.basis).toContain("10,0 punktu powyżej normy");
  });

  it("rates the completed September of the production-shaped history by its rated days", () => {
    // Rated: 09-05 – 09-12 and 09-20; the early September days and the days after the gaps lack a norm.
    const rating = rated(rateMonth("2026-09", FIXTURE, TODAY));
    expect(rating.days).toBe(9);
    expect(rating.periodLabel).toBe("9 dni: 5–20 września");
    expect(rating.word).toBe("Przeciętny miesiąc");
  });
});
