-- Owner-only read access to the newest live snapshot. Owners read ingest_pushes through the
-- public.live_state view only; token_id, payload_hash and the other columns stay unreadable because
-- the grant is column-level, not a table grant.

-- F-01 revoked every table privilege from clients; reads need the grant AND an owner policy.
grant select (source, captured_at, received_at, payload) on public.ingest_pushes to authenticated;

create policy "owners can read ingest pushes"
  on public.ingest_pushes
  for select
  to authenticated
  using (exists (select 1 from public.app_owners o where o.user_id = (select auth.uid())));

-- security_invoker makes the view run with the caller's privileges, so the RLS policy and column
-- grants above apply; without it the view would read ingest_pushes as its owner and bypass both.
create view public.live_state
  with (security_invoker = true)
as
  select p.captured_at, p.received_at, p.payload -> 'state' as state
  from public.ingest_pushes p
  where p.source = 'homelab'
  order by p.captured_at desc
  limit 1;

-- Supabase grants new relations to anon and authenticated by default; only owners (authenticated) may read.
revoke all on public.live_state from anon, authenticated;
grant select on public.live_state to authenticated;
