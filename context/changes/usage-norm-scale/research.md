---
date: 2026-09-26T21:05:23+02:00
researcher: Claude (Opus 5.5) for Kamil Nowosad
git_commit: e635655
branch: chore/archive-s14
repository: titusandronicu/energy-analyser
topic: "Usage norm: mean or median, low / normal / high ranges, and public Polish reference data"
tags: [research, usage-insight, norm, median, glossary, UsageInsightCard]
status: complete
last_updated: 2026-09-26
last_updated_by: Claude (Opus 5.5)
---

# Research: Usage norm — mean or median, ranges, and public reference data

**Date**: 2026-09-26T21:05:23+02:00
**Researcher**: Claude (Opus 5.5) for Kamil Nowosad
**Git Commit**: e635655 (local; research files uncommitted)
**Branch**: chore/archive-s14
**Repository**: titusandronicu/energy-analyser

## Research Question

Should the usage-insight norm switch from the mean to the median everywhere (the status badge, the +X% labels and the grid-purchase delta), or should the median only be shown as extra information? The owner has already decided to replace the "Co to znaczy?" glossary on the usage card with the meaning of the day: low / normal / high / very high ranges in kWh, taken from the home's own history. Follow-up from the owner: where own data is missing, use public data for a ~140 m² Polish house, with the norm corrected over time. The house has an air-source heat pump (owner's answer, 2026-09-26).

## Summary

**Recommendation: use the median everywhere, in one place. Take the ranges from the same median and thresholds as the badge. Show public Polish figures as context only, never inside the norm.**

1. **Median everywhere.** The load badge, both deltas and the new ranges should all use the median, so the card never shows two norms. Evidence:
   - **Real data.** On the 19 compared days from 2026-08-26 to 2026-09-25, the badge differs on 3 days (08-26, 08-27, 08-28). All 3 are marked _powyżej_ under the mean and _w normie_ under the median. The cause is the inconsistent rows from 07-26 to 08-03 (load 9–25 kWh, energy balance broken) still inside the 30-day window, which pull the mean down.
   - **Clean data.** From 08-04 on, mean and median differ by at most about 0.7 kWh. On the latest window (08-26 to 09-24, n = 18) they are 36.66 against 36.35, and yesterday's badge is _poniżej normy_ under both.
   - **Robustness.** The median resists single unusual days (guests, a long heat-pump defrost day, a data glitch). The mean does not.
   - **The feared zero-median problem does not occur in this data.** Grid import is never 0 and never below 0.5 kWh on any of the 48 complete days (minimum 9.0 kWh). A median of 0 would make `deltaLabel` return "—" (`src/lib/services/usage-insight.ts:92`), but that is not a practical risk for this house. Keep the guard.
2. **Ranges = badge boundaries in kWh.** Compute them as low < 0.85 × median ≤ normal ≤ 1.15 × median < high ≤ 1.40 × median < very high. These are the existing thresholds (`usage-insight.ts:18,20`) turned into kWh, so the text and the badge cannot disagree.
   - For 2026-09-25 (median 36.35): low below 30.9, normal 30.9–41.8, high 41.8–50.9, very high above 50.9 kWh.
   - Yesterday's 29.9 kWh is therefore "niskie".
3. **Public data as context, not as the norm.** For an average ~140 m² Polish house with an air-source heat pump, the public estimate is about 7,000 kWh a year, or about 12.8 kWh a day in September. This house used 36.0 kWh a day (the median of the last 30 days), about 2.8 times that.
   - **Why not blend it into the norm.** Credibility blending (`Z = n/(n+k)`, k = 30) would move the norm to about 21.5 kWh with 18 days in the window, or about 27 kWh with all 48 days. The house's ordinary days would then be marked _dużo powyżej_ or _powyżej_ every day.
   - **Where it helps.** It is useful as a one-line comparison ("typowy dom z pompą ciepła we wrześniu: ok. 13 kWh"), clearly labelled as an estimate.
   - **"Corrected over time" is already met by own data.** The rolling 30-day median updates daily, and the seasonal baseline takes over automatically once a year of history exists (about July 2027; `docs/logic.md:34`).
4. **Keep the "not enough data" rule.** With fewer than 7 own days, the card should still say so rather than fall back to the public figure. This follows FR-019 / "no guessing from too little data" (`docs/logic.md:60`). Replacing this with the public prior would be a product decision; see Open Questions.

## Detailed Findings

### How the norm works today

- The baseline value is the arithmetic mean: `mean()` at `usage-insight.ts:65`, applied to load at `:168` and purchase at `:169`.
- The badge compares against it with ±15% / +40% at `statusOf` `:69` and `loadStatus` `:76`, using the thresholds at `:18,20`.
- The delta labels use the same value, and return "—" when the baseline is 0 or null (`deltaLabel` `:91–92`).
- The card writes "średnia z …" in both baseline notices (`src/components/UsageInsightCard.astro:54,58`).
- The glossary defines the norm as "Średnia z podobnych dni…" (`src/lib/format/glossary.ts:31–34`). The card shows glossary terms `kwh`, `norm` and `grid_import` (`UsageInsightCard.astro:63`).
- `docs/logic.md:31–32` documents "baseline mean" and "średnia z 18 dni".

### Why the mean was used

- The only specification is in `context/archive/2026-09-25-seasonal-usage-insight/plan.md:84`: "the mean of the baseline days". No reason is given.
- The recorded robustness decision concerns thresholds only: `plan.md:40` says "No standard-deviation thresholds". Its reason, "Simple and explainable with the few days available", is at `plan-brief.md:23`.
- A grep for median / mediana across `context/`, `docs/` and `src/` found no discussion.
- The PRD's contrast is seasonal against a "flat trailing-30-day average" (`prd-v3.md:246`), not mean against median.
- **Verdict:** the choice of mean is a default, not a decision. Switching needs a dated entry in `docs/decisions.md`, following lessons.md "Keep the project docs in step with the code".

### Real data (production `public.daily_energy`)

The data was read with one read-only SELECT through the Supabase CLI on 2026-09-26. Nothing was written.

- **Coverage:** 53 rows from 2026-07-26 to 2026-09-26. 48 complete days have a load; 09-26 is today and partial.
- **Days without a load:** 07-31, 08-10, 08-31 (every value null), 09-13 to 09-19 and 09-21 to 09-24.
- **Two regimes:**
  - 07-26 to 08-03: load 9.4–25.2 kWh with export of 20–39 kWh. The energy balance fails, e.g. 07-27: pv 19.5 + import 17.9 − export 38.9 < 0.
  - 08-04 on: load 29.9–48.3 kWh, export about 0, and the balance holds.

| Window       | Series | n   | Mean  | Median | Min  | Max  | P10   | P90   |
| ------------ | ------ | --- | ----- | ------ | ---- | ---- | ----- | ----- |
| 08-27..09-25 | load   | 18  | 36.14 | 36.00  | 29.9 | 41.4 | 32.54 | 39.65 |
| 08-27..09-25 | import | 18  | 17.62 | 16.45  | 11.9 | 23.9 | 13.95 | 22.89 |
| 07-26..09-25 | load   | 48  | 33.81 | 35.60  | 9.4  | 48.3 | 18.68 | 42.15 |
| 08-04..09-25 | load   | 40  | 37.27 | 36.60  | 29.9 | 48.3 | 32.69 | 43.90 |

- **Yesterday, 2026-09-25:** load 29.9 kWh. The baseline is the 08-26 to 09-24 window (18 days).
  - Against the mean (36.66): −18.4%, _poniżej_.
  - Against the median (36.35): −17.7%, _poniżej_.
  - Import 23.1 kWh: +34% against the mean, +41% against the median. Import is right-skewed, so the median sits below the mean.
- **Every day from 08-26 to 09-25 treated as the compared day:** the badges differ on 3 of the 19 days, as described in the Summary. No day reached _dużo powyżej_ under either.
- **Seasonal baseline:** it never applies yet, because there is less than a year of history.

### Public reference data (heat-pump house, ~140 m², Poland)

- **National average household (mostly flats):** mean 2,523 / median 1,992 kWh a year. GUS, _Zużycie energii w gospodarstwach domowych w 2021 r._, p. 41.
- **Single-family house, non-electric heating:** about 3,200 kWh a year (≈ 8.8 kWh a day). GUS 2021, pp. 50–54.
- **Heat-pump house (heating and hot water), 140 m²:** about 6,500–8,500 kWh a year, point value 7,000 (≈ 19 kWh a day on average).
  - This is an engineering estimate, not a measured Polish statistic.
  - It is built from space-heat demand of 55–80 kWh/m² (PORT PC, Q3 2024), a seasonal COP of 3.0–3.4 (Fraunhofer ISE field test, Nov 2025), and 1,000–1,330 kWh of heat-pump hot water.
- **Seasonal profile of that estimate:** January about 29 kWh a day, July about 10.5, September about 12.8 (5.5% of the year).
  - Modelled from Enea's G11 standard profile 2025 plus Eurostat heating degree-days for 2015–2025: appliances 2,800 kWh on the G11 shape, heat-pump hot water 1,150 kWh spread flat, space heating 3,000 kWh spread by degree-days.
  - Monthly table (share of 7,000 kWh a year → kWh a day, rounded as stored in `src/lib/format/reference-usage.ts`; added 2026-09-26 during the implementation review, F7):

    | Month | Share of year | kWh a day | Stored |
    | ----- | ------------- | --------- | ------ |
    | Jan   | 13.0%         | 29.4      | 29     |
    | Feb   | 11.1%         | 27.8      | 28     |
    | Mar   | 10.8%         | 24.4      | 24     |
    | Apr   | 8.5%          | 19.8      | 20     |
    | May   | 6.5%          | 14.7      | 15     |
    | Jun   | 4.7%          | 11.0      | 11     |
    | Jul   | 4.6%          | 10.4      | 10     |
    | Aug   | 4.7%          | 10.6      | 11     |
    | Sep   | 5.5%          | 12.8      | 13     |
    | Oct   | 8.1%          | 18.3      | 18     |
    | Nov   | 10.3%         | 24.0      | 24     |
    | Dec   | 12.3%         | 27.8      | 28     |

  - Sources: GUS, _Zużycie energii w gospodarstwach domowych w 2021 r._ (2023); PORT PC heating-cost calculator note, Q3 2024; Fraunhofer ISE WP-QS heat-pump field test (Nov 2025); Enea Operator IRiESD annex 4 standard profiles 2025 (G11); Eurostat `nrg_chdd_m` heating degree-days for Poland, 2015–2025.
- **Official bands:**
  - Eurostat consumption bands: DC 2,500–5,000 kWh a year is the "medium household"; DD is 5,000–15,000.
  - Price-freeze limits of 2,000–4,000 kWh are policy caps, not statistics.
- **Blending method** (if ever wanted): Bühlmann credibility `L = Z·L_own + (1−Z)·L_prior`, `Z = n/(n+k)`, k ≈ 30 days, with the median of seasonally adjusted own days as `L_own`.
- **Applied to this house:**
  - `L_own` is 36.0 / 12.8 ≈ 2.81 times the prior.
  - With n = 18: Z = 0.375, so the norm is about 21.5 kWh, and 36 kWh reads +67% (_dużo powyżej_).
  - With n = 48: Z = 0.615, so the norm is about 27.0 kWh, and 36 kWh reads +33% (_powyżej_).
  - Either way it mislabels ordinary days. That is why the public figure is recommended as context only.
- **Caveat:** public figures are billed grid consumption per dwelling. The app's `load_kwh` is total home consumption, including what PV and the battery cover. That fits a comparison of total use, but it is not the same quantity as a bill.

### Seasonal lag (inference, not yet observable)

- **What is expected:** a trailing 30-day median lags when heating starts. In the heat-pump model, the heating share per day rises about 1.4 times from September to October and about 1.3 times from October to November. For this house, the model adds roughly 2.6 → 7.6 → 12.8 kWh a day of heating in September, October and November, on top of about 33 kWh of other load.
- **Consequence:** some October and November days may read _powyżej_ while being normal for the season. The mean has the same lag; this is not a mean-against-median difference.
- **Status:** the roadmap already asks the S-17 plan to check that a seasonal trend does not paint every day red (`roadmap.md:242`).
- **Possible mitigation for a later slice:** adjust own days by a degree-day or seasonal index before taking the median. Taking the shape from public data and the level from own data would be the useful "correction over time". Not needed for this change.

## Code References

- `src/lib/services/usage-insight.ts:18,20`: thresholds 0.15 and 0.4, to be reused for the ranges.
- `src/lib/services/usage-insight.ts:65`: `mean()`, to be replaced by or complemented with `median()`.
- `src/lib/services/usage-insight.ts:69-84`: `statusOf` and `loadStatus`, which take any baseline value.
- `src/lib/services/usage-insight.ts:91-92`: `deltaLabel`, with the zero/null guard.
- `src/lib/services/usage-insight.ts:168-169`: `loadMean` and `purchaseMean`, to be renamed.
- `src/components/UsageInsightCard.astro:54,58`: "średnia z" wording.
- `src/components/UsageInsightCard.astro:63`: the glossary block to replace with the meaning of the day.
- `src/lib/format/glossary.ts:31-34`: the `norm` explanation says "Średnia".
- `src/lib/services/usage-insight.test.ts`: every baseline fixture uses constant values, so no current test distinguishes mean from median. New tests need skewed baselines, even counts with different middle values, and a zero-purchase baseline.
- `docs/logic.md:31-32`: rule text to update.

## Architecture Insights

- The norm is computed in one place (`toUsageInsightView`). The badge, the deltas and the new ranges can share one value, so there is no risk of divergence if they are all derived there.
- S-17 ratings and S-20 trends are planned to reuse the window, fallback and disclosure (`roadmap.md:204,234`). They do not reuse the statistic. Choosing the median now sets the precedent they should follow; record it in `docs/decisions.md`.
- The "meaning of the day" can be built from view-model fields (value, median, range bounds, status, period label) with no new data access.

## Historical Context (from prior changes)

- `context/archive/2026-09-25-seasonal-usage-insight/plan.md:84`: "baseline value: the mean". Supported as the current behaviour. No rationale was recorded.
- `context/archive/2026-09-25-seasonal-usage-insight/plan-brief.md:23`: "±15% … Simple and explainable". Still valid; the thresholds stay.
- `context/archive/2026-09-26-data-period-transparency/change.md`, notes: the owner's feedback that explanations of words are not enough and figures need scale. This change answers it.
- `context/foundation/roadmap.md`, Open Roadmap Question 4: "How should the cards give numbers a sense of scale?" This change answers it for the usage card. Cost (S-07) and ratings (S-17) remain open.

## Related Research

Not applicable. There is no earlier research.md on the norm statistic.

## Open Questions

1. **Inconsistent early rows (07-26 to 08-03).** Should the lab correct them, or should the app exclude them? They are the only cause of a mean/median disagreement so far. They will leave the 30-day window by themselves, but they will affect the seasonal baseline in 2027. This is a lab prerequisite (lessons.md "Name every prerequisite").
2. **Why is consumption about 2.8 times the public heat-pump estimate in September?** An electric car, air conditioning, a pool, or hot water on resistance heating? This matters for how the public comparison line is worded. It is an owner question, not a code question.
3. **Should the card show the public comparison line at all?** If so, with which wording and which monthly figure (the monthly table above)?
4. **Fewer than 7 own days.** Keep "not enough data" (recommended, per FR-019), or show public ranges marked as an estimate? This is an owner decision.
5. **Does the purchase delta use the median too** (recommended, for consistency)? Or does it stay as the mean, since it is not rated (`docs/logic.md:57`)?
6. **Wording:** should the card say "mediana" or plain "typowy dzień" ("zwykle zużywasz"), given the no-energy-knowledge requirement?
