---
change_id: testing-time-and-number-guards
title: Tests for stale data, money figures and period boundaries
status: implementing
created: 2026-10-01
updated: 2026-10-01
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Time and number guards". Risks covered: #1, #2, #5. Test types planned: unit + contract. Risk response intent: #1 prove that past each surface's age threshold, or on an earlier day, the page shows last-known data with an explicit stale flag and age and never reads as current; #2 prove that implausible, stale, other-month or too-thin bill inputs give a refusal or neutral state and a known fixture gives an independently hand-computed figure; #5 prove that day, month and "enough data" decisions match the rules in docs/logic.md at and around the boundary (Warsaw midnight, DST, year end). After creating the folder, follow the downstream continuation rule.
