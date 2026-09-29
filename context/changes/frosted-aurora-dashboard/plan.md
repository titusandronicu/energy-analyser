# Frosted Aurora Dashboard Refresh Plan

## Overview

Refresh `/dashboard` to match the approved "B / Frosted Aurora" direction: deep blue-black background, restrained
aurora glow, navy/graphite readable panels, soft violet primary accent and the existing source colours for live flow.
This is a field-preserving UI pass over the working prototype, not a data/model change.

## Current State Analysis

- `src/pages/dashboard.astro` already composes the dashboard as header, `LiveStateCard`, `BillForecastCard`, and a
  lower grid with `RecommendationCard` plus `UsageInsightCard`.
- `src/styles/global.css` already owns the shadcn/Tailwind v4 token source, flow colours, tone colours, glass utility,
  flow dash animation, recommendation entrance animation and visible focus fallback.
- `src/components/ui/Panel.astro`, `src/components/ui/button.tsx` and `src/components/ui/DisclosureButton.tsx` are
  already present. No new UI primitive or dependency is needed.
- The live-flow prototype is already interactive and field-rich (`LiveFlow.tsx`): diagram/readings toggle, pause,
  selected-node details, source icons, verdict chips, freshness gating and reduced-motion support.
- Several dashboard cards still carry older `text-blue-100` and `bg-white/5` literals (`LiveStateCard`,
  `BillForecastCard`, `UsageInsightCard`, `TermsExplained`, and the dashboard header). Those literals bypass the
  token system and stop the selected palette from applying cleanly.

## Desired End State

`/dashboard` keeps the existing information architecture and every field, but visually reads as a polished Frosted
Aurora dashboard:

1. A subtle aurora page background that does not reduce text contrast.
2. A frosted header with token-driven text and border.
3. Opaque, readable data panels with slightly elevated borders and shadows.
4. Dashboard cards using semantic tokens (`text-card-foreground`, `text-muted-foreground`, `bg-muted`) instead of
   hardcoded blue/white literals.
5. Existing live-flow animation remains truthful: only current nonzero flows move, user pause and reduced motion stop
   movement, and stale data never looks live.

## Field Preservation Contract

The implementation must not remove or hide these existing surfaces:

- Header app name, account email and `Wyloguj`.
- Live card status, load-failure message, degraded/stale notices, diagram/readings controls, pause control, PV/home
  /battery/grid readings, battery SOC/direction, grid direction, selected-node details, legend, today period/PV/bought
  /sold totals, timestamp and glossary.
- Bill card status, unavailable reason, month label, range, central estimate, full-days count, confidence, basis
  details, glossary and disclaimer.
- Recommendation card status, generated-at label, stale warning, lead advice, findings, forecast, details disclosure,
  meaning/check sections, remaining findings, model label and advisory disclaimer.
- Usage card status, insufficient/load-failure messages, day label/fallback label, load/purchase values and deltas,
  baseline note, meaning/details ranges, verdict, reference and glossary fallback.

## What We Are Not Doing

- No new data fields, calculations, ingest contract changes, auth changes or inverter controls.
- No new chart library, animation library or second shadcn/Base UI button stack.
- No login redesign in this pass; the user's linked prototype target is `/dashboard`.
- No aggressive glass blur on data cards. Glass is limited to the header and subtle page ambiance.

## Implementation Steps

1. **Tokens and background**
   - Update `:root` palette in `src/styles/global.css` to the approved Frosted Aurora values.
   - Add a `bg-aurora` utility for a restrained radial-gradient background over `--background`.
   - Slightly enrich `glass-surface` and `Panel` surfaces using existing tokens only.

2. **Dashboard shell**
   - Apply `bg-aurora` to `src/pages/dashboard.astro`.
   - Replace header blue/white literals with foreground/muted token classes while keeping structure and sign-out form.

3. **Dashboard card token cleanup**
   - Replace remaining dashboard `text-blue-100*`, `text-white`, and `bg-white/5` literals in the three older cards
     and `TermsExplained.astro` with semantic token classes.
   - Keep all markup branches, `data-testid`s, copy and order intact unless a class-only change is needed.

4. **Verification**
   - Commit and push the pre-test implementation per cloud workflow, then create/update the PR.
   - Run `npm test`, `npm run lint`, and `npm run build`.
   - If practical, inspect `/dashboard` at desktop/mobile widths. Smoke test needs local Supabase and should only run
     when the local stack is available.

## Acceptance Criteria

- The selected B/Frosted Aurora palette is visible on `/dashboard`.
- Every field in the preservation contract remains in the source and rendered through the same branches as before.
- No hardcoded `text-blue-100`, `bg-white/5`, `border-white`, or `text-white` literals remain in dashboard cards.
- Motion remains truthful and respects pause/reduced-motion.
- Automated checks pass.
