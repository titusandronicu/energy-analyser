---
change_id: history-backfill
title: Send the lab days recorded before the first push once
status: archived
created: 2026-09-30
updated: 2026-09-30
archived_at: 2026-09-30T10:09:46Z
---

## Notes

Roadmap F-03 (FR-024). Send the lab days 2026-07-16 to 2026-07-25 (before the first push on 2026-07-26) once, through the existing `daily_history` push section. Homelab-2 only: the push script needs a date-range option (e.g. `--from 2026-07-16 --to 2026-07-26`); the app contract (max 62 entries, no age cap) stays as is. Must stay idempotent with the regular 35-day push; incomplete days stay empty.

**Deadline:** the lab history file keeps 90 days (25,920 rows at 5 minutes), so the oldest days start dropping around 2026-10-28.

2026-09-30, Phase 1 dry run: on 4 of the 10 days (07-18, 07-21, 07-23, 07-24) PV + import and house + export differ by 8–32 kWh, because the early PV and export counters are off. The stored days from the same period (e.g. 07-26, 07-27) have the same imbalance. Owner's decision: push the days as they are, under the same day rules as the regular push.
