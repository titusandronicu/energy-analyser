import { describe, expect, it } from "vitest";
import {
  crossesSensorChange,
  SENSOR_CAVEAT,
  SENSOR_CHANGE_BASELINE_NOTE,
  SENSOR_CHANGE_DAY,
  SENSOR_CHANGE_RATING_BASIS,
  SENSOR_DIRECTION_CHANGED_ON,
  SENSOR_EXPLANATION,
  SENSOR_TERM,
} from "./grid-sensor";

describe("sensor change dates", () => {
  it("puts the mixed day right before the first whole day after the change", () => {
    expect(SENSOR_CHANGE_DAY).toBe("2026-08-03");
    expect(SENSOR_DIRECTION_CHANGED_ON).toBe("2026-08-04");
  });
});

describe("crossesSensorChange", () => {
  it.each([
    ["2026-08-03", "2026-08-03", false],
    ["2026-08-03", "2026-08-04", true],
    ["2026-08-04", "2026-08-04", false],
    ["2026-07-21", "2026-08-17", true],
    ["2026-08-04", "2026-08-18", false],
    ["2026-07-16", "2026-08-02", false],
  ])("%s – %s crosses: %s", (first, last, expected) => {
    expect(crossesSensorChange(first, last)).toBe(expected);
  });
});

describe("sensor copy", () => {
  it("states the whole-history caveat and names 4 August only as the direction change", () => {
    expect(SENSOR_CAVEAT).toBe(
      "Prąd kupiony z sieci i zużycie domu pochodzą z czujnika prądu falownika, który od początku historii mierzy źle, więc te liczby są niepewne do czasu sprawdzenia czujnika przez instalatora.",
    );
    expect(SENSOR_TERM).toBe("Prąd kupiony z sieci i zużycie domu");
    expect(SENSOR_EXPLANATION).toBe(
      "Falownik mierzy prąd z sieci wadliwym czujnikiem od początku historii (16 lipca 2026), a zużycie domu wylicza z tego samego czujnika, więc obie liczby są niepewne. Do 3 sierpnia pokazywał za mało prądu kupionego z sieci. 4 sierpnia 2026 zmienił się kierunek czujnika: od tego dnia prąd kupiony z sieci jest zawyżony, zwłaszcza w dzień, a prąd oddany do sieci zaniżony. Czujnik sprawdzi instalator; wcześniejsze dni zostaną z tą uwagą.",
    );
    expect(SENSOR_CHANGE_RATING_BASIS).toBe(
      "4 sierpnia 2026 zmienił się kierunek czujnika prądu falownika. Norma tego dnia sięgałaby dni sprzed tej zmiany, a ich liczb nie da się z późniejszymi porównać, więc ten dzień nie jest oceniany.",
    );
    expect(SENSOR_CHANGE_BASELINE_NOTE).toBe(
      "Norma obejmuje dni sprzed i po 4 sierpnia 2026, kiedy zmienił się kierunek czujnika prądu falownika, więc to porównanie jest szczególnie niepewne.",
    );
  });
});
