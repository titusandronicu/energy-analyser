-- Owner-only read access to the daily totals for the seasonal usage insight. The grant is column-level,
-- so captured_at, updated_at and push_id stay unreadable; anon gets nothing.

-- F-01 revoked every table privilege from clients; reads need the grant AND an owner policy.
grant select (day, pv_kwh, load_kwh, grid_import_kwh, grid_export_kwh, pv_forecast_kwh)
  on public.daily_energy to authenticated;

create policy "owners can read daily energy"
  on public.daily_energy
  for select
  to authenticated
  using (exists (select 1 from public.app_owners o where o.user_id = (select auth.uid())));
