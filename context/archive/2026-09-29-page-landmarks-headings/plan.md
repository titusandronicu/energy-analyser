# Main Landmark and Top-Level Heading on Every Page Implementation Plan

## Overview

Give every page exactly one `<main>` landmark and exactly one `<h1>`, with no visible change, and guard both in the CI smoke test. This closes follow-up F10 from the `dashboard-refresh-icons-sparklines` implementation review (`context/archive/2026-09-29-dashboard-refresh-icons-sparklines/reviews/impl-review.md`, "F10 — The dashboard has no `<main>` and no `<h1>`").

## Current State Analysis

- `src/layouts/Layout.astro:21-36` renders the configuration `Banner`s and the page `<slot />` directly into `<body>`; no page has a `<main>`.
- The dashboard (`src/pages/dashboard.astro:71-79` → `src/components/DashboardBody.astro:25-42`) renders a top-level `<header>` (`DashboardHeader.astro:13`), the live card, a grid of the recommendation, bill and usage cards, and a top-level `<footer aria-label="Legenda">` (`SourceLegend.astro:19-22`). Because the header and footer are not inside `<main>`, `<article>`, `<aside>`, `<nav>` or `<section>`, they carry the `banner` and `contentinfo` roles today.
- The dashboard has no `<h1>`: the brand "Energy Analyser" is a `span` (`DashboardHeader.astro:18`); every card title is an `h2` from `CardHeading.astro:25`, and the sub-headings under the recommendation are `h3` (`RecommendationCard.astro:77,96`, `RecommendationFindings.astro:22`, `RecommendationForecast.astro:24`). The h2/h3 order is consistent.
- The advice Markdown never renders heading elements: `#` lines become bold paragraphs (`src/lib/format/advice-markdown.ts:66-69`), so the lab's text cannot add a second `<h1>`.
- `Panel.astro:11` renders each card as an unnamed `<section>`, which is not a landmark; nothing changes there.
- The sign-in and check-email pages (`src/pages/auth/signin.astro:11-25`, `src/pages/auth/check-email.astro:6-23`) already have an `<h1>` ("Zaloguj się", "Sprawdź skrzynkę") but no `<main>`. Both are public: `src/middleware.ts:5` protects only `/dashboard`.
- `scripts/smoke.mjs:60-118` is a list of `[name, request, expected]` steps; `expected.contains` is a string or a list of strings the response body must include (`smoke.mjs:281`), and `request(path, { readBody: true })` reads the body (`smoke.mjs:31,43`).

## Desired End State

- `/dashboard`, `/auth/signin` and `/auth/check-email` each contain exactly one `<main>` and exactly one `<h1>`.
- On the dashboard, `<main>` wraps the live card and the card grid only; the `<header>` stays before it and the legend `<footer>` after it, so the page still exposes a banner, a main and a contentinfo landmark.
- The dashboard `<h1>` is the brand "Energy Analyser" in the header; the cards stay `h2`, their sub-sections `h3`.
- Nothing looks different at any width.
- The CI smoke test fails if any of the three pages loses its `<main>` or `<h1>`.

Verify with the accessibility tree (Browser pane `read_page`) and `npm run smoke` in CI.

### Key Discoveries:

- A single `<main>` around `<slot />` in the layout would put the dashboard header and footer inside `main` and drop their `banner`/`contentinfo` roles (`DashboardBody.astro:27,40`), which is why each page supplies its own `<main>`.
- Advice headings are bold paragraphs, not `h1`–`h6` (`advice-markdown.ts:66-69`), so the one-`<h1>` invariant does not depend on the lab's text.
- `DashboardBody.astro:21` says the page composition lives there "so /dashboard and the dev page render exactly the same body"; the dev page is gone, but the component is still the dashboard's body, so `<main>` belongs in it, not in `dashboard.astro`.

## What We're NOT Doing

- No skip link ("Przejdź do treści"); the header has one control, so the gain is small. Considered and declined in planning.
- No `<main>` in `Layout.astro` and no named header/footer slots in the layout.
- No hidden (`sr-only`) heading; the visible brand is the `<h1>`.
- No change to card heading levels, `Panel.astro`'s `<section>`, `aria-label`s on cards, or the configuration `Banner`s (they stay before `<main>`).
- No automated accessibility test (axe, Playwright); the smoke check is a substring guard, not a nesting check.
- No visual change: no class, spacing or copy edits.

## Implementation Approach

Each page wraps its own content in `<main>`, and the layout gets a comment saying so, so a future page knows to add one. The dashboard brand changes element, not styling. The smoke test gets three steps in its existing `contains` pattern. The decision goes into `docs/decisions.md` per the repository lesson "Keep the project docs in step with the code".

## Critical Implementation Details

- **User experience spec** — the `span` → `h1` swap must not change the brand's look: keep its classes exactly (`text-card-foreground text-[17px] font-semibold sm:text-xl`) and check that no global or Tailwind preflight rule gives `h1` a margin, size or weight the classes don't override. Tailwind 4 preflight resets heading `font-size` and `font-weight` to `inherit` and margins to 0, so the classes carry over, but confirm on the rendered page.
- **User experience spec** — `<main>` must not add a layout box that changes spacing. In `DashboardBody.astro` the outer column uses `space-y-6` (`:26`); wrapping the live card and grid in one `<main>` makes them a single child of that column, so the gap between the live card and the grid must be restored inside `<main>` (the same `space-y-6`), and the gaps header → main and main → footer stay `space-y-6` from the outer column. On the auth pages `<main>` replaces the existing outer `div` (keep its classes) rather than adding a wrapper.

## Phase 1: Landmarks and headings

### Overview

Add `<main>` to the dashboard body and both auth pages, make the dashboard brand the page's `<h1>`, note the per-page rule in the layout, and record the decision.

### Changes Required:

#### 1. Dashboard main landmark

**File**: `src/components/DashboardBody.astro`

**Intent**: Wrap the live card and the card grid in one `<main>` so the dashboard has a main landmark, leaving the header and the legend footer outside it so they keep their banner and contentinfo roles.

**Contract**: DOM order inside the `max-w-[1120px]` column becomes `<DashboardHeader>` → `<main class="space-y-6">` (LiveStateCard, then the grid) → `<SourceLegend>`. No other markup or class changes; spacing is identical to today (see Critical Implementation Details). The stale comment at `:21` ("so /dashboard and the dev page render exactly the same body"; the dev page was deleted in the dashboard refresh) is reworded to say this is the dashboard's page body.

#### 2. Dashboard top-level heading

**File**: `src/components/DashboardHeader.astro`

**Intent**: Make the brand "Energy Analyser" the page's `<h1>` so the dashboard has one top-level heading above the card `h2`s.

**Contract**: The `span` at `:18` becomes `h1` with the same classes and text. No other change.

#### 3. Auth pages main landmark

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/check-email.astro`

**Intent**: Give both auth pages a main landmark around their card, so every page has one.

**Contract**: The outermost element inside `<Layout>` (`div.bg-cosmic`, `signin.astro:11`, `check-email.astro:6`) becomes `<main>` with the same classes. Their `<h1>`s are unchanged.

#### 4. Layout note

**File**: `src/layouts/Layout.astro`

**Intent**: Tell the next page author that the layout deliberately has no `<main>` and each page supplies exactly one, so the dashboard header and footer stay outside it.

**Contract**: A one- or two-line comment next to `<slot />`; no markup change. The comment says "main landmark" in words and never writes the literal tag, so check 1.6 stays a clean grep.

#### 5. Decision record

**File**: `docs/decisions.md`

**Intent**: Record why `<main>` is per page and why the dashboard `<h1>` is the brand, per the lesson "Keep the project docs in step with the code".

**Contract**: One dated entry under `## 2026-09-29` in the file's existing format (bold decision, `_Why:_`), naming F10 as the source and the rejected alternatives (main in the layout; a hidden `h1`; a skip link).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- Each page source has one `<main`: `git grep -c "<main" -- src/components/DashboardBody.astro src/pages/auth/signin.astro src/pages/auth/check-email.astro` prints `:1` for each of the three files
- The layout has no `<main`: `git grep -c "<main" -- src/layouts/Layout.astro` prints nothing
- The dashboard brand is an `h1`: `git grep -n "<h1" -- src/components/DashboardHeader.astro` prints one line containing "Energy Analyser"
- The decision is recorded: `git grep -n "F10" -- docs/decisions.md` prints at least one line

#### Manual Verification:

- On `/dashboard` (signed in, local stack) the accessibility tree shows one banner (the header), one main containing the live card and the three cards, and one contentinfo labelled "Legenda"; the main does not contain the header or the legend
- The dashboard heading outline is one `h1` "Energy Analyser", then `h2` card titles, then `h3` sub-sections, with no skipped level and no second `h1`
- `/auth/signin` and `/auth/check-email` each show one main landmark containing the card and their existing `h1`
- Nothing looks different at 1440px and 390px on all three pages: the brand's size, weight and position, and the spacing between header, live card, grid and legend, match `main` (compare with a screenshot of the current production page or the archived `fresh-full-1440.jpg` and `fresh-full-390.jpg`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. The dashboard checks (1.9, 1.10, 1.12) need a signed-in session; if the local stack (Supabase through the UGREEN relay) is not running, check them on production after the deploy. The auth-page checks need only the dev server.

---

## Phase 2: Smoke guard

### Overview

Make the CI smoke test fail if any page loses its `<main>` or `<h1>`.

### Changes Required:

#### 1. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Assert each page's HTML contains a main landmark and a top-level heading, so the F10 fix cannot silently regress.

**Contract**: Three new steps in the existing `[name, request, expected]` pattern with `readBody: true` and `contains: ["<main", "<h1"]`: one for `/auth/signin` and one for `/auth/check-email`, placed with the anonymous steps before sign-in (both pages are public, status 200); and one for `/dashboard` placed with the signed-in dashboard steps (after the fresh push, before sign-out), also expecting status 200. Existing steps are unchanged. Step names and comments describe "the main landmark" in words, not the literal tag, so check 2.2 counts exactly the three `contains` lines.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- The three steps exist: `git grep -c "<main" -- scripts/smoke.mjs` prints 3
- After the draft PR is opened the CI `ci` and `smoke` jobs are green (smoke does not run on the Mac; it needs local Supabase)

#### Manual Verification:

- The CI smoke log lists the three new step names as passed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None added: the change is markup only and the repository's unit tests cover logic in `src/lib`, not rendered pages.

### Integration Tests:

- The CI smoke test (Phase 2) requests the three pages and asserts `<main` and `<h1` in each body.

### Manual Testing Steps:

1. Start the app against local Supabase, sign in, open `/dashboard`, and read the accessibility tree: banner, main, contentinfo "Legenda"; one `h1`.
2. Open `/auth/signin` and `/auth/check-email` signed out and read their trees: one main, one `h1`.
3. Screenshot the dashboard at 1440px and 390px and compare with the archived `fresh-full` shots.

## Performance Considerations

None.

## Migration Notes

None: no data, schema, contract or external prerequisite changes; `docs/prerequisites.md` needs no change.

## References

- Source finding: `context/archive/2026-09-29-dashboard-refresh-icons-sparklines/reviews/impl-review.md` (F10)
- Screenshot baseline: `context/archive/2026-09-29-dashboard-refresh-icons-sparklines/screenshots/` (`fresh-full-1440.jpg`, `fresh-full-390.jpg`)
- Smoke step pattern: `scripts/smoke.mjs:93-114`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Landmarks and headings

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — c937cb7
- [x] 1.2 Linting passes: `npm run lint` — c937cb7
- [x] 1.3 Type checks pass: `npx astro check` — c937cb7
- [x] 1.4 Production build succeeds: `npm run build` — c937cb7
- [x] 1.5 Each page source has one `<main`: `git grep -c "<main" -- src/components/DashboardBody.astro src/pages/auth/signin.astro src/pages/auth/check-email.astro` prints `:1` for each of the three files — c937cb7
- [x] 1.6 The layout has no `<main`: `git grep -c "<main" -- src/layouts/Layout.astro` prints nothing — c937cb7
- [x] 1.7 The dashboard brand is an `h1`: `git grep -n "<h1" -- src/components/DashboardHeader.astro` prints one line containing "Energy Analyser" — c937cb7
- [x] 1.8 The decision is recorded: `git grep -n "F10" -- docs/decisions.md` prints at least one line — c937cb7

#### Manual

- [x] 1.9 On `/dashboard` (signed in, local stack) the accessibility tree shows one banner (the header), one main containing the live card and the three cards, and one contentinfo labelled "Legenda"; the main does not contain the header or the legend
- [x] 1.10 The dashboard heading outline is one `h1` "Energy Analyser", then `h2` card titles, then `h3` sub-sections, with no skipped level and no second `h1`
- [x] 1.11 `/auth/signin` and `/auth/check-email` each show one main landmark containing the card and their existing `h1` — c937cb7
- [x] 1.12 Nothing looks different at 1440px and 390px on all three pages: the brand's size, weight and position, and the spacing between header, live card, grid and legend, match `main` (compare with a screenshot of the current production page or the archived `fresh-full-1440.jpg` and `fresh-full-390.jpg`)

### Phase 2: Smoke guard

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 55090bc
- [x] 2.2 The three steps exist: `git grep -c "<main" -- scripts/smoke.mjs` prints 3 — 55090bc
- [x] 2.3 After the draft PR is opened the CI `ci` and `smoke` jobs are green (smoke does not run on the Mac; it needs local Supabase)

#### Manual

- [x] 2.4 The CI smoke log lists the three new step names as passed
