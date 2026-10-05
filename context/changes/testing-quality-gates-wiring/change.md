---
change_id: testing-quality-gates-wiring
title: Testing Phase 4 - quality-gates wiring
status: implemented
created: 2026-10-05
updated: 2026-10-05
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Quality-gates wiring". Risks covered: cross-cutting (locks in the protection of risks #1 to #7). Test types planned: gates. Risk response intent: make the suites that Phases 1 to 3 delivered (the unit and request-guard tests in `npm test`, the integration suite including the access and notes tests, and smoke) required quality gates so a regression in any covered risk blocks a merge, and prove each gate by a deliberate break that turns CI red; add an optional post-edit check on the services that surfaces regressions at edit time, recommended and not required. Challenge "the suite exists, so it gates": confirm what actually blocks a merge (required status checks, workflow triggers, skipped or optional jobs) rather than assuming. After creating the folder, follow the downstream continuation rule.
