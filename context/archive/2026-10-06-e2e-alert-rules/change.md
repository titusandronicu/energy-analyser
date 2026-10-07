---
change_id: e2e-alert-rules
title: First browser e2e test: the owner manages an alert rule
status: archived
created: 2026-10-06
updated: 2026-10-07
archived_at: 2026-10-07T13:12:12Z
---

## Notes

add the first browser-level e2e test (Playwright): the owner creates, edits, toggles and deletes an alert rule through the real /dashboard/alerts page. Risk: the page's forms and the route's expected fields can drift apart, which unit and integration tests never see. Needs the Playwright setup (webServer, auth setup project with storageState, green seed test, context/foundation/test-stack.md) and an update of test-plan.md section 3 and 6.3. The M3L4 skills /10x-e2e-setup and /10x-e2e are not installed, so follow the rules in ~/code/CLAUDE.md by hand.
