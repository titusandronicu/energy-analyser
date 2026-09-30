---
change_id: grid-export-mismatch
title: Why PGE records grid export the inverter never sees
status: preparing
created: 2026-09-28
updated: 2026-09-30
archived_at: null
---

## Notes

Opened 2026-09-28 out of `bill-accuracy` (owner's decision 2026-09-27: investigate the invisible export separately, so it does not block a bill forecast that already reproduces the invoices within 3%). Roadmap open question 5.

The mismatch, measured 2026-09-27 (evidence in `context/changes/bill-accuracy/change.md`, `context/changes/bill-accuracy/frame.md` and `context/changes/bill-accuracy/plan.md`):

- For the August period (01.08–31.08.2026) PGE settled **342 kWh** fed into the grid. The Deye inverter's export counter reads **94.7 kWh** for the same month — a factor of 3.6.
- It is not a counter-versus-power artefact: integrating the inverter's own summed grid power over the month gives about **95 kWh**, agreeing with its counter and not with PGE.
- Import, by contrast, matches: Deye 433.6 kWh against PGE's 423 (**+2.5% against PGE**), so the inverter has been reliable on the import side since early August. Only export disagrees.
- PGE records export **at night**, when the panels cannot be producing anything. Whatever the meter is seeing, the inverter does not see it as export.
- A **phase imbalance** is one candidate raised in `bill-accuracy`: if the meter settles each phase separately while the inverter reports only what it puts out, a surplus on one phase can register as export at the meter while the house draws on another. It is a hypothesis, not a finding — how the connection and the meter are wired has not been checked, and the meter model is not known either.

Why it matters:

- The credit is worth real money. August's 342 kWh fed in credited 274 kWh at the 0.8 net-metering factor, about 300 PLN at the current G11 rate — more than the whole invoice (214.66 PLN).
- Because the inverter's export figure cannot be trusted, the lab's bill forecast cannot measure the in-month credit. It estimates it instead, from the export/import ratio of the last month PGE settled, which for most of a month is a month out of date and drags the forecast's confidence to `low` (`docs/logic.md`, "Bill forecast (lab)"). Explaining the mismatch is the route to a measured credit.

Possible directions, none decided: check the meter model and whether the connection is balanced across phases; compare the PGE hourly eBOK CSV with the inverter's night-time grid power hour by hour; reconsider a meter-grade source (wM-Bus, roadmap Parked; MojeIRE once its consumer API is published).

**Owner's feature request (2026-09-30), after the frame's verification:** "I would like to have this feature when I see hours of lowest and highest consumption, and highlighted some days when we had lowest and highest, so as a consumer I can try to pinpoint what was going on on those days." Worked example from August (PGE hourly CSV plus the lab's 5-minute history): the house used 113 and 131 kWh on 1 and 2 August against a normal 28–43 kWh, drawing about 8 kW for hours including at night, with grid draw switching between ~5 and 0 kWh in neighbouring hours; 124 of 744 hours drew nothing from the grid. Conflicts with S-10's "hour-of-day aggregates only, never single readings or timestamps" rule, so the plan must settle that with the owner. Goes to `/10x-plan` together with the night-import view the frame points at.
