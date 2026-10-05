---
change_id: testing-access-and-input-abuse
title: Tests for non-owner access, Origin and token rules, and lab-text handling
status: archived
created: 2026-10-02
updated: 2026-10-05
archived_at: 2026-10-05T12:08:00Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Access and input abuse". Risks covered: #6, #7. Test types planned: integration + unit. Risk response intent: #6 a signed-out or non-owner client reads and writes nothing; a foreign Origin is refused on every mutating route; the token exemption cannot cover a cookie-authenticated route; bad or revoked ingest tokens are refused (needs a real non-owner session, since local and CI users are all owners through the seed). #7 lab text and notes render as literal text; form, server and database limits agree, including line breaks; blank is rejected. After creating the folder, follow the downstream continuation rule.
