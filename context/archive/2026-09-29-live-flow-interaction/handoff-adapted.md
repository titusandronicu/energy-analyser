# Carbon Atlas handoff, adapted to energy-analyser

Source: handoff pasted 2026-09-29 (Atlas snapshot `63747520`, not run). Adapted against the repository as of branch `feat/recommendation-card-refresh`. Claims below were checked against files; anything marked _verify_ was not.

## What the handoff assumed vs what exists

| Handoff                                    | Reality here                                                                                                                                                         | Consequence                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket 1: inspect and map                  | Done for this change (table below)                                                                                                                                   | Skip; reuse the map                                                                                                                         |
| Ticket 2: token-based smoked-glass restyle | Shipped as `dashboard-glass-restyle` (implemented). Tokens are in `global.css:6-42`, header glass in `global.css:123`, Panel in `components/ui/Panel.astro`          | Not repeated. Remaining gap is token hygiene (charge 1)                                                                                     |
| Ticket 3: flow + battery                   | Partly shipped as `live-state-flow-visual`: icon nodes, battery level icon, pulse, reduced motion. No connectors, arrows, node details, view switch, pause control   | **This change**                                                                                                                             |
| Ticket 4: history chart                    | The contract carries only per-day totals (`daily_history`, `contract.ts:151`) plus `bill_forecast.days`; no kW interval series. Real history starts about 2026-07-16 | **Deferred.** Missing contract: intraday interval readings (kW) from the lab. Daily totals belong to `period-selector`, never to a kW chart |
| Ticket 5: validate                         | Existing gates: `npm test`, `npm run lint`, `npm run build`, `npm run smoke` (asserts `"3,1 kW"` text). No Playwright or screenshot runner                           | Use the kitchen-sink page plus direct desktop and mobile screenshots, as the earlier changes did. Do not add a runner                       |
| Astro version-matching, Plotly/Highmaps    | Astro 7, React 19 islands, no chart library                                                                                                                          | Add no chart dependency                                                                                                                     |
| Base UI Button                             | `button.tsx` is Radix Slot (`button.tsx:2`), used by auth forms and `DisclosureButton.tsx`                                                                           | Keep, extend (owner decision)                                                                                                               |
| Polish copy, advisory-only                 | Same rule in `design-brief.md` and `docs/decisions.md`                                                                                                               | Unchanged                                                                                                                                   |

## Audit: charges for this view

Each charge is input to the plan.

1. **Missing tokens (literal colours).** `LiveStateCard.astro` uses `text-blue-100`, `text-blue-100/60`, `text-blue-100/70`, `bg-white/5`, `bg-white/10`, `divide-white/10` on lines 50, 55, 59, 62, 71 to 137; about 24 occurrences, and `BillForecastCard` (12), `UsageInsightCard` (20), `Banner` (9), `RecommendationCard` (8) do the same. The design brief's `muted-foreground` and `border` roles exist in `global.css:22,31` but this card ignores them. Impact: a token change (or the brief's contrast check) does not reach the card that carries the most important reading. Fix: map these to role tokens, and add source-role tokens (`--flow-pv`, `--flow-home`, `--flow-grid`, `--flow-battery`) so nodes, arrows and future charts share one colour identity. The unused `--chart-1..5` tokens (`global.css:29-33`) are the natural home; decide in research.
2. **Missing behaviour: motion ignores freshness.** `animate-flow-pulse` is applied on watts alone (`LiveStateCard.astro:66,78,90,106`); `isStale` exists in the view (`live-state.ts:117`) but the card never reads it. A 3-hour-old snapshot still pulses as "alive". Impact: stale data looks live, the exact failure the design brief forbids ("never show stale readings as fresh").
3. **Missing shared component / accidental structure.** Four near-identical node blocks are repeated by hand (`LiveStateCard.astro:62-114`), with no connectors, no direction arrows (direction is words only) and no node details. Impact: the "flow" is four tiles; direction has to be read, not seen. Fix: one `FlowNode` and a small SVG connector layer; keep the `<dt>`/`<dd>` text.
4. **Missing shared component: controls.** The only interactive React island is `ui/DisclosureButton.tsx`; there is no toggle for details, diagram/readings, or motion pause. `button.tsx:8` also relies on `focus-visible:ring-*` classes that the file's own comment in `global.css:165-168` says do not render; visible focus works only via the unlayered `:focus-visible` rule at `global.css:169`. Impact: any new control is only as focus-visible as that global override.
5. **Accidental architecture (entry states).** Checked: page guard is `PROTECTED_ROUTES` middleware, and the card handles `null` (load failed), `empty` and `state`. Not handled: a `state` whose readings are all null (no "missing" treatment beyond "–"), and a snapshot that is stale _and_ degraded gets one badge. Impact: partial and stale cases are indistinguishable at a glance. Deferred to research to decide how much to show per node (per-source timestamps do not exist in the contract, so the card must not imply them).

## Adapted scope (replaces handoff tickets 2 to 5)

**In scope**

- Node layout with SVG connectors between PV, home, battery and grid via a schematic balance junction. No proportional line widths and no invented allocation (no capacity or baseline exists, see `live-state-flow-visual/plan.md` Key Discoveries).
- Direction arrows on grid and battery from the mapper's existing `direction` words (`live-state.ts:123,125`), which follow the contract's sign convention. Arrows are static; text stays.
- Motion gate: animate only when `!view.isStale`, the flow's `watts` is known and at least `MIN_FLOW_W`. Missing or stale stops the motion. One shared rule for the pulse and any moving arrow.
- Motion controls: a pause toggle (user preference, small client state, kept out of any URL) plus the existing `prefers-reduced-motion` override. Pause and reduced motion keep static arrows. Polling is the page reload timer in `dashboard.astro:96-110` and is unaffected; check that pausing does not touch it and that the reload does not reset the chosen view (a full reload does reset client state, so persist the two preferences in `localStorage` with try/catch, or accept the reset and state it).
- Node details: keyboard-operable disclosure per node showing the reading, the unit meaning (kW is power now, kWh is energy) and freshness (`capturedAtLabel`, `ageLabel`). Reuse `TermsExplained` and `glossary.ts` rather than new copy where possible.
- Diagram/readings switch: same view model feeds both; both must show identical numbers.
- Battery: keep the level icon; add a fill only from `socPct`; unknown SOC shows no fill, never 0%.

**Owner of state:** the card stays Astro; add one small React island for the interactive controls only (the repo already hydrates `DisclosureButton`). Do not have a DOM script and React update the same subtree.

**Out of scope**

Intraday chart and any history UI (deferred, see table); URL state for date or view (no history to select); Base UI migration; a second chart or icon library; changing `live-state.ts` thresholds or wording; inverter controls; recommendation card (own change).

## Prerequisites and docs

- External prerequisites: none expected. Only if a later change asks the lab for intraday readings does `docs/prerequisites.md` need an entry.
- Docs to update in the same change (lessons.md): `docs/decisions.md` (dated entries: freshness-gated motion, Radix kept over Base UI, history chart deferred with its missing contract). `docs/logic.md` only if a threshold changes; none planned. `docs/architecture.md` unchanged (no data-flow change).

## States to cover (kitchen sink)

default, hover, focus, disabled, error (`view === null`), empty (`kind: "empty"`), loading not applicable (SSR), plus data cases: charging, discharging, idle, import, export, all-null readings, stale (>15 min), problem (>2 h), degraded, paused, reduced motion. Desktop 1440px and mobile 390px. Verify focus is visible on every new control and text contrast on `card` composited surfaces.

## Open questions for research and the owner

1. Where do the node and source colours come from: reuse `--chart-*`, or new `--flow-*` tokens? (Recommendation: new `--flow-*` aliasing the chart tokens; one source.)
2. Persist the pause and view preferences across the 5-minute reload, or accept a reset? (Recommendation: `localStorage`, guarded.)
3. Is a moving arrow (dash offset) acceptable, or is the existing opacity pulse the only motion? Decided by the owner as "arrows + fresh-only motion"; confirm the concrete look on a screenshot before finishing.
4. **Sign convention is undocumented at the contract.** `contract.ts:21-24` types `grid_w` and `battery_w` as bare nullable numbers, and `docs/ingest/README.md` has no match for either field. The only statement of direction is the mapper (`grid_w > 0` import, `battery_w > 0` discharge, `live-state.ts:123,125`), whose comment cites the contract but the contract does not say it. Before drawing arrows, confirm against the lab's export (homelab-2) and write the convention into `docs/ingest/README.md`; the handoff requires arrows that match documented direction.

## Plan phases (proposed, per /10x-ui)

1. Tokens: role tokens and `--flow-*` in `global.css`; replace the literals in `LiveStateCard` only (other cards' literals are logged as deferred).
2. Structure: `FlowNode`, connectors, direction arrows, battery fill; static.
3. Motion and controls: freshness gate, pause toggle, reduced motion; island for details and switch.
4. States: kitchen sink page, screenshots at 1440 and 390, focus and contrast pass, `npm test`, `npm run lint`, `npm run build`, `npm run smoke`.

## Deferred (recorded, not dropped)

- Literal-colour cleanup in `BillForecastCard`, `UsageInsightCard`, `Banner`, `RecommendationCard` (charge 1 beyond this view).
- Day-profile chart: needs intraday kW readings pushed by the lab (new contract section), not derivable from daily totals.
- Base UI Button migration.

## Owner decisions 2026-09-29 (after research and mockups)

- Source colours: approved, new `--flow-*` tokens away from emerald/amber/red (research Q1).
- Sign convention: verify against one live snapshot before shipping arrows (research Q4, owner said yes).
- Persistence: guarded `localStorage`, view and pause only (research Q2).
- Motion: dashed connectors with static arrowheads, freshness-gated (approved on the mockup).
- Layout: dashboard mockup approved, icons on nodes and headings (lucide-react in the app), `Scale` icon on the balance junction, recommendation findings always visible with the forecast inline.
- Verdict colours on the flow squares: widest option chosen (battery, PV vs forecast, consumption vs norm). Squares are tinted green, amber or red by verdict, with a chip carrying icon and word, so colour is never the only signal. **PV is rated only from 15:00 Europe/Warsaw**; before that the chip reads "Bez oceny · za wcześnie".

## Verdict rules for the nodes (new logic: docs/logic.md and docs/decisions.md change in the same PR)

Principle: the icon keeps the source hue (identity); the square's tint and chip carry the verdict, in the existing tone vocabulary (good / watch / problem / insufficient, `src/lib/format/status.ts`). "Normal" is good, as in the usage insight ("w normie"). Exactly on a line takes the milder status. Nothing is rated on a stale, missing or degraded reading; the square stays neutral and the chip says "Bez oceny" with the reason.

| Node         | Compares                                                                | good                                | watch           | problem   | Data                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------- | ----------------------------------- | --------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bateria      | SOC now                                                                 | 30% and above (100% is never bad)   | 10 to under 30% | under 10% | existing `BATTERY_LOW_AT` and `BATTERY_WARNING_AT` (`live-state.ts:15-17`); edges _proposed_                                                                                              |
| Produkcja PV | today's kWh so far against today's forecast, only from 15:00            | 85% and above of the expected share | 60 to under 85% | under 60% | `daily_history` today row (`pv_kwh`), `recommendation.forecast.today_kwh`; expected share of the day's forecast by 15:00 is one named constant still to fix in the plan; edges _proposed_ |
| Zużycie domu | today's kWh so far against the norm pro-rated linearly by hours elapsed | up to +15% (lower is never bad)     | over +15%       | over +40% | `daily_history` today row (`load_kwh`), usage-insight median; edges reuse the usage insight's 15% and 40%                                                                                 |
| Sieć         | none                                                                    | none                                | none            | none      | import and export are not good or bad; direction only                                                                                                                                     |

Still open for the plan:

1. Expected share of the day's forecast produced by 15:00 (one constant, tested at its edges, written in `docs/logic.md`).
2. Consumption is pro-rated linearly (`norm x hours / 24`), crude for a heat-pump house; the chip states what it compares. Before 06:00 it reads "Bez oceny · za wcześnie", and with fewer than 7 baseline days "za mało danych".
3. These are the first verdicts on the live card: each rule is a named constant in the mapper, unit-tested at its edges, with a dated `docs/decisions.md` entry. Ratings describe and never advise.
4. Delivery can be staged inside this change: battery verdict and tone plumbing first (data exists today), PV and consumption verdicts next.
5. Verify the grid and battery sign against one live snapshot before shipping arrows (`pv + grid + battery` against the inverter's load reading).
