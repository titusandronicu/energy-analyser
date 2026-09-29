---
date: 2026-09-29T00:00:00+02:00
researcher: Claude (Sonnet 5.5)
git_commit: 1e32e6e25b823cdfc79f8e316c9021da47892c98
branch: feat/recommendation-card-refresh
repository: energy-analyser
topic: "live-flow-interaction: the four open questions from handoff-adapted.md (sign convention, source colours, state persistence, island pattern and verification hooks)"
tags: [research, ui, live-state, flow, tokens, motion, ingest-contract]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Sonnet 5.5)
---

# Research: live-flow-interaction open questions

**Date**: 2026-09-29 (clock time not gathered; recorded as the date only)
**Git Commit**: `1e32e6e` (working tree also holds untracked `context/changes/` folders for this and `recommendation-card-refresh`)
**Branch**: `feat/recommendation-card-refresh` (this change has no branch of its own yet)
**Repository**: energy-analyser (submodule of dev-hub)

## Research Question

`handoff-adapted.md` lists four open questions before planning the flow diagram: (1) which colours identify PV, home, battery and grid; (2) whether pause/view preferences survive the 5-minute reload; (3) what the moving-arrow motion looks like; (4) whether the sign of `grid_w` and `battery_w` is documented well enough to draw direction arrows.

## Summary

- **Direction arrows are safe to draw.** On the inspected chain (Deye Cloud sensor read, homelab collector, push script, app mapper) `grid_w > 0` is import and `< 0` is export; `battery_w > 0` is discharge and `< 0` is charge. Nothing on that path negates a value. The convention is documented in the app (`docs/logic.md:23`) but not at the ingest contract (`contract.ts:23-24`, `docs/ingest/README.md`). One homelab-2 manifest contradicts it for the battery (below); treat as stale and fix in the docs step.
- **Source colours cannot follow the old lab page.** The status badge already spends green, amber and red on the meaning good/watch/problem (`StatusBadge.astro:13-16`). The lab page's solar amber and battery green would clash with those tones. Flow identity should use hues outside those three and always be paired with an icon and text.
- **The existing `--chart-1..5` tokens are unusable as they are.** They are defined and published to Tailwind (`global.css:29-33`, `:102-106`) but consumed by no class in `src/` on the inspected files, and the `:root` values are unchanged shadcn defaults (orange/teal/amber) that also collide with the tone hues.
- **Client state resets on every reload; nothing in the app persists client state.** `dashboard.astro:96-110` calls `window.location.reload()` when the tab is visible and 5 minutes old, so any island state (open details, view, pause) is lost. There is no `localStorage`/`sessionStorage`/`document.cookie` use in `src/` (only the Supabase server cookie adapter).
- **The island pattern exists and is small.** One island under `ui/` (`DisclosureButton.tsx`) is used in one card with `client:load`; children render in the server HTML. A flow island can follow it. Verification has no scripted state forcing and no screenshot runner; earlier changes used fixtures, backdated pushes and direct screenshots.

## Detailed Findings

### Q4. Sign convention of `grid_w` and `battery_w`

Producer, homelab-2 (`infra/compose/energy-app/scripts/`; read by a worker and re-checked by the parent for the lines cited here):

- `collect-ha-snapshot.py:137-146`: `split_grid_power` documents "positive-import DeyeCloud power"; `estimate_home_load` documents "positive grid import and positive battery discharge" and computes `max(0, pv + grid + battery)`.
- `collect-ha-snapshot.py:338-341` (and `build-energy-agent-briefing.py:408-409`, per worker): `sign_conventions` = `grid_w: positive_import_negative_export`, `battery_w: positive_discharge_negative_charge`.
- `push-energy-analyser.py:47,158` (per worker): copies both fields into `state` through `number()`, with no sign flip.

Consumer, app:

- `live-state.ts:66-71` `flow()` shows the value unsigned and turns the sign into a word; `live-state.ts:123` labels grid `> 0` "pobór z sieci", `< 0` "oddawanie do sieci"; `live-state.ts:125` labels battery `> 0` "rozładowanie", `< 0` "ładowanie".
- `docs/logic.md:23` states the same convention in prose.
- Fixtures the worker listed (`docs/ingest/example-v1.json:8-9`, `live-state.test.ts:9-10`, the lab's `test_push_energy_analyser.py:29-30`) use negative grid and battery values, which read as export and charging, consistent with the mapper.

Gaps and contradiction:

- The contract layer is silent: `contract.ts:23-24` types both as a bare `reading`; `docs/ingest/README.md` does not name either field (worker grep); the generated schema at `docs/ingest/contract-v1.schema.json:33,39` was seen only as grep hits, not read.
- `homelab-2/manifests/solar-energy-analyser-api.v1.yaml:151-153` says `battery_w: positive_charge_negative_discharge`, the opposite of the collector. Same file, other fields describe a planned different API; this manifest looks stale for the battery sign, but that is an inference, not a checked fact.
- `build-energy-agent-briefing.py:207-235` (per worker) runs a sanity check across four sign hypotheses; which one the residuals favour was not checked. If the owner wants proof beyond code comments, compare one live snapshot's `pv + grid + battery` with the inverter's own load reading.
- Not inspected: `supabase/seed.sql`, `scripts/push-fixture.mjs`, `scripts/smoke.mjs` state blocks (the worker's grep found no `grid_w`/`battery_w` in them).

**Consequence:** arrows may follow the mapper's `direction` words. The plan must include a docs step: write the convention into `docs/ingest/README.md` (and the schema description), and note the manifest conflict for homelab-2's inventory.

### Q1. Source colours

- Tone colours are raw utilities, not tokens: good `emerald`, watch `amber`, problem `red`, insufficient `white/blue-100` (`StatusBadge.astro:13-16`). Text always carries the meaning (`status.ts:1`).
- The lab page colour-coded by data category: solar amber, battery green, grid blue, cost orange (`context/changes/dashboard-glass-restyle/old-lab-page-reference.md`, "Color tokens"); that note already says not to adopt it silently over the tone system.
- `global.css:29-33` (`:root`) holds chart values `oklch(0.646 0.222 41.116)` orange, `0.6 0.118 184.704` teal, `0.398 0.07 227.392` dark blue, and two ambers; `global.css:102-106` publishes them as `--color-chart-*`. Worker grep found no consuming class in `src/`; whether `bg-chart-*` compiles was not checked, only that the theme entries exist.
- The `.dark` block (`global.css:44-76`) is documented as unused (the app never applies `.dark`, `global.css:7-8`).

**Consequence (recommendation, owner's call in planning):** add explicit `--flow-pv`, `--flow-home`, `--flow-battery`, `--flow-grid` tokens in `:root`, published in `@theme inline`, using hues away from emerald/amber/red (for example violet from `--primary`, sky, teal-blue, slate) and check contrast on `--card`. Leave `--chart-*` untouched for now and record them as unused. Identity must never depend on colour alone: keep icons and text.

### Q2. Persistence across the reload

- `dashboard.astro:96-110`: a 60 s interval plus `visibilitychange` reload the page after 5 minutes when visible (`window.location.reload()`).
- No client persistence exists to follow as a pattern (worker grep over `src/`).
- Plain consequence: without storage, an opened node detail, a chosen "Odczyty" view or a paused animation would reset every 5 minutes, which also violates the handoff's rule that refreshes must not reset selected details. Options: (a) `localStorage` for the two preferences (view, pause) with guarded reads and writes, and no persisted node selection; (b) replace the full reload with a soft refresh of the card (much larger change, out of scope). Recommendation: (a).

### Q3. Motion look

Owner decision already taken: static arrows always, motion only for fresh nonzero flows. Facts constraining the look:

- Pulse today: `global.css:135-154`, opacity oscillation, unconditional reduced-motion override; applied at `LiveStateCard.astro:66,78,90,106` on watts (and direction) only; `isStale` (`live-state.ts:117`) is never read by the card (worker grep and parent grep found no use of `isStale` in the card).
- `MIN_FLOW_W = 50` (`live-state.ts:12`) is the activity threshold; `LIVE_STALE_AFTER_MS = 15 min` (`live-state.ts:8`).
- Recommended concrete look, to confirm on a screenshot: a dashed connector whose `stroke-dashoffset` animates along the flow direction (SVG or CSS), one shared class gated by a single `isFlowLive` predicate (`!isStale && watts !== null && |watts| >= MIN_FLOW_W`) that also governs the pulse; static chevrons remain when the gate is off, when paused, and under reduced motion. Do not vary speed or width with magnitude (no capacity baseline exists, `live-state-flow-visual/plan.md` Key Discoveries).

### Island pattern and verification hooks (worker findings, partly re-read)

- `DisclosureButton.tsx:13-34` (read by parent): `useState`, shadcn `Button` (`type="button"`, `variant="outline"`), `aria-expanded`, `aria-controls`, content in a `hidden` div. Used only at `RecommendationCard.astro:64-81` with `client:load` (per worker). `astro ^7.3.2`, `@astrojs/react ^6.0.5`, `output: "server"` (`package.json`, `astro.config.mjs:10-20` per worker).
- Smoke test (`scripts/smoke.mjs:96-113` per worker) asserts the live card only by the strings "Stan na żywo" and "3,1 kW", and that "Dane nieaktualne" is absent; no `data-testid` checks. The only testid in the card is `live-today-period` (`LiveStateCard.astro:118`). Keep all values as real text.
- No Playwright or screenshot tooling in `package.json` or workflows; no kitchen-sink page exists, and `live-state-flow-visual` explicitly used direct screenshots instead (`plan.md:33`). The plan's states step must say how each state is forced: fixtures via `scripts/push-fixture.mjs` (not opened by this research), or backdated pushes.
- Literal-colour counts by class (worker; lines with `bg-white/`, `text-blue-100`, `divide-white`): `LiveStateCard` 9, 18, 1; `BillForecastCard` 2, 10, 0; `UsageInsightCard` 2, 18, 0; `RecommendationCard` 0, 8, 0; `ForecastCard` 0, 4, 0; `TermsExplained` 0, 3, 0; `StatusBadge` 1, 1, 0. This corrects the earlier "about 24" for `LiveStateCard` to 28 class occurrences and confirms `RecommendationCard`'s 8.

## Code References

- `src/lib/services/live-state.ts:8,12,66-71,117,123,125` - stale threshold, noise threshold, sign to word mapping, `isStale`
- `src/components/LiveStateCard.astro:62-114,66,78,90,106` - node markup and pulse gating (watts only)
- `src/components/StatusBadge.astro:13-16` - tone colours that flow hues must avoid
- `src/styles/global.css:29-33,102-106,135-154,169-174` - chart tokens, pulse utility, focus override
- `src/pages/dashboard.astro:96-110` - full-page reload every 5 minutes
- `src/components/ui/DisclosureButton.tsx:13-34` - the existing island
- `docs/logic.md:23` - sign convention in prose
- `src/lib/ingest/contract.ts:23-24` - untyped sign at the contract
- `homelab-2/infra/compose/energy-app/scripts/collect-ha-snapshot.py:137-146,338-341` - producer convention
- `homelab-2/manifests/solar-energy-analyser-api.v1.yaml:151-153` - contradicting battery sign

## Architecture Insights

The house pattern holds: pure mapper, dumb `.astro` renderer, one hydrated island only for real interaction. A flow island should receive the already-normalized view (raw watts, `isStale`, direction words) as props and own only presentation state (view, pause, selected node). The freshness gate belongs in the mapper as one boolean, so the pulse, arrows and any later chart read the same rule rather than each re-deriving it.

## Historical Context (from prior changes)

- `context/changes/live-state-flow-visual/plan.md` (supported): pulse chosen over moving dots for simplicity; `MIN_FLOW_W` reused; no proportional fill except battery SOC. Partly superseded by the owner's 2026-09-29 decision for static arrows plus freshness-gated motion.
- `context/changes/dashboard-glass-restyle/design-brief.md` (partial): "avoid decorative energy-flow animations" and "never show stale readings as fresh"; the second still binds, the first is relaxed by the owner for arrows that show real direction.
- `context/changes/dashboard-glass-restyle/old-lab-page-reference.md` (supported): category colours not to be adopted silently.
- `context/foundation/lessons.md` (supported): docs updated in the same change; prerequisites listed. The contract sign documentation fits the first rule.

## Related Research

- `context/changes/live-state-flow-visual/research.md`
- `context/changes/dashboard-glass-restyle/research.md`

## Open Questions

For the owner during `/10x-plan` (research answers, but the choices are theirs):

1. Source hues: approve new `--flow-*` tokens away from emerald/amber/red, or prefer to keep single-hue (icons and text only, no per-source colour)?
2. Persistence: approve `localStorage` (view and pause only) as the first client persistence in the app, or accept resets every 5 minutes?
3. Motion look: approve the dash-offset connector on a screenshot before the states phase.
4. Sign proof: is code plus comments enough, or compare one live snapshot against the inverter load before shipping arrows? (Cheap; recommended once.)
5. `homelab-2` manifest fix (`solar-energy-analyser-api.v1.yaml:153`) is outside this repo; record in the plan's prerequisites, do not edit from here.
