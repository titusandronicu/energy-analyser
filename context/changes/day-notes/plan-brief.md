# Day Notes — Plan Brief

> Full plan: `context/changes/day-notes/plan.md`
> Research: `context/changes/day-notes/research.md`

## What & Why

The owner can write a short note on a calendar day ("urlop", "pompa ciepła od dziś"), read it on that day, see which days in a month have notes, and edit or delete it. This is roadmap S-19 (US-06, FR-025–028). Notes explain why a day looked unusual, especially days the ratings mark as weak or strong. They never change ratings, summaries or recommendations.

## Starting Point

The history calendar (S-15) already reserves an empty `note` slot in its views and marks recommendation days in the month grid. The page works without client JavaScript. No table is written by a signed-in user today; every client grant is an owner-only read. The dropped S-05 feedback work left a reusable owner-only write design (in the research).

## Desired End State

A "Notatka" panel sits right after "Ocena dnia" on each day from 16 July 2026 through today. It shows the note, or "Dodaj notatkę". "Edytuj" and "Usuń" each open a native disclosure, and deleting asks "Na pewno usuń". After saving, a short notice confirms the result. The month grid marks days with a note, with a distinct shape, a legend entry and ", jest notatka" for screen readers. The database lets only the signed-in owner touch only their own notes.

## Key Decisions Made

| Decision       | Choice                                                                                  | Why (1 sentence)                                                                     | Source   |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| Notes per day  | One (`unique (user_id, day)`); "add" on a day with a note is an edit                    | Matches the PRD's singular wording and keeps markers and forms simple                | Plan     |
| Which days     | 2026-07-16 through today (openable days)                                                | Today's event can be noted the same day; future days can't be opened in the calendar | Plan     |
| Length         | 1–500 characters, blank rejected, enforced in zod, the DB check and `maxlength`         | Same as S-05 and the contract's text limit; fits a one-line explanation              | Plan     |
| Placement      | Right after "Ocena dnia"                                                                | The note explains the rating, so it sits beside it                                   | Plan     |
| Delete         | Second step in a native `<details>` ("Na pewno usuń")                                   | Guards against accidental loss without JavaScript                                    | Plan     |
| Access         | Author (`user_id = auth.uid()`, set by the DB) and owner (`app_owners`) on every policy | Meets the PRD's per-account scope and the app's owner-only model                     | Plan     |
| Write path     | Native form POST to `/api/notes` (`intent=save\|delete`), redirect back with `?note=…`  | `/api/*` gets the Origin check; the history page stays JavaScript-free               | Research |
| Save semantics | One upsert on `(user_id, day)`; `user_id` has no client grant                           | Idempotent re-submits; the client cannot write another user's row                    | Research |
| Notes outbound | None: not to the lab, the LLM, ratings or summaries                                     | PRD :140, :288; the app has no outbound path                                         | Research |

## Scope

**In scope:**

- the `day_notes` table, its RLS and its grants;
- the loaders and the write service, with tests;
- the `/api/notes` route;
- the day panel, the month marker and legend, and the notices;
- smoke checks for security and the full flow;
- the docs and the production migration.

**Out of scope:**

- several notes per day;
- notes on future days;
- notes in the quarter view or on the dashboard;
- a React island or a character counter;
- version history or undo;
- any use of notes outside the calendar.

## Architecture / Approach

1. The browser posts a form to `/api/notes`, where the middleware checks the Origin.
2. The route checks the session and calls `handleNotePost` in `day-notes.ts`. That service validates the form with zod and runs one upsert or delete through the user's Supabase client, so RLS applies.
3. It redirects to `/dashboard/history?day=…&note=saved|deleted|invalid|failed`.
4. The history page then loads the day's note, or the month's note days, through `orLoadError`. `calendar-view.ts` fills `DayView.note` and `DayCell.hasNote`.

## Phases at a Glance

| Phase                    | What it delivers                                                                       | Key risk                                                        |
| ------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1. Data and service      | Migration (RLS, grants), `DayNoteRow`, loaders, `day-notes.ts` with tests              | The first client write; an upsert against a defaulted `user_id` |
| 2. Route and calendar UI | `/api/notes`, "Notatka" panel, month marker and legend, notices, smoke flow            | A form without JS (two disclosure steps) that works at 390 px   |
| 3. Docs and production   | architecture, logic, decisions, prerequisites, roadmap; production migration and check | Applying the migration before the deploy that reads it          |

**Prerequisites:** local Supabase on the UGREEN for `db reset` and smoke (needs the owner's OK each time); the owner approves the production migration and deploy.
**Estimated effort:** about 2 sessions across 3 phases.

## Open Risks & Assumptions

- **Upsert on a defaulted `user_id`:** PostgREST may need `user_id` in the conflict target. The plan's fallback is update-then-insert, pinned by smoke.
- **Redirect status:** 303 needs checking against current Astro 7 docs. 302 also turns a POST into a GET.
- **Single-owner app:** a second owner account would see only their own notes, as intended.

## Success Criteria (Summary)

- The owner adds, edits and deletes a note on any day from 16 July 2026 to today, without JavaScript, and sees which days in a month have notes.
- Nobody else (anon, non-owner, cross-origin) can read or write a note, and the database rejects blank or over-long text.
- Notes change nothing else in the app, and the docs record the first client write.
