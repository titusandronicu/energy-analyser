# Screenshots: static states (Phase 3 gate)

## Method

- Source: the temporary, untracked dev page `src/pages/dev/recommendation-fixtures.astro` (`astro dev`, port 4321, no database, no session). It renders each fixture in `scripts/fixtures/recommendation/*.json` through the real `toRecommendationView` mapper and the real `RecommendationCard`, next to a placeholder panel in the same 2/3 + 1/3 grid as the dashboard.
- Per-fixture clocks: `current`, `earlier-day`, `no-findings`, `one-block`, `colon-list` and `odd-findings` are read at 2026-09-29 09:00 Europe/Warsaw; `older-than-2h` is read at 10:00 (about 3 hours after generation), so its stale chip appears.
- Widths: 1440 px (desktop, viewport 1440x900; `odd-findings` at 1440x1080 because its card is taller than 900 px) and 390 px (phone, viewport 390x1600 so the whole card fits). Each shot has the fixture's `[data-fixture]` section scrolled to the top of the viewport.
- Files: `<fixture>-1440.jpg` and `<fixture>-390.jpg` for `current`, `older-than-2h`, `earlier-day`, `no-findings`, `one-block`, `colon-list`, `odd-findings` (14 files). Browser pane screenshots are downscaled (1440 wide shots are 800 px wide). The mobile shots may show the top of the next section's card below the fixture.
- The app renders in its dark theme only; forcing `prefers-color-scheme: light` changed nothing.

## Not captured

- Motion (disclosure animation, transitions, reduced-motion behaviour).
- The live stack (real dashboard, Supabase data, a signed-in session).
- The `empty` and `failed` states beyond the Phase 2 check (they are on the dev page and were only measured for overflow and contrast, not screenshotted).
- Light theme, tablet widths, and the expanded "Pokaż szczegóły" state.
