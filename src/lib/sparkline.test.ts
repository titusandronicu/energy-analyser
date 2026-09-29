import { describe, expect, it } from "vitest";
import {
  describeSeries,
  FLAT_SPAN_EPSILON,
  flatCaption,
  MIN_SPARKLINE_POINTS,
  SPARKLINE_PAD,
  sparklineGeometry,
} from "./sparkline";

const W = 100;
const H = 30;
const SUBJECT = "Produkcja z paneli";
const WINDOW = "ostatnie 14 dni";

// x runs 2.0 to 98.0 in steps of 96 / (n - 1); y maps [min, max] onto [28.0, 2.0].
const FULL_14 = [10, 12, 11, 15, 18, 17, 20, 22, 21, 19, 24, 25.3, 8.1, 24.7];

describe("constants", () => {
  it("pins the documented values", () => {
    expect(MIN_SPARKLINE_POINTS).toBe(3);
    expect(SPARKLINE_PAD).toBe(2);
    expect(FLAT_SPAN_EPSILON).toBe(1e-9);
  });
});

describe("sparklineGeometry", () => {
  it("draws 14 full points as one run with the area closed down to the bottom", () => {
    expect(sparklineGeometry(FULL_14, W, H)).toEqual({
      line: "M2.0,25.1 L9.4,22.1 L16.8,23.6 L24.2,17.6 L31.5,13.0 L38.9,14.5 L46.3,10.0 L53.7,7.0 L61.1,8.5 L68.5,11.5 L75.8,4.0 L83.2,2.0 L90.6,28.0 L98.0,2.9",
      area: "M2.0,25.1 L9.4,22.1 L16.8,23.6 L24.2,17.6 L31.5,13.0 L38.9,14.5 L46.3,10.0 L53.7,7.0 L61.1,8.5 L68.5,11.5 L75.8,4.0 L83.2,2.0 L90.6,28.0 L98.0,2.9 L98.0,30.0 L2.0,30.0 Z",
      points: 14,
      min: 8.1,
      max: 25.3,
      last: 24.7,
      flat: false,
    });
  });

  it("breaks the line at gaps, draws an isolated point as a dot and closes only runs of two or more", () => {
    expect(sparklineGeometry([5, 6, null, 8, null, 9, 4, 7], W, H)).toEqual({
      line: "M2.0,22.8 L15.7,17.6 M43.1,7.2 L43.1,7.2 M70.6,2.0 L84.3,28.0 L98.0,12.4",
      area: "M2.0,22.8 L15.7,17.6 L15.7,30.0 L2.0,30.0 Z M70.6,2.0 L84.3,28.0 L98.0,12.4 L98.0,30.0 L70.6,30.0 Z",
      points: 6,
      min: 4,
      max: 9,
      last: 7,
      flat: false,
    });
  });

  it("keeps the space of a trailing gap, leaving the right end empty", () => {
    expect(sparklineGeometry([3, 5, 4, 6, null], W, H)).toEqual({
      line: "M2.0,28.0 L26.0,10.7 L50.0,19.3 L74.0,2.0",
      area: "M2.0,28.0 L26.0,10.7 L50.0,19.3 L74.0,2.0 L74.0,30.0 L2.0,30.0 Z",
      points: 4,
      min: 3,
      max: 6,
      last: 6,
      flat: false,
    });
  });

  it("draws exactly three points", () => {
    expect(sparklineGeometry([1, 3, 2], W, H)).toEqual({
      line: "M2.0,28.0 L50.0,2.0 L98.0,15.0",
      area: "M2.0,28.0 L50.0,2.0 L98.0,15.0 L98.0,30.0 L2.0,30.0 Z",
      points: 3,
      min: 1,
      max: 3,
      last: 2,
      flat: false,
    });
  });

  it("returns null under three non-gap values", () => {
    expect(sparklineGeometry([1, 2], W, H)).toBeNull();
    expect(sparklineGeometry([], W, H)).toBeNull();
    expect(sparklineGeometry([null, null, null], W, H)).toBeNull();
    expect(sparklineGeometry([1, null, 2, null, null], W, H)).toBeNull();
  });

  it("returns null for a single-slot-wide window", () => {
    expect(sparklineGeometry([4], W, H)).toBeNull();
    expect(sparklineGeometry([null], W, H)).toBeNull();
  });

  it("draws an all-equal non-zero series flat at mid-height", () => {
    expect(sparklineGeometry([3, 3, 3], W, H)).toEqual({
      line: "M2.0,15.0 L50.0,15.0 L98.0,15.0",
      area: "M2.0,15.0 L50.0,15.0 L98.0,15.0 L98.0,30.0 L2.0,30.0 Z",
      points: 3,
      min: 3,
      max: 3,
      last: 3,
      flat: true,
    });
  });

  it("draws an all-zero series flat on the baseline", () => {
    expect(sparklineGeometry([0, 0, 0], W, H)).toEqual({
      line: "M2.0,28.0 L50.0,28.0 L98.0,28.0",
      area: "M2.0,28.0 L50.0,28.0 L98.0,28.0 L98.0,30.0 L2.0,30.0 Z",
      points: 3,
      min: 0,
      max: 0,
      last: 0,
      flat: true,
    });
  });

  it("treats NaN and Infinity as gaps", () => {
    expect(sparklineGeometry([1, Number.NaN, 3, Number.POSITIVE_INFINITY, 2], W, H)).toEqual({
      line: "M2.0,28.0 L2.0,28.0 M50.0,2.0 L50.0,2.0 M98.0,15.0 L98.0,15.0",
      area: "",
      points: 3,
      min: 1,
      max: 3,
      last: 2,
      flat: false,
    });
    expect(sparklineGeometry([1, 2, Number.NaN, Number.NEGATIVE_INFINITY], W, H)).toBeNull();
  });

  it("draws isolated points only as dots with an empty area", () => {
    expect(sparklineGeometry([1, null, 2, null, 3], W, H)).toEqual({
      line: "M2.0,28.0 L2.0,28.0 M50.0,15.0 L50.0,15.0 M98.0,2.0 L98.0,2.0",
      area: "",
      points: 3,
      min: 1,
      max: 3,
      last: 3,
      flat: false,
    });
  });
});

describe("describeSeries", () => {
  it("states min, max and the last value, with no gap clause for a full window", () => {
    expect(describeSeries(SUBJECT, WINDOW, FULL_14)).toBe(
      "Produkcja z paneli, ostatnie 14 dni: od 8,1 do 25,3 kWh, ostatnia dostępna wartość 24,7 kWh",
    );
  });

  it("adds the days-with-data clause only when some slots are gaps", () => {
    expect(describeSeries(SUBJECT, WINDOW, [5, 6, null, 8, null, 9, 4, 7])).toBe(
      "Produkcja z paneli, ostatnie 14 dni: od 4,0 do 9,0 kWh, ostatnia dostępna wartość 7,0 kWh, dane z 6 z 8 dni",
    );
    expect(describeSeries(SUBJECT, WINDOW, [3, 5, 4, 6, null])).toBe(
      "Produkcja z paneli, ostatnie 14 dni: od 3,0 do 6,0 kWh, ostatnia dostępna wartość 6,0 kWh, dane z 4 z 5 dni",
    );
  });

  it("reads an all-equal series as unchanged, never as a trend", () => {
    expect(describeSeries(SUBJECT, WINDOW, [3, 3, 3])).toBe(
      "Produkcja z paneli, ostatnie 14 dni: bez zmian, 3,0 kWh w każdym dniu z danymi",
    );
    expect(describeSeries(SUBJECT, WINDOW, [0, null, 0, 0])).toBe(
      "Produkcja z paneli, ostatnie 14 dni: bez zmian, 0,0 kWh w każdym dniu z danymi, dane z 3 z 4 dni",
    );
  });

  it("uses the given unit", () => {
    expect(describeSeries("Moc", WINDOW, [1, 3, 2], "kW")).toBe(
      "Moc, ostatnie 14 dni: od 1,0 do 3,0 kW, ostatnia dostępna wartość 2,0 kW",
    );
  });

  it("is null exactly when nothing is drawn", () => {
    expect(describeSeries(SUBJECT, WINDOW, [1, 2])).toBeNull();
    expect(describeSeries(SUBJECT, WINDOW, [])).toBeNull();
    expect(describeSeries(SUBJECT, WINDOW, [null, null, null])).toBeNull();
  });
});

describe("flatCaption", () => {
  it("captions an all-equal non-zero series with its value", () => {
    expect(flatCaption([3, 3, 3])).toBe("bez zmian, 3,0 kWh");
  });

  it("captions an all-zero series", () => {
    expect(flatCaption([0, 0, 0])).toBe("bez zmian, 0,0 kWh");
    expect(flatCaption([0, null, 0, 0])).toBe("bez zmian, 0,0 kWh");
  });

  it("is null for a varying series and for one too short to draw", () => {
    expect(flatCaption(FULL_14)).toBeNull();
    expect(flatCaption([1, 3, 2])).toBeNull();
    expect(flatCaption([0, 0])).toBeNull();
  });
});
