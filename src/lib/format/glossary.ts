// One-sentence plain-Polish explanations of the terms the cards use. Later cards reuse the same wording.
export type GlossaryTerm =
  "pv" | "kw" | "kwh" | "battery_soc" | "grid_import" | "grid_export" | "norm" | "forecast" | "forecast_certainty";

export const GLOSSARY: Record<GlossaryTerm, { term: string; explanation: string }> = {
  pv: {
    term: "Panele słoneczne (PV)",
    explanation: "Panele na dachu, które zamieniają światło słoneczne w prąd dla domu.",
  },
  kw: {
    term: "kW (moc teraz)",
    explanation: "Ile prądu płynie w tej chwili — jak szybko leci woda z kranu (litry na minutę).",
  },
  kwh: {
    term: "kWh (energia w okresie)",
    explanation: "Ile prądu zebrało się przez jakiś czas, np. przez dzień — jak woda nalana do wiadra (litry).",
  },
  battery_soc: {
    term: "Naładowanie baterii",
    explanation: "W ilu procentach bateria domowa jest teraz pełna: 100% to pełna, 0% to pusta.",
  },
  grid_import: {
    term: "Prąd kupiony z sieci",
    explanation:
      "Prąd, który dom pobrał z sieci energetycznej, bo nie starczyło z paneli i baterii — za niego płacisz.",
  },
  grid_export: {
    term: "Prąd sprzedany do sieci",
    explanation: "Nadmiar prądu z paneli, który dom oddał do sieci energetycznej, bo nie było go gdzie zużyć.",
  },
  norm: {
    term: "Norma",
    explanation: "Średnia z podobnych dni, z którymi porównujemy — pokazuje, czy dzień był zwykły, czy nie.",
  },
  forecast: {
    term: "Prognoza produkcji z paneli",
    explanation: "Szacunek, ile prądu dadzą panele danego dnia, na podstawie prognozy pogody.",
  },
  forecast_certainty: {
    term: "Pewność prognozy",
    explanation: "Jak bardzo można ufać prognozie, sprawdzone na tym, jak trafne były wcześniejsze prognozy.",
  },
};
