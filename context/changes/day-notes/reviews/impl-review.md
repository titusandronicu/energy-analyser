<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Day Notes

- **Plan**: context/changes/day-notes/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

Automated criteria re-run on main at 05ed799:

- 919 tests, lint, astro check (0 errors), the build, the `set:html` grep (empty), prettier and the `day_notes` docs grep (7 lines) all pass.
- Smoke passed in CI on #88 and locally on a fresh database (57/57).
- All 16 Progress rows are ticked:
  - 1.5 and 2.7 were checked on the local stack, by REST and in the browser at 390 and 1440 px.
  - 3.3 and 3.4 were checked in production: the migration is applied (20261001072438), the deploy is at 9215188, the add/edit/delete flow works, and 0 rows are left.
- Security holds:
  - RLS checks both author and owner, the column grants never expose `user_id`, and the trigger's EXECUTE is revoked.
  - The Origin check covers `/api/notes`, and the route checks the session.
  - There is no open redirect: the target is rebuilt from the parsed period.
  - All text is escaped, and logs never carry note text.
- Nothing about notes leaves the app. Test data is synthetic.

## Findings

### F1 — The save logic (update → insert → retry) is not unit-tested

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/api/notes.ts:26-34
- **Detail**: The update-then-insert with one 23505 retry lives in the route, and no test covers it. Smoke can't tell the paths apart: if `count` came back 0 on an edit, the code would fall through to insert, hit 23505, retry the update, and still say "saved". Separately, if the retried update matches 0 rows (a concurrent delete), it reports "saved" with nothing saved.
- **Fix**: Move `save` into `day-notes.ts` as `saveNote(day, text, { update, insert })` with injectable writes, as in the other services. Report `failed` when the retry matches 0 rows. Unit-test four paths: updated, inserted, 23505 then retry, and update error.
- **Decision**: FIXED — `saveNote` in day-notes.ts with injectable writes; retry with 0 rows fails; 8 unit tests

### F2 — Line breaks can push a note within `maxlength` over zod's 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/history/DayNotePanel.astro:74, src/lib/services/day-notes.ts:54
- **Detail**: Browsers count a textarea newline as 1 character for `maxlength` but submit it as CRLF, which is 2 characters. A near-500-character note with line breaks passes the browser and then comes back as "invalid". Re-saving a prefilled edit can hit the same thing.
- **Fix**: Normalise `\r\n` to `\n` before trimming and validating, and test that 499 characters with one line break are accepted.
- **Decision**: FIXED — CRLF/CR normalised to LF before trim and length; 4 tests

### F3 — The "invalid" notice disappears when the day can't be opened

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/day-notes.ts:66,73; src/pages/dashboard/history.astro
- **Detail**: An out-of-range or malformed day falls back to `/dashboard/history?note=invalid`, which shows the default month. Only `DayNotePanel` renders notices, so the failure is silent. It's reachable only by a forged or stale form.
- **Fix**: Render the note notice above the month view as well, when `?note=` is present and the view isn't a day.
- **Decision**: FIXED — shared NoteNotice shown above non-day (and failed-day) views

### F4 — The route's Supabase-missing path and form parsing differ from neighbouring routes

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/notes.ts:12,20,28,38
- **Detail**: When Supabase isn't configured, the route builds a fake DB error inside closures. `signin.ts:10-12` checks `if (!supabase)` up front instead. Also, `formData()` throws on a body that isn't a form, which gives a 500.
- **Fix**: Check for Supabase once at the top (logging once, then redirecting with `failed`), and wrap `formData()` in try/catch, redirecting with `invalid`.
- **Decision**: FIXED — Supabase checked once up front; unreadable body redirects `invalid`

### F5 — The "invalid" notice hardcodes 500

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/day-notes.ts:17
- **Detail**: The notice text contains a literal "500", while the panel label uses `NOTE_MAX_LENGTH`.
- **Fix**: Build the notice from `NOTE_MAX_LENGTH`. The pinned-copy test stays as it is.
- **Decision**: FIXED — notice built from NOTE_MAX_LENGTH; copy unchanged and pinned

### F6 — The plan and brief still call save "one upsert"

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/day-notes/plan.md:39,61; plan-brief.md:29,55,63
- **Detail**: The shipped docs correctly say update-then-insert, but the planning artifacts still describe an upsert.
- **Fix**: Add a dated addendum line to the plan's Key Discoveries and the brief's Key Decisions: "built as update-then-insert; upsert can't target the unreadable user_id".
- **Decision**: FIXED — dated addendum in plan Key Discoveries and brief Key Decisions

### F7 — A signed-out post loses the typed text

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/notes.ts:15
- **Detail**: An expired session redirects to sign-in with no way back to the day, and the text is lost. That's acceptable for a single owner with long-lived sessions.
- **Fix**: Accept as is, and record it in docs/logic.md's Notatki section as a known limitation.
- **Decision**: FIXED — known limitation recorded in docs/logic.md Notatki

### F8 — Roadmap S-19 still says `in-progress`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:58,297,412
- **Detail**: The change is implemented and deployed, but the roadmap still marks S-19 `in-progress`. `/10x-archive` flips the item to done.
- **Fix**: No code change; it closes with the archive.
- **Decision**: ACCEPTED — closes with /10x-archive
