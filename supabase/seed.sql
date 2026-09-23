-- Local development and CI only: seed.sql runs on `supabase start` / `supabase db reset`,
-- never on a production `supabase db push`. The token below is deliberately public.
insert into public.ingest_tokens (label, token_hash)
values ('local-dev', extensions.digest('local-dev-ingest-token-not-secret', 'sha256'));
