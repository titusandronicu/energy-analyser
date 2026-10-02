import { describe, expect, it } from "vitest";
import {
  BAR_TOP_PAD,
  barGeometry,
  dayTicks,
  describeBars,
  describeMonthGroups,
  MIN_BAR_SLOTS,
  monthGroupSeries,
  slotCenter,
  type MonthGroup,
} from "./bars";

// Four slots of 10 units, 2 units of gap; the usable height is 100 - BAR_TOP_PAD = 98.
const OPTS = { width: 40, height: 100, gap: 2 };

describe("constants", () => {
  it("pins the documented values", () => {
    expect(MIN_BAR_SLOTS).toBe(3);
    expect(BAR_TOP_PAD).toBe(2);
  });
});

describe("barGeometry", () => {
  it("draws bars from a zero baseline, scaled to the largest value", () => {
    expect(barGeometry([[10, 5, 0, 2.5]], OPTS)).toEqual({
      bars: [
        { x: 1, y: 2, w: 8, h: 98, seriesIndex: 0, slot: 0 },
        { x: 11, y: 51, w: 8, h: 49, seriesIndex: 0, slot: 1 },
        { x: 21, y: 100, w: 8, h: 0, seriesIndex: 0, slot: 2 },
        { x: 31, y: 75.5, w: 8, h: 24.5, seriesIndex: 0, slot: 3 },
      ],
      line: null,
      max: 10,
    });
  });

  it("keeps a gap as an empty slot, never as a zero-height bar", () => {
    const geometry = barGeometry([[4, null, 2, 8]], OPTS);
    expect(geometry?.bars.map((bar) => bar.slot)).toEqual([0, 2, 3]);
    expect(geometry?.bars.find((bar) => bar.slot === 3)?.x).toBe(31);
  });

  it("treats NaN, infinite and negative values as gaps", () => {
    const geometry = barGeometry([[4, Number.NaN, -1, Number.POSITIVE_INFINITY, 2, 3]], {
      width: 60,
      height: 100,
      gap: 2,
    });
    expect(geometry?.bars.map((bar) => bar.slot)).toEqual([0, 4, 5]);
    expect(geometry?.max).toBe(4);
  });

  it("returns null when fewer than three slots hold a value", () => {
    expect(barGeometry([[1, 2]], OPTS)).toBeNull();
    expect(barGeometry([[1, null, 2, null]], OPTS)).toBeNull();
    expect(barGeometry([[null, null, null]], OPTS)).toBeNull();
    expect(barGeometry([[]], OPTS)).toBeNull();
    expect(barGeometry([], OPTS)).toBeNull();
    // Two series filling the same two slots are still two slots.
    expect(
      barGeometry(
        [
          [1, 2, null],
          [3, 4, null],
        ],
        OPTS,
      ),
    ).toBeNull();
  });

  it("draws an all-zero chart on the baseline", () => {
    const geometry = barGeometry([[0, 0, 0]], { width: 30, height: 100, gap: 2 });
    expect(geometry?.max).toBe(0);
    expect(geometry?.bars.every((bar) => bar.h === 0 && bar.y === 100)).toBe(true);
  });

  it("draws the line on the bar scale, taller than the bars when it holds the maximum", () => {
    const geometry = barGeometry([[5, 10, 5, 10]], { ...OPTS, lineSeries: [20, 10, null, 15] });
    expect(geometry?.max).toBe(20);
    // Bars scale to 20: 10 is half of the usable 98.
    expect(geometry?.bars[1]).toEqual({ x: 11, y: 51, w: 8, h: 49, seriesIndex: 0, slot: 1 });
    // Points sit at slot centres; the gap breaks the line and the lone last point is a dot.
    expect(geometry?.line).toBe("M5.0,2.0 L15.0,51.0 M35.0,26.5 L35.0,26.5");
  });

  it("counts line-only slots towards the minimum", () => {
    const geometry = barGeometry([[4, null, null]], { width: 30, height: 100, gap: 2, lineSeries: [null, 2, 3] });
    expect(geometry?.bars).toHaveLength(1);
    expect(geometry?.line).toBe("M15.0,51.0 L25.0,26.5");
  });

  it("offsets grouped bars side by side inside each slot", () => {
    // Three slots of 100 units with 40 units of gap: a 60-unit group of three 20-unit bars starting at 20.
    const geometry = barGeometry(
      [
        [300, 200, null],
        [150, 100, 50],
        [30, null, 60],
      ],
      { width: 300, height: 100, gap: 40 },
    );
    expect(geometry?.max).toBe(300);
    expect(geometry?.bars.map(({ x, w, seriesIndex, slot }) => ({ x, w, seriesIndex, slot }))).toEqual([
      { x: 20, w: 20, seriesIndex: 0, slot: 0 },
      { x: 40, w: 20, seriesIndex: 1, slot: 0 },
      { x: 60, w: 20, seriesIndex: 2, slot: 0 },
      { x: 120, w: 20, seriesIndex: 0, slot: 1 },
      { x: 140, w: 20, seriesIndex: 1, slot: 1 },
      { x: 240, w: 20, seriesIndex: 1, slot: 2 },
      { x: 260, w: 20, seriesIndex: 2, slot: 2 },
    ]);
    expect(geometry?.bars[0]).toMatchObject({ y: 2, h: 98 });
  });
});

describe("slotCenter", () => {
  it("places a slot's centre", () => {
    expect(slotCenter(0, 4, 40)).toBe(5);
    expect(slotCenter(3, 4, 40)).toBe(35);
  });
});

describe("dayTicks", () => {
  it("marks the first day, every 5th day and the last day", () => {
    expect(dayTicks(30)).toEqual([0, 4, 9, 14, 19, 24, 29]);
    expect(dayTicks(28)).toEqual([0, 4, 9, 14, 19, 24, 27]);
  });

  it("drops a 5th day that would crowd the last one", () => {
    // Day 30 sits next to day 31.
    expect(dayTicks(31)).toEqual([0, 4, 9, 14, 19, 24, 30]);
    expect(dayTicks(16)).toEqual([0, 4, 9, 15]);
  });

  it("handles short windows", () => {
    expect(dayTicks(0)).toEqual([]);
    expect(dayTicks(1)).toEqual([0]);
    expect(dayTicks(3)).toEqual([0, 2]);
  });
});

describe("describeBars", () => {
  const LABELS = ["1 września", "2 września", "3 września", "4 września"];

  it("names the window, the highest and the lowest day, with no gap clause for a full window", () => {
    expect(
      describeBars("Produkcja z paneli", "wrzesień 2026", [12, 25.3, 8.1, 20], "kWh", { slotLabels: LABELS }),
    ).toBe("Produkcja z paneli, wrzesień 2026: najwięcej 25,3 kWh (2 września), najmniej 8,1 kWh (3 września)");
  });

  it("adds the days-with-data clause when some days are gaps", () => {
    expect(
      describeBars("Produkcja z paneli", "wrzesień 2026", [12, null, 8.1, 20], "kWh", { slotLabels: LABELS }),
    ).toBe(
      "Produkcja z paneli, wrzesień 2026: najwięcej 20,0 kWh (4 września), najmniej 8,1 kWh (3 września), dane z 3 z 4 dni",
    );
  });

  it("falls back to the day number without slot labels, and states no trend for equal values", () => {
    expect(describeBars("Pobór", "okno", [1, 3, null])).toBe(
      "Pobór, okno: najwięcej 3,0 kWh (dzień 2), najmniej 1,0 kWh (dzień 1), dane z 2 z 3 dni",
    );
    expect(describeBars("Pobór", "okno", [2, null, 2])).toBe(
      "Pobór, okno: po 2,0 kWh w każdym dniu z danymi, dane z 2 z 3 dni",
    );
  });

  it("is null when the series has no value", () => {
    expect(describeBars("Pobór", "okno", [null, null])).toBeNull();
    expect(describeBars("Pobór", "okno", [])).toBeNull();
  });
});

describe("month groups", () => {
  const MONTHS: MonthGroup[] = [
    { label: "lipiec 2026", pv: 300, load: 200, import: 50, completeDays: 14, calendarDays: 31 },
    { label: "sierpień 2026", pv: 500, load: 350, import: 80, completeDays: 29, calendarDays: 31 },
    { label: "wrzesień 2026", pv: null, load: null, import: null, completeDays: 5, calendarDays: 30 },
  ];

  it("orders the series PV, house use, grid import", () => {
    expect(monthGroupSeries(MONTHS)).toEqual([
      [300, 500, null],
      [200, 350, null],
      [50, 80, null],
    ]);
  });

  it("describes every series by month, with the month gaps and each month's complete days", () => {
    expect(describeMonthGroups(MONTHS)).toBe(
      "Produkcja z paneli, lipiec 2026 – wrzesień 2026: najwięcej 500,0 kWh (sierpień 2026), najmniej 300,0 kWh (lipiec 2026), dane z 2 z 3 miesięcy; " +
        "Zużycie domu, lipiec 2026 – wrzesień 2026: najwięcej 350,0 kWh (sierpień 2026), najmniej 200,0 kWh (lipiec 2026), dane z 2 z 3 miesięcy; " +
        "Prąd kupiony z sieci, lipiec 2026 – wrzesień 2026: najwięcej 80,0 kWh (sierpień 2026), najmniej 50,0 kWh (lipiec 2026), dane z 2 z 3 miesięcy. " +
        "Pełne dni: lipiec 2026 14 z 31, sierpień 2026 29 z 31, wrzesień 2026 5 z 30",
    );
  });

  it("is null with no months or no values", () => {
    expect(describeMonthGroups([])).toBeNull();
    expect(describeMonthGroups([MONTHS[2]])).toBeNull();
  });
});

describe("a line series that ends in a gap", () => {
  it("draws no empty segment after the last run", () => {
    // Four slots of 10 units; the bars peak at 4, so the line's 1 and 2 sit at 75,5 and 51,0.
    const g = barGeometry([[1, 2, 3, 4]], { ...OPTS, lineSeries: [1, 2, null, null] });
    expect(g?.line).toBe("M5.0,75.5 L15.0,51.0");
  });

  it("closes a lone point before a trailing gap as a dot, and nothing more", () => {
    const g = barGeometry([[1, 2, 3, 4]], { ...OPTS, lineSeries: [null, 4, null, null] });
    expect(g?.line).toBe("M15.0,2.0 L15.0,2.0");
  });
});

describe("describeBars ties and month wording", () => {
  it("names the first of equal highest days and the first of equal lowest days", () => {
    expect(describeBars("PV", "1–4 września", [5, 9, 9, 1])).toBe(
      "PV, 1–4 września: najwięcej 9,0 kWh (dzień 2), najmniej 1,0 kWh (dzień 4)",
    );
    expect(describeBars("PV", "1–4 września", [5, 1, 1, 9])).toBe(
      "PV, 1–4 września: najwięcej 9,0 kWh (dzień 4), najmniej 1,0 kWh (dzień 2)",
    );
  });

  it("calls an unlabelled slot a month when the slots are months", () => {
    expect(describeBars("PV", "2026", [5, 9, 1], "kWh", { slotNoun: "month" })).toBe(
      "PV, 2026: najwięcej 9,0 kWh (miesiąc 2), najmniej 1,0 kWh (miesiąc 3)",
    );
  });

  it("states equal values once per month", () => {
    expect(describeBars("PV", "2026", [4, 4, 4], "kWh", { slotNoun: "month" })).toBe(
      "PV, 2026: po 4,0 kWh w każdym miesiącu z danymi",
    );
  });
});

describe("describeMonthGroups with one month", () => {
  it("names the window by that month alone", () => {
    const one: MonthGroup = {
      label: "sierpień 2026",
      pv: 500,
      load: 350,
      import: 80,
      completeDays: 29,
      calendarDays: 31,
    };
    const text = describeMonthGroups([one]);
    expect(text).toContain("Produkcja z paneli, sierpień 2026: po 500,0 kWh w każdym miesiącu z danymi");
    expect(text).not.toContain("sierpień 2026 – sierpień 2026");
  });
});
