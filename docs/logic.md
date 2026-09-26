# Logic

The rules Energy Analyser and the home lab apply to the data, with the exact thresholds the code uses. Rules marked **planned** come from PRD v3 and the roadmap and are not built yet. All days are Europe/Warsaw calendar days.

## Where each rule runs

| Rule                                           | Runs in                                       | Source                                                               |
| ---------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| Live state and its staleness                   | App                                           | `src/lib/services/live-state.ts`                                     |
| Usage insight (season-adjusted baseline)       | App                                           | `src/lib/services/usage-insight.ts`                                  |
| Recommendation staleness and labels            | App                                           | `src/lib/services/recommendation.ts`                                 |
| Status colours, period text, term explanations | App                                           | `src/lib/format/status.ts`, `period.ts`, `glossary.ts`               |
| Daily totals per day, which days are complete  | Lab                                           | homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py` |
| Facts bundle and battery recommendation        | Lab (deterministic rules, then LLM narration) | homelab-2 `build-energy-agent-briefing.py`, `run-energy-advisory.py` |
| PV forecast                                    | Solcast via Home Assistant, read by the lab   | homelab-2 `collect-ha-snapshot.py`                                   |

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
5. **Verdict:** more than **15%** above or below the baseline mean is _above_ / _below_; exactly ±15% is still _normal_. More than **40%** above is _far above_; exactly +40% is still _above_.
6. The card names the baseline days it used ("średnia z 18 dni: 27 sierpnia – 25 września").

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

## Planned rules (PRD v3)

- **Day and month ratings (S-17):** good / neutral / bad from **self-sufficiency** = `1 − grid import ÷ consumption` for the period, clamped to **0–100%** (grid import can exceed consumption when the battery charges from the grid), for complete days with consumption above zero only. Compared with the season-adjusted norm when it has enough days (same window and minimum as the usage insight), otherwise with the recent trailing norm, and the card says which one it used. Until about July 2027 every rating uses the recent norm. Thresholds and the recent window length are set when the slice is planned. Ratings describe; they never advise.
- **Consumption trends (S-20):** a remark when consumption rises or falls noticeably over weeks and months, against earlier periods; against the same season a year before only once that history exists (about July 2027).
- **Texts for a non-expert (F-04, S-18):** a plain explanation of today and summaries of past days and months, written by the stronger model from the local model's observations, taking Polish seasons into account, without advice.
