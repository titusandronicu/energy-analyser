---
date: 2026-09-29T10:47:17+02:00
researcher: Claude (research subagent, Sonnet 5.5)
git_commit: b87aa3118790b2b009f7cdcb4a115a3f361d8e77
branch: feat/recommendation-card-refresh
repository: energy-analyser
topic: "What the recommendation card shows today, and what it takes to bring back always-visible findings and an inline forecast in the current design system"
tags: [research, codebase, RecommendationCard, ForecastCard, recommendation, design-system, tone-tokens]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (research subagent, Sonnet 5.5)
---

# Research: Recommendation card refresh

**Date**: 2026-09-29T10:47:17+02:00
**Researcher**: Claude (research subagent, Sonnet 5.5)
**Git Commit**: b87aa3118790b2b009f7cdcb4a115a3f361d8e77 (main after PR #58; the working tree adds only the untracked `context/changes/recommendation-card-refresh/`)
**Branch**: feat/recommendation-card-refresh
**Repository**: energy-analyser

## Research Question

What does the recommendation card show today, and what would it take to (1) bring back the always-visible findings block ("Najważniejsze ustalenia") and the inline forecast (today and tomorrow kWh with confidence) into the redesigned dashboard, keeping only observations, missing data, sources and model behind "Pokaż szczegóły"; (2) restyle it in the current design system (tokens, shared tone classes, Radix `Button`, lucide-react) with subtle, freshness-aware motion that respects reduced motion, using Carbon Atlas only as inspiration; (3) keep the design-brief rules (advice text not rewritten, advisory notice, generation time separate from live time, an older recommendation never looks live).

## Summary

1. **"Bring back" is inaccurate: the always-visible findings block never existed in this repository.** The string "Najważniejsze ustalenia" occurs only in `change.md` (searched `src/`, `docs/`, `context/`, `scripts/`, and `git log --all -S` over the 170 commits on this clone: no code hit). Before the glass restyle (`3a564ba^`) the card showed the full advice text, a forecast `<dl>` inside the card, and the findings inside a collapsed native `<details>` "Na podstawie". Today (`RecommendationCard.astro:64-81`) the findings sit behind `DisclosureButton` and the forecast lives in a separate card (`ForecastCard.astro`). So the work is new UI, not a revert.
2. **Findings are structured enough for honest severity, not for honest categories.** `view.findings` is `string[]`, built only from `facts.local_findings[].fact` (`recommendation.ts:81-88`). The contract stores each finding as a free-form record of scalars (`contract.ts:16-17,36`), and the only sample (`example-v1.json:38-43`) carries `severity` and `fact`. The lab producer (homelab-2 `build-energy-agent-briefing.py:64-185`, outside this repo, read only) emits per finding `severity` in {`warn`, `info`, `ok`}, `title`, `fact`, `meaning`, `suggested_check`, and the push forwards all string keys (`push-energy-analyser.py:141-151`). There is no category field, so the mockup's trend, battery and export icons cannot be chosen from data without keyword-matching titles. Severity can drive icon and tone; `problem` cannot occur (the lab has no such level).
3. **The advice text is one free-form string, so "observations and missing data behind details" has no structured source.** The lab prompt asks for a first sentence (the main recommendation) then up to 3 observations, 3 checks for tomorrow and missing data (`run-energy-advisory.py:160-171`), but the app receives one `text` (`contract.ts:43`) and today renders all of it always (`RecommendationCard.astro:37-62`). Hiding part of it needs either block-level splitting of the parsed text (unverified against real output) or a new lab field. This is the main product question.
4. **The forecast is duplicated the moment it goes inline.** `ForecastCard` and the old inline block render the same `view.forecast` fields with the same labels (`ForecastCard.astro:20-44`). The 2:1 grid in `dashboard.astro:93-104` puts `ForecastCard` under `UsageInsightCard` in the narrow column. Inlining requires removing (or repurposing) `ForecastCard`; the right column then holds only the usage card.
5. **The design system pieces are all in place; one premise is off.** Tokens `--tone-*` and `--flow-*` (`global.css:42-53`), `TONE_CLASSES` (`tone-classes.ts:5-10`), `VerdictChip` (`VerdictChip.tsx:20-34`), the freshness-gated `animate-flow-dash` with unconditional reduced-motion override (`global.css:161-174`), Radix `Button` and lucide-react exist. But `Panel` is opaque (`bg-card`, `Panel.astro:11`); only the header uses `glass-surface` (`global.css:145-155`), by design-brief decision (data panels stay opaque). "Glass panel surface" therefore needs an owner call.

## Detailed Findings

### What the card renders today

- `RecommendationCard.astro` takes `view: RecommendationView | null`; `null` renders the load-failed badge and "Spróbuj odświeżyć stronę." (`:14-27`). Order inside the `Panel`: heading, status badge (`data-testid="recommendation-status"`) plus "Wygenerowano {generatedAtLabel}" beside it (`:19-25`); stale warning (`data-testid="stale-warning"`, only when `view.isStale`, `:31-35`); the full advice text through `parseAdviceMarkdown`, escaped segments only (`:37-62`, `data-testid="recommendation-text"`); `DisclosureButton` with findings under "Na podstawie" and `modelLabel` (`:64-81`); the advisory line (`:85-87`).
- The empty view (`kind: "empty"`) renders heading, badge and the advisory line only (`recommendation.ts:91`; card branches at `:22,29`).
- Literals: `text-blue-100` occurs 8 times in `RecommendationCard.astro` (lines 19, 23, 27, 32, 72, 73, 80, 85; variants: 2 plain, 5 `/70`, 1 `/80`). `bg-white/5` does not occur there any more (0 matches; it moved out with the forecast block in `3a564ba`). `ForecastCard.astro` has 4 `text-blue-100` lines (21, 24, 32, 40), 0 `bg-white`. The `bg-white/5` and `bg-white/10` literals remain in `LiveStateCard.astro:59` and in the neutral tone of `TONE_CLASSES` (`tone-classes.ts:9`, `border-white/15 bg-white/10 text-blue-100`).
- Token mapping that already exists in the repo: secondary text `text-blue-100/60|70|80` maps to `text-muted-foreground` (`global.css:22`, used at `LiveStateCard.astro:24,29`); borders `border-border`; surfaces `bg-card`; tones `text-tone-*`, `bg-tone-*-surface`, `border-tone-*` (`global.css:127-136`). `docs/logic.md:99` records that grey notes must stay at 4.5:1 and that `/50` measured about 4:1; `--muted-foreground` `#b0b6c6` on `--card` `#1c1f29` was not re-measured here.

### The view model (`recommendation.ts`)

- `RecommendationView` `kind: "recommendation"` fields: `status`, `text`, `generatedAtLabel`, `isStale`, `isFromEarlierDay`, `forecast {todayLabel, tomorrowLabel, todayDayLabel, tomorrowDayLabel, certainty}`, `modelLabel`, `findings: string[]` (`:25-44`).
- `isStale`: more than 2 h old or generated before today in Warsaw (`:64-67`, `STALE_AFTER_MS` `:9`). `status` tones: good "aktualna" (today, within 2 h), watch "sprzed …" (today, older), problem "z <day> — dotyczy innego dnia" (earlier Warsaw day) (`:71-79`). So an old recommendation is already never "good"; `isStale` is true for both watch and problem tones (both branches of `:64-67`).
- `forecast.certainty` is always `{tone: "insufficient", label: "jeszcze nie wiadomo — prognozy zbierane od 27 września"}` regardless of the lab's `confidence` (`:15-18,111`; test `recommendation.test.ts:110-116`; `docs/logic.md:76`). The mockup's "with confidence" therefore renders an insufficient-data badge until S-11 (planned, not built).
- The forecast day labels come from the day the advice was generated, not from now (`:95-96,109-110`); `ForecastCard` switches to date-only labels when `isFromEarlierDay` (`ForecastCard.astro:25-37`). Any inline forecast must keep that rule.
- Consumers of the view outside the card: only `RecommendationCard.astro` (findings, `generatedAtLabel`, `modelLabel`, `isStale`), `ForecastCard.astro` via `dashboard.astro:99-102` (`forecast`, `isFromEarlierDay`). Unit tests pin the whole object with `toEqual` (`recommendation.test.ts:57-75`), so any new view field (severity, title, sanity checks) needs test updates in the same file.

### Findings: structure, severity, honesty

- Read path: `loadLatestRecommendation` selects `facts` as untyped jsonb (`recommendation.ts:48-57`, `types.ts:5-13`); `findingsFrom` keeps `local_findings[].fact` strings, trimmed, non-empty; everything else in each record is dropped (`:81-88`; malformed inputs return `[]`, test `:153-159`).
- Contract: `facts` is a strict object with `current_state`, `balance_today` (records) and `local_findings`, `sanity_checks` (arrays of records, at most 50 items each; values number, string of at most 500 chars, boolean or null) (`contract.ts:16-17,33-38`). Because a record's keys are free, `severity`, `title`, `meaning`, `suggested_check` already pass validation and are stored; nothing in the contract names or enumerates them.
- Sample: `example-v1.json:38-49` has one finding `{severity: "info", fact: ...}` and one sanity check `{name: "power_balance", status: "ok"}` (different key names than the lab's own checks, which use `severity`/`title`/`fact`; `build-energy-agent-briefing.py:262-275`).
- Producer (homelab-2, checked read-only, not part of this repo, so the shape may change without a contract error): `severity` values seen in the file are `warn`, `info`, `ok` (`:64-185`); `ok` appears only for the fallback finding "Brak pilnych anomalii" when no other finding exists (`:174-181`). Text is Polish without diacritics ("Slabsza prognoza PV na jutro", "Oddano dzis") and one finding still names Forecast.Solar (`:88-93`) although the forecast source is Solcast since 2026-09-26 (`docs/logic.md:107`). `meaning` and `suggested_check` are the lab's deterministic rule text, not LLM output. One finding kind is financial ("Zalegla platnosc PGE", with a PLN balance, `:117-127`); today it sits behind the disclosure, an always-visible block would surface it on the main screen.
- Consequence for tone: severity maps naturally to `warn` -> watch, `ok` -> good, `info` -> neutral; no `problem` level exists, and an unknown or missing severity must fall to neutral. Colour must not be the only signal (design brief; `VerdictChip.tsx:19` comment; `docs/logic.md:27`). Green must not double for "fresh" and "good performance" without wording (design brief line 63): the card status badge already uses good for "aktualna", so a green `ok` finding needs its own word.
- Consequence for icons: no structured category exists (searched `severity`, `sanity_checks`, `local_findings` across `src/`, `docs/`, `context/`, `scripts/`: only the contract, example and archived plans). Trend, battery and export icons from the mockup would require matching `title` text or a new lab field. The design brief forbids fragile text splitting (`design-brief.md:44`).

### Forecast: split between card, page and duplicates

- `forecast` is built inside `toRecommendationView` and passed to `ForecastCard` from `dashboard.astro:99-102`; `ForecastCard` renders nothing when `null` (`:19`). It owns `TermsExplained` for `forecast`, `forecast_certainty`, `kwh` (`:47`) and the `data-testid="forecast-certainty"` badge (`:42`).
- The dashboard has two forecast-like cards on different subjects: `ForecastCard` "Prognoza produkcji" (PV kWh today and tomorrow, from the recommendation) and `BillForecastCard` "Prognoza rachunku" (PLN, from `bill_forecast`, `dashboard.astro:92`). Only the first duplicates the mockup's inline forecast tiles; the bill card is unaffected.
- Layout today: `LiveStateCard`, `BillForecastCard`, then `grid gap-6 lg:grid-cols-3` with the recommendation in `lg:col-span-2` and a `space-y-6` column of `UsageInsightCard` and `ForecastCard` (`dashboard.astro:91-104`). Moving the forecast inline leaves the right column with the usage card only; whether that column stays, or the usage card moves under the recommendation, is a layout decision to be checked on a screenshot (design brief still asks for the 2:1 grid, `design-brief.md:32`).
- Test coverage of the layout is nil: no component tests and no e2e runner in the repo (`vitest` runs `src/**/*.test.ts`; `.github/workflows/ci.yml` steps: lint, test, `astro check`, build, smoke).

### Tests and CI that depend on this card

- `scripts/smoke.mjs:92-97` pushes the example with `recommendation.generated_at` set to now and `text` set to a run-unique marker, then asserts the dashboard body contains that marker and does not contain "Nieaktualna" (a case-sensitive substring of the whole page; no such string occurs in `src/`, checked with `grep -rn`). `:98-102` asserts "Stan na żywo" and "3,1 kW" (live card). The smoke test asserts no `data-testid` and no findings or forecast string for the recommendation, so the smoke test would pass with an inline forecast and always-visible findings as long as the advice text stays in the HTML and no copy contains "Nieaktualna". Note the marker text is a single paragraph, so a first-block-visible design still passes only if the first block stays in the server-rendered HTML.
- Testids on the card: `recommendation-status`, `stale-warning`, `recommendation-text` (in `RecommendationCard.astro:21,32,37`) and `forecast-certainty` (`ForecastCard.astro:42`). A search of the whole repository (excluding `node_modules`, `dist`, `.git`, `.astro`) found no test, script or workflow that references them; only the components and the archived glass-restyle plan do. They are inert hooks today, but keep them (cheap, and a future e2e may use them).
- The advisory sentence "To tylko porada. Aplikacja niczego nie zmienia w falowniku ani w Home Assistant." is not asserted by any test (same search); it is a design-brief and `decisions.md` rule (`design-brief.md:46`).
- `recommendation.test.ts` covers stale edges, statuses, forecast day labels around midnight, certainty, malformed facts and provider labels; it must be extended for any new mapper field.

### Design system available for the restyle

- Tokens: `--tone-good|watch|problem` and `-surface`, `--flow-pv|home|battery|grid`, `--primary` (violet `#b5a3f5`), `--border`, `--muted-foreground` (`global.css:6-53,127-136`). `--chart-*` are unused shadcn defaults.
- Shared: `TONE_CLASSES` (used by `StatusBadge.astro:17` and `VerdictChip.tsx:26`); `VerdictChip` gives icon plus word for a tone (`CircleCheck`, `TriangleAlert`, `OctagonAlert`, `Minus`). It takes a `word`, so finding chips can reuse it with their own wording (for example "Uwaga", "Informacja") rather than the card-status vocabulary.
- Motion: `animate-flow-dash` is SVG stroke-dash specific; the only reduced-motion rule in the codebase is scoped to that class (`global.css:170-174`, the sole hit for `prefers-reduced-motion|motion-safe|motion-reduce` in `src/`). Any new motion utility needs its own reduced-motion override, or use of Tailwind's `motion-safe:` variant. A freshness-gated pattern exists in `live-state.ts` (`flows[x].moving = !isStale && ...`, `plan.md:73`); the recommendation equivalent is a boolean from `status.tone === "good"` or `!isStale`.
- Controls: `DisclosureButton.tsx` is generic (`openLabel`, `closeLabel`, `controlsId`, children in a `hidden` div, outline `Button`, `aria-expanded`/`aria-controls`, `:13-34`). It has no icon slot, no chevron and no animation, and its content is server-rendered (children), so hidden text stays in the HTML. `button.tsx` is Radix `Slot`-based; its focus ring classes do not render and visible focus depends on the unlayered `:focus-visible` rule (`global.css:185-194`).
- Icons: lucide-react `^1.14.0` is installed and used by auth forms and `LiveFlow.tsx`; `ShieldCheck`, `TrendingUp`, `TrendingDown`, `BatteryCharging`, `ArrowUpFromLine`, `Sunrise`, `CloudSun`, `Lightbulb`, `ListChecks`, `ChevronDown`, `Clock`, `Info`, `TriangleAlert`, `CircleCheck` were confirmed as exports in `node_modules/lucide-react/dist/lucide-react.d.ts`. `package.json` lists `lucide-react` and no Astro-native icon package (only that file was checked), so icons on server-rendered findings need a small React component (an Astro page can render a React component server-side without `client:*`, so no hydration is required for static icons) or inline SVG.
- Glass: only the header uses `glass-surface` (`dashboard.astro:79`, `global.css:145-155`, with `@supports` fallback). `Panel` is `rounded-panel border border-border bg-card` (`Panel.astro:11`). The design brief says main data panels stay readable without blur (`design-brief.md:11`).

### Screenshot gate without a runner

- Precedent: `live-flow-interaction` pushed fixtures with `scripts/push-fixture.mjs --file scripts/fixtures/live-flow/<name>.json`, rendered them on a temporary dev page, and saved 12 JPEGs under `context/changes/live-flow-interaction/screenshots/` (`screenshots/README.md`); the full dashboard with real recommendation was not screenshotted then.
- No recommendation fixture exists: the four `scripts/fixtures/live-flow/*.json` contain no `recommendation` key (checked with a JSON load); `scripts/fixtures/bill-forecast/` has 11 bill-only files. The only recommendation body is `docs/ingest/example-v1.json` (generated 2026-09-23, one info finding, forecast 18.6 and 9.2 kWh, confidence "medium", provider ollama, model gemma3:4b, `:16-51`), which today reads as "earlier day" (problem tone).
- `push-fixture.mjs` rewrites only `bill_forecast.generated_at` and shifts `daily_history` days; it does not rewrite `recommendation.generated_at` (`push-fixture.mjs:110-135`). `smoke.mjs:56` does its own rewrite. To reach fresh, watch (today, over 2 h) and problem (earlier day) states a new flag or per-fixture generation is needed; also `public.recommendations` keeps the first push per `generated_at` (`on conflict (generated_at) do nothing`, migration `20260925151509_daily_forecast.sql:77-89`) and the dashboard reads the newest by `generated_at` (`recommendation.ts:49-55`), so states must be pushed oldest first or the local table reset between states.
- `live-flow-fixtures.test.ts` globs only `scripts/fixtures/live-flow/`; new recommendation fixtures need a similar strict-parse test (`contract.ts` is strict, so a wrong key fails). Whole-body pushes are local-only by default (`push-fixture.mjs:82-93`); Docker for Supabase runs on the UGREEN per dev-hub rules.
- Cheaper alternative used before: render the real mapper and card on a temporary dev page with in-memory fixtures (no DB), which the plan for live-flow recorded as the actual method (`plan.md:322`).
- States worth capturing at 1440 px and 390 px: fresh with findings of each severity, fresh with no findings, stale today (watch), earlier day (problem, date-only forecast labels), forecast values missing ("—"), empty (`kind: "empty"`), load failed (`null`), long finding text, and reduced motion (the browser pane could not emulate it previously, `screenshots/README.md`).

## Code References

- `src/components/RecommendationCard.astro:14-27` - null view, header, badge, generation time
- `src/components/RecommendationCard.astro:37-62` - advice text always rendered in full, escaped segments
- `src/components/RecommendationCard.astro:64-81` - `DisclosureButton` with findings and model label
- `src/components/RecommendationCard.astro:85-87` - advisory notice
- `src/components/ForecastCard.astro:19-49` - the separate forecast card, testid `forecast-certainty`, `TermsExplained`
- `src/pages/dashboard.astro:91-104` - card order and the 2:1 grid
- `src/lib/services/recommendation.ts:25-44` - `RecommendationView`
- `src/lib/services/recommendation.ts:64-79` - `isStale`, earlier day, status tones
- `src/lib/services/recommendation.ts:81-88` - `findingsFrom` (only `fact`)
- `src/lib/services/recommendation.test.ts:57-75,153-159` - whole-object assertions, malformed facts
- `src/lib/ingest/contract.ts:16-17,33-52` - fact records, `facts`, `recommendation`
- `docs/ingest/example-v1.json:16-51` - the only recommendation example
- `src/lib/format/advice-markdown.ts:33-79` - block parser (paragraph, list, heading-as-bold)
- `src/lib/format/tone-classes.ts:5-10` - shared tone classes, neutral literals
- `src/components/live/VerdictChip.tsx:20-34` - icon plus word chip
- `src/components/ui/DisclosureButton.tsx:13-34` - controlled disclosure
- `src/components/ui/Panel.astro:11` - opaque panel surface
- `src/styles/global.css:42-53,127-136,145-155,161-194` - tokens, glass utility, motion, focus rule
- `scripts/smoke.mjs:47-58,92-102` - recommendation assertions
- `scripts/push-fixture.mjs:110-135` - what gets rewritten on push
- `supabase/migrations/20260925151509_daily_forecast.sql:77-89` - recommendation insert, once per `generated_at`
- homelab-2 `build-energy-agent-briefing.py:64-185`, `push-energy-analyser.py:141-151`, `run-energy-advisory.py:160-171` - lab finding shape, key pass-through, prompt structure (outside this repo)

## Architecture Insights

- House pattern: pure mapper in `src/lib/services/` computes every rule and is unit-tested; Astro cards are dumb renderers; React islands only for interaction (`live-flow-interaction/plan.md:43`). A findings severity mapping and a "motion allowed" flag belong in `recommendation.ts` with tests, not in the template.
- The card and page treat "null" (load failed), "empty" and "recommendation" separately; the refresh must keep all three states and keep other cards independent (`dashboard.astro:18-27`).
- Honesty rules that constrain the design: an older recommendation is never good (`recommendation.ts:71-79`); forecast certainty is not invented (`:15-18`); labels name the advice's own days (`:95-96`); missing values show a dash (`recommendation.test.ts:139-146`). Motion or "live" affordances on a recommendation therefore have to be gated on `status.tone === "good"` at most, and a recommendation is never "live" in the sense of the flow diagram (it is narrated about hourly, `recommendation.ts:8`).
- Content constraint: the lab's finding and advice text is Polish without diacritics in places and can name outdated sources; the app displays it verbatim by policy (design brief: not rewritten). The refresh can promote or hide text but must not edit it.
- Carbon Atlas: not opened in this research (no network access used); the handoff summary in `live-flow-interaction/handoff-adapted.md:3` and the `change.md` note are the only inputs. Nothing from it is needed for the plan beyond ideas already recorded (shared section heading through `Panel`, role tokens, calm states, an Atlas-style disclosure).

## Historical Context (from prior changes)

Each item scored separately against the current code.

- `context/archive/2026-09-23-todays-recommendation/plan.md` (built S-01): card shows text, forecast, findings under "Na podstawie", advisory footer. Advisory footer: **still valid** (`RecommendationCard.astro:85-87`). Inline forecast and native `<details>` findings: **superseded** by `3a564ba`.
- `context/archive/2026-09-23-todays-recommendation/reviews/impl-review.md` F1/F2: text rendered as a safe Markdown subset via `advice-markdown.ts` (**still valid**, `RecommendationCard.astro:38`); the lab prompt was to lead with one sentence, the main recommendation (**partly supported**: the prompt now says so, `run-energy-advisory.py:160-162`, compliance of stored texts not verified here).
- `context/archive/2026-09-26-data-period-transparency/plan.md:128,161`: recommendation status tones, forecast day labels, certainty always insufficient until S-11 (**still valid**, `recommendation.ts:15-18,71-79`; `docs/logic.md:74-76,93,95`).
- `context/changes/dashboard-glass-restyle/design-brief.md:40-46`: show the main paragraph, then one disclosure with the full observations, checks for tomorrow, missing data, evidence, model; keep generation time visible beside the status; do not rewrite advice; keep the advisory; no `Apply settings`; never make an older recommendation look live. **Partly implemented**: generation time and advisory yes; the "main paragraph only by default" part was not (the whole text is visible, `RecommendationCard.astro:37-62`) because the plan only moved findings into the disclosure (`dashboard-glass-restyle/plan.md:127,159-165`). The brief also says to report a content-model limitation instead of splitting text (`design-brief.md:44`); that limitation is exactly the open question 1 below.
- `context/changes/dashboard-glass-restyle/plan.md:22,42`: `findings`/`forecast` were already structured, template-only split; forecast extracted to `ForecastCard` (**still valid** as history; the extraction is what this change would partly undo).
- `context/changes/live-flow-interaction/handoff-adapted.md:75-83` and `plan.md:32-40`: owner decisions of 2026-09-29: `--flow-*` tokens, Radix `Button` kept (Base UI rejected), `lucide-react`, freshness-gated motion, tone tokens shared by badges and chips, `localStorage` only for view and pause; the recommendation card is explicitly out of that change and its literals deferred (`plan.md:37`; `handoff-adapted.md:71`). **All still valid**; the Radix decision is in `docs/decisions.md` 2026-09-29.
- `context/changes/recommendation-card-refresh/change.md:14-16`: the 2026-09-29 decision (findings always visible, forecast inline, details keep observations, missing data, sources, model) and "8 occurrences" of literals. Occurrence count **supported** (8 `text-blue-100`); the `bg-white/*` part is **contradicted** for this file (0 matches); the "restore" framing is **contradicted** (finding 1). The mockup itself is not stored in the repository (searched `context/`, `docs/`, `.ai/`, `.claude/`), so its details are known only through the text of `change.md` and `handoff-adapted.md:81`.
- `docs/decisions.md` 2026-09-29 entries (freshness-gated motion, shared tone tokens, Radix `Button` kept, `localStorage` as first persistence): **still valid**. `context/foundation/lessons.md`: docs stay in step (this change adds a logic rule for finding severity, so `docs/logic.md` and `docs/decisions.md` change in the same PR), external prerequisites are named (a lab change would need `docs/prerequisites.md`), plan before implementing (open questions go to the owner first).

## Related Research

- `context/changes/live-flow-interaction/research.md` (token, motion and persistence findings; sign convention)
- `context/changes/dashboard-glass-restyle/research.md` (literal-colour audit; recommendation data model at lines 80-82)

## Open Questions

Each has a recommendation; the owner decides (lessons.md: defaults only when the owner says so).

1. **What does "observations and missing data behind Pokaż szczegóły" mean, given the advice is one free-text string?** Options: (a) keep the whole text visible and put only sanity checks and model behind the details (no split, but the owner's wording is not met); (b) show the first text block (the lab's "main recommendation" sentence) and put the remaining blocks behind the details, falling back to showing everything when the text has a single block or does not start with a paragraph; (c) ask the lab for structured fields (`summary`, `observations`, `missing_data`) through a homelab-2 change plus `docs/prerequisites.md`. Recommendation: (b) now, block-level only through the existing parser, nothing dropped or edited, the disclosure holds the remainder; note (c) as the durable fix. Unverified: whether real stored texts start with the one-sentence recommendation.
2. **What is shown per finding?** Today only `fact`. The lab also sends `title`, `meaning`, `suggested_check`. Recommendation: `title` as the label and `fact` as the line, always visible; `meaning` and `suggested_check` behind the details (they are advice-like lab rule text). Financial findings (PGE arrears) would become always visible; confirm that is acceptable.
3. **Severity to tone and icon.** Recommendation: `warn` -> watch, `ok` -> good, `info` and any unknown or missing severity -> neutral; chip word per level ("Uwaga", "W porządku", "Informacja") so colour is never alone; a small pure mapper with tests; sort order warn first is a display choice, to confirm. No `problem` tone.
4. **Mockup icons (trend, battery, export) without a category field.** Recommendation: use severity icons only (`TriangleAlert`, `CircleCheck`, `Info`); do not match title keywords. Add category icons only if the lab adds a `kind` field (a free-form record accepts it without a contract change, but it is a homelab-2 change).
5. **Forecast duplication and layout.** Recommendation: render the forecast tiles inside the recommendation card, delete `ForecastCard` and its `dashboard.astro` usage (move its `TermsExplained` and the `forecast-certainty` testid with the tiles), keep the 2:1 grid with the usage card alone on the right, and judge the layout on screenshots at 1440 and 390 px. Keep the date-only labels for advice from an earlier day.
6. **Confidence display.** The badge under the tiles will read "Za mało danych · jeszcze nie wiadomo …" (`recommendation.ts:15-18`) until S-11. Recommendation: keep it exactly (no lab `confidence`), since a figure without a basis is a recorded decision (`docs/decisions.md` 2026-09-26).
7. **"Glass panel surface".** `Panel` is opaque by design-brief decision; blur is header-only. Recommendation: keep data surfaces opaque and add restraint-level glass character through tokens only (a `border` highlight, an inner tone-tinted top edge, no backdrop blur behind text), or state that the recommendation panel stays as is. Owner to choose.
8. **Motion.** Recommendation: CSS-only, no JavaScript in the Astro card: a short staggered fade and rise of the findings on first paint and a soft fade for the disclosure content, both only when `status.tone === "good"` (fresh); watch and problem states render static and muted; a new utility carries its own `prefers-reduced-motion: reduce` override like `animate-flow-dash`; no looping motion, no count-up, nothing that implies "live". The disclosure is currently unanimated (`hidden` toggle); animating height needs a wrapper change in `DisclosureButton`, which other uses share (it has one use today, `RecommendationCard.astro:64`).
9. **Generalise `DisclosureButton` or leave it.** Recommendation: extend it with an optional icon (`ChevronDown` rotating) and keep the API otherwise; keep Radix `Button` outline variant.
10. **Fixtures and screenshot gate.** Recommendation: add `scripts/fixtures/recommendation/*.json` (fresh with three severities, no findings, forecast nulls, long text) with a `--recommendation-generated-at`-style flag or minutes-ago offset in `push-fixture.mjs`, a strict-parse test alongside `live-flow-fixtures.test.ts`, and push states oldest first; or, cheaper, the temporary dev page with in-memory views as in live-flow. Owner to pick; either way no runner is added.
11. **Text quality shown verbatim.** Lab findings lack diacritics and may name Forecast.Solar. Recommendation: not fixed in the app (advice not rewritten); log a homelab-2 follow-up.
12. **Docs.** This change adds a rule (finding severity mapping, motion gate for the recommendation): `docs/logic.md` "Today's recommendation" and a dated `docs/decisions.md` entry in the same PR; `docs/prerequisites.md` only if question 1(c) or 4 asks the lab for new fields.

**Not verified**: real stored recommendation texts and findings in production; whether compliance with the lab's "first sentence" instruction holds; contrast of `--muted-foreground` on `--card` and of chips on the panel (computed values not measured here); Carbon Atlas itself (not opened); how the mockup looked (not in the repo); whether the current live production build matches `main` (it was not opened); `npm test`, `lint` and `build` were not run (read-only research).
