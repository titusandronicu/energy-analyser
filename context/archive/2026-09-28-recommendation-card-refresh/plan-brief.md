# Recommendation Card Refresh — Plan Brief

> Full plan: `context/changes/recommendation-card-refresh/plan.md`
> Research: `context/changes/recommendation-card-refresh/research.md`
> Owner decisions: `context/changes/recommendation-card-refresh/change.md`

## What & Why

Make `Rekomendacja na dziś` answer the owner's question at a glance: the first block of the advice, an always-visible "Najważniejsze ustalenia" block (title, fact and a severity chip with word and icon per lab finding) and the PV forecast for today and tomorrow, all inside one card, with the rest behind "Pokaż szczegóły". A current recommendation gets a short CSS-only fade; an older one stays static and never looks live.

## Starting Point

The card prints the whole advice text and hides findings as bare fact strings in a disclosure (`RecommendationCard.astro:37-81`); the forecast is a separate card (`ForecastCard.astro`) in the right column. `view.findings` is `string[]` (facts only). The findings block never existed in code, so this is new UI, not a revert. No recommendation fixtures exist and `push-fixture.mjs` cannot set `recommendation.generated_at`.

## Desired End State

Top to bottom: status and generation time, the lead of the advice, findings with chips ("Warto sprawdzić", "Dobrze", "Informacja" or "Bez oceny"), the inline forecast with the "jeszcze nie wiadomo" badge, one disclosure with a chevron holding the remaining advice, each finding's meaning and check, extra findings and the model, then the advisory sentence. `ForecastCard` is gone, the right column keeps the usage card, and colours come only from tokens. Seven committed fixture states are screenshotted at 1440px and 390px; on a stale card the finding chips are neutral but keep their words.

## Key Decisions Made

| Decision         | Choice                                                                                                                   | Why (1 sentence)                                                                | Source              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------- |
| Findings UI      | New block: title and fact always; meaning and suggested check in the disclosure                                          | Findings were never visible before; the lab sends all four fields               | Research / Owner    |
| Severity         | warn to watch, ok to good, info and unknown neutral, chip with word and icon, no `problem`, no categories                | The lab has severity but no category, and colour must never stand alone         | Research / Owner    |
| Chip words       | "Warto sprawdzić", "Dobrze", "Informacja" (info), "Bez oceny" (unknown)                                                  | Distinguishes a lab note from an unreadable severity                            | Plan                |
| Finding guards   | Keep a finding with a non-blank `title` or `fact`; wrong types are missing; 500-character cap; case-insensitive severity | Pushed jsonb is untrusted and the contract only bounds scalars                  | Plan                |
| Order and count  | Warn first, then info and unknown, then ok, stable; show 5, rest in the disclosure                                       | Keeps the always-visible block short without dropping anything                  | Plan                |
| No findings      | Omit the block, no "all is well" text                                                                                    | An empty list means missing data, since the lab always sends a fallback finding | Plan                |
| First-block rule | Lead is leading heading-like blocks plus the first block (a whole list counts as one); single block shows all            | Uses the parser's blocks and never edits the text                               | Owner / Plan        |
| Colon intro rule | A one-line paragraph ending in `:` pulls the list right after it into the lead; no length cap on the lead                | The parser splits "Zalecenia na dziś:" from its bullets; a cap would hide items | Plan review (owner) |
| Stale chips      | When `isStale`, every finding chip is neutral but keeps its severity word; motion stays on `isCurrent`                   | Colour must not claim freshness beside a "sprzed …" badge                       | Plan review (owner) |
| Forecast         | Inside the card under the findings; `ForecastCard` deleted; `isFromEarlierDay` labels kept                               | One forecast, no duplicate                                                      | Research / Owner    |
| Layout           | Keep 2:1 with the usage card alone on the right; adjust only if screenshots show it unbalanced                           | Design brief asks for the grid; screenshots decide                              | Owner / Plan        |
| Motion           | CSS only, current (`status` good) only, `isCurrent` from the mapper, reduced-motion override, no loops                   | A recommendation is not live; watch and problem stay static                     | Owner               |
| Chevron and fade | `DisclosureButton` gains a chevron; transition and fade only via an `animate` prop                                       | Other uses stay unchanged and control feedback follows the same gate            | Plan                |
| Tokens           | The 8 `text-blue-100` become `text-card-foreground` and `text-muted-foreground` (8.1:1 on the card)                      | Role tokens, contrast above 4.5:1                                               | Owner / Plan        |
| Screenshot gate  | Seven fixtures, `--generated-at` push flag, strict-parse fixture test and an uncommitted dev page, all in Phase 2        | Every manual gate has data; no Docker on the Mac; nothing temporary ships       | Plan review (owner) |
| Truncation       | Trim, then over 500 characters use the first 499 plus `…`; only the unit test reaches it                                 | Contract already caps strings at 500                                            | Plan review (owner) |
| Docs             | `docs/logic.md` and five dated `docs/decisions.md` entries; prerequisites unchanged                                      | Lessons: docs in step; no external prerequisite changes                         | Owner               |

## Scope

**In scope:** view-model findings and severity, first-block split, card structure, inline forecast and `ForecastCard` removal, disclosure chevron, token move, fixtures and push flag, temporary dev page (deleted at the end), screenshots, motion, docs.

**Out of scope:** rewriting advice, lab or contract changes (`kind` field is future work), category icons, lab `confidence`, glass on data panels, Base UI, history, other cards' literals, a test runner.

## Architecture / Approach

The pure mapper in `recommendation.ts` computes severity chips, guards, ordering, the visible cap and `isCurrent`; `advice-markdown.ts` gains a pure `splitAdviceLead`. The Astro card composes two small Astro sections (findings, forecast) and one React island (`DisclosureButton`). Motion is two CSS utilities with an unconditional reduced-motion override, applied only when `isCurrent`.

## Phases at a Glance

| Phase                                 | What it delivers                                                                                        | Key risk                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1. Data layer                         | Structured findings, severity mapping, stale-neutral chips, `isCurrent`, first-block split, tests       | Real advice may be one block, so nothing folds away |
| 2. Card structure, fixtures, dev page | Findings, inline forecast, disclosure, tokens, seven fixtures, `--generated-at`, fixture test, dev page | Dev page must render without Supabase; 2:1 balance  |
| 3. Screenshot gate                    | 14 screenshots at both widths, overflow, contrast and smoke-string checks                               | Long text and 390px overflow                        |
| 4. Motion, docs, cleanup              | Current-only fades, reduced-motion override, re-shoot, docs, dev page deleted                           | Reload replays the entrance every five minutes      |

**Prerequisites:** none new; the optional local push check and the CI smoke run need the UGREEN stack and the draft PR. **Estimated effort:** about 4 sessions across 4 phases.

## Open Risks & Assumptions

- Real stored advice texts are unverified: if the lab writes one paragraph without blank lines, the first-block rule shows everything and the disclosure holds only findings detail and the model.
- The always-visible block will surface financial findings (PGE arrears) on the main screen; accepted by owner decision 1.
- Placing the disclosure below the forecast separates the advice remainder from its lead; judged on screenshots, moved if it reads badly.
- A lead that is one very long list (up to the 4000-character limit) shows in full; no length cap is added because the parser's blocks give no honest cut point. Revisit only if real advice shows it.
- The dev page depends on the middleware's `getUser()` not needing the network without a session cookie (expected, checked in Phase 2); it is never committed and is deleted at the end of Phase 4.
- Lab text lacks diacritics in places and may name Forecast.Solar; shown verbatim, logged as future work.

## Success Criteria (Summary)

- The owner sees the lead advice, the findings with severity words and the forecast without opening anything, and the details behind one disclosure.
- An older recommendation never animates or looks live; reduced motion disables all motion.
- Seven states pass screenshots at 1440px and 390px, tests cover every mapping edge, CI smoke stays green and the docs match the code.
