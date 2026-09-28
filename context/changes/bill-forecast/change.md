---
change_id: bill-forecast
title: Projected cost of the current month with a range (S-07)
status: new
created: 2026-09-27
updated: 2026-09-28
archived_at: null
---

## Notes

S-07 from context/foundation/roadmap.md: user can see the projected cost of the current month in PLN, with a range and the number of days it is based on (US-03, FR-011)

Parked 2026-09-27 until `bill-accuracy` lands: the lab figure it would display is known to be wrong. Decisions already taken for the plan: grey "za mało danych" below 7 completed days; colour vs the last priced bill (green ≤, amber ≤ +20%, red > +20%); disclose the pricing basis on the card.

**Unparked 2026-09-28.** (The park above is history — resolved.) `bill-accuracy` is deployed: the lab's `current-month-bill-forecast.json` now estimates the PGE invoice by crediting exported energy at the 0.8 net-metering factor, and the rule is written up in `docs/logic.md` ("Bill forecast (lab)"). The slice is ready to plan; it stays `status: new` because it has not been planned yet.

What the card has to work with now, on top of the existing `month`, `confidence`, `completed_days_used`, `observed_days`, `average_daily_import_kwh`, `projected_import_kwh`, `projected_bill_gross_pln` and `range_gross_pln` (all unchanged in meaning):

- `settlement` — `factor`, `reference_period`, `reference_lag_months`, `reference_consumed_kwh`, `reference_feed_in_kwh`, `export_ratio`, `carried_credit_kwh`, `carried_credit_basis`, `carried_credit_dropped_as_stale`, `factor_implied`. This is the disclosure the card's "pricing basis" decision needs: the figure is an estimate built on the export ratio of the month named in `reference_period`.
- `closed_month_check` — `period`, `computed_gross_pln`, `invoice_gross_pln`, `diff_pct`, `ok` (within ±5%): the same formula re-priced against the last real invoice. It is absent when the reference period has no invoice total, so the card must treat it as optional.
- `method: "net_metering_credit_estimate"`, `projected_credit_kwh`, `projected_billable_kwh`, `credit_left_kwh`, and `pricing` (`source`, `rates_verified_on`, `variable_gross_pln_per_kwh`, `fixed_gross_pln_per_month`).
- **A `status`/`reason` gate the card must honour.** `status` is `"ok"` or `"no_data"`; on `no_data` the only other keys are `reason`, `message`, `generated_at`, `month` and `method`, and no figure may be shown. The reasons are `no_complete_days`, `settlement_facts_missing` and `rates_unavailable`.
- **`confidence` is forced to `low` whenever `reference_lag_months` > 0**, however many days are behind the estimate. PGE issues an invoice about three weeks after the month ends, so that is the normal state from the 1st of a month until roughly the 22nd — the card will see `low` most of the time, not rarely. The "za mało danych" decision above already gives the card a grey state; decide when planning whether a lagging reference shows that state, or an "ok but disclosed" one naming the reference month. `confidence` is forced to `low` by a second condition too: a closed-month check missing by more than 25%.
