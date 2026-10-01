# Period summaries (S-18) — Plan Brief

> Full plan: `context/changes/period-summaries/plan.md`
> Upstream: `context/changes/lab-period-summaries/` (F-04, pushes the texts)

## What & Why

Roadmap S-18 (US-01, US-05, FR-023, FR-030). The home lab already writes plain-language texts for someone without energy knowledge and the app stores them. This change shows them: an explanation of today's figures on the dashboard, and a summary of a completed day or month in the calendar next to its rating. Each text is shown as narrated, with its generation time and the period it covers.

## Starting Point

`public.period_summaries` is merged, with owner-only reads, and the `PeriodSummaryRow` type exists, but nothing reads it. The calendar's day and month views carry a reserved `summary: null` slot. The dashboard has no place for the text yet. The recommendation card already defines the staleness rule and status badges to copy.

## Desired End State

The dashboard has a card under the recommendation that explains today in plain Polish, with a status (current, older than 2 hours, or from another day) and its generation time. Completed days and months in the calendar show the lab's summary under the rating. Where the lab has facts but no text yet, a neutral sentence appears and no figures.

## Key Decisions Made

| Decision              | Choice                                                           | Why (1 sentence)                                                        | Source   |
| --------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| Missing narration     | Panel or card with one neutral sentence, no figures              | The grid facts are wrong, so none are shown; the user knows text is due | Plan     |
| Staleness of today    | Recommendation's rule: older than 2 hours, or another Warsaw day | Consistent with the neighbouring card, logic already exists             | Plan     |
| Dashboard placement   | In the `col-span-2` column right after the recommendation        | The lab's two texts sit together; the right column stays as it is       | Plan     |
| Quarter view          | No summary                                                       | The lab writes no quarter texts                                         | Plan     |
| Today in the calendar | No summary (today's text is on the dashboard)                    | Matches ratings, which skip today                                       | Plan     |
| Period with no row    | No panel at all                                                  | Nothing is written for incomplete days or thin months                   | Plan     |
| Facts                 | Never read or shown by the app                                   | Only the narration is user-facing; grid figures are unreliable          | Research |
| Display only          | No migration, contract or lab change                             | F-04 ships storage and grants                                           | Roadmap  |
| Model label           | Not shown                                                        | Roadmap asks only for generation time and period                        | Plan     |

## Scope

**In scope:**

- One service (loaders, view mappers, tests), the filled `summary` slot, a history panel, a dashboard card.
- Smoke assertions and the docs (`logic`, `decisions`, `architecture`, `prerequisites`, roadmap status).

**Out of scope:**

- Showing facts, quarter or year texts, a summary for today in the calendar.
- Any lab, contract or migration work, and any app-side advice or numbers check.
- Changes to ratings, day notes or the recommendation card.

## Architecture / Approach

One service file loads rows (explicit eight-column selects) and maps them to safe views, so both surfaces share one staleness rule and the Polish strings. The history page loads the day's or month's row in its frontmatter, only for completed periods, and passes it to the view builders. The dashboard loads today's newest row next to its other cards. Components only render escaped text, with no client JavaScript.

## Phases at a Glance

| Phase                       | What it delivers                                           | Key risk                                                     |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Loaders and view service | Read path, view mappers, filled slot type, unit tests      | Staleness and slot rules wrong at boundaries                 |
| 2. Calendar display         | Summary panel on completed days and months, smoke coverage | Showing a panel for today, the quarter or a missing row      |
| 3. Dashboard card and docs  | Today card with status states, docs and roadmap in step    | Card balance in the grid; docs drifting from the built rules |

**Prerequisites:** F-04 live in production (rows exist) for the manual production check; local Supabase on the UGREEN for the smoke test (owner's OK); the owner's protected production deploy.
**Estimated effort:** about 2-3 sessions across 3 phases.

## Open Risks & Assumptions

- F-04's own deploy and backfill step (3.6) is still open; until production holds rows, the surfaces only show their empty states.
- The text is shown as the lab wrote it; the app does not check it for advice or numbers.
- The smoke test builds its own dated entries from the clock (yesterday, the previous month, today), because the fixture's rows have the wrong dates; the example fixture stays untouched.
- A `today` row from an earlier day with no text shows the empty state, not "text not yet written".
- A failed summary load on the calendar shows no panel and no error line (logged only); the dashboard card does show a load-failed state.

## Success Criteria (Summary)

- Production shows today's explanation on the dashboard and a summary under the rating of a completed day and a completed month.
- A missing narration never shows figures, and a stale or other-day text is labelled as such.
- Today's calendar day, the quarter view and periods with no row show no summary.
