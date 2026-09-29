---
topic: "What the approved dashboard refresh needs from the codebase: gaps, data for sparklines and deltas, icon and chart options"
researcher: Claude (read-only subagent, 2026-09-29)
date: 2026-09-29
git_commit: 4e7b49c
status: complete
---

# Research: dashboard refresh (icons, sparklines, bill delta, balance)

Checked tree: `main` at `e2d176b` (origin/main `4e7b49c` adds docs only). PR 65's token cleanup (`context/archive/2026-09-29-frosted-aurora-dashboard/plan.md`, new `global.css`) exists only on `origin/cursor/frosted-aurora-dashboard-8dba`; main still carries `text-blue-100` / `bg-white/5` literals in the cards. No production data volumes were queried.

## 1. Gap map: design element against the app

| Design element                                                | Status  | Evidence                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header logo icon, "Wyloguj się"                               | Partial | `src/pages/dashboard.astro:78-88`: glass header, text "Energy Analyser", ghost "Wyloguj"; no logo icon. Keep the e-mail and the POST sign-out form.                                                                                                                  |
| "Stan na żywo" + "Dane aktualne" dot                          | Partial | `LiveStateCard.astro:20-23`: heading plus `StatusBadge` (colour and word "aktualne"); no dot, no heading icon.                                                                                                                                                       |
| Flow diagram: nodes, icons, dashed connectors, arrows, motion | Exists  | `src/components/live/LiveFlow.tsx` (`client:load`), `FlowNode.tsx`; SVG paths, dashed when idle, arrowheads, `animate-flow-dash` (`LiveFlow.tsx:211-260`). Icons Sun, Home, Battery*, Zap.                                                                           |
| Central "Bilans systemu +X kW"                                | Partial | `LiveFlow.tsx:277-283`: a 34 px junction with a `Scale` icon, `aria-hidden`, no label or value.                                                                                                                                                                      |
| KPI row (PV, bought, sold)                                    | Partial | `LiveStateCard.astro:51-69`: `<dl>` with "Z paneli dziś", "Kupione z sieci dziś", "Sprzedane do sieci dziś", values only.                                                                                                                                            |
| Sparklines                                                    | New     | No chart or sparkline code anywhere; `docs/decisions.md:20` defers the intraday chart.                                                                                                                                                                               |
| Recommendation heading icon, tag chips, details button        | Partial | `RecommendationCard.astro:29`: no icon. Findings are list items with severity chips (`RecommendationFindings.astro`); there is no kind or tag field (`docs/decisions.md:10`). `DisclosureButton.tsx` is a controlled disclosure ("Pokaż szczegóły"), not navigation. |
| Bill card: icon, amount, delta, period bar                    | Partial | Range is the headline, central estimate below (`BillForecastCard.astro:70-82`, deliberate per `docs/decisions.md:25`). Only a verdict badge against the last invoice exists (`bill-forecast.ts:194-213`); no delta line, no bar.                                     |
| Usage rows                                                    | Partial | `UsageInsightCard.astro:45-56`: two tiles (home consumption, bought from grid) with delta against the norm; "Z PV wykorzystane" is missing.                                                                                                                          |
| Footer legend                                                 | Partial | A tone legend exists inside the diagram only (`LiveFlow.tsx:149-154, 303-307`); no dashboard footer and no source-icon legend.                                                                                                                                       |

Preserve (PR 65 field-preserving contract, `context/archive/2026-09-29-frosted-aurora-dashboard/plan.md`): header e-mail and sign-out form; every live, bill, recommendation and usage field and state; every `data-testid` (smoke relies on "Stan na żywo", "3,1 kW", "Prognoza rachunku", "od 155 zł do 360 zł", "ok. 258 zł", the advice marker; it asserts neither "Nieaktualna" nor "Dane nieaktualne").

## 2. Data for sparklines and deltas

- `authenticated` may select `ingest_pushes(source, captured_at, received_at, payload)` (`20260925123751_live_state_view.sql:6`, owner-only policy at 8-12). `daily_energy` readable columns: `day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh, captured_at` (`20260925162240`, `20260929101548`).
- **Daily series need no new query.** `loadDailyEnergy` (`src/lib/services/usage-insight.ts:55-65`) already loads the last 400 days, newest first, and is fetched once on the page (`dashboard.astro:40`). `daily_energy` is not pruned; history starts about 2026-07-16 to 26, so 7 to 14 point series exist today. Days can be null or incomplete (`counters_ok`): draw gaps, never zeros.
- **Intraday series (out of scope here):** derivable from the pushes kept for 14 days (`state.pv_today_kwh`, `grid_import_today_kwh`, `grid_export_today_kwh`, `contract.ts:26-28`; `pv_w`, `home_load_w` too), at most 288 rows per Warsaw day; would need a `security_invoker` view (migration) and revisiting `docs/decisions.md:20`.
- **Bill delta:** `closed_month_check.invoice_gross_pln` is optional in the contract (`contract.ts:132-140`); the mapper already compares the central estimate to it (`bill-forecast.ts:194-213`). Delta amount and percent are computable without lab fields. The invoice can lag by up to two months, so the label must name it ("względem ostatniego rachunku za <miesiąc>"); absent when there is no invoice. `diff_pct` is the check's own arithmetic drift, not a period delta: do not use it.
- **Period bar:** derivable from `month`, `observed_days` (dates, at most 31) and `completed_days_used`, no new fields. Decision taken in the design: "policzone z pełnych dni X z Y" (share of days in the estimate), not calendar progress.
- **Usage rows:** total load and grid import are in `toUsageInsightView`; a 7-day series comes from the same rows. "Z PV wykorzystane" = `pv_kwh - grid_export_kwh` is derivable, but the inverter export counter is known to be wrong (`docs/logic.md:136`, `grid-export-mismatch`): omit it or caveat it until the lab computes self-consumption.
- **"Bilans systemu":** `pv_w - home_load_w` from `state` (owner decision), so no field is needed; the formula must be explained in the glossary.
- **Needs something new (out of scope):** recommendation tag chips ("Taryfa wyższa po 17:00") have no source (a lab `tags` or `kind` field: contract first, then lab); tariff-window info; a truthful self-consumed PV figure.

## 3. Icons and charts

- `lucide-react` 1.45.0 is installed (`package.json` `^1.14.0`). Exist: Sun, SunMedium, SolarPanel, Home, House, Battery, BatteryCharging, BatteryMedium, Plug, PlugZap, Zap, TowerControl, RadioTower, Cable, Scale, Sparkles, FileText, Receipt, ReceiptText, ArrowRight, LogOut, TrendingUp, TrendingDown, Calendar, CalendarDays. An Astro component can import them; a React component without a `client:` directive ships no JS.
- Earlier decisions forbid a new chart or animation dependency (frosted-aurora plan; `docs/decisions.md:20`).
- **Recommended: a hand-rolled server-rendered `Sparkline.astro` plus a pure `points -> path d` helper in `src/lib/`** (zero JS, zero dependencies, unit-testable; precedent `src/lib/flow-geometry.ts` and the SVG paths in `LiveFlow.tsx`). Handles 12 to 300 points; a 288-point path is about 3 KB. Accessibility: `role="img"` with an `aria-label` summarising min, max and last, or `aria-hidden` with the adjacent value as the text. Static, so nothing to gate for reduced motion.
- Libraries checked with `npm view` (unpacked sizes): uPlot 545 KB (canvas, client only); @observablehq/plot 1.5 MB (needs a DOM for SSR); recharts 7.4 MB (client island); @visx/shape 227 KB (adds a dependency for a 30-line function). Not worth it for tiny series.
- Reuse existing tokens (`--flow-*` at `global.css:44-47`, `--tone-*`), `warsawParts` and `format/values`.

## 4. Risks

- **Reduced motion:** sparklines and the bar are static; any draw-in goes under the existing unconditional override (`global.css:191-196`) and only for fresh, current data (`decisions.md:13,15`).
- **Contrast:** all design accents pass 3:1 for graphics on both card surfaces (solar 10.7, battery 9.0, home 12.5, grid 5.5, primary 7.9 on `#151a29`; grid is lowest). Track and baseline lines in the border colour fail 3:1 (about 1.5): decorative only. Text stays at 4.5:1 and the value next to each sparkline carries the meaning.
- **Palette conflict (owner decided: the design's palette):** the design's solar `#f5c462`, battery `#f5a3c7`, home `#a3e6f5`, grid `#8b919e` differ from `--flow-*`; today `--flow-pv` is `#b5a3f5`, the primary violet, so PV moves to yellow and violet is freed for primary and the bill amount. Touches `FlowNode` and `LiveFlow` colours and the tone legend.
- **Mobile 390 px:** the KPI row needs value plus sparkline in a wrapping layout; the live card already has a `max-[480px]` grid; the sparkline needs `min-w-0` and a fixed height; long Polish labels need checking. The design compresses the diagram to icons, short labels and values (verdict chips stay available in "Odczyty").
- **Hydration:** everything except `LiveFlow` (`client:load`) can be Astro with zero JS; the balance label and value live in `LiveFlow` only because they sit in its SVG geometry and enlarge the island's props.
- **Opaque data panels** (`decisions.md:13`): sparkline containers on opaque `bg-card` or `bg-muted`, no blur behind text.
- **Ordering with PR 65:** it rewrites the same cards' literals and tokens; implementing first would conflict. Owner merges PR 65 first; its manual gates 1.7 to 1.9 are still unchecked.
- **Data honesty:** a single-day series from cumulative counters must not read as a trend; fewer than N points needs an explicit empty state; the bill delta names the reference invoice month; the export series is unreliable (may be flat zero).

## 5. Proposed split (from the research; this change takes 2, 3, 4, 6, 7)

1. Merge PR 65 (theme). Not part of this change.
2. Icons, source legend footer, header logo and "Wyloguj się" copy (S): `lucide-react` icons in card headings, footer legend, no data.
3. `Sparkline.astro` plus pure path helper and tests (S-M).
4. Daily sparklines on the KPI row and "Zużycie wczoraj" from `daily_energy` (M): series added to the KPI and usage views; no query and no contract change; gaps and the unreliable export series handled.
5. Intraday sparklines from retained pushes: later change (migration).
6. Bill delta and days-in-estimate bar (S-M): derived in `bill-forecast.ts` behind the existing invoice-null, lag and other-month paths; delta line and bar in `BillForecastCard.astro`.
7. Balance value on the flow junction (S): formula from `state`, text beside the `Scale` node in `LiveFlow.tsx`, glossary term; watch crowding at 390 px.
8. Recommendation tag chips: later change (lab `tags` field). The "Pokaż szczegóły" button keeps its label and gains only an icon if the design asks.
