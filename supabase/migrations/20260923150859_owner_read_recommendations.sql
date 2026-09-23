-- Owner-only read access. The app is single-tenant: users listed in public.app_owners may read the
-- pushed data; any other signed-in user reads nothing. Later slices (live state, insight, feedback)
-- reuse the same owner check. In production the owner row is inserted by hand (see the runbook);
-- supabase/seed.sql makes every local/CI user an owner and must never become a migration.

create table public.app_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_owners enable row level security;

-- F-01 revoked every table privilege from clients; reads need the grant AND an owner policy.
grant select on public.app_owners, public.recommendations to authenticated;

create policy "owners can read their own owner row"
  on public.app_owners
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "owners can read recommendations"
  on public.recommendations
  for select
  to authenticated
  using (exists (select 1 from public.app_owners o where o.user_id = (select auth.uid())));
