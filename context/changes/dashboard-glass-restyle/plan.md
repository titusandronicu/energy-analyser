# Dashboard Glass Restyle Implementation Plan

## Overview

Restyle `/dashboard` as a calm, iOS-inspired "smoked glass" dark dashboard by wiring it onto the shadcn/Tailwind v4 token system and `Button` component that already exist in this repo but that no dashboard view currently uses, then recomposing the four existing cards into the design brief's layout.

## Current State Analysis

The dashboard (`src/pages/dashboard.astro`) renders four cards — `LiveStateCard`, `BillForecastCard`, `UsageInsightCard`, `RecommendationCard` — each a pure `{ view }` → markup renderer with no client JS, a `StatusBadge` under its heading, and a native `<details>` for "more" content. `src/styles/global.css` already ships a complete shadcn token set (`:root`/`.dark`/`@theme inline`, Tailwind v4 via `@tailwindcss/vite`) and `src/components/ui/button.tsx` is a real, token-only shadcn `Button` — but every card ignores both, hardcoding the identical shell string `rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl` and `text-blue-100`/`text-white` literals throughout. `@astrojs/react` is wired and already used for the auth flow's six `.tsx` components, so a small interactive island for a controlled disclosure needs no new integration work. Full findings: `context/changes/dashboard-glass-restyle/research.md`.

## Desired End State

`/dashboard` reads as one visually consistent "smoked glass" surface: a frosted header, opaque token-driven card panels (no per-view hardcoded colors), four equally-weighted live metrics, a compact "Dzisiaj" row, and a 2:1 grid pairing the recommendation with a stacked usage-insight + PV-forecast column. The shared `Panel` and `Button` components carry the visual language so a future palette change is a token edit, not a per-card find-and-replace.

Verify by opening `/dashboard` at 1440px and 390px: every card renders from the shared `Panel`, the header shows the glass treatment with a readable opaque fallback, the "Pokaż szczegóły" control on the recommendation is keyboard-operable with visible focus, and every existing load-failure/empty/stale state still renders correctly, unchanged in wording.

### Key Discoveries:

- The four cards' identical shell literal is duplicated verbatim at `LiveStateCard.astro:17`, `BillForecastCard.astro:53`, `UsageInsightCard.astro:23`, `RecommendationCard.astro:19` — the textbook `/10x-ui` "missing shared component" case (`research.md`, grievance 3).
- `src/components/ui/button.tsx` is a genuine, already-integrated shadcn `Button` (cva, token-only classes) that nothing on the dashboard uses yet (`research.md`, grievance 4).
- `global.css`'s `:root` (`global.css:6-39`) is the block actually active today (no `dark` class is ever applied — `Layout.astro:14`), so the new dark palette belongs directly in `:root`, not layered behind an unused `.dark` toggle.
- `RecommendationView` (`recommendation.ts:25-44`) already separates structured `forecast`/`findings` fields from the narrative `text` — no mapper change needed to relocate the forecast block, only a template split.
- `StatusBadge.astro:13-18` already centralizes the four tone colors in one place; this plan leaves that map as Tailwind literals rather than lifting it into CSS custom properties (out of scope — see below).
- Tailwind's default spacing scale already covers the brief's 4/8/12/16/24/32px steps (`p-1`…`p-8`) and `text-base`/`text-sm` cover its 16px/14px body text — no new spacing or font-size tokens needed, only a new radius token for 20px panels and the color values.

## What We're NOT Doing

- Not touching `src/pages/auth/{check-email,signin}.astro`, which duplicate the same shell literal — left as a deferred, noted grievance for a future change (decision: dashboard-only scope).
- Not lifting `StatusBadge`'s tone colors into `--color-*` CSS custom properties — its existing Tailwind-literal `TONE_CLASSES` map stays as the single source (decision: don't expand scope beyond the audited grievances).
- Not building a radial-ring "flow-board" for live metrics — a plain equal-weight token-driven grid instead (decision: lower implementation risk for a first restyle pass).
- Not adding a `.dark` class toggle or light-mode support — the app has no light mode and the brief doesn't ask for one; the new palette goes straight into `:root`.
- Not changing any mapper/service logic (`recommendation.ts`, `usage-insight.ts`, `bill-forecast.ts`, `live-state.ts`) — every existing view-model field, threshold, and Polish string is unchanged; only templates move.
- Not redesigning login/sign-in pages, adding new charts or energy calculations, changing backend recommendation generation, or adding inverter controls (per the design brief's explicit exclusions).
- Not porting the old lab page's deeper analysis panels (PGE reconciliation, battery TOU planning, anomaly detection) — noted in `old-lab-page-reference.md` as a possible future roadmap idea, out of scope here.

## Implementation Approach

Four phases matching `/10x-ui`'s standard shape — environment/tokens, shared components, the one view, then states — so each phase's verification covers a bounded slice: token values first (nothing visibly changes yet beyond `:root`'s raw values), then build the shared `Panel`/`Button`/disclosure primitives in isolation, then wire everything into `dashboard.astro` and its four cards in one recomposition pass, then a dedicated states/accessibility/viewport pass. This keeps the risky part — moving the PV-forecast block out of `RecommendationCard` — isolated to a single phase where it's easy to verify against the unchanged underlying data.

## Critical Implementation Details

**Type narrowing when extracting the forecast block.** `RecommendationView` is a union (`{ kind: "empty" } | { kind: "recommendation"; forecast: {...}; ... }`); `forecast` only exists on the `"recommendation"` variant. `RecommendationCard.astro` currently guards its whole body with `view?.kind === "recommendation" &&`. Because `ForecastCard` (Phase 3) is a sibling component in `dashboard.astro`, not a child of `RecommendationCard`, `dashboard.astro` must repeat that same narrowing when computing its prop (`view?.kind === "recommendation" ? view.forecast : null`) — there is no shared guard between the two once the block moves out.

## Phase 1: Environment & tokens

### Overview

Put the design brief's palette and radius scale into the token source that's already wired but unused, without touching any view yet.

### Changes Required:

#### 1. Dark palette values

**File**: `src/styles/global.css`

**Intent**: Repoint `:root` — the block actually active today — to the brief's dark palette, since the app has no light mode and `.dark` is never applied. Use the brief's literal hex/rgba values directly; no oklch conversion is needed, Tailwind v4 accepts any valid CSS color.

**Contract**: In `:root` (`global.css:6-39`), set `--background: #101218`, `--card: #1C1F29`, `--muted: #252936`, `--foreground: #F3F4F8`, `--muted-foreground: #B0B6C6`, `--primary: #B5A3F5`, `--primary-foreground: #171222`, `--ring: #D2C5FF`, `--border: #353B4B`, `--destructive: #FDA4AF`. Leave `--secondary`, `--accent`, `--popover`, `--chart-*`, `--sidebar-*` and `.dark` untouched — nothing currently reads them, and re-deriving values for tokens no view uses is unscoped work.

#### 2. Panel radius token

**File**: `src/styles/global.css`

**Intent**: The brief wants two distinct radii (12px controls, 20px major panels) but the current `--radius` chain (`global.css:76-79`) only derives one scale from a single base. Add a second, independent radius token for panels rather than restructuring the existing chain.

**Contract**: Add `--radius-panel: 20px;` to both `:root` and the `@theme inline` block (as `--radius-panel: var(--radius-panel);` is unnecessary — Tailwind v4 maps a `--radius-*` key in `@theme inline` directly to a `rounded-*` utility, so declaring it once in `@theme inline` as `--radius-panel: 20px` makes `rounded-panel` available). Set `--radius` itself to `12px` (from `0.625rem` ≈ 10px) so the existing `rounded-lg`/`rounded-md`/etc. chain used by `button.tsx` matches the brief's control radius.

#### 3. Glass surface utility

**File**: `src/styles/global.css`

**Intent**: One reusable utility for the header's glass treatment, per the brief ("apply glass primarily to the header... with an opaque fallback"). Not applied to any markup yet — that's Phase 3.

**Contract**: A new `@utility glass-surface` (alongside the existing `@utility bg-cosmic` at `global.css:113-115`) combining a translucent `--color-card` background with `backdrop-filter: blur(14px)` and a `@supports not (backdrop-filter: blur(1px))` fallback to an opaque `--color-card`, e.g.:

```css
@utility glass-surface {
  background: color-mix(in srgb, var(--color-card) 78%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--color-border);
}
@supports not (backdrop-filter: blur(1px)) {
  .glass-surface {
    background: var(--color-card);
  }
}
```

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Inspecting `:root`'s computed styles in devtools shows `--background`, `--card`, `--primary`, `--ring`, `--border`, `--destructive` matching the brief's hex values, and `--radius-panel` resolving to 20px
- `rounded-panel` is usable as a Tailwind utility class (confirm via a throwaway element in devtools or the browser's Tailwind class inspector)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Shared components

### Overview

Build the shared `Panel` shell and the controlled-disclosure primitive in isolation, so Phase 3 only has to wire them in rather than design them.

### Changes Required:

#### 1. Shared glass panel

**File**: `src/components/ui/Panel.astro` (new)

**Intent**: Replace the four cards' duplicated shell literal with one token-driven component — opaque, no blur, per the brief's "main data panels should remain easy to read without relying on blur."

**Contract**: `interface Props { class?: string }`, default classes `rounded-panel border border-border bg-card text-card-foreground p-6`, merged with any passed `class` via the existing `cn()` helper (`src/lib/utils.ts`), rendering a single `<slot />`. Callers replace their own `<section class="...">` root with `<Panel>...</Panel>`.

#### 2. Controlled disclosure

**File**: `src/components/ui/DisclosureButton.tsx` (new)

**Intent**: The one native `<details>` the brief asks to become an explicit controlled control — `Pokaż szczegóły`/`Ukryj szczegóły` on the recommendation's findings — built on the existing shadcn `Button`. Every other card's own contextual disclosure (glossary, "Na podstawie") stays native, per the brief ("existing accessible native disclosures may remain native").

**Contract**: `interface Props { openLabel: string; closeLabel: string; controlsId: string; children: React.ReactNode }`. Local `useState<boolean>` toggles: a `Button` (`variant="outline"`, `type="button"`, `aria-expanded={open}`, `aria-controls={controlsId}`) showing `openLabel`/`closeLabel`, followed by `<div id={controlsId} hidden={!open}>{children}</div>`. Used from an `.astro` file with `client:load` (small enough that finer-grained hydration timing isn't worth the complexity).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Single view — recompose the dashboard

### Overview

Wire `Panel`, `Button`, and `DisclosureButton` into the dashboard, extract the PV-forecast block out of `RecommendationCard`, and rebuild the page layout per the design brief.

### Changes Required:

#### 1. Extracted forecast block

**File**: `src/components/ForecastCard.astro` (new)

**Intent**: Render the PV-forecast figures and confidence badge that currently live inside `RecommendationCard`'s `<dl>` (`RecommendationCard.astro:62-84`), as their own small panel so they can sit beside `UsageInsightCard` in the brief's right-hand column — fixing the brief's problem #5 (forecast metadata far from what it qualifies).

**Contract**: `interface Props { forecast: RecommendationView["forecast"] | null }`. When `null`, render nothing (or the card's own `insufficient` styling — implementer's call, matching how other cards handle an absent view). When present, reuse the exact same labels/markup currently at `RecommendationCard.astro:62-84` (`todayLabel`/`tomorrowLabel`/day labels/`certainty` badge) inside a `<Panel>`. No new formatting logic — this is a template relocation, not a new calculation.

#### 2. Recommendation card: remove forecast block, add controlled disclosure

**File**: `src/components/RecommendationCard.astro`

**Intent**: Keep only the narrative, status, and findings; the forecast block moves to `ForecastCard` (above) and the findings `<details>` (`RecommendationCard.astro:87-96`) becomes the Phase 2 `DisclosureButton`.

**Contract**: Remove the `<dl>` forecast block (lines 62-85). Replace the native `<details><summary>Na podstawie</summary>...</details>` around `view.findings` with `<DisclosureButton client:load openLabel="Pokaż szczegóły" closeLabel="Ukryj szczegóły" controlsId="recommendation-details">` wrapping the same findings list, plus the model/provider metadata (`generatedAtLabel`/`modelLabel`, currently at line 98-100) moved inside this disclosure too, per the brief's progressive-disclosure ask. Root `<section>` becomes `<Panel>`. The recommendation's own status badge (top of card) keeps `generatedAtLabel` visible beside it if the brief's "keep generation time visible beside the recommendation status" reading requires a short label at the top in addition to the full metadata inside the disclosure — implementer's call on wording, not a new field.

#### 3. Dashboard layout

**File**: `src/pages/dashboard.astro`

**Intent**: Apply the header glass treatment, swap the page background from the hand-rolled `bg-cosmic` gradient to the token-driven `bg-background`, route the sign-out control through the shared `Button`, and rebuild the section order into the brief's hierarchy: live state → bill forecast (position 2, unchanged per the "keep at position 2" decision) → a 2:1 grid pairing `RecommendationCard` (left) with a stacked right column of `UsageInsightCard` + `ForecastCard`.

**Contract**: Header markup gets `class="glass-surface"` (from Phase 1). The `bg-cosmic` class on the page wrapper (`dashboard.astro:62`) becomes `bg-background`. The sign-out `<button type="submit">` (`dashboard.astro:69`) is restyled via the shared `Button`'s `ghost` variant (or `buttonVariants({variant:"ghost"})` applied to the existing element — implementer's choice, whichever keeps the existing form/handler untouched). Below `BillForecastCard`, a new grid container (e.g. `grid gap-6 lg:grid-cols-3`, `RecommendationCard` spanning 2 columns, the right column spanning 1, collapsing to a single stacked column below `lg`) replaces the current flat vertical stack, with `ForecastCard` fed `view?.kind === "recommendation" ? view.forecast : null` per the type-narrowing note above.

#### 4. Live state, bill forecast, usage insight cards: adopt the shared panel

**File**: `src/components/LiveStateCard.astro`, `src/components/BillForecastCard.astro`, `src/components/UsageInsightCard.astro`

**Intent**: Replace each card's own literal shell (`LiveStateCard.astro:17`, `BillForecastCard.astro:53`, `UsageInsightCard.astro:23`) with `<Panel>`, matching `RecommendationCard`'s change above. In `LiveStateCard`, additionally restructure the five live-metric tiles (`LiveStateCard.astro:29-52`) into four equal-weight groups — PV, home load, grid, and battery, with battery's percentage and its charge/discharge direction combined into one group instead of two separate tiles — with the existing "Dzisiaj" totals (`LiveStateCard.astro:54-72`) as a distinct compact row beneath.

**Contract**: No `view` field changes in any of the three cards — `view.pv`/`view.homeLoad`/`view.grid`/`view.battery`/`view.today` (LiveStateCard) and the other two cards' view types are read exactly as today; only root-element and (for `LiveStateCard`) internal grid markup changes.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`
- The smoke test passes against a running server with the recomposed dashboard: `npm run smoke`

#### Manual Verification:

- On `/dashboard`, cards render in order: live state, bill forecast, then a 2:1 grid with the recommendation on the left and usage insight + forecast stacked on the right
- The header shows the glass treatment and remains readable (opaque fallback works when `backdrop-filter` is unsupported)
- The PV-forecast figures and confidence badge render in their own block beside "Zużycie wczoraj," not inside the recommendation narrative
- The "Pokaż szczegóły"/"Ukryj szczegóły" control toggles the findings list, updates its label, and sets `aria-expanded` correctly
- At 1440px and 390px, there is no horizontal overflow, clipped label, or overlapping control — check the longer Polish labels specifically
- kW and kWh remain visually distinct and correctly labelled; no missing value renders as zero

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: States & accessibility verification

### Overview

Verify every named state (default, hover, focus, disabled, error, empty, loading) renders correctly under the new palette, and close any visible-focus gap.

### Changes Required:

#### 1. Visible focus ring (if needed)

**File**: `src/styles/global.css`

**Intent**: `global.css:117-120`'s `@layer base { * { @apply border-border outline-ring/50; } }` already applies an outline color to every element, but this phase confirms it actually shows on `:focus-visible` for the new `Button`/`DisclosureButton` controls and the native `<summary>` elements — Tailwind's Preflight reset can suppress the default browser outline without an explicit `:focus-visible` rule reinstating one. Treat this as contingent: only make the edit if manual testing below finds a control with no visible focus indicator.

**Contract**: If needed, add under `@layer base`: `:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Tab through the full page keyboard-only: every interactive element (sign-out, the disclosure toggle, native `<summary>` elements) shows a visible focus indicator and has an accessible name
- Push each card into its existing load-failure (`LOAD_FAILED`), empty/insufficient, and stale/no-data-reason states via existing fixtures (`scripts/fixtures/bill-forecast/*.json`, a backdated recommendation, sparse usage history) and confirm legibility against the new dark palette
- Every status remains understandable with colour ignored (each badge's text label is legible, not just its tone color)
- No animation beyond the brief's declared 120-180ms interaction feedback; reduced-motion is respected
- Re-check both 1440px and 390px one final time against the fully-states-verified page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

No new unit tests — this plan changes no mapper, service, or view-model logic (`recommendation.ts`, `usage-insight.ts`, `bill-forecast.ts`, `live-state.ts` are all untouched), so the existing suite is the regression guard.

### Integration Tests:

- `npm run smoke`'s existing dashboard-content assertions (`Stan na żywo`, `Zużycie wczoraj`, `Prognoza rachunku`, the bill-forecast range/central strings) must still pass unchanged, since they check text substrings, not DOM position.

### Manual Testing Steps:

1. Open `/dashboard` after each phase's automated gates pass and eyeball the change against that phase's manual checklist above.
2. At the end of Phase 3, do a full 1440px and 390px pass over the recomposed layout.
3. At the end of Phase 4, do a keyboard-only pass and force every card through its failure/empty/stale states.

## Performance Considerations

None material — this is a CSS/markup restyle with one new tiny React island (`DisclosureButton`, hydrated on a single card); no new data fetching, no new client-side computation.

## Migration Notes

Not applicable — no data model or schema changes. Rolling back is reverting the four phases' commits; no migration or backfill involved.

## References

- Research: `context/changes/dashboard-glass-restyle/research.md`
- Design brief (input): `context/changes/dashboard-glass-restyle/design-brief.md`
- Old lab page reference: `context/changes/dashboard-glass-restyle/old-lab-page-reference.md`
- House card pattern: `src/components/LiveStateCard.astro`, `src/lib/services/live-state.ts:81-115`
- Existing shadcn Button: `src/components/ui/button.tsx`
- Token source: `src/styles/global.css`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Environment & tokens

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 4f821ae
- [x] 1.2 Linting passes: `npm run lint` — 4f821ae
- [x] 1.3 Production build succeeds: `npm run build` — 4f821ae

#### Manual

- [x] 1.4 Inspecting `:root`'s computed styles in devtools shows `--background`, `--card`, `--primary`, `--ring`, `--border`, `--destructive` matching the brief's hex values, and `--radius-panel` resolving to 20px — 4f821ae
- [x] 1.5 `rounded-panel` is usable as a Tailwind utility class — 4f821ae

### Phase 2: Shared components

#### Automated

- [x] 2.1 Unit tests pass: `npm test`
- [x] 2.2 Linting and type checks pass: `npm run lint`
- [x] 2.3 Production build succeeds: `npm run build`

### Phase 3: Single view — recompose the dashboard

#### Automated

- [ ] 3.1 Unit tests pass: `npm test`
- [ ] 3.2 Linting and type checks pass: `npm run lint`
- [ ] 3.3 Production build succeeds: `npm run build`
- [ ] 3.4 The smoke test passes against a running server with the recomposed dashboard: `npm run smoke`

#### Manual

- [ ] 3.5 On `/dashboard`, cards render in order: live state, bill forecast, then a 2:1 grid with the recommendation on the left and usage insight + forecast stacked on the right
- [ ] 3.6 The header shows the glass treatment and remains readable (opaque fallback works when `backdrop-filter` is unsupported)
- [ ] 3.7 The PV-forecast figures and confidence badge render in their own block beside "Zużycie wczoraj," not inside the recommendation narrative
- [ ] 3.8 The "Pokaż szczegóły"/"Ukryj szczegóły" control toggles the findings list, updates its label, and sets `aria-expanded` correctly
- [ ] 3.9 At 1440px and 390px, there is no horizontal overflow, clipped label, or overlapping control — check the longer Polish labels specifically
- [ ] 3.10 kW and kWh remain visually distinct and correctly labelled; no missing value renders as zero

### Phase 4: States & accessibility verification

#### Automated

- [ ] 4.1 Unit tests pass: `npm test`
- [ ] 4.2 Linting and type checks pass: `npm run lint`
- [ ] 4.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 4.4 Tab through the full page keyboard-only: every interactive element shows a visible focus indicator and has an accessible name
- [ ] 4.5 Push each card into its existing load-failure, empty/insufficient, and stale/no-data-reason states and confirm legibility against the new dark palette
- [ ] 4.6 Every status remains understandable with colour ignored
- [ ] 4.7 No animation beyond the brief's declared 120-180ms interaction feedback; reduced-motion is respected
- [ ] 4.8 Re-check both 1440px and 390px one final time against the fully-states-verified page
