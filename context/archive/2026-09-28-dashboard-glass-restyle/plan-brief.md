# Dashboard Glass Restyle — Plan Brief

> Full plan: `context/changes/dashboard-glass-restyle/plan.md`
> Research: `context/changes/dashboard-glass-restyle/research.md`

## What & Why

Restyle `/dashboard` into a calm, iOS-inspired "smoked glass" dark dashboard, per a design brief the user provided. The repo already has a complete shadcn/Tailwind v4 token system and a real `Button` component that nothing on the dashboard uses — every card hardcodes its own colors instead — so this is as much a token/component cleanup as a visual refresh.

## Starting Point

Four cards (`LiveStateCard`, `BillForecastCard`, `UsageInsightCard`, `RecommendationCard`) each render from a pure `{ view }` prop with no client JS, but all four duplicate the identical hardcoded shell string and raw Tailwind color classes instead of the unused token layer in `src/styles/global.css`. `BillForecastCard` was added earlier the same day as this brief in a separate change (`bill-forecast`), so the original brief's hierarchy doesn't mention it.

## Desired End State

Opening `/dashboard` shows one consistent glass surface: a frosted header, opaque token-driven card panels, four equally-weighted live metrics, a compact "Dzisiaj" row, and a 2:1 grid pairing the recommendation with a stacked usage + PV-forecast column — all with the exact same Polish copy, data, and failure/empty states as today.

## Key Decisions Made

| Decision                      | Choice                                                                                 | Why (1 sentence)                                                                                    | Source      |
| ----------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------- |
| `BillForecastCard` placement  | Stays at position 2                                                                    | Preserves the deliberate "late cost feedback surfaces early" decision from the bill-forecast change | Plan (user) |
| Forecast/recommendation split | Extract PV-forecast + confidence into a new `ForecastCard`, stacked with usage insight | Matches the brief's spatial layout and fixes "confidence far from what it qualifies"                | Plan (user) |
| Live metrics layout           | Plain equal-weight token grid, not a radial-ring flow-board                            | Lower implementation risk for a first restyle pass                                                  | Plan (user) |
| Palette wiring                | Repoint `:root` directly to the dark values                                            | The app has no light mode and never applies a `.dark` class                                         | Plan (user) |
| `StatusBadge` tone colors     | Leave as the existing Tailwind-literal map                                             | Already the single source; lifting into CSS variables is unscoped work                              | Plan (user) |
| Shared panel scope            | Dashboard's 4 cards only, not the 2 auth pages with the same duplicated shell          | Matches `/10x-ui`'s "one view" rule                                                                 | Plan (user) |

## Scope

**In scope:**

- `src/styles/global.css` token/radius/utility additions
- New `Panel.astro` and `DisclosureButton.tsx` shared components
- New `ForecastCard.astro`
- `src/pages/dashboard.astro` layout recomposition
- All four dashboard card components' shell + (for `LiveStateCard`) internal grid markup
- Sign-out button restyled via the shared `Button`

**Out of scope:**

- Auth pages' duplicated shell (`check-email.astro`, `signin.astro`)
- `StatusBadge`'s tone-color architecture
- Any mapper/service logic (`recommendation.ts`, `usage-insight.ts`, `bill-forecast.ts`, `live-state.ts`)
- New charts, calculations, inverter controls, or backend recommendation changes
- Porting the old lab page's deeper analysis panels (PGE reconciliation, battery TOU planning, anomaly detection) — noted as a future roadmap idea only

## Architecture / Approach

Four phases: (1) put the brief's palette and a new panel-radius token into `global.css`, which is already wired but unused; (2) build `Panel` and a small React-island `DisclosureButton` (wrapping the existing shadcn `Button`) in isolation; (3) wire both into `dashboard.astro` and all four cards in one recomposition pass, extracting the PV-forecast block out of `RecommendationCard` into its own `ForecastCard`; (4) a dedicated states/keyboard/viewport verification pass. No mapper or service-layer code changes anywhere — this is templates and tokens only.

## Phases at a Glance

| Phase                   | What it delivers                                                          | Key risk                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. Environment & tokens | Dark palette + panel radius + glass utility in `global.css`               | Low — values only, nothing renders differently yet                                                           |
| 2. Shared components    | `Panel.astro`, `DisclosureButton.tsx` built and type-checked              | Low — built in isolation, not yet wired in                                                                   |
| 3. Single view          | Full dashboard recomposition, forecast extraction, shared panel adoption  | Medium — the forecast extraction crosses a component boundary and needs the type-narrowing noted in the plan |
| 4. States & a11y        | Keyboard/focus pass, all failure states re-verified, final viewport check | Low — verification only, one contingent CSS fix if focus isn't visible                                       |

**Prerequisites:** None beyond what's already in the repo (Tailwind v4, `@astrojs/react`, `button.tsx`, `components.json` all already configured).
**Estimated effort:** ~1-2 sessions across 4 phases.

## Open Risks & Assumptions

- The exact wording for "keep generation time visible beside the recommendation status" (brief) is left to the implementer in Phase 3 — a short label at the top plus full metadata inside the disclosure, not a new data field.
- `ForecastCard`'s empty-state rendering (when the recommendation itself has no data) is left to the implementer's judgment, matching how other cards already handle an absent view.

## Success Criteria (Summary)

- At a glance, a user can locate solar production, home consumption, grid direction, and battery charge/state.
- At 1440px and 390px, there is no horizontal overflow, clipped label, or overlapping control.
- Every existing load-failure, empty, and stale state still renders with its original Polish wording, now under the new palette.
- The "Pokaż szczegóły" control is keyboard-operable with visible focus and correct `aria-expanded` state.
