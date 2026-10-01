# Day Notes Implementation Plan

## Overview

The owner can write a note on a calendar day (for example "urlop", "pompa ciepła od dziś"), read it on that day, see which days in a month have notes, edit it and delete it. This covers roadmap S-19 (US-06, FR-025–FR-028). It is the app's first write by a signed-in user: a new owner-and-author-only table, a cookie-authenticated `/api/notes` route, a "Notatka" panel in the history day view and a marker in the month grid. Everything works without client JavaScript, like the rest of the history page.

## Current State Analysis

From `context/changes/day-notes/research.md`:

- **No table is written by `authenticated` today.** Every client grant is an owner-only read with an inline `app_owners` check (`supabase/migrations/20260923150859_owner_read_recommendations.sql:13-26`). New tables enable RLS and run `revoke all … from anon, authenticated` first (`20260923101001_push_ingestion.sql:59-66`).
- **The dropped S-05 feedback migration** (commit `d651733`, never applied in production) is the closest precedent:
  - `user_id … references auth.users on delete cascade`, `day date`, a `char_length` check and `unique (user_id, day)`;
  - policies requiring `user_id = (select auth.uid())` **and** the `app_owners` check;
  - its review asked to reject whitespace-only text (`btrim`) and to revoke EXECUTE on any helper function.
- **Writes must go through `/api/*`.** The middleware's Origin check covers only that prefix (`src/middleware.ts:18-25`). `PROTECTED_ROUTES` covers pages only (:5, :38-42), so the route checks `locals.user` itself.
- **The route shape** is a thin `APIRoute` that calls a pure service with injected dependencies and returns `{ redirect }` (`src/pages/api/auth/signin.ts:8-22` → `password-signin.ts:12-39`). Errors travel as a query parameter that the page reads.
- **The history page reserves a slot for notes:** `ReservedSlots.note` (`src/lib/services/calendar-view.ts:181-186`), spread into the month, quarter and day views (:452, :485, :587). It is pinned as `null` in `calendar-view.test.ts:265,311,359`.
  - The month cells are `DayCell { day, status, hasRecommendation }` (:99-103), with an accessible name built by `dayCellName` (:122-126).
  - The day page loads with `Promise.all` (`src/pages/dashboard/history.astro:95-107`). Each loader is wrapped in `orLoadError` (`src/lib/page-load.ts`).
- **Day keys** are validated by `DAY_PATTERN` plus a round-trip (`src/lib/calendar/period.ts:23,81`). `isOpenable` bounds them to `HISTORY_START` (2026-07-16) through today (:15, :73).
- **No textarea or label component** is installed (shadcn has only `button`). `src/components/history/HistoryNotes.astro` is the "Co to znaczy?" glossary, so note components need other names.

## Desired End State

- **Day view (`/dashboard/history?day=YYYY-MM-DD`):** a "Notatka" panel sits right after "Ocena dnia".
  - **With a note:** it shows the text as escaped plain text with line breaks kept, plus "zmieniona {data, godzina}". "Edytuj" opens a native `<details>` with a prefilled textarea, and "Usuń" opens a second `<details>` step, "Na pewno usuń".
  - **Without a note:** "Dodaj notatkę" opens the empty form.
  - **The form:** one textarea with `maxlength=500` and a visible label, and a "Zapisz" button.
- **Which days:** only openable days, 2026-07-16 through today, can carry a note. A post for any other day is rejected, and the day view of an out-of-range day never shows the form (it cannot be opened anyway).
- **After every post:** the browser lands on `/dashboard/history?day=…&note=saved|deleted|invalid|failed`, and the panel shows one short Polish notice ("Notatka zapisana.", "Notatka usunięta.", "Notatka jest pusta albo dłuższa niż 500 znaków." or "Nie udało się zapisać notatki. Spróbuj ponownie.").
- **Month view:** a day with a note shows a note marker that differs in shape from the recommendation dot, its accessible name gains ", jest notatka", and the legend lists it. If the note markers fail to load, a load-failure line says so.
- **Unchanged:** quarter view; notes never change ratings, summaries or recommendations.
- **Database:** `public.day_notes` accepts select, insert, update and delete only for a signed-in user who is in `app_owners`, and only on rows where `user_id` is that user. Anonymous users and non-owners read and write nothing. Blank or over-500-character text is rejected by the database itself.
- **Docs:** the docs record the first client write, the note rules and the decision.

### Key Discoveries:

- One note per day is `unique (user_id, day)`, which lets "save" be a single upsert whether the note exists or not (owner decision, singular wording in `prd-v3.md:247`).
- `user_id` defaults to `auth.uid()` in the database, and the client gets no insert or update grant on that column, so it cannot write a note for someone else even if a policy were wrong.
- The page needs no client JavaScript: forms post natively and `<details>` handles both disclosure steps. This is the history calendar's no-JS rule (archived plan `context/archive/2026-09-30-history-calendar/plan.md:69`).
- **Addendum (2026-10-01):** save is built as update-then-insert (`saveNote` in `src/lib/services/day-notes.ts`, one retry as an update on `23505`), not one upsert: an upsert can't target `(user_id, day)` because the client can neither read nor write `user_id`.

## What We're NOT Doing

- **Several notes per day.** The owner decided on one note per day.
- **Notes on future days** or on days before 2026-07-16 (owner decision: history plus today only).
- **Notes in the quarter view** or on the dashboard. The quarter keeps its reserved `note` slot as `null`.
- **Notes reaching ratings, summaries, recommendations, the lab or any LLM.** Nothing outbound is built (PRD :140, :288).
- **A React island**, character counter or optimistic update. Plain forms only.
- **Version history or undo** for edits or deletes.
- **Restoring the S-05 feedback code.** Its patterns are reused from the research notes; the code itself is not.

## Implementation Approach

1. **Phase 1:** build and test the data layer: migration, type, loaders, and a pure service that turns a posted form into a redirect.
2. **Phase 2:** wire the route and the calendar UI on top of it, and extend the smoke test with the security checks and the full flow.
3. **Phase 3:** record the decision, update the docs, apply the migration in production with the deploy, and check the result there.

## Critical Implementation Details

- **Upsert and permissions:** with `user_id` defaulted and excluded from the column grants, the save is `upsert({ day, text }, { onConflict: "user_id,day" })`. PostgREST resolves the conflict on the defaulted `user_id`. The insert and update grants must therefore cover exactly `day, text` (plus `updated_at` if it is set by the client; prefer a trigger or `default now()` with an update trigger that sets it). If the upsert cannot target the defaulted column, fall back to "update where day = …, insert when no row was updated". Pin whichever works in the smoke test.
- **Redirect status:** the existing auth routes return 302. A form POST should answer 303, so the browser re-requests the page with GET. Check against current Astro 7 docs (Context7) that `context.redirect(path, 303)` is supported. If it isn't, keep 302, which browsers also turn into a GET.
- **Double submit:** the form needs no JS guard. An upsert is idempotent and a second delete of the same day is a no-op, which still redirects as "deleted".

## Phase 1: Data and service

### Overview

Create the `day_notes` table with its security model, the row type, the loaders and the write service, all covered by unit tests. Nothing user-visible yet.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_day_notes.sql` (new)

**Intent**: The first table the signed-in owner writes. It is locked down like the others and then opened per operation, for the owner's own rows only.

**Contract**:

- **Table `public.day_notes`:**
  - `id bigint generated always as identity primary key`
  - `user_id uuid not null default auth.uid() references auth.users on delete cascade`
  - `day date not null`
  - `text text not null check (char_length(text) <= 500 and btrim(text) <> '')`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - `unique (user_id, day)`
- **Updated-at trigger:** a `security invoker` BEFORE UPDATE trigger function with `set search_path = ''` sets `updated_at := now()`. EXECUTE on it is revoked from public, anon and authenticated (S-05 review F1).
- **Lock-down:** `enable row level security`, then `revoke all on public.day_notes from anon, authenticated`.
- **Grants to `authenticated`:** `select (day, text, created_at, updated_at)`, `insert (day, text)`, `update (text)` and `delete`.
- **Policies:** four, one per operation, all `to authenticated`, named "owners can read/add/change/delete their day notes". Each requires `user_id = (select auth.uid())` and the inline `exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))`, in `using` and/or `with check` as the operation needs.
- **Header comment:** why the table exists, a pointer to research.md, and that this is the first client-written table.

#### 2. Row type and loaders

**File**: `src/types.ts`, `src/lib/services/calendar-data.ts` (+ `calendar-data.test.ts`)

**Intent**: Read a single day's note for the day view and the days with notes for a month, following the existing loader pattern.

**Contract**:

- **Row type:** `DayNoteRow { day: string; text: string; updated_at: string }`.
- **`loadNoteForDay(client, day): Promise<DayNoteRow | null>`:** `eq("day", day)`, at most one row. RLS already limits rows to the user's own.
- **`loadNoteDays(client, from, to): Promise<string[]>`:** `day` between two day keys, inclusive.
- Both throw on a Supabase error, like their neighbours. Tests use the existing chain mock, extended with `eq` and `maybeSingle` (or `limit`).

#### 3. Write service

**File**: `src/lib/services/day-notes.ts` (new, + `day-notes.test.ts`)

**Intent**: Turn a posted form into exactly one database call and a redirect, so the route stays a few lines and every rule is unit-tested.

**Contract**:

- **Constants:** `NOTE_MAX_LENGTH = 500` and `NOTE_NOTICES` (the four Polish notices from Desired End State, keyed `saved|deleted|invalid|failed`).
- **`parseNoteForm(form: FormData, today: string)`:** zod schema of `day` (a valid, openable day key), `intent` (`"save" | "delete"`) and `text` (trimmed, 1–500 characters, required for save only). It returns the parsed value or `"invalid"`.
- **`handleNotePost(form, { today, save, remove, logError })`:** returns `{ redirect }`. `save(day, text)` and `remove(day)` are injected wrappers over the Supabase calls.
  - **Success:** `/dashboard/history?day=D&note=saved|deleted`.
  - **Parse failure:** `…&note=invalid`. If the day itself is unparseable, it falls back to `/dashboard/history?note=invalid`.
  - **Database error:** logged, then `…&note=failed`.
  - The redirect is built with the existing `toSearch` / `periodHref` helpers so the URL format stays canonical.
- **`noteNotice(param: string | null)`:** maps the query value to `{ tone, text } | null`. Unknown values give `null`.
- **Tests (synthetic data only) cover:**
  - day boundaries: 2026-07-15 → invalid, 2026-07-16 → ok, today → ok, tomorrow → invalid;
  - a malformed day;
  - 500 vs 501 characters;
  - whitespace-only text → invalid;
  - delete without text → ok;
  - a Supabase error → failed, with `logError` called;
  - unknown intent → invalid.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- The migration applies to a fresh local database: `npx supabase db reset --local` (local Supabase on the UGREEN, per `scripts/remote-docker.sh`)

#### Manual Verification:

- Run the following with the local stack's REST API and a password token for a seeded owner and a second, non-owner user, all with synthetic data:
  - The owner can insert, read, update and delete their own note.
  - A blank note or a 501-character note is rejected by the database.
  - Anon reads and writes are rejected.
  - The non-owner can neither read nor write.

---

## Phase 2: Route and calendar UI

### Overview

Add the write route, the "Notatka" panel, the month marker and the post-redirect notices, and extend the smoke test with the security checks and the full flow.

### Changes Required:

#### 1. API route

**File**: `src/pages/api/notes.ts` (new)

**Intent**: The only write entry point. It is cookie-authenticated, and the middleware already applies the Origin check to it.

**Contract**:

- `export const prerender = false` and `POST` only.
- With no `locals.user`, it redirects to sign-in (the same target the middleware uses for pages).
- Otherwise it calls `createClient(...)` and passes `handleNotePost` the Warsaw `today` plus `save` (the upsert) and `remove` (a delete by `day`).
- It must not be added to `TOKEN_AUTH_ROUTES`.

#### 2. View models

**File**: `src/lib/services/calendar-view.ts` (+ `calendar-view.test.ts`)

**Intent**: Replace the reserved `note` slot with real data on the day and month views.

**Contract**:

- **Day view:** `DayView.note: { text: string; updatedLabel: string } | null`. The label uses `formatWarsawDateTime`.
- **Month view:** `DayCell.hasNote: boolean`. `buildMonthView` takes a `noteDays` set, and `dayCellName` appends `HAS_NOTE_WORD` (", jest notatka").
- **Quarter view:** keeps `note: null`.
- **Copy:** pinned in the "history copy" tests. Update the slot assertions at `calendar-view.test.ts:265,311,359`.

#### 3. Page loading

**File**: `src/pages/dashboard/history.astro`

**Intent**: Load the notes alongside the existing data. A notes failure degrades only the notes.

**Contract**:

- **Day branch:** add `orLoadError(loadNoteForDay)` to its `Promise.all`.
- **Month branch:** load `loadNoteDays` for the month, in parallel with the recommendation times.
- **New page flags:** `noteFailed` and `noteMarkersFailed`.
- **Notice:** read `Astro.url.searchParams.get("note")` through `noteNotice`.

#### 4. Components

**File**: `src/components/history/DayNotePanel.astro` (new), `DayView.astro`, `MonthView.astro`

**Intent**: The note panel after "Ocena dnia", and the month marker with its legend entry. Both follow the existing `Panel` / `CardHeading` / `StatusBadge` conventions.

**Contract**:

- **`DayNotePanel`** props: `{ day, note, notice, failed }`.
  - It contains a `<form method="POST" action="/api/notes">` with a hidden `day` and `intent` and a labelled `<textarea name="text" maxlength="500" required>`.
  - Delete is its own form inside a nested `<details>`, "Usuń" → "Na pewno usuń" (intent=delete).
  - The text renders with `whitespace-pre-line [overflow-wrap:anywhere]`. Never `set:html`.
  - The notice has `role="status"`.
  - Test ids: `history-day-note`, `history-note-notice`.
  - The textarea and button use the card theme. Add shadcn `textarea` and `label` only if they fit the Astro-only rendering; otherwise style with Tailwind and `buttonVariants`.
- **`DayView`:** renders the panel right after `RatingPanel`.
- **`MonthView`:** a note marker that differs from the dot in shape (for example a small corner tick or icon, `aria-hidden`), a legend item "Notatka", and a markers-failure line for `noteMarkersFailed`.
- Layout must work at 390 px and 1440 px with no horizontal scroll.

#### 5. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Prove the security model and the flow end to end against the local stack.

**Contract**:

- **Rejections:**
  - Anon REST `GET` and `POST` on `/rest/v1/day_notes` are rejected.
  - `POST /api/notes` without a session goes to sign-in, and nothing is written.
  - `POST /api/notes` with a foreign `Origin` returns 403.
- **Signed-in owner flow:**
  - Save, then `303`/`302` to `?day=…&note=saved`. The day page body contains the text, and the month page has the note marker.
  - Save again with new text: the edit shows.
  - Delete: `note=deleted`, and the text is gone.
- Synthetic text only, and cleanup at the end.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Type checks pass: `npx astro check`
- Production build succeeds: `npm run build`
- Smoke passes against the local stack: `BASE_URL=http://127.0.0.1:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`
- No HTML injection path: `git grep -n "set:html\|dangerouslySetInnerHTML" -- src` prints nothing

#### Manual Verification:

- On the local stack, at 1440 px and 390 px, check the following:
  - Add a note to yesterday, then edit it, then delete it (with the confirmation step). The notices read naturally.
  - The month grid shows the marker and its legend, and a screen reader hears ", jest notatka".
  - Text with `<b>` shows literally.
  - Today accepts a note.
  - Nothing breaks with JavaScript disabled.

---

## Phase 3: Docs and production

### Overview

Record the decision and the rules, apply the migration in production with the deploy, and check the result.

### Changes Required:

#### 1. Docs

**File**: `docs/architecture.md`, `docs/logic.md`, `docs/decisions.md`, `docs/prerequisites.md`, `context/foundation/roadmap.md`

**Intent**: Keep the docs in step with the first client write (lesson "Keep the project docs in step with the code").

**Contract**:

- **`architecture.md`:** the first owner-written table and its security model: column grants, author + owner policies, the `/api/notes` route behind the Origin check, and no outbound use of notes.
- **`logic.md`:** a "Notatki" section with one note per day, 1–500 characters, days from 2026-07-16 through today, where notes show, and the redirect notices.
- **`decisions.md`:** a dated entry for one note per day, history + today, author + owner, no JS, and delete with confirmation.
- **`prerequisites.md`:** under one-time production steps, the `day_notes` migration applied with the deploy.
- **`roadmap.md`:** fix the stale lines at :412 ("Needs S-15") and :435 (the branch no longer exists; the patterns live in `context/changes/day-notes/research.md`).

### Success Criteria:

#### Automated Verification:

- Docs formatted: `npx prettier --check docs context/foundation/roadmap.md context/changes/day-notes`
- The rules are recorded: `git grep -n "day_notes" -- docs/architecture.md docs/logic.md` prints at least two lines

#### Manual Verification:

- With the owner's approval, the migration is applied in production and the app is deployed.
- In production, as the owner, check the following:
  - Add a note to a past day, see it on the day view and the month marker, edit it, then delete it.
  - The production table holds no leftover test note.

---

## Testing Strategy

### Unit Tests:

- **`day-notes.test.ts`:** form parsing and every redirect (day bounds, length 500/501, whitespace-only, intents, database failure).
- **`calendar-data.test.ts`:** both loaders, including the error path.
- **`calendar-view.test.ts`:** `DayView.note`, `DayCell.hasNote`, the accessible name and the copy.

### Integration Tests:

- **`scripts/smoke.mjs`:** RLS (anon, signed-out, cross-origin), plus the owner add → edit → delete flow through the real route and pages.

### Manual Testing Steps:

1. Add, edit and delete a note at 390 px and 1440 px, with JS on and off.
2. Check the month marker, the legend and the screen-reader name.
3. Show HTML-like text as plain text.
4. Production add → edit → delete, leaving no test data behind.

## Performance Considerations

There is one extra indexed query per day page and one per month page, at most 31 rows. The unique `(user_id, day)` index serves both.

## Migration Notes

This is a new table only, with no backfill. Rollback is a down step (`drop table public.day_notes` and the trigger function), which is only needed before any real note exists. Apply it in production with the deploy (prerequisites).

## References

- Research: `context/changes/day-notes/research.md`
- Requirements: `context/foundation/prd-v3.md:130-140,245-254`
- Precedents:
  - `supabase/migrations/20260923150859_owner_read_recommendations.sql` (owner policy)
  - `src/lib/services/password-signin.ts` (form → redirect service)
  - `src/lib/services/calendar-data.ts` (loaders)
  - `src/components/history/MonthView.astro:112-158` (markers, legend, failure line)
- Dropped S-05 design: commits `f94d796`, `d651733` (reflog only)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data and service

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 9215188
- [x] 1.2 Linting passes: `npm run lint` — 9215188
- [x] 1.3 Type checks pass: `npx astro check` — 9215188
- [x] 1.4 The migration applies to a fresh local database: `npx supabase db reset --local` — 9215188

#### Manual

- [x] 1.5 Local REST checks: owner CRUD on own note, DB rejects blank/501 chars, anon and non-owner get nothing — 9215188

### Phase 2: Route and calendar UI

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 9215188
- [x] 2.2 Linting passes: `npm run lint` — 9215188
- [x] 2.3 Type checks pass: `npx astro check` — 9215188
- [x] 2.4 Production build succeeds: `npm run build` — 9215188
- [x] 2.5 Smoke passes against the local stack: `npm run smoke` — 9215188
- [x] 2.6 No HTML injection path: `git grep -n "set:html\|dangerouslySetInnerHTML" -- src` prints nothing — 9215188

#### Manual

- [x] 2.7 Local stack at 1440/390 px: add → edit → delete with confirmation, notices, month marker and legend, screen-reader name, HTML shown literally, today accepted, works without JS — 9215188

### Phase 3: Docs and production

#### Automated

- [x] 3.1 Docs formatted: `npx prettier --check docs context/foundation/roadmap.md context/changes/day-notes` — 9215188
- [x] 3.2 The rules are recorded: `git grep -n "day_notes" -- docs/architecture.md docs/logic.md` prints at least two lines — 9215188

#### Manual

- [x] 3.3 With the owner's approval, the migration is applied in production and the app deployed — 9215188
- [x] 3.4 Production: add → edit → delete a note as the owner; no leftover test note — 9215188
