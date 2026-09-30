-- Least privilege, as for daily_energy: owners read the hourly figures but not when a push captured them, which the
-- app never selects. From the grid-export-mismatch implementation review (F5).
revoke select (captured_at) on public.hourly_energy from authenticated;
