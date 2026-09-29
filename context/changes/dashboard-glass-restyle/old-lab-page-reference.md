# Old energy analyser — reference (the home lab's own dashboard)

Source: `homelab-2/apps/solar-energy-analyser/web/{index.html,style.css}` on ugreen (`/home/Funky/Dev/homelab-2/apps/solar-energy-analyser/web/`), read-only, 2026-09-28. This is "the lab page" referenced throughout `docs/logic.md` and the bill-forecast change — a plain HTML/JS/CSS dashboard the home lab serves directly, reading Home Assistant/Deye/PGE data with no auth, no Supabase, no Astro. It predates and runs independently of the `energy-analyser` Astro app this restyle targets. Pulled per the user's request to take inspiration from it, not to port its scope.

Confirmed live at `http://192.168.50.30:3020/` (fetched 2026-09-28): byte-identical markup to the ugreen source file, same `?v=20260722-5` asset version — this is the deployed instance of the same static page, reachable directly on the LAN. Not a different, third "old energy analyser".

**Feature surface beyond styling** (for context, not for this restyle's scope): the page also computes/displays a "signal list" (kolejka spostrzeżeń — anomalies worth checking), a battery reserve/strategy panel with a Deye Time-of-Use consumption plan, PGE-vs-inverter reconciliation, and hourly consumption-anomaly detection. None of this is in the current Astro app. The design brief for this change explicitly excludes "new energy calculations" and "new charts requiring unavailable history" — so these are noted as _possible future feature ideas_ for a separate change (e.g. a future roadmap slice), not something this restyle should attempt to port. Flag for the user's roadmap, not for `/10x-plan` here.

## Color tokens (`:root` in `style.css`)

```css
color-scheme: dark;
--bg: #090d12;
--panel: rgba(24, 30, 38, 0.56); /* translucent glass panel */
--panel-2: rgba(255, 255, 255, 0.075);
--panel-3: rgba(255, 255, 255, 0.12);
--text: #f4f7f8;
--muted: #a7b4b8;
--line: rgba(255, 255, 255, 0.13);
--solar: #ffd166; /* amber — PV/solar figures */
--battery: #7be495; /* green — battery figures */
--grid: #6bd6ff; /* blue — grid figures */
--cost: #ff9f7a; /* orange — money figures */
--warn: #f3c969;
--bad: #ff7d8b;
--violet: #b8a7ff; /* interactive accent — close to the design brief's primary #B5A3F5 */
--glass-shadow: 0 22px 60px rgba(0, 0, 0, 0.36);
--r-lg: 28px;
--r-md: 20px;
--r-sm: 14px;
--r-pill: 999px;
```

Notable: the lab page color-codes by **data category** (solar=amber, battery=green, grid=blue, cost=orange), not by status/tone (good/watch/problem). That's a different philosophy from the current Astro app's `StatusTone` system (`src/lib/format/status.ts`), which is tone-based and deliberately pairs every color with a text label. Reconcile explicitly in planning — don't silently adopt category-coding over the app's existing (and more accessible) tone system; the design brief's proposed tokens are tone/role-based like the current app, not category-based like the lab page.

The glass panel (`--panel: rgba(24, 30, 38, 0.56)` + `--glass-shadow`) and the violet accent are the most directly reusable pieces of inspiration — they land very close to the brief's own "smoked glass" direction and proposed `primary`.

## Structure (`index.html`)

Far denser than the Astro dashboard: header with live HA snapshot status, an interactive control strip (period/tariff/battery-reserve/scenario controls — **not applicable**, the Astro app has no such controls and this restyle must not add any), a KPI grid, a "flow board" showing solar → home → battery → grid as radial-ring nodes with a live "eksport/import" mode chip, then a long stack of analysis panels (PGE CSV reconciliation table, source health, trends, battery timeline, LLM briefing, micro-analyses, hourly usage anomalies).

The **flow board** (radial rings per node: Panele / Dom / Bateria / Sieć, each showing a live W value with a percentage ring) is the one structural idea worth carrying into the "Stan na żywo" card — it's a clean way to show all four live metrics as equally-weighted peers, which is exactly what the design brief's `Stan na żywo` section asks for. Note the tension: the design brief explicitly says "avoid... decorative energy-flow animations." The lab page's rings are static state (not animated) — a CSS `--pct` custom property driving a ring fill, no motion — so they don't violate that rule, but confirm this reading during planning rather than assuming it.

Everything past the flow board (PGE reconciliation, LLM briefing, micro-analyses, Deye TOU planning, anomaly detection) is **out of scope** for this restyle — the Astro app doesn't have this data surface, and the brief's scope section explicitly excludes new charts requiring unavailable history and new energy calculations.

## Verdict for planning

Use as inspiration for: the glass-panel treatment, the violet accent, and the "four equal live metrics" flow-board layout idea for `Stan na żywo`.
Do not port: the category-based color coding (keep the app's tone-based `StatusTone` system), the interactive scenario/tariff controls, or any of the deeper analysis panels (PGE reconciliation, LLM briefing, etc.) — those are a different app with a different scope.
