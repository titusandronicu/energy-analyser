# Recommendation Card Refresh Implementation Plan

## Overview

Rebuild `Rekomendacja na dziś` (`src/components/RecommendationCard.astro`) so the owner sees, without opening anything, the first block of the advice, a new always-visible "Najważniejsze ustalenia" block (title, fact and a severity chip with word and icon for each lab finding) and the PV forecast for today and tomorrow inside the same card, while the rest of the advice, the meaning and suggested check of each finding, and the model sit behind "Pokaż szczegóły". `ForecastCard` is removed. A current recommendation gets a short CSS-only entrance and disclosure fade; an older one never animates and never looks live. Delivered in four phases: the data layer; the card structure together with the fixtures, the push flag and a temporary dev page; the screenshot gate for the static states; then motion, the second screenshot pass and docs.

## Current State Analysis

- The card renders the whole advice text always (`RecommendationCard.astro:37-62`), one `DisclosureButton` with findings as bare fact strings under "Na podstawie" plus the model label (`:64-81`), and the advisory sentence (`:85-87`). Eight `text-blue-100` literals sit on lines 19, 23, 27, 32, 72, 73, 80 and 85.
- The forecast lives in a separate card, `ForecastCard.astro:19-49` (tiles, the `forecast-certainty` badge, `TermsExplained` for `forecast`, `forecast_certainty`, `kwh`), rendered from `dashboard.astro:99-102` in the narrow column of the `lg:grid-cols-3` grid (`dashboard.astro:93-104`) under `UsageInsightCard`. It switches to date-only labels when `isFromEarlierDay` (`ForecastCard.astro:25-37`).
- `RecommendationView.findings` is `string[]`, built only from `facts.local_findings[].fact`; everything else in each record is dropped (`recommendation.ts:43,81-88`). `status` is good "aktualna" within 2 h on today's Warsaw day, watch "sprzed …" when older the same day, problem when from an earlier day (`recommendation.ts:71-79`); `isStale` covers watch and problem (`:64-67`). Forecast certainty is always the insufficient badge (`:15-18,111`). The only consumers of the view are the card and, for `forecast`, `ForecastCard` via the page.
- The contract stores each finding as a free-form record of scalars: keys up to 100 characters, values number, string of at most 500, boolean or null, at most 50 findings (`contract.ts:16-17,33-38`); the advice `text` is 1 to 4000 characters (`contract.ts:43`). `severity`, `title`, `meaning` and `suggested_check` already pass validation but are not named anywhere; the only example finding has `severity` and `fact` (`docs/ingest/example-v1.json:38-43`). The lab (homelab-2, outside this repo) sends `severity` in `warn`, `info`, `ok` (see `research.md`).
- `parseAdviceMarkdown` returns `Block[]`: a paragraph (consecutive non-blank lines, so one block even across several lines), a list (bullets or numbers, one block per contiguous list) or a heading rendered as a paragraph of one bold segment (`advice-markdown.ts:10,33-79`, heading at `:66-70`). It cannot tell a heading from a bold-only line.
- Shared pieces exist: `TONE_CLASSES` (`tone-classes.ts:5-10`), `VerdictChip` with icon and word per tone (`VerdictChip.tsx:6-11,20-34`), tokens `--tone-*` and `--flow-*` (`global.css:42-53`), the freshness-gated `animate-flow-dash` with an unconditional reduced-motion override (`global.css:157-174`), Radix `Button` and `DisclosureButton` (no icon, no animation, children in a `hidden` div, `DisclosureButton.tsx:13-34`), lucide-react `^1.14.0`. `Panel` is opaque (`Panel.astro:11`); only the header uses `glass-surface` (`global.css:143-155`).
- No recommendation fixture exists (`scripts/fixtures/` holds `bill-forecast/` and `live-flow/` only). `push-fixture.mjs` rewrites `captured_at` and `bill_forecast.generated_at` but not `recommendation.generated_at` (`push-fixture.mjs:98-129`), and the flag pattern to copy is `--captured-at` (`:49-59`). The table keeps the first push per `generated_at` and the dashboard reads the newest by `generated_at` (`recommendation.ts:49-55`). `src/lib/ingest/live-flow-fixtures.test.ts` is the fixture-test precedent.
- `scripts/smoke.mjs:51-56,96` pushes a recommendation generated now with a run-unique text and asserts the page contains it and does not contain "Nieaktualna"; `:101` asserts "Stan na żywo", "3,1 kW" and no "Dane nieaktualne". No test or script references the card testids. CI runs lint, test, `astro check`, build and smoke (`.github/workflows/ci.yml`).

## Desired End State

On `/dashboard` the recommendation card shows, top to bottom: heading, status badge and "Wygenerowano …" (separate from the live card's time); a stale note when applicable; the lead of the advice (its first block, with a leading heading kept); "Najważniejsze ustalenia" (each finding: title, fact, chip with word and icon: "Warto sprawdzić" watch, "Dobrze" good, "Informacja" or "Bez oceny" neutral); the forecast for today and tomorrow with the "jeszcze nie wiadomo" certainty badge and its "Co to znaczy?"; "Pokaż szczegóły" with a chevron that follows `aria-expanded`; the advisory sentence. The disclosure holds the remaining advice blocks, each finding's meaning and suggested check, findings beyond the visible five, and the model label. Advice with a single block shows in full and the disclosure holds the rest. A current recommendation animates in once; watch and problem recommendations are static and unchanged in meaning. On a stale card (earlier day, or older than 2 h) every finding chip is neutral in colour but keeps its severity word, so colour never claims freshness. `ForecastCard` is gone, the right column keeps `UsageInsightCard`, and colours come only from role and tone tokens.

Verify with the automated checks per phase, seven committed fixture states screenshotted at 1440px and 390px (rendered through a temporary dev page that is never committed), and the CI smoke run on the draft PR.

### Key Discoveries:

- "Najważniejsze ustalenia" never existed in code, so this is new UI, not a revert (`research.md`, summary 1; recorded in `change.md`).
- A finding carries honest severity but no category: no icon is chosen from title text (owner decision; a lab `kind` field is a separate change).
- Blocks are the only structure the advice text offers, and one paragraph can hold several sentences on several lines, so "first block" can equal the whole text; the rule must fall back to showing everything (`advice-markdown.ts:73-75`).
- `severity: "ok"` appears only for the lab's fallback finding, so a green chip must not read as the card's own "aktualna" badge: it carries its own word "Dobrze".
- Smoke asserts absence of the substrings "Nieaktualna" and "Dane nieaktualne" on the whole page; new copy must not contain either.
- The muted role colour `--muted-foreground` `#b0b6c6` on `--card` `#1c1f29` computes to 8.1:1, so `text-blue-100/70` and `/80` can move to `text-muted-foreground` without losing the 4.5:1 rule (`docs/logic.md`, Status colours).
- `button.tsx` focus-ring classes do not render; visible focus relies on the unlayered rule at `global.css:185-194`, so the chevron button needs no ring work.

## What We're NOT Doing

- No rewriting, regenerating, trimming or reordering of the advice text; only which blocks sit above or inside the disclosure changes.
- No backend or lab change and no new contract field. A lab `kind` field, structured `summary` and `observations`, and the lab's diacritics-free text or its remaining "Forecast.Solar" wording are future work in homelab-2, noted in `docs/decisions.md` only.
- No category icons and no keyword matching on titles; no `problem` tone for findings (the lab has no such level).
- No lab `confidence` display: the certainty badge stays "jeszcze nie wiadomo" until S-11.
- No glass or blur on the data panel (glass stays in the header), no Base UI, no history or calendar, no count-up or looping motion.
- No colour-literal cleanup in other cards, in `TermsExplained.astro` or in the neutral tone of `tone-classes.ts` (they stay as they are; the recommendation card only inherits them).
- No new test runner and no component tests; screenshots stand in.

## Implementation Approach

House pattern: a pure mapper in `src/lib/services/` computes every rule and is tested at its edges; Astro cards stay dumb; the one React island (`DisclosureButton`) owns only open state. Phase 1 changes the view model and adds the pure first-block split, with a minimal card adapter so the app keeps building and rendering. Phase 2 rewrites the card markup (two small Astro sections for findings and forecast, the token move, forecast inlining, `ForecastCard` removal, the dashboard column) and, in the same phase, makes every state reproducible (seven fixtures, a `--generated-at` push flag, a strict-parse fixture test, a temporary dev page), so each Phase 2 manual gate has data. Phase 3 is the screenshot gate for the static states, fixing layout issues the screenshots show. Phase 4 adds the motion utilities and the current-only gate, runs the second screenshot pass on the same dev page, updates the docs and deletes the dev page. Every phase is shippable on its own. The dev page is never committed: it stays untracked (never staged, always commit with explicit paths, never `git add -A`) from Phase 2 until its deletion at the end of Phase 4, so nothing is added to the repo and the evidence is the screenshots.

## Critical Implementation Details

- **Findings are untrusted.** Only the mapper reads `facts`. A finding is kept when it has a non-blank string `title` or `fact` (after trim); a wrong type counts as missing; otherwise it is dropped. Text handling is "trim, then if the length exceeds `FINDING_TEXT_MAX_CHARS = 500` use the first 499 characters plus `…`", so the result is never longer than 500. The contract already caps scalar strings at 500, so a contract-valid row can never reach this branch; only the unit test does. Severity is read case-insensitively after trim; anything not `warn`, `ok` or `info` (missing, number, unknown word) is `unknown`. Existing behaviour for non-object facts (`[]`) stays.
- **The first-block rule (owner decision 2).** From `parseAdviceMarkdown` blocks: the lead is every leading heading-like block (a paragraph with one line and one bold-only segment, which is also how `#` headings are parsed) plus the first block after them, whatever its type (a paragraph, or a whole list). Colon rule: if the lead's last block is a paragraph of one line whose trimmed text ends in `:` and the next block is a list, that list joins the lead (the parser flushes a paragraph when a list item starts, so "Zalecenia na dziś:" and its bullets are two blocks, and the actionable items must not be hidden behind the intro line). Only that one list is added; a multi-line paragraph ending in `:` does not trigger it. Everything after the lead is the remainder. If the text has no block after the headings (empty, or headings only) or the lead is the last block, the remainder is empty, everything is shown and the advice adds nothing to the disclosure. This includes an advice that is one very long list: the lead is then the whole list (up to the 4000-character text limit). No length cap for the lead is added, because the parser's blocks give no honest place to cut (a cap would hide list items or edit the text); see Open Risks in the brief. The text is never edited.
- **Stale findings are neutral (owner, plan review).** `isStale` (earlier day, or older than 2 h; that is, status watch or problem) sets every finding's chip tone to neutral (`insufficient`) but keeps the severity word ("Warto sprawdzić", "Dobrze", "Informacja", "Bez oceny"), so a green "Dobrze" never sits beside a "sprzed …" or "dotyczy innego dnia" badge. Chip icon follows the tone, so it is the neutral icon. Ordering still follows the real severity rank. Motion stays gated on `isCurrent`, not on this rule.
- **Server-rendered details.** The disclosure content stays in the HTML (children of `DisclosureButton` with `hidden`), so smoke can still find the advice marker; a single-paragraph marker text is a lead by the rule above.
- **Current means good.** `isCurrent` is true exactly when `status.tone === "good"` (today, within 2 h). All motion hangs on it; watch and problem never animate.
- **Push ordering for fixtures.** The table keeps the first push per `generated_at` and the dashboard shows the newest, so states are pushed oldest first, or the local `recommendations` table is reset between them. The script header says so, next to the `--captured-at` notes.
- **The dev page must work without the local stack.** `src/middleware.ts` (line 32 area) calls `supabase.auth.getUser()` on every non-token route. Checked: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are optional in `astro.config.mjs`, `createClient` returns null when they are unset (then `locals.user` is null, no call), and `/dev/…` is outside `PROTECTED_ROUTES`. With the variables set but no session cookie, `getUser()` is expected to return "session missing" without a network request. A Phase 2 step verifies this on the first render; product behaviour is not changed either way (if it hangs, run the dev server with the two variables unset).

## Phase 1: Data layer: structured findings, severity mapping, first-block split

### Overview

Replace `findings: string[]` with structured, guarded findings, add the `isCurrent` flag and the pure first-block split, all named-constant and tested at their edges. The card gets only a minimal adapter so nothing else changes visibly.

### Changes Required:

#### 1. Structured findings and the current flag

**File**: `src/lib/services/recommendation.ts`

**Intent**: Give the card everything it needs per finding (title, fact, meaning, suggested check, severity chip) with the rules in the mapper, plus a single `isCurrent` boolean for motion.

**Contract**: `RecommendationView` `"recommendation"` gains `isCurrent: boolean` (status tone good) and its `findings` becomes `RecommendationFinding[]` with `{ title: string | null; fact: string | null; meaning: string | null; suggestedCheck: string | null; severity: "warn" | "ok" | "info" | "unknown"; tone: StatusTone; word: string }` (at least one of `title` and `fact` is non-null), plus `moreFindings: RecommendationFinding[]` for the remainder. Named exports: `FINDING_SEVERITY_CHIP` (warn: watch, "Warto sprawdzić"; ok: good, "Dobrze"; info: neutral `insufficient`, "Informacja"; unknown: neutral `insufficient`, "Bez oceny"; no `problem` entry), `FINDING_TEXT_MAX_CHARS = 500`, `FINDINGS_VISIBLE_MAX = 5`. Order: stable by severity rank warn first, then info and unknown, then ok, so the lab's own order holds within a rank; the first `FINDINGS_VISIBLE_MAX` go to `findings`, the rest to `moreFindings`. Guards as in Critical Implementation Details. When `isStale`, each finding's `tone` is neutral (`insufficient`) and its `word` is kept from the severity (stale rule in Critical Implementation Details); `severity` itself stays the real value. `modelLabel`, `forecast`, `status`, `isStale` and `isFromEarlierDay` stay as they are.

#### 2. First-block split

**File**: `src/lib/format/advice-markdown.ts`

**Intent**: One pure function so the card does not decide what "first block" means.

**Contract**: `splitAdviceLead(blocks: Block[]): { lead: Block[]; rest: Block[] }` with the rule in Critical Implementation Details; a helper `isHeadingBlock(block)` names the heading-like test and a helper `endsWithColonIntro(block)` the one-line-paragraph-ending-in-`:` test used by the colon rule. `parseAdviceMarkdown` and `Block` are unchanged.

#### 3. Tests

**File**: `src/lib/services/recommendation.test.ts`, `src/lib/format/advice-markdown.test.ts`

**Intent**: Pin the mapping and the split at their edges and update the full-object assertions instead of leaving them failing.

**Contract**: Mapper cases: each severity word plus `"WARN "`, missing, a number and an unknown word; title only, fact only, both blank, both wrong type (dropped); `meaning` and `suggested_check` missing or non-string (null); strings of exactly 500 characters (kept as is), 501 characters (499 characters plus `…`, so 500 long) and a padded string that is over 500 only before trimming (kept untruncated); stale cases: warn and ok findings on a watch (older than 2 h) and on a problem (earlier day) recommendation get the neutral tone with their words kept ("Warto sprawdzić", "Dobrze"), while the same findings on a current one keep watch and good, and rank order is unchanged when stale; rank order with equal ranks staying in lab order; 5, 6 and 50 findings against `FINDINGS_VISIBLE_MAX`; the existing malformed-facts table (`null`, `"text"`, `[]`, non-array `local_findings`) still returns no findings; `isCurrent` at exactly 2 h (true), 2 h and 1 s (false), earlier day (false); the whole-object assertion in the "builds the Polish card" case gains the new fields. Split cases: single paragraph; two paragraphs; heading then paragraph then paragraph (lead is the heading and the first paragraph); list first (the whole list is the lead); heading only; two headings then a list; empty text; a multi-line paragraph counts as one block; colon rule: "Zalecenia na dziś:" followed by a list (the lead is the intro line and the list), the same after a leading heading, an intro line ending in `:` followed by a paragraph (no list joins), a multi-line paragraph ending in `:` followed by a list (no list joins), an intro line not ending in `:` followed by a list (no list joins), and an advice that is one very long list (the lead is the whole list, the remainder is empty, no cap).

#### 4. Minimal card adapter

**File**: `src/components/RecommendationCard.astro`

**Intent**: Keep the app compiling and unchanged in look until Phase 2.

**Contract**: The existing disclosure list renders `finding.fact ?? finding.title` for `findings` and `moreFindings`; nothing else in the template changes.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`

#### Manual Verification:

- The severity table, the stale-neutral rule and the first-block rule in the tests read as the owner decided (warn to watch, ok to good, info and unknown neutral, no problem tone; stale cards neutral with the word kept; leading heading, list and colon-plus-list rule)
- The recommendation card still renders on the owner's local stack, or in the CI `smoke` run on the draft PR, with the new view shape (findings shown as facts in the existing disclosure)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the matching checkboxes live in `## Progress`.

---

## Phase 2: Card structure, fixtures and the temporary dev page

### Overview

Rewrite the card so the lead advice, findings and forecast are always visible and the rest sits behind one disclosure with a chevron; remove `ForecastCard`; move colours to tokens. In the same phase make every state reproducible (seven fixtures, a `--generated-at` push flag, a strict-parse fixture test and a temporary dev page), so every manual gate below has data. The dev page is never committed.

### Changes Required:

#### 1. Findings section

**File**: `src/components/RecommendationFindings.astro` (new)

**Intent**: Render "Najważniejsze ustalenia" as a static list: title and fact always, the severity chip through `VerdictChip` (icon and word, shared tone classes), no category icons.

**Contract**: Props `findings: RecommendationFinding[]`; renders nothing for an empty list (no invented "all is well" copy: the lab's own fallback finding is the only "ok"). A heading `h3` "Najważniejsze ustalenia", each item with title (or the fact when there is no title), the fact when a title exists, and the chip using the finding's own `tone` and `word` from the mapper (so a stale card shows neutral chips with their words and the component holds no stale logic). Long text wraps; the list never overflows at 390px. Colours only through tokens (`text-card-foreground`, `text-muted-foreground`, `border-border`).

#### 2. Forecast section

**File**: `src/components/RecommendationForecast.astro` (new)

**Intent**: The tiles moved out of `ForecastCard` with the same labels, the certainty badge (`data-testid="forecast-certainty"`) and `TermsExplained` for `forecast`, `forecast_certainty`, `kwh`.

**Contract**: Props `forecast` and `isFromEarlierDay`; the `isFromEarlierDay` label rule is moved verbatim (date-only labels for advice from an earlier day, "dziś (…)" and "jutro (…)" otherwise). It is a sub-section of the card (`h3` "Prognoza produkcji", a top border), not a second `Panel`; literals replaced by tokens.

#### 3. The card and the disclosure

**File**: `src/components/RecommendationCard.astro`, `src/components/ui/DisclosureButton.tsx`

**Intent**: Compose the sections in the order in Desired End State and put the remainder behind the single "Pokaż szczegóły".

**Contract**: The card uses `splitAdviceLead(parseAdviceMarkdown(view.text))`, renders the lead blocks (the block rendering moves into a small local loop or component, escaped segments only, `data-testid="recommendation-text"` on the lead wrapper), then the findings, the forecast, and the disclosure containing: the remaining advice blocks (same rendering), "Co to znaczy i co sprawdzić" with each finding's meaning and suggested check (only findings that have either), "Pozostałe ustalenia" for `moreFindings`, and the model label. `controlsId` stays `recommendation-details`. The null, empty, stale-warning, status badge, generation time and advisory branches keep their behaviour and testids. All eight `text-blue-100` literals become role tokens (`text-card-foreground` for the heading, `text-muted-foreground` for notes). `DisclosureButton` gains a `ChevronDown` (lucide) placed after the label that is rotated by `group-aria-expanded:` from the button's own `aria-expanded`, keeping the Radix outline `Button`, its labels and `controlsId` API; the chevron transition and content fade are added in Phase 4, behind an optional prop so other uses are unaffected.

#### 4. Remove the old card and rewire the page

**File**: `src/components/ForecastCard.astro` (delete), `src/pages/dashboard.astro`

**Intent**: One forecast, inside the recommendation; the right column keeps the usage card.

**Contract**: Delete `ForecastCard.astro` and its import and usage (`dashboard.astro:4,99-102`); keep `lg:grid-cols-3` with the recommendation in `lg:col-span-2` and `UsageInsightCard` alone in the right column, with the column aligned to the top. Adjust only if the screenshots (Phase 3) show an unbalanced page (for example moving the usage card under the recommendation), and record the choice in `docs/decisions.md` in Phase 4.

#### 5. Fixtures

**File**: `scripts/fixtures/recommendation/*.json` (new)

**Intent**: Seven whole bodies built from `docs/ingest/example-v1.json`, each with a `recommendation` and `facts.local_findings`.

**Contract**: `current` (advice with a lead heading or paragraph plus more blocks; findings of severity warn, info and ok with title, fact, meaning and suggested check), `older-than-2h` and `earlier-day` (same content, fixed `generated_at` values for the tests; the flag moves them at push time; both show neutral chips with the words kept), `no-findings` (`local_findings: []`), `one-block` (advice of a single paragraph), `colon-list` (advice shaped "Zalecenia na dziś:" followed by a bullet list and then further paragraphs, so the colon rule is exercised), and `odd-findings` (missing title, a wrong-typed value, an unknown severity, a 500-character fact, more than five findings). Strings stay Polish, findings within the contract limits so the strict parse passes.

#### 6. Push flag

**File**: `scripts/push-fixture.mjs`

**Intent**: Push any recommendation state at any time, in the style of `--captured-at`.

**Contract**: `--generated-at <iso>` overrides `recommendation.generated_at`, validated like `--captured-at` (error text alike); without it the body's own value is kept. It exits with an error (code 1, message plus `usage`) when the body has no `recommendation`, as `--shift-days` does for a missing `daily_history` (the default state-only push strips `recommendation`, so the flag needs `--file` or `--full`), and prints a line when it rewrites the value (for example `recommendation.generated_at rewritten to <iso>`), like the `bill_forecast.generated_at` line, so a silent rewrite cannot make a state look exercised. It is independent of `--captured-at`: each sets only its own field, and the recommendation's `generated_at` may differ from `captured_at`. It is documented in the script header and in the `usage` constant (`[--generated-at <iso>]`). The header also states the table's `unique(generated_at)` rule (the first push per `generated_at` is kept, later ones are ignored) and the ordering: the dashboard shows the newest by `generated_at`, so push oldest first (earlier day, then older than 2 h, then current) or reset the local `recommendations` table between states; whole bodies are local-only, as already enforced.

#### 7. Fixture test

**File**: `src/lib/ingest/recommendation-fixtures.test.ts` (new)

**Intent**: Parse every fixture with the strict schema and assert the view model at a fixed clock, so the states each fixture promises cannot drift.

**Contract**: Glob `scripts/fixtures/recommendation/*.json`, `ingestPayloadV1.parse`, build a `RecommendationRow` from `payload.recommendation`, map at a clock chosen per file, and assert tone (good, watch, problem), `isCurrent`, finding count, severities, chip tones (neutral on the stale fixtures, words kept), lead and remainder block counts (`colon-list`: the lead holds the intro line and its list), and that `odd-findings` keeps only valid findings. Also assert the set of fixture names so a deleted file fails.

#### 8. Temporary dev page

**File**: `src/pages/dev/recommendation-fixtures.astro` (temporary, untracked, never staged or committed)

**Intent**: Render each fixture through the real mapper and card with a per-fixture clock, without a database or a session, so the Phase 2 manual gates, the Phase 3 screenshots and the Phase 4 re-shoot all use one page.

**Contract**: The page sits outside `PROTECTED_ROUTES` (`middleware.ts:5`), maps each fixture's `recommendation` with its own `now`, renders `RecommendationCard` beside a `UsageInsightCard` placeholder or the full grid, and also renders a hard-coded empty and failed view. It touches no Supabase client. It must render without the local Supabase stack: the first step is to open it with the stack down and check that the middleware does not hang or throw (see Critical Implementation Details); if it does, run the dev server with `SUPABASE_URL` and `SUPABASE_ANON_KEY` unset, and do not change the middleware or any product behaviour. The file stays in the working tree only: commit with explicit paths, check `git status` before each commit, and delete the file at the end of Phase 4. Docker and the local Supabase run on the UGREEN and are not started by the assistant; `npm run smoke` runs in CI only.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- No `ForecastCard` reference remains in the app: `git grep -n ForecastCard -- src` prints nothing
- No colour literal remains in the recommendation markup: `git grep -n --untracked -e text-blue-100 -e bg-white -- src/components/RecommendationCard.astro src/components/RecommendationFindings.astro src/components/RecommendationForecast.astro` prints nothing
- Contract schema has not drifted: `git diff --exit-code docs/ingest/contract-v1.schema.json`
- The push script parses: `node --check scripts/push-fixture.mjs`
- The fixtures are formatted: `npx prettier --check "scripts/fixtures/recommendation/*.json"`
- The dev page is not tracked: `git ls-files src/pages/dev` prints nothing

#### Manual Verification:

- The temporary dev page renders with the local Supabase stack down (no hang, no redirect, no error from the middleware), and without any change to the middleware or other product code
- On the dev page the current fixture shows generation time, the lead of the advice, "Najważniejsze ustalenia" with a chip (icon and word) per finding, then the inline forecast with the certainty badge; the `colon-list` fixture shows its intro line and bullets above the disclosure
- "Pokaż szczegóły" opens the rest of the advice, the meaning and suggested check of each finding, any findings beyond the visible five (`odd-findings`), and the model; the chevron follows the open state and keyboard focus is visible
- Advice from an earlier day shows the forecast with date labels instead of "dziś" and "jutro", and neutral finding chips that keep their words ("Warto sprawdzić", "Dobrze"); no forecast section appears when the view is empty or failed
- The 2:1 grid reads well at 1440px and 390px with only the usage card in the right column (adjust the column only if it looks unbalanced, keeping both cards)
- The advisory sentence, the generation time, the stale warning and the testids `recommendation-status`, `stale-warning`, `recommendation-text` and `forecast-certainty` are still present on the dev page
- Pushing a fixture with `--generated-at` on the owner's local stack shows the expected badge, and the flag exits with an error for a state-only push (Docker runs on the UGREEN and is not started by the assistant; the owner may defer this as in the earlier change)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. The dev page stays untracked; do not stage or commit it.

---

## Phase 3: Screenshot gate for the static states

### Overview

Capture and review screenshots of every static state through the temporary dev page from Phase 2, and fix the layout issues they show. No new files besides the screenshots and their README are committed.

### Changes Required:

#### 1. Screenshots

**File**: `context/changes/recommendation-card-refresh/screenshots/` (new), files in the recommendation card and sections only if the screenshots show a problem

**Intent**: Evidence that each state reads well at both widths, taken from the real mapper and card.

**Contract**: One screenshot per fixture at 1440px and at 390px (seven fixtures, 14 files) go in the change folder, with a README naming the method (the dev page, per-fixture clocks, the widths) and what was not captured (motion, the live stack, the empty and failed states beyond the Phase 2 check). Findings from the screenshots (overflow, cramped chips, an unbalanced right column) are fixed in this phase. The dev page is not touched in git: it stays untracked and is reused in Phase 4. Docker and the local Supabase are not started by the assistant; `npm run smoke` runs in CI only.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Screenshots of the seven fixtures at 1440px and 390px (14 files) are saved under the change's `screenshots/` folder with a README, and show no clipped text or overlapping controls
- At 390px no fixture causes horizontal page scroll (the document is not wider than the viewport; long finding text wraps)
- Chip and note contrast on the card surface is at least 4.5:1 in every state, neutral stale chips included (spot-check with a contrast tool; muted text computes to 8.1:1 in this plan)
- The rendered text of every fixture contains neither "Nieaktualna" nor "Dane nieaktualne" (the smoke assertions)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Motion, reduced motion, docs and cleanup

### Overview

Add the CSS-only entrance and disclosure fade for a current recommendation, with an unconditional reduced-motion override, re-shoot the current and stale states, bring the docs in step, and, as the final step, delete the temporary dev page.

### Changes Required:

#### 1. Motion utilities

**File**: `src/styles/global.css`

**Intent**: Two short, non-looping animations in the style of `animate-flow-dash`, carrying their own override.

**Contract**: `@keyframes card-enter` (opacity from 0, a few pixels of rise) and `@utility animate-card-enter` (about 300 ms ease-out, fill both, delay from a `--enter-delay` custom property for staggering); `@utility animate-disclose` (a fade of about 200 ms). One `@media (prefers-reduced-motion: reduce)` rule sets `animation: none` on both, unconditionally, next to the existing `.animate-flow-dash` rule. No `infinite` iteration anywhere.

#### 2. The current-only gate

**File**: `src/components/RecommendationCard.astro`, `src/components/RecommendationFindings.astro`, `src/components/RecommendationForecast.astro`, `src/components/ui/DisclosureButton.tsx`

**Intent**: Apply motion only when `view.isCurrent`, and only to the data sections, never to the advice text.

**Contract**: Findings items get `animate-card-enter` with `--enter-delay` of the item index times a named step (60 ms, at most five items) and the forecast section one fade, both only when `isCurrent`. `DisclosureButton` gets an optional `animate` prop: when true the content div carries `animate-disclose` while open and the chevron gets a rotation transition; when false or absent both are instant, so the chevron state still follows `aria-expanded`. Watch and problem recommendations pass nothing, so nothing moves (their finding chips are also neutral, by the stale rule). A page reload replays the short entrance; accepted (the page reloads every five minutes).

#### 3. Second screenshot pass

**File**: `context/changes/recommendation-card-refresh/screenshots/`

**Intent**: Re-take the screenshots that the motion change could affect, using the same untracked dev page.

**Contract**: `current`, `older-than-2h` and `earlier-day` at 1440px and 390px replace the Phase 3 files of the same names; the README notes that motion itself is judged live, not from stills.

#### 4. Docs

**File**: `docs/logic.md`, `docs/decisions.md`, `docs/prerequisites.md`

**Intent**: Keep the docs in step with the code (lessons.md).

**Contract**: `docs/logic.md` "Today's recommendation" gains what is always visible, the severity mapping and chip words, the stale-neutral chip rule, the ordering and the five-finding cap, the guards (trim then 499 plus `…` over 500), the first-block rule with the colon rule and its fall-back, the forecast placement inside the card with the `isFromEarlierDay` labelling, and the motion gate. `docs/decisions.md` gets dated 2026-09-29 entries: the findings block is new UI, not a return; severity mapping without guessed categories (with the note that a lab `kind` field would be a separate change) and neutral chips on stale cards; the first-block rule including the colon rule and the decision not to cap the lead; `ForecastCard` removed and the forecast inlined (and the layout choice made from the Phase 3 screenshots); the motion rules (current only, CSS only, reduced-motion override, data panel opaque). `docs/prerequisites.md` is unchanged: no external prerequisite changes, and the PR description says so.

#### 5. Delete the temporary dev page (final step)

**File**: `src/pages/dev/recommendation-fixtures.astro` (delete; remove `src/pages/dev/` if it is then empty)

**Intent**: Nothing temporary ships; the evidence is the screenshots.

**Contract**: Done last, after the second screenshot pass and after the docs. The page was never staged or committed, so this is a plain file deletion and leaves nothing in git history.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- The reduced-motion override is present: `git grep -n "prefers-reduced-motion" -- src/styles/global.css` lists the new rule next to the `animate-flow-dash` one

#### Manual Verification:

- A current recommendation fades in once (findings staggered, forecast, then the disclosure content on open); the older-than-2h and earlier-day recommendations render static with neutral chips; nothing loops
- With reduced motion enabled (operating system setting or browser rendering emulation) nothing animates and all content is visible at once
- Screenshots of the current and stale states are re-taken at 1440px and 390px after the motion change and replace the Phase 3 files
- `docs/logic.md` and the five dated entries in `docs/decisions.md` describe every rule above, and `docs/prerequisites.md` needs no change
- After the draft PR is opened, the CI `ci` and `smoke` jobs are green (smoke still finds the advice marker and the live text; it does not run locally)
- The temporary dev page is deleted as the last step and never entered git: `test ! -e src/pages/dev/recommendation-fixtures.astro` and `git log --all --oneline -- src/pages/dev` prints nothing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- Mapper: severity table and case handling, title and fact guards, wrong types, the trim-then-499-plus-`…` rule at 500 and 501 characters, rank order, five-finding cap, stale-neutral chips with words kept (warn and ok on watch and problem), malformed facts, `isCurrent` edges, unchanged status and stale edges.
- `splitAdviceLead`: single block, several blocks, leading heading, leading list, headings only, empty text, multi-line paragraph, the colon rule (intro line plus list, after a heading, and the non-triggering cases), one very long list.
- Fixtures: every file parses with the strict schema and yields the promised tone, chip tones, finding and block counts.

### Integration Tests:

- `npm run smoke` runs in CI only (it needs local Supabase and a signed-in user; the assistant does not start Docker or the local stack) and keeps finding the advice marker, "Stan na żywo", "3,1 kW", and neither "Nieaktualna" nor "Dane nieaktualne".

### Manual Testing Steps:

1. Render the seven fixtures on the temporary dev page (Phase 2 onwards; it renders without the local stack and is never committed) at 1440px and 390px and compare with the Desired End State.
2. Open and close "Pokaż szczegóły" with mouse and keyboard; check the chevron, focus ring and hidden content.
3. Check the earlier-day fixture for date-only forecast labels and neutral chips, and the older-than-2h fixture for a static card with neutral chips.
4. Enable reduced motion and reload a current fixture.

## Performance Considerations

No new query and no new dependency. The forecast card's markup moves into the recommendation card; the single React island stays `DisclosureButton` (`client:load`); the disclosure content is server-rendered as before (advice text up to 4000 characters, up to 50 findings). Motion is opacity and a few pixels of transform on at most seven elements, once.

## Migration Notes

None: no schema, contract or lab change; rows stored earlier render with the same fields (a finding without a title shows its fact). Rolling back is reverting the phase commits. External prerequisites: none expected; the lab's `kind` field, structured summary fields and text quality are recorded as future work only.

## References

- Related research: `context/changes/recommendation-card-refresh/research.md`
- Plan review: `context/changes/recommendation-card-refresh/reviews/plan-review.md`
- Owner decisions: `context/changes/recommendation-card-refresh/change.md`
- Format precedent: `context/changes/live-flow-interaction/plan.md`, `plan-brief.md`, `screenshots/README.md`
- Design rules: `context/changes/dashboard-glass-restyle/design-brief.md`
- Card and view: `src/components/RecommendationCard.astro:19-87`, `src/components/ForecastCard.astro:19-49`, `src/lib/services/recommendation.ts:25-116`, `src/lib/format/advice-markdown.ts:33-79`
- Shared UI: `src/lib/format/tone-classes.ts:5-10`, `src/components/live/VerdictChip.tsx:20-34`, `src/components/ui/DisclosureButton.tsx:13-34`, `src/styles/global.css:42-53,157-174`
- Contract and fixtures: `src/lib/ingest/contract.ts:16-17,33-43`, `docs/ingest/example-v1.json`, `scripts/push-fixture.mjs:12-17,33-34,49-59,98-134`, `src/lib/ingest/live-flow-fixtures.test.ts`
- Middleware for the dev page: `src/middleware.ts:5,32`
- Smoke: `scripts/smoke.mjs:51-56,96,101`
- Docs to update: `docs/logic.md` (Today's recommendation), `docs/decisions.md`, `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer: structured findings, severity mapping, first-block split

#### Automated

- [ ] 1.1 Unit tests pass: `npm test`
- [ ] 1.2 Linting passes: `npm run lint`
- [ ] 1.3 Type checks pass: `npx astro check`
- [ ] 1.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 1.5 The severity table, the stale-neutral rule and the first-block rule in the tests read as the owner decided (warn to watch, ok to good, info and unknown neutral, no problem tone; stale cards neutral with the word kept; leading heading, list and colon-plus-list rule)
- [ ] 1.6 The recommendation card still renders on the owner's local stack, or in the CI `smoke` run on the draft PR, with the new view shape (findings shown as facts in the existing disclosure)

### Phase 2: Card structure, fixtures and the temporary dev page

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Type checks pass: `npx astro check`
- [ ] 2.4 Production build succeeds: `npm run build`
- [ ] 2.5 No `ForecastCard` reference remains in the app: `git grep -n ForecastCard -- src` prints nothing
- [ ] 2.6 No colour literal remains in the recommendation markup: `git grep -n --untracked -e text-blue-100 -e bg-white -- src/components/RecommendationCard.astro src/components/RecommendationFindings.astro src/components/RecommendationForecast.astro` prints nothing
- [ ] 2.7 Contract schema has not drifted: `git diff --exit-code docs/ingest/contract-v1.schema.json`
- [ ] 2.8 The push script parses: `node --check scripts/push-fixture.mjs`
- [ ] 2.9 The fixtures are formatted: `npx prettier --check "scripts/fixtures/recommendation/*.json"`
- [ ] 2.10 The dev page is not tracked: `git ls-files src/pages/dev` prints nothing

#### Manual

- [ ] 2.11 The temporary dev page renders with the local Supabase stack down (no hang, no redirect, no error from the middleware), and without any change to the middleware or other product code
- [ ] 2.12 On the dev page the current fixture shows generation time, the lead of the advice, "Najważniejsze ustalenia" with a chip (icon and word) per finding, then the inline forecast with the certainty badge; the `colon-list` fixture shows its intro line and bullets above the disclosure
- [ ] 2.13 "Pokaż szczegóły" opens the rest of the advice, the meaning and suggested check of each finding, any findings beyond the visible five (`odd-findings`), and the model; the chevron follows the open state and keyboard focus is visible
- [ ] 2.14 Advice from an earlier day shows the forecast with date labels instead of "dziś" and "jutro", and neutral finding chips that keep their words ("Warto sprawdzić", "Dobrze"); no forecast section appears when the view is empty or failed
- [ ] 2.15 The 2:1 grid reads well at 1440px and 390px with only the usage card in the right column (adjust the column only if it looks unbalanced, keeping both cards)
- [ ] 2.16 The advisory sentence, the generation time, the stale warning and the testids `recommendation-status`, `stale-warning`, `recommendation-text` and `forecast-certainty` are still present on the dev page
- [ ] 2.17 Pushing a fixture with `--generated-at` on the owner's local stack shows the expected badge, and the flag exits with an error for a state-only push (Docker runs on the UGREEN and is not started by the assistant; the owner may defer this as in the earlier change)

### Phase 3: Screenshot gate for the static states

#### Automated

- [ ] 3.1 Unit tests pass: `npm test`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Type checks pass: `npx astro check`
- [ ] 3.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.5 Screenshots of the seven fixtures at 1440px and 390px (14 files) are saved under the change's `screenshots/` folder with a README, and show no clipped text or overlapping controls
- [ ] 3.6 At 390px no fixture causes horizontal page scroll (the document is not wider than the viewport; long finding text wraps)
- [ ] 3.7 Chip and note contrast on the card surface is at least 4.5:1 in every state, neutral stale chips included (spot-check with a contrast tool; muted text computes to 8.1:1 in this plan)
- [ ] 3.8 The rendered text of every fixture contains neither "Nieaktualna" nor "Dane nieaktualne" (the smoke assertions)

### Phase 4: Motion, reduced motion, docs and cleanup

#### Automated

- [ ] 4.1 Unit tests pass: `npm test`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Type checks pass: `npx astro check`
- [ ] 4.4 Production build succeeds: `npm run build`
- [ ] 4.5 The reduced-motion override is present: `git grep -n "prefers-reduced-motion" -- src/styles/global.css` lists the new rule next to the `animate-flow-dash` one

#### Manual

- [ ] 4.6 A current recommendation fades in once (findings staggered, forecast, then the disclosure content on open); the older-than-2h and earlier-day recommendations render static with neutral chips; nothing loops
- [ ] 4.7 With reduced motion enabled (operating system setting or browser rendering emulation) nothing animates and all content is visible at once
- [ ] 4.8 Screenshots of the current and stale states are re-taken at 1440px and 390px after the motion change and replace the Phase 3 files
- [ ] 4.9 `docs/logic.md` and the five dated entries in `docs/decisions.md` describe every rule above, and `docs/prerequisites.md` needs no change
- [ ] 4.10 After the draft PR is opened, the CI `ci` and `smoke` jobs are green (smoke still finds the advice marker and the live text; it does not run locally)
- [ ] 4.11 The temporary dev page is deleted as the last step and never entered git: `test ! -e src/pages/dev/recommendation-fixtures.astro` and `git log --all --oneline -- src/pages/dev` prints nothing
