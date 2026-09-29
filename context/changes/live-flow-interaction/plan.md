# Live Flow Interaction Implementation Plan

## Overview

Turn `Stan na żywo` (`src/components/LiveStateCard.astro`) from four icon tiles with an ambient pulse into a connected, truthful energy-flow diagram: PV, home, battery and grid squares joined through a balance junction (`Scale` icon), direction arrows, motion only on fresh nonzero flows, node details, a diagram/readings switch, a pause control, and a good / watch / problem verdict on the battery, PV and consumption squares (tint plus chip with icon and word). Delivered in five phases: tokens and the battery verdict, the static flow island, motion and controls, the PV and consumption verdicts, then fixtures, the visual gate, the sign check and docs.

## Current State Analysis

- `LiveStateCard.astro:62-114` renders four hand-repeated tile blocks with `text-blue-100` / `bg-white/*` literals (28 class hits on the classes counted in `research.md`), no connectors, no arrows, no controls. The pulse (`animate-flow-pulse`, `LiveStateCard.astro:66,78,90,106`, `global.css:135-154`) is gated on watts only; `isStale` (`live-state.ts:117`) is never read by the card, so a stale snapshot still pulses.
- `live-state.ts` already exposes raw watts, direction words (`live-state.ts:123,125`), `socPct` and `chargeLevel` (`live-state.ts:22-46`), `MIN_FLOW_W = 50` and `LIVE_STALE_AFTER_MS = 15 min` (`live-state.ts:8,12`). It has no verdicts.
- `usage-insight.ts` holds the daily-load norm (median of baseline days, `usage-insight.ts:257`) and the thresholds `STATUS_THRESHOLD = 0.15`, `FAR_ABOVE_THRESHOLD = 0.4` (`usage-insight.ts:19-21`), but `toUsageInsightView` skips today's row (`usage-insight.ts:204`), and the dashboard loads `daily_energy` only for that card (`dashboard.astro:52-55`). `daily_energy` rows carry `pv_kwh`, `load_kwh`, `pv_forecast_kwh`; the lab's today entry is partial and replaced by each push (`docs/logic.md`, Daily totals).
- `StatusBadge.astro:13-16` spends emerald, amber and red on good, watch and problem as raw utilities; `global.css:29-33` `--chart-*` tokens are unused shadcn defaults.
- One React island exists in the dashboard (`DisclosureButton.tsx`, `client:load`, `RecommendationCard.astro:64-81`). `vitest` runs `src/**/*.test.ts` only; there is no component test setup, no Playwright, no kitchen-sink page. `scripts/push-fixture.mjs` posts a body with `captured_at = now` and static day keys.
- The dashboard reloads the whole page after 5 minutes (`dashboard.astro:96-110`); nothing in `src/` persists client state.
- Sign convention: positive grid is import, positive battery is discharge (`docs/logic.md:23`, `collect-ha-snapshot.py:137-146` in homelab-2). The contract does not state it (`contract.ts:23-24`). Full findings: `context/changes/live-flow-interaction/research.md`.

## Desired End State

On `/dashboard`, `Stan na żywo` shows four squares around a `Scale` junction with arrowheads showing direction, dashes moving only while the snapshot is fresh and the flow is at least 50 W and motion is not paused. Battery, PV and consumption squares are tinted green, amber or red with a chip (icon and word) and a one-line reason; grid is neutral. Stale, missing or unrated readings are neutral "Bez oceny" with the reason. Selecting a square shows its reading, the unit meaning and its freshness; "Odczyty" shows the same numbers as text. View and pause persist across the 5-minute reload. Desktop 1440px and mobile 390px have no overflow. Every existing value, timestamp, glossary and the "Dziś" totals remain.

Verify by pushing the fixtures (Phase 5) and inspecting each state at both widths, plus the automated checks per phase.

### Key Discoveries:

- Verdicts for PV and consumption have data today: today's partial row in `daily_energy` (`pv_kwh`, `load_kwh`, `pv_forecast_kwh`) and the usage median norm; no new lab contract is needed (`usage-insight.ts:55-65`, `types.ts:25-32`).
- The lab computes `home_load_w = max(0, pv + grid + battery)` (`collect-ha-snapshot.py:143-146`), so comparing readings with home load cannot verify the signs; independent evidence is the import/export counters and SOC trend.
- The share of the day's PV produced by 15:00 local varies from 0.73 (June, July) to 1.00 (December) at this latitude for a flat array (clear-sky geometry, 52.2 N 21.0 E, mid-month, computed for this plan), so a single constant would mislabel seasons; after 15:00 the expected share keeps rising until the day is done.
- The 4.5:1 contrast rule and status vocabulary already exist (`docs/logic.md`, Status colours); reuse the tone words (`status.ts:10-15`) and never colour alone.
- `button.tsx` is Radix-based and its `focus-visible:ring-*` classes do not render; visible focus relies on the unlayered rule at `global.css:169-174`.
- `npm run smoke` asserts the literal text `"3,1 kW"` in the dashboard HTML (`scripts/smoke.mjs:101`); the island renders on the server first, so the values stay real text.

## What We're NOT Doing

- No intraday history chart, day selector or history URL state: the contract carries only daily totals. Missing contract: intraday interval readings (kW) pushed by the lab. Deferred, recorded in `docs/decisions.md`.
- No Base UI Button migration; the existing Radix-based `Button` is extended. Deviation from the design brief is logged.
- No verdict on grid power (import and export are neither good nor bad); no change to recommendation generation, advice text or inverter controls.
- No new chart or animation library, no `--chart-*` changes and no colour-literal cleanup in other cards (deferred). `StatusBadge` is the one exception (Phase 2): it moves to the tone tokens so badges and chips share one palette.
- No change to lab contract, ingest routes, auth or the reload script. The recommendation card refresh is a separate change.
- No proportional line widths or invented allocation between sources; the balance junction is schematic.

## Implementation Approach

Keep the house pattern: a pure mapper computes everything that has a rule (verdicts, motion gate, expected share) and is unit-tested at its edges; the Astro card stays static except one React island that owns only presentation state (view, pause, selected node). Geometry for the connectors is a pure function in `src/lib/`, tested in vitest, because there is no component test setup. Stage the work so each phase is shippable: Phase 1 and 2 deliver tokens, the battery verdict and the static diagram; Phase 3 adds motion and controls; Phase 4 adds the two verdicts that need new data wiring; Phase 5 proves the states visually and updates docs.

## Critical Implementation Details

- **Time basis for verdicts.** PV and consumption are judged at the snapshot's capture time in Europe/Warsaw (`captured_at`), because "today so far" totals end at capture; staleness is judged against `now`. A stale or degraded-missing reading is never rated.
- **Hydration.** The island must render the same HTML on server and first client render, so view and pause use a `useSyncExternalStore` hook whose server snapshot is the default, and every `localStorage` access is wrapped in try/catch. Connector lines are measured after mount and on resize; before that only the squares render, with all values as text.
- **Expected PV share.** `expected(t) = share15(month)` at 15:00, rising linearly to `1.0` at `doneHour(month)`, and `1.0` afterwards; before 15:00 there is no rating. Table values (share at 15:00, hour the day is done), estimated from clear-sky solar geometry and to be revisited after a year of lab data: Jan 0.98/15.3, Feb 0.92/16.1, Mar 0.89/16.8, Apr 0.76/18.5, May 0.75/19.2, Jun 0.73/19.7, Jul 0.73/19.6, Aug 0.75/18.9, Sep 0.80/17.9, Oct 0.86/16.9, Nov 0.99/15.1, Dec 1.00/14.8.

## Phase 1: Tokens, tones and the battery verdict

### Overview

Add the colour tokens and the mapper fields every later phase reads: per-flow motion flags, node verdicts, and the battery verdict (data that exists today).

### Changes Required:

#### 1. Flow and tone tokens

**File**: `src/styles/global.css`

**Intent**: One source for source-identity colours and verdict colours so squares, chips, arrows and any future chart share it, replacing the literals used for these in the new UI.

**Contract**: In `:root` add `--flow-pv #b5a3f5`, `--flow-home #7cc4f5`, `--flow-battery #e9a3d3`, `--flow-grid #9aa7c7` and `--tone-good`/`--tone-watch`/`--tone-problem` (text colours `#6ee7b7`, `#fcd34d`, `#fca5a5`) with matching `--tone-*-surface` (`#064e3b`, `#78350f`, `#7f1d1d`); publish them in `@theme inline` as `--color-flow-*` and `--color-tone-*`. Header comment names the design source (`context/changes/live-flow-interaction/handoff-adapted.md`). Each tone must pass 4.5:1 text-on-surface contrast over `--card` here in Phase 1 (adjust the token values if not), before any square uses them.

#### 2. Motion gate, verdict type and battery verdict

**File**: `src/lib/services/live-state.ts`

**Intent**: Give the card one rule for "is this flow moving" and the first verdict, so the template stays dumb.

**Contract**: `LiveStateView` `"state"` gains `flows: { pv | home | grid | battery: { watts: number | null; moving: boolean } }` where `moving` is `!isStale && watts !== null && Math.abs(watts) >= MIN_FLOW_W`; and `verdicts: { battery: NodeVerdict; pv: NodeVerdict | null; home: NodeVerdict | null }` where `NodeVerdict = { tone: StatusTone; word: string; detail: string; explanation: string }` (`word` from `TONE_WORD`, "Bez oceny" for insufficient). `pv` and `home` are `null` (not rated) in this phase. Battery constants: `BATTERY_GOOD_AT = BATTERY_LOW_AT` (30) and `BATTERY_PROBLEM_BELOW = BATTERY_WARNING_AT` (10): at or above 30 good ("w normie", "wysoki poziom" from 80), 10 to under 30 watch ("niski poziom"), under 10 problem ("prawie pusta"); the verdict and the icon band read the same whole percent the label shows (`Math.round`), so 29.9 shows as 30% and is rated good; exactly on a line takes the milder status; `socPct === null` or stale is insufficient with the reason. 100% is never bad.

#### 3. Tests

**File**: `src/lib/services/live-state.test.ts`

**Intent**: Pin the new fields at their edges; update existing full-object assertions rather than leave them failing.

**Contract**: Cases: battery at 30, 29.9, 10, 9.9, 100, null; `moving` for fresh at 50 W, 49 W, null, and any watts when stale (over 15 minutes) and when degraded but fresh; verdict is insufficient when stale. Existing `toEqual` tables gain the new fields.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- The new tokens exist in `global.css` and compile to `bg-flow-*` and `text-tone-*` utilities (spot check in a built page)
- The battery verdict's edges match `handoff-adapted.md` (30 and 10) and nothing else in the card changed visually yet
- Each `--tone-*` colour on its `--tone-*-surface` composited over `--card` measures at least 4.5:1 (spot-check with a contrast tool); token values are adjusted here if not

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: The static flow island

### Overview

Replace the four tiles with a React island: squares, junction, connectors with arrowheads, chips and tints, node details, diagram/readings switch, icons. No motion yet.

### Changes Required:

#### 1. Connector geometry

**File**: `src/lib/flow-geometry.ts` (new) and `src/lib/flow-geometry.test.ts` (new)

**Intent**: Compute connector endpoints and arrowhead angle from measured rectangles in a pure function, so the drawing is testable without a component runner.

**Contract**: `connector(nodeRect, junctionRect, side: "left" | "right", direction: 1 | -1)` returns start, end (stopping at the junction's edge plus a 4 px gap), arrow midpoint and angle in degrees; direction `1` runs from node to junction, `-1` the reverse. Tests: four quadrants, reversal swaps start and end, zero-length is handled.

#### 2. The island and its parts

**File**: `src/components/live/LiveFlow.tsx`, `src/components/live/FlowNode.tsx` (new); `src/components/hooks/useFlowLines.ts` (new)

**Intent**: Own the presentation state (view, selected node) and render squares, the `Scale` junction, connectors and details from one serialized view model, so the diagram and the readings view can never disagree.

**Contract**: `LiveFlow` takes the serializable subset of the `"state"` view (labels, watts, directions, `socLabel`, `chargeLevel`, verdicts, `capturedAtLabel`, `ageLabel`, `isStale`) and renders a 3-column grid (`1fr`, 92px, `1fr`; 40px at 480px and below) with PV and home on top, battery and grid below, tinted by verdict tokens with a 2px tone border when rated and neutral when unrated or grid, a chip (icon, word) and the `detail` line, icon circles in `--flow-*` hues, `aria-label` including reading, verdict and detail. Squares are `button`s (native keyboard); selection is a visible ring, not a border change. Arrowheads always render; inactive flows (under 50 W or null) draw a dotted grey line without arrow. The details strip shows reading, unit meaning (from `glossary.ts` terms) and freshness. "Schemat" / "Odczyty" toggle uses the existing `Button` with `aria-pressed`. `useFlowLines` measures rects with `ResizeObserver` and `useLayoutEffect`. Icons from `lucide-react`; confirm `Scale`, `Activity`, `Network`, `List`, `Pause`, `Play`, `Info`, `CircleCheck`, `TriangleAlert`, `OctagonAlert`, `Minus` exist in the installed version, else pick the nearest.

#### 3. The card

**File**: `src/components/LiveStateCard.astro`

**Intent**: Keep the panel, heading, freshness badge, degraded/stale notice, "Dziś" totals, timestamp and glossary in Astro; swap only the tile grid for the island and move colour literals in the touched markup to role tokens.

**Contract**: Render `<LiveFlow client:load view={...} />` for `kind: "state"`; the stale notice reads "Ruch i oceny wstrzymane: odczyty starsze niż 15 minut nie opisują stanu teraz." Remove the tile markup and the icon pulse classes. `null` and `empty` states unchanged.

#### 4. Badges on the tone tokens

**File**: `src/components/StatusBadge.astro`

**Intent**: One palette for status: the header badges on every card and the verdict chips on the squares use the same tokens (owner decision 2026-09-29), removing the emerald/amber/red literals from this component.

**Contract**: `TONE_CLASSES` good, watch and problem use `text-tone-*`, `bg-tone-*-surface` with reduced opacity and a tone border; `insufficient` stays neutral. The tone-to-word mapping, `data-tone` and `data-testid` are unchanged. Every card that renders `StatusBadge` inherits the new shades; contrast is re-measured (4.5:1) for each tone on the card surface.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`
- Smoke test still finds the live text: `npm run smoke`

#### Manual Verification:

- The four squares, junction icon and arrowheads render; grid and battery arrows follow the direction words
- Tab reaches every square and both toggle buttons with a visible focus ring; Enter and Space select a square and show its details
- "Odczyty" shows the same four values as the diagram
- At 1440px and 390px there is no overflow or clipped value; the "Dziś" row, timestamp and glossary are intact
- Badges on all four cards (live, bill forecast, usage, recommendation) keep their words and shape, use the tone tokens, and measure at least 4.5:1 on the card surface

Note (2026-09-29): 2.4 (`npm run smoke`) was skipped by the owner because it needs a local Supabase stack (Docker on the UGREEN); the live-card text was instead confirmed in server-rendered HTML from a temporary dev page.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Motion and controls

### Overview

Add dashed-connector motion gated by the mapper, the pause control, reduced motion, and persistent view and pause preferences.

### Changes Required:

#### 1. Motion utility

**File**: `src/styles/global.css`

**Intent**: One looping animation for moving connectors, with an unconditional reduced-motion override, replacing the old opacity pulse.

**Contract**: `@keyframes flow-dash` (dash offset, about 1s linear infinite) and `@utility animate-flow-dash`; `@media (prefers-reduced-motion: reduce)` sets `animation: none` on it. Remove `animate-flow-pulse` and its keyframes once no template uses it (grep first), and drop the now-duplicate `pvWatts` and `homeLoadWatts` view fields if nothing else reads them (the island reads `flows`).

#### 2. Gate, pause and preferences

**File**: `src/components/live/LiveFlow.tsx`, `src/components/hooks/usePreference.ts` (new)

**Intent**: Apply motion only when `flows[x].moving` and the user has not paused; remember view and pause across the 5-minute reload without ever storing readings or the selection.

**Contract**: A connector gets `animate-flow-dash` iff `moving && !paused`; otherwise the static arrowhead remains. The pause `Button` toggles `aria-pressed` and its label ("Wstrzymaj ruch" / "Wznów ruch"); it stays usable when stale (motion is off anyway). `usePreference(key, default)` is built on `useSyncExternalStore`: the server snapshot is the default (so server and first client render match), the client snapshot reads `localStorage`, it subscribes to the `storage` event, writes on change, and every access is in try/catch (react-hooks `set-state-in-effect` in the repo's lint preset forbids the read-in-an-effect pattern); keys `ea:flow-view` and `ea:flow-paused`. Selection resets on reload (documented limitation: a full reload also resets focus). The reload script in `dashboard.astro` is untouched.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- With a fresh push, active connectors move; a flow under 50 W and a stale snapshot show static arrowheads only
- Pause stops all motion, keeps arrowheads, and persists after a manual reload; clearing `localStorage` (or blocking it) leaves the page working with defaults
- With `prefers-reduced-motion: reduce` emulated, nothing moves and arrowheads remain
- Polling continues while paused: a new push after five minutes still appears

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: PV and consumption verdicts

### Overview

Add the two verdicts that need today's partial totals, the forecast and the usage norm, with the dashboard loading the daily rows once for both cards.

### Changes Required:

#### 1. Reusable daily-load norm

**File**: `src/lib/services/usage-insight.ts`

**Intent**: Export the norm computation so the live card uses the same median and baseline selection as the usage card, with no change to the usage card's output.

**Contract**: Extract the baseline selection and `median` step of `toUsageInsightView` into an exported `dailyLoadNorm(rows, now)` returning `{ norm: number | null; days: number; kind: "seasonal" | "fallback" } | null` (null when the usage card would say insufficient); `toUsageInsightView` calls it. Also export `deltaLabel`. All existing `usage-insight.test.ts` cases pass unchanged.

#### 2. PV and consumption rules

**File**: `src/lib/services/live-state.ts`

**Intent**: Compute the two verdicts at the capture time (PV total from the snapshot, forecast and load from today's row), with each threshold a named constant.

**Contract**: `toLiveStateView(row, now, dailyRows)` (third argument optional; `null` or empty means "no history", never a throw). Constants: `PV_RATE_FROM_HOUR = 15`, `PV_GOOD_AT = 0.85`, `PV_WATCH_AT = 0.6` (share of expected), `PV_EXPECTED_SHARE` (12 entries, `[shareAt15, doneHour]`, values in Critical Implementation Details), `LOAD_RATE_FROM_HOUR = 6`; consumption reuses `STATUS_THRESHOLD` and `FAR_ABOVE_THRESHOLD`. PV: `state.pv_today_kwh` from the same snapshot divided by today's row `pv_forecast_kwh × expected(capture time)` (the row can be absent or lag; the lab omits today's entry when it has no usable samples); good at or above 0.85, watch from 0.60 to under 0.85, problem under 0.60; before 15:00, or without today's forecast or `pv_kwh`, insufficient ("za wcześnie" / "brak prognozy"). Consumption: today's `load_kwh` against `norm × hours elapsed / 24` at capture time; good up to +15% (lower is never bad), watch above +15%, problem above +40%; before 06:00, without today's `load_kwh`, or without a norm (fewer than 7 baseline days), insufficient ("za wcześnie" / "za mało danych"). The row used must be the capture's own Warsaw day. `detail` is the compact figure ("94% prognozy", "+5% wobec normy"); `explanation` is the full Polish sentence; percentages at an edge show one decimal so the badge and the number agree, as `deltaLabel` does.

#### 3. Load the rows once

**File**: `src/pages/dashboard.astro`

**Intent**: One `daily_energy` load feeds both the usage card and the live verdicts; a failure there must not break either card.

**Contract**: Load rows once with the existing `orLoadError` pattern; pass them to `toUsageInsightView` and `toLiveStateView`. If the load fails, the usage card shows its existing load error and the live card renders with `pv` and `home` verdicts insufficient ("brak danych historii"), everything else intact.

#### 4. Tests

**File**: `src/lib/services/live-state.test.ts`

**Intent**: Pin every threshold and the time gates.

**Contract**: PV at 0.85 and 0.849, 0.60 and 0.599; capture at 14:59 and 15:00; expected share for September at 15:00 (0.80), between 15:00 and done hour (interpolated), and after it (1.0); a June capture at 20:00; missing forecast; wrong-day row. Consumption at +15.0% and +15.1%, +40.0% and +40.1%, below norm, before 06:00, no norm, no rows.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- On a real or fixture snapshot after 15:00, the PV chip and figure match a hand calculation from the day's totals
- On a snapshot after 06:00 with enough history, the consumption chip matches a hand calculation against the usage card's norm
- Breaking the daily-energy load (for example an invalid table name locally) leaves the live card and usage card error state working

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Fixtures, visual gate, sign check and docs

### Overview

Make every state reproducible, prove the layout, verify the sign convention independently, and bring the docs in step.

### Changes Required:

#### 1. Reproducible states

**File**: `scripts/push-fixture.mjs`, `scripts/fixtures/live-flow/*.json` (new), `src/lib/ingest/contract.test.ts`

**Intent**: Push any live scenario to a local database at any time of day, since verdicts depend on capture time and today's row.

**Contract**: New flags `--captured-at <iso>` (overrides `captured_at`; the contract accepts at most 5 minutes in the future and up to 14 days back, `contract.ts:8-9`) and `--shift-days` (shifts every `daily_history` day so the newest day becomes today in Warsaw). Fixtures: `normal` (good on all three), `worse` (PV watch, consumption watch), `battery-low`, `battery-missing` (null `battery_w` and SOC, `source_health: "degraded"`). Stale is `normal` with `--captured-at` 40 minutes back. Ordering rules the script header must state: `live_state` is the newest push by `captured_at` and a daily row is replaced only by a push with an equal or later `captured_at`, so between scenarios reset `ingest_pushes` and `daily_energy` on the local database (or push in a fixed order, stale first); fresh scenarios use a capture time within 5 minutes of now; PV and consumption scenarios must be pushed after 15:05 Warsaw so the capture is at or after 15:00 yet still fresh, which also limits when their screenshots can be taken. `contract.test.ts` is extended to glob `scripts/fixtures/live-flow/*.json` and parse each with the strict schema (today it reads only `docs/ingest/example-v1.json`). Local databases only, as the script already requires for whole bodies.

#### 2. Visual gate

**File**: `context/changes/live-flow-interaction/screenshots/` (new, committed evidence)

**Intent**: Meet the `/10x-ui` gate without adding a test runner.

**Contract**: Screenshots of `normal`, `worse`, `battery-low`, `battery-missing`, stale, and empty/failed at 1440px and 390px, plus one with reduced motion emulated and one paused. Docker runs on the UGREEN per the dev-hub rules; nothing is started on the Mac.

#### 3. Sign check

**File**: `docs/ingest/README.md`, `context/changes/live-flow-interaction/research.md`

**Intent**: Prove the convention independently before shipping arrows, then write it where the contract lives.

**Contract**: On several consecutive real pushes (readable as owner from `ingest_pushes.payload`), confirm that `grid_import_today_kwh` rises while `grid_w > 0` and `grid_export_today_kwh` while `grid_w < 0`, and that SOC falls while `battery_w > 0` and rises while `battery_w < 0`. Record the observation dates in research.md and add a "Sign conventions" paragraph to the ingest README. If either sign disagrees, stop and revise the arrows and mapper labels before merging. Note in the plan review that `homelab-2/manifests/solar-energy-analyser-api.v1.yaml:153` contradicts the collector for battery and is outside this repository.

#### 4. Docs

**File**: `docs/logic.md`, `docs/decisions.md`, `docs/prerequisites.md`

**Intent**: Keep the project docs in step with the code (lessons.md).

**Contract**: `docs/logic.md` gains "Live state: node verdicts" (all constants, the expected-share table and interpolation, the capture-time basis, the not-rated cases) and the motion gate. `docs/decisions.md` gets dated entries: freshness-gated motion and arrows, verdicts on live squares with the chosen edges, the 12-month estimated share table, Radix Button kept over Base UI, history chart deferred with its missing contract, `localStorage` as first client persistence. `docs/prerequisites.md`: state "no new external prerequisite" in this change's entry if the file has a per-change list, otherwise leave it and say so in the PR.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting and type checks pass: `npm run lint`
- Production build succeeds: `npm run build`
- Contract schema has not drifted: `npm test` passes (it fails on drift) and `git diff --exit-code docs/ingest/contract-v1.schema.json` is clean
- Smoke test passes on the local stack (magic-link steps may fail for the known unrelated reason): `npm run smoke`

#### Manual Verification:

- Screenshots for every state at 1440px and 390px show no overflow, clipped label or overlapping control, and are saved in the change folder
- Text and chip contrast on the tinted squares is at least 4.5:1 (spot-check with a contrast tool), and status is never conveyed by colour alone
- The sign check on real pushes passes for grid and battery, and the result is written in research.md and the ingest README
- `docs/logic.md` and `docs/decisions.md` reflect every constant and decision above

Note (2026-09-29): 5.5 (`npm run smoke`) was skipped by the owner because it needs a local Supabase stack (Docker on the UGREEN); CI ran `ci` and `smoke` green on PR #58. 5.7 was computed from the token colours (not measured on screen); 5.8 confirmed import and both battery signs on real pushes, export is inferred (no export in the three-day window); the screenshots come from the fixtures through the real mapper and card on a temporary dev page.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- Mapper: battery edges, motion gate (fresh, stale, degraded, 49/50 W, null), PV thresholds and time gates, expected-share interpolation, consumption thresholds and gates, wrong-day and missing rows, insufficient reasons.
- Geometry: connector endpoints and arrow angle for the four quadrants and reversal.
- Usage insight: existing cases unchanged after the `dailyLoadNorm` extraction.

### Integration Tests:

- `npm run smoke` keeps finding `"Stan na żywo"` and `"3,1 kW"`.
- `contract.test.ts` parses the new fixtures and the committed schema does not drift.

### Manual Testing Steps:

1. Push each fixture, open `/dashboard` at 1440px and 390px, and compare with the approved mockup.
2. Back-date a push by 40 minutes: verdicts neutral, motion stopped, notice visible.
3. Toggle pause and view, reload, confirm both persist; block `localStorage` and confirm defaults work.
4. Emulate reduced motion; tab through every control and confirm visible focus.

## Performance Considerations

One extra measurement pass per resize and one small island; no new dependency and no new query (the daily rows are already loaded once for the usage card).

## Migration Notes

No schema or contract change. Rolling back is reverting the phase commits; stored `localStorage` keys are harmless leftovers.

## References

- Related research: `context/changes/live-flow-interaction/research.md`
- Adapted handoff and owner decisions: `context/changes/live-flow-interaction/handoff-adapted.md`
- Prior work: `context/changes/live-state-flow-visual/plan.md`, `context/changes/dashboard-glass-restyle/design-brief.md`
- Mapper and card: `src/lib/services/live-state.ts`, `src/components/LiveStateCard.astro`
- Norm and thresholds: `src/lib/services/usage-insight.ts:19-21,257`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tokens, tones and the battery verdict

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 22bcdae
- [x] 1.2 Linting and type checks pass: `npm run lint` — 22bcdae
- [x] 1.3 Production build succeeds: `npm run build` — 22bcdae

#### Manual

- [x] 1.4 The new tokens exist in `global.css` and compile to `bg-flow-*` and `text-tone-*` utilities (spot check in a built page) — 22bcdae
- [x] 1.5 The battery verdict's edges match `handoff-adapted.md` (30 and 10) and nothing else in the card changed visually yet — 22bcdae
- [x] 1.6 Each `--tone-*` colour on its `--tone-*-surface` composited over `--card` measures at least 4.5:1 (spot-check with a contrast tool); token values are adjusted here if not — 22bcdae

### Phase 2: The static flow island

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 4a8ecc8
- [x] 2.2 Linting and type checks pass: `npm run lint` — 4a8ecc8
- [x] 2.3 Production build succeeds: `npm run build` — 4a8ecc8
- [ ] 2.4 Smoke test still finds the live text: `npm run smoke`

#### Manual

- [x] 2.5 The four squares, junction icon and arrowheads render; grid and battery arrows follow the direction words — 4a8ecc8
- [x] 2.6 Tab reaches every square and both toggle buttons with a visible focus ring; Enter and Space select a square and show its details — 4a8ecc8
- [x] 2.7 "Odczyty" shows the same four values as the diagram — 4a8ecc8
- [x] 2.8 At 1440px and 390px there is no overflow or clipped value; the "Dziś" row, timestamp and glossary are intact — 4a8ecc8
- [x] 2.9 Badges on all four cards (live, bill forecast, usage, recommendation) keep their words and shape, use the tone tokens, and measure at least 4.5:1 on the card surface — 4a8ecc8

### Phase 3: Motion and controls

#### Automated

- [x] 3.1 Unit tests pass: `npm test` — 07a5f28
- [x] 3.2 Linting and type checks pass: `npm run lint` — 07a5f28
- [x] 3.3 Production build succeeds: `npm run build` — 07a5f28

#### Manual

- [x] 3.4 With a fresh push, active connectors move; a flow under 50 W and a stale snapshot show static arrowheads only — 07a5f28
- [x] 3.5 Pause stops all motion, keeps arrowheads, and persists after a manual reload; clearing `localStorage` (or blocking it) leaves the page working with defaults — 07a5f28
- [x] 3.6 With `prefers-reduced-motion: reduce` emulated, nothing moves and arrowheads remain — 07a5f28
- [x] 3.7 Polling continues while paused: a new push after five minutes still appears — 07a5f28

### Phase 4: PV and consumption verdicts

#### Automated

- [x] 4.1 Unit tests pass: `npm test` — 45071d1
- [x] 4.2 Linting and type checks pass: `npm run lint` — 45071d1
- [x] 4.3 Production build succeeds: `npm run build` — 45071d1

#### Manual

- [x] 4.4 On a real or fixture snapshot after 15:00, the PV chip and figure match a hand calculation from the day's totals — 45071d1
- [x] 4.5 On a snapshot after 06:00 with enough history, the consumption chip matches a hand calculation against the usage card's norm — 45071d1
- [x] 4.6 Breaking the daily-energy load (for example an invalid table name locally) leaves the live card and usage card error state working — 45071d1

### Phase 5: Fixtures, visual gate, sign check and docs

#### Automated

- [x] 5.1 Unit tests pass: `npm test` — 217d73a
- [x] 5.2 Linting and type checks pass: `npm run lint` — 217d73a
- [x] 5.3 Production build succeeds: `npm run build` — 217d73a
- [x] 5.4 Contract schema has not drifted: `npm test` passes (it fails on drift) and `git diff --exit-code docs/ingest/contract-v1.schema.json` is clean — 217d73a
- [ ] 5.5 Smoke test passes on the local stack (magic-link steps may fail for the known unrelated reason): `npm run smoke`

#### Manual

- [x] 5.6 Screenshots for every state at 1440px and 390px show no overflow, clipped label or overlapping control, and are saved in the change folder — 217d73a
- [x] 5.7 Text and chip contrast on the tinted squares is at least 4.5:1 (spot-check with a contrast tool), and status is never conveyed by colour alone — 217d73a
- [x] 5.8 The sign check on real pushes passes for grid and battery, and the result is written in research.md and the ingest README — 217d73a
- [x] 5.9 `docs/logic.md` and `docs/decisions.md` reflect every constant and decision above — 217d73a
