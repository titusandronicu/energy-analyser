import { HISTORY_START } from "@/lib/calendar/period";
import { dayMonthYear, formatDayMonth } from "@/lib/format/warsaw-time";

// The inverter's grid sensor has measured wrongly since HISTORY_START, and house use is derived from the same sensor,
// so every grid import and house-use figure carries one caveat (docs/logic.md). On SENSOR_CHANGE_DAY, at about 16:00,
// the sensor's direction changed: before it grid import was understated, after it overstated. Nothing is corrected
// numerically. A leaf module, so the calendar, the ratings and the usage card can all read it without a cycle.

// The first whole Warsaw day after the sensor's direction changed.
export const SENSOR_DIRECTION_CHANGED_ON = "2026-08-04";
// The mixed day: the direction changed during it, so its own totals hold both sides.
export const SENSOR_CHANGE_DAY = "2026-08-03";

// True when the days first..last (inclusive) hold days from both sides of the change: first < CHANGED_ON ≤ last.
export function crossesSensorChange(first: string, last: string): boolean {
  return first < SENSOR_DIRECTION_CHANGED_ON && SENSOR_DIRECTION_CHANGED_ON <= last;
}

// The one line under every card that shows grid import or house use.
export const SENSOR_CAVEAT =
  "Prąd kupiony z sieci i zużycie domu pochodzą z czujnika prądu falownika, który od początku historii mierzy źle, więc te liczby są niepewne do czasu sprawdzenia czujnika przez instalatora.";

// The "Co to znaczy?" entry on the history page.
export const SENSOR_TERM = "Prąd kupiony z sieci i zużycie domu";
export const SENSOR_EXPLANATION = `Falownik mierzy prąd z sieci wadliwym czujnikiem od początku historii (${dayMonthYear(HISTORY_START)}), a zużycie domu wylicza z tego samego czujnika, więc obie liczby są niepewne. Do popołudnia ${formatDayMonth(SENSOR_CHANGE_DAY)} pokazywał za mało prądu kupionego z sieci. Tego popołudnia zmienił się kierunek czujnika: od ${dayMonthYear(SENSOR_DIRECTION_CHANGED_ON)} prąd kupiony z sieci jest zawyżony, zwłaszcza w dzień, a prąd oddany do sieci zaniżony. Czujnik sprawdzi instalator; wcześniejsze dni zostaną z tą uwagą.`;

// The basis of a day in the sensor-change window, under the "Poza oceną" badge. Neutral: it describes, never blames.
export const SENSOR_CHANGE_RATING_BASIS = `Po południu ${dayMonthYear(SENSOR_CHANGE_DAY)} zmienił się kierunek czujnika prądu falownika. Norma tego dnia sięgałaby dni sprzed tej zmiany, a ich liczb nie da się z późniejszymi porównać, więc ten dzień nie jest oceniany.`;

// The basis of the mixed change day itself, under the "Poza oceną" badge: its own readings hold both sides.
export const SENSOR_CHANGE_DAY_BASIS = `${dayMonthYear(SENSOR_CHANGE_DAY)} po południu zmienił się kierunek czujnika prądu falownika, więc ten dzień łączy odczyty sprzed i po zmianie i nie jest oceniany.`;

// The usage card's note when its baseline and the compared day lie on different sides of the change (the baseline may
// straddle it or lie wholly before it).
export const SENSOR_CHANGE_BASELINE_NOTE = `Norma i porównywany dzień leżą po różnych stronach zmiany kierunku czujnika prądu falownika (po południu ${dayMonthYear(SENSOR_CHANGE_DAY)}), więc to porównanie jest szczególnie niepewne.`;
