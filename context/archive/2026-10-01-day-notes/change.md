---
change_id: day-notes
title: Add, view, edit and delete notes on calendar days
status: archived
created: 2026-10-01
updated: 2026-10-01
archived_at: 2026-10-01T07:47:56Z
---

## Notes

Roadmap S-19 (US-06, FR-025–FR-028). The user can add a note to a calendar day, see it on that day, see which days in a month have notes, and edit or delete it. It builds on the history calendar (S-15, `/dashboard/history`).

This is the app's first create/update/delete surface and its first client write. The owner-only table approach from the dropped S-05 (branch `feat/record-feedback`) can be reused. Notes are owner data and never leave the app or go to the lab or the LLM, unless the plan decides otherwise.
