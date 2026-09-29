---
date: 2026-09-28T20:36:32+02:00
researcher: Claude (Sonnet 5)
git_commit: e0eaf06fe6aeac5ea9941ab4d37aaf4271af5212
branch: feat/live-state-flow-visual
repository: energy-analyser
topic: "Energy-flow visualization and battery state for Stan na żywo — data availability, icon library, and motion approach"
tags: [research, ui, live-state, icons, animation, geist, lucide]
status: complete
last_updated: 2026-09-28
last_updated_by: Claude (Sonnet 5)
---

# Research: Energy-flow visualization and battery state for Stan na żywo

**Date**: 2026-09-28T20:36:32+02:00
**Researcher**: Claude (Sonnet 5)
**Git Commit**: e0eaf06fe6aeac5ea9941ab4d37aaf4271af5212
**Branch**: feat/live-state-flow-visual
**Repository**: energy-analyser

## Research Question

Can `Stan na żywo` (`src/components/LiveStateCard.astro`) support a "living" energy-flow visualization and a clearer battery-state indicator using Vercel's Geist icon/illustration style, and what does the current view model, icon tooling, and animation tooling actually offer to build it with?

## Summary

The view model (`LiveStateView`) only exposes pre-formatted display strings ("3,1 kW"), not raw numeric watts — a genuine gap for any visual that wants to scale by magnitude (a fill-ring, a bar, flow-line speed). The project already has, and actively uses, `lucide-react` as its icon library (wired into `components.json`'s `iconLibrary` and imported in four auth components), and it already contains every icon this feature needs — `sun`, `battery`/`battery-charging`/`battery-full`/`battery-low`/`battery-medium`/`battery-warning`, `home`/`house-plug`, `zap`/`plug-zap`. Geist's own icon set, by contrast, is documented as "tailored for developer tools" with no evidence of energy/battery/solar icons, and would be a second icon library introduced alongside the one already in place. `tw-animate-css` (already imported in `global.css`) only covers enter/exit transitions (fade/zoom/slide, `animate-in`/`animate-out`) — nothing for a continuous, looping "flow" animation; that needs hand-written `@keyframes`, which is normal CSS, not a new dependency. The old lab page's radial-ring "flow board" (documented in `dashboard-glass-restyle/old-lab-page-reference.md`) remains the one concrete structural precedent for this exact idea, using a CSS custom property (`--pct`) to drive a ring's fill via `conic-gradient` or similar — that file already covers this in detail and is not re-derived here.

## Detailed Findings

### View model: strings only, no raw numbers (`live-state.ts`)

`LiveStateView`'s `"state"` variant (`live-state.ts:22-36`) exposes `pv: string`, `homeLoad: string`, `grid: FlowLabel`, `battery: FlowLabel & { socLabel: string }` — every numeric quantity is already formatted to a display string (`kwLabel()`, `live-state.ts:52-54`) before it reaches the view. `battery.socLabel` is the one percentage already available as a clean number-bearing string (`live-state.ts:103`, e.g. `"74%"`), but even that is pre-formatted, not a raw `number`.

**This is the central open question for planning**: a proportional visual (ring fill, bar length, flow-line width/speed keyed to how much power is flowing) needs the underlying number, not the formatted label. Options, none decided here:

- Add raw numeric fields alongside the existing string ones in `LiveStateView` (a mapper change — still no new _calculation_, since `pv_w`/`home_load_w`/`grid_w`/`battery_w`/`battery_soc_pct` are already read from `state` at `live-state.ts:98-103`; this just stops discarding the number after formatting).
- Parse the formatted Polish-locale string back to a number in the component — fragile (locale-specific decimal comma, unit suffix) and against the codebase's own convention of keeping all parsing in the mapper.
- Scope the visual to not need magnitude scaling — e.g., icons + direction + on/off state only, no proportional fill — sidestepping the gap entirely.

`MIN_FLOW_W = 50` (`live-state.ts:12`) is the existing "this flow is noise" threshold already used to suppress a direction word; any presence/absence treatment in the new visual (e.g., "is the grid arrow shown at all") should reuse this same threshold rather than inventing a new one.

### Icon library: `lucide-react` is already installed, wired, and covers every needed concept

- `components.json:1-22` (from `dashboard-glass-restyle` research) sets `"iconLibrary": "lucide"` — the project's declared icon convention.
- `package.json:27` lists `lucide-react: ^1.14.0` as a real (non-dev) dependency, already installed (`node_modules/lucide-react` present).
- Already imported and used in four auth components: `Lock, LogIn, Mail` (`PasswordSignInForm.tsx:2`), `CircleAlert` (`ServerError.tsx:1`, `FormField.tsx:2`), `Mail, Send` (`MagicLinkForm.tsx:2`).
- Confirmed present in the installed package (`node_modules/lucide-react/dist/esm/icons/`) — not just assumed from the package name: `sun.mjs`, `battery.mjs`, `battery-charging.mjs`, `battery-full.mjs`, `battery-low.mjs`, `battery-medium.mjs`, `battery-warning.mjs`, `home.mjs`, `house-plug.mjs`, `zap.mjs`, `plug.mjs`, `plug-zap.mjs`, `plug-zap-2.mjs`, `gauge.mjs`, `gauge-circle.mjs`, `cloud-sun.mjs` — directly covering solar (`sun`/`cloud-sun`), home load (`home`/`house-plug`), grid (`zap`/`plug-zap`), and every battery charge state named in the icon set itself.

### External reference: Vercel Geist's icon set is developer-tool-oriented, not domain icons

Per <https://vercel.com/geist/icons> (fetched 2026-09-28): Geist's icon set is Vercel's "first-party design system," but the page's own text describes it as "an icon set tailored for developer tools" and does not list or confirm any energy/battery/solar/home/grid icons. A web search for the npm package surfaced two different, inconsistent package names (`geist-icons` on npm vs. `@vercel/geistcn-assets` per the Geist site) — this inconsistency itself is worth flagging rather than trusting either blindly; whichever is current, neither source confirms domain-relevant icons exist in it. Combined with the "second icon library" concern above, Geist's icon set does not appear to be the right tool for icons in this specific feature, independent of the "don't add a duplicate system" concern.

_(The user's ask may also mean Geist's broader visual/illustration *style* — flat, minimal, geometric — as inspiration for how the flow visual should look, rather than literally importing Geist's icon package. That distinction is a planning question, not resolved here.)_

### Motion tooling: `tw-animate-css` doesn't cover continuous/looping animation

`tw-animate-css` (`package.json:56`, imported at `global.css:2`) is confirmed (via its own README, `node_modules/tw-animate-css/README.md`) to provide enter/exit transition utilities only — `animate-in`/`animate-out` with fade/zoom/slide directions, plus two ready-made animations (`accordion-down`/`accordion-up`, `caret-blink`). It has no utility for a continuous, looping "energy is flowing" animation (e.g., a moving dash pattern along a line, a pulsing dot). That needs hand-written `@keyframes` in `global.css` — ordinary CSS, not a new dependency, following the same `@utility` pattern already used for `bg-cosmic` and `glass-surface` (`global.css:117-133`).

**Reduced motion**: `dashboard-glass-restyle`'s Phase 4 established the house rule ("no animation beyond ~150ms interaction feedback; reduced-motion respected") for _interaction_ feedback, but this feature introduces the project's first _ambient/looping_ animation, which is a different accessibility bar — it must have a `prefers-reduced-motion: reduce` fallback that stops the loop entirely (not just shortens it), per standard practice. No existing code in this repo does this yet, so there's no established pattern to follow — this is new ground for the project's CSS.

### Old lab page precedent (already documented, reused not re-derived)

`context/changes/dashboard-glass-restyle/old-lab-page-reference.md` already covers the old lab page's "flow board" in detail: four radial-ring nodes (Panele/Dom/Bateria/Sieć), each a `--pct` custom property driving a ring fill, static (not animated) rings, plus a live "eksport/import" mode chip. That file's verdict ("use as inspiration for... the four equal live metrics flow-board layout idea") stands; this research doesn't re-investigate the old lab page further. One addition: that page's rings were explicitly _static_, not animated — this change's "living" ask is a step beyond that precedent, not a repeat of it.

### Smoke test constraint

`scripts/smoke.mjs`'s `"dashboard shows the fresh live state"` step asserts the rendered dashboard HTML contains the literal string `"3,1 kW"` (the example fixture's PV reading). Whatever the new visual looks like, the plain-text kW value must still appear somewhere in the rendered markup (e.g., as an accessible label or a visible numeric readout next to/inside the visual) — a purely graphical rendering (e.g., an SVG with no text) would break this existing assertion.

## Code References

- `src/lib/services/live-state.ts:17-36` — `FlowLabel`/`LiveStateView` types, string-only fields.
- `src/lib/services/live-state.ts:52-61,98-104` — where raw numbers get formatted away; `MIN_FLOW_W` threshold.
- `src/components/LiveStateCard.astro:30-52` — the current plain 4-tile grid this feature replaces or augments.
- `components.json:1-22`, `package.json:27` — lucide-react as the declared and installed icon convention.
- `src/components/auth/{PasswordSignInForm,ServerError,FormField,MagicLinkForm}.tsx` — existing lucide-react usage.
- `node_modules/lucide-react/dist/esm/icons/{sun,battery*,home,house-plug,zap,plug*,gauge*,cloud-sun}.mjs` — confirmed relevant icons exist in the installed package.
- `global.css:117-133` — the `@utility` pattern to follow for any new CSS-driven visual/animation.
- `node_modules/tw-animate-css/README.md` — confirms enter/exit-only scope.
- `scripts/smoke.mjs` (`"dashboard shows the fresh live state"` step) — the `"3,1 kW"` text-content constraint.

## Architecture Insights

This repo's house pattern (pure mapper → dumb `.astro` renderer, documented repeatedly across `bill-forecast` and `dashboard-glass-restyle`'s research) still applies: any new visual is a template change in `LiveStateCard.astro`, and any raw-number exposure needed to drive it is a `LiveStateView` field addition in `live-state.ts`, not new business logic. The mapper has never before needed to hand a component a "magnitude for visual scaling" — this would be a first, worth naming explicitly as a type/contract decision in the plan rather than leaving implicit.

## Historical Context (from prior changes)

- `context/changes/dashboard-glass-restyle/old-lab-page-reference.md` — full old-lab-page flow-board findings (see "Old lab page precedent" above).
- `context/changes/dashboard-glass-restyle/plan.md` — chose "plain equal-weight grid" over "radial-ring flow-board" for the first restyle pass specifically to reduce risk (`plan.md`, live-metrics decision); this change is the explicit revisit of that call.
- `context/foundation/lessons.md` — no motion/icon-specific lesson exists yet; the two general lessons (prerequisites, docs-in-step-with-code) don't bear on this specific question.

## Related Research

- `context/changes/dashboard-glass-restyle/research.md` — the token/component audit this feature builds on (Panel, the card pattern, `StatusBadge`).
- `context/changes/dashboard-glass-restyle/old-lab-page-reference.md` — the flow-board precedent.

## Open Questions

1. **Raw numbers in `LiveStateView`** — does the plan want proportional visual scaling (needs new numeric fields) or a simpler icon+direction+state treatment (doesn't)? This is the single most consequential open decision; it determines whether `live-state.ts` changes at all.
2. **Geist literally, or Geist as a style reference?** — the user asked for "Geist icons/illustrations," but Geist's own icon set doesn't appear to cover this domain and would duplicate the existing `lucide-react` convention. Does the user want Geist's _visual language_ (flat, minimal, geometric shapes) recreated with `lucide-react` icons and custom CSS, or do they specifically want to import Geist's package regardless? Needs a direct answer before planning icon sourcing.
3. **How "living" is "living"?** — a subtle pulsing/breathing indicator, a moving dash pattern along a flow line, or something more illustrative? Affects both implementation complexity and the reduced-motion fallback design.
4. **Scope boundary vs. the existing 4-tile grid** — does this visual _replace_ the `dashboard-glass-restyle` grid entirely, sit _alongside_ it (e.g., a small diagram above the tiles), or _become_ the tiles (each tile gets an icon + mini visual)? Not specified by the user's request; a real layout decision for planning.
