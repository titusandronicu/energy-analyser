---
date: 2026-09-28T17:10:15+02:00
researcher: Claude (Sonnet 5)
git_commit: 68d7956502d17190d7bf5117046965d077c03431
branch: feat/bill-forecast
repository: energy-analyser
topic: "Dashboard glass restyle — token/component audit and design references"
tags: [research, ui, dashboard, tokens, tailwind, shadcn, astro]
status: complete
last_updated: 2026-09-28
last_updated_by: Claude (Sonnet 5)
---

# Research: Dashboard glass restyle — token/component audit and design references

**Date**: 2026-09-28T17:10:15+02:00
**Researcher**: Claude (Sonnet 5)
**Git Commit**: 68d7956502d17190d7bf5117046965d077c03431
**Branch**: feat/bill-forecast
**Repository**: energy-analyser

## Research Question

Per `/10x-ui`'s router: locate this repo's **source of values** (token file) and **shared component directory**, find which views actually read them, and gather a **named external reference** — to support planning a restyle of `src/pages/dashboard.astro` per `context/changes/dashboard-glass-restyle/design-brief.md`.

## Summary

The repo already has a complete, unused shadcn/Tailwind v4 token system (`src/styles/global.css`) and one genuine shadcn primitive (`src/components/ui/button.tsx`), both wired correctly (`components.json`, `@astrojs/react`, `cn()` helper). None of the four dashboard cards use any of it: every card hardcodes the identical raw Tailwind literal string for its shell and repeats `text-blue-100`/`text-white` literals throughout, and the sign-out button ignores the existing shadcn `Button`. This is the textbook "source of values nothing reads" case `/10x-ui` describes for greenfield starters — the restyle's first phase is making the dashboard read tokens that already exist, not inventing new ones. Two external references are available: the required shadcn/ui Base UI Button docs, and a live, richer "old" energy dashboard (`homelab-2/apps/solar-energy-analyser/web/`, also reachable at `http://192.168.50.30:3020/`) whose glass-panel and violet-accent treatment lines up closely with the design brief's own proposed palette.

## Detailed Findings

### Token source: `src/styles/global.css` (fully wired, fully unused by the dashboard)

- `@import "tailwindcss"` (`global.css:1`) plus `@tailwindcss/vite` in `astro.config.mjs:17-19` — Tailwind v4 loaded via the Vite plugin, no legacy `tailwind.config.js` (`components.json:7` has `"config": ""`).
- `:root` (`global.css:6-39`) defines a full shadcn token set in oklch: `--background`, `--foreground`, `--card`/`--card-foreground`, `--popover`, `--primary`/`--primary-foreground`, `--secondary`, `--muted`/`--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--sidebar-*`, and `--radius: 0.625rem`.
- `.dark` (`global.css:41-73`) redefines the same set for a dark theme (e.g. `--background: oklch(0.145 0 0)`, `--card: oklch(0.205 0 0)`).
- `@theme inline` (`global.css:75-111`) publishes every one of those as `--color-*` / `--radius-*`, which is what makes `bg-primary`, `text-muted-foreground`, `rounded-lg`, etc. resolve.
- `@custom-variant dark (&:is(.dark *))` (`global.css:4`) is the dark-mode switch mechanism — **but nothing in the app ever applies a `dark` class**. `src/layouts/Layout.astro:14` renders `<html lang="pl">` with no `class`, and no other file sets `document.documentElement.classList` or similar (not found in any `.astro`/`.ts` file read this session). So today `:root`'s **light** values (`--background: oklch(1 0 0)` = white) are technically "active," yet the whole app renders dark — because every view bypasses the token layer entirely with hardcoded dark literals (`bg-cosmic`, `text-white`, `bg-white/10` overlays). This is an important reconciliation point for planning: introducing the brief's dark palette should not be layered as `.dark`-class overrides on a light `:root` (the app has no light/dark toggle and never will per the brief — "a new theme switch is not required"). The cleanest path is repointing `:root` itself to the brief's dark values, leaving `.dark` as an unused-but-harmless escape hatch, OR applying `class="dark"` unconditionally in `Layout.astro` and updating `.dark`'s values — either is a planning decision, not a research one.
- `@utility bg-cosmic` (`global.css:113-115`) — a hand-rolled gradient utility (`#0a0e1a → #0f1529 → #0a0e1a`) used only at `dashboard.astro:62` for the page background; not part of the token system, a second, parallel "background color" decision outside `--background`.
- `@layer base` (`global.css:117-124`) applies `border-border outline-ring/50` to `*` and `bg-background text-foreground` to `body` — so `body`'s background is nominally `--background` (white today), immediately overridden by `dashboard.astro`'s own `bg-cosmic` wrapper div.

### Shared components: `src/components/ui/` (2 files, one real primitive)

- `src/components/ui/button.tsx` (51 lines) — a genuine shadcn/ui `Button` built with `cva`, using **only** theme-token classes (`bg-primary`, `bg-destructive`, `bg-secondary`, etc.), no raw color literals. This is exactly the component the design brief's "shadcn/ui Base UI Button contract" section asks to reuse — it already exists and is unused by the dashboard.
- `src/components/ui/LibBadge.astro` (13 lines) — an app-specific badge, not a shadcn primitive, hardcoding `bg-blue-900/50`, `text-blue-200`, `bg-purple-500/30`, `text-purple-200` (`LibBadge.astro:10,12`). A second, independent color declaration outside `StatusBadge`'s tone map.
- No `card`, `badge` (shadcn), `dialog`, or other primitives exist despite `components.json` being fully configured for `npx shadcn add <name>` (style `new-york`, `cssVariables: true`, `css: "src/styles/global.css"`, aliases `@/components/ui` etc. — `components.json:1-22`).
- `cn()` helper: `src/lib/utils.ts:1-6`, exactly `twMerge(clsx(inputs))` as CLAUDE.md claims. Used at `StatusBadge.astro:22`, `UsageInsightCard.astro:83` (a `class:list` on a highlighted range row), and inside `button.tsx:47`. **None of the four dashboard cards' root `<section>` shells route through `cn()`** — each is a plain literal string, so there is no existing override point for a restyle without editing every card file.

### React integration (already wired, unused on the dashboard)

`@astrojs/react` is imported and activated (`astro.config.mjs:4`, `:16`). Six `.tsx` files exist, all in the **auth** flow (`SubmitButton.tsx`, `FormField.tsx`, `PasswordSignInForm.tsx`, `ServerError.tsx`, `MagicLinkForm.tsx`, plus `ui/button.tsx`) — none for the dashboard cards, which are pure `.astro` with no client JS. This confirms the design brief's own instruction ("keep static layout in Astro, hydrate interactive React boundaries only where needed") is exactly what a controlled `Pokaż szczegóły`/`Ukryj szczegóły` disclosure (needing `aria-expanded` state) would require: a small React island, not a page-wide conversion.

### The four dashboard cards: identical structural pattern, identical duplicated shell

`LiveStateCard.astro`, `BillForecastCard.astro`, `UsageInsightCard.astro` (full read: 110 lines), `RecommendationCard.astro` all share one shape: a single prop (`view: X | null`), no local state, no client JS, `status = view === null ? LOAD_FAILED : view.status`, `<StatusBadge>` under the heading, a native `<details><summary>` for "more" content (either `TermsExplained` or a card-specific expansion), and this **exact literal shell string, repeated verbatim**:

```
rounded-2xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl
```

at `LiveStateCard.astro:17`, `BillForecastCard.astro:53`, `UsageInsightCard.astro:23`, `RecommendationCard.astro:19` — plus a `p-8`/`max-w-sm` variant of the same shell at `src/pages/auth/check-email.astro:7` and `src/pages/auth/signin.astro:12`.

`text-blue-100` (and its `/60`, `/70`, `/80` opacity variants) for secondary text recurs in every one of the same files. Approximate literal-class occurrence counts per file (raw `bg-white/`, `text-blue-100`, `border-white/`, tone colors, `text-white`): `LiveStateCard.astro` 24, `UsageInsightCard.astro` 24, `BillForecastCard.astro` 15, `RecommendationCard.astro` 14, `StatusBadge.astro` 12 (the one centralized tone map), `check-email.astro` 7, `signin.astro` 7, `FormField.tsx` 7, `dashboard.astro` 4, `SubmitButton.tsx` 4, `ServerError.tsx` 3, `TermsExplained.astro` 3, `LibBadge.astro` 2.

`StatusBadge.astro:13-18` centralizes the four status-tone colors correctly:

```ts
const TONE_CLASSES: Record<StatusTone, string> = {
  good: "border-emerald-400/40 bg-emerald-900/30 text-emerald-200",
  watch: "border-amber-400/40 bg-amber-900/30 text-amber-200",
  problem: "border-red-500/40 bg-red-900/30 text-red-300",
  insufficient: "border-white/15 bg-white/10 text-blue-100",
};
```

This is the _one_ place that's already done right (single source, one map). But `ServerError.tsx:11` re-declares the same red palette independently (`border-red-500/30 bg-red-900/30 text-red-300`) instead of reusing `StatusBadge`'s `problem` tone, and `LibBadge.astro` (above) re-declares blue/purple independently — so the tone system is centralized in intent but not enforced in practice.

`dashboard.astro:64-79` currently renders four cards in this order: `LiveStateCard` → `BillForecastCard` → `UsageInsightCard` → `RecommendationCard`. The sign-out control at `dashboard.astro:69` is a raw `<button type="submit">` styled with one-off `text-purple-300 hover:text-purple-100` literals — not `buttonVariants({variant:"ghost"})` from the existing shadcn `Button`, despite that being exactly what the design brief asks for.

### Recommendation and usage-insight data models (relevant to "prefer existing structured fields")

- `RecommendationView` (`src/lib/services/recommendation.ts:25-44`) already separates a free-form narrative `text: string` from **structured** fields: `findings: string[]` (from `facts.local_findings`, `recommendation.ts:81-88`), and a `forecast` object (`todayLabel`/`tomorrowLabel`/`certainty`). `RecommendationCard.astro:87-96` already renders `findings` inside a native `<details>` "Na podstawie" block, separate from the main `text` paragraph. This is exactly the structured material the design brief's progressive-disclosure section asks to keep inside `Pokaż szczegóły` — no fragile text-splitting needed, the split already exists at the data-model level.
- `UsageInsightView.meaning.ranges` (`src/lib/services/usage-insight.ts:30-37`, `:143-161`) is a structured array of named bands already rendered inside a native `<details>` in `UsageInsightCard.astro` (baseline explanation) — same pattern, already available for the brief's "baseline context available through an accessible disclosure" requirement.

### External reference 1: shadcn/ui Base UI Button

Named in the design brief: <https://ui.shadcn.com/docs/components/base/button>. Not fetched in this pass (the repo's own `button.tsx` is the concrete, already-integrated artifact to build from — see above); the brief's variant/usage rules (ghost for `Wyloguj`, outline for disclosures, reserve `default` for a genuine primary action, anchors via `buttonVariants` for navigation, no button-in-summary nesting) should be checked against `button.tsx`'s actual exported variants during planning.

### External reference 2: the "old energy analyser" (home lab's own dashboard)

Full findings in `context/changes/dashboard-glass-restyle/old-lab-page-reference.md`. Summary: `homelab-2/apps/solar-energy-analyser/web/{index.html,style.css}` (read on ugreen) is byte-identical to the page live at `http://192.168.50.30:3020/` (confirmed 2026-09-28, same `?v=20260722-5` asset version) — one deployed static HTML/JS/CSS dashboard, no auth, reading Home Assistant/Deye/PGE data directly, referred to throughout this repo's own docs as "the lab page." Its `:root` tokens (`style.css:1-19`) use a translucent glass panel (`--panel: rgba(24, 30, 38, 0.56)`), a violet accent (`--violet: #b8a7ff`, close to the design brief's proposed `primary: #B5A3F5`), and per-data-category colors (solar=amber, battery=green, grid=blue, cost=orange) rather than this app's status-tone system. Its "flow board" (four radial-ring nodes: Panele/Dom/Bateria/Sieć) is a clean structural precedent for the brief's "four equally weighted live metric groups" ask. Its deeper analysis panels (PGE reconciliation, battery TOU planning, anomaly detection, LLM briefing) are out of scope for this restyle (no new calculations/charts per the brief) and are noted only as possible future feature ideas for the product roadmap, not for `/10x-plan` here.

## `/10x-ui` grievance list (audit input to planning)

Per `/10x-ui`'s three categories — each with file:line and user-facing impact:

1. **Missing tokens — card shell and body text are raw Tailwind literals, not the theme tokens already in `global.css`.** `LiveStateCard.astro:17`, `BillForecastCard.astro:53`, `UsageInsightCard.astro:23`, `RecommendationCard.astro:19` (plus `check-email.astro:7`, `signin.astro:12`) all hardcode `border-white/10 bg-white/10 ... text-white` instead of `border-border bg-card text-card-foreground`; `text-blue-100` variants stand in for `text-muted-foreground` throughout. Impact: this restyle (or any future theme change) must edit 6 files' literal strings one at a time instead of one token block; the `.dark` variant that already exists is dead code no view ever reaches.
2. **Missing tokens — two independent, uncoordinated color declarations outside the one centralized tone map.** `LibBadge.astro:10,12` (blue/purple) and `ServerError.tsx:11` (red, duplicating `StatusBadge`'s `problem` tone) each re-declare palette colors instead of referencing `StatusBadge.TONE_CLASSES` or a shared token. Impact: a future tone-color change (e.g. adjusting the "problem" red) silently misses these two spots.
3. **Missing shared component — the same glass-card shell string is copied six times with no shared component to import.** Same four dashboard-card locations plus the two auth pages above; none route through `cn()`, so there's no single point to change the shell today. Impact: exactly the maintenance cost `/10x-ui`'s "missing shared component" category describes — a restyle here is a 6-file find-and-replace instead of a 1-file edit, and it's easy to miss one (or drift the auth-page variant out of sync with the dashboard).
4. **Missing shared component — a working shadcn `Button` exists and nothing uses it.** `src/components/ui/button.tsx` is fully built (cva variants, token-only classes) but the sign-out control (`dashboard.astro:69`) is a raw `<button>` with one-off `text-purple-300` styling instead of `buttonVariants({variant:"ghost"})`. Impact: sign-out has no shared focus/hover/disabled treatment with any future button on the page, and the design brief's whole "Button contract" section is asking to close exactly this gap.

No accidental-architecture (category 3) finding surfaced in this audit: `/dashboard` is a single authenticated route, each card independently null-safes its own load failure (`orLoadError` + `LOAD_FAILED`, `dashboard.astro:16-24`), and unauthenticated access is redirected by `src/middleware.ts` (per CLAUDE.md) before any card renders. This is worth stating explicitly rather than silently omitting the category.

## Code References

- `src/styles/global.css:1-124` — the token source (Tailwind v4, shadcn `:root`/`.dark`/`@theme inline`), unused by the dashboard.
- `src/layouts/Layout.astro:14` — `<html>` never gets a `dark` class; the `.dark` block in `global.css` is unreachable today.
- `src/components/ui/button.tsx` — the existing shadcn `Button`, token-only, unused by the dashboard.
- `src/components/ui/LibBadge.astro:10,12` — a second hardcoded color declaration.
- `src/lib/utils.ts:1-6` — `cn()` (`clsx` + `tailwind-merge`), underused by the cards' own shells.
- `src/components/{LiveStateCard,BillForecastCard,UsageInsightCard,RecommendationCard}.astro` — the four cards, identical dumb-renderer + `StatusBadge` + native `<details>` pattern, each duplicating the glass-shell literal.
- `src/components/StatusBadge.astro:13-18` — the one correctly centralized color map (tone → Tailwind classes).
- `src/components/auth/ServerError.tsx:11` — a second, independent red declaration.
- `src/pages/dashboard.astro:36-58` (data loading, `orLoadError` pattern), `:64-79` (card order, sign-out button).
- `src/lib/services/recommendation.ts:25-44,81-88` — structured `findings`/`forecast` fields alongside narrative `text`.
- `src/lib/services/usage-insight.ts:30-37,143-161` — structured `meaning.ranges`.
- `components.json:1-22` — shadcn already configured (`style: new-york`, `cssVariables: true`).
- `astro.config.mjs:4,16-19` — `@astrojs/react` and `@tailwindcss/vite` wiring.

## Architecture Insights

The repo follows one consistent card pattern end to end (pure mapper → dumb `.astro` renderer → `StatusBadge` for status → native `<details>` for "more"), documented as deliberate in `context/changes/bill-forecast/plan.md`'s "Key Discoveries" (`live-state.ts:81-115` cited as the house pattern). The restyle should preserve this pattern exactly — it's not something this change should touch — and confine itself to the token/component/layout layer identified above, per `/10x-ui`'s "one view + global tokens" hard rule.

## Historical Context (from prior changes)

- `context/changes/bill-forecast/plan.md:40-48` ("Key Discoveries") independently documents the same card pattern and the same `StatusBadge`-centralizes-color observation this research reaches from the token/component angle — consistent, not contradicted.
- `context/foundation/lessons.md` "Keep the project docs in step with the code" (`lessons.md:12-17`) — applies here too: if this restyle changes `docs/architecture.md`-relevant structure (e.g. introducing a shared `GlassPanel` component), that doc should be updated in the same change, though no such doc currently describes UI conventions (checked: `docs/architecture.md`, `docs/logic.md`, `docs/decisions.md` are all data/logic-focused, not UI-pattern docs — confirmed by their content read during the bill-forecast work this session).
- `context/changes/bill-forecast/` (this session, same day) added the fourth card (`BillForecastCard.astro`) using the exact same hardcoded-shell pattern this research flags — meaning the restyle's token/component fix, once landed, should also be applied to `BillForecastCard.astro`, not just the three pre-existing cards. The design brief's own hierarchy (six sections) doesn't mention `BillForecastCard` at all, since it predates that card's existence — reconcile its placement during planning rather than dropping it.

## Related Research

- `context/changes/dashboard-glass-restyle/design-brief.md` — the input brief this research supports (with two inline reconciliation notes already added: the six-section hierarchy vs. the current four-card reality, and the missing Button/React precedent).
- `context/changes/dashboard-glass-restyle/old-lab-page-reference.md` — full external-reference findings for the "old energy analyser."
- `context/changes/bill-forecast/plan.md` — the most recent prior UI work on this dashboard (the card pattern this restyle must preserve).

## Open Questions

1. **`:root` vs `.dark` for the new palette** — should the restyle repoint `:root` itself to the dark palette (since the app has no light mode and never will per the brief), or apply `class="dark"` globally in `Layout.astro` and put the new values in `.dark`? Either works; `/10x-plan` should pick one explicitly rather than leaving `.dark` as unreachable dead code.
2. **Where `BillForecastCard` lands in the new six-section hierarchy** — the design brief's hierarchy (Header → Stan na żywo → Dzisiaj → Rekomendacja na dziś → Zużycie wczoraj → Prognoza produkcji) has no slot named for it. It currently sits second, right after live state, per a deliberate bill-forecast-phase-4 decision ("late cost feedback is the first problem the PRD names" — `context/changes/bill-forecast/plan.md:315`). Planning should decide whether it keeps that position or moves, but should not silently drop it.
3. **Flow-board precedent for "Stan na żywo"** — is adopting a radial-ring layout (inspired by the old lab page) in scope for this restyle's "four equally weighted metric groups" requirement, or is a simpler grid preferred? The design brief text alone doesn't decide this; it's a planning/product call, not a research gap.
4. **shadcn Button doc verification** — the Base UI Button reference page itself was not fetched in this pass (time-boxed to the repo's own `button.tsx`, which is the actual integration point); `/10x-plan` or the implementation phase should verify the specific variant/prop names against `button.tsx`'s real exports before writing plan contracts that assume a `variant` prop shape.
