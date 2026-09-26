# Clarity for a Non-Expert — Plan Brief

> Full plan: `context/changes/data-period-transparency/plan.md`

## What & Why

The owner has no energy background, and the dashboard shows raw kW/kWh figures with colours that mean nothing consistent. This slice gives every card a colour **plus a word** (good / worth watching / problem / not enough data), states the days behind every derived figure, refuses to guess from too little data, and explains each term in plain Polish. It goes first because the calendar, ratings and trend slices reuse these rules. Roadmap S-14.

## Starting Point

Three server-rendered cards (live state, usage insight, today's recommendation) built from pure, tested view-model services. The usage card colours its verdict ad hoc; the other cards only have amber and red notice boxes; forecast certainty shows the lab's unexplained value or "nieznana".

## Desired End State

Each card has a badge such as "Dobrze · w normie" or "Problem · rekomendacja z 25 września", period lines such as "Średnia z 18 dni: 27 sierpnia – 25 września", plain labels ("Prąd z paneli teraz") and a folded "Co to znaczy?" box. Later slices build on the same tones, badge, period formatter and glossary.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Usage colours | ≤ +15% or below = green; above = amber; > +40% = red | Red only for a really unusual day; saving energy is never flagged. |
| Explaining terms | Plain labels + a folded "Co to znaczy?" per card | Readable at a glance on a phone, with detail one tap away and next to the term. |
| Live data age | Green ≤ 15 min, amber > 15 min, red > 2 h | Agrees with the recommendation's 2-hour rule; red means the lab is really down. |
| Forecast certainty | Always grey "not known yet", basis stated; lab's value ignored | No certainty without the days behind it (FR-019/020) until S-11 computes it. |
| Advice age | Green fresh, amber > 2 h, red from an earlier day | Advice about another day's weather is a problem, not just old. |
| Where status lives | In the view-model services | Every threshold is unit-tested and the cards only render. |

## Scope

**In scope:** status tones and badge, period formatter, glossary, statuses and period text in the three services, plain labels and explanations in the three cards, `docs/logic.md` and `docs/decisions.md`.

**Out of scope:** the lab's recommendation wording (F-04/S-18), certainty from accuracy (S-11), rating the grid purchase (S-17), new cards, contract, lab or database changes.

## Architecture / Approach

`src/lib/format/` gains `status.ts`, `period.ts`, `glossary.ts`; `src/components/` gains `StatusBadge.astro` and `TermsExplained.astro`. Each service adds `status` and period labels to its view; each card renders them. No client-side JavaScript.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared building blocks | Tones, badge, period text, glossary, tests | Wording that still sounds technical |
| 2. View models | Status and periods per card with the chosen thresholds | Off-by-one at the 15 min / 2 h / 15% / 40% lines |
| 3. Cards and docs | Plain cards on the dashboard; logic and decisions docs updated | Cards getting long on a phone |

**Prerequisites:** none outside the repo; no new lab data, secrets or production steps.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- The 40% "far above" line is a judgement call; a hot day with air conditioning may show red. It is one constant to tune.
- Certainty stays grey for at least one to two weeks, until S-11 has forecast history.

## Success Criteria (Summary)

- The owner can tell from each card alone whether things are fine and what each figure means.
- Every colour on the dashboard carries a word, and every derived figure names its days.
- S-15 and later cards use the same badge, period text and glossary.
