# Live Flow Interaction — Plan Brief

> Full plan: `context/changes/live-flow-interaction/plan.md`
> Research: `context/changes/live-flow-interaction/research.md`
> Adapted handoff and owner decisions: `context/changes/live-flow-interaction/handoff-adapted.md`

## What & Why

Make `Stan na żywo` a truthful, connected energy-flow diagram instead of four icon tiles: direction arrows, motion only on fresh flows, node details, a diagram/readings switch, a pause control, and green / amber / red verdicts on the battery, PV and consumption squares. Today the pulse keeps running on a stale snapshot, direction is words only, and there is no way to tell at a glance whether production, consumption or battery are good.

## Starting Point

`live-state-flow-visual` shipped four icon tiles and an opacity pulse gated on watts only (`LiveStateCard.astro:62-114`); `isStale` exists in the mapper but the card ignores it. The mapper has raw watts, direction words and `MIN_FLOW_W` but no verdicts; the usage norm and thresholds live in `usage-insight.ts`; the lab already pushes today's partial totals and the day's PV forecast in `daily_energy`. That earlier work is on unmerged branches, so this change starts from the current HEAD.

## Desired End State

Four squares around a `Scale` junction with arrowheads and dashes that move only while the snapshot is fresh, the flow is at least 50 W and motion is not paused. Battery, PV and consumption squares are tinted with a chip (icon and word) and a one-line reason; grid is neutral; stale or missing readings read "Bez oceny". Selecting a square shows reading, unit meaning and freshness; "Odczyty" shows the same numbers as text. View and pause survive the 5-minute reload. Works at 1440px and 390px.

## Key Decisions Made

| Decision           | Choice                                                                                                              | Why (1 sentence)                                                             | Source                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Animation          | Static arrows always; dashes only when fresh, nonzero, not paused; reduced motion keeps arrows                      | Stale data must never look live                                              | Plan (owner)                                                                  |
| Source colours     | New `--flow-*` tokens away from emerald, amber and red                                                              | Status colours already mean good, watch, problem                             | Research (owner)                                                              |
| Verdict colours    | Green, amber, red tint plus chip with word, on battery, PV, consumption; grid unrated                               | Colour is never the only signal; import and export are neither good nor bad  | Plan (owner)                                                                  |
| Battery edges      | 30% and 10%; 100% never bad                                                                                         | Reuses the existing charge bands                                             | Plan (owner)                                                                  |
| PV rating          | From 15:00 only; 85% and 60% of expected share; expected share from a 12-month table with linear rise to "day done" | No intraday data exists; a single constant would mislabel seasons            | Plan (owner chose table; values and interpolation are the planner's estimate) |
| Consumption rating | Against the usage median pro-rated by hours, +15% and +40%; none before 06:00                                       | Same words and edges as the yesterday card                                   | Plan (owner, edges reuse existing)                                            |
| Persistence        | Guarded `localStorage` for view and pause                                                                           | The reload every 5 minutes would reset them                                  | Research (owner)                                                              |
| Button             | Keep the Radix-based `Button`                                                                                       | Extend the system you have                                                   | Plan (owner)                                                                  |
| Badges             | `StatusBadge` moves to the tone tokens in Phase 2                                                                   | Badges and chips must share one palette                                      | Plan (owner)                                                                  |
| Battery rating     | Verdict and icon use the whole percent the label shows                                                              | Number, icon and chip never disagree at a line                               | Plan (owner)                                                                  |
| Branch             | New `feat/live-flow-interaction` from HEAD, draft PR                                                                | Earlier flow and glass commits are not in main                               | Plan (owner)                                                                  |
| Visual gate        | `push-fixture.mjs` scenarios plus screenshots, no new runner                                                        | Uses the local stack the repo already has                                    | Plan (owner)                                                                  |
| Sign check         | Import/export counters and SOC trend on real pushes                                                                 | Lab computes home load from the same signs, so comparing with it is circular | Research and plan (owner)                                                     |

## Scope

**In scope:** tokens, mapper verdicts and motion gate, flow island with details and toggles, PV and consumption verdicts with dashboard wiring, fixtures, screenshots, sign check, docs.

**Out of scope:** intraday chart and history selector (needs interval readings from the lab), Base UI migration, verdict on grid, recommendation card changes, contract or lab changes, other cards' colour literals (except `StatusBadge`).

## Architecture / Approach

A pure mapper computes every rule and is tested at its edges. `LiveStateCard.astro` stays static except for one React island that owns only presentation state (view, pause, selected node) and draws connectors from measured rectangles through a tested geometry function. The dashboard loads `daily_energy` once for both the usage card and the live verdicts.

## Phases at a Glance

| Phase                               | What it delivers                                                          | Key risk                                    |
| ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| 1. Tokens, tones, battery verdict   | `--flow-*` and tone tokens, motion gate and battery verdict in the mapper | Edges must match the decision               |
| 2. Static flow island               | Squares, junction, arrows, chips, details, readings view                  | Layout at 390px and hydration               |
| 3. Motion and controls              | Freshness-gated dashes, pause, persistence, reduced motion                | `localStorage` availability, focus          |
| 4. PV and consumption verdicts      | Two verdicts, norm reuse, single daily load                               | Estimated share table has no measured basis |
| 5. Fixtures, gate, sign check, docs | Reproducible states, screenshots, verified signs, docs                    | Sign check may disagree with the arrows     |

**Prerequisites:** local Supabase via the UGREEN Docker context for smoke and fixtures; owner read access to real pushes for the sign check. No new external prerequisite.
**Estimated effort:** about 5 sessions across 5 phases.

## Open Risks & Assumptions

- The 12-month expected-share table is estimated from clear-sky geometry, not measured; revisit after a year of lab data.
- Consumption is pro-rated linearly by hours, crude for a heat-pump house; the chip states what it compares.
- The homelab-2 manifest contradicts the battery sign (`solar-energy-analyser-api.v1.yaml:153`); outside this repo.
- A full reload resets selected square and focus; accepted and documented.
- PV and consumption fixture scenarios can only be pushed between about 15:05 and midnight (contract time bounds and newest-capture-wins), so their screenshots are taken then.

## Success Criteria (Summary)

- At a glance the owner sees which of battery, production and consumption is good, worth checking or a problem, and which flows are live.
- No stale, missing or unrated reading is coloured or animated as live.
- The states pass screenshots at 1440px and 390px, the sign check passes on real pushes, and the docs match the code.
