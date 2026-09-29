# Main Landmark and Top-Level Heading on Every Page — Plan Brief

> Full plan: `context/changes/page-landmarks-headings/plan.md`

## What & Why

Every page gets exactly one `<main>` landmark and exactly one `<h1>`, so screen-reader users can jump straight to the content and hear what the page is. This closes follow-up F10 from the dashboard refresh implementation review, which found the dashboard had neither; it predates that change, so it was split out.

## Starting Point

No page has a `<main>`: the layout puts the page straight into `<body>`. The dashboard has a top-level `<header>` and a legend `<footer>`, card titles as `h2` and sub-sections as `h3`, but its brand "Energy Analyser" is a plain `span`, so there is no `h1`. The sign-in and check-email pages already have an `h1`.

## Desired End State

The dashboard reads as banner (header with the brand as `h1`), main (live card and the three cards), contentinfo (the "Legenda" footer). The two auth pages each have a main around their card. Nothing looks different, and the CI smoke test fails if any page loses its `<main>` or `<h1>`.

## Key Decisions Made

| Decision             | Choice                                           | Why (1 sentence)                                                                                           |
| -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Where `<main>` lives | In each page, not in the layout                  | A layout-level main would swallow the dashboard header and footer and drop their banner/contentinfo roles. |
| Dashboard `<h1>`     | The visible brand "Energy Analyser" becomes `h1` | Zero visual change and no new copy; the card `h2`s sit under it.                                           |
| Regression guard     | Three smoke steps asserting `<main` and `<h1`    | Cheap CI check in the existing `contains` pattern.                                                         |
| Skip link            | Not added                                        | The header has one control, so skipping it gains little.                                                   |
| Hidden `h1` in main  | Not used                                         | It would add copy nobody sees and repeat the brand.                                                        |

## Scope

**In scope:**

- `<main>` in `DashboardBody.astro` (around the live card and card grid) and in both auth pages (replacing their outer `div`, same classes)
- The dashboard brand `span` → `h1` in `DashboardHeader.astro`, classes unchanged
- A comment in `Layout.astro` that each page supplies its own `<main>`
- A dated entry in `docs/decisions.md`
- Three smoke steps in `scripts/smoke.mjs`

**Out of scope:** skip link; layout-level main or named slots; hidden headings; card heading levels, `Panel` sections or banners; automated accessibility tooling (axe, Playwright); any visual change.

## Architecture / Approach

Markup only. Each page owns its `<main>`; on the dashboard it sits between the header and the legend footer inside the existing column, with `space-y-6` inside it so spacing stays identical. The brand swaps element, not styling (Tailwind preflight resets heading size, weight and margin, so the classes carry over). The smoke test gains three body checks: sign-in and check-email before sign-in, dashboard after the fresh push.

## Phases at a Glance

| Phase                     | What it delivers                                                    | Key risk                                                                          |
| ------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1. Landmarks and headings | `<main>` on three pages, brand as `h1`, layout note, decision entry | A spacing or brand-size shift from the new elements; caught by screenshot compare |
| 2. Smoke guard            | CI fails if any page loses `<main>` or `<h1>`                       | Smoke runs only in CI (needs local Supabase), so its result waits for the PR      |

**Prerequisites:** none (no data, schema, lab or production step).
**Estimated effort:** one short session, two commits.

## Open Risks & Assumptions

- The smoke check is a substring test: it proves the elements exist, not that they nest correctly; the manual accessibility-tree checks cover nesting.
- Assumes no global CSS styles `h1` beyond Tailwind's preflight; checked on the rendered page in Phase 1.

## Success Criteria (Summary)

- A screen reader lists banner, main and contentinfo on the dashboard, and main on both auth pages.
- Each page has one `h1`, followed on the dashboard by `h2` card titles and `h3` sub-sections.
- The pages look exactly as before, and CI smoke guards the landmarks and headings.
