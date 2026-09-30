// One-sentence plain-Polish explanations of the terms the cards use. Later cards reuse the same wording.
export type GlossaryTerm =
  | "pv"
  | "kw"
  | "kwh"
  | "battery_soc"
  | "grid_import"
  | "grid_export"
  | "norm"
  | "forecast"
  | "forecast_certainty"
  | "bill_forecast"
  | "bill_range"
  | "net_metering"
  | "system_balance"
  | "house_use"
  | "night_grid_draw";

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
    explanation:
      "Typowe zużycie z podobnych dni, z którymi porównujemy (mediana: w połowie tych dni zużycie było niższe, w połowie wyższe) — pokazuje, czy dzień był zwykły, czy nie.",
  },
  forecast: {
    term: "Prognoza produkcji z paneli",
    explanation: "Szacunek, ile prądu dadzą panele danego dnia, na podstawie prognozy pogody.",
  },
  forecast_certainty: {
    term: "Pewność prognozy",
    explanation: "Jak bardzo można ufać prognozie, sprawdzone na tym, jak trafne były wcześniejsze prognozy.",
  },
  bill_forecast: {
    term: "Prognoza rachunku",
    explanation:
      "Szacunek, ile wyjdzie rachunek za prąd za cały ten miesiąc, policzony z dotychczasowego zużycia i cen z Twojej taryfy — to nie faktura z PGE.",
  },
  bill_range: {
    term: "Kwota od–do",
    explanation:
      "Przedział, w którym najprawdopodobniej zmieści się rachunek; im mniej dni miesiąca minęło, tym jest szerszy.",
  },
  net_metering: {
    term: "Opust (rozliczenie z PGE)",
    explanation:
      "Prąd oddany do sieci nie jest sprzedawany za pieniądze, tylko odkładany: za każdą oddaną kilowatogodzinę możesz później pobrać 0,8 kWh bez płacenia za energię, a niewykorzystany zapas przechodzi na kolejne miesiące.",
  },
  system_balance: {
    term: "Bilans systemu",
    explanation:
      "Panele minus zużycie domu w tej chwili. Plus to nadwyżka: prąd z paneli, którego dom nie zużywa, idzie do baterii albo do sieci. Minus to niedobór: dom bierze brakujący prąd z baterii albo z sieci.",
  },
  house_use: {
    term: "Zużycie domu",
    explanation:
      "Cały prąd, który dom zużył w danej godzinie lub dniu, bez względu na to, skąd przyszedł: z paneli, z baterii czy z sieci.",
  },
  night_grid_draw: {
    term: "Pobór z sieci w nocy",
    explanation:
      "Prąd kupiony z sieci między 22:00 a 6:00, kiedy panele nie pracują; liczony godzina po godzinie, tak jak rozlicza go PGE, więc prąd oddany do sieci w jednej godzinie nie pomniejsza poboru w innej.",
  },
};
