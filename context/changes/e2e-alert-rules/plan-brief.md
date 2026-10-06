# First Browser E2E Test: The Owner Manages an Alert Rule — Plan Brief

> Full plan: `context/changes/e2e-alert-rules/plan.md`

## What & Why

Add Playwright and one authenticated browser flow: the signed-in owner creates, edits, toggles and deletes an alert rule on the real `/dashboard/alerts` page, plus the two refusal notices. It guards the one risk no other test can see: the page's forms and the route's expected fields drifting apart, because nothing renders the page today. It also gives the project the browser-level test the certification's "a test from the user's perspective" points at.

## Starting Point

The project has unit tests (1767), an integration suite against a real database (113) and a 73-step HTTP smoke script, but no browser layer; `test-plan.md` lists "browser e2e: none yet". The alerts page is plain server HTML with no client JS, the CI already builds and starts the app against a local Supabase in the smoke job, and the ruleset requires only `ci`, `smoke` and `integration`. The course's e2e skills are not installed, so the rules in `~/code/CLAUDE.md` are applied by hand.

## Desired End State

`npm run test:e2e` builds the app, signs in as a fresh owner and runs a seed spec plus three alert-rules tests in Chromium, green and repeatable; a teardown leaves no user behind. Renaming a form field in the real markup turns the tests red, locally and in a new non-required `e2e` CI job. `test-stack.md` and the `test-plan.md` cookbook describe the layer.

## Key Decisions Made

| Decision             | Choice                                                                 | Why (1 sentence)                                                                                     | Source         |
| -------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| CI placement         | New non-required `e2e` job                                             | Runs in parallel and names itself, and a new browser test cannot block merges while it proves stable | Plan           |
| Sign-in              | Setup through `POST /api/auth/signin`, saved as `storageState`         | Stable and fast, with no dependence on hydration of the sign-in form                                 | Plan           |
| Scope                | Lifecycle plus invalid and duplicate notices, plus a seed spec         | Proves the form-to-route contract on success and on refusal, which is the stated risk                | Plan           |
| Markup               | No change                                                              | Test-only, so a red test means the test or a real regression; the rule is found by its unique label  | Plan           |
| Location and browser | `tests/e2e/`, Chromium only                                            | Beside `tests/integration/`; one browser keeps cost and flakes down                                  | Plan (default) |
| Server               | Production build on `127.0.0.1:4321`, `APP_ORIGIN` set to the base URL | Same as the smoke job, and the Origin check needs a matching origin                                  | Plan (default) |
| Cleanup              | `globalTeardown` deletes the user through `pg`, local hosts only       | Mirrors the integration helpers without importing them                                               | Plan (default) |
| Flake policy         | No retries, trace on failure, report uploaded when CI fails            | A retry would hide the flakes this change must expose                                                | Plan (default) |
| Server reuse         | Never reuse an existing server                                         | A leftover server could serve a stale build and make the deliberate break prove nothing              | Review         |

## Scope

**In scope:** `@playwright/test`, `playwright.config.ts`, the signed-in setup, a teardown, a seed spec, the alert-rules spec, the deliberate break, a CI job, `test-stack.md`, `test-plan.md` and the docs.

**Out of scope:** product markup changes, a real sign-in-form test or magic-link flow, a day-notes flow, other browsers, making `e2e` a required check, retries, and any change to the app or the other suites.

## Architecture / Approach

Playwright starts the production build as its `webServer`; a `setup` project signs a fresh user up through Supabase's REST endpoint, signs it in through the app's own route with the right `Origin`, and saves the session; the `chromium` project reuses it. The alert-rules tests find a rule by its unique label inside its list item and read the `role="status"` notice after each 303. A global teardown deletes the user. The CI job mirrors the smoke job's Supabase and build steps and adds the browser install.

## Phases at a Glance

| Phase                  | What it delivers                                                             | Key risk                                                                               |
| ---------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1. Setup and seed spec | Dependency, config, session, teardown, green seed spec                       | Lint rules on Playwright fixtures; the Origin check; the test server's env             |
| 2. Alert-rules tests   | Lifecycle, invalid and duplicate tests plus the deliberate break             | Flakiness; the repeated `Dodaj` and `Usuń` names across rules                          |
| 3. CI job and docs     | The `e2e` job and the docs (including every stale passage in `test-plan.md`) | Browser install and Supabase start time on the runner; docs that enumerate the CI jobs |

**Prerequisites:** the local Supabase reachable (on this setup the relay to the UGREEN), a one-time `npx playwright install chromium` (about 170 MB), and `gh` access for the PR checks.
**Estimated effort:** about 2-3 sessions across 3 phases.

## Open Risks & Assumptions

- The strategy in `test-plan.md` says not to promote to e2e out of habit; this plan assumes the form-to-route drift risk is genuinely browser-only, which the earlier by-hand finding supports.
- `@playwright/test` is pinned to whatever exact version installs; its docs were checked through Context7, not against a specific release.
- Locators lean on Polish visible text, so a copy change breaks the tests (by design, a reviewed diff).
- The new job is not required, so until it is added to the ruleset it only reports.

## Success Criteria (Summary)

- `npm run test:e2e` is green locally and in the `e2e` job, repeatably.
- Breaking a form field in the real markup turns the tests red.
- The docs describe the layer, how to run it and why it was added.
