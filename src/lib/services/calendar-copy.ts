import { HISTORY_START } from "@/lib/calendar/period";
import { addDays, dayMonthYear, formatDayMonth, formatMonth } from "@/lib/format/warsaw-time";
import { SENSOR_CHANGE_DAY, SENSOR_DIRECTION_CHANGED_ON } from "@/lib/services/grid-sensor";
import { MIN_RANKED_DAYS } from "@/lib/services/hourly-usage";
import {
  LOW_SUN_SHARE,
  MONTH_RUNNING,
  RATING_MIN_DAYS,
  RATING_THRESHOLD_POINTS,
  RATING_WINDOW_DAYS,
} from "@/lib/services/period-rating";
import { FORECAST_HISTORY_START } from "@/lib/services/recommendation";

// The calendar views' copy: the reasons, captions and "Co to znaczy?" entries the day, month and quarter views say in
// words. Kept apart from the view builders (calendar-view.ts) so that file is logic; every string is unchanged.

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

// The chart captions' pointer to the sensor caveat (grid-sensor.ts), which covers the whole history.
const SENSOR_UNCERTAIN = "Prąd kupiony z sieci i zużycie domu są przez całą historię niepewne";

// The last day whose rating norm would still reach a day before the sensor's direction changed ("17 sierpnia"); the
// rating window's days run from SENSOR_CHANGE_DAY, both in August, so the first is said as its day number only.
const SENSOR_WINDOW_LAST = addDays(SENSOR_DIRECTION_CHANGED_ON, RATING_WINDOW_DAYS - 1);

// The caption under the month's daily charts.
export const MONTH_CHART_NOTE = `Dni bez danych zostają puste, a dzisiejszy dzień nie jest rysowany, bo jeszcze trwa. ${SENSOR_UNCERTAIN} (zobacz „Co to znaczy?”).`;
// The caption under the quarter's grouped chart.
export const QUARTER_CHART_NOTE = `Miesiąc z mniej niż ${String(MIN_RANKED_DAYS)} pełnymi dniami zostaje pusty. ${SENSOR_UNCERTAIN}.`;

// The "Co to znaczy?" entries that state a rule's value.
export const TOO_FEW_EXPLANATION = `Gdy okres ma mniej niż ${String(MIN_RANKED_DAYS)} pełnych dni, sumy nie są pokazywane, bo mówiłyby więcej, niż wiadomo. Niedokończony miesiąc albo kwartał pokazuje to, co już jest, bez przeliczania na całość.`;
export const FORECAST_EXPLANATION = `Porównanie prognozy produkcji z tym, co panele naprawdę dały. Prognozy zapisujemy od ${dayMonthYear(FORECAST_HISTORY_START)}, więc wcześniejsze dni nie mają porównania.`;
// The "Co to znaczy?" entries for the day and month ratings (S-17), their numbers taken from the rating constants.
export const SELF_SUFFICIENCY_TERM = "Samowystarczalność";
export const SELF_SUFFICIENCY_EXPLANATION =
  "Jaka część zużycia domu nie była kupiona z sieci, tylko przyszła z paneli albo z baterii. 100% to dzień bez prądu z sieci, 0% to dzień, w którym cały prąd był kupiony.";
export const RATING_TERM = "Ocena dnia i miesiąca";
export const RATING_EXPLANATION = `Dzień jest porównywany z normą domu: medianą samowystarczalności z pełnych dni wśród ${String(RATING_WINDOW_DAYS)} dni przed nim. Norma potrzebuje co najmniej ${String(RATING_MIN_DAYS)} takich dni, inaczej dzień nie jest oceniany. Więcej niż ${String(RATING_THRESHOLD_POINTS)} punktów procentowych powyżej normy to dobry dzień, więcej niż ${String(RATING_THRESHOLD_POINTS)} poniżej to słaby, a wszystko pomiędzy to przeciętny. Zakończony miesiąc jest oceniany tak samo, po medianie odchyleń swoich ocenionych dni. Samowystarczalność idzie głównie za słońcem, więc słoneczne dni wypadają lepiej, a pochmurne gorzej; gdy panele dały mniej niż ${String(Math.round(LOW_SUN_SHARE * 100))}% tego, co zwykle, ocena mówi „Mało słońca”. Po południu ${dayMonthYear(SENSOR_CHANGE_DAY)} zmienił się kierunek czujnika prądu falownika, więc dni od ${String(Number(SENSOR_CHANGE_DAY.slice(8)))} do ${formatDayMonth(SENSOR_WINDOW_LAST)} (${formatDayMonth(SENSOR_CHANGE_DAY)} sam łączy obie strony), których norma sięgałaby sprzed tej zmiany, są „Poza oceną”, a norma nigdy nie łączy dni sprzed i po zmianie. Miesiąc zmiany (${formatMonth(SENSOR_CHANGE_DAY.slice(0, 7))}) jest oceniany tylko z dni od ${formatDayMonth(SENSOR_DIRECTION_CHANGED_ON)}. Dni z okna zmiany, choć „Poza oceną”, liczą się do późniejszych norm. Inaczej jest z dniami, w których z sieci kupiono więcej, niż dom zużył (np. ładowanie baterii z sieci albo błąd licznika): są „Poza oceną” i nie są ani oceniane, ani liczone do norm.`;

// A running month's rating slot still says why it is not rated, under the grey "Bez oceny" badge.
export const MONTH_NOT_RATED = `${MONTH_RUNNING} — oceniamy tylko zakończone miesiące`;
