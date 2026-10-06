---
artifact: domain-glossary
created: 2026-10-06
source: context/domain/domain-distillation.md
---

# Glossary: Energy Analyser

Use these words in code, tests, commits and conversations. When a name in the code differs from the term, the term wins in new code; renaming old code is a separate decision.

## Advice and usage verdicts (Core)

| term               | means                                                                                     | name in code                                  | don't call it                          |
| ------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| recommendation     | the lab's plain-language battery advice for today, narrated by an LLM from verified facts | `RecommendationView`, table `recommendations` | summary, narration, description        |
| facts bundle       | the verified numbers the lab computed before any text is written                          | column `facts`                                | facts file                             |
| finding            | one flagged item next to a recommendation, with a severity                                | `RecommendationFinding`                       | warning, alert                         |
| usage insight      | yesterday's consumption compared with the norm                                            | `UsageInsightView`                            | anomaly, report                        |
| baseline           | the earlier days the usage norm is built from                                             | window constants in `usage-insight.ts`        | average                                |
| usage norm         | median daily consumption of the baseline days, in kWh                                     | `dailyLoadNorm`                               | norm (alone, see below)                |
| verdict            | the good / watch / problem judgement a card shows                                         | `StatusTone`                                  | rating (a rating is a different thing) |
| PV forecast        | expected solar production for a day                                                       | `daily_energy.pv_forecast_kwh`                | weather forecast                       |
| forecast certainty | how reliable the PV forecast has been lately; today always "not known yet"                | `FORECAST_CERTAINTY`                          | confidence                             |

## Cost foresight (Core)

| term                 | means                                                              | name in code                             | don't call it                 |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------- | ----------------------------- |
| bill forecast        | the lab's estimate of this month's electricity bill, with a range  | view `bill_forecast`, `BillForecastView` | prognosis, projection         |
| invoice              | the last real bill from PGE the forecast is judged against         | `invoice_gross_pln`                      | bill (a bill is the estimate) |
| plausibility ceiling | the 7,000 PLN limit above which the app refuses to show a forecast | `MAX_PLAUSIBLE_BILL_PLN`                 | cap, max bill                 |
| net metering (opust) | exported energy is banked as credit at 0.8, not sold for money     | `net_metering_credit_estimate`           | selling, net billing          |
| closed-period cost   | the actual cost of the last closed billing period                  | missing in code (planned S-08, blocked)  | invoice total                 |
| usage profile        | how consumption spreads over the day and week                      | missing in code (planned S-10)           | trend                         |

## Lab data intake (Supporting)

| term               | means                                                                                         | name in code                      | don't call it                            |
| ------------------ | --------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------- |
| push               | one delivery of data from the lab to the app                                                  | `ingest_pushes`, `handleIngest`   | upload, sync                             |
| home lab           | the owner's own system that collects data and writes advice                                   | `homelab`                         | lab server, laboratorium                 |
| ingest token       | the secret the lab sends to prove it may push                                                 | `ingest_tokens`                   | API key, access key                      |
| `captured_at`      | the lab's snapshot time; identifies a push                                                    | `captured_at`                     | timestamp, received time                 |
| daily totals       | the per-day energy numbers for one Warsaw day                                                 | `daily_energy`, `daily_history`   | day row, history file                    |
| hourly totals      | the per-clock-hour energy numbers                                                             | `hourly_energy`, `hourly_history` | hourly readings                          |
| grid import        | energy bought from the grid                                                                   | `grid_import_kwh`                 | bought, purchase, importKwh, gridDrawKwh |
| grid export        | energy sent to the grid, banked as credit                                                     | `grid_export_kwh`                 | sold (see net metering)                  |
| grid sensor caveat | the inverter's grid sensor has measured wrongly since the history began; nothing is corrected | `SENSOR_CAVEAT`                   | sensor change, bug                       |

## Live state (Supporting)

| term                | means                                                             | name in code                                   | don't call it            |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------- | ------------------------ |
| live state          | the newest snapshot of PV, battery, grid and house load           | view `live_state`, `LiveStateView`             | current state, readings  |
| staleness indicator | a snapshot older than 15 minutes is stale, over 2 hours a problem | `LIVE_STALE_AFTER_MS`, `LIVE_PROBLEM_AFTER_MS` | stale (alone, see below) |
| degraded            | the lab marked its source data partial                            | `source_health`                                | error                    |
| node verdict        | the good / watch / problem chip on battery, PV or home            | `NodeVerdict`                                  | status                   |

## History, ratings, summaries and notes (Supporting)

| term                     | means                                                                       | name in code                       | don't call it     |
| ------------------------ | --------------------------------------------------------------------------- | ---------------------------------- | ----------------- |
| Warsaw day               | a calendar day in Europe/Warsaw; the unit of everything                     | `warsawParts`, string `YYYY-MM-DD` | day (alone), date |
| history calendar         | the day, month and quarter views of past data                               | `CalendarPeriod`, `HISTORY_START`  | archive           |
| complete hour            | an hour with at least 10 of 12 five-minute readings                         | `MIN_HOUR_SAMPLES`                 | full hour         |
| self-sufficiency         | share of use covered without grid import                                    | `selfSufficiency`                  | autarky           |
| rating                   | good / neutral / bad for a completed day or month; describes, never advises | `PeriodRating`, `RatingBand`       | verdict           |
| not rated ("Poza oceną") | a day outside the rating, shown with both figures                           | `kind: "inconsistent"`             | unrated, skipped  |
| low sun                  | a day with PV under 70% of the norm days                                    | `LOW_SUN_SHARE`                    | cloudy            |
| period summary           | the lab's plain-language text for today, a day or a month                   | `period_summaries`, `SummaryView`  | recommendation    |
| narration                | the LLM step that writes text over verified facts                           | `narration_text`                   | generation        |
| `built_at`               | when the lab built a summary; the newest wins                               | `built_at`                         | updated_at        |
| day note                 | the owner's one short note on a day                                         | `day_notes`, `DayNote`             | comment, remark   |
| night grid draw          | grid energy used between 22:00 and 06:00                                    | `nightDraw`                        | night usage       |
| suspect hour             | an hour whose grid draw exceeds house use by more than 0.5 kWh              | `isSuspectLowHour`                 | bad hour          |

## Overloaded words, one row per context

| term         | context             | means                                                        | name in code              | don't call it         |
| ------------ | ------------------- | ------------------------------------------------------------ | ------------------------- | --------------------- |
| complete day | calendar and rating | before today, with PV, house use and grid import all present | `isCompleteDay`           | hourly-complete day   |
| complete day | hourly card         | every clock hour of the date is complete (24, 23 or 25)      | `toHourlyUsageView`       | calendar-complete day |
| complete day | lab daily totals    | counters read correctly and data to the end of the day       | lab-side                  | app-complete day      |
| complete day | lab summaries       | a usable sample at or after 23:00 Warsaw time                | lab-side                  | summary-ready day     |
| complete day | bill forecast       | the days the lab's estimate is based on                      | `completed_days_used`     | forecast basis        |
| norm         | usage insight       | median daily consumption of the baseline days                | `dailyLoadNorm`           | rating norm           |
| norm         | rating              | median self-sufficiency of the previous 14 qualifying days   | `RATING_WINDOW_DAYS`      | usage norm            |
| forecast     | solar               | expected PV production                                       | `pv_forecast_kwh`         | bill forecast         |
| forecast     | cost                | the electricity bill estimate                                | `bill_forecast`           | PV forecast           |
| period       | calendar            | a day, month or quarter in history                           | `CalendarPeriod`          | billing period        |
| period       | billing             | the settlement month PGE invoices                            | `reference_period`        | calendar period       |
| period       | summary             | the date or month a summary is about                         | `period_summaries.period` | calendar period       |
| state        | live                | the plant snapshot                                           | `LiveStateView`           | status                |
| state        | verdict             | the tone a badge shows                                       | `StatusTone`              | live state            |
| state        | ingest              | the result of a push, created or duplicate                   | `ingest_push` result      | verdict               |
| stale        | live                | older than 15 minutes (problem over 2 hours)                 | `LIVE_STALE_AFTER_MS`     | recommendation stale  |
| stale        | recommendation      | older than 2 hours or from an earlier day                    | `STALE_AFTER_MS`          | live stale            |
| stale        | bill forecast       | older than 30 minutes on its own `generated_at`              | `FORECAST_STALE_AFTER_MS` | live stale            |
| import       | inverter            | grid import as the inverter reports it, uncertain            | `grid_import_kwh`         | billed import         |
| import       | billing             | grid import as PGE bills it, balanced per hour               | `grid_net_kwh`            | inverter import       |
| owner        | access              | a row in `app_owners` who may read and write                 | `app_owners`              | user                  |
| owner        | product             | the sole human using the app                                 | none                      | operator              |
