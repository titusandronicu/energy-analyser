-- Ingest token check: a small function that answers whether a token is live, with the same hash and revoke rules as
-- public.ingest_push (20261006120000_ingest_push_sections.sql). POST /api/ingest calls it first, so an unknown or
-- revoked token is answered 401 before the body is read or validated. It returns only a boolean, never a reason, so
-- a caller can't tell an unknown token from a revoked one. Probing it is no easier than probing ingest_push, which
-- answers the same question, and tokens are minted as 32 random bytes by scripts/create-ingest-token.mjs. No table
-- changes.
-- Design: context/changes/refactor-push-boundary/plan.md (Phase 4).

create or replace function public.ingest_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ingest_tokens t
    where t.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
      and t.revoked_at is null
  );
$$;

-- Supabase grants EXECUTE on new functions to anon and authenticated by default; the route calls this with the anon key.
revoke all on function public.ingest_token_ok(text) from public, anon, authenticated;
grant execute on function public.ingest_token_ok(text) to anon;
