-- Owner-only read access to the newest pushed bill forecast, mirroring public.live_state. No grant and no
-- policy here: the column grant on ingest_pushes.payload and the "owners can read ingest pushes" policy
-- from 20260925123751_live_state_view.sql already cover this view's reads, so they are inherited, not
-- forgotten.

-- security_invoker makes the view run with the caller's privileges, so that inherited policy and the
-- column grants apply; without it the view would read ingest_pushes as its owner and bypass both.
create view public.bill_forecast
  with (security_invoker = true)
as
  select p.captured_at, p.received_at, p.payload -> 'bill_forecast' as bill_forecast
  from public.ingest_pushes p
  where p.source = 'homelab'
    -- The key-presence test is what separates this view from live_state: `state` is required by the
    -- contract, but `bill_forecast` is optional, so the newest push may simply not carry one. Taking the
    -- newest push unconditionally would blank the card and throw away a good forecast pushed minutes
    -- earlier. Whether the newest forecast is too old to show is the generated_at rule's job, not this row's.
    and p.payload ? 'bill_forecast'
  order by p.captured_at desc
  limit 1;

-- Supabase grants new relations to anon and authenticated by default; only owners (authenticated) may read.
revoke all on public.bill_forecast from anon, authenticated;
grant select on public.bill_forecast to authenticated;
