// Rough daily consumption of a typical Polish single-family house of about 140 m² heated by an air-source heat pump
// (heating and hot water), by month, index 0 = January. Shown only as a comparison, never used as the norm: this
// home's own median is the norm. An estimate, not a measured statistic: ~7,000 kWh a year from space heat of
// 55–80 kWh/m² (PORT PC, Q3 2024) at a seasonal COP of 3.0–3.4 (Fraunhofer ISE field test, 2025), heat-pump hot
// water (~1,150 kWh), and appliances from GUS 2021 (~2,800 kWh), spread over the year with Enea's G11 standard
// profile and Eurostat heating degree-days for Poland (2015–2025). Sources: docs/logic.md (usage insight, rule 9).
export const HEAT_PUMP_HOUSE_KWH_PER_DAY = [29, 28, 24, 20, 15, 11, 10, 11, 13, 18, 24, 28] as const;

// "wrześniu", as in "zużywa we wrześniu".
const MONTH_LOCATIVE = [
  "styczniu",
  "lutym",
  "marcu",
  "kwietniu",
  "maju",
  "czerwcu",
  "lipcu",
  "sierpniu",
  "wrześniu",
  "październiku",
  "listopadzie",
  "grudniu",
] as const;

// The comparison sentence for the month of `dayKey` (YYYY-MM-DD); "we wrześniu", "w" before every other month.
export function referenceUsageSentence(dayKey: string): string {
  const month = Number(dayKey.slice(5, 7)) - 1;
  const name = MONTH_LOCATIVE[month];
  const preposition = name.startsWith("wrz") ? "we" : "w";
  return (
    `Dla porównania: typowy dom w Polsce o powierzchni ok. 140 m² ogrzewany pompą ciepła zużywa ${preposition} ` +
    `${name} ok. ${String(HEAT_PUMP_HOUSE_KWH_PER_DAY[month])} kWh dziennie (szacunek z danych GUS i branżowych).`
  );
}
