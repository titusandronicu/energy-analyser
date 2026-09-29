-- Owners may read when today's daily row was captured: the live card must know how old the row's consumption
-- total is, because a fresh state-only push leaves an older daily total in place. The grant is column-level and
-- the owner-only policy from 20260925162240_owner_read_daily_energy.sql still applies, so anon gets nothing and
-- updated_at and push_id stay unreadable.

grant select (captured_at) on public.daily_energy to authenticated;
