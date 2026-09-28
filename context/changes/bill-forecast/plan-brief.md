# Bill Forecast Card (S-07) — Plan Brief

> Full plan: `context/changes/bill-forecast/plan.md`

## What & Why

Late cost feedback is the first problem the PRD names: PGE invoices arrive about three weeks after the month they cover. The home lab already computes a credit-aware estimate of the current month's bill every five minutes; this change puts it on the dashboard as a card that leads with a range, says which days and which settled month it rests on, and shows no figure at all when the data does not support one (US-03, FR-011).

## Starting Point

The lab side is deployed and documented (`docs/logic.md:79-99`): net metering at factor 0.8, rates 1.0991 PLN/kWh plus 44.62 PLN fixed, and on real September data 258 PLN with a 155–361 range from 15 complete days. The app side is empty — no contract section, no storage lane, no type, no card, and no mention in the ingest docs. Because `src/lib/ingest/contract.ts` is strict, the lab cannot even send the data until the contract gains a section. The lab's push script does not send it yet either.

## Desired End State

The dashboard carries a fourth card, "Prognoza rachunku", second in the column after the live state. When the data supports a figure it shows the range in złoty as its headline with the central estimate beneath, the number of days and which days it rests on, a confidence badge, a colour verdict against the last real invoice, and a "Na podstawie" details block naming the reference month and the rates. When it does not — six distinct refusal paths — the card explains why and shows no number.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Headline figure | The range leads; central estimate secondary | US-03's acceptance criterion asks for "a range rather than a single exact figure", and a single number with a ±40% error reads far more precise than it is. |
| Lagging reference month | Show the figure, disclosed, naming the reference month | `reference_lag_months > 0` forces `low` confidence for roughly three weeks of every month, so hiding the figure then would leave the card blank for most of its life. |
| Colour verdict reference | `closed_month_check.invoice_gross_pln`; no verdict when the key is absent | The bands were already fixed in `change.md:14`, and falling back to our own arithmetic would silently change what the colour means. |
| Freshness rule | The body's own `generated_at` past 30 minutes blanks the figure | A stale file can still say `status: "ok"` — nginx once served a 2.4x-overstated figure inside a fresh push. |
| Where validation lives | Shape in zod; plausibility and settlement signs in the mapper | The contract is strict, so a rejection 422s the whole push and stops live state and the recommendation updating — and `reference_feed_in_kwh` has been observed negative, so the settlement block stays permissive in zod and is sign-checked in the mapper. |
| Closed-month check | One line inside the basis details, worded as a test of the arithmetic | The reviews require it always be reported, but predicted-vs-actual reconciliation is a PRD non-goal. |
| Scope | App side ships and deploys first, then the lab push | `docs/ingest/README.md:58-62` requires the app to be live before the lab sends a new optional field. |
| Recomputation | None; whole-złoty display | `prd-v3.md:268` — the app adds no pricing logic of its own; whole złoty because a ±40% estimate quoted to the grosz asserts false precision. |

## Scope

**In scope:** a `bill_forecast` section on the v1 contract as a `status`-discriminated union; a `security_invoker` view and loader; a pure mapper holding every threshold; the card, glossary terms and dashboard wiring; `docs/logic.md`, `docs/decisions.md`, `docs/ingest/README.md`, `docs/prerequisites.md`; the homelab-2 push change after the app deploy.

**Out of scope:** recomputing or re-scaling any figure; a reconciliation view; a colour verdict without a real invoice; the Telegram bot's `0.00 PLN` bug (`bill-accuracy` 3.5, still deferred); forecast history storage; the closed-period bill (S-08); the usage profile (S-10); `grid-export-mismatch`.

## Architecture / Approach

The S-02 chain with one correction: strict contract section → `security_invoker` view over the newest push **that carries the section** (`live_state` can take the newest push unconditionally only because `state` is required) → pure `toBillForecastView(row, now)` returning a discriminated union with a `Status` → dumb `.astro` card. Every threshold is a named constant in the service so it is unit-testable with a fixed clock; colour stays confined to `StatusBadge`; disclosure is a native `<details>` copied from the recommendation card. The six refusal paths collapse into one view variant carrying a Polish reason, and they run in a fixed order because a `no_data` body does not carry the keys the later checks read.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Contract section | `bill_forecast` on the v1 payload, schema exported, example plus a `--file` flag and variant fixture bodies | The field list must match the running lab script, not the archived plan, which diverges from it in five places; a strict contract makes any mismatch a 422. |
| 2. Read path | Migration view, row type, loader | Forgetting `security_invoker` would bypass RLS and the column grants; dropping the key-presence predicate would blank the card on any push that omits the section. |
| 3. View model | Mapper holding every threshold and all six refusal paths, unit-tested | `formatPeriod` throws on an empty list, and the refusal checks break if reordered. |
| 4. Card, dashboard, docs | The visible card plus the project docs | The card must stay a dumb renderer; any threshold that creeps into the markup escapes the tests. |
| 5. Lab push and production | The lab sends the section; the card shows the real figure | Needs a production deploy before the lab changes, so the two repos must land in order; a field mismatch would 422 every push, which is why the phase opens with a preflight parse. |

**Prerequisites:** F-01 and S-01 (done); `bill-accuracy` deployed on the lab (done, 2026-09-28); write access to homelab-2 and a production deploy window between phases 4 and 5; the Home Assistant PGE connector supplying the settlement facts.

**Estimated effort:** ~2–3 sessions across 5 phases; phases 1–3 are the bulk, phase 5 waits on a deploy.

## Open Risks & Assumptions

- **The central figure re-bases when a new invoice lands** — July's export ratio of 0.53 against August's 0.81 moves the same month from ~392 to ~258 PLN, typically around the 22nd. The card discloses the reference month but cannot smooth the jump; a reader who checks twice in a day may see a large move.
- **Confidence will read `low` most of the time**, so the badge carries less signal than it appears to. Its label naming the reference month is what actually distinguishes "lagging reference" from "too few days".
- **The range is wide** (±40%), already flagged against FR-011's "a range a non-expert can act on". Leading with it is the honest presentation, but it may still be hard to act on; worth revisiting after living with the card.
- **The lab's field list is only documented, not verified against the app.** Phase 1 assumes `change.md:18-23` matches the running script. Phase 5's preflight is what catches a mismatch before it reaches production; it assumes the lab's forecast file can be copied somewhere the contract can parse it.
- **`MAX_PLAUSIBLE_BILL_PLN = 7000` is derived, not measured** — from the lab's own 200 kWh/day glitch bound over a 31-day month. A genuinely high month would be blanked rather than shown.
- **`closed_month_check` drifts when PGE changes prices** (−2.7% for August before any formula error), so its line in the details must not be read as the forecast's accuracy.

## Success Criteria (Summary)

- Mid-month, the owner opens the dashboard and sees what this month is likely to cost as a range in złoty, how many days it rests on, and which settled month the estimate is built from.
- When the lab cannot produce a trustworthy figure — no complete days, missing settlement facts, unreadable rates, a stalled forecast job, fewer than 7 days, or an absurd value — the card says why and shows no number, and the other three cards keep working.
- The colour verdict answers "is this a lot?" against the last real invoice, and says plainly when there is no invoice to compare with.
