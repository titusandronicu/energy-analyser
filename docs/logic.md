# Logic

The rules Energy Analyser and the home lab apply to the data, with the exact thresholds the code uses. Rules marked **planned** come from PRD v3 and the roadmap and are not built yet. All days are Europe/Warsaw calendar days.

## Where each rule runs

| Rule                                                                             | Runs in                                       | Source                                                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| Live state and its staleness                                                     | App                                           | `src/lib/services/live-state.ts`                                                  |
| Usage insight (season-adjusted baseline)                                         | App                                           | `src/lib/services/usage-insight.ts`                                               |
| Recommendation staleness and labels                                              | App                                           | `src/lib/services/recommendation.ts`                                              |
| Bill forecast card: freshness, minimum days, verdict bands, plausibility ceiling | App                                           | `src/lib/services/bill-forecast.ts`                                               |
| Status colours, period text, term explanations                                   | App                                           | `src/lib/format/status.ts`, `period.ts`, `glossary.ts`                            |
| Daily totals per day, which days are complete                                    | Lab                                           | homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py`              |
| Current-month bill forecast                                                      | Lab                                           | homelab-2 `infra/compose/energy-app/scripts/build-current-month-bill-forecast.py` |
| Facts bundle and battery recommendation                                          | Lab (deterministic rules, then LLM narration) | homelab-2 `build-energy-agent-briefing.py`, `run-energy-advisory.py`              |
| PV forecast                                                                      | Solcast via Home Assistant, read by the lab   | homelab-2 `collect-ha-snapshot.py`                                                |

## Live state

- The lab pushes every 5 minutes. A snapshot older than **15 minutes** is shown as stale with its age ("5 min", "2 godz.", "3 dni"), never hidden; older than **2 hours** it is a problem (the lab has most likely stopped pushing). See [Status colours and data periods](#status-colours-and-data-periods).
- Flows below **50 W** count as noise and show as "0,0 kW" without a direction word.
- Sign conventions: grid positive = buying from the grid, negative = selling; battery positive = discharging, negative = charging. The app shows the value unsigned with a direction word.

## Usage insight: is recent usage normal?

The app compares the most recent complete day's consumption with a baseline and says _normal_, _above_ or _below_.

1. **Compared day:** yesterday, or the newest day with a consumption value within the last **7 days** if yesterday is missing. Today is never compared (it is not over).
2. **Seasonal baseline first:** all days within **±14 days** of the same date in earlier years (up to one year back, since the app loads **400 days** of history). It is used when it has at least **20 days** with data.
3. **Fallback:** otherwise the previous **30 days**, used when at least **7** of them have data, and the card says plainly that the fallback is in use.
4. **Not enough data:** with fewer than 7 fallback days, or no day with consumption in the last 7 days, no verdict is shown; the card says what is missing.
5. **Norm:** the **median** of the baseline days' consumption (for an even count, the mean of the two middle days). Grid purchase uses the median of the baseline days that have one; a median of 0 shows "—" instead of a change.
6. **Verdict:** more than **15%** above or below the norm is _above_ / _below_; exactly ±15% is still _normal_. More than **40%** above is _far above_; exactly +40% is still _above_.
7. The card names the baseline days it used ("mediana z 18 dni: 27 sierpnia – 25 września").
8. **Meaning of the day ("Co to znaczy?"):** the day's kWh, the norm in kWh, and four ranges whose edges are the verdict thresholds: _niskie_ below 0.85 × norm, _w normie_ 0.85–1.15 ×, _wysokie_ 1.15–1.40 ×, _bardzo wysokie_ above 1.40 ×. The range marked "ten dzień" is always the one the badge shows; a day whose one-decimal kWh would print as an edge it is not on (34,52 against the edge 34,5) shows two decimals, as the percentage does at ±15% and +40% ("+40,0%" is still _wysokie_, "+40,1%" is _bardzo wysokie_). A zero norm draws no ranges and the card shows the glossary instead.
9. **Comparison with a typical house:** one line with the estimated daily use of a ~140 m² Polish house with an air-source heat pump in the compared day's month (29, 28, 24, 20, 15, 11, 10, 11, 13, 18, 24, 28 kWh for January–December; `src/lib/format/reference-usage.ts`). It is context only and never enters the norm or the verdict. The figures are an estimate, not a measured statistic: about 7,000 kWh a year from space heat of 55–80 kWh/m² (PORT PC, Q3 2024) at a seasonal COP of 3.0–3.4 (Fraunhofer ISE field test, 2025), heat-pump hot water (about 1,150 kWh) and appliances (about 2,800 kWh, GUS 2021), spread over the months with Enea's G11 standard profile (2025) and Eurostat heating degree-days for Poland (2015–2025); the monthly table is in `context/archive/2026-09-26-usage-norm-scale/research.md`.

Why the median: the mean was a default, never a decision. On the real data (2026-08-26 to 2026-09-25) the two disagreed on 3 of 19 days, each time because a few inconsistent early rows (2026-07-26 to 2026-08-03) pulled the mean down; one unusual day moves a median far less. Why the typical house stays out of the norm: this house used about 36 kWh a day in September 2026 against about 13 kWh for the estimate, so blending the estimate in would mark ordinary days as above the norm. The norm corrects itself over time from the house's own days: the 30-day window moves daily, and the seasonal baseline takes over once a year of history exists.

Why seasonal: a flat recent average mislabels normal seasonal change (winter heating, summer air conditioning) as anomalies. The app's history starts on 2026-07-26 and the lab's on 2026-07-16 (the backfill, roadmap F-03, adds those ten days), so the fallback is what runs until about July 2027, when a year of history exists.

## Today's recommendation

- The lab's deterministic rules compute a facts bundle; the stronger LLM narrates it in Polish without adding numbers. The app shows the narration with the forecast and the facts it is based on.
- The recommendation is **stale** when it was generated more than **2 hours** ago (the lab narrates about hourly, so two missed runs) or before the start of today.
- The forecast figures name their days: "dziś" and "jutro" are the day the advice was generated and the day after.
- Forecast certainty is always shown as not known yet ("jeszcze nie wiadomo — prognozy zbierane od 27 września"); the lab's optional `confidence` is ignored because it never states its basis. **Planned (S-11):** certainty computed from past forecast accuracy and Solcast's low/high range. Accuracy counts days from **2026-09-27** (`FORECAST_HISTORY_START`): the stored forecast for 2026-09-26 came from Forecast.Solar, which overshoots.

## Status colours and data periods

Every card shows a status badge under its heading: a colour **and** a word, so the text alone carries the meaning.

| Tone         | Colour | Word            |
| ------------ | ------ | --------------- |
| good         | green  | dobrze          |
| watch        | amber  | warto sprawdzić |
| problem      | red    | problem         |
| insufficient | grey   | za mało danych  |

The badge reads "<word> · <detail>", e.g. "Warto sprawdzić · dane sprzed 40 min". Exactly at a line is always the milder status. A card whose data failed to load shows "Problem · nie udało się wczytać".

- **Live state:** good ("aktualne") up to **15 minutes** old; watch ("dane sprzed …") over 15 minutes; problem ("brak nowych danych od …") over **2 hours**. A fresh snapshot the lab marks degraded is watch ("niepełne dane z Home Assistant"); staleness wins over degraded. Nothing received yet is insufficient.
- **Usage insight:** normal or below the norm is good ("w normie" / "poniżej normy"); more than **15%** above is watch ("powyżej normy"); more than **40%** above is problem ("dużo powyżej normy"). The grid-purchase figure shows its change against the norm but is not rated (ratings are S-17).
- **Recommendation:** good ("aktualna") when generated today within **2 hours**; watch ("sprzed …") when from today but older; problem ("z <day> — dotyczy innego dnia") when generated before today. Nothing received yet is insufficient.
- **Bill forecast:** the badge is the verdict against the last real invoice — good ("nie więcej niż ostatni rachunek (…)"), watch ("do 20% powyżej …"), problem ("ponad 20% powyżej …"); insufficient when there is no closed invoice to compare with. Every refusal path (the lab's three `no_data` reasons, a calculation older than **30 minutes** or dated in the future, an unreadable, reversed, self-contradicting or implausible amount, fewer than **7** complete days) shows its reason and no number. A forecast for another month keeps its figure and turns problem, naming the month it covers. The card's own confidence badge is the lab's `confidence`, and it names the reference month whenever that month lags.
- **Forecast certainty:** always insufficient, "jeszcze nie wiadomo", until S-11 computes it from forecast accuracy.
- **Not enough data:** the usage card says what it needs: "brak zużycia z ostatnich 7 dni", or "potrzeba co najmniej 7 dni z ostatnich 30, jest <n>". No verdict is guessed from too little data.
- **Period text:** every derived figure says which days it rests on, as "<count> <dzień|dni>: <first> – <last>", e.g. "1 dzień: 24 września", "18 dni: 27 sierpnia – 25 września", "2 dni: 23–24 września". The range runs from the first to the last day used even when days in between are missing. The year is shown on both ends when the range spans two years, and once when the whole range is in an earlier year ("20 dni: 10–29 września 2025"). Live "today" totals say "dziś od północy do <HH:MM>" (or the capture's date when it is from an earlier day).
- **Terms:** each card has a folded "Co to znaczy?" box explaining its technical terms in one sentence each (`src/lib/format/glossary.ts`).
- **Readability:** badge text and the small grey notes keep at least **4.5:1** contrast against the glass card (WCAG 1.4.3; badges measure 7:1 or more, grey notes use `text-blue-100/70`, not `/50`, which measured about 4:1). The "Co to znaczy?" and "Na podstawie" toggles are at least 24 px tall for a thumb (WCAG 2.5.8).
- **Advice from an earlier day:** the recommendation view says so explicitly (`isFromEarlierDay`); the card names the forecast days by date instead of "dziś"/"jutro" from that flag, not from the badge colour.

## Daily totals (lab → app)

- Every push carries up to the last **35 days** of per-day totals (PV production, consumption, grid import, grid export, PV forecast); the contract allows at most **62**. Today's entry is partial and replaced by each later push.
- A past day counts only when its counters were read correctly (`counters_ok`) and the data covers the day to its end; incomplete days are sent with empty totals rather than wrong ones.
- The day's PV forecast is the first forecast reading at or after **06:00** local time.
- Forecast source since 2026-09-26: **Solcast** (forecast plus low/high estimates, recorded in the lab's history). Forecast.Solar is kept only for comparison; it overshot real production on this flat array. Its today/tomorrow values are recorded in the lab's history once homelab-2 #28 is installed, so the two sources can be compared.

## Bill forecast (lab → app)

The lab has computed this since 2026-09-27 and writes it with every 5-minute refresh; the Telegram bot and the lab page read it. Since 2026-09-28 the app accepts it as the optional `bill_forecast` section and shows it on the dashboard as the "Prognoza rachunku" card (S-07); the lab starts sending it once that version of the app is deployed, as [Changing the contract](ingest/README.md#changing-the-contract) requires. The rules below run in the lab; [what the app does with the figure](#what-the-app-shows-s-07) is at the end of this section.

The house is a prosumer on Poland's older settlement scheme, **net-metering** ("opust"). Energy sent to the grid is not sold for money: it is banked. For every kWh fed in, **0.8** kWh may later be taken back without paying the energy charge, and credit left unused carries over to the following months. So the invoice is not "everything you took × the price". It is "everything you took, minus the credit you had banked, × the price", plus the fixed monthly fees, which are due whatever the meter says.

- **Imported energy** for the month = the mean grid import of the month's complete days so far × the number of days in the month. A day counts only under the same completeness rule as [Daily totals](#daily-totals-lab--app), and today is never counted. A day reading above **200 kWh** is dropped as a counter glitch.
- **Credit** = 0.8 × the export ratio × the imported energy, plus credit carried in. The **export ratio** is the exported ÷ imported energy of the last month PGE actually settled, because the inverter's own export counter cannot be used here (94.7 kWh against PGE's 342 for August).
- **Billable energy** = imported − credit, never below zero. Credit beyond this month's import is reported separately (`credit_left_kwh`), never as a negative bill.
- **Bill** = billable energy × the variable gross rate + the fixed gross fees, both taken from the lab's G11 tariff table: **1.0991 PLN/kWh** and **44.62 PLN** a month, last checked against a real invoice on **2026-09-27**.
- **Carried credit.** The connector reports left-over credit as fed-in kWh _before_ the factor, so it is counted as 0.8 × the left-over figure. It has been **0** in the one settled month on record (August 2026), so this reading is recorded as an assumption (`carried_credit_basis`) and is to be re-checked the first time it is not 0.
- **Confidence** follows the day count: **low** below **7** complete days, **medium** below **14**, **high** at 14 or more. It is forced down to **low** whenever the reference month lags (below), and whenever the closed-month check misses by more than **25%**.
- **No figure rather than a wrong one.** Instead of guessing, the forecast publishes `status: "no_data"` with a reason: `no_complete_days` (this month has no finished day yet, or the daily history could not be read), `settlement_facts_missing` (the factor, consumed or fed-in energy is missing, the settled month is under **50 kWh**, or the export ratio is above **2.0**), `rates_unavailable` (the tariff table could not be read). Everything reading the file is meant to check `status` before it reads a number — with one exception today: the deployed Telegram bot still renders `0.00 PLN` on a `no_data` body, until the bot backport lands (`bill-accuracy` 3.5, deferred).

**The reference month lags, and the figure re-bases when a new invoice arrives.** PGE issues an invoice about three weeks after the month it covers, and the connector only ever holds the latest one. So from the 1st of a month until roughly the 22nd, the newest settled month is the month _before_ last — and a month-old ratio can be far off: July's was 0.53 against August's 0.81, which on the same 549 kWh moves the estimate from 392 PLN to 258 PLN. The forecast records the gap as `reference_lag_months` (**0** when the reference is the month immediately before this one). Above 0 it widens the range, forces confidence to **low**, and ignores carried credit altogether, because the month in between has already drawn on that credit by an amount PGE has not reported yet. As soon as the new invoice arrives the forecast re-bases on it, so the figure can move noticeably around the 22nd of a month.

**The range.** Two errors are combined as independent (added in quadrature), not assumed to strike together: `u`, the sampling noise of a short month, is `max(15%, min(40%, 50 ÷ √days))`; `r`, how far the export ratio may have moved since it was measured, is **25%** at lag 0 and **40%** above it. The spread is `√((u × (billable + carried))² + (0.8 × ratio × r × imported)²)`, and the two ends are priced from billable − spread (never below zero) and billable + spread. On the real September data — 549 kWh imported, ratio 0.809, 15 complete days — that is **155–361 PLN around 258**.

**The closed-month check.** When the reference period carries an invoice total, the run re-prices that month from the consumed and fed-in energy PGE actually settled and compares the two (`closed_month_check`, `ok` within **±5%**). Without one the key is absent altogether, so anything reading the file treats it as optional. It tests the arithmetic, not the estimate: it cannot detect a wrong export ratio, and it drifts when PGE changes prices — August's implied rate was 1.14 PLN/kWh against today's 1.0991, which puts the check at −2.7% before any error of the formula (208.83 against the 214.66 invoiced). A failing check is always reported and never suppresses the projection.

Why credit the export at all: it is the whole difference between a plausible bill and a wrong one. Pricing every imported kWh put August at about 509 PLN against the 214.66 PLN actually invoiced; crediting it gives about 209 PLN, and July comes out at about 489 PLN against 495.22. Why estimate the export from last month's ratio instead of measuring it: PGE settled 342 kWh fed in for August where the inverter's counter read 94.7, and PGE records export at night, when the panels cannot be producing. Until that is explained (`context/changes/grid-export-mismatch/`) the house has no trustworthy in-month export figure of its own, and the last settled month's ratio is the closest honest stand-in — which is exactly why its age is published and why it drags the confidence down.

### What the app shows (S-07)

The app displays the lab's figure and never re-prices anything (`prd-v3.md:268`). Its own rules live in `src/lib/services/bill-forecast.ts`, each as a named constant, and they decide only whether a figure may be shown at all:

- **The range is the headline** ("od 155 zł do 360 zł"); the central estimate reads beneath it as "ok. 258 zł". Money is shown in whole złoty: a figure carrying a ±40% band quoted to the grosz would assert precision it does not have.
- **Freshness: 30 minutes**, judged against the body's own `generated_at`, never the push's `captured_at` — a stale forecast riding inside a fresh push is the documented failure, and `captured_at` staleness is already the live state card's job. Past it the card says how old the calculation is and shows no figure.
- **Minimum 7 complete days.** Below that the card is grey ("za mało danych") and quotes the average daily use instead of a złoty figure.
- **Verdict** against `closed_month_check.invoice_gross_pln`, the last real invoice: at or below it is good, up to **+20%** is worth checking, above is a problem; exactly on a line takes the milder status. With no invoice to compare against there is no verdict at all — the badge says so — and never a fallback to the lab's own `computed_gross_pln`, which would change the colour's meaning from "against your last bill" to "against our own arithmetic".
- **Plausibility ceiling: 7,000 PLN** on the central figure or either range end, derived from the lab's own bounds (200 kWh × 31 days × 1.0991 + 44.62 ≈ 6,859). Above it, and for a reversed range, a central estimate outside its own range or a negative settlement figure, the card shows the reason and no number. A `generated_at` more than **5 minutes** ahead of the app's clock is a producer clock error and shows no number either. These guards are deliberately not in the ingest contract: a 422 rejects the whole push and would stop the live state and the recommendation too.
- **A forecast for another month is relabelled, not withheld** — the badge says which month it covers and the figure stays, as the recommendation card does for advice from an earlier day. A forecast generated at 23:58 on the last day of a month and read at 00:05 the next is still inside the freshness window.
- **The lab's `confidence` is shown as a nested badge**, and when the reference month lags its label names that month, so a lagging reference is disclosed instead of hiding the figure for three weeks of every month.
- **The closed-month check stays inside the "Na podstawie" block**, worded as a test of the arithmetic. Predicted-vs-actual reconciliation is a PRD non-goal (`prd-v3.md:278`).
- **Banked credit covering the whole month's import is said out loud**, because otherwise the card would show a strikingly low, trivially green figure (only the fixed fees) with no reason for it.

## Planned rules (PRD v3)

- **Day and month ratings (S-17):** good / neutral / bad from **self-sufficiency** = `1 − grid import ÷ consumption` for the period, clamped to **0–100%** (grid import can exceed consumption when the battery charges from the grid), for complete days with consumption above zero only. Compared with the season-adjusted norm when it has enough days (same window, minimum and statistic — the median — as the usage insight), otherwise with the recent trailing norm, and the card says which one it used. Until about July 2027 every rating uses the recent norm. Thresholds and the recent window length are set when the slice is planned. Ratings describe; they never advise.
- **Consumption trends (S-20):** a remark when consumption rises or falls noticeably over weeks and months, against earlier periods (periods compared by their median, like the usage norm); against the same season a year before only once that history exists (about July 2027).
- **Texts for a non-expert (F-04, S-18):** a plain explanation of today and summaries of past days and months, written by the stronger model from the local model's observations, taking Polish seasons into account, without advice.
