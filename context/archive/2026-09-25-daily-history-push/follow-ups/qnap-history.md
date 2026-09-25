# Follow-up: older history from the QNAP energy database

- **Why:** S-04 compares recent usage with the same season in earlier years. The lab's snapshots start on 2026-07-17 and its PGE readings on 2026-01-31, so the seasonal baseline has no year-ago data and S-04 runs on its 30-day fallback until mid-2027.
- **Where:** the old QNAP energy stack's Postgres (`energy_db`, with `energy_backend`), stopped since 2026-07-22 under `runbooks/qnap-legacy-energy-stack-cooling-off.md` (homelab-2) and kept for rollback.
- **Check (read-only):** which tables hold daily or finer PV/load/import/export totals, and from which date.
- **If useful:** import the daily totals into the lab's own store, then backfill the app through the normal push (`daily_history` accepts any past dates, 62 per push; several pushes cover a year). No app schema change.
- **Needs:** operator SSH access to the QNAP (the UGREEN's `qnap` SSH alias points at the UGREEN itself), and the owner's OK to start `energy_db` temporarily if the data is only reachable through it.
- **Owner:** Kamil. Raised 2026-09-25 during F-02 phase 2.
