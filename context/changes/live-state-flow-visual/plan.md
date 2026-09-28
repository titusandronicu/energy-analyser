# Energy-Flow Visualization and Battery State Implementation Plan

## Overview

Replace `Stan na żywo`'s plain 4-tile grid with a connected flow diagram (solar → home → battery → grid) built from `lucide-react` icons and a subtle ambient pulse on active flows, with the battery icon reflecting real charge level — all built on raw numbers the mapper already computes internally but currently discards after formatting.

## Current State Analysis

`LiveStateCard.astro` renders a plain 4-tile `<dl>` grid (`LiveStateCard.astro:30-52`, added in `dashboard-glass-restyle` specifically as the lower-risk choice over a flow-board visual for that change's first pass). `LiveStateView`'s `"state"` variant (`live-state.ts:22-36`) only exposes pre-formatted strings (`pv: string`, `homeLoad: string`, `grid: FlowLabel`, `battery: FlowLabel & { socLabel: string }`) — every raw number (`state.pv_w`, `state.home_load_w`, the `flow()` helper's internal `asNumber()` result, `state.battery_soc_pct`) is computed then discarded before reaching the view. The project already has, and actively uses, `lucide-react` as its icon library (`components.json`'s `iconLibrary`, four existing imports in the auth flow), confirmed to contain every icon this needs: `sun`, `home`, `zap`, and the full battery-level family (`battery`, `battery-charging`, `battery-full`, `battery-medium`, `battery-low`, `battery-warning`). No animation tooling in the project covers continuous/looping motion — `tw-animate-css` is enter/exit only. Full findings: `context/changes/live-state-flow-visual/research.md`.

## Desired End State

`Stan na żywo` shows four connected flow nodes — PV, home, battery, grid — each with a `lucide-react` icon (the battery icon reflecting its real charge level and charging state), the same numeric values and direction words the card shows today, and a subtle ambient pulse on whichever flows are currently active. Users with `prefers-reduced-motion: reduce` see the identical diagram with the pulse fully disabled.

Verify by opening `/dashboard`: the diagram replaces the old 4-tile grid, every existing number/direction/status still appears, active flows pulse gently and inactive ones don't, and the pulse disappears entirely under reduced motion.

### Key Discoveries:

- `flow()` (`live-state.ts:57-61`) already computes the raw signed watts via `asNumber(value)` before formatting it away — no new calculation needed to expose it, just stop discarding it.
- `pv`/`homeLoad` (`live-state.ts:98-99`) are similarly formatted directly from an `asNumber()` call whose result is never kept.
- `battery_soc_pct` (`live-state.ts:88`) is already a clean 0-100 number — the one place in this view model with a genuinely proportional scale (no baseline/capacity exists for PV/home/grid, so those can't be proportionally filled, only shown as active/inactive).
- `MIN_FLOW_W = 50` (`live-state.ts:12`) is the existing "this is noise, not a real flow" threshold already used to suppress `grid`/`battery` direction words — the new pulse's "is this flow active" signal reuses this exact constant rather than inventing a new one.
- `lucide-react` icons confirmed present in the installed package: `sun.mjs`, `home.mjs`, `zap.mjs`, `battery.mjs`, `battery-charging.mjs`, `battery-full.mjs`, `battery-medium.mjs`, `battery-low.mjs`, `battery-warning.mjs` (`research.md`).
- The house pattern (pure mapper → dumb `.astro` renderer, no client JS) holds here too: this card needs no React island — a CSS animation renders fine in static SSR output.
- `scripts/smoke.mjs`'s `"dashboard shows the fresh live state"` step asserts the literal text `"3,1 kW"` appears in the rendered HTML — the diagram must keep every numeric value as real visible text, not fold it into an inaccessible graphic.

## What We're NOT Doing

- Not adding proportional fill/sizing to PV, home load, or grid nodes — there's no capacity or baseline number to compute a percentage against; only the battery's charge level is genuinely proportional.
- Not building a moving-dot-along-a-path animation — a subtle ambient pulse on active nodes instead (decision: lower complexity, simpler reduced-motion story, less risk of feeling gimmicky).
- Not adding Geist icons or any second icon library — `lucide-react` already covers every icon this needs (decision, per research).
- Not touching `BillForecastCard`, `UsageInsightCard`, `RecommendationCard`, `ForecastCard`, or the dashboard grid layout — scope is `LiveStateCard.astro` and its mapper only.
- Not building a kitchen-sink page — verifying via direct screenshots, the same approach already proven this session for `dashboard-glass-restyle`.
- Not adding the "Dzisiaj" totals row or the "Co to znaczy?" disclosure to this redesign — both stay exactly as they are today, unrelated to this change.

## Implementation Approach

Four phases: expose the raw numbers the mapper already has (Phase 1), build the static diagram with them (Phase 2), add the pulse and its reduced-motion fallback (Phase 3), then verify every state (Phase 4) — the same data → static → motion → states sequencing already proven in `dashboard-glass-restyle`. Keeping the pulse addition to its own phase means Phase 2's static diagram is fully verifiable (icons, values, layout) before any animation risk is introduced.

## Critical Implementation Details

**Reused activity threshold.** The pulse's "is this flow active" signal must reuse `MIN_FLOW_W` (`live-state.ts:12`) for PV and home load too, not just grid/battery (which already use it via `flow()`). Since `pv`/`homeLoad` don't go through `flow()`, Phase 2/3's component logic needs its own `Math.abs(watts) >= MIN_FLOW_W` check against the new `pvWatts`/`homeLoadWatts` fields — easy to accidentally skip since there's no existing precedent for this specific comparison outside the mapper.

**Reduced motion is a global override, not a per-use guard.** The `@media (prefers-reduced-motion: reduce)` rule disabling the pulse (Phase 3) must apply unconditionally to the animation utility itself (in `global.css`), not be re-implemented at each call site — this is the project's first continuous animation, so there's no existing pattern to follow, and getting this wrong here sets the precedent for every future one.

## Phase 1: Data layer

### Overview

Expose the raw numbers `live-state.ts` already computes internally, plus a mapper-owned battery charge-level key, without changing any existing displayed text.

### Changes Required:

#### 1. Raw numbers and battery charge level

**File**: `src/lib/services/live-state.ts`

**Intent**: Stop discarding the numbers already computed during formatting, and add the one genuinely new piece of logic this feature needs — which named charge-level a battery percentage falls into — as mapper-owned constants, per this repo's house convention of keeping every threshold in the mapper, never the template.

**Contract**: `FlowLabel` (`live-state.ts:17-20`) gains `watts: number | null` — the value `flow()` (`live-state.ts:57-61`) already computes via `asNumber(value)`, currently returned nowhere. The `"state"` variant (`live-state.ts:22-36`) gains `pvWatts: number | null` and `homeLoadWatts: number | null`, from the same `asNumber(state.pv_w)`/`asNumber(state.home_load_w)` calls already made at `live-state.ts:98-99`. `battery` gains `socPct: number | null` (the `soc` value already computed at `live-state.ts:88`) and `chargeLevel: "full" | "medium" | "low" | "warning" | null` (`null` exactly when `socPct` is `null`). Three new named constants — `BATTERY_FULL_AT = 80`, `BATTERY_LOW_AT = 30`, `BATTERY_WARNING_AT = 10` (percent) — decide `chargeLevel`: at or above `BATTERY_FULL_AT` is `"full"`; at or above `BATTERY_LOW_AT` is `"medium"`; at or above `BATTERY_WARNING_AT` is `"low"`; below that is `"warning"` — each boundary itself takes the higher (milder) level, matching this repo's universal "exactly on a line takes the milder status" convention (`docs/logic.md`).

#### 2. Tests

**File**: `src/lib/services/live-state.test.ts`

**Intent**: The existing full-object `toEqual` assertions pin every field of the view, so they must be updated to include the new ones rather than left to fail; new cases cover the `chargeLevel` boundaries.

**Contract**: Update every existing expected object literal (e.g. the "builds the Polish card for a fresh snapshot" case, the grid/battery `it.each` tables, the malformed-state case) to include `watts`/`pvWatts`/`homeLoadWatts`/`socPct`/`chargeLevel` alongside the fields already asserted. Add an `it.each` table for `chargeLevel` covering 79/80, 29/30, 9/10, and a `null` SOC case.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Static flow diagram

### Overview

Rebuild the card's markup as four icon-led flow nodes using the new mapper fields, with no animation yet.

### Changes Required:

#### 1. The flow diagram

**File**: `src/components/LiveStateCard.astro`

**Intent**: Replace the plain 4-tile grid (`LiveStateCard.astro:30-52`) with four connected nodes — PV, home, battery, grid — each carrying an icon, its existing value text, and (for grid/battery) its existing direction text, so nothing currently visible disappears, only the layout and iconography change.

**Contract**: Import `Sun`, `Home`, `Zap`, `Battery`, `BatteryCharging`, `BatteryFull`, `BatteryMedium`, `BatteryLow`, `BatteryWarning` from `lucide-react`. PV always renders `Sun`; home always renders `Home`; grid always renders `Zap`. Battery renders `BatteryCharging` when `view.battery.direction === "ładowanie"`; otherwise picks by `view.battery.chargeLevel` (`full`→`BatteryFull`, `medium`→`BatteryMedium`, `low`→`BatteryLow`, `warning`→`BatteryWarning`, `null`→generic `Battery`). Each node keeps its existing `<dt>`/`<dd>` value and direction markup verbatim (same text, same `data-testid`s where present) alongside its icon. Node arrangement and any connecting-line treatment between them are the implementer's call — loosely inspired by the old lab page's four-node-plus-cross-lines layout (`context/changes/dashboard-glass-restyle/old-lab-page-reference.md`), built with plain CSS (no SVG required), not a pixel-exact copy.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`
- The smoke test passes with the new diagram present: `npm run smoke`

#### Manual Verification:

- On `/dashboard`, `Stan na żywo` shows four icon-led nodes (PV/home/battery/grid) instead of the old plain grid, each with its correct existing value and direction text
- The battery node's icon matches its actual charge level and charging state (e.g. charging shows the charging icon regardless of level)
- At 1440px and 390px, the diagram has no horizontal overflow or clipped label

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Pulse animation and reduced motion

### Overview

Add a subtle ambient pulse to active flow nodes, with a guaranteed, global reduced-motion fallback.

### Changes Required:

#### 1. The pulse utility

**File**: `src/styles/global.css`

**Intent**: The project's first continuous/looping animation — a gentle "this is alive" signal on whichever nodes currently have real flow, with an unconditional reduced-motion override so this and any future reuse of the same utility inherit the same accessibility guarantee.

**Contract**: A new `@keyframes flow-pulse` (a gentle, slow — roughly 2-3s — opacity or box-shadow oscillation, `ease-in-out`, `infinite`) and a corresponding `@utility animate-flow-pulse` applying it, following the existing `@utility` pattern (`global.css:117-133`). A `@media (prefers-reduced-motion: reduce)` block sets `animation: none` on `.animate-flow-pulse` unconditionally.

#### 2. Applying the pulse

**File**: `src/components/LiveStateCard.astro`

**Intent**: Only pulse a node when its flow is actually active, reusing the mapper's existing noise threshold rather than a new one.

**Contract**: Add the `animate-flow-pulse` class (via `class:list`) to the grid and battery nodes when `view.grid.direction`/`view.battery.direction` is non-null (already `MIN_FLOW_W`-gated by the mapper), and to the PV/home nodes when `Math.abs(view.pvWatts ?? 0) >= MIN_FLOW_W` / `Math.abs(view.homeLoadWatts ?? 0) >= MIN_FLOW_W` respectively (import `MIN_FLOW_W` from `@/lib/services/live-state` rather than restating the number).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- On `/dashboard` with a fresh push, nodes with real flow (e.g. PV producing, grid exporting) show a visible ambient pulse; a node with no flow (e.g. grid within the noise threshold) shows no pulse
- Emulating `prefers-reduced-motion: reduce` in the browser, every node matches Phase 2's static appearance exactly — no pulse anywhere

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: States and verification

### Overview

Verify the new diagram across every existing card state, and do a final viewport pass.

### Changes Required:

No code changes are expected in this phase; it verifies Phases 1-3 against every state `LiveStateCard` can render.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`
- The smoke test passes: `npm run smoke`

#### Manual Verification:

- Force each live-state status (`good`/`watch`/`problem`) via a backdated or missing push and confirm the diagram (or its `LOAD_FAILED`/empty fallback text, unchanged from today) renders correctly for each
- Confirm the degraded-source notice still appears above the diagram when `isDegraded` is true
- Re-check both 1440px and 390px one final time against the fully-verified page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `live-state.test.ts`: every existing case updated for the new fields, plus new `chargeLevel` boundary cases (79/80, 29/30, 9/10, null).

### Integration Tests:

- `npm run smoke`'s existing `"3,1 kW"` text assertion must still pass against the redesigned card.

### Manual Testing Steps:

1. After Phase 2, open `/dashboard` and confirm the static diagram shows correct icons and values.
2. After Phase 3, confirm active nodes pulse and inactive ones don't, then re-check with `prefers-reduced-motion: reduce` emulated.
3. After Phase 4, force each status/degraded/stale state and do a final 1440px/390px pass.

## Performance Considerations

None material — a CSS-only animation on up to four small icons, no client JavaScript, no new data fetching.

## Migration Notes

Not applicable — no data model or schema changes, only new derived fields on an existing view. Rolling back is reverting the four phases' commits.

## References

- Research: `context/changes/live-state-flow-visual/research.md`
- Old lab page flow-board precedent: `context/changes/dashboard-glass-restyle/old-lab-page-reference.md`
- House card pattern: `src/lib/services/live-state.ts`, `src/components/LiveStateCard.astro`
- Existing `@utility` pattern: `src/styles/global.css:117-133`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 29af899
- [x] 1.2 Linting and type checks pass: `npm run lint` — 29af899
- [x] 1.3 Production build succeeds: `npm run build` — 29af899

### Phase 2: Static flow diagram

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 68e83f2
- [x] 2.2 Linting and type checks pass: `npm run lint` — 68e83f2
- [x] 2.3 Production build succeeds: `npm run build` — 68e83f2
- [x] 2.4 The smoke test passes with the new diagram present: `npm run smoke` — 68e83f2

#### Manual

- [x] 2.5 On `/dashboard`, `Stan na żywo` shows four icon-led nodes (PV/home/battery/grid) instead of the old plain grid, each with its correct existing value and direction text — 68e83f2
- [x] 2.6 The battery node's icon matches its actual charge level and charging state (e.g. charging shows the charging icon regardless of level) — 68e83f2
- [x] 2.7 At 1440px and 390px, the diagram has no horizontal overflow or clipped label — 68e83f2

### Phase 3: Pulse animation and reduced motion

#### Automated

- [x] 3.1 Unit tests pass: `npm test` — 2bd644c
- [x] 3.2 Linting and type checks pass: `npm run lint` — 2bd644c
- [x] 3.3 Production build succeeds: `npm run build` — 2bd644c

#### Manual

- [x] 3.4 On `/dashboard` with a fresh push, nodes with real flow show a visible ambient pulse; a node with no flow shows no pulse — 2bd644c
- [x] 3.5 Emulating `prefers-reduced-motion: reduce`, every node matches Phase 2's static appearance exactly — no pulse anywhere — 2bd644c

### Phase 4: States and verification

#### Automated

- [ ] 4.1 Unit tests pass: `npm test`
- [ ] 4.2 Linting and type checks pass: `npm run lint`
- [ ] 4.3 Production build succeeds: `npm run build`
- [ ] 4.4 The smoke test passes: `npm run smoke`

#### Manual

- [x] 4.5 Force each live-state status (`good`/`watch`/`problem`) via a backdated or missing push and confirm the diagram (or its `LOAD_FAILED`/empty fallback text, unchanged from today) renders correctly for each
- [x] 4.6 Confirm the degraded-source notice still appears above the diagram when `isDegraded` is true
- [x] 4.7 Re-check both 1440px and 390px one final time against the fully-verified page
