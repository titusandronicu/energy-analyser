---
change_id: recommendation-card-refresh
title: Restore always-visible findings and inline forecast on the recommendation card, with a glassy refresh
status: implementing
created: 2026-09-28
updated: 2026-09-29
archived_at: null
---

## Notes

bring the currently-live recommendation card's always-visible findings and inline forecast back into the redesigned dashboard, and give it a modern glassy look with subtle animation, inspired by https://github.com/NHasan143/carbon-atlas

Adapted from the Carbon Atlas handoff (2026-09-29); the flow half is in `live-flow-interaction/handoff-adapted.md`. Ideas that apply here: shared section heading/surface structure via `Panel`, role tokens instead of literal `text-blue-100`/`bg-white/*` (8 occurrences in `RecommendationCard.astro`), calm loading/failure states that keep good sections, and the Atlas-style disclosure for details. Keep the design brief rules: advice text is not rewritten, the advisory notice stays, generation time stays separate from live time. Order: `live-flow-interaction` first, then this one; shares the token phase.

Decision 2026-09-29 (from the approved mockup in `live-flow-interaction`): the findings block ("Najważniejsze ustalenia") is always visible, the inline forecast sits under it, and only observations, missing data, sources and model stay behind "Pokaż szczegóły".

Owner decisions after research (2026-09-29; details and evidence in `research.md`):

- "Najważniejsze ustalenia" is new UI, not a return (never in code): title and fact of each `facts.local_findings` entry always visible, `meaning` and `suggested_check` behind the disclosure; severity as a chip with word and icon (warn to "Warto sprawdzić", ok to "Dobrze", info or unknown neutral), no category icons guessed from text (only if the lab adds a `kind` field).
- Advice text: first block always visible, the remaining blocks behind "Pokaż szczegóły"; with one block, show everything. Advice text itself is never rewritten.
- Forecast (today, tomorrow, certainty) moves into the recommendation card and `ForecastCard` is removed; the right column keeps the usage card; check the 2:1 layout on screenshots.
- Motion: CSS-only entrance and disclosure fade, only while the advice is current, with a reduced-motion override, no loops; data panel stays opaque (glass stays in the header).
- Reuse: `--tone-*` tokens and `tone-classes.ts`, `VerdictChip`, Radix `Button`, `DisclosureButton` (extend with a chevron), lucide icons. Screenshot gate: recommendation fixtures plus a way to rewrite `recommendation.generated_at` (or a temporary dev page); push oldest first.
