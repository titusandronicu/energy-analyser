-- Day notes (S-19): the owner writes one short note on a calendar day ("urlop", "pompa ciepła od dziś"), reads it on
-- that day and sees which days of a month have one. Design and precedents: context/changes/day-notes/research.md.
-- This is the first table a signed-in client writes: every other client grant is an owner-only read, and the only
-- other writes go through the security definer ingest_push. Notes stay in the app; nothing sends them to the lab or
-- an LLM, and they never change ratings, summaries or recommendations.
-- `day` is the Europe/Warsaw calendar day, as in daily_energy. The app accepts only days from 2026-07-16 through
-- today; the database enforces the author, the owner check and the text rules.

create table public.day_notes (
  id bigint generated always as identity primary key,
  -- Set by the database. Clients have no insert or update grant on it, so they cannot write a note for someone
  -- else even if a policy were wrong.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  -- 1 to 500 characters and not only whitespace (the S-05 review's btrim fix).
  text text not null check (char_length(text) <= 500 and btrim(text) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One note per day per user; the index also serves the day and month reads.
  unique (user_id, day)
);

-- Keeps updated_at honest without a client grant on it. Security invoker with an empty search_path; nobody needs to
-- call it directly, so EXECUTE is revoked (S-05 review F1). Triggers fire without the caller's EXECUTE privilege.
create function public.day_notes_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.day_notes_set_updated_at() from public, anon, authenticated;

create trigger day_notes_set_updated_at
  before update on public.day_notes
  for each row
  execute function public.day_notes_set_updated_at();

alter table public.day_notes enable row level security;

-- Defense in depth on top of RLS, as in 20260923101001_push_ingestion.sql: clients get nothing until opened below.
revoke all on public.day_notes from anon, authenticated;

-- Each operation needs the grant AND its policy. Clients read the note's day, text and times, insert only the day
-- and text, change only the text, and delete; id and user_id stay unreadable and unwritable. anon gets nothing.
grant select (day, text, created_at, updated_at) on public.day_notes to authenticated;
grant insert (day, text) on public.day_notes to authenticated;
grant update (text) on public.day_notes to authenticated;
grant delete on public.day_notes to authenticated;

-- Author and owner: the row must be the signed-in user's own, and that user must be in app_owners.
create policy "owners can read their day notes"
  on public.day_notes
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  );

create policy "owners can add their day notes"
  on public.day_notes
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  );

create policy "owners can change their day notes"
  on public.day_notes
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  );

create policy "owners can delete their day notes"
  on public.day_notes
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.app_owners o where o.user_id = (select auth.uid()))
  );
