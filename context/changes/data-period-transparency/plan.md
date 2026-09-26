# Clarity for a Non-Expert Implementation Plan

## Overview

Make the three dashboard cards readable for someone without energy knowledge, and set the rules every later card reuses: each card and verdict carries a status colour **with** a text label (green = good, amber = worth watching, red = a problem, grey = not enough data), each derived figure states the period and number of days behind it, a card shows "za mało danych" (stating what it needs) instead of a guess, and technical terms get plain labels plus a folded "Co to znaczy?" explanation. Roadmap S-14 (US-01, FR-018, FR-019, FR-029, NFR plain language).

## Current State Analysis

- The dashboard (`src/pages/dashboard.astro`) renders three server-side cards, each from a pure view-model service with unit tests: live state (`src/lib/services/live-state.ts`), usage insight (`src/lib/services/usage-insight.ts`), today's recommendation (`src/lib/services/recommendation.ts`).
- Colour has no shared meaning. The usage card colours its load status ad hoc (`src/components/UsageInsightCard.astro:19-23`: above = amber, below = green, normal = neutral); staleness and degraded notices are amber boxes; load errors are red boxes. Nothing is ever grey, and no colour carries a good/bad word.
- Periods are partly stated: the usage card names the compared day and the number of baseline days (`UsageInsightCard.astro:47-51,73-76`), but not which dates the baseline spans. Live "today" totals don't say "since midnight until <time>". Forecast figures don't name their day.
- Minimum data exists only in the usage insight: seasonal needs 20 days (`usage-insight.ts:13`), the fallback 7 of 30 (`usage-insight.ts:14-15`); below that the card says "Za mało historii do porównania." without saying what is missing.
- Forecast certainty shows the lab's optional `confidence` (`recommendation.ts:9,62,71`) or "nieznana". The lab rarely sends it and never says what it's based on; the app has no forecast history to compute it from before S-11 (forecasts count from 2026-09-27, see `docs/logic.md`).
- Recommendation staleness: more than 2 hours old or generated before today (`recommendation.ts:7,43-46`); live staleness: older than 15 minutes (`live-state.ts:7`).
- Labels use jargon: "Produkcja PV", "Sieć", "Naładowanie baterii", "kW" next to "kWh" (`LiveStateCard.astro:37-78`).
- No shared status, period or glossary helpers exist; `src/lib/format/` holds `values.ts` (kWh labels, `MISSING`) and `warsaw-time.ts` (`formatDayMonth`, `addDays`, `warsawParts`). The smoke test checks no dashboard text or test ids.

## Desired End State

Opening the dashboard, the owner sees on each card a coloured badge with a word (e.g. "Dobrze · w normie", "Warto sprawdzić · dane sprzed 40 min", "Problem · rekomendacja z 25 września", "Za mało danych"), every derived figure says which days it rests on, and each card has a "Co to znaczy?" box explaining its terms in one sentence each. A later slice builds its cards from the same status tones, badge, period formatter and glossary. Verified by unit tests on every threshold and by the owner reading the dashboard on a phone.

### Key Discoveries:

- View models are pure and tested; the cards only render them. Status and period belong in the view models so thresholds are unit-tested (`src/lib/services/*.test.ts`).
- `formatDayMonth` gives "24 września" (`src/lib/format/warsaw-time.ts:45-50`); a range formatter can build on it.
- The usage card's `deltaLabel` already handles the ±15% boundary precisely (`usage-insight.ts:79-94`); the new 40% "far above" line must follow the same "exactly at the line is the milder status" rule.
- Class names are merged with `cn()` from `@/lib/utils` (CLAUDE.md conventions); Astro components for static UI, no React needed.

## What We're NOT Doing

- Making the lab's recommendation text plainer: it is narrated in the lab (F-04, S-18).
- Computing forecast certainty from accuracy: S-11. This slice shows it as not known yet, with its basis.
- Colouring the grid-purchase figure on the usage card: it is shown with its change against the norm but not rated (ratings of self-sufficiency are S-17).
- New cards, the calendar, or any contract, lab or database change.
- A page-level colour legend: every badge carries its own word, so none is needed.
- Tooltips or client-side JavaScript for explanations: a native `<details>` element works on a phone without scripts.

## Implementation Approach

Build the shared vocabulary first (tones, badge, period text, glossary), then have each service return a `status` and period strings, then render them in the cards and update the docs. Thresholds live as exported constants next to the existing ones so tests and docs reference the same numbers.

## Phase 1: Shared building blocks

### Overview

The status tones, badge, period formatter and glossary that every card — now and in S-15/S-17/S-20 — uses.

### Changes Required:

#### 1. Status tones

**File**: `src/lib/format/status.ts` (new), `src/lib/format/status.test.ts` (new)

**Intent**: One definition of the four tones and their words, so "green" always means good and every colour carries text.

**Contract**: `export type StatusTone = "good" | "watch" | "problem" | "insufficient"`; `export interface Status { tone: StatusTone; label: string }` where `label` is the card-specific detail; `TONE_WORD: Record<StatusTone, string>` = `dobrze`, `warto sprawdzić`, `problem`, `za mało danych`. A helper `statusText(status)` returns `"<Tone word> · <label>"` (or just the tone word when the label is empty), capitalised.

#### 2. Status badge

**File**: `src/components/StatusBadge.astro` (new)

**Intent**: Render a `Status` as a pill: emerald for good, amber for watch, red for problem, grey (white/10) for insufficient, always with `statusText`. The text alone must carry the meaning (colour-blind safe).

**Contract**: Props `{ status: Status; testId?: string }`; tone → classes map merged with `cn()`; renders `data-tone={status.tone}`.

#### 3. Period text

**File**: `src/lib/format/period.ts` (new), `src/lib/format/period.test.ts` (new)

**Intent**: One way to say which days a figure is based on (FR-018).

**Contract**: `formatPeriod(dayKeys: string[]): { days: number; label: string }` for a non-empty list: `days` = unique count; `label` = `"1 dzień: 24 września"` for one day, `"18 dni: 27 sierpnia – 25 września"` for a range (first and last day, even with gaps); the year is added to both ends when the range spans two years (`"30 dni: 20 grudnia 2026 – 18 stycznia 2027"`). Throws on an empty list. Polish: 1 → "dzień", otherwise "dni".

#### 4. Glossary

**File**: `src/lib/format/glossary.ts` (new)

**Intent**: One-sentence plain-Polish explanations of the terms the cards use, kept in one place so later cards reuse the same wording.

**Contract**: `GLOSSARY: Record<GlossaryTerm, { term: string; explanation: string }>` with terms `pv` (panele słoneczne / PV), `kw` (moc teraz), `kwh` (energia w ciągu okresu), `battery_soc` (naładowanie baterii w %), `grid_import` (prąd kupiony z sieci), `grid_export` (prąd sprzedany do sieci), `norm` (średnia z porównywanych dni), `forecast` (prognoza produkcji z paneli), `forecast_certainty` (pewność prognozy). A shared `src/components/TermsExplained.astro` renders a folded `<details>` "Co to znaczy?" with the given terms as a definition list.

### Success Criteria:

#### Automated Verification:

- Unit tests for `statusText` (with and without a label) and `formatPeriod` (one day, a range with gaps, duplicates, a range across New Year, empty list throws) pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- The glossary wording reads as plain Polish to the owner (reviewed in the PR diff)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: View models

### Overview

Each service returns its card's `Status` and the period text, with the thresholds the owner chose. No markup changes yet.

### Changes Required:

#### 1. Live state

**File**: `src/lib/services/live-state.ts`, `live-state.test.ts`

**Intent**: Say how fresh the reading is in colour and words, and what period the "today" totals cover.

**Contract**: New `LIVE_PROBLEM_AFTER_MS = 2 * 60 * 60 * 1000`. The `state` view gains `status: Status`: good "aktualne" at or under 15 minutes; watch "dane sprzed <age>" over 15 minutes; problem "brak nowych danych od <age>" over 2 hours; a fresh but degraded snapshot is watch "niepełne dane z Home Assistant". Staleness wins over degraded. `today` gains `periodLabel` = `"dziś od północy do <HH:MM>"` from the capture time. The `empty` view gains `status` insufficient "laboratorium jeszcze nic nie przesłało". `isStale` / `isDegraded` stay for the existing notices.

#### 2. Usage insight

**File**: `src/lib/services/usage-insight.ts`, `usage-insight.test.ts`

**Intent**: Colour the consumption verdict by the owner's rule, name the baseline dates, and say what is missing when there is too little data.

**Contract**: New `FAR_ABOVE_THRESHOLD = 0.4`. The `insight` view gains `status: Status`: `normal` or `below` → good ("w normie" / "poniżej normy"); `above` → watch "powyżej normy"; more than 40% above → problem "dużo powyżej normy" (exactly +40% stays watch, same epsilon rule as ±15%). `baseline` gains `periodLabel` from `formatPeriod` over the baseline days actually used. The `insufficient` view becomes `{ kind: "insufficient"; status: Status; reason: string }` with status insufficient and a reason stating the need: no day with consumption in the last 7 days → "brak zużycia z ostatnich 7 dni"; too few baseline days → "potrzeba co najmniej 7 dni z ostatnich 30, jest <n>".

#### 3. Recommendation

**File**: `src/lib/services/recommendation.ts`, `recommendation.test.ts`

**Intent**: Colour the advice by age, name the forecast days, and never show a certainty without its basis.

**Contract**: The `recommendation` view gains `status: Status`: good "aktualna" when generated today within 2 hours; watch "sprzed <age>" when today but older; problem "z <day month> — dotyczy innego dnia" when generated before today (Warsaw). `forecast` gains `todayDayLabel` / `tomorrowDayLabel` (Warsaw day of `now` and the next day, via `formatDayMonth`). `forecast.confidenceLabel` is replaced by `certainty: Status` = insufficient "jeszcze nie wiadomo — prognozy zbierane od 27 września", ignoring the lab's `confidence`; export `FORECAST_HISTORY_START = "2026-09-27"` for S-11 to reuse. The `empty` view gains `status` insufficient.

### Success Criteria:

#### Automated Verification:

- Live state tests cover 15 min exactly (good), just over (watch), 2 h exactly (watch), just over (problem), degraded fresh (watch), degraded and stale (stale wins), the today period label: `npm test`
- Usage tests cover normal/below (good), +15% exactly (good), +16% (watch), +40% exactly (watch), +41% (problem), the baseline period label for seasonal and fallback, both insufficient reasons: `npm test`
- Recommendation tests cover fresh today (good), today over 2 h (watch), earlier day (problem), certainty always insufficient even when the lab sends `high`, forecast day labels around midnight Warsaw: `npm test`
- Lint and type check pass: `npm run lint`, `npx astro check`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Cards and docs

### Overview

Render the new view models, switch to plain labels, add the explanations, and move the rules into the project docs.

### Changes Required:

#### 1. Cards

**File**: `src/components/LiveStateCard.astro`, `UsageInsightCard.astro`, `RecommendationCard.astro`

**Intent**: Each card shows its `StatusBadge` under the heading, the period lines, plain labels and a `TermsExplained` box; load failures (`view === null`) show a problem badge "nie udało się wczytać" in place of the red box.

**Contract**:
- Live: labels "Prąd z paneli teraz", "Dom zużywa teraz", "Sieć teraz" (with the direction word), "Bateria teraz", "Naładowanie baterii"; the today row gets its `periodLabel` and labels "Z paneli dziś", "Kupione z sieci dziś", "Sprzedane do sieci dziś"; terms `pv`, `kw`, `kwh`, `battery_soc`, `grid_import`, `grid_export`.
- Usage: the ad hoc `STATUS` colour map is removed in favour of the badge; the baseline line shows `periodLabel` ("Średnia z 18 dni: 27 sierpnia – 25 września" / seasonal "Ta sama pora roku: …"); the insufficient state shows its reason; terms `kwh`, `norm`, `grid_import`.
- Recommendation: forecast labels "Prognoza produkcji z paneli — dziś (<day>)" / "— jutro (<day>)"; certainty as a grey badge; terms `forecast`, `forecast_certainty`, `kwh`. The advisory footer stays.

#### 2. Docs

**File**: `docs/logic.md`, `docs/decisions.md`

**Intent**: Move S-14's rules from "Planned" into the built sections with the exact thresholds (lessons: keep the project docs in step with the code).

**Contract**: `logic.md` gains a "Status colours and data periods" section (tones and words; live 15 min / 2 h; usage good ≤ +15%, watch, problem > +40%; recommendation fresh / > 2 h / earlier day; certainty always "not known yet" until S-11; period text format; insufficient reasons), and the S-14 lines leave "Planned rules". `decisions.md` 2026-09-26 gains the thresholds and "ignore the lab's confidence until S-11" with their reasons.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint, type check and unit tests pass: `npm run lint`, `npx astro check`, `npm test`
- CI (lint, tests, type check, build, local-Supabase smoke) passes on the PR

#### Manual Verification:

- On a phone, after deploy, the owner can tell from each card alone whether things are fine, and what each figure means, without help
- Each badge's word matches its colour on all three cards, including a stale or earlier-day recommendation if one occurs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `status.ts`, `period.ts`: formatting and edge cases listed in Phase 1.
- Services: every threshold at, just under and just over its line; insufficient reasons; Warsaw midnight for forecast days and "earlier day".

### Integration Tests:

- The existing CI smoke test (auth flow and ingest) must stay green; it reads no dashboard text.

### Manual Testing Steps:

1. Open the production dashboard on a phone after deploy; read each card and its "Co to znaczy?" box.
2. Check the usage card's period line against the dates the fallback actually covers.
3. If the lab is ever down for more than 2 hours, confirm the live card turns red with "brak nowych danych od …".

## Performance Considerations

None: string formatting on data the page already loads.

## Migration Notes

None: no schema, contract or stored-data change. Rollback is reverting the PR.

## References

- Roadmap: `context/foundation/roadmap.md` (S-14)
- PRD: `context/foundation/prd-v3.md` (US-01, FR-018, FR-019, FR-020, FR-029, NFR plain language)
- Rules: `docs/logic.md`; lessons: `context/foundation/lessons.md`
- Similar implementation: `src/lib/services/usage-insight.ts:79-94` (threshold boundary handling), `src/components/UsageInsightCard.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared building blocks

#### Automated

- [x] 1.1 Unit tests for statusText and formatPeriod pass
- [x] 1.2 Lint passes
- [x] 1.3 Type check passes

#### Manual

- [x] 1.4 The glossary wording reads as plain Polish to the owner

### Phase 2: View models

#### Automated

- [ ] 2.1 Live state threshold and period tests pass
- [ ] 2.2 Usage insight status, period and insufficient-reason tests pass
- [ ] 2.3 Recommendation status, certainty and forecast-day tests pass
- [ ] 2.4 Lint and type check pass

### Phase 3: Cards and docs

#### Automated

- [ ] 3.1 Build passes
- [ ] 3.2 Lint, type check and unit tests pass
- [ ] 3.3 CI passes on the PR

#### Manual

- [ ] 3.4 On a phone, the owner can read each card without help
- [ ] 3.5 Each badge's word matches its colour on all three cards
