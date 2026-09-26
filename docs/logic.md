# Logic

The rules Energy Analyser and the home lab apply to the data, with the exact thresholds the code uses. Rules marked **planned** come from PRD v3 and the roadmap and are not built yet. All days are Europe/Warsaw calendar days.

## Where each rule runs

| Rule                                          | Runs in                                       | Source                                                               |
| --------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| Live state and its staleness                  | App                                           | `src/lib/services/live-state.ts`                                     |
| Usage insight (season-adjusted baseline)      | App                                           | `src/lib/services/usage-insight.ts`                                  |
| Recommendation staleness and labels           | App                                           | `src/lib/services/recommendation.ts`                                 |
| Daily totals per day, which days are complete | Lab                                           | homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py` |
| Facts bundle and battery recommendation       | Lab (deterministic rules, then LLM narration) | homelab-2 `build-energy-agent-briefing.py`, `run-energy-advisory.py` |
| PV forecast                                   | Solcast via Home Assistant, read by the lab   | homelab-2 `collect-ha-snapshot.py`                                   |

## Live state

- The lab pushes every 5 minutes. A snapshot older than **15 minutes** is shown as stale with its age ("5 min", "2 godz.", "3 dni"), never hidden.
- Flows below **50 W** count as noise and show as "0,0 kW" without a direction word.
- Sign conventions: grid positive = buying from the grid, negative = selling; battery positive = discharging, negative = charging. The app shows the value unsigned with a direction word.

## Usage insight: is recent usage normal?

The app compares the most recent complete day's consumption with a baseline and says _normal_, _above_ or _below_.

1. **Compared day:** yesterday, or the newest day with a consumption value within the last **7 days** if yesterday is missing. Today is never compared (it is not over).
2. **Seasonal baseline first:** all days within **±14 days** of the same date in earlier years (up to one year back, since the app loads **400 days** of history). It is used when it has at least **20 days** with data.
3. **Fallback:** otherwise the previous **30 days**, used when at least **7** of them have data, and the card says plainly that the fallback is in use.
4. **Not enough data:** with fewer than 7 fallback days, no verdict is shown.
5. **Verdict:** more than **15%** above or below the baseline mean is _above_ / _below_; exactly ±15% is still _normal_.

Why seasonal: a flat recent average mislabels normal seasonal change (winter heating, summer air conditioning) as anomalies. History starts on 2026-07-26, so the fallback is what runs until a year of history exists or the backfill (roadmap F-03) loads older data.

## Today's recommendation

- The lab's deterministic rules compute a facts bundle; the stronger LLM narrates it in Polish without adding numbers. The app shows the narration with the forecast and the facts it is based on.
- The recommendation is **stale** when it was generated more than **2 hours** ago (the lab narrates about hourly, so two missed runs) or before the start of today.
- Forecast confidence is shown as _niska / średnia / wysoka_ when the lab provides it, otherwise _nieznana_. **Planned (S-11):** certainty computed from past forecast accuracy and Solcast's low/high range.

## Daily totals (lab → app)

- Every push carries up to the last **35 days** of per-day totals (PV production, consumption, grid import, grid export, PV forecast); the contract allows at most **62**. Today's entry is partial and replaced by each later push.
- A past day counts only when its counters were read correctly (`counters_ok`) and the data covers the day to its end; incomplete days are sent with empty totals rather than wrong ones.
- The day's PV forecast is the first forecast reading at or after **06:00** local time.
- Forecast source since 2026-09-26: **Solcast** (forecast plus low/high estimates, recorded in the lab's history). Forecast.Solar is kept only for comparison; it overshot real production on this flat array.

## Planned rules (PRD v3)

- **Period and minimum data (S-14):** every figure says which period and how many days it is based on; with too little data a card says "not enough data yet" instead of guessing. No prediction or rating from a single day.
- **Colours (S-14):** green = good, amber = worth watching, red = a problem, grey = not enough data, always with a text label.
- **Day and month ratings (S-17):** good / neutral / bad from **self-sufficiency** = `1 − grid import ÷ consumption` for the period, compared with the season-adjusted norm (same seasonal window idea as the usage insight). Thresholds are set when the slice is planned. Ratings describe; they never advise.
- **Consumption trends (S-20):** a remark when consumption rises or falls noticeably over weeks and months, against earlier periods and the same season a year before when that history exists.
- **Texts for a non-expert (F-04, S-18):** a plain explanation of today and summaries of past days and months, written by the stronger model from the local model's observations, taking Polish seasons into account, without advice.
