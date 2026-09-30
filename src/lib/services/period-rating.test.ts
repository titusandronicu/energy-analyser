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
  MONTH_RUNNING,
  RATING_MIN_DAYS,
  RATING_THRESHOLD_POINTS,
  RATING_WINDOW_DAYS,
  rateDay,
  rateMonth,
  rowsNeededFrom,
  selfSufficiency,
  type PeriodRating,
} from "./period-rating";

// All data here is synthetic. The repository is public, so no test uses the owner's real figures; the production
// history's shape is copied (which days are missing, empty or inconsistent), and the values are invented so that the
// plan's worked examples come out with the same headline figures (norm 58,3%, day 30,9%, PV 10,9 against 23,4 kWh).

function row(day: string, pv: number | null, load: number | null, imported: number | null): DailyEnergyRow {
  return { day, pv_kwh: pv, load_kwh: load, grid_import_kwh: imported, grid_export_kwh: 0, pv_forecast_kwh: null };
}

// [day, pv, load, import]; null marks a row whose totals are missing. Days absent here have no row at all
// (08-04 – 08-27, 09-14 – 09-18, 09-22 – 09-24). With a use of 20 kWh, self-sufficiency is 100 − 5 × import.
const FIXTURE: DailyEnergyRow[] = (
  [
    // The early rows: import above use on 07-27, 07-28, 07-30, 08-02 and 08-03 (roadmap open question 7).
    ["2026-07-26", 28, 24, 12],
    ["2026-07-27", 18, 13, 18],
    ["2026-07-28", 31.3, 16.3, 19.8],
    ["2026-07-29", 32, 20, 14],
    ["2026-07-30", 34, 10, 16],
    ["2026-08-01", 22, 24, 18],
    ["2026-08-02", 24, 14, 17],
    ["2026-08-03", 16, 9, 10],
    ["2026-08-28", 24, 20, 7], // 65%
    ["2026-08-29", 11, 20, 12], // 40%
    ["2026-08-30", 24, 20, 7.6], // 62%
    ["2026-08-31", null, null, null],
    ["2026-09-01", 19, 20, 9], // 55%
    ["2026-09-02", 26, 20, 7.4], // 63%
    ["2026-09-03", 23.4, 20, 8.34], // 58,3%
    ["2026-09-04", 14, 20, 13], // 35%
    ["2026-09-05", 22, 20, 8.52], // 57,4%
    ["2026-09-06", 16, 20, 10], // 50%
    ["2026-09-07", 25, 20, 8], // 60%
    ["2026-09-08", 26, 20, 7.2], // 64%
    ["2026-09-09", 24, 20, 7.8], // 61%
    ["2026-09-10", 14, 20, 12.8], // 36%
    ["2026-09-11", 10.9, 20, 13.82], // 30,9%
    ["2026-09-12", 21, 20, 7.82], // 60,9%
    ["2026-09-13", null, null, null],
    ["2026-09-19", null, null, null],
    ["2026-09-20", 13, 20, 12.6], // 37%
    ["2026-09-21", null, null, null],
    ["2026-09-25", 9, 20, 15], // 25%
    ["2026-09-26", 9, 20, 14], // 30%
    ["2026-09-27", 21, 20, 8], // 60%
    ["2026-09-28", 23, 20, 7.6], // 62%
    ["2026-09-29", 22, 20, 7.8], // 61%
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
    expect(selfSufficiency(row("2026-07-28", 31.3, 16.3, 19.8), TODAY)).toBe("inconsistent");
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
    expect(rating.norm).toBeCloseTo(58.3, 9);
    expect(rating.value).toBeCloseTo(30.9, 9);
    expect(rating.delta).toBeCloseTo(-27.4, 9);
    expect(rating.basis).toBe(
      "Samowystarczalność 30,9% — 27,4 punktu poniżej normy. Norma: mediana z 13 dni: 28 sierpnia – 10 września (ostatnie dni, bo z tej pory roku jest za mało danych).",
    );
    expect(rating.lowSun).toEqual({
      pvKwh: 10.9,
      normPvKwh: 23.4,
      text: "Mało słońca: 10,9 kWh z paneli, zwykle 23,4 kWh.",
    });
  });

  it("rates 2026-09-12 Przeciętny dzień", () => {
    const rating = rated(rateDay("2026-09-12", FIXTURE, TODAY));
    expect(rating.band).toBe("neutral");
    expect(rating.tone).toBe("insufficient");
    expect(rating.word).toBe("Przeciętny dzień");
    expect(rating.days).toBe(13);
    expect(rating.norm).toBeCloseTo(57.4, 9);
    expect(rating.value).toBeCloseTo(60.9, 9);
    expect(rating.delta).toBeCloseTo(3.5, 9);
    expect(rating.basis).toMatch(/^Samowystarczalność 60,9% — 3,5 punktu powyżej normy\. Norma: mediana z 13 dni: /);
    expect(rating.lowSun).toBeNull();
  });

  it("reads za mało danych: 5 z 7 on 2026-09-29", () => {
    // Qualifying days in 09-15 – 09-28: 09-20, 09-25, 09-26, 09-27, 09-28.
    expect(rateDay("2026-09-29", FIXTURE, TODAY)).toMatchObject({
      kind: "insufficient",
      tone: "insufficient",
      word: "za mało danych: 5 z 7",
      days: 5,
      needed: 7,
    });
  });

  it("reads dane niespójne on 2026-07-28", () => {
    const rating = rateDay("2026-07-28", FIXTURE, TODAY);
    expect(rating).toMatchObject({ kind: "inconsistent", tone: "insufficient", word: INCONSISTENT_WORD });
    expect(rating.kind === "inconsistent" && rating.basis).toBe(
      "Prąd kupiony z sieci (19,8 kWh) jest większy niż zużycie domu (16,3 kWh), więc ten dzień nie jest oceniany ani liczony do norm.",
    );
  });

  it("leaves the inconsistent early days out of the norm", () => {
    // 07-21 – 08-03 holds eight rows, but five have import above use: only 07-26, 07-29 and 08-01 count.
    expect(rateDay("2026-08-03", FIXTURE, TODAY)).toMatchObject({ kind: "inconsistent" });
    expect(rateDay("2026-08-04", [...FIXTURE, row("2026-08-04", 20, 20, 10)], TODAY)).toMatchObject({
      kind: "insufficient",
      word: "za mało danych: 3 z 7",
    });
  });

  it("does not rate missing or incomplete days", () => {
    expect(rateDay("2026-09-15", FIXTURE, TODAY)).toEqual({ kind: "none", reason: DAY_NO_DATA });
    expect(rateDay("2026-09-13", FIXTURE, TODAY)).toEqual({ kind: "none", reason: DAY_INCOMPLETE });
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
    expect(rating.basis).toContain(`— ${gap}. Norma: mediana z 14 dni: 17–30 czerwca`);
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
      word: "za mało danych: 6 z 7",
    });
    expect(rated(rateDay("2026-07-01", [...steadyDays("2026-06-24", 7, 50), ...day], TODAY)).days).toBe(7);
    // A day 15 days back is outside the window.
    expect(rateDay("2026-07-01", [...steadyDays("2026-06-10", 7, 50), ...day], TODAY)).toMatchObject({
      kind: "insufficient",
      word: "za mało danych: 0 z 7",
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
    expect(rateDay("2026-07-01", rows, TODAY)).toMatchObject({ kind: "insufficient", word: "za mało danych: 6 z 7" });
  });

  it("does not rate today, the future or a day with use 0", () => {
    const rows = [...norm, ...steadyDays("2026-07-01", 5, 50)];
    expect(rateDay("2026-07-03", rows, "2026-07-03")).toEqual({ kind: "none", reason: DAY_RUNNING });
    expect(rateDay("2026-07-04", rows, "2026-07-03")).toEqual({ kind: "none", reason: DAY_FUTURE });
    expect(rateDay("2026-07-01", [...norm, row("2026-07-01", 5, 0, 0)], TODAY)).toEqual({
      kind: "none",
      reason: DAY_NO_USE,
    });
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
      word: "za mało danych: 6 z 7",
      days: 6,
      needed: 7,
    });
    expect(rated(rateMonth("2026-07", july(7, 50), TODAY)).days).toBe(7);
  });

  it("does not rate the current or a future month", () => {
    expect(rateMonth("2026-10", FIXTURE, TODAY)).toEqual({ kind: "none", reason: MONTH_RUNNING });
    expect(rateMonth("2026-11", FIXTURE, TODAY)).toEqual({ kind: "none", reason: MONTH_RUNNING });
    expect(rateMonth("2026-09", FIXTURE, "2026-09-30")).toEqual({ kind: "none", reason: MONTH_RUNNING });
  });

  it("rates the completed September of the production-shaped history by its rated days", () => {
    // Rated: 09-05 – 09-12 and 09-20; the early September days and the days after the gaps lack a norm.
    const rating = rated(rateMonth("2026-09", FIXTURE, TODAY));
    expect(rating.days).toBe(9);
    expect(rating.periodLabel).toBe("9 dni: 5–20 września");
    expect(rating.word).toBe("Przeciętny miesiąc");
  });
});
