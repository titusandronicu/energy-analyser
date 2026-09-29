# Dashboard Refresh: Icons, Sparklines, Bill Delta and System Balance — Plan Brief

> Full plan: `context/changes/dashboard-refresh-icons-sparklines/plan.md`
> Research: `context/changes/dashboard-refresh-icons-sparklines/research.md`
> Owner decisions: `context/changes/dashboard-refresh-icons-sparklines/change.md`

## What & Why

Apply the approved Claude Designer dashboard refresh with no new data: the design's palette (PV moves from violet to yellow), a header logo and "Wyloguj się", heading icons and a source-legend footer, 14-day and 7-day sparklines from rows the page already loads, a bill delta against the last invoice with a days-in-estimate bar, and the "Bilans systemu" value (PV minus home load). After a screenshot pass the owner reversed the earlier decision to keep the old flow squares: the flow diagram is rebuilt like the approved artboards, with small fidelity tweaks. The dashboard already answers "is it good?"; the refresh adds "compared with what?" and "how has it been?" without inventing figures.

## Starting Point

Header is text only, the KPI row and usage tiles show single values, the bill card shows a verdict badge but no delta or period bar, there is no footer, and (Phases 1 to 6, committed) the flow diagram is still four verdict-tinted squares in a 2x2 grid with straight connectors crossing at a small junction, 18 px values and the view controls on their own row. `dashboard.astro` loads 400 days of `daily_energy` once and feeds both the live and usage mappers; `bill-forecast.ts` already compares the estimate with the last invoice for the badge. PR 65 (token cleanup, opaque `Panel`, aurora background) is merged by the owner first; this plan builds on it and does not redo it.

## Desired End State

At 1440px and 390px: the design's palette, a logo header with an icon "Wyloguj się", icons on the recommendation, bill and usage headings, a live badge dot, KPI items and usage rows with sparklines (gaps for missing days, "za mało dni" under three points, "historia niedostępna" when the history load failed, a flat series drawn on the baseline or mid-height with a visible "bez zmian" caption), a bill card that still leads with the range and adds "+43 zł (+20,1%) względem ostatniego rachunku za sierpień 2026" plus "15 z 30" with a bar, the balance with a glossary entry, and a footer legend. The flow diagram looks like the artboards: PV alone on the left, a hub circle with the balance under it, Home, Battery and Grid in one right column, curved dashed connectors with arrowheads that reverse with the physical flow, 26/22 px values with a verdict chip under each, and the Schemat/Odczyty/Wstrzymaj controls in the title row (phone: compressed nodes, chips in the selected-node strip). Every field, state and testid survives; LiveFlow behaviour is unchanged.

## Key Decisions Made

| Decision           | Choice                                                                                                                                                                                                                              | Why (1 sentence)                                                                                             | Source                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Sequencing         | PR 65 merged first; Phase 1 verifies it, never ports it                                                                                                                                                                             | It rewrites the same cards and tokens                                                                        | Owner                        |
| Palette            | The design's values in `:root`, not PR 65's; `--flow-pv` becomes solar yellow; tones on 10% tints                                                                                                                                   | One token source, no hex in components                                                                       | Owner                        |
| Extra tokens       | `--inset #111627`, `--hairline #232b45`, `--border-strong #343e63` from the same artboards                                                                                                                                          | The design uses them in several places                                                                       | Owner (confirmed 2026-09-29) |
| Chart approach     | Hand-rolled server-rendered `Sparkline.astro` plus a pure path helper; no dependency                                                                                                                                                | Tiny series, zero JS, unit-testable, earlier decisions forbid chart libraries                                | Research                     |
| Series windows     | KPI: previous 14 complete days (today never plotted); usage: 7 days ending on the compared day, labelled "7 dni do <dayLabel>"                                                                                                      | Today's row is a cumulative partial; the last usage point must equal the value beside it                     | Owner (confirmed 2026-09-29) |
| Gaps and minimum   | Null or missing day is a gap, never 0; under `MIN_SPARKLINE_POINTS = 3` an explicit "za mało dni"                                                                                                                                   | No fake trends from thin history                                                                             | Plan / Research              |
| Export sparkline   | Drawn as scoped (owner: keep it); an all-zero series sits on the baseline with the text "bez zmian, 0,0 kWh"; "Z PV wykorzystane" omitted                                                                                           | The inverter's export counter under-reads (94.7 vs PGE 342 kWh); a flat-zero line must not look like a trend | Owner / Plan                 |
| Bill delta         | Whole-złoty amount against the invoice the verdict uses, names the invoice month, one decimal whenever the whole percent is 20 (shared `edgePercentLabel` with the usage card), tone from the verdict                               | The sample is +20,06% and 240,6 against 200 is +20,3%; neither may print "+20%" beside a problem badge       | Plan                         |
| Delta withheld     | No invoice, another month, or unreadable invoice period: no delta line                                                                                                                                                              | Never a comparison that means something else; never `diff_pct`                                               | Plan / Research              |
| Days bar           | Share of the forecast month's days in the estimate; withheld if inconsistent                                                                                                                                                        | Answers "how much of the month is behind this figure"                                                        | Owner / Plan                 |
| Balance            | `pv_w − home_load_w` from `state`, 50 W floor; label and value under the hub (Phase 7; Phase 6 had them beside the junction)                                                                                                        | In the new layout no connector runs under the hub; stale dimming `opacity-70` (about 4.6:1), owner-open      | Owner / Plan                 |
| Layout             | Bill card joins the usage card in the right column (Phase 2, with the body extraction); phone order live, recommendation, bill, usage                                                                                               | As on the approved artboards; supersedes the usage-alone entry                                               | Owner (confirmed 2026-09-29) |
| Flow diagram       | REBUILT to the artboards (reverses assumption 3, 2026-09-29): flat icon tiles, hub, one right column, S-curved connectors with end chevrons, chips under values, controls in the title row, phone shows tile, short label and value | The owner saw a render and it did not match the design; behaviour stays as it was                            | Owner (2026-09-29)           |
| Geometry and state | `flow-geometry.ts` rewritten (horizontal tangents at the hub); direction, idle, stale and paused rules extracted to a tested `flow-connector-state.ts`                                                                              | The rules were untested inside JSX; reversal and gating are now guarded without a component runner           | Plan                         |
| Badge wording      | Keep "Dobrze · aktualne" and add the dot                                                                                                                                                                                            | No mapper or smoke churn                                                                                     | Owner (confirmed 2026-09-29) |
| Screenshot gate    | Untracked fixture dev page from Phase 1 (per-scenario clock and rebase helper, `?scenario=` filter), deleted in Phase 8; ALL screenshots re-shot after Phase 7                                                                      | Every gate has fresh data without Docker, one scenario per shot (recommendation-card-refresh precedent)      | Plan                         |
| Docs               | `docs/logic.md` plus six dated 2026-09-29 decisions (the sixth records the reversal and the rebuilt diagram); prerequisites and architecture unchanged                                                                              | Lessons: docs in step                                                                                        | Owner / Lessons              |

## Scope

**In scope:** palette and tone-token consumers, header, heading icons, status dot, footer legend, Sparkline helper and component, daily series in the live and usage views, KPI and usage sparklines, bill delta and days bar, balance and glossary, the flow diagram rebuild and the small fidelity tweaks, screenshots, docs, dev-page cleanup.

**Out of scope:** intraday sparklines, recommendation tag chips and lab `tags`, "Z PV wykorzystane", any migration, contract, lab or dependency change, LiveFlow behaviour changes (only layout and look change), any mapper or contract change for the diagram, the login page, sparkline animation.

## Architecture / Approach

Pure helpers decide everything with a rule: `sparkline.ts` (path geometry and label), `daily-series.ts` (calendar-indexed series), the bill mapper (delta, days), the live mapper (balance), `flow-geometry.ts` (S-curve connectors) and `flow-connector-state.ts` (direction, idle, stale, paused). Astro components are dumb; `DashboardBody.astro` holds the page composition so the temporary dev page and `/dashboard` cannot drift. No new query: the rows the page loads once feed everything.

## Phases at a Glance

| Phase                                   | What it delivers                                                                                                           | Key risk                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Palette and dev page (M)             | Design tokens, tone consumers fixed, untracked scenario dev page, design saved                                             | PR 65 not merged; solar yellow equals watch amber            |
| 2. Header, headings, legend, layout (M) | Logo header, "Wyloguj się", heading icons, dot, footer legend, `DashboardBody` with the bill card in the right column      | Icon-only phone button, 390px node width after the inset     |
| 3. Sparkline helper and component (S)   | Pure geometry with exact tests, zero-JS SVG, empty, unavailable and flat variants                                          | Near-flat series exaggerate; stroke scaling                  |
| 4. Series and KPI/usage sparklines (M)  | Series in the live and usage views, KPI row and usage rows                                                                 | Today's partial must not be plotted; whole-object tests      |
| 5. Bill delta and days bar (M)          | Delta line, days bar, verdict-tone reuse, shared edge-percent helper                                                       | Edge rounding in the 19,5 to 20,5% band                      |
| 6. System balance (S)                   | Balance in the mapper, junction label and value, readings tile, glossary                                                   | Legibility at 390px without crossing connectors              |
| 7. Flow diagram rebuild (L)             | Artboard layout, hub, curved connectors, node tiles, title-row controls, phone compression, 30/22 px and disclosure tweaks | Phone width, direction reversal, contrast, keeping behaviour |
| 8. Screenshots, docs, cleanup (M)       | ALL screenshots re-shot, first-pass tweaks committed, docs and decisions incl. the reversal, dev page deleted, CI green    | Docs drift; screenshot defects found late                    |

**Prerequisites:** PR 65 merged (Phase 1 checks); `npm run dev` with Supabase unset for the dev page; the artboards at the session scratchpad path (copied into the change folder in Phase 1); Docker and `npm run smoke` stay in CI. **Estimated effort:** about 9 sessions across 8 phases (Phases 1 to 6 done; Phase 7 about 2 sessions).

## Open Risks & Assumptions

- Assumptions 1, 2, 4 and 5 were confirmed on 2026-09-29; 3 (keep the tinted squares) was reversed by the owner after seeing a render. Still assumptions: 6 (no icon on the live heading) and 7 to 17 for Phase 7 (plan, Implementation Approach). OWNER-OPEN, defaults applied: 7 stale balance at `opacity-70` (about 4.6:1) instead of 45 (2.6:1), and 8 the balance stacked under the hub on the phone (the mobile artboard splits label above and value below).
- Phase 7 risks: 390 px (and 360 px) width for three nodes plus hub, curved connectors that must reverse and follow resizes, the verdict staying visible when the phone drops chips (corner glyph, strip, "Odczyty"), and no component test runner (contracts in JSX are guarded by unchanged files, greps and manual gates; direction and gating by new pure tests).
- Solar yellow and the watch tone share a hex, reversing the earlier "source colours away from tone colours" decision; word and icon carry status, and the decision entry says so.
- Sparklines scale min to max per series, so a nearly flat series looks lively; the label carries min, max and last value and no trend is claimed.
- The sold sparkline rests on the inverter export counter that under-reads; when it is flat at zero it is drawn on the baseline with the text "bez zmian, 0,0 kWh".
- After the inset panel each node column at 390px is about 119px wide (from the classes, not a render); Phase 2 sets `p-2 sm:p-4` and checks node text with the `worse` and `battery-low` fixtures.
- History starts about 2026-07-16, so 14-day series exist today but any missing day shows as a gap.
- PR 65 was cut from an older `main`; the merged tree, not its description, is the baseline.

## Success Criteria (Summary)

- The owner sees production, purchase, sales and home consumption trends and an invoice-relative bill change without inventing data; every gap and missing invoice is shown honestly.
- Every existing field, state and testid survives; smoke strings still render and "Nieaktualna"/"Dane nieaktualne" never appear in new copy.
- The flow diagram matches the artboards region by region at 1440px and 390px, remaining differences listed; states pass screenshots at 1440px and 390px with no overflow, contrast meets the plan's table, docs match the code, and CI `ci` and `smoke` are green on the draft PR.

## Rollback

No schema, contract or lab change and nothing written: revert the phase commits (or the PR). The dev page was never committed, so there is nothing to clean up in history.
