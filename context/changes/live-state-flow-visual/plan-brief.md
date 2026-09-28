# Energy-Flow Visualization and Battery State — Plan Brief

> Full plan: `context/changes/live-state-flow-visual/plan.md`
> Research: `context/changes/live-state-flow-visual/research.md`

## What & Why

Give `Stan na żywo` a more modern, "living" feel: a connected flow diagram (solar → home → battery → grid) with `lucide-react` icons, a subtle ambient pulse on active flows, and a battery icon that reflects real charge level. A direct follow-up to `dashboard-glass-restyle`, which deliberately kept this section as a plain grid to reduce risk for the first pass.

## Starting Point

`LiveStateCard.astro` renders a plain 4-tile `<dl>` grid with no icons and no motion. Its mapper, `live-state.ts`, already computes every raw number this feature needs (watts, battery SOC) but discards them after formatting to display strings — the view model only exposes `pv: string`, `homeLoad: string`, etc. today.

## Desired End State

Opening `/dashboard` shows four icon-led, loosely-connected flow nodes instead of the old grid. Active flows (real power moving) pulse gently; inactive ones don't. The battery's icon shows its actual charge level and charging state. Everything currently on the card — every number, every direction word, every status — still appears, unchanged in wording. Reduced-motion users see the identical diagram with zero animation.

## Key Decisions Made

| Decision            | Choice                                    | Why (1 sentence)                                                                                                           | Source                 |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Icon source         | `lucide-react` (already installed/used)   | Geist's icon set is developer-tool-focused with no confirmed energy icons; lucide already has everything needed            | Research / Plan (user) |
| Animation style     | Subtle continuous pulse, no moving parts  | Reads as "alive" without being distracting on a monitoring dashboard; simplest reduced-motion story                        | Plan (user)            |
| Layout              | Replace the 4-tile grid with a diagram    | Matches the old lab page's precedent most directly; avoids showing numbers twice                                           | Plan (user)            |
| Data layer          | Add raw numbers to `LiveStateView`        | Enables a genuinely proportional battery-charge icon; PV/home/grid stay active/inactive only (no capacity baseline exists) | Plan (user)            |
| Reduced motion      | Fully static (pulse stops entirely)       | Standard accessibility pattern; simplest to implement correctly                                                            | Plan (user)            |
| Visual verification | Direct screenshots (no kitchen-sink page) | Same approach already proven this session for `dashboard-glass-restyle`                                                    | Plan (user)            |

## Scope

**In scope:**

- `src/lib/services/live-state.ts` and its tests (new raw-number fields, `chargeLevel`)
- `src/components/LiveStateCard.astro` (full markup rebuild)
- `src/styles/global.css` (one new animation utility + its reduced-motion override)

**Out of scope:**

- Any other card (`BillForecastCard`, `UsageInsightCard`, `RecommendationCard`, `ForecastCard`) or the dashboard grid layout
- Proportional sizing for PV/home/grid (no capacity/baseline data exists to scale against)
- A moving-dot-along-a-path animation (chose a subtle pulse instead)
- Geist icons or any second icon library
- A kitchen-sink verification page

## Architecture / Approach

Four phases: expose the raw numbers the mapper already computes (Phase 1), rebuild the card's markup as a static icon diagram using them (Phase 2), add the ambient pulse and its global reduced-motion override (Phase 3), then verify every existing card state against the new markup (Phase 4). No client JavaScript — this stays a pure `.astro` dumb renderer with a CSS-only animation, consistent with every other card in the app.

## Phases at a Glance

| Phase                     | What it delivers                                              | Key risk                                                                                    |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. Data layer             | Raw numbers + `chargeLevel` on `LiveStateView`, tests updated | Low — additive fields, existing `toEqual` tests need updating but logic is unchanged        |
| 2. Static flow diagram    | New icon-led markup, no animation                             | Medium — full markup rebuild; must preserve the `"3,1 kW"` smoke-test string                |
| 3. Pulse + reduced motion | Ambient pulse on active nodes, global reduced-motion override | Low — CSS-only, but this repo's first continuous animation (no existing pattern to lean on) |
| 4. States & verification  | Every status/degraded/stale state re-verified                 | Low — verification only                                                                     |

**Prerequisites:** None beyond what's already in the repo (`lucide-react` already installed).
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- Exact node arrangement and connecting-line treatment (Phase 2) are left to the implementer, loosely inspired by the old lab page's four-corner-plus-cross-lines layout — not a pixel-exact copy.
- The battery charge-level thresholds (80/30/10%) are a new, first-time product decision with no prior precedent in this repo; they affect only which icon shows, not any displayed number or verdict.

## Success Criteria (Summary)

- The diagram replaces the old grid with correct icons, values, and directions for every flow.
- Active flows pulse; inactive ones don't; reduced-motion users see zero animation.
- Every existing number, status, and Polish label still appears unchanged.
- `npm run smoke` still passes.
