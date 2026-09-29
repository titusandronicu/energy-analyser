# Dashboard Refresh: Icons, Sparklines, Bill Delta and System Balance Implementation Plan

## Overview

Apply the approved Claude Designer dashboard refresh (canvas "Energy Analyser dashboard refresh", desktop 1440 and mobile 390 artboards) to `/dashboard` without any new data: the design's palette (PV moves from violet to solar yellow), a header logo tile and "Wyloguj się", lucide icons on card headings and a source-legend footer, a server-rendered `Sparkline` (14-day series on the three KPI items of the live card, 7-day series on "Zużycie wczoraj") built from the `daily_energy` rows the page already loads once, a bill delta line against the last invoice plus a "Policzone z pełnych dni X z Y" bar, and the "Bilans systemu" value (PV minus home load) on the flow junction. Every value in the app comes from real data; the design's sample numbers are illustrative. After a screenshot pass the owner saw that the rendered flow diagram does not look like the approved artboards and reversed the earlier scope decision (2026-09-29, assumption 3): the diagram is rebuilt to the design (PV alone on the left, a hub circle carrying the scale icon and the balance, Home, Battery and Grid in one column on the right, curved dashed connectors with arrowheads, big values, a verdict chip under each value), together with small fidelity tweaks (bill range 30 px in the primary colour, recommendation heading 22 px, a primary-tinted "Pokaż szczegóły", the Schemat/Odczyty/Wstrzymaj controls in the title row). Delivered in eight phases: palette and dev page (M), header, headings, legend and the bill card's move into the right column (M), Sparkline helper and component (S), daily series and KPI/usage sparklines (M), bill delta and bar (M), balance on the junction (S), flow diagram rebuild to the design (L), then screenshots, docs and cleanup (M). Phases 1 to 6 are committed; Phase 7 and Phase 8 (formerly Phase 7) are the amendment.

## Prerequisite: PR 65 is merged before implementation

PR 65 (`cursor/frosted-aurora-dashboard-8dba`, plan `context/changes/frosted-aurora-dashboard/plan.md`) is merged by the owner BEFORE this change is implemented; this plan is written against `main` plus PR 65 and does not redo its work (`origin/main` is `4e7b49c`, which is `e2d176b` plus the docs-only PR 66, so no source line below moved). It rewrites (checked with `git diff` from its merge base `630aeb1`): `src/styles/global.css` (dark palette in `:root`, `bg-aurora` utility, richer `glass-surface`), `src/pages/dashboard.astro` (shell `bg-aurora`, header token classes), `src/components/ui/Panel.astro` (`shadow-2xl`), `src/components/LiveStateCard.astro`, `BillForecastCard.astro`, `UsageInsightCard.astro` and `TermsExplained.astro` (every `text-blue-100*` / `bg-white/5` literal becomes a role token), `src/lib/format/tone-classes.ts` (the neutral tone), plus `docs/decisions.md` and its own change folder. **Phase 1 starts by checking the merge (criterion 1.1); if PR 65 is not on the branch base, stop and tell the owner, do not port its changes.** PR 65 was cut from an older `main` (`630aeb1`), so verify the merged tree, not the PR description. Line numbers below were read at `e2d176b` (unchanged in `4e7b49c`); in the four cards and `dashboard.astro` they shift after the merge, so the implementer relocates by symbol.

## Current State Analysis

All cites re-verified against the tree at `e2d176b` (source identical at `4e7b49c`); those taken only from `research.md` are marked (research).

- **Header and shell.** `src/pages/dashboard.astro:78-88` is a glass header with the text "Energy Analyser", the e-mail (`hidden sm:inline`) and a ghost `Wyloguj` button inside `<form method="POST" action="/api/auth/signout">`; no logo. Layout `dashboard.astro:90-99`: live card, bill card (full width), then `lg:grid-cols-3` with the recommendation (`lg:col-span-2`) and the usage card alone on the right. There is no footer.
- **Daily rows are loaded once.** `dashboard.astro:40-43` builds `dailyRowsPromise` (`loadDailyEnergy`, `usage-insight.ts:55-65`: 400 days, newest first, columns `day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh`); it already feeds `toLiveStateView(..., await dailyRowsPromise, ...)` (`:58`) and `toUsageInsightView` (`:66`). The only two `from("daily_energy")` calls are `usage-insight.ts:58` and `live-state.ts:121` (`captured_at` of today's row). `null` rows means the load failed; `[]` means no history. The contract makes every daily total `nonnegative().nullable()` (`contract.ts:12`); the lab sends incomplete days with empty totals (`docs/logic.md:112`), so a gap is a null or a missing row. History starts about 2026-07-16 (research), so a 14-day series exists today.
- **Live card.** `LiveStateCard.astro:20-23` heading + `StatusBadge` (no dot, no icon); `:38-49` the `LiveFlow` island (`client:load`); `:51-69` the KPI `<dl>` "Z paneli dziś" / "Kupione z sieci dziś" / "Sprzedane do sieci dziś" (values only); `:73` `TermsExplained` with six terms. `LiveFlow.tsx:262` is the 2x2 grid (`minmax(0,1fr) 92px minmax(0,1fr)`, 40px at 480px and below, `gap-y-9`), `:277-283` the 34px junction (`Scale`, `aria-hidden`, `data-flow-junction`, no text), `:149-154` and `:303-307` the in-diagram tone legend (four `VerdictChip`s), `:299` the details line that says " · dane nieaktualne" only when stale (lower case, so it can never match the smoke string). The grid node uses `Zap` (`:124`). `FlowNode.tsx:18-21` hues from `bg-flow-*/20 text-flow-*`, `:24-28` rated tint `bg-tone-*-surface/60` with a 2px tone border.
- **Mapper.** `toLiveStateView` (`live-state.ts:334-406`) already has raw `pvWatts` and `homeLoadWatts` (`:358-359`), `flow()` (`:137-141`, below `MIN_FLOW_W` = 50 W counts as noise, no direction), the capture's Warsaw clock `capturedClock` (`:346-351`) and `history`/`historyFailed` (`:352-353`). The view has no series and no balance.
- **Usage.** `selectBaseline` (`usage-insight.ts:210-271`) skips today (`:217`) and picks the compared day within 7 days (`:221-232`); `toUsageInsightView` (`:288-318`) builds `load`, `purchase` (`{kwhLabel, deltaLabel}`, asserted with `toEqual` in tests, so series must not go inside `purchase`), `baseline`, `meaning`. `UsageInsightCard.astro:45-56` renders two tiles with delta text under each value. "Z PV wykorzystane" does not exist.
- **Bill.** `toBillForecastView` (`bill-forecast.ts:238-414`): refusal order at `:243-369` (unknown status, `generated_at` missing/future/stale, `no_data`, plausibility, sign guards, fewer than `MIN_COMPLETE_DAYS` = 7 days), then `invoice` from `closed_month_check.invoice_gross_pln` (`:372-374`), `isOtherMonth` (`:378`), `verdictStatus(central, invoice)` (`:208-224`, whole-złoty comparison, `BILL_AMBER_RATIO` 1.2, milder status on a line), `dayLabelOf` (`:228-234`), and the returned object (`:383-413`). The contract has the invoice optional and non-negative (`contract.ts:130-140`); `diff_pct` is the check's own arithmetic drift, not a period delta. `BillForecastCard.astro:70-82` shows the range as the headline and the central estimate beneath; `:84-97` a `dl` with days label and confidence badge; `:99-108` "Na podstawie".
- **Tokens.** `global.css:44-53` `--flow-pv: #b5a3f5` (the primary violet), `--flow-home #7cc4f5`, `--flow-battery #e9a3d3`, `--flow-grid #9aa7c7`, `--tone-good/watch/problem` `#6ee7b7/#fcd34d/#fca5a5` on dark `-surface` tokens `#064e3b/#78350f/#7f1d1d`, published at `:127-136`. Consumers found with `command grep` (src only): `LiveFlow.tsx:58-61` (`text-flow-*`), `FlowNode.tsx:18-21,25-27`, `tone-classes.ts:6-8` (`/60` on the surfaces), the `bg-aurora` utility from PR 65 (`--color-flow-home` blob), and `Banner.astro` and `bg-cosmic` (login pages) with their own hex values, which stay. No hard-coded copy of the old PV colour exists outside the tokens.
- **Smoke.** `scripts/smoke.mjs:96,101,107,114` asserts the fresh advice marker and no "Nieaktualna"; "Stan na żywo", "3,1 kW" and no "Dane nieaktualne"; "Zużycie wczoraj"; "Prognoza rachunku", "od 155 zł do 360 zł", "ok. 258 zł". It runs in CI only.
- **Dev page feasibility.** `src/middleware.ts:5` limits `PROTECTED_ROUTES` to `/dashboard`; `createClient` returns null when `SUPABASE_URL`/`SUPABASE_ANON_KEY` are unset (`supabase.ts:32-34`), and both are optional in `astro.config.mjs:23-24`, so `/dev/...` renders without the local stack (unset the two variables for `npm run dev`).
- **Icons.** `lucide-react` 1.45.0 exports `ChartLine`, `LogOut`, `Sparkles`, `FileText`, `House`, `Sun`, `BatteryMedium`, `TowerControl`, `Cloud`, `Scale`, `Upload`, `TrendingUp`, `TrendingDown`, `Minus` (checked with node). A React component with no `client:` directive renders as static HTML in an `.astro` file.
- **Contrast (computed for this plan with the WCAG formula).** On card `#151a29` / inner surface `#1b2236`: solar 10.69 / 9.75, battery 9.03 / 8.24, home 12.54 / 11.44, grid 5.48 / 5.00, primary 7.86 / 7.17; text 15.35 / 14.00; muted `#a9b1c6` 8.08 / 7.37; chip text on its 10% tint over the card: good 9.31, watch 8.70, problem 7.20, neutral 8.49 (over the inner surface at least 6.51). Border `#2a3350` and the hairline `#232b45` against the card are 1.39 and 1.24: decorative only, the value beside each graphic carries the meaning.

## Desired End State

On `/dashboard` (1440 and 390 px, no overflow): the design's palette everywhere, PV yellow; a header with a logo tile, the e-mail and "Wyloguj się" with an icon (icon-only, 44 px, with an accessible name on the phone); heading icons on the recommendation, bill and usage cards; a live-card badge with a status dot; a KPI row of three items each with an icon, the existing value and a 14-day sparkline of the previous 14 complete days; "Zużycie wczoraj" rows for home consumption and grid purchase each with a 7-day sparkline and the existing delta text; a bill card that still leads with the range and now shows "+43 zł (+20,1%) względem ostatniego rachunku za sierpień 2026" (or "bez zmian…", or nothing when there is no honest comparison) and a "Policzone z pełnych dni 15 z 30" bar; the flow diagram rebuilt like the artboards (PV left, a hub circle with the scale icon and, under it, the words "Bilans systemu" and the signed kW value with a glossary entry, Home, Battery and Grid in one right column with 26/22 px values and a verdict chip each, curved dashed connectors with arrowheads that follow the physical direction, the Schemat/Odczyty/Wstrzymaj controls in the title row), a bill range at 30 px in the primary colour, a 22 px recommendation heading and a primary-tinted "Pokaż szczegóły"; and a footer legend (three tone dots, four source icons). Every existing field, state, branch and `data-testid` survives, the four smoke strings still render, "Nieaktualna" and "Dane nieaktualne" appear nowhere in new copy, and LiveFlow's behaviour (pause, freshness-gated motion, selected-node strip, "Odczyty" view) is unchanged.

Verify with the automated checks per phase, a temporary fixture dev page rendered at both widths, and the CI `ci` and `smoke` jobs on a draft PR.

### Key Discoveries:

- Series need no query: the page already loads 400 days once; `toLiveStateView` and `toUsageInsightView` already receive the rows (`dashboard.astro:40,58,66`).
- Today's `daily_energy` row is a partial, replaced by each push (`docs/logic.md:111`). A cumulative counter must not read as a trend, so the KPI series end at the day before the capture day and the usage series at the compared day (which equals the value shown beside it).
- `purchase` and `load` in the usage view and `today` in the live view are asserted with `toEqual`/`toMatchObject`; adding a separate top-level `series` field keeps those assertions and only the two whole-object tests (`live-state.test.ts:50`, `usage-insight.test.ts:35`) and the bill `toEqual` at `bill-forecast.test.ts:146` gain fields.
- The design's own sample bill (central 257.73 against invoice 214.66, the committed fixture) is +43 zł and +20.06%, which sits on the +20% verdict line and is a problem, so the delta line must print "+20,1%", not the design's "+20%": the same one-decimal-at-a-line rule `deltaLabel` uses (its edge branch, `usage-insight.ts:168-195`) and `docs/logic.md:49` describes. The band is wider than the sample: 240.6 against 200 is +20,3% and a problem, and a whole percent would print "+20%" beside a "ponad 20%" badge. The rule therefore lives in one shared, tested helper (`edgePercentLabel`, extracted from `deltaLabel`) that the usage card and the bill card both call, not in a second copy.
- The design's solar yellow and watch amber are the same hex (`#f5c462`). Colour is never the only signal (chips carry a word and an icon), but it reverses the 2026-09-29 decision to keep source colours away from the tone colours (`docs/decisions.md`, live-flow entries); the new decision entry says so.
- (Phase 6 finding, superseded by Phase 7.) In the 2x2 flow grid the four connectors approached the junction from the four diagonals, so the balance text sat left and right of the circle inside the row gap. Phase 7 replaces the 2x2 arrangement: in the design the connectors leave the hub horizontally (one from the left, three from the right), so the balance label and value sit under the hub, where no connector runs (arithmetic in Phase 7 step 4).
- The Phase 6 screenshot pass (`screenshots/README.md`, measurement 5) listed the visible differences left alone: recommendation heading 20 px, controls on their own row at 32 px, verdict-tinted 2x2 squares with 18 px values in a 720 px stage, bill range 24 px in the text colour, a neutral "Pokaż szczegóły", legend and timestamp lines under the diagram. Phase 7 removes the first five; the sixth is a remaining difference (Phase 7 criterion 7.33).

## What We're NOT Doing

- No intraday sparklines (would need a `security_invoker` view over retained pushes and a revisit of `docs/decisions.md:20`), no recommendation tag chips or lab `tags` field (chips stay the lab's severity chips), no migration, no ingest contract change, no lab change, no new dependency (chart, icon or animation).
- No "Z PV wykorzystane" row. **Omitted, not shown as "—":** it would be `pv_kwh − grid_export_kwh`, and the inverter's export counter is known to under-read (94.7 kWh against PGE's 342 for August, `docs/logic.md:123,136`, `context/changes/grid-export-mismatch/`); a figure built on it would overstate self-consumption. Revisit when the lab computes self-consumption. Recorded in `docs/decisions.md`.
- The "Sprzedane do sieci dziś" 14-day sparkline uses the same inverter counter as the value beside it (which already shows it as "Sprzedane do sieci dziś"). It is drawn as scoped (the owner decided to keep it), it inherits the counter's under-reading, and makes no trend claim; `docs/logic.md` says so. Because a flat-zero series is the likeliest outcome of an under-reading counter, a flat series never looks like a mid-scale trend: an all-zero series is drawn on the baseline with the visible text "bez zmian, 0,0 kWh", and an all-equal non-zero series is drawn at mid-height with the visible text of its value ("bez zmian, 3,0 kWh").
- No trend words, arrows or percentages on sparklines: the label states min, max and the last available value only.
- No redesign of LiveFlow BEHAVIOUR: pause, motion gating (fresh nonzero flows of at least 50 W in a snapshot at most 15 minutes old, unless paused), reduced motion, `usePreference`, `useFlowLines`, the direction rules (grid import and battery discharge feed the hub, PV never reverses, the hub always feeds the home), the selected-node strip, the "Odczyty" view, the verdict rules and colours and the keyboard and `aria` contract stay. Only layout and look change, in Phase 7: the artboards' one-left/three-right arrangement, flat icon tiles, curved connectors (`flow-geometry.ts` is rewritten for the new arrangement, its contract of pure, tested functions kept), controls in the title row. Assumption 3 (keep the 2x2 tinted squares) is reversed by the owner decision below.
- No new data, contract, mapper or dependency change for the diagram: `live-state.ts` keeps its view model (the node view models, `flows`, `verdicts`, `balance` are read as they are); the grid's neutral "Bez oceny" chip is a constant in the component, not a mapper field.
- No rewrite of the bill card's data rules: the range stays the headline; refusal paths, plausibility guards and the verdict are untouched. No use of `closed_month_check.diff_pct` as a delta.
- No login-page restyle (`bg-cosmic` and `Banner.astro` keep their own colours), no light theme, no redoing PR 65's work.
- No sparkline animation of any kind (no draw-in), so there is nothing to gate for reduced motion; the existing `prefers-reduced-motion` rule stays as it is.

## Implementation Approach

House pattern: pure, unit-tested helpers and mappers in `src/lib/` and `src/lib/services/` decide everything that has a rule (path geometry, series windows, delta text, balance sign); Astro components stay dumb; the only React island stays `LiveFlow`. Stage the work so each phase ships on its own: tokens first (every later screenshot then shows the final palette), chrome (header, headings, legend), the pure Sparkline, the series wiring, the bill, the balance, then the evidence and docs.

**Temporary dev page (recommendation-card-refresh and live-flow-interaction precedent, and the lesson that fixtures must arrive before the card that needs them).** Phase 1 creates `src/pages/dev/dashboard-refresh.astro`, UNTRACKED and never staged: it renders the dashboard body (from Phase 2 on the extracted `DashboardBody.astro`) for one scenario per load (`?scenario=<name>`) through the real mappers, with a per-scenario clock and a rebase helper that makes the fixtures' timestamps fit that clock, from `scripts/fixtures/{live-flow,bill-forecast,recommendation}/*.json` and `docs/ingest/example-v1.json`, so every phase's manual gate has data without Docker or a Supabase session. Commit with explicit paths, check `git status` before each commit (never `git add -A`), delete the page in Phase 8. Screenshots come from it via the Browser pane at 1440 and 390 px.

Branch: `feat/dashboard-refresh-icons-sparklines` from `main` after PR 65 is merged, opened as a DRAFT PR until the last phase is complete. In the `git diff` checks `origin/main` means the branch base; if `main` moves during the work, compare with `git merge-base HEAD origin/main` instead. Manual gates are collected into one deduplicated end-of-run list when the plan is implemented (owner preference); the per-phase lists below are what to include.

### Assumptions (1, 2, 4 and 5 confirmed by the owner at plan review on 2026-09-29; 3 was reversed by the owner on 2026-09-29 after the first screenshot pass; 6 and 7 to 17 are assumptions, the ones marked OWNER-OPEN need a yes or a change; each is marked where used)

1. **Status badge wording (confirmed by the owner, 2026-09-29).** The live badge keeps `statusText` ("Dobrze · aktualne", same for all four tones) and gains the design's dot; the design's literal "Dane aktualne" is not adopted. Zero mapper and test churn, one vocabulary on all cards.
2. **Bill card joins the right column (confirmed by the owner, 2026-09-29).** As on the approved artboards the dashboard becomes live card, then recommendation (2/3) beside a right column of bill card over usage card (1/3), then the footer; on phones the order becomes live, recommendation, bill, usage (as `Mobile.dc.html`). This supersedes the 2026-09-29 decision that kept the usage card alone on the right. The move ships in Phase 2 together with the `DashboardBody` extraction.
3. **FlowNode look (REVERSED by the owner, 2026-09-29, after seeing a render).** The earlier decision to keep the verdict-tinted 2x2 squares was taken before any render and is replaced: the flow diagram is rebuilt like the artboards (flat icon tiles, PV left, hub with the scale icon in the middle, Home, Battery and Grid in one right column, curved dashed connectors with arrowheads, node values 26 px for PV and 22 px for the others, a verdict chip under each value, "Bilans systemu" and its value under the hub, the Schemat/Odczyty segmented control and "Wstrzymaj ruch" in the title row at 36 and 44 px), with the fidelity tweaks: bill range headline 30 px in `text-primary`, recommendation heading 22 px, "Pokaż szczegóły" with a primary-tinted outline. Delivered in Phase 7; LiveFlow behaviour is unchanged.
4. **Today is not plotted (confirmed by the owner, 2026-09-29).** KPI series show the previous 14 complete days and the footnote says so ("wykresy: poprzednie 14 dni, bez dzisiejszego"); the KPI value stays today's partial.
5. **Three design colours outside the owner's palette list (confirmed by the owner, 2026-09-29)** become tokens as the same source: `#111627` (diagram stage and KPI row, `--inset`), `#232b45` (dividers and bar track, `--hairline`) and `#343e63` (control and logo borders, `--border-strong`); the artboards' remaining one-off shades (`#1d2340`, `#2a2650`, `#5b4f96`, `#cfc4f8`, `#dfe4f3`) map to the nearest existing token instead of new tokens.
6. **Heading icons (still an assumption).** The live card heading has no icon (the artboards have none; it carries the status dot); the other three cards get theirs.

The assumptions below belong to Phase 7 (the flow diagram rebuild). Each carries the recommendation the plan applies; none was put to the owner yet.

7. **Stale balance contrast (OWNER-OPEN, default applied).** On a stale snapshot the "Bilans systemu" label and value are dimmed with `opacity-70` (about 4.6:1 on the stage, computed), not the `opacity-45` of Phase 6 (2.6:1, measured in the first screenshot pass). The connectors keep `opacity-45` (graphics, the arrowhead and the badge carry the meaning). Recommendation: 70. Tradeoff: a stale balance looks less faded, so staleness rests on the badge, the notice above the card, the static dimmed connectors and the missing verdicts. Alternative: keep 45 and accept a text contrast under 4.5:1 on a deliberately de-emphasised value.
8. **Balance label and value sit under the hub at both widths (OWNER-OPEN).** The desktop artboard puts both under the circle; the mobile artboard puts the label above and the value below. Recommendation: one stacked block under the hub at both widths (one element, one reading order, no connector runs there). Tradeoff: a small difference from `Mobile.dc.html`.
9. **Grid shows a neutral "Bez oceny" chip.** As in the artboards. It is a constant in the component (tone `insufficient`), not a mapper field; the docs still say the grid is not rated. Recommendation: as designed.
10. **What the phone drops.** Below `sm` (640 px) the node shows only the icon tile, a short label ("Panele", "Dom", "Bateria", "Sieć") and the value. Verdict chips, detail lines, direction words and the long labels are dropped visually; they stay in the node's `aria-label` (unchanged), in the selected-node strip (which now carries the chip) and in "Odczyty". To keep the verdict from being colour-only on the phone a 16 px tone glyph (the chip's icon) sits on the tile's corner. Recommendation: as written. Tradeoff: a phone user sees the word only after a tap.
11. **Breakpoint and live-card padding.** The compressed layout applies below `sm` (640 px) instead of the old 480 px, because the full layout needs about 440 px of stage. The live card's `Panel` gets `p-4 sm:p-6` (the artboard's 16 px phone padding) so the stage is about 306 px wide at 390 px; the other cards keep `p-6`. Recommendation: as written.
12. **Tone on the tile.** The icon tile keeps the source hue (10% fill, icon colour) and takes a 1 px tone-tinted border at 55% when the node is rated (`border-tone-good/55` and so on; the artboards use the source colour there); unrated nodes and the grid keep a 1 px source-colour border at 45%. This keeps the owner's earlier ask (quality visible on the node) without a card behind the tile. Recommendation: as written.
13. **Connector drawing.** The chevron arrowhead sits at the end of the path (as in the artboards) and replaces the filled triangle at mid-path; stroke 2 px; the S-curve control points sit at 44% of the horizontal span (the artboards' proportion). The inactive dotted line has no arrowhead, as before.
14. **Title-row controls.** `LiveFlow` renders the title row (heading and badge arrive from Astro as named slots, `heading` and `notices`), with "Schemat / Odczyty" as a segmented control (`bg-muted` track, `border`, 4 px padding, 36 px segments, 38 px on the phone, active segment `bg-primary/15`, the nearest token to the artboard's `#2a2650`) and "Wstrzymaj ruch" 44 px with `border-border-strong`. The icons on these three buttons are dropped (the artboards have none); the accessible names and `aria-pressed` stay. On the phone the visible pause label is "Wstrzymaj" / "Wznów" with the word "ruch" kept for screen readers. Recommendation: as written. Tradeoff: 36 px segments meet the 24 px WCAG minimum but not the 44 px comfort size (owner sizes).
15. **Stage width.** The 720 px cap of the old stage goes; the stage fills the card like the artboard.
16. **Chip text.** The chip carries the verdict word and its detail in one line as in the artboards ("Dobrze · w normie", "Warto sprawdzić · 85,0% oczekiwanego"); a long chip wraps inside its column (rounded box, as `StatusBadge` does).
17. **Fidelity tweaks.** Recommendation heading 22 px semibold (new size value on `CardHeading`), bill range 30 px bold `text-primary`, "Pokaż szczegóły" 44 px with `border-primary/45`, `text-primary` and a transparent fill (the artboard's `#5b4f96` and `#cfc4f8` map to the primary token at reduced alpha and the primary token).

## Phase 1: Palette tokens, tone consumers and the fixture dev page

### Overview

Verify PR 65 is merged, move the design's palette into `:root` (including `--flow-pv` from violet to solar yellow and the tone tokens), fix every consumer of the changed tokens, save the design reference, and create the untracked fixture-driven dev page so every later gate has data.

### Changes Required:

#### 1. Design reference

**File**: `context/changes/dashboard-refresh-icons-sparklines/design/Main.dc.html`, `Mobile.dc.html` (new, committed)

**Intent**: The artboards are the source of truth for looks; keep them next to the plan, as `handoff-adapted.md` is for the flow change.

**Contract**: Copy the two files from `/private/tmp/claude-501/-Users-kamilnowosad-code/b0c70183-f361-4e8e-8ccc-01237059bfbd/scratchpad/energy-design/project/` (session-local; if gone, export them from the canvas https://claude.ai/artifact/L9CP96UZSkxwErmnBPX5K1) unchanged. They reference a missing `support.js` and are read as source, not opened.

#### 2. Palette and new tokens

**File**: `src/styles/global.css`

**Intent**: One source for the design's colours, so cards, chips, arrows and sparklines share it, and no component carries a hex.

**Contract**: In `:root` (the block PR 65 already restyled): `--background #0b1020`, `--foreground #eef1fa`, `--card #151a29`, `--card-foreground #eef1fa`, `--popover #151a29`, `--popover-foreground #eef1fa`, `--muted #1b2236`, `--muted-foreground #a9b1c6`, `--border #2a3350`; `--primary #b5a3f5`, `--primary-foreground`, `--ring`, `--destructive`, `--radius*`, `--chart-*`, `--sidebar-*` and `.dark` unchanged. Flow: `--flow-pv #f5c462`, `--flow-home #a3e6f5`, `--flow-battery #f5a3c7`, `--flow-grid #8b919e`. Tones: `--tone-good #86e8b0`, `--tone-watch #f5c462`, `--tone-problem #ff9b9b`, new `--tone-neutral #c3cadb`; each `--tone-*-surface` is `color-mix(in srgb, var(--tone-x) 10%, var(--card))` (opaque, so no `/60` fade is needed). New: `--inset #111627`, `--hairline #232b45`, `--border-strong #343e63`. Publish `--color-inset`, `--color-hairline`, `--color-border-strong`, `--color-tone-neutral`, `--color-tone-neutral-surface` in `@theme inline` beside the existing `--color-flow-*`/`--color-tone-*`. Replace the header comment of the flow block with the design source (this change's `design/`). Leave `bg-aurora`, `glass-surface`, `bg-cosmic` and the motion rules alone; the aurora reads `--color-flow-home`, so its glow changes hue (checked in 1.14).

#### 3. Consumers of the changed tokens

**File**: `src/lib/format/tone-classes.ts`, `src/components/live/FlowNode.tsx` (and by inheritance `StatusBadge.astro`, `VerdictChip.tsx`, `LiveFlow.tsx`)

**Intent**: The surfaces are already tinted, so the `/60` fade goes; the neutral tone joins the tone tokens.

**Contract**: `TONE_CLASSES` good/watch/problem become `border-tone-x/35 bg-tone-x-surface text-tone-x` (one fade removed, border at the design's 35%), `insufficient` becomes `border-tone-neutral/30 bg-tone-neutral-surface text-tone-neutral` (replacing PR 65's `border-border bg-muted text-muted-foreground`). `FlowNode` `RATED_TINT` drops `/60` from the three surfaces; `ICON_HUE` and `LiveFlow` `LINE_TEXT` keep their class names (the hue changes come from the tokens). The complete consumer list is the `command grep` in Current State Analysis; `Banner.astro` and `bg-cosmic` are intentionally untouched.

#### 4. Fixture dev page (temporary, untracked)

**File**: `src/pages/dev/dashboard-refresh.astro` (never staged, never committed)

**Intent**: Render the four cards through the real mappers per scenario with a pinned clock, no database, no session, so every gate in every phase has data.

**Contract**: Outside `PROTECTED_ROUTES`, no Supabase client. Nothing reads the real clock: every scenario carries its own `now` (Europe/Warsaw) and passes it to the mappers. Bodies are JSON imports of `scripts/fixtures/live-flow/{normal,worse,battery-low,battery-missing}.json`, `scripts/fixtures/bill-forecast/*.json`, `scripts/fixtures/recommendation/current.json` and `docs/ingest/example-v1.json`, plus a small synthetic daily-row generator (full 14+ days, nulls, missing days, 2 days, none). What the fixtures actually carry (read in the tree): `live-flow/*.json` have `captured_at` 2026-09-10 and a `daily_history` ending that day, no `bill_forecast`, no `recommendation`; `bill-forecast/*.json` have `captured_at` and `bill_forecast.generated_at` 2026-09-23T11:55 (`stale-generated-at` 09:30, `lab-shape` 2027), no `daily_history`, no `recommendation`; `recommendation/*.json` have `recommendation.generated_at` and `bill_forecast.generated_at` 2026-09-29T08:00 (`earlier-day` and `older-than-2h` 06:05 and 2026-09-28) plus a `daily_history`; `docs/ingest/example-v1.json` has all three, dated 2026-09-23, with two history days. None of those stamps fits a pinned 2026-09-29 clock (the mapper refuses a forecast older than 30 minutes, `FORECAST_STALE_AFTER_MS`, and the live card goes stale after 15 minutes), so a `rebase(body, scenario)` helper on the page rewrites them relative to the scenario's own `now` before the mappers run: `captured_at` becomes `now` minus `captureAgeMinutes` (default 2), `bill_forecast.generated_at` becomes `now` minus `billAgeMinutes` (default 5), `recommendation.generated_at` becomes `now` minus `recommendationAgeMinutes` (default 30), and `daily_history` days are shifted by whole days so the newest day is the Warsaw day of the rebased `captured_at` (what `--shift-days` does in `scripts/push-fixture.mjs`). The fixtures whose point is staleness (`bill-forecast/stale-generated-at`, `recommendation/older-than-2h`, `recommendation/earlier-day`) keep their own offset from their own `captured_at` instead of the defaults. The daily rows handed to `toLiveStateView` are built from `daily_history`, the row of the capture day carrying `captured_at` equal to the rebased capture time (the home rating needs a row at most 15 minutes older than the snapshot, `DAILY_ROW_MAX_LAG_MS`). The dev page bypasses ingest, so the rewritten bodies need not pass the strict contract. Scenarios (each labelled and carrying `data-scenario`): `fresh-full` (`now` 2026-09-29 16:10, since PV is rated from 15:00; live `normal`, full history, bill = the `bill_forecast` of `docs/ingest/example-v1.json`, central 257.73 against invoice 214.66, +43 zł and +20,1%, a problem, recommendation `current`), `gaps` (16:10, nulls and missing days, bill `verdict-equal-to-invoice`, live `worse`), `few-days` (16:10, 2 days of history, bill `no-closed-month-check`, live `battery-low`), `stale-and-lag` (`now` 16:50 with `captureAgeMinutes: 40`, live `normal`, bill with `reference_lag_months: 1` and a July settlement, `verdict-at-plus-20-pct`), `other-month-and-refusals` (`now` 2026-10-03 10:00, so the September body is another month; live empty, usage failed). One scenario per load: `/dev/dashboard-refresh?scenario=<name>` renders only that scenario's body (no query lists the names as links), so each screenshot captures one scenario; two optional overrides on any scenario, `&bill=<fixture name>` swaps the bill body (for example `&bill=six-complete-days`, `&bill=no-data-rates-unavailable`, `&bill=stale-generated-at`, `&bill=verdict-above-plus-20-pct`, which is 260 against 200, +30%) and `&history=failed|empty` passes `null` or `[]` daily rows. From Phase 2 it renders `DashboardBody`; in Phase 1 it renders the four existing cards in the current order. The first step is to open it with `SUPABASE_URL` and `SUPABASE_ANON_KEY` unset and confirm the middleware neither hangs nor throws; do not change the middleware or any product code.

### Success Criteria:

#### Automated Verification:

- PR 65 is merged on the branch base and its own acceptance check passes: `git grep -nE "text-white|border-white|bg-white/|text-blue-100" -- src/components/LiveStateCard.astro src/components/BillForecastCard.astro src/components/UsageInsightCard.astro src/components/TermsExplained.astro src/pages/dashboard.astro` prints nothing and `git grep -n "bg-aurora" -- src/pages/dashboard.astro` prints one line
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- No pre-move palette value remains: `git grep -nE "#7cc4f5|#e9a3d3|#9aa7c7|#6ee7b7|#fcd34d|#fca5a5|#064e3b|#78350f|#7f1d1d|#101218|#1c1f29|#08111f|#111827|#18223a|#b8c4d9|#27344f" -- src ':!src/components/Banner.astro'` prints nothing
- The tone surfaces no longer carry the old fade: `git grep -n "surface/60" -- src` prints nothing
- The design reference is saved: `test -f context/changes/dashboard-refresh-icons-sparklines/design/Main.dc.html && test -f context/changes/dashboard-refresh-icons-sparklines/design/Mobile.dc.html`
- The dev page is not tracked: `git ls-files src/pages/dev` prints nothing

#### Manual Verification:

- The dev page renders with Supabase unset (no hang, redirect or middleware error) and without any change to the middleware or other product code
- At 1440px and 390px the dev page's cards show the design palette (page background, card, inner surface, border, text, muted) with no clipped text
- The PV node icon, connector and legend chip read yellow, primary violet stays on primary accents (focus ring, selected node), and a PV node rated "watch" (fixture `worse`) is still told apart from PV's yellow by its chip word and icon
- Contrast measured on the rendered page meets the plan's table: tone chip text at least 4.5:1 on its tint over the card and over the inner surface, muted text at least 4.5:1 on card, inner surface and inset, accents at least 3:1
- The aurora background and the header glass still read well with the new `--background` and `--flow-home` hue
- Each dev-page scenario runs on its own clock and shows one body per load: `?scenario=fresh-full` renders a fresh live card, a bill that is not refused ("ok. 258 zł") and a current recommendation; `?scenario=stale-and-lag` a stale live card next to a fresh bill; `?scenario=other-month-and-refusals` an other-month bill; `&bill=<fixture>` swaps the bill body and `&history=failed` and `&history=empty` change the history

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the matching checkboxes live in `## Progress`. The dev page stays untracked; do not stage or commit it.

---

## Phase 2: Header, headings, status dot and footer legend

### Overview

Note (owner decision 2026-09-29): the 2x2 grid inside the inset panel described in step 3 is replaced by Phase 7; the inset panel, the footer legend and the `TowerControl` icon stay.

Add the header logo tile and "Wyloguj się", lucide icons on card headings, the live badge dot and the footer legend, extract the page body into a component so the dev page renders exactly what `/dashboard` renders, and move the bill card into the right column in that extraction (assumption 2). No data change.

### Changes Required:

#### 1. Header component

**File**: `src/components/DashboardHeader.astro` (new); `src/pages/dashboard.astro`

**Intent**: The design's header (logo tile, name, e-mail, "Wyloguj się") with the field-preserving contract from PR 65 kept: e-mail and the POST sign-out form.

**Contract**: Props `email: string | undefined`. Logo tile 40 px (36 on phone) `bg-muted` with `border-border-strong`, `ChartLine` in `text-primary`; "Energy Analyser" 20px/17px semibold. The form keeps `method="POST" action="/api/auth/signout"`; the button is `cn(buttonVariants({ variant: "outline" }), "h-11 ...")` (44 px, `cn()` so the size wins over the cva `h-9`), label "Wyloguj się" with `LogOut`; below `sm` the label is `sr-only` and the button is 44 x 44 with an accessible name. Icons are imported from `lucide-react` and rendered without a `client:` directive. Radius `rounded-2xl`, min height 64/72 px. The e-mail stays `hidden sm:inline`.

#### 2. Card heading and status dot

**File**: `src/components/CardHeading.astro` (new), `src/components/StatusBadge.astro`, `LiveStateCard.astro`, `RecommendationCard.astro`, `BillForecastCard.astro`, `UsageInsightCard.astro`

**Intent**: One heading pattern with the design's sizes and icons; the live badge gets its dot.

**Contract**: `CardHeading` props `title`, optional `icon: LucideIcon`, `iconClass`, `size: "lg" | "md"` (live 22/28 px, recommendation 20/22 px, bill and usage 20 px, semibold/bold as in the artboards); it renders the icon `aria-hidden`. Icons: recommendation `Sparkles` `text-primary`, bill `FileText` `text-primary`, usage `House` `text-flow-home`; the live heading has none. `StatusBadge` gains an optional `dot` prop (a `size-2 rounded-full bg-current` `aria-hidden` span before the text); only `LiveStateCard` passes it, and that card lays the heading and badge on one row (`flex flex-wrap items-center gap-x-4`). `statusText`, `data-tone` and every `data-testid`/`testId` stay unchanged (assumption 1).

#### 3. Source legend, LiveFlow icon and stage

**File**: `src/components/SourceLegend.astro` (new), `src/components/live/LiveFlow.tsx`

**Intent**: The design's footer legend, and the grid node icon consistent with it.

**Contract**: `SourceLegend` is a `<footer aria-label="Legenda">` on `bg-card` with `border`, `rounded-2xl`: three dots (`bg-tone-good`, `bg-tone-watch`, `bg-tone-problem`, `aria-hidden`) with words "Dobrze", "Warto sprawdzić", "Problem"; four icons with words "Panele" (`Sun`, `text-flow-pv`), "Bateria" (`BatteryMedium`, `text-flow-battery`), "Dom" (`House`, `text-flow-home`), "Sieć" (`TowerControl`, `text-flow-grid`); wraps on phone. In `LiveFlow.tsx` the grid node icon changes from `Zap` to `TowerControl` (the import list and `buildNodes` entry only) and the diagram stage gets the design's inset panel (`bg-inset border border-hairline rounded-2xl`) around the existing grid, with padding `p-2 sm:p-4` so the phone keeps its width: at 390 px the 2x2 grid is `minmax(0,1fr) 40px minmax(0,1fr)` inside the 16 px page gutter, the `Panel` (`p-6`) and this inset, which takes each node column from about 135 px to about 119 px with the smaller phone padding (arithmetic from the classes, not a render), and `FlowNode` content (a `whitespace-nowrap` value, a `VerdictChip` such as "Warto sprawdzić" and a detail line such as "85,0% oczekiwanego") is already tight; criterion 2.15 checks it. The in-diagram `LEGEND` chips stay.

#### 4. Page body extraction

**File**: `src/components/DashboardBody.astro` (new), `src/pages/dashboard.astro`, `src/pages/dev/dashboard-refresh.astro` (untracked)

**Intent**: Composition lives in one component, so the dev page and the dashboard cannot drift, and the artboards' column layout is in place for every later screenshot.

**Contract**: Props `{ liveView, billView, usageView, recommendationView, email }` (the existing view types). It renders the shell wrapper (`bg-aurora`, `max-w-[1120px]`), `DashboardHeader`, `LiveStateCard`, then a `lg:grid-cols-3` grid with the recommendation (`lg:col-span-2`) beside a right column (`space-y-6`) holding `BillForecastCard` above the usage card, and `SourceLegend`. The bill card therefore leaves its full-width slot above the grid (no empty row remains), and on the phone the order is live, recommendation, bill, usage (`Mobile.dc.html`). The bill card's own contents are untouched in this phase (its delta and bar arrive in Phase 5). `dashboard.astro` keeps its loading code and the five-minute reload script and passes the views in. The layout move is the only behaviour change.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- The header carries the new copy and the sign-out form is intact: `git grep -n "Wyloguj się" -- src/components` prints the header line and `git grep -n 'action="/api/auth/signout"' -- src` prints one line
- Icons are server-rendered and no new island appeared: `git --no-pager grep -nE "[[:space:]]client:(load|idle|visible|media|only)" -- "src/**/*.astro"` prints exactly four lines, `src/components/LiveStateCard.astro` (the `LiveFlow` island), `src/components/RecommendationCard.astro` and the two form islands in `src/pages/auth/signin.astro`; any other line, an icon among them, fails the check
- The smoke strings never appear in new copy: `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing
- The status testids are unchanged: `git grep -nE 'testId="(live|bill|usage)-status"' -- src` prints three lines
- The dev page is still untracked: `git ls-files src/pages/dev` prints nothing

#### Manual Verification:

- The header at 1440px and 390px matches the artboards: logo tile, name, e-mail (hidden on the phone), "Wyloguj się" with an icon; on the phone icon-only with an accessible name; both controls at least 44px tall
- Card headings carry the design's icons and sizes (recommendation Sparkles in primary, bill FileText in primary, usage House in the home colour, live card none) and the live badge shows the dot with unchanged text ("Dobrze · aktualne"; stale, degraded and problem states keep their words)
- The footer legend shows three tone dots and four source icons (Panele, Bateria, Dom, Sieć), the icons match the flow nodes (grid is now TowerControl) and it wraps at 390px without overflow
- Keyboard reaches "Wyloguj się" with a visible focus ring; the icon-only phone button has an accessible name
- There is no horizontal page scroll at 390px in any dev-page scenario
- At 390px, after the inset panel (`p-2 sm:p-4`), with the `worse` and `battery-low` live-flow fixtures (`?scenario=gaps` and `?scenario=few-days`), every node keeps its value, chip word and detail line unclipped (for example "Warto sprawdzić" and "85,0% oczekiwanego"), and none of the four nodes overflows or wraps outside its square
- At 1440px the bill card sits in the right column above the usage card with the recommendation 2/3 wide; at 390px the order is live, recommendation, bill, usage; no empty row is left where the full-width bill card was and nothing overflows

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Sparkline helper and component

### Overview

The pure path helper with exact-value tests, and a zero-JS `Sparkline.astro` with three non-drawn or flat variants (too few days, history unavailable, flat series with a visible caption). No data is wired yet; the dev page proves every state.

### Changes Required:

#### 1. Path helper

**File**: `src/lib/sparkline.ts`, `src/lib/sparkline.test.ts` (new; precedent `src/lib/flow-geometry.ts`)

**Intent**: Turn a calendar-indexed series into SVG path data and an honest label, deterministically and without a DOM, so it is tested in vitest.

**Contract**: Constants `MIN_SPARKLINE_POINTS = 3` (two points make a line that reads as a trend; three is the least that shows a shape), `SPARKLINE_PAD = 2` (px kept free on every side for the stroke), `FLAT_SPAN_EPSILON = 1e-9`. `sparklineGeometry(values: readonly (number | null)[], width: number, height: number): SparklineGeometry | null` where `SparklineGeometry = { line: string; area: string; points: number; min: number; max: number; last: number; flat: boolean }`. Rules: `null`, `NaN` and infinite values are gaps; fewer than `MIN_SPARKLINE_POINTS` non-gap values return `null` (the empty state); x of slot i is `PAD + i * (width - 2*PAD) / (values.length - 1)` so gaps keep their space (a trailing gap leaves the right end empty); y maps `[min, max]` onto `[height - PAD, PAD]`. A series whose span is at or under `FLAT_SPAN_EPSILON` is `flat: true` and is not min-to-max scaled: an all-zero series (max within `FLAT_SPAN_EPSILON` of 0) is drawn on the baseline at `y = height - PAD`, an all-equal non-zero series at mid-height, so a counter that reads zero every day never looks like a steady mid-scale trend. One subpath per run of consecutive values, a run of one is `Mx,y Lx,y` (a dot with round caps); `area` closes each run of two or more down to `y = height`; every coordinate is `toFixed(1)`. Also `describeSeries(subject: string, windowLabel: string, values, unit = "kWh"): string | null` (null exactly when the geometry is null): "Produkcja z paneli, ostatnie 14 dni: od 8,1 do 25,3 kWh, ostatnia dostępna wartość 24,7 kWh, dane z 12 z 14 dni" (the last clause only when some slots are gaps; all-equal reads "…: bez zmian, 3,0 kWh w każdym dniu z danymi…"), numbers through `oneDecimal`, and `flatCaption(values, unit = "kWh"): string | null`, null unless the geometry is `flat`, else the visible text "bez zmian, 0,0 kWh" or "bez zmian, 3,0 kWh". The label states min, max and last available value, never a trend.

#### 2. Component

**File**: `src/components/ui/Sparkline.astro` (new)

**Intent**: Render a series server-side as an accessible inline SVG, or an explicit empty state, with zero JavaScript and no animation.

**Contract**: Props `values: readonly (number | null)[] | null` (`null` means the history could not be loaded, see the unavailable variant), `subject`, `windowLabel`, `tone: "pv" | "home" | "neutral" | "primary"` (mapped to full class names `text-flow-pv`, `text-flow-home`, `text-tone-neutral`, `text-primary` so Tailwind sees them), `width = 120`, `height = 36`, `class`. Drawn: `<svg viewBox="0 0 W H" role="img" aria-label={describeSeries(...)} class="block flex-none ...">` with an area path (`fill="currentColor" fill-opacity="0.14"`) and a line path (`stroke="currentColor" stroke-width="2"`, round caps and joins, `vector-effect="non-scaling-stroke"` so the stroke stays 2px when scaled by width classes). Empty (a series with fewer than `MIN_SPARKLINE_POINTS` values): a `text-muted-foreground text-xs` span "za mało dni" (`data-testid="sparkline-empty"`), no image role. Unavailable (`values === null`, the history load failed): the same styling with the text "historia niedostępna" (`data-testid="sparkline-unavailable"`), no image role, so a database error never tells the owner the history is "too short". Flat (`geometry.flat`): the svg is drawn as above and a `text-muted-foreground text-[11px]` caption from `flatCaption` ("bez zmian, 0,0 kWh") sits under it (`data-testid="sparkline-flat"`), because a flat line carries no scale. The container sits on an opaque surface (`bg-card`, `bg-inset`); no blur behind it.

#### 3. Dev page section

**File**: `src/pages/dev/dashboard-refresh.astro` (untracked)

**Intent**: Prove every state before wiring.

**Contract**: A "Sparkline states" section: 14 full points, gaps with an isolated point, exactly 3 points, 2 points and none (empty), all equal non-zero (mid-height, captioned), all zero (on the baseline, captioned "bez zmian, 0,0 kWh"), unavailable (`values = null`), and the 7-day size at 100 x 30, in each tone on card and inset backgrounds.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new `src/lib/sparkline.test.ts`: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- No dependency was added or changed: `git diff --exit-code origin/main -- package.json package-lock.json`
- The sparkline code has no animation, timers or hydration: `git grep -nE "animate|@keyframes|transition|setInterval|client:" -- src/lib/sparkline.ts src/components/ui/Sparkline.astro` prints nothing

#### Manual Verification:

- The dev page section renders every state: 14 full points, gaps (broken line, isolated point as a dot), exactly 3 points, 2 points and none (empty state text), all equal non-zero (flat mid-line), and the 7-day size
- Each drawn sparkline exposes `role="img"` with its label and the accessibility tree reads min, max and last available value in Polish; the empty and unavailable states are text, not an image
- The 2px stroke stays 2px at 96px and 120px wide and nothing is clipped at the edges
- Stroke contrast is at least 3:1 on card and inset for each tone (table in Current State Analysis)
- Flat series carry their caption: an all-zero series is drawn on the baseline with the visible text "bez zmian, 0,0 kWh" and an all-equal non-zero series at mid-height with the visible text of its value ("bez zmian, 3,0 kWh"); a varying series has no caption
- The unavailable variant shows "historia niedostępna" as text, distinct from "za mało dni", with no image role

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Daily series in the views and the KPI and usage sparklines

### Overview

Build the series from rows already loaded (no query, no contract change), add them to the live and usage views, and render the KPI row and the usage rows with sparklines.

### Changes Required:

#### 1. Series builder

**File**: `src/lib/services/daily-series.ts`, `src/lib/services/daily-series.test.ts` (new)

**Intent**: One pure function that turns daily rows into a calendar-indexed series with honest gaps.

**Contract**: `KPI_SERIES_DAYS = 14`, `USAGE_SERIES_DAYS = 7`, `type DailySeries = (number | null)[]`, `dailySeries(rows: DailyEnergyRow[], field: "pv_kwh" | "load_kwh" | "grid_import_kwh" | "grid_export_kwh", lastDay: string, days: number): DailySeries`. Returns exactly `days` entries, oldest first, ending on `lastDay` inclusive; a day with no row, a null total, a non-finite total or a negative total is `null` (drawn as a gap, never zero); rows outside the window are ignored. Tests with exact arrays: full window, a missing day, a null total, a negative total, rows outside the window, `days = 1`, an empty row list (all null), today's row present but `lastDay` = yesterday (today excluded), and a window that crosses a month and a year boundary (`addDays`).

#### 2. Live view series

**File**: `src/lib/services/live-state.ts`, `src/lib/services/live-state.test.ts`

**Intent**: KPI sparklines show the previous 14 complete days of the three totals, ending the day before the capture's Warsaw day.

**Contract**: The `"state"` view gains `series: { pv: DailySeries; bought: DailySeries; sold: DailySeries } | null` (`pv_kwh`, `grid_import_kwh`, `grid_export_kwh`) built from `history` with `lastDay = addDays(capturedClock.dayKey, -1)`. The mapper already tells the two cases apart (`historyFailed` when the rows are `null`, the same fact the verdict chips report as "historia niedostępna"), and the series keeps the difference: a failed load gives `series: null` (the card shows "historia niedostępna"), undefined or empty history gives three all-null series (the card shows "za mało dni"). Tests: the capture day's own row is never in the series; a snapshot captured on an earlier day than `now` still ends the day before its capture day; empty history gives 14 nulls per series; failed history (rows `null`) gives `series: null` while the verdict chips still say "historia niedostępna"; the whole-object `toEqual` at `live-state.test.ts:50` gains the new field.

#### 3. Usage view series

**File**: `src/lib/services/usage-insight.ts`, `src/lib/services/usage-insight.test.ts`

**Intent**: The 7-day series end on the compared day, so the last point is the value shown beside it.

**Contract**: The `"insight"` view gains a top-level `series: { load: DailySeries; purchase: DailySeries }` (`load_kwh`, `grid_import_kwh`, `lastDay = compared`, `USAGE_SERIES_DAYS`), not inside `load` or `purchase`. Tests: last element equals the compared day's load and purchase; yesterday missing (compared three days ago) ends three days back; a null purchase on the compared day is a trailing gap; the whole-object `toEqual` at `usage-insight.test.ts:35` gains the field; every existing `purchase`/`load` assertion passes unchanged.

#### 4. Live card KPI row

**File**: `src/components/LiveStateCard.astro`

**Intent**: The design's KPI row: icon, label, existing value, 14-day sparkline, on the inset surface.

**Contract**: Replace the `dl` block with a three-item semantic list (`ul`/`li`; an icon and a sparkline cannot sit inside `dl > div`) on `bg-inset border-hairline rounded-2xl`, three columns from `md`, stacked with hairline dividers below. Items: `Sun` `text-flow-pv` "Z paneli dziś" with `view.today.pv` and the `pv` series (tone `pv`); `TowerControl` `text-flow-grid` "Kupione z sieci dziś" (`bought`, tone `neutral`); `Upload` `text-primary` "Sprzedane do sieci dziś" (`sold`, tone `primary`). Labels and values stay verbatim; the period line (`data-testid="live-today-period"`) and the timestamp stay, and the timestamp line gains "wykresy: poprzednie 14 dni, bez dzisiejszego". Sparkline 120 x 36 from `md`, rendered at 96 px wide on the phone (viewBox unchanged); `min-w-0` on the text column. Subjects for the labels: "Produkcja z paneli", "Energia kupiona z sieci", "Energia sprzedana do sieci"; window label "ostatnie 14 dni". Each `Sparkline` gets `values={view.series?.pv ?? null}` (and `bought`, `sold`), so a failed history renders the unavailable variant and a thin or empty one "za mało dni". A flat `sold` series shows its caption ("bez zmian, 0,0 kWh") under the line; the caption must fit the 96px sparkline column on the phone.

#### 5. Usage card rows

**File**: `src/components/UsageInsightCard.astro`

**Intent**: Two rows, each with the existing value and delta and a 7-day sparkline; nothing that needs the unreliable export counter.

**Contract**: The two tiles become two rows (label, value, delta line, sparkline on the right, hairline between; sparkline 110 x 32, 100 wide on the phone): "Zużycie domu" (tone `home`, subject "Zużycie domu", `series.load`) and "Kupione z sieci" (tone `neutral`, subject "Energia kupiona z sieci", `series.purchase`). The window label for both is "7 dni do <dayLabel>" built from the view's own `dayLabel` of the compared day (not "ostatnie 7 dni": the series ends on the compared day, which can be up to seven days before today, exactly in the "brak danych z wczoraj" case the tests cover). The `"insight"` view exists only when the rows loaded, so this card needs no unavailable variant (confirm in `toUsageInsightView` that rows `null` never reaches the `"insight"` branch). Texts and testids of the rest of the card are unchanged. **No "Z PV wykorzystane" row** (What We're NOT Doing).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- No new query: `git grep -n 'from("daily_energy")' -- src` prints exactly the two existing lines (`usage-insight.ts` and `live-state.ts`)
- No migration, contract or lab change: `git diff --exit-code origin/main -- supabase docs/ingest src/lib/ingest/contract.ts`
- "Z PV wykorzystane" is not rendered: `git grep -n "Z PV wykorzystane" -- src` prints nothing
- The smoke strings never appear in new copy: `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing

#### Manual Verification:

- At 1440px the KPI row shows three items with icon, label, unchanged value and a 14-day sparkline; at 390px the items stack, sparklines are 96px wide, and no label or value is clipped or overflows
- "Zużycie wczoraj" shows the two rows with 7-day sparklines and the existing delta text ("… wobec normy"); "Z PV wykorzystane" is absent
- On the dev page: full series draw a line; missing days and null totals draw gaps, not zeros; fewer than 3 points shows "za mało dni"; empty history (`&history=empty`) shows "za mało dni" while a failed history (`&history=failed`) shows "historia niedostępna" in the KPI row, next to the chips that say "historia niedostępna"; an all-zero export series is drawn on the baseline with the visible text "bez zmian, 0,0 kWh" and the "Sprzedane do sieci dziś" value beside it is unchanged
- The usage sparklines are labelled "7 dni do <dayLabel>" (the accessibility tree reads the compared day's label, also when the compared day is older than yesterday), the home row's subject is "Zużycie domu" and the purchase row's "Energia kupiona z sieci"
- Hand check on a fixture: the label's last available value equals the previous day's row, today's partial value is not plotted, and the usage sparkline's last point equals the value beside it
- A stale snapshot still renders the KPI row and its series ending the day before the capture day; the recommendation and bill cards are unaffected

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Bill delta and days-in-estimate bar

### Overview

Derive the delta against the last invoice and the days-in-estimate share in `bill-forecast.ts` behind the existing refusal paths, share the percent edge rule with the usage card through one tested helper, and render both in the card. The card already sits in the right column (Phase 2).

### Changes Required:

#### 1. Shared edge-percent helper

**File**: `src/lib/format/edge-percent.ts`, `src/lib/format/edge-percent.test.ts` (new), `src/lib/services/usage-insight.ts` (the edge branch of `deltaLabel`, `:168-195`, only)

**Intent**: The repo has one rule for a percentage that sits on a verdict line, and it must not be copied: a whole percent equal to the edge could read "+20%" next to either status.

**Contract**: `edgePercentLabel(raw: number, edge: number, milder: boolean): string` takes the signed unrounded percentage (for example 20.3), the edge in whole percent and whether the milder status applies, and returns the signed one-decimal label: `tenths = Math.round(|raw| * 10 + EPSILON) / 10`, `shown = milder ? Math.min(tenths, edge) : Math.max(tenths, edge + 0.1)`, sign `+` or the real minus from the sign of `raw`, formatted with `oneDecimal` from `src/lib/format/values.ts`, then `%`. The helper only formats; each caller decides when it applies and what `milder` is. `deltaLabel` keeps its triggers (whole percent equal to 15, or a positive whole percent equal to 40, `milder` from `statusOf`/`bandOf`) and calls the helper instead of its inline `tenths`/`shown` lines; its output and every existing usage test stay unchanged. Helper tests (exact strings): `(20.0, 20, true)` gives `+20,0%`; `(20.3, 20, false)` gives `+20,3%`; `(20.04, 20, false)` gives `+20,1%` (clamped past the edge); `(19.96, 20, true)` gives `+20,0%` (clamped to the edge); `(-15.04, 15, true)` gives `−15,0%`; `(-15.4, 15, false)` gives `−15,4%`.

#### 2. Mapper: delta and days

**File**: `src/lib/services/bill-forecast.ts`

**Intent**: Whole-złoty delta against the invoice the verdict already uses, naming that invoice's month, and the share of the month's days the estimate rests on; both only where an honest comparison exists.

**Contract**: The `"forecast"` view gains `delta: BillDeltaView | null` and `days: BillDaysView | null`. `BillDeltaView = { text: string; tone: "good" | "watch" | "problem"; direction: "up" | "down" | "flat" }`; `BillDaysView = { used: number; inMonth: number; label: string; share: number }` (`label` "15 z 30", `share` 0 to 1). Extract `verdictTone(central, invoice)` from `verdictStatus` (same comparisons, same `BILL_AMBER_RATIO`, same milder-on-a-line rule) and use it for both the badge and the delta tone, so they can never disagree. Delta rules, all inside the forecast-returning path after every refusal check (`no_data`, stale, future, plausibility, sign guards, fewer than 7 days have already returned): `null` when there is no invoice (`closed_month_check` absent or its `invoice_gross_pln` missing), when `isOtherMonth`, or when the invoice's month is unreadable (`periodMonthLabel(check.period)` is `MISSING`; the label must name the invoice, from `closed_month_check.period`, not `settlement.reference_period`). Amount: `Math.round(central) - Math.round(invoice)` in whole złoty with a real minus sign (`+43 zł`, `−20 zł`), so the two figures on the card subtract exactly; `0` gives `direction: "flat"` and the text "bez zmian względem ostatniego rachunku za <miesiąc>". Percent: `(central / invoice - 1) * 100` half away from zero to a whole percent, omitted when it rounds to 0 or the invoice rounds to 0 zł. Trigger for the edge rule: the delta is positive and the whole percent equals the +20% verdict line (`(BILL_AMBER_RATIO - 1) * 100`), which covers the whole 19,5 to 20,5% band, not only the line itself. Then the label is `edgePercentLabel(raw, 20, tone !== "problem")` (Phase 5 step 1, the same helper `deltaLabel` uses), so the percent is decided by the same rule as the tone: exactly on the line `+20,0%` and watch, past it at least `+20,1%` and problem, and 240.6 against 200 (a problem, "ponad 20% powyżej…" on the badge) prints `+20,3%`, never `+20%`. A negative delta never triggers it: 160 against 200 is `−20%` with no decimal. Everywhere else the percent is whole. Text: "+43 zł (+20,1%) względem ostatniego rachunku za sierpień 2026" (`formatMonth` label, so a two-month lag across a year end is unambiguous). Days: `inMonth` from the forecast's own `month` key (`MONTH_KEY` valid) else `warsawMonthKey(now)`, computed with `Date.UTC(y, m, 0)`; `used` is the existing `completedDays`; `days` is `null` when `used > inMonth` (an inconsistent body, not a full bar). The bar is independent of the invoice.

#### 3. Mapper tests

**File**: `src/lib/services/bill-forecast.test.ts`

**Intent**: Pin every edge with exact strings; the existing whole-object `toEqual` at `:146` gains the fields.

**Contract**: Delta cases (central against invoice; the 257.73 against 214.66 pair is the `bill_forecast` of `docs/ingest/example-v1.json`, and `verdict-above-plus-20-pct` is 260 against 200): 257.73 vs 214.66 → `+43 zł (+20,1%) …`, tone problem, up; 240 vs 200 → `+40 zł (+20,0%)`, watch; 240.01 vs 200 → `+20,1%`, problem; 240.6 vs 200 → `+41 zł (+20,3%)`, problem, up (never `+20%`); 260 vs 200 → `+60 zł (+30%)`, problem; 160 vs 200 → `−40 zł (−20%)`, good, down (no decimal on the negative side); 200 vs 200 → `bez zmian…`, good, flat; 214.9 vs 214.66 → zero złoty (`bez zmian`), good; 215.6 vs 214.66 → `+1 zł` with no percent (rounds to 0%), watch; 214.4 vs 214.66 → `−1 zł`, good, down; 180 vs 200 → `−20 zł (−10%)`, good; invoice 0 → amount only, no percent, no division; invoice absent → `null` (badge unchanged, "brak zamkniętego rachunku do porównania"); invoice with an unreadable `period` → `null`; lagging reference (settlement July, `reference_lag_months: 1`, check period `01.07.2026 - 31.07.2026`) → names "lipiec 2026"; wrong-month forecast (`isOtherMonth`) → `null`; `no_data`, stale, future-dated, implausible and fewer-than-7-days bodies still return their refusal views (no `delta`/`days`). Days cases: 15 of 30 in September; 28 of 28 in February 2027 and 15 of 29 in February 2028 (leap); 31 of 31; a body with no `month` uses the Warsaw month; `used > inMonth` (32 observed capped to 31 against 30 days) → `null`; `completed_days_used` without a day list falls back as today.

#### 4. Card

**File**: `src/components/BillForecastCard.astro`

**Intent**: Range stays the headline; add the delta line and the days bar as on the artboards.

**Contract**: Under the central estimate (`bill-central` unchanged) render the delta line when `forecast.delta`: `TrendingUp` / `TrendingDown` / `Minus` (`aria-hidden`) plus the text, coloured with the `text-tone-*` class of its tone (the sign, the arrow and the words carry the meaning, not only the colour). The `dl` becomes: row "Policzone z pełnych dni" with the `days.label` on the right (`data-testid="bill-days-share"`), an `aria-hidden` bar (`bg-hairline` track, `bg-primary` fill, inline `width` from `share`), and the existing period text below it (`data-testid="bill-days"` kept on it); the "Pewność tej kwoty" row and every other testid, the details block and the disclaimer stay. `days === null` hides the bar and keeps the period text. The card's place in the right column was set in Phase 2 and is not touched here.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- The percent edge rule has one implementation: `git --no-pager grep -ln "edgePercentLabel" -- src` lists exactly `src/lib/format/edge-percent.ts`, `src/lib/format/edge-percent.test.ts`, `src/lib/services/usage-insight.ts` and `src/lib/services/bill-forecast.ts`, and `git --no-pager grep -n "Math.min(tenths" -- src ':!src/lib/services/live-state.ts'` prints exactly one line (in `edge-percent.ts`; `live-state.ts` `shareLabel` holds an older, unsigned variant of the clamp for the PV share that predates this change and is out of scope, so it is excluded)
- The delta is not derived from the check's own drift figure: `git grep -n "diff_pct" -- src/lib/services/bill-forecast.ts` prints one line (the closed-month check's `signedPercentLabel`)
- No contract or migration change: `git diff --exit-code origin/main -- supabase docs/ingest src/lib/ingest/contract.ts`
- Every bill testid survives: `for id in bill-status bill-unavailable-reason bill-month bill-range bill-central bill-days bill-confidence bill-basis bill-credit-left bill-closed-month-check; do git grep -q "$id" -- src/components/BillForecastCard.astro || echo "missing $id"; done` prints nothing
- The smoke strings never appear in new copy: `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing

#### Manual Verification:

- On the dev page the delta line reads as planned for each body: `?scenario=fresh-full` (the `bill_forecast` of `docs/ingest/example-v1.json`, 257.73 vs 214.66) shows "+43 zł (+20,1%)" in the problem colour, `&bill=verdict-above-plus-20-pct` (260 vs 200) "+60 zł (+30%)" in the problem colour, `&bill=verdict-at-plus-20-pct` "+40 zł (+20,0%)" in watch, `?scenario=gaps` (`verdict-equal-to-invoice`) "bez zmian…", `?scenario=few-days` (`no-closed-month-check`) has no delta line and its badge says there is nothing to compare with, `?scenario=stale-and-lag` names "lipiec 2026", `?scenario=other-month-and-refusals` (the October read) has no delta, and `&bill=no-data-rates-unavailable`, `&bill=stale-generated-at` and `&bill=six-complete-days` keep their refusal states with no delta and no bar
- The bar reads "15 z 30" with a half-filled track and the period text beneath it, and fits at 390px
- The range is still the headline ("od 155 zł do 360 zł") and "ok. 258 zł" reads beneath it
- The delta is understandable without colour (sign, arrow and words) and its text meets 4.5:1 on the card
- The card still sits in the right column above the usage card (Phase 2 layout) with the delta line and the bar added, and nothing overflows at 1440px or 390px

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: System balance on the flow junction

### Overview

Compute the balance in the mapper, show label and value beside the junction, add it to the readings view and the glossary. LiveFlow's behaviour is untouched. Note (owner decision 2026-09-29): Phase 7 rebuilds the diagram, so the label and value move from beside the junction to under the hub; the mapper, the glossary and the readings tile of this phase stay, and manual criteria 6.8 and 6.13 are verified against the Phase 7 layout.

### Changes Required:

#### 1. Mapper

**File**: `src/lib/services/live-state.ts`, `src/lib/services/live-state.test.ts`

**Intent**: One rule for "Bilans systemu" (owner decision: PV minus home load, positive is surplus), with the sign, noise floor and missing-value handling in the mapper.

**Contract**: The `"state"` view gains `balance: { watts: number | null; label: string; word: "nadwyżka" | "niedobór" | "zbilansowany" | null }`. `watts = pvWatts - homeLoadWatts` when both are finite, else `null` (label `MISSING`, word `null`; a missing reading is never treated as 0). `Math.abs(watts) < MIN_FLOW_W` is "zbilansowany", label "0,0 kW" with no sign (the noise floor `flow()` already uses); otherwise the label is `+`/`−` (real minus) followed by `oneDecimal(|watts| / 1000)` and " kW" (`+2,2 kW`, `−0,4 kW`). Computed from the unrounded watts, so it can differ by 0,1 kW from the difference of the two displayed figures; `docs/logic.md` says so. Tests: 3100 − 900 → `+2,2 kW`, nadwyżka; 900 − 1300 → `−0,4 kW`, niedobór; 49 and −49 → `0,0 kW`, zbilansowany; exactly 50 → `+0,1 kW`; −50 → `−0,1 kW`; equal values → `0,0 kW`; `pv_w` missing, `home_load_w` missing, both missing, a non-numeric value → `—` and `watts: null`; stale and degraded snapshots still compute it; the whole-object `toEqual` at `live-state.test.ts:50` gains the field.

#### 2. Glossary

**File**: `src/lib/format/glossary.ts`, `src/components/LiveStateCard.astro`

**Intent**: The formula is explained where the value appears.

**Contract**: New `GlossaryTerm` `"system_balance"`: term "Bilans systemu", explanation in plain Polish: panele minus zużycie domu w tej chwili; plus to nadwyżka (idzie do baterii albo do sieci), minus to niedobór (dom bierze z baterii albo z sieci). Added to the `TermsExplained` list of the live card.

#### 3. Junction text and readings view

**File**: `src/components/live/LiveFlow.tsx`

**Intent**: Label and value on the junction, legible at 390px, and the same number in the readings view.

**Contract**: `LiveFlowProps` adds `"balance"` to the `Pick`. Around the existing `data-flow-junction` circle (which stays the connector target and keeps its position) add two `pointer-events-none` grid items sharing the junction's rows: the label "Bilans systemu" (`text-[11px] text-muted-foreground`, right-aligned in column 1 with a margin of about 12px from the circle, wrapping allowed) and the value (`text-primary font-semibold`, `text-base md:text-xl`, left-aligned in column 3, followed by an `sr-only` `balance.word`), both vertically centred on the junction, i.e. inside the row gap so no square, and (by geometry) no connector, is covered. The label and the value follow the freshness rule the rest of the diagram already follows: when `isStale` both get `opacity-45` (the value the connectors already use for a stale snapshot), so a three-hour-old "+2,2 kW" never looks live, while the balance is still computed and shown. The junction icon and border move to the primary colour as in the artboards. If the 22px value crowds the 36px gap on desktop, raise `gap-y` a little instead of shrinking the text. In the "Odczyty" view add a full-width tile after the four node tiles: "Bilans systemu", the label and the word. No change to pause, motion, `flows`, `useFlowLines`, `usePreference` or the selected-node strip.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- The glossary term exists and is shown: `git grep -n "system_balance" -- src` lists the glossary and the live card
- The motion, pause and geometry code is untouched: `git diff --exit-code origin/main -- src/lib/flow-geometry.ts src/components/hooks/useFlowLines.ts src/components/hooks/usePreference.ts src/lib/preferences.ts src/lib/flow-constants.ts`
- The smoke strings never appear in new copy: `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing

#### Manual Verification:

- "Bilans systemu" and its value are legible at 1440px and 390px with no overlap of squares or connector lines, the sign is visible, and the value sits beside the junction icon
- On the dev page: surplus (`+2,2 kW`), deficit (`−0,4 kW`), near zero (`0,0 kW`) and missing (`—`) states, and a stale snapshot, all render sensibly (no rating colour, no invented zero), and on the stale snapshot (`?scenario=stale-and-lag`) the balance label and value are dimmed (`opacity-45`) like the connectors while still readable
- "Odczyty" shows the same balance as the diagram
- Regression: pause and motion gating, reduced motion, the selected-node strip, the diagram/readings switch and the connectors behave as before this phase
- The glossary entry reads plainly in "Co to znaczy?" and the value's accessible name includes the word nadwyżka, niedobór or zbilansowany
- At 390px (inset padding from Phase 2) with the `worse` and `battery-low` live-flow fixtures (`?scenario=gaps` and `?scenario=few-days`) the balance label wraps to at most two lines inside the 36px row gap, the value stays on one line, and no node text or the label is clipped

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 7: Flow diagram rebuild to the design

### Overview

Owner decision 2026-09-29, binding, reverses assumption 3: after the screenshot pass the owner saw that the rendered diagram (verdict-tinted 2x2 squares, crossing straight connectors, 18 px values) does not look like the approved artboards. This phase rebuilds the LAYOUT AND LOOK of the flow diagram like `design/Main.dc.html` and `design/Mobile.dc.html` and adds the small fidelity tweaks; every LiveFlow behaviour is preserved (table in step 9). Size L, about two sessions, in this order: (1) pure geometry and (2) pure connector state, both with tests; (3) `FlowNode`; (4) the stage, hub and connectors in `LiveFlow`; (5) the title row; (6) strip and readings; (7) the tweaks; (8) the dev-page overrides for the direction and idle fixtures; (9) the contracts guarded. Commit with explicit paths and check `git status` first: the working tree also holds the untracked dev page and screenshots (never staged), the three screenshot-pass tweaks (`LiveFlow.tsx` `auto-rows-fr`, `StatusBadge.astro` `rounded-2xl`, `BillForecastCard.astro` `sm:col-span-2`) and another change's `context/changes/bill-forecast/plan.md`, which must not be touched. The `auto-rows-fr` class is carried into the new grid below (equal rows keep the hub level with the middle node); the two component tweaks are committed in Phase 8.

### Changes Required:

#### 1. Geometry for the one-left, hub, three-right arrangement

**File**: `src/lib/flow-geometry.ts`, `src/lib/flow-geometry.test.ts` (rewritten; the file stays pure and DOM-free)

**Intent**: Today `connector()` draws one straight line from a node's facing edge towards the circle's centre and assumes four nodes reaching the hub from four diagonals (`side` `left`/`right`, tests per quadrant). In the design every connector leaves or enters the hub horizontally: one from the left (PV) and three from the right (Home, Battery, Grid), all at the hub's vertical centre, as an S-curve to the node's vertical centre. Keep the types, replace the function, and keep the tests exact.

**Contract**: `Rect`, `Point` and `JUNCTION_GAP = 4` stay. New constants: `NODE_GAP = 6` (kept between a line and its node's edge, so the arrowhead does not touch the tile), `CURVE_TENSION = 0.44` (the artboards' 80/180), `MIN_CONNECTOR_SPAN = 12` (below this horizontal span nothing is drawn: a phone at 360 px). `flowPath(nodeRect: Rect, hubRect: Rect, side: "left" | "right", direction: 1 | -1): FlowPath | null` with `FlowPath = { d: string; start: Point; end: Point; angle: 0 | 180 }`. Anchors: the node's facing edge at its vertical middle, moved out by `NODE_GAP` (right edge for `left`, left edge for `right`); the hub's facing point is its centre y and x = centre x minus (`left`) or plus (`right`) `hubRect.width / 2 + JUNCTION_GAP`. `direction` keeps today's meaning: 1 runs node to hub, -1 hub to node; `start` and `end` are the path's own ends in that direction and the arrowhead tip sits at `end`. Horizontal span below `MIN_CONNECTOR_SPAN` returns `null` (the same "nothing left to draw" precedent as the old collapsed line). When the two y values differ by under 0.5 px the path is straight (`M x y L x y`); otherwise a cubic `M sx sy C c1x sy c2x ey ex ey` whose control points are at `start.x` and `end.x` moved towards each other by `span * CURVE_TENSION` (horizontal tangents at both ends, so the arrowhead is always level). `angle` is 0 when `end.x > start.x` and 180 otherwise (it is never diagonal). `d` coordinates are `toFixed(1)`; `start` and `end` are unrounded. Reversing the direction swaps `start`, `end` and the two control points, so the same curve is drawn the other way and the dashes, which travel along the path, follow. Tests with exact values (hub `{ left: 100, top: 100, width: 76, height: 76 }`, centre (138, 138), left anchor x 96 and right anchor x 180): PV `{ left: 0, top: 118, width: 60, height: 40 }`, `left`, 1 gives `M66.0 138.0 L96.0 138.0`, angle 0; Battery `{ left: 300, top: 118, width: 100, height: 40 }`, `right`, 1 (discharge) gives start (294, 138), end (180, 138), angle 180, and -1 (charge) start (180, 138), end (294, 138), angle 0; Home `{ left: 300, top: 20, width: 100, height: 40 }`, `right`, -1 gives `M180.0 138.0 C230.2 138.0 243.8 40.0 294.0 40.0`, angle 0; Grid `{ left: 300, top: 216, width: 100, height: 40 }`, `right`, 1 (import) gives `M294.0 236.0 C243.8 236.0 230.2 138.0 180.0 138.0`, angle 180. Further cases: reversing Home gives `M294.0 40.0 C243.8 40.0 230.2 138.0 180.0 138.0` with angle 180 (the reverse of the forward path, swapped control points); a node exactly at the hub's reach or overlapping it returns `null`; a span of 11 returns `null` and 12 does not; no result contains `NaN`; a zero-size hub still returns a finite path.

#### 2. Connector state: direction, idle, stale, paused as one tested function

**File**: `src/lib/flow-connector-state.ts`, `src/lib/flow-connector-state.test.ts` (new); `src/components/live/LiveFlow.tsx` (uses it)

**Intent**: `flowDirection()` and `isActive()` live untested inside `LiveFlow.tsx`, and the motion gate is spread over the JSX. The rebuild touches every line that reads them, so they move into a pure module with exact tests; this is what guards the direction and motion contracts without a component runner. The rules do not change.

**Contract**: `export type FlowNodeId = "pv" | "home" | "battery" | "grid"` (`FlowNode.tsx` re-exports it as `NodeId`); `export type ConnectorState = { kind: "idle" } | { kind: "active"; direction: 1 | -1; animated: boolean; dimmed: boolean }`; `connectorState(id: FlowNodeId, flow: { watts: number | null; moving: boolean }, options: { paused: boolean; isStale: boolean }): ConnectorState`, importing `MIN_FLOW_W` from `@/lib/flow-constants`. `idle` when `watts` is null or `|watts| < MIN_FLOW_W` (a missing reading and noise draw the same dotted line). Otherwise `active` with `direction`: PV 1 (always feeds the hub), home -1 (the hub always feeds the home), grid and battery 1 when `watts > 0` (import, discharge: the node feeds the hub) and -1 when negative (export, charge: the hub feeds the node); `animated = flow.moving && !options.paused` (`moving` is the mapper's fresh-and-at-least-50-W flag, so a stale snapshot never animates); `dimmed = options.isStale`. Tests with exact objects: PV 3100 fresh, home 900, grid +1800 and -1800, battery +500 and -500, exactly 50 W active and 49 W idle (and -50, -49), null idle, stale with 2000 W active with `animated: false` and `dimmed: true`, `moving: true` with `paused: true` not animated, `moving: false` fresh not animated, stale plus idle is `idle`, and PV and home ignore the sign of `watts` for `direction` (a negative PV reading is still 1).

#### 3. FlowNode: the flat icon tile

**File**: `src/components/live/FlowNode.tsx`

**Intent**: Replace the verdict-tinted square with the artboards' flat node: a rounded icon tile in the source colour, the label, a big value and a verdict chip, with no card behind them; keep the button, its accessible name and the `data-node-id` measurement hook.

**Contract**: Props gain `short: string` (the phone label), `direction: string | null` (appended to the label at `sm`: "Bateria · ładowanie", "Sieć · oddawanie do sieci") and `detailLine: string | null` (the battery's "Naładowanie: 74%"), and lose the tint constants; `sub` stays for the readings view only and is no longer rendered here. The root stays `<button type="button" data-node-id aria-pressed aria-label={`${label}: ${spoken}...`}>` with the same label text as today (guard 7.9), `min-h-11`, `min-w-0`, `rounded-2xl`, `p-1 sm:p-2`, transparent, and placement classes from a `PLACEMENT` map for the new grid: `pv` `col-start-1 row-start-2`, `home` `col-start-5 row-start-1`, `battery` `col-start-5 row-start-2`, `grid` `col-start-5 row-start-3` (full class names). Layout: a flex row, tile then text column; the PV node is a centred column (tile above label above value) below `sm` and a row from `sm`. Tile: PV `size-12 sm:size-16`, others `size-10 sm:size-14`, `rounded-xl sm:rounded-2xl`, `border`, fill `bg-flow-<x>/10`, icon `text-flow-<x>` at 24/30 (PV) and 20/26 px, all as full class names in per-node maps. Tile border: rated (`verdict.tone` good, watch or problem) `border-tone-<t>/55`, else `border-flow-<x>/45`; below `sm` a rated node also shows a 16 px corner glyph (`CircleCheck`, `TriangleAlert`, `OctagonAlert`, the `VerdictChip` icons, `bg-card` disc, `text-tone-<t>`, `aria-hidden`, `sm:hidden`). Text: label `text-[11px] sm:text-[13px]` in `text-muted-foreground` (`short` below `sm`, `label` plus direction from `sm`, both spans present, the button's `aria-label` wins so nothing is read twice); value `font-bold whitespace-nowrap`, PV `text-[17px] sm:text-[26px]`, others `text-[15px] sm:text-[22px]`, `text-card-foreground`; from `sm` a `VerdictChip` (`hidden sm:inline-flex`, `max-w-full`, wrapping allowed, `rounded-2xl` when it wraps) with the word `Word · detail` (`capitalise(verdict.word)` and `verdict.detail`; the grid, which has no verdict, gets the neutral chip "Bez oceny" from a constant here), then the muted detail line (`hidden sm:block`) for the battery. Selected: `bg-muted ring-2 ring-primary` (replaces the old box-shadow ring), and `hover:bg-muted/60`; keyboard focus keeps the global unlayered `:focus-visible` rule, which must stay visible over the selected ring. The 2x2 `PLACEMENT`, `RATED_TINT`, `NEUTRAL` and the `max-[480px]` classes are deleted (guard 7.5).

#### 4. LiveFlow: stage, hub and connectors

**File**: `src/components/live/LiveFlow.tsx`

**Intent**: Lay the nodes out like the artboards, put the hub in the middle with the balance under it, and draw four curved connectors from the measured rectangles with the geometry and state modules; nothing else about the island changes.

**Contract**: The inset panel loses `mx-auto max-w-[720px]` (assumption 15) and becomes `bg-inset border-hairline rounded-2xl border p-2 sm:px-8 sm:py-6`; `stageRef` stays on the relative wrapper inside it. The grid is `grid auto-rows-fr grid-rows-3 items-center` with five columns: below `sm` `grid-cols-[72px_minmax(16px,1fr)_56px_minmax(16px,1fr)_104px]` (arithmetic at 390 px: stage content 306 px, so both connector gaps are about 37 px; at 360 px about 22 px, still above `MIN_CONNECTOR_SPAN` after the two gaps of 6 and 4), from `sm` `grid-cols-[minmax(0,260px)_minmax(24px,1fr)_100px_minmax(24px,1fr)_minmax(0,260px)]`. Nodes are placed by `FlowNode`; the hub cell is `col-start-3 row-start-2 relative flex justify-center`, holding the circle (`data-flow-junction`, `aria-hidden`, `size-14 sm:size-[76px]`, `rounded-full border border-primary bg-muted text-primary`, a soft primary glow written with `shadow-[0_8px_24px_color-mix(in_srgb,var(--primary)_18%,transparent)]`, `Scale` at `size-[26px] sm:size-[34px]`) and, absolutely positioned under it (`absolute top-full mt-2 w-24 sm:w-40 text-center pointer-events-none`, so the row heights, and with them the hub's alignment with the middle node, do not change), the label "Bilans systemu" (`text-[11px] sm:text-[13px] leading-tight text-muted-foreground`, wrapping to two lines on the phone) above the value (`balance.label`, `text-[15px] sm:text-[22px] font-bold text-primary`, then the `sr-only` `balance.word`). Both dim to `opacity-70` when `isStale` (assumption 7). Arithmetic that no connector crosses the block: at 1440 px the hub's right connector starts at 42 px from the centre and is about 20 px below the centre after 38 px of run, the block starts 46 px below the centre; on the phone the block starts about 36 px below the centre and the Grid connector is about 17 px below the centre at the block's edge. Connectors: the SVG overlay and `layout` from `useFlowLines` are unchanged; for each measured node call `connectorState(id, flows[id], { paused, isStale })` and `flowPath(rect, layout.junction, side, direction)` with `side` `left` for PV and `right` for the others (a local constant replacing `SIDE`); skip when the rect or the path is missing. Idle: the dotted line (`text-border`, dash `2 6`, round caps, 2 px) along the same path, no arrowhead, as today. Active: a `<g>` with the source text colour and `opacity-45` when `dimmed`; the path (2 px, round caps, `animate-flow-dash` only when `animated`), and a separate un-dashed chevron `M-8 -6 L0 0 L-8 6` (2 px stroke, round caps and joins) translated to `path.end` and rotated by `path.angle`, so the arrowhead is never animated and always shows direction, also when paused, stale or reduced. The old filled mid-path polygon and `line.mid` are gone. The node icon for the grid stays `TowerControl`; `buildNodes` gains `short`, `direction` and `detailLine` per node (`Panele`, `Dom`, `Bateria`, `Sieć`; `battery.direction` and `grid.direction`; the battery's "Naładowanie: ..." without the direction) and keeps `sub` for the readings view. The `Home` import is renamed to `House` if `lucide-react` exports it (it does, checked in Current State Analysis).

#### 5. Title row: heading, badge and controls together

**File**: `src/components/LiveCardTitle.astro` (new), `src/components/LiveStateCard.astro`, `src/components/live/LiveFlow.tsx`

**Intent**: The artboards put "Schemat / Odczyty" and "Wstrzymaj ruch" on the heading's row. The controls belong to the island (they own the view and pause state), so the island renders the row and receives the heading, badge and notices from Astro as named slots, instead of a second island or a DOM script.

**Contract**: `LiveCardTitle.astro` holds today's `CardHeading title="Stan na żywo" size="lg"` and `StatusBadge` (`testId="live-status"`, `dot`) row and is used both in the island's `heading` slot and, for `view === null` and `kind: "empty"`, directly above the existing messages. In the `"state"` branch `LiveStateCard` renders `<LiveFlow client:load ...props><Fragment slot="heading"><LiveCardTitle status={status} /></Fragment><Fragment slot="notices">{degraded and stale notices}</Fragment></LiveFlow>` (Astro passes named slots to a React island as the `heading` and `notices` props, kebab-case to camelCase, checked in the Astro docs); the notices move out of the surrounding `space-y-4` so the order stays title row, notices, diagram. `LiveFlowProps` adds `heading?: ReactNode` and `notices?: ReactNode`. The island's root renders the title row `flex flex-wrap items-center justify-between gap-x-4 gap-y-3`: left the `heading` slot, right the controls (`flex w-full items-center gap-2 sm:w-auto sm:gap-3`); then `notices`, then the view. Segmented control: `role="group" aria-label="Widok"` kept, `flex flex-1 sm:flex-none rounded-xl border border-border bg-muted p-1 sm:p-1`, two `Button`s (`variant="ghost"`, `aria-pressed`, `type="button"`, no icons) with `h-[38px] flex-1 rounded-[9px] px-4 text-sm sm:h-9 sm:flex-none`, active `bg-primary/15 font-semibold text-foreground hover:bg-primary/15`, inactive `text-muted-foreground`. Pause: `Button` `variant="outline"` `h-11 rounded-xl border-border-strong bg-transparent px-3 text-[13px] sm:px-4 sm:text-sm`, `aria-pressed`, text "Wstrzymaj" plus `<span className="sr-only sm:not-sr-only"> ruch</span>` (and "Wznów" with the same suffix), no icon. `usePreference(FLOW_VIEW_KEY, ...)` and `usePreference(FLOW_PAUSED_KEY, ...)` and their handlers are unchanged. The live `Panel` gets `class="p-4 sm:p-6"` (assumption 11). The heading slot is static HTML inside the island, which is correct because the badge only changes with the five-minute page reload; the server render and the first client render stay identical (the children are serialised once).

#### 6. Selected-node strip and readings view

**File**: `src/components/live/LiveFlow.tsx`

**Intent**: Because the phone drops the chip and detail line from the node, the selected-node strip is where they stay visible; nothing else in the strip or in "Odczyty" changes.

**Contract**: The strip's first line gains the node's `VerdictChip` (word and detail, capitalised as in "Odczyty") after the reading; the strip keeps `aria-live="polite" aria-atomic="true"`, the default selection (`battery`), `why`, the glossary terms and the freshness line. The tone legend under the diagram (four `VerdictChip`s) stays. The readings `dl` and its `data-testid="live-balance"` tile are unchanged.

#### 7. Small fidelity tweaks

**File**: `src/components/BillForecastCard.astro`, `src/components/CardHeading.astro`, `src/components/RecommendationCard.astro`, `src/components/ui/DisclosureButton.tsx`

**Intent**: The remaining artboard differences the owner listed, using existing tokens.

**Contract**: Bill range (`data-testid="bill-range"`): `text-[30px] leading-tight font-bold text-primary` instead of `text-2xl font-semibold` (text unchanged, so "od 155 zł do 360 zł" and, beneath it, "ok. 258 zł" still render for the smoke test; the range may wrap in the 1/3 column). `CardHeading`: a new `size` value rendering 22 px semibold (the name is the implementer's; document it beside `lg` and `md`), used by the recommendation heading (`size` was the default `md`, 20 px); bill and usage keep 20 px, live keeps 28/22. `DisclosureButton`: the outline button gets `h-11 rounded-xl border-primary/45 bg-transparent px-[18px] font-semibold text-primary hover:bg-primary/10 hover:text-primary` through `cn` (its `aria-expanded`, `aria-controls`, labels and chevron are untouched). No colour literal (guard 7.12).

#### 8. Dev page overrides (untracked)

**File**: `src/pages/dev/dashboard-refresh.astro` (never staged, never committed)

**Intent**: Make the direction, idle and long-value cases reproducible on every scenario.

**Contract**: Render `DashboardBody` as before and add a `&flow=` override that rewrites `pv_w`, `home_load_w`, `grid_w` and `battery_w` of the rebased `state` before the mapper runs: `import` (`grid_w` +1800), `export` (`grid_w` -1800), `charge` (`battery_w` -500), `discharge` (`battery_w` +500), each setting only the named field, `idle` (all four at 30 W in either sign), `long` (values that print "10,5 kW" on every node: `pv_w` 10500, `home_load_w` 10500, `grid_w` 10500, `battery_w` 10500), all combinable with `&balance=` where the two do not conflict (`flow` wins). Without `&flow=` a scenario keeps whatever its fixture carries.

#### 9. Behaviour contracts this phase must not regress

**File**: none (the guard list)

**Intent**: State plainly what the rebuild must keep and what guards it; there is no component test runner (`vitest` runs `src/**/*.test.ts` only), so contracts that live in JSX are guarded by unchanged files, grep guards and manual gates, and the pure rules by tests.

**Contract**:

| Contract (live-flow-interaction)                                                                                  | Guard                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion only for fresh, nonzero flows: snapshot at most 15 minutes old, reading at least 50 W, not paused          | Existing `live-state.test.ts` (`moving` at 50, 49, null, stale, degraded) with the mapper unchanged (7.8); new `connectorState` tests (`animated` needs `moving` and not `paused`; 49 and 50 W; stale); manual 7.22 |
| Pause and the view choice persist, guarded storage, defaults on the server                                        | `preferences.test.ts` and `usePreference.ts` unchanged (7.7); the two `usePreference(` calls kept (7.9); manual 7.22                                                                                                |
| Reduced motion: unconditional override, arrowheads stay                                                           | `global.css` unchanged (7.7); the chevron is never animated; manual 7.23                                                                                                                                            |
| Arrowheads always show direction (active flows), dotted line with no arrow when inactive                          | `flowPath` angle tests (0 and 180, reversal), `connectorState` tests; manual 7.20 and 7.21                                                                                                                          |
| Direction rules: PV to hub, hub to home, grid import and battery discharge to hub, export and charge away from it | `connectorState` exact-object tests per sign; `docs/logic.md` sign convention; manual 7.20                                                                                                                          |
| Selected-node strip (default battery, atomic live region, reading, terms, freshness)                              | `aria-live`, `aria-atomic` and the default kept (7.9); manual 7.24                                                                                                                                                  |
| "Odczyty" view with the same numbers and the balance tile                                                         | `data-testid="live-balance"` kept (7.9, 7.10); manual 7.24                                                                                                                                                          |
| Verdict colours keep their meaning and each chip carries icon and word                                            | `tone-classes.ts` and `VerdictChip.tsx` unchanged (7.7); mapper tests for the verdicts unchanged (7.8); manual 7.26 and 7.29                                                                                        |
| Keyboard and aria: native buttons, `aria-pressed`, unchanged accessible name                                      | grep guard on the `aria-label` template and `aria-pressed` (7.9); manual 7.25                                                                                                                                       |
| Connectors measured with `ResizeObserver`, none before the first measurement                                      | `useFlowLines.ts` unchanged (7.7); `data-node-id` and `data-flow-junction` kept (7.9); manual 7.19                                                                                                                  |
| Hydration parity (server render equals the first client render, no `localStorage` read on the server)             | hooks unchanged (7.7); the heading and notices arrive as static slot children; manual 7.31 (view source shows values and no connectors)                                                                             |
| Smoke strings and testids                                                                                         | 7.10 and the unchanged bill mapper (7.8)                                                                                                                                                                            |

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the rewritten `src/lib/flow-geometry.test.ts` and the new `src/lib/flow-connector-state.test.ts`: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- The 2x2 placement, the 92 px junction column, the 480 px breakpoint and the 720 px stage cap are gone: `git --no-pager grep -nE "col-start-1 row-start-2|col-start-3 row-start-2|row-span-2|_92px_|max-\[480px\]|max-w-\[720px\]" -- src/components/live src/components/LiveStateCard.astro` prints nothing
- The straight-diagonal connector and the inline direction helpers are gone and the new path function is used by the island only: `git --no-pager grep -nE "[^a-zA-Z]connector\(|const SIDE|function flowDirection|function isActive" -- src` prints nothing, and `git --no-pager grep -ln "flowPath" -- src` lists exactly `src/lib/flow-geometry.ts`, `src/lib/flow-geometry.test.ts` and `src/components/live/LiveFlow.tsx`
- Motion, pause, preference, verdict-colour and reduced-motion code is untouched since Phase 6: `git diff --exit-code efeaa2a -- src/components/hooks/useFlowLines.ts src/components/hooks/usePreference.ts src/lib/preferences.ts src/lib/preferences.test.ts src/lib/flow-constants.ts src/styles/global.css src/lib/format/tone-classes.ts src/components/live/VerdictChip.tsx`
- The mapper and the bill mapper, with their tests, are untouched (view model, `flows`, `verdicts`, `balance`, the 15 minute and 50 W gates): `git diff --exit-code efeaa2a -- src/lib/services/live-state.ts src/lib/services/live-state.test.ts src/lib/services/bill-forecast.ts src/lib/services/bill-forecast.test.ts`
- The behaviour and accessibility hooks survive the rewrite: `for s in 'aria-pressed={selected}' 'aria-atomic="true"' 'aria-live="polite"' 'aria-label=' 'data-node-id={id}' 'data-flow-junction' 'data-testid="live-balance"' 'animate-flow-dash' 'usePreference(FLOW_PAUSED_KEY' 'usePreference(FLOW_VIEW_KEY' 'useFlowLines('; do git grep -qF -- "$s" -- src/components/live || echo "missing $s"; done` prints nothing
- Test ids and the smoke copy survive: `for s in live-status live-balance live-today-period bill-status bill-range bill-central bill-delta bill-days bill-days-share; do git grep -q "$s" -- src || echo "missing $s"; done` prints nothing, `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing, and `for s in "Stan na żywo" "Zużycie wczoraj" "Prognoza rachunku" "najbardziej prawdopodobnie"; do git grep -qF -- "$s" -- src || echo "missing $s"; done` prints nothing
- No new island and no dependency change: `git --no-pager grep -nE "[[:space:]]client:(load|idle|visible|media|only)" -- "src/**/*.astro"` prints exactly four lines and `git diff --exit-code origin/main -- package.json package-lock.json`
- No colour literal was added: `git --no-pager grep -nE "#[0-9a-fA-F]{3,8}([^0-9a-zA-Z_-]|$)|rgba?\(|hsl\(" -- src/components/live src/components/LiveStateCard.astro src/components/LiveCardTitle.astro src/components/BillForecastCard.astro src/components/CardHeading.astro src/components/ui/DisclosureButton.tsx src/components/RecommendationCard.astro` prints nothing (a pre-existing hit that is not a colour, such as an in-page anchor, is listed and justified in the commit)
- The small fidelity tweaks are in: `git --no-pager grep -nF "text-[30px]" -- src/components/BillForecastCard.astro` and `git --no-pager grep -nF "border-primary/45" -- src/components/ui/DisclosureButton.tsx` print one line each, and `git --no-pager grep -nF "text-[22px]" -- src/components/CardHeading.astro` prints at least two lines (the live heading's phone size and the new size)
- The dev page is still untracked: `git ls-files src/pages/dev` prints nothing

#### Manual Verification:

- At 1440px the live card's title row matches `Main.dc.html`: "Stan na żywo" 28px bold, the badge with its dot, and on the same row on the right the Schemat/Odczyty segmented control (36px segments, the active one tinted) and "Wstrzymaj ruch" (44px, `border-strong` outline); the controls are not on a row of their own
- At 390px the title row matches `Mobile.dc.html`: heading and badge on one row (wrapping allowed), the segmented control filling the width of a second row with a 38px segment height, and "Wstrzymaj" beside it; the accessible name of the pause button is still "Wstrzymaj ruch" ("Wznów ruch" when paused) and the segmented buttons are still named Schemat and Odczyty with `aria-pressed`
- At 1440px the diagram matches `Main.dc.html` region by region on the dev page (`?scenario=fresh-full`): PV alone on the left with a 64px tile and a 26px value, a 76px hub circle with the scale icon in the middle, Home, Battery and Grid in one column on the right with 56px tiles and 22px values, a chip under each value (Grid: "Bez oceny"), curved dashed connectors from PV to the hub and from the hub to each right node with arrowheads, "Bilans systemu" and its value under the hub, and no 2x2 grid, no crossing connectors and no old tinted squares
- At 390px the diagram matches `Mobile.dc.html`: PV on the left with a 48px tile, the label "Panele" and a 17px value, a 56px hub, three right nodes with 40px tiles, short labels and 15px values, curved connectors between them, the balance label and value under the hub; chips and detail lines are not shown
- The connectors follow the nodes when the window is resized: drag from 1440 to 390 and back, and check 360px, 640px, 641px and 768px; each connector keeps ending at the hub edge and at its node, none detaches, none crosses a node or the balance text, and no connector is drawn before the first measurement (server render shows nodes only)
- Directions are right for the four physical cases on the dev page (`&flow=import`, `&flow=export`, `&flow=charge`, `&flow=discharge`): PV always runs PV to hub; the hub always feeds the home; grid import and battery discharge draw the arrowhead pointing at the hub and the dashes travel toward the hub, grid export and battery charge point away from the hub; a state with export and charge together (both away from the hub) matches the artboard
- Idle, stale, unavailable and missing states read correctly: a flow under 50 W (`&flow=idle`) is a dotted grey line without arrowhead and its value reads "0,0 kW"; a stale snapshot (`?scenario=stale-and-lag`) draws dimmed static connectors with arrowheads, no verdict colours on the tiles (neutral chips "Bez oceny") and the balance dimmed at `opacity-70`; missing readings (`battery-missing`, `&balance=missing`) show "—" values, dotted connectors for the null flows and a neutral tile, never an invented zero
- Pause and motion behave as before: with a fresh push the active connectors' dashes move and the arrowheads stay static, a flow under 50 W and a stale snapshot never move, "Wstrzymaj ruch" stops all motion and keeps the arrowheads, the choice survives a manual reload and blocked storage leaves the defaults working, and the five-minute reload still fires while paused
- Reduced motion: with `prefers-reduced-motion: reduce` (system setting; the Browser pane cannot emulate it, so also read the computed `animation-name` of every connector path as `none`) nothing moves and all arrowheads remain
- The selected-node strip and "Odczyty" still work: Battery is selected by default, selecting each node updates the strip (reading, direction, glossary terms, freshness) and the strip now also shows the node's verdict chip and detail; the selected tile shows a visible ring; "Odczyty" shows the same four values plus the balance tile as the diagram and the title-row controls stay visible in both views
- Keyboard and accessibility: Tab order is Schemat, Odczyty, Wstrzymaj ruch (the title row precedes the diagram in the DOM), then PV, Home, Battery, Grid, every one shows a visible focus ring, Enter and Space select a node, `aria-pressed` follows the selection, the node accessible name is unchanged (label, reading, direction, charge level, verdict, detail), the details strip announces atomically, and the hub is not a tab stop
- Contrast on the rendered page: chip text at least 4.5:1 on its tint, node value and label text at least 4.5:1 on the stage, tone-tinted tile borders at least 3:1 on the stage (raise the alpha if a tone is below), source icons at least 3:1, the balance value at least 4.5:1 fresh and at least 4.5:1 stale at `opacity-70`, the active segment text at least 4.5:1, and the "Pokaż szczegóły" border at least 3:1
- No clipped or overlapping text at 390px and 360px with the `worse` and `battery-low` fixtures (`?scenario=gaps`, `?scenario=few-days`) and with a long value such as "10,5 kW" on every node, and at 640px and 641px (the breakpoint) with the chips wrapping to two lines in the narrow columns: values, labels, chips, the balance text and the connectors do not collide, and the document is not wider than the viewport
- Touch targets: every node is a button at least 44px tall and wide at every width; the segmented segments are 36px (38px on the phone) tall inside a 44px control, which meets the 24px WCAG minimum and is the owner's sizing; "Wstrzymaj ruch" is 44px
- On the phone the verdict is not colour-only: a rated tile shows the tone glyph on its corner, the strip and "Odczyty" show the chip word and detail, and the node's accessible name still carries them; on desktop the chip and detail line are visible under every value
- The balance sits under the hub in every direction fixture and width and no connector passes through it; its label and value keep their reading order (label, value, then the sr-only word nadwyżka, niedobór or zbilansowany) and dim with the snapshot
- The small tweaks: the bill range "od 155 zł do 360 zł" is 30px bold in the primary colour and wraps without clipping at 1440px and 390px with "ok. 258 zł" still beneath it, the recommendation heading is 22px, "Pokaż szczegóły" has the primary-tinted outline at 44px and keeps its chevron and expanded state, and the server-rendered HTML (view source) still contains the node values as text ("3,1 kW")
- Nothing else regressed: the KPI row, the usage card, the bill card layout, the header and the footer legend look as they did after Phase 6, and there is no horizontal page scroll at 390px in any scenario
- Design comparison: the artboards (`design/Main.dc.html`, `design/Mobile.dc.html`) and the dev page are opened side by side at 1440px and 390px and every remaining difference is written down in the commit message or the PR notes (expected ones: the tone-tinted tile borders, the tone legend chips under the diagram and the timestamp lines under the KPI row, the balance stacked under the hub on the phone, wrapping chips); each is fixed or accepted by the owner

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. The two component tweaks that were in the working tree before this phase are committed in Phase 8.

---

## Phase 8: Screenshots, docs and cleanup

### Overview

Re-shoot ALL the screenshot evidence at both widths after Phase 7 (the first-pass folder is stale for the diagram and is replaced, never kept beside the new set), record and commit the three tweaks from the first pass, bring the docs in step, including the reversal of assumption 3 and the rebuilt diagram, run the regression checks and delete the dev page as the last step.

### Changes Required:

#### 1. Screenshots

**File**: `context/changes/dashboard-refresh-icons-sparklines/screenshots/` (new, committed evidence) with a `README.md`

**Intent**: Evidence that each state reads well, from the real mappers and cards on the dev page.

**Contract**: Delete the first-pass files in this folder first (they show the 2x2 diagram), then shoot everything again after Phase 7's last commit, so no file predates it; the README says "second pass, after Phase 7". Per scenario at 1440px (viewport 1440x900 or taller) and 390px (viewport 390x2600), one scenario per shot through the dev page's filter (`/dev/dashboard-refresh?scenario=<name>`): `fresh-full`, `gaps`, `few-days`, `stale-and-lag`, `other-month-and-refusals`, plus one shot per refusal kind through `&bill=` (`no-data-rates-unavailable`, `stale-generated-at`, `six-complete-days`), a failed-history shot (`?scenario=fresh-full&history=failed`), a close-up of the hub and the balance states (surplus, deficit, near zero, missing), one diagram close-up per direction fixture (`&flow=import`, `export`, `charge`, `discharge`, `idle`, `long`), the title row at both widths, a side-by-side of each artboard region with the dev page, and a close-up of the sparkline states, all named `<scenario>-1440.jpg` / `-390.jpg`. The README names the method (dev page, per-scenario clock and rebase helper, `?scenario=` filter, widths, viewports), and lists what was not captured: the live stack and real data, motion (judged live), light theme, tablet widths and the expanded disclosures. The README also has a "Remaining differences from the artboards" section (the list from Phase 7 criterion 7.33, each marked fixed or accepted) and a "Layout defects found and fixed" section that records the three first-pass tweaks: `LiveFlow.tsx` `auto-rows-fr` (carried into the Phase 7 grid), `StatusBadge.astro` `rounded-full` to `rounded-2xl` (a wrapping badge becomes a rounded box) and `BillForecastCard.astro` `sm:col-span-2` on the confidence cell, the last two committed in this phase with the screenshots. Layout defects the screenshots show are fixed in this phase.

#### 2. Docs

**File**: `docs/logic.md`, `docs/decisions.md` (`docs/architecture.md` and `docs/prerequisites.md` unchanged: no new layer, no external prerequisite)

**Intent**: Keep the project docs in step with the code (lessons.md).

**Contract**: `docs/logic.md`: a "Where each rule runs" row for the daily series (`daily-series.ts`, `sparkline.ts`); under Live state a "System balance" bullet (formula, sign, 50 W floor, unrounded watts, no rating); a new "Daily sparklines" subsection (windows 14 and 7 days, ends the day before the capture day and on the compared day, today never plotted, gaps for null and missing days, `MIN_SPARKLINE_POINTS`, min to max scale per series, flat series drawn on the baseline when all zero and at mid-height otherwise, each with its visible "bez zmian, X kWh" caption, "historia niedostępna" (failed load) distinct from "za mało dni", label wording including "7 dni do <dayLabel>", the export series inheriting the counter's under-reading, no "Z PV wykorzystane"); under "What the app shows (S-07)" the delta rule (reference invoice named from `closed_month_check.period`, whole złoty on both sides, one decimal whenever the whole percent equals the +20% line through the shared `edgePercentLabel` (240,6 against 200 is +20,3%), tone from the verdict, absent without an invoice, for another month or with an unreadable period, never `diff_pct`) and the days-in-estimate bar (share of the forecast month's days, withheld when inconsistent); the "Readability" line in "Status colours and data periods" updated to the token names and the measured contrast (it still cites `text-blue-100/70`); the glossary term. `docs/decisions.md`, new entries dated 2026-09-29 at the top of that section (the sixth entry must contain the phrase "flow diagram rebuilt to the design"): (1) the palette comes from the approved design, superseding PR 65's values, PV moves to solar yellow (same hex as the watch tone; reverses the earlier "source colours away from tone colours" decision; status stays word plus icon), plus the three extra tokens; (2) "Bilans systemu" is PV minus home load from `state`, not a lab field; (3) sparklines are hand-rolled server-rendered SVG with a pure path helper, no chart dependency (rejected uPlot, Observable Plot, recharts, visx: sizes and client-only rendering in research), today excluded, gaps not zeros, minimum 3 points, "Z PV wykorzystane" omitted and why; (4) the delta label rule and the days bar (why the invoice month is named, why not `diff_pct`); (5) the bill card moves into the right column (supersedes the usage-alone-on-the-right entry; owner-confirmed assumption 2); (6) the flow diagram is rebuilt to the design (owner decision 2026-09-29, reverses assumption 3, which kept the verdict-tinted 2x2 squares before any render): flat icon tiles, PV left, a hub carrying the scale icon and the balance under it, Home, Battery and Grid in one column, S-curved dashed connectors with end chevrons and a horizontal tangent at the hub, the verdict shown as a chip (and a tone-tinted tile border) instead of a tinted square, the phone showing only tile, short label and value with chips reachable in the selected-node strip and "Odczyty", the balance dimmed to `opacity-70` when stale (about 4.6:1), the controls in the title row, and the small tweaks (30 px range, 22 px heading, primary-tinted disclosure); LiveFlow behaviour (motion gate, pause, direction rules, verdict rules) is unchanged. The `docs/logic.md` node-verdicts paragraph says "squares": reword to "nodes" and mention the neutral "Bez oceny" chip on the grid, which is a display constant, not a rating.

#### 3. Cleanup

**File**: `src/pages/dev/dashboard-refresh.astro` (delete; remove `src/pages/dev/` if empty)

**Intent**: Nothing temporary ships; the evidence is the screenshots.

**Contract**: Last step, after the screenshots and docs; a plain deletion (the file was never staged). Then run the full check set once more.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- The contract schema has not drifted: `git diff --exit-code origin/main -- docs/ingest/contract-v1.schema.json`
- The reduced-motion rule is unchanged from the branch base: `git --no-pager grep -c "prefers-reduced-motion" -- src/styles/global.css` prints the same count as `git --no-pager grep -c "prefers-reduced-motion" origin/main -- src/styles/global.css` prints for the base (at `e2d176b` both are 1; a different number fails), and `git --no-pager diff -G "prefers-reduced-motion|animate-flow-dash" origin/main -- src/styles/global.css` prints nothing (any output means a line of the rule or of `animate-flow-dash` changed)
- The docs carry the new rules and decisions: `git grep -lE "Bilans systemu" -- docs/logic.md docs/decisions.md` lists both files and `git grep -lE "parkline" -- docs/logic.md docs/decisions.md` lists both files
- The docs and change notes are formatted: `npx prettier --check docs/logic.md docs/decisions.md context/changes/dashboard-refresh-icons-sparklines/plan.md context/changes/dashboard-refresh-icons-sparklines/plan-brief.md`
- The dev page is deleted: `test ! -e src/pages/dev/dashboard-refresh.astro`
- The dev page never entered git: `git log --all --oneline -- src/pages/dev` prints nothing
- The three first-pass tweaks are committed and none was reverted: `git --no-pager grep -nF "rounded-2xl" -- src/components/StatusBadge.astro`, `git --no-pager grep -nF "sm:col-span-2" -- src/components/BillForecastCard.astro` and `git --no-pager grep -nF "auto-rows-fr" -- src/components/live/LiveFlow.tsx` print one line each, and `git status --short src` shows no modified file
- The decision reversal is recorded: `git --no-pager grep -nF "flow diagram rebuilt to the design" -- docs/decisions.md` prints one line, and `git --no-pager grep -nE "squares" -- docs/logic.md` prints nothing
- Every screenshot is listed and none is stale: `for f in context/changes/dashboard-refresh-icons-sparklines/screenshots/*.jpg; do n=$(basename "$f" .jpg | sed -E 's/-(1440|390)$//'); command grep -q "$n" context/changes/dashboard-refresh-icons-sparklines/screenshots/README.md || echo "unlisted $f"; done` prints nothing, and `git --no-pager grep -c "second pass, after Phase 7" -- context/changes/dashboard-refresh-icons-sparklines/screenshots/README.md` prints 1 once the README is committed

#### Manual Verification:

- Screenshots of every scenario at 1440px and 390px are saved in the change's `screenshots/` folder with a README, and show no clipped text, overlapping control or unbalanced column
- At 390px no scenario causes horizontal page scroll (the document is not wider than the viewport)
- With reduced motion emulated (operating system setting or browser rendering emulation) connectors are static and arrowheads remain; sparklines and the bar are static (they never animate); fresh flows still move when motion is allowed
- Final contrast spot-check on the rendered page: chips, muted text, delta text, balance value and sparkline strokes meet the plan's table
- `docs/logic.md` and `docs/decisions.md` describe every constant and decision above and `docs/prerequisites.md` needs no change (the PR description says so)
- After the draft PR is opened the CI `ci` and `smoke` jobs are green (smoke still finds the four strings and neither "Nieaktualna" nor "Dane nieaktualne"; it does not run locally)
- The first-pass screenshots were deleted and every image in the folder was taken after Phase 7's last commit (file times are later than that commit), including the per-direction diagram close-ups, the title row and the artboard side-by-sides; the README lists the remaining differences from the artboards and the three tweaks

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. Mark the PR ready only after that.

---

## Testing Strategy

### Unit Tests:

- `sparkline.ts`: fewer than `MIN_SPARKLINE_POINTS` (empty, one, two, two with a gap in the middle, only non-finite), exactly three, all equal non-zero (flat mid-line, `flat: true`), all zero (flat on the baseline), an isolated point between gaps (a dot), a trailing gap, a negative range, exact path strings, the Polish label for varied, flat and gappy series, and `flatCaption` (null for a varying series, "bez zmian, 0,0 kWh" and "bez zmian, 3,0 kWh"). Exact values: `[0, 10, 5]` at 100 x 30 gives line `M2.0,28.0 L50.0,2.0 L98.0,15.0` and area `M2.0,28.0 L50.0,2.0 L98.0,15.0 L98.0,30.0 L2.0,30.0 Z`; `[5, 5, 5]` gives `M2.0,15.0 L50.0,15.0 L98.0,15.0`; `[0, 0, 0]` gives `M2.0,28.0 L50.0,28.0 L98.0,28.0`; `[1, null, 3, 4, 5]` gives line `M2.0,28.0 L2.0,28.0 M50.0,15.0 L74.0,8.5 L98.0,2.0`; `[1, 2, 3, null]` ends at x `66.0`.
- `daily-series.ts`: window length and order, missing row, null, negative and non-finite values, rows outside the window, today excluded, month and year boundaries, empty rows.
- Live mapper: series windows (capture day excluded, earlier-day capture, empty history as all-null series, failed history as `series: null`), balance sign, floor at 49 and 50 W, missing inputs, stale and degraded; existing tests unchanged apart from the whole-object assertion.
- Usage mapper: series end on the compared day, yesterday missing, trailing null; existing assertions unchanged.
- Bill mapper: every delta and days case listed in Phase 5 (including 240.6 against 200 and 160 against 200), each refusal path still refusing, the existing `toEqual` extended.
- `edge-percent.ts`: the helper cases listed in Phase 5 step 1; the existing usage `deltaLabel` tests pass unchanged, which proves the extraction preserved behaviour.

- `flow-geometry.ts` (rewritten): the exact paths of Phase 7 step 1 (PV straight, Battery both directions, Home curve forward and reversed, Grid import), the `MIN_CONNECTOR_SPAN` edge (11 and 12), overlap and zero-size hubs.
- `flow-connector-state.ts` (new): every direction and gate case of Phase 7 step 2 with exact objects (the direction, idle, stale and paused contracts that used to live untested in `LiveFlow.tsx`).

### Integration Tests:

- `npm run smoke` runs in CI only (it needs local Supabase and a signed-in session; Docker runs on the UGREEN and is not started from the Mac) and must keep finding "Stan na żywo", "3,1 kW", "Zużycie wczoraj", "Prognoza rachunku", "od 155 zł do 360 zł", "ok. 258 zł" and the fresh advice marker, and neither "Nieaktualna" nor "Dane nieaktualne".
- The strict-parse fixture tests (`bill-forecast-fixtures.test.ts`, `live-flow-fixtures.test.ts`, `recommendation-fixtures.test.ts`) and the schema-drift check in `contract.test.ts` keep passing because nothing in the contract or the fixtures changes.

### Manual Testing Steps:

1. Run `npm run dev` with `SUPABASE_URL` and `SUPABASE_ANON_KEY` unset and open `/dev/dashboard-refresh?scenario=fresh-full` at 1440px and 390px (Browser pane); compare with the artboards.
2. Walk each scenario one URL at a time (`?scenario=<name>`, with `&bill=` and `&history=` overrides): full series, gaps, two-day history (empty state), failed history (unavailable state), stale snapshot, lagging reference month, other month, refusals, balance states.
3. Tab through the page: "Wyloguj się", the diagram controls, the nodes; check focus rings and the icon-only phone button's name.
4. Emulate reduced motion and confirm nothing new moves.
5. Read the accessibility tree for a sparkline and the balance value.
6. Phase 7: open `design/Main.dc.html` and `design/Mobile.dc.html` next to `/dev/dashboard-refresh?scenario=fresh-full` at 1440px and 390px and compare region by region; walk `&flow=import|export|charge|discharge|idle|long` and `stale-and-lag`; resize through 360, 390, 640, 641, 768 and 1440; tab through the title row and the nodes.

## Performance Considerations

No new query and no new dependency. Series reuse the rows already loaded (up to 400, a 14-slot scan each, negligible); a 14-point path is under 200 bytes. Sparklines are inline SVG rendered on the server with zero JavaScript; the only added props to the `LiveFlow` island are one small `balance` object. No animation runs.

## Migration Notes

None: no schema, contract, lab or infrastructure change; no data is written. Rolling back is reverting the phase commits. External prerequisites: none (`docs/prerequisites.md` unchanged; the PR description states it). The only ordering dependency is PR 65 merged first.

## References

- Change identity and owner decisions: `context/changes/dashboard-refresh-icons-sparklines/change.md`
- Research: `context/changes/dashboard-refresh-icons-sparklines/research.md` (section 5 steps 2, 3, 4, 6, 7)
- Approved design: `Main.dc.html` (1440) and `Mobile.dc.html` (390), copied to `context/changes/dashboard-refresh-icons-sparklines/design/` in Phase 1; canvas https://claude.ai/artifact/L9CP96UZSkxwErmnBPX5K1
- Format and gate precedents: `context/changes/live-flow-interaction/plan.md`, `plan-brief.md`; `context/archive/2026-09-28-recommendation-card-refresh/plan.md`, `plan-brief.md`, `reviews/plan-review.md`, `screenshots/README.md`
- PR 65 field-preserving contract: `context/changes/frosted-aurora-dashboard/plan.md` on `origin/cursor/frosted-aurora-dashboard-8dba`
- Design rules: `context/changes/dashboard-glass-restyle/design-brief.md`
- Behaviour contracts Phase 7 preserves: `context/changes/live-flow-interaction/plan.md` (Phases 2 and 3), `handoff-adapted.md`, `reviews/impl-review.md`; `docs/decisions.md` (the live-flow motion, verdict and `localStorage` entries); `docs/logic.md` (node verdicts, motion gate)
- Phase 7 code: `src/components/live/LiveFlow.tsx:156-352`, `src/components/live/FlowNode.tsx`, `src/lib/flow-geometry.ts:23-59`, `src/components/hooks/useFlowLines.ts`, `src/components/LiveStateCard.astro:58-90`, `src/components/CardHeading.astro`, `src/components/ui/DisclosureButton.tsx`, `design/Main.dc.html:34-110`, `design/Mobile.dc.html:30-83`, `screenshots/README.md` (first pass, measurement 5)
- Code: `src/pages/dashboard.astro:40-99`, `src/components/LiveStateCard.astro:20-73`, `src/components/live/LiveFlow.tsx:149-154,262-283`, `src/components/live/FlowNode.tsx:18-28`, `src/lib/services/live-state.ts:137-141,334-406`, `src/lib/services/usage-insight.ts:55-65,210-318`, `src/lib/services/bill-forecast.ts:208-224,357-413`, `src/lib/format/tone-classes.ts:6-9`, `src/styles/global.css:42-54,127-136`, `src/lib/ingest/contract.ts:12,130-140`, `src/middleware.ts:5`, `src/lib/supabase.ts:32-34`, `scripts/smoke.mjs:96-114`
- Docs to update: `docs/logic.md`, `docs/decisions.md`; unchanged: `docs/architecture.md`, `docs/prerequisites.md`; `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Palette tokens, tone consumers and the fixture dev page

#### Automated

- [x] 1.1 PR 65 is merged on the branch base and its own acceptance check passes: `git grep -nE "text-white|border-white|bg-white/|text-blue-100" -- src/components/LiveStateCard.astro src/components/BillForecastCard.astro src/components/UsageInsightCard.astro src/components/TermsExplained.astro src/pages/dashboard.astro` prints nothing and `git grep -n "bg-aurora" -- src/pages/dashboard.astro` prints one line — 508d9be
- [x] 1.2 Unit tests pass: `npm test` — 508d9be
- [x] 1.3 Linting passes: `npm run lint` — 508d9be
- [x] 1.4 Type checks pass: `npx astro check` — 508d9be
- [x] 1.5 Production build succeeds: `npm run build` — 508d9be
- [x] 1.6 No pre-move palette value remains: `git grep -nE "#7cc4f5|#e9a3d3|#9aa7c7|#6ee7b7|#fcd34d|#fca5a5|#064e3b|#78350f|#7f1d1d|#101218|#1c1f29|#08111f|#111827|#18223a|#b8c4d9|#27344f" -- src ':!src/components/Banner.astro'` prints nothing — 508d9be
- [x] 1.7 The tone surfaces no longer carry the old fade: `git grep -n "surface/60" -- src` prints nothing — 508d9be
- [x] 1.8 The design reference is saved: `test -f context/changes/dashboard-refresh-icons-sparklines/design/Main.dc.html && test -f context/changes/dashboard-refresh-icons-sparklines/design/Mobile.dc.html` — 508d9be
- [x] 1.9 The dev page is not tracked: `git ls-files src/pages/dev` prints nothing — 508d9be

#### Manual

- [ ] 1.10 The dev page renders with Supabase unset (no hang, redirect or middleware error) and without any change to the middleware or other product code
- [ ] 1.11 At 1440px and 390px the dev page's cards show the design palette (page background, card, inner surface, border, text, muted) with no clipped text
- [ ] 1.12 The PV node icon, connector and legend chip read yellow, primary violet stays on primary accents (focus ring, selected node), and a PV node rated "watch" (fixture `worse`) is still told apart from PV's yellow by its chip word and icon
- [ ] 1.13 Contrast measured on the rendered page meets the plan's table: tone chip text at least 4.5:1 on its tint over the card and over the inner surface, muted text at least 4.5:1 on card, inner surface and inset, accents at least 3:1
- [ ] 1.14 The aurora background and the header glass still read well with the new `--background` and `--flow-home` hue
- [ ] 1.15 Each dev-page scenario runs on its own clock and shows one body per load: `?scenario=fresh-full` renders a fresh live card, a bill that is not refused ("ok. 258 zł") and a current recommendation; `?scenario=stale-and-lag` a stale live card next to a fresh bill; `?scenario=other-month-and-refusals` an other-month bill; `&bill=<fixture>` swaps the bill body and `&history=failed` and `&history=empty` change the history

### Phase 2: Header, headings, status dot and footer legend

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 1d61eac
- [x] 2.2 Linting passes: `npm run lint` — 1d61eac
- [x] 2.3 Type checks pass: `npx astro check` — 1d61eac
- [x] 2.4 Production build succeeds: `npm run build` — 1d61eac
- [x] 2.5 The header carries the new copy and the sign-out form is intact: `git grep -n "Wyloguj się" -- src/components` prints the header line and `git grep -n 'action="/api/auth/signout"' -- src` prints one line — 1d61eac
- [x] 2.6 Icons are server-rendered and no new island appeared: `git --no-pager grep -nE "[[:space:]]client:(load|idle|visible|media|only)" -- "src/**/*.astro"` prints exactly four lines, `src/components/LiveStateCard.astro` (the `LiveFlow` island), `src/components/RecommendationCard.astro` and the two form islands in `src/pages/auth/signin.astro`; any other line, an icon among them, fails the check — 1d61eac
- [x] 2.7 The smoke strings never appear in new copy: `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing — 1d61eac
- [x] 2.8 The status testids are unchanged: `git grep -nE 'testId="(live|bill|usage)-status"' -- src` prints three lines — 1d61eac
- [x] 2.9 The dev page is still untracked: `git ls-files src/pages/dev` prints nothing — 1d61eac

#### Manual

- [ ] 2.10 The header at 1440px and 390px matches the artboards: logo tile, name, e-mail (hidden on the phone), "Wyloguj się" with an icon; on the phone icon-only with an accessible name; both controls at least 44px tall
- [ ] 2.11 Card headings carry the design's icons and sizes (recommendation Sparkles in primary, bill FileText in primary, usage House in the home colour, live card none) and the live badge shows the dot with unchanged text ("Dobrze · aktualne"; stale, degraded and problem states keep their words)
- [ ] 2.12 The footer legend shows three tone dots and four source icons (Panele, Bateria, Dom, Sieć), the icons match the flow nodes (grid is now TowerControl) and it wraps at 390px without overflow
- [ ] 2.13 Keyboard reaches "Wyloguj się" with a visible focus ring; the icon-only phone button has an accessible name
- [ ] 2.14 There is no horizontal page scroll at 390px in any dev-page scenario
- [ ] 2.15 At 390px, after the inset panel (`p-2 sm:p-4`), with the `worse` and `battery-low` live-flow fixtures (`?scenario=gaps` and `?scenario=few-days`), every node keeps its value, chip word and detail line unclipped (for example "Warto sprawdzić" and "85,0% oczekiwanego"), and none of the four nodes overflows or wraps outside its square
- [ ] 2.16 At 1440px the bill card sits in the right column above the usage card with the recommendation 2/3 wide; at 390px the order is live, recommendation, bill, usage; no empty row is left where the full-width bill card was and nothing overflows

### Phase 3: Sparkline helper and component

#### Automated

- [x] 3.1 Unit tests pass, including the new `src/lib/sparkline.test.ts`: `npm test` — 969cfc4
- [x] 3.2 Linting passes: `npm run lint` — 969cfc4
- [x] 3.3 Type checks pass: `npx astro check` — 969cfc4
- [x] 3.4 Production build succeeds: `npm run build` — 969cfc4
- [x] 3.5 No dependency was added or changed: `git diff --exit-code origin/main -- package.json package-lock.json` — 969cfc4
- [x] 3.6 The sparkline code has no animation, timers or hydration: `git grep -nE "animate|@keyframes|transition|setInterval|client:" -- src/lib/sparkline.ts src/components/ui/Sparkline.astro` prints nothing — 969cfc4

#### Manual

- [ ] 3.7 The dev page section renders every state: 14 full points, gaps (broken line, isolated point as a dot), exactly 3 points, 2 points and none (empty state text), all equal non-zero (flat mid-line), and the 7-day size
- [ ] 3.8 Each drawn sparkline exposes `role="img"` with its label and the accessibility tree reads min, max and last available value in Polish; the empty and unavailable states are text, not an image
- [ ] 3.9 The 2px stroke stays 2px at 96px and 120px wide and nothing is clipped at the edges
- [ ] 3.10 Stroke contrast is at least 3:1 on card and inset for each tone (table in Current State Analysis)
- [ ] 3.11 Flat series carry their caption: an all-zero series is drawn on the baseline with the visible text "bez zmian, 0,0 kWh" and an all-equal non-zero series at mid-height with the visible text of its value ("bez zmian, 3,0 kWh"); a varying series has no caption
- [ ] 3.12 The unavailable variant shows "historia niedostępna" as text, distinct from "za mało dni", with no image role

### Phase 4: Daily series in the views and the KPI and usage sparklines

#### Automated

- [x] 4.1 Unit tests pass: `npm test` — 17c04a5
- [x] 4.2 Linting passes: `npm run lint` — 17c04a5
- [x] 4.3 Type checks pass: `npx astro check` — 17c04a5
- [x] 4.4 Production build succeeds: `npm run build` — 17c04a5
- [x] 4.5 No new query: `git grep -n 'from("daily_energy")' -- src` prints exactly the two existing lines (`usage-insight.ts` and `live-state.ts`) — 17c04a5
- [x] 4.6 No migration, contract or lab change: `git diff --exit-code origin/main -- supabase docs/ingest src/lib/ingest/contract.ts` — 17c04a5
- [x] 4.7 "Z PV wykorzystane" is not rendered: `git grep -n "Z PV wykorzystane" -- src` prints nothing — 17c04a5
- [x] 4.8 The smoke strings never appear in new copy: `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing — 17c04a5

#### Manual

- [ ] 4.9 At 1440px the KPI row shows three items with icon, label, unchanged value and a 14-day sparkline; at 390px the items stack, sparklines are 96px wide, and no label or value is clipped or overflows
- [ ] 4.10 "Zużycie wczoraj" shows the two rows with 7-day sparklines and the existing delta text ("… wobec normy"); "Z PV wykorzystane" is absent
- [ ] 4.11 On the dev page: full series draw a line; missing days and null totals draw gaps, not zeros; fewer than 3 points shows "za mało dni"; empty history (`&history=empty`) shows "za mało dni" while a failed history (`&history=failed`) shows "historia niedostępna" in the KPI row, next to the chips that say "historia niedostępna"; an all-zero export series is drawn on the baseline with the visible text "bez zmian, 0,0 kWh" and the "Sprzedane do sieci dziś" value beside it is unchanged
- [ ] 4.12 The usage sparklines are labelled "7 dni do <dayLabel>" (the accessibility tree reads the compared day's label, also when the compared day is older than yesterday), the home row's subject is "Zużycie domu" and the purchase row's "Energia kupiona z sieci"
- [ ] 4.13 Hand check on a fixture: the label's last available value equals the previous day's row, today's partial value is not plotted, and the usage sparkline's last point equals the value beside it
- [ ] 4.14 A stale snapshot still renders the KPI row and its series ending the day before the capture day; the recommendation and bill cards are unaffected

### Phase 5: Bill delta and days-in-estimate bar

#### Automated

- [x] 5.1 Unit tests pass: `npm test` — e0744f4
- [x] 5.2 Linting passes: `npm run lint` — e0744f4
- [x] 5.3 Type checks pass: `npx astro check` — e0744f4
- [x] 5.4 Production build succeeds: `npm run build` — e0744f4
- [x] 5.5 The percent edge rule has one implementation: `git --no-pager grep -ln "edgePercentLabel" -- src` lists exactly `src/lib/format/edge-percent.ts`, `src/lib/format/edge-percent.test.ts`, `src/lib/services/usage-insight.ts` and `src/lib/services/bill-forecast.ts`, and `git --no-pager grep -n "Math.min(tenths" -- src ':!src/lib/services/live-state.ts'` prints exactly one line (in `edge-percent.ts`; `live-state.ts` `shareLabel` holds an older, unsigned variant of the clamp for the PV share that predates this change and is out of scope, so it is excluded) — e0744f4
- [x] 5.6 The delta is not derived from the check's own drift figure: `git grep -n "diff_pct" -- src/lib/services/bill-forecast.ts` prints one line (the closed-month check's `signedPercentLabel`) — e0744f4
- [x] 5.7 No contract or migration change: `git diff --exit-code origin/main -- supabase docs/ingest src/lib/ingest/contract.ts` — e0744f4
- [x] 5.8 Every bill testid survives: `for id in bill-status bill-unavailable-reason bill-month bill-range bill-central bill-days bill-confidence bill-basis bill-credit-left bill-closed-month-check; do git grep -q "$id" -- src/components/BillForecastCard.astro || echo "missing $id"; done` prints nothing — e0744f4
- [x] 5.9 The smoke strings never appear in new copy: `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing — e0744f4

#### Manual

- [ ] 5.10 On the dev page the delta line reads as planned for each body: `?scenario=fresh-full` (the `bill_forecast` of `docs/ingest/example-v1.json`, 257.73 vs 214.66) shows "+43 zł (+20,1%)" in the problem colour, `&bill=verdict-above-plus-20-pct` (260 vs 200) "+60 zł (+30%)" in the problem colour, `&bill=verdict-at-plus-20-pct` "+40 zł (+20,0%)" in watch, `?scenario=gaps` (`verdict-equal-to-invoice`) "bez zmian…", `?scenario=few-days` (`no-closed-month-check`) has no delta line and its badge says there is nothing to compare with, `?scenario=stale-and-lag` names "lipiec 2026", `?scenario=other-month-and-refusals` (the October read) has no delta, and `&bill=no-data-rates-unavailable`, `&bill=stale-generated-at` and `&bill=six-complete-days` keep their refusal states with no delta and no bar
- [ ] 5.11 The bar reads "15 z 30" with a half-filled track and the period text beneath it, and fits at 390px
- [ ] 5.12 The range is still the headline ("od 155 zł do 360 zł") and "ok. 258 zł" reads beneath it
- [ ] 5.13 The delta is understandable without colour (sign, arrow and words) and its text meets 4.5:1 on the card
- [ ] 5.14 The card still sits in the right column above the usage card (Phase 2 layout) with the delta line and the bar added, and nothing overflows at 1440px or 390px

### Phase 6: System balance on the flow junction

#### Automated

- [x] 6.1 Unit tests pass: `npm test` — efeaa2a
- [x] 6.2 Linting passes: `npm run lint` — efeaa2a
- [x] 6.3 Type checks pass: `npx astro check` — efeaa2a
- [x] 6.4 Production build succeeds: `npm run build` — efeaa2a
- [x] 6.5 The glossary term exists and is shown: `git grep -n "system_balance" -- src` lists the glossary and the live card — efeaa2a
- [x] 6.6 The motion, pause and geometry code is untouched: `git diff --exit-code origin/main -- src/lib/flow-geometry.ts src/components/hooks/useFlowLines.ts src/components/hooks/usePreference.ts src/lib/preferences.ts src/lib/flow-constants.ts` — efeaa2a
- [x] 6.7 The smoke strings never appear in new copy: `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing — efeaa2a

#### Manual

- [ ] 6.8 "Bilans systemu" and its value are legible at 1440px and 390px with no overlap of squares or connector lines, the sign is visible, and the value sits beside the junction icon
- [ ] 6.9 On the dev page: surplus (`+2,2 kW`), deficit (`−0,4 kW`), near zero (`0,0 kW`) and missing (`—`) states, and a stale snapshot, all render sensibly (no rating colour, no invented zero), and on the stale snapshot (`?scenario=stale-and-lag`) the balance label and value are dimmed (`opacity-45`) like the connectors while still readable
- [ ] 6.10 "Odczyty" shows the same balance as the diagram
- [ ] 6.11 Regression: pause and motion gating, reduced motion, the selected-node strip, the diagram/readings switch and the connectors behave as before this phase
- [ ] 6.12 The glossary entry reads plainly in "Co to znaczy?" and the value's accessible name includes the word nadwyżka, niedobór or zbilansowany
- [ ] 6.13 At 390px (inset padding from Phase 2) with the `worse` and `battery-low` live-flow fixtures (`?scenario=gaps` and `?scenario=few-days`) the balance label wraps to at most two lines inside the 36px row gap, the value stays on one line, and no node text or the label is clipped

### Phase 7: Flow diagram rebuild to the design

#### Automated

- [ ] 7.1 Unit tests pass, including the rewritten `src/lib/flow-geometry.test.ts` and the new `src/lib/flow-connector-state.test.ts`: `npm test`
- [ ] 7.2 Linting passes: `npm run lint`
- [ ] 7.3 Type checks pass: `npx astro check`
- [ ] 7.4 Production build succeeds: `npm run build`
- [ ] 7.5 The 2x2 placement, the 92 px junction column, the 480 px breakpoint and the 720 px stage cap are gone: `git --no-pager grep -nE "col-start-1 row-start-2|col-start-3 row-start-2|row-span-2|_92px_|max-\[480px\]|max-w-\[720px\]" -- src/components/live src/components/LiveStateCard.astro` prints nothing
- [ ] 7.6 The straight-diagonal connector and the inline direction helpers are gone and the new path function is used by the island only: `git --no-pager grep -nE "[^a-zA-Z]connector\(|const SIDE|function flowDirection|function isActive" -- src` prints nothing, and `git --no-pager grep -ln "flowPath" -- src` lists exactly `src/lib/flow-geometry.ts`, `src/lib/flow-geometry.test.ts` and `src/components/live/LiveFlow.tsx`
- [ ] 7.7 Motion, pause, preference, verdict-colour and reduced-motion code is untouched since Phase 6: `git diff --exit-code efeaa2a -- src/components/hooks/useFlowLines.ts src/components/hooks/usePreference.ts src/lib/preferences.ts src/lib/preferences.test.ts src/lib/flow-constants.ts src/styles/global.css src/lib/format/tone-classes.ts src/components/live/VerdictChip.tsx`
- [ ] 7.8 The mapper and the bill mapper, with their tests, are untouched (view model, `flows`, `verdicts`, `balance`, the 15 minute and 50 W gates): `git diff --exit-code efeaa2a -- src/lib/services/live-state.ts src/lib/services/live-state.test.ts src/lib/services/bill-forecast.ts src/lib/services/bill-forecast.test.ts`
- [ ] 7.9 The behaviour and accessibility hooks survive the rewrite: `for s in 'aria-pressed={selected}' 'aria-atomic="true"' 'aria-live="polite"' 'aria-label=' 'data-node-id={id}' 'data-flow-junction' 'data-testid="live-balance"' 'animate-flow-dash' 'usePreference(FLOW_PAUSED_KEY' 'usePreference(FLOW_VIEW_KEY' 'useFlowLines('; do git grep -qF -- "$s" -- src/components/live || echo "missing $s"; done` prints nothing
- [ ] 7.10 Test ids and the smoke copy survive: `for s in live-status live-balance live-today-period bill-status bill-range bill-central bill-delta bill-days bill-days-share; do git grep -q "$s" -- src || echo "missing $s"; done` prints nothing, `git grep -nE "Nieaktualna|Dane nieaktualne" -- src` prints nothing, and `for s in "Stan na żywo" "Zużycie wczoraj" "Prognoza rachunku" "najbardziej prawdopodobnie"; do git grep -qF -- "$s" -- src || echo "missing $s"; done` prints nothing
- [ ] 7.11 No new island and no dependency change: `git --no-pager grep -nE "[[:space:]]client:(load|idle|visible|media|only)" -- "src/**/*.astro"` prints exactly four lines and `git diff --exit-code origin/main -- package.json package-lock.json`
- [ ] 7.12 No colour literal was added: `git --no-pager grep -nE "#[0-9a-fA-F]{3,8}([^0-9a-zA-Z_-]|$)|rgba?\(|hsl\(" -- src/components/live src/components/LiveStateCard.astro src/components/LiveCardTitle.astro src/components/BillForecastCard.astro src/components/CardHeading.astro src/components/ui/DisclosureButton.tsx src/components/RecommendationCard.astro` prints nothing (a pre-existing hit that is not a colour, such as an in-page anchor, is listed and justified in the commit)
- [ ] 7.13 The small fidelity tweaks are in: `git --no-pager grep -nF "text-[30px]" -- src/components/BillForecastCard.astro` and `git --no-pager grep -nF "border-primary/45" -- src/components/ui/DisclosureButton.tsx` print one line each, and `git --no-pager grep -nF "text-[22px]" -- src/components/CardHeading.astro` prints at least two lines (the live heading's phone size and the new size)
- [ ] 7.14 The dev page is still untracked: `git ls-files src/pages/dev` prints nothing

#### Manual

- [ ] 7.15 At 1440px the live card's title row matches `Main.dc.html`: "Stan na żywo" 28px bold, the badge with its dot, and on the same row on the right the Schemat/Odczyty segmented control (36px segments, the active one tinted) and "Wstrzymaj ruch" (44px, `border-strong` outline); the controls are not on a row of their own
- [ ] 7.16 At 390px the title row matches `Mobile.dc.html`: heading and badge on one row (wrapping allowed), the segmented control filling the width of a second row with a 38px segment height, and "Wstrzymaj" beside it; the accessible name of the pause button is still "Wstrzymaj ruch" ("Wznów ruch" when paused) and the segmented buttons are still named Schemat and Odczyty with `aria-pressed`
- [ ] 7.17 At 1440px the diagram matches `Main.dc.html` region by region on the dev page (`?scenario=fresh-full`): PV alone on the left with a 64px tile and a 26px value, a 76px hub circle with the scale icon in the middle, Home, Battery and Grid in one column on the right with 56px tiles and 22px values, a chip under each value (Grid: "Bez oceny"), curved dashed connectors from PV to the hub and from the hub to each right node with arrowheads, "Bilans systemu" and its value under the hub, and no 2x2 grid, no crossing connectors and no old tinted squares
- [ ] 7.18 At 390px the diagram matches `Mobile.dc.html`: PV on the left with a 48px tile, the label "Panele" and a 17px value, a 56px hub, three right nodes with 40px tiles, short labels and 15px values, curved connectors between them, the balance label and value under the hub; chips and detail lines are not shown
- [ ] 7.19 The connectors follow the nodes when the window is resized: drag from 1440 to 390 and back, and check 360px, 640px, 641px and 768px; each connector keeps ending at the hub edge and at its node, none detaches, none crosses a node or the balance text, and no connector is drawn before the first measurement (server render shows nodes only)
- [ ] 7.20 Directions are right for the four physical cases on the dev page (`&flow=import`, `&flow=export`, `&flow=charge`, `&flow=discharge`): PV always runs PV to hub; the hub always feeds the home; grid import and battery discharge draw the arrowhead pointing at the hub and the dashes travel toward the hub, grid export and battery charge point away from the hub; a state with export and charge together (both away from the hub) matches the artboard
- [ ] 7.21 Idle, stale, unavailable and missing states read correctly: a flow under 50 W (`&flow=idle`) is a dotted grey line without arrowhead and its value reads "0,0 kW"; a stale snapshot (`?scenario=stale-and-lag`) draws dimmed static connectors with arrowheads, no verdict colours on the tiles (neutral chips "Bez oceny") and the balance dimmed at `opacity-70`; missing readings (`battery-missing`, `&balance=missing`) show "—" values, dotted connectors for the null flows and a neutral tile, never an invented zero
- [ ] 7.22 Pause and motion behave as before: with a fresh push the active connectors' dashes move and the arrowheads stay static, a flow under 50 W and a stale snapshot never move, "Wstrzymaj ruch" stops all motion and keeps the arrowheads, the choice survives a manual reload and blocked storage leaves the defaults working, and the five-minute reload still fires while paused
- [ ] 7.23 Reduced motion: with `prefers-reduced-motion: reduce` (system setting; the Browser pane cannot emulate it, so also read the computed `animation-name` of every connector path as `none`) nothing moves and all arrowheads remain
- [ ] 7.24 The selected-node strip and "Odczyty" still work: Battery is selected by default, selecting each node updates the strip (reading, direction, glossary terms, freshness) and the strip now also shows the node's verdict chip and detail; the selected tile shows a visible ring; "Odczyty" shows the same four values plus the balance tile as the diagram and the title-row controls stay visible in both views
- [ ] 7.25 Keyboard and accessibility: Tab order is Schemat, Odczyty, Wstrzymaj ruch (the title row precedes the diagram in the DOM), then PV, Home, Battery, Grid, every one shows a visible focus ring, Enter and Space select a node, `aria-pressed` follows the selection, the node accessible name is unchanged (label, reading, direction, charge level, verdict, detail), the details strip announces atomically, and the hub is not a tab stop
- [ ] 7.26 Contrast on the rendered page: chip text at least 4.5:1 on its tint, node value and label text at least 4.5:1 on the stage, tone-tinted tile borders at least 3:1 on the stage (raise the alpha if a tone is below), source icons at least 3:1, the balance value at least 4.5:1 fresh and at least 4.5:1 stale at `opacity-70`, the active segment text at least 4.5:1, and the "Pokaż szczegóły" border at least 3:1
- [ ] 7.27 No clipped or overlapping text at 390px and 360px with the `worse` and `battery-low` fixtures (`?scenario=gaps`, `?scenario=few-days`) and with a long value such as "10,5 kW" on every node, and at 640px and 641px (the breakpoint) with the chips wrapping to two lines in the narrow columns: values, labels, chips, the balance text and the connectors do not collide, and the document is not wider than the viewport
- [ ] 7.28 Touch targets: every node is a button at least 44px tall and wide at every width; the segmented segments are 36px (38px on the phone) tall inside a 44px control, which meets the 24px WCAG minimum and is the owner's sizing; "Wstrzymaj ruch" is 44px
- [ ] 7.29 On the phone the verdict is not colour-only: a rated tile shows the tone glyph on its corner, the strip and "Odczyty" show the chip word and detail, and the node's accessible name still carries them; on desktop the chip and detail line are visible under every value
- [ ] 7.30 The balance sits under the hub in every direction fixture and width and no connector passes through it; its label and value keep their reading order (label, value, then the sr-only word nadwyżka, niedobór or zbilansowany) and dim with the snapshot
- [ ] 7.31 The small tweaks: the bill range "od 155 zł do 360 zł" is 30px bold in the primary colour and wraps without clipping at 1440px and 390px with "ok. 258 zł" still beneath it, the recommendation heading is 22px, "Pokaż szczegóły" has the primary-tinted outline at 44px and keeps its chevron and expanded state, and the server-rendered HTML (view source) still contains the node values as text ("3,1 kW")
- [ ] 7.32 Nothing else regressed: the KPI row, the usage card, the bill card layout, the header and the footer legend look as they did after Phase 6, and there is no horizontal page scroll at 390px in any scenario
- [ ] 7.33 Design comparison: the artboards (`design/Main.dc.html`, `design/Mobile.dc.html`) and the dev page are opened side by side at 1440px and 390px and every remaining difference is written down in the commit message or the PR notes (expected ones: the tone-tinted tile borders, the tone legend chips under the diagram and the timestamp lines under the KPI row, the balance stacked under the hub on the phone, wrapping chips); each is fixed or accepted by the owner

### Phase 8: Screenshots, docs and cleanup

#### Automated

- [ ] 8.1 Unit tests pass: `npm test`
- [ ] 8.2 Linting passes: `npm run lint`
- [ ] 8.3 Type checks pass: `npx astro check`
- [ ] 8.4 Production build succeeds: `npm run build`
- [ ] 8.5 The contract schema has not drifted: `git diff --exit-code origin/main -- docs/ingest/contract-v1.schema.json`
- [ ] 8.6 The reduced-motion rule is unchanged from the branch base: `git --no-pager grep -c "prefers-reduced-motion" -- src/styles/global.css` prints the same count as `git --no-pager grep -c "prefers-reduced-motion" origin/main -- src/styles/global.css` prints for the base (at `e2d176b` both are 1; a different number fails), and `git --no-pager diff -G "prefers-reduced-motion|animate-flow-dash" origin/main -- src/styles/global.css` prints nothing (any output means a line of the rule or of `animate-flow-dash` changed)
- [ ] 8.7 The docs carry the new rules and decisions: `git grep -lE "Bilans systemu" -- docs/logic.md docs/decisions.md` lists both files and `git grep -lE "parkline" -- docs/logic.md docs/decisions.md` lists both files
- [ ] 8.8 The docs and change notes are formatted: `npx prettier --check docs/logic.md docs/decisions.md context/changes/dashboard-refresh-icons-sparklines/plan.md context/changes/dashboard-refresh-icons-sparklines/plan-brief.md`
- [ ] 8.9 The dev page is deleted: `test ! -e src/pages/dev/dashboard-refresh.astro`
- [ ] 8.10 The dev page never entered git: `git log --all --oneline -- src/pages/dev` prints nothing
- [ ] 8.11 The three first-pass tweaks are committed and none was reverted: `git --no-pager grep -nF "rounded-2xl" -- src/components/StatusBadge.astro`, `git --no-pager grep -nF "sm:col-span-2" -- src/components/BillForecastCard.astro` and `git --no-pager grep -nF "auto-rows-fr" -- src/components/live/LiveFlow.tsx` print one line each, and `git status --short src` shows no modified file
- [ ] 8.12 The decision reversal is recorded: `git --no-pager grep -nF "flow diagram rebuilt to the design" -- docs/decisions.md` prints one line, and `git --no-pager grep -nE "squares" -- docs/logic.md` prints nothing
- [ ] 8.13 Every screenshot is listed and none is stale: `for f in context/changes/dashboard-refresh-icons-sparklines/screenshots/*.jpg; do n=$(basename "$f" .jpg | sed -E 's/-(1440|390)$//'); command grep -q "$n" context/changes/dashboard-refresh-icons-sparklines/screenshots/README.md || echo "unlisted $f"; done` prints nothing, and `git --no-pager grep -c "second pass, after Phase 7" -- context/changes/dashboard-refresh-icons-sparklines/screenshots/README.md` prints 1 once the README is committed

#### Manual

- [ ] 8.14 Screenshots of every scenario at 1440px and 390px are saved in the change's `screenshots/` folder with a README, and show no clipped text, overlapping control or unbalanced column
- [ ] 8.15 At 390px no scenario causes horizontal page scroll (the document is not wider than the viewport)
- [ ] 8.16 With reduced motion emulated (operating system setting or browser rendering emulation) connectors are static and arrowheads remain; sparklines and the bar are static (they never animate); fresh flows still move when motion is allowed
- [ ] 8.17 Final contrast spot-check on the rendered page: chips, muted text, delta text, balance value and sparkline strokes meet the plan's table
- [ ] 8.18 `docs/logic.md` and `docs/decisions.md` describe every constant and decision above and `docs/prerequisites.md` needs no change (the PR description says so)
- [ ] 8.19 After the draft PR is opened the CI `ci` and `smoke` jobs are green (smoke still finds the four strings and neither "Nieaktualna" nor "Dane nieaktualne"; it does not run locally)
- [ ] 8.20 The first-pass screenshots were deleted and every image in the folder was taken after Phase 7's last commit (file times are later than that commit), including the per-direction diagram close-ups, the title row and the artboard side-by-sides; the README lists the remaining differences from the artboards and the three tweaks
