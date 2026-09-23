-- Local development and CI only: seed.sql runs on `supabase start` / `supabase db reset`,
-- never on a production `supabase db push`. The token below is deliberately public.
insert into public.ingest_tokens (label, token_hash)
values ('local-dev', extensions.digest('local-dev-ingest-token-not-secret', 'sha256'));

-- Local development and CI only: every new user becomes an app owner, so smoke-created users can read
-- the owner-only data. NEVER copy this into a migration — in production only the listed owner may read.
create or replace function public.seed_make_every_user_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_owners (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger seed_make_every_user_owner
  after insert on auth.users
  for each row execute function public.seed_make_every_user_owner();

insert into public.app_owners (user_id) select id from auth.users on conflict do nothing;
