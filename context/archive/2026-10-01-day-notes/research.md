---
topic: How to build notes on calendar days (S-19): requirements, data and write patterns, and calendar integration
date: 2026-10-01
researcher: Claude (Opus 5.5) for the owner
git_commit: 24eddb0
branch: main
repository: energy-analyser
status: complete
last_updated: 2026-10-01
last_updated_by: Claude
---

# Research: day notes (S-19)

## Question

What do the requirements and earlier work say about notes on calendar days, and which existing patterns would a notes table, its write flow and its place in the history calendar follow?

## Summary

- **Requirements:** US-06 and FR-025–FR-028 are all must-have (`context/foundation/prd-v3.md:130-140,245-254`). The user adds, views, edits and deletes a note on a calendar day, and the month view shows which days have notes. Notes are scoped to the logged-in user (:138), and edits show immediately on the next view (:139). They "never alter ratings, summaries or recommendations" (:140, Non-Goals :288).
- **Left open by the PRD:** the length limit, whether a day has one note or several, which days may carry a note (future, today, empty), retention, and whether notes may ever reach the lab or the LLM. The wording is singular: "a note to a calendar day" (:247).
- **No table is written by the `authenticated` role today.** Every client grant in the nine migrations is a read (owner-only `select` with an inline `app_owners` check). The only writes go through the `security definer` `ingest_push` (`supabase/migrations/20260923101001_push_ingestion.sql:71-155`). `day_notes` would be the first insert/update/delete surface.
- **The S-05 feedback design still exists, but only in the reflog.** The `feat/record-feedback` branch and any PR are gone (`git branch -a`, `git ls-remote origin` and `gh pr list` find nothing). Commits `f94d796` (phase 1 data model and service) and `d651733` (review and drop) remain reachable only through the reflog, so `git gc` could eventually remove them. Its migration is the closest precedent for an owner write. The roadmap's "stays unmerged on branch" (`roadmap.md:435`) is stale.
- **The calendar reserves a slot for notes.** `ReservedSlots { note: null; summary: null }` (`src/lib/services/calendar-view.ts:181-186`) is spread into the month, quarter and day views (:452, :485, :587). Tests pin it as `null` at `calendar-view.test.ts:265,311,359`.
- **The history page has no client JavaScript by design** (archived plan `context/archive/2026-09-30-history-calendar/plan.md:69`). The sign-out form shows the plain form POST + redirect pattern (`DashboardHeader.astro:51-62`), and sign-in uses the zod + `?error=` redirect pattern (`password-signin.ts:12-39`, `signin.astro:6`). Both fit a no-JS notes form.

## Detailed findings

### Data model precedents

- **Migrations** are named `YYYYMMDDHHMMSS_snake_case.sql` and open with a comment block explaining why they exist.
  - New tables follow the same lock-down: `enable row level security`, then `revoke all … from anon, authenticated` ("defense in depth", `push_ingestion.sql:59-66`, repeated in `hourly_energy.sql:17,21`).
  - Access is then opened per operation: "reads need the grant AND an owner policy" (`20260923150859_owner_read_recommendations.sql:13-14`).
- **The owner check is inlined in every policy:** `exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))` (`owner_read_recommendations.sql`, `owner_read_daily_energy.sql:8-12`, `live_state_view.sql:8-12`, `hourly_energy.sql:143-147`). There is no `is_owner()` helper. Policy names are plain English, one operation each, `to authenticated`.
- **Day-keyed tables** store `day date` as the Europe/Warsaw calendar day (`push_ingestion.sql:32-35`).
  - App helpers: `warsawParts(now).dayKey` and `dayKeyToUtcMs` (`src/lib/format/warsaw-time.ts:18-48`).
  - A posted day key is validated with `DAY_PATTERN` plus a round-trip (`src/lib/calendar/period.ts:23,81`).
  - `isOpenable` bounds a day to `HISTORY_START` (2026-07-16) through today (:15, :73).
- **The S-05 migration**, at `d651733:supabase/migrations/20260926062835_recommendation_feedback.sql`, never ran in production:
  - **Table** (:6-15):
    - `user_id uuid not null references auth.users on delete cascade`
    - `day date not null`
    - `note text check (note is null or char_length(note) between 1 and 500)`
    - `created_at`
    - `unique (user_id, day)`
  - **Access:** RLS on (:20). Then `revoke all`, then `grant select` and a column-level `grant insert (…)` to authenticated, with no update or delete grant (:23-25).
  - **Policies** (:27-44): select and insert, each requiring `user_id = (select auth.uid())` **and** the `app_owners` check.
  - **Trigger** (:49-70): a `security invoker` BEFORE INSERT trigger with `search_path=''` that sets `user_id := auth.uid()`.
  - **Phase 1 review** (`d651733:…/reviews/impl-review-phase-1.md`):
    - F1: revoke EXECUTE on the trigger function.
    - F3: a whitespace-only note passes the check. Suggested fix: `btrim(note) <> ''`.
- **Its service**, `d651733:src/lib/services/feedback.ts`:
  - `NOTE_MAX_LENGTH = 500` (:10).
  - SQLSTATE `23505` maps to "duplicate" (:13).
  - zod form parsing trims the note and turns empty into null (:30-50).
  - `create…` returns `"saved" | "duplicate" | "failed"` with an injected `logError` (:65).
  - `feedbackNotice` maps a `?feedback=` value to a Polish message (:156).
  - Tests are in `feedback.test.ts` (224 lines at `f94d796`).
- **Types are hand-written** in `src/types.ts:1-52` (for example `DailyEnergyRow`, `day: string`). Queries use an untyped client with `.overrideTypes<Row[], { merge: false }>()` (`calendar-data.ts:13-23`). A `DayNoteRow` belongs in `src/types.ts`.

### Write path and security

- **Supabase client:** `createClient(request.headers, cookies)` (`src/lib/supabase.ts:36-60`). Cookies are `httpOnly`, `sameSite: "lax"`, and `secure` on https. The helper asserts the key is never a secret or service-role key (:6-23).
- **Route shape:** a thin `APIRoute` calls a pure service with injected dependencies that returns `{ redirect }` (`api/auth/signin.ts:8-22` → `password-signin.ts`). Routes set `export const prerender = false`. Validation uses zod `safeParse` on trimmed `FormData`. Supabase errors are logged and a generic Polish message is returned.
- **Redirects:** `context.redirect(path)` returns **302** throughout, and smoke asserts 302 (`scripts/smoke.mjs:100-114,154`). Nothing uses 303 yet. Whether Astro 7's `redirect` accepts a status argument is unverified.
- **Middleware** (`src/middleware.ts`):
  - Every non-GET/HEAD/OPTIONS request to `/api/*` must carry `Origin === (APP_ORIGIN ?? url.origin)`, or it gets 403 (:18-25). Only `/api/ingest` is exempt (:10-16).
  - `PROTECTED_ROUTES = ["/dashboard"]` (:5, :38-42) covers pages only. An `/api/notes` handler must check `locals.user` itself.
  - A POST handled inside `history.astro`, or anywhere outside `/api/`, would skip the Origin check. Writes must therefore go through `/api/…`.
  - HTML forms send only GET and POST, so edit and delete need POST with an `intent` field, or separate POST routes.
- **XSS:** `src/` has no `set:html`, `dangerouslySetInnerHTML` or `innerHTML`. Astro `{}` escapes text. `advice-markdown.ts:1-3` is the precedent for rendering untrusted text as structure, never HTML. Note text renders as escaped text, with `whitespace-pre-line` if line breaks are kept.
- **Length limits:** the convention is zod `.max(500)` (ingest contract `src/lib/ingest/contract.ts:16-17`). A note limit would be enforced three times: zod, a DB `check` and `maxlength` on the textarea.
- **Notes never leaving the app:** no rule says this outright. It follows from the push-only design (`docs/architecture.md:37`: the app never connects into the home) and "the app never calls an LLM" (:69). So notes cannot reach the lab or the LLM unless an outbound path is built. `change.md` states the intent.

### Calendar integration

- **Page:** `src/pages/dashboard/history.astro`.
  - Its `loadPage` branches by period (:61-114). Each section loads through `orLoadError` with one lazy `pageClient` (`page-load.ts:8-27`), and a failed load shows a flag, not a 500.
  - **Day branch** (:95-107): it already runs `Promise.all([dailyRange, recommendations])`, and a notes loader joins it.
  - **Month branch** (:78-92): it loads recommendation times after the rows. A note-days loader can run beside it.
  - Loaders are pure `(client, range)` functions that throw on error (`calendar-data.ts:13-60`). Notes use the day-based `gte/lte` pattern of `loadDailyRange`.
- **Month grid:**
  - `buildMonthView` maps `monthGrid(month)` (`period.ts:154-163`) to `DayCell { day, status, hasRecommendation }` (`calendar-view.ts:99-103,437-443`), with the recommendation flag built from a `Set` (:424).
  - Accessible names come from `dayCellName` (:122-126, e.g. "…, jest rekomendacja").
  - The recommendation dot is an `aria-hidden` span (`MonthView.astro:112-114`). The note marker needs a different shape, not just a different colour ("never colour alone", :48), plus a legend entry (:134-151) and a load-failure line like :153-158.
- **Day view section order:** "Dzień w liczbach" (`DayView.astro:47-93`), "Ocena dnia" (:95), "Prognoza a rzeczywistość" (:97-120), "Rekomendacja z tego dnia" (:122-239), then "Co to znaczy?" (`history.astro:145-147`).
  - Sections are `Panel` + `CardHeading` h2 with an `aria-hidden` lucide icon.
  - Test ids follow `history-<view>-<thing>`.
  - The verified widths are 1440 px and 390 px (archived plan :214, :287, :424).
- **Quarter view:** it has no day cells, so FR-026 needs nothing there.
- **UI kit:** shadcn has only `button` installed. There is no input, textarea, label or dialog. `auth/FormField.tsx` is styled for the dark sign-in page, so a textarea needs card-theme styling or `npx shadcn add textarea label`.
  - Delete confirmation without JS can use a nested `<details>`.
  - A React island would only add a pending state, a counter or inline validation. The sign-in forms show the double-submit guard (`PasswordSignInForm.tsx:15-44`; lesson `context/foundation/lessons.md`).
- **Name clash:** `src/components/history/HistoryNotes.astro` is the "Co to znaczy?" glossary. Note components need distinct names, e.g. `DayNotePanel`, with the service in `day-notes.ts`.

### Tests

- **Unit tests:** Vitest in node, `src/**/*.test.ts`, no DOM and no component tests. `calendar-view.test.ts` pins the copy and the view models.
  - Loader tests use a hand-rolled chain mock (`calendar-data.test.ts:14-28`). Notes need `eq`, `insert`, `update`, `upsert` and `delete` added.
  - Write services are tested like `password-signin.test.ts`: `(FormData, deps) → { redirect }`.
- **Smoke:** `scripts/smoke.mjs` (no dependencies) already does anon REST reads expecting 401 (:199-249) and owner REST reads with a password token (:250-264). Its `request()` sends `Origin` and keeps a cookie jar (:31-45). It can add:
  - anon read and write rejected;
  - a signed-in POST `/api/notes` followed by a GET of the day page;
  - a cross-site `Origin` getting 403;
  - a signed-out POST rejected.
- **No E2E:** there is no Playwright and no `context/foundation/test-stack.md`. UI checks are manual at 1440 px and 390 px.

## Open questions for the owner

1. **One note per day, or several?** One per day (`unique (user_id, day)`, upsert, a simple marker) matches the PRD's singular wording.
2. **Length limit:** 500 characters, as in S-05, or another number?
3. **Which days can have notes:** only past days with history (`isOpenable`, 2026-07-16 to yesterday), today as well, or future days too (for example "urlop od…")?
4. **Placement on the day view:** right after "Ocena dnia" (notes explain ratings, per FR-025's rationale), or after the recommendation?
5. **Scoping:** keep both checks, the owner (`app_owners`) and the author (`user_id = auth.uid()`), as S-05 did? The PRD scopes notes to the account and the codebase scopes reads to owners.
6. **Delete confirmation:** a second confirm step without JS (`<details>`), or delete straight away?
7. **Keep the S-05 commits:** tag `d651733` locally (e.g. `archive/record-feedback`) so `git gc` doesn't drop them, or don't bother, since this research records the parts worth reusing?

## Facts for planning

- The first owner-write table needs RLS, `revoke all`, column-level `grant insert/update/delete` to authenticated, and per-operation policies with `using` and `with check`. The S-05 trigger, with EXECUTE revoked, or a `default auth.uid()` sets `user_id`. Trim the text and reject blank text in the DB check.
- Writes go through `/api/notes` (Origin check). The handler checks `locals.user`, uses a zod form, posts with an `intent`, and redirects back to `/dashboard/history?day=…&note=saved|deleted|invalid|failed`. The page reads `note` from the query string. `parsePeriod` ignores unknown parameters (`period.ts:93`).
- View models: `DayView.note` becomes `{ text, updatedAt } | null`, `DayCell.hasNote` is added with a `HAS_NOTE_WORD` in its accessible name, and the quarter's `note` slot stays `null` or is removed.
- Docs to update: `docs/architecture.md` (the first client write and its security model), `docs/logic.md` (the note rules), `docs/decisions.md` (the design decision), and the stale `roadmap.md:412,435` lines.
