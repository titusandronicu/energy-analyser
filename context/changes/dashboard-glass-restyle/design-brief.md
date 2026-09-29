# Dashboard glass restyle — design brief (input)

Source: pasted by the user 2026-09-28, based on the rendered dashboard inspected that day (not a repository audit). Illustrative only — verify every claim below against the actual codebase before acting on it. The user also asked to pull inspiration from the old energy-analyser design (an earlier version of this dashboard) where relevant.

## Task for the implementation agent

Restyle the existing Astro `/dashboard` as a calm, modern energy dashboard with restrained iOS-inspired glass. Use the shadcn/ui Base UI Button reference: https://ui.shadcn.com/docs/components/base/button. Preserve Polish copy, existing data semantics, authentication, calculations, freshness rules, and advisory-only behavior.

## Recommended direction: smoked glass

Keep the existing dark identity. Use a deep graphite background, slightly lighter opaque content surfaces, clear off-white text, and muted violet for interactive emphasis. Apply glass primarily to the header: translucent surface, subtle border, modest blur, and an opaque fallback. Main data panels should remain easy to read without relying on blur.

Avoid luminous outlines, saturated gradients, animated background blobs, decorative energy-flow animations, and a separate card around every label. Do not add a sidebar for a single dashboard.

## Problems visible in the current dashboard

1. Live readings use similarly sized nested tiles, making it difficult to distinguish the main metrics from supporting information.
2. Five live tiles wrap unevenly. Battery power and battery charge are separated despite describing the same device.
3. Large vertically stacked panels make yesterday's results and today's recommendation expensive to scan.
4. The recommendation is a long narrative with repeated numbered headings; its main advice is hard to locate quickly.
5. Forecast confidence and generation metadata are embedded near the end of the recommendation, far from the information they qualify.

Before implementation, map these observations to the actual route/components and record file-and-line references. Do not infer missing tokens or duplicate components from screenshots alone.

## Information hierarchy and layout

Use an approximately 1120px maximum content width, centered with 24–32px desktop gutters and 16px mobile gutters. Let the container shrink naturally.

1. **Header:** Energy Analyser at left; existing account information and a quiet `Wyloguj` action at right. Wrap cleanly on mobile. A subtle frosted header supplies the glass character.
2. **Stan na żywo:** full-width section with the existing freshness status and timestamp. Show four equally weighted metric groups: `Produkcja PV`, `Zużycie domu`, `Sieć`, and `Bateria`. Group battery percentage, charging/discharging power, and its available direction/state together. Keep explicit text for grid import/export and battery direction; do not infer direction from a rounded number.
3. **Dzisiaj:** a compact row beneath the live readings: `Z paneli`, `Kupione z sieci`, `Sprzedane do sieci`. Preserve the reporting interval. Visually separate kW (current power) from kWh (accumulated energy).
4. **Rekomendacja na dziś:** next in reading order. On wide screens, use a roughly 2:1 lower grid: recommendation on the left; yesterday's comparison and forecast stacked on the right. Collapse to one column on small screens.
5. **Zużycie wczoraj:** two clear values with their existing signed comparisons and period. Keep baseline context available through an accessible disclosure.
6. **Prognoza produkcji:** today and tomorrow side by side, with forecast confidence immediately underneath. Retain exact dates and the insufficient-data message.

For live metrics use four columns when space allows, two on small screens, and one at very narrow widths if labels otherwise wrap awkwardly. Use grid rules based on available width, not device names. Preserve DOM reading order when changing the desktop layout.

Note (2026-09-28, current codebase): the dashboard is currently `LiveStateCard` → `BillForecastCard` → `UsageInsightCard` → `RecommendationCard`, four peer sections, not the six-section hierarchy above. `BillForecastCard` (added the same day as this brief, S-07) is not mentioned in the brief at all — reconcile its place in the new hierarchy during research/planning rather than dropping it.

## Recommendation presentation

Show the existing main recommendation paragraph by default, followed by a single `Pokaż szczegóły` disclosure. Inside, retain the full observations, tomorrow's checks, missing data, and source evidence with properly structured headings/lists. Keep `Na podstawie` and model/provider metadata available within the details; keep generation time visible beside the recommendation status.

Prefer existing structured fields. If the backend returns only narrative text, do not introduce fragile sentence splitting or silently drop content to force this design. Use existing meaningful sections if available; otherwise retain the whole text and report the content-model limitation.

Do not regenerate or substantively rewrite energy advice during this UI task. Keep the advisory notice visible: the application does not modify inverter or Home Assistant settings. Do not introduce an `Apply settings` action. Preserve the difference between live reading timestamps and recommendation generation time; do not make an older recommendation appear live.

## Design tokens and shared components

First reuse the repository's existing token source and shared components. Extend that system instead of creating a second one. If no system exists, introduce a small semantic token layer and only the components this view needs.

Proposed starting values, subject to contrast verification:

- `background`: #101218; `card`: #1C1F29; `muted`: #252936.
- `foreground`: #F3F4F8; `muted-foreground`: #B0B6C6.
- `primary`: #B5A3F5; `primary-foreground`: #171222; `ring`: #D2C5FF.
- `border`: #353B4B; `destructive`: #FDA4AF.
- Glass surface: a mostly opaque version of the card color, with 12–16px backdrop blur and a solid-card fallback.
- Radius: 12px controls, 20px major panels. Spacing scale: 4, 8, 12, 16, 24, 32px.
- Body text: 16px; secondary text: 14px; main readings: 28–32px with tabular numerals. Use a system sans-serif and restrained font weights.
- Transitions: 120–180ms for interaction feedback; respect reduced motion. No animated count-up of live readings.

Store values centrally and consume semantic roles in components. Use a separate visible focus token. Status colors must also have text labels; green cannot mean both "data is fresh" and "energy performance is good" without explicit wording. Verify text, control boundaries, and focus contrast on the actual composited surfaces.

## shadcn/ui Base UI Button contract

Use the repository's shared Button implementation. If it already uses another primitive family, inspect compatibility and explain any required migration rather than mixing component families casually. The reference is React-based; verify Astro's React integration before adding it. Keep static layout in Astro and hydrate interactive React boundaries only where needed. Do not convert the whole page to React merely to restyle controls.

- `Wyloguj`: `variant="ghost"`, text label, existing logout handler. Signing out is not a destructive data action.
- `Pokaż szczegóły` / `Ukryj szczegóły`: `variant="outline"`, controlled disclosure with `aria-expanded` and `aria-controls`.
- Contextual help: `variant="ghost"`, lower visual emphasis. Existing accessible native disclosures may remain native; do not nest a button inside a summary element.
- Reserve `variant="default"` for a genuine primary action. This monitoring page may not need a filled primary button.
- Use `secondary` only where a real intermediate action exists. Do not add controls just to demonstrate variants.
- Use explicit `type="button"` for non-submit controls and `type="submit"` for existing form submissions. Preserve pending/disabled behavior and accessible names.
- For navigation, use a semantic anchor styled with `buttonVariants`. The linked Base UI documentation specifically advises against using `Button render={<a />} nativeButton={false}` for links, because the button role overrides link semantics.
- Keep icon-only buttons rare. All must have accessible names. Meet comfortable touch target sizes, approximately 44px, without relying on the visual size variant alone.

Note (2026-09-28, current codebase): the repo has no shared Button component and no shadcn/ui or React-on-Astro setup yet (`package.json` lists no `@astrojs/react`, no `shadcn`/Radix packages beyond what bill-forecast/live-state cards use — verify at research time). Introducing this is a "proposing a system" case per `/10x-ui`'s three conditions: flagged as a dependency addition, scoped to just Button, and only if the repo doesn't already have an equivalent. The two current `<button>` elements are the sign-out form submit in `dashboard.astro` and the collapsible `<summary>` disclosures (native, not buttons) — reconcile against `10x-ui`'s "don't nest a button inside a summary" rule.

## Scope and implementation sequence

1. Inspect the dashboard route, token source, shared UI, installed packages, and available data fields. Record concrete source references for the findings above.
2. Implement/reuse the semantic tokens and Button contract. Scope dashboard-specific surfaces and check any existing consumers affected by global token changes.
3. Recompose the dashboard hierarchy and responsive grid. Preserve metric definitions, units, locale formatting, signed deltas, timestamps, and baseline explanations.
4. Apply progressive disclosure to the recommendation and explanatory material without discarding information.
5. Verify the rendered dashboard and relevant states. Deliver before/after screenshots and a short implementation summary with limitations.

Exclude login redesign, new charts requiring unavailable history, new energy calculations, backend recommendation changes, and new inverter controls from this change.

## Acceptance criteria

- At a glance, a user can locate solar production, home consumption, grid direction, and battery charge/state.
- At 1440px and 390px viewport widths, there is no horizontal overflow, clipped label, overlapping control, or unreadable metadata. Check long Polish labels.
- kW and kWh remain correct and visually distinct; missing values never become zero. Existing import/export signs and comparison semantics are preserved.
- Loading, empty, partial data, stale data, and failed-source states render explicitly. Keep good readings when another source fails, and never show stale readings as fresh.
- Recommendation loading/unavailable and insufficient forecast-confidence states remain understandable.
- All buttons/disclosures work by keyboard, have visible focus, and correctly expose state. Verify hover, focus, disabled, pending, and error feedback where applicable.
- Glass has a readable opaque fallback. Do not rely on transparency, motion, or color alone to communicate state.
- Preserve existing light/dark support if present; verify both when global tokens change. A new theme switch is not required.
- Run existing relevant checks. Use the current screenshot-test setup if available; otherwise capture desktop/mobile screenshots and inspect state fixtures manually. Do not add a testing framework solely for this restyle.
- The full original recommendation, source evidence, timestamps, baseline context, and advisory limitation remain accessible.

## References

- Observed application: https://neil170-20170.mikrus.cloud/dashboard
- Required button reference: https://ui.shadcn.com/docs/components/base/button
- Astro framework components: https://docs.astro.build/en/guides/framework-components/

The proposed colors, spacing, grouping, and layout are design choices for this app, not defaults prescribed by shadcn/ui.
