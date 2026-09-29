---
change_id: page-landmarks-headings
title: Main landmark and a top-level heading on every page
status: implementing
created: 2026-09-29
updated: 2026-09-29
archived_at: null
---

## Notes

Follow-up F10 from the `dashboard-refresh-icons-sparklines` implementation review (`context/archive/2026-09-29-dashboard-refresh-icons-sparklines/reviews/impl-review.md`, "F10 — The dashboard has no `<main>` and no `<h1>`"), left out of that change by the owner's triage because it predates it.

What the review found: the dashboard has no `<main>` landmark and no `<h1>`. The brand in `src/components/DashboardHeader.astro` is a `span` and the cards start at `h2`; the new `<header>` and `<footer aria-label="Legenda">` are fine and the h2/h3 order under them is consistent. Scope named by the review: landmarks and heading level across pages, so `src/layouts/Layout.astro` plus each page (`dashboard.astro`, `auth/signin.astro`, `auth/check-email.astro`), not the dashboard alone.
