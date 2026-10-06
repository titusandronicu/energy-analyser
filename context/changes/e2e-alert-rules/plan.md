# First Browser E2E Test: The Owner Manages an Alert Rule Implementation Plan

## Overview

Add Playwright to the project and one authenticated browser flow: the signed-in owner creates, edits, toggles and deletes an alert rule on the real `/dashboard/alerts` page, plus the two refusal notices (invalid threshold, duplicate rule). The risk it guards is the one nothing else can see: the page's forms and the route's expected fields drifting apart, because the unit and integration tests never render the page. The change is test-only (no product markup changes) and adds a non-required `e2e` CI job.

## Current State Analysis

- There is no browser test layer: `context/foundation/test-plan.md` lists "browser e2e: none yet, Playwright's setup project with `storageState` is the current pattern if it is added later" and §6.3 is a TBD. The strategy says not to promote to e2e because it "feels safer"; a browser-only risk justifies it, and this one qualifies (a form posting different field names than `src/lib/services/alert-rules.ts` parses is invisible to every existing test; it was only found by reading the rendered HTML by hand).
- The M3L4 skills `/10x-e2e-setup` and `/10x-e2e` named in `~/code/CLAUDE.md` are not installed and not in the pinned skillset, so the rules in that file are applied by hand: `getByRole` / `getByLabel` / `getByText` first, `getByTestId` only when accessibility is ambiguous, never CSS or XPath, never `page.waitForTimeout()`, each test independent with unique ids and its own cleanup.
- The page under test is plain server HTML with no client JS: create form inside `<details><summary>Dodaj regułę`, per-rule `<li data-testid="alert-rule">` with `Wyłącz`/`Włącz`, `Edytuj` → `Zapisz`, `Usuń` → `Na pewno usuń`, and a `role="status"` notice whose text follows the `?alert=<outcome>` of the 303 the route always answers (`src/components/alerts/AlertRulesPanel.astro`, `AlertNotice.astro`, `src/pages/api/alert-rules.ts`, `src/lib/services/alert-rules.ts`).
- The sign-in page has two forms with the same "Adres e-mail" label and both are React islands (`src/components/auth/PasswordSignInForm.tsx`, `MagicLinkForm.tsx`), so a test that fills them before hydration can race. The owner's decision is to sign in through the route, not the form.
- Mutating `/api/*` requests are refused with 403 unless `Origin` equals `APP_ORIGIN` or, when unset, the request's own origin (`src/middleware.ts:25-36`), and Astro's own check is off (`astro.config.mjs`), so the test server's `APP_ORIGIN` must match the browser's base URL.
- CI already builds the app and starts it on `127.0.0.1:4321` against a local Supabase in the `smoke` job (`.github/workflows/ci.yml:29-48`, `.github/actions/local-supabase/action.yml`); the ruleset requires only `ci`, `smoke` and `integration` (`.github/rulesets/main-quality-gates.json:17`), so a fourth job runs without blocking merges.
- Local Supabase signs a user up with a session immediately (`supabase/config.toml:209`, confirmations off) and a seed trigger makes every new user an owner (`supabase/seed.sql`); `tests/integration/support/privileged.ts` shows the cleanup pattern (`delete from auth.users`, local hosts only, default DSN `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
- `eslint .` lints every new `.ts` file with the strict type-checked rules (`eslint.config.js:16-40`) and ignores whatever `.gitignore` ignores (`:83`); tsconfig includes `**/*`; neither vitest config picks up `tests/e2e/` (`vitest.config.ts:23`, `vitest.integration.config.ts:13`).

## Desired End State

- `npm run test:e2e` builds the app, starts it, signs in as a fresh owner and runs the specs against the local Supabase; it is green and stays green when repeated.
- Three alert-rules tests (lifecycle, invalid notice, duplicate notice) plus a seed spec run in Chromium; each cleans up after itself and a teardown removes the test user.
- A deliberate break (renaming a form field in the real markup) turns the tests red, and the CI `e2e` job shows the same on a throwaway PR.
- `context/foundation/test-stack.md` exists and `test-plan.md` records the e2e layer, its cookbook (§6.3) and when it runs.

### Key Discoveries:

- Playwright's documented pattern fits with one deviation: a `setup` project (`testMatch: /.*\.setup\.ts/`) that writes `storageState`, a `chromium` project with `dependencies: ["setup"]` and `use.storageState`, and a `webServer` that waits on a `url`. The docs reuse an existing server locally (`reuseExistingServer: !process.env.CI`); this plan sets it to `false`, so a leftover server can never serve a stale build (review finding F6). Context7 docs, `/microsoft/playwright`.
- The app route can sign in without the sign-in form: `POST /api/auth/signin` with `email` and `password` form fields and an `Origin` header answers a 302 to `/dashboard` and sets the session cookies (`src/pages/api/auth/signin.ts`, `src/lib/services/password-signin.ts:41`); Playwright's `request` fixture keeps those cookies and can save them as `storageState`.
- Rules are identified by their unique label inside the list item (`getByRole("listitem").filter({ hasText })`), so no markup change is needed; `Dodaj` must be matched `exact: true` because "Dodaj regułę" contains it, and `Usuń` likewise against "Na pewno usuń".
- `unique (user_id, kind, threshold)` means tests sharing one owner must not reuse a threshold; each test draws its own whole-minute threshold in 15-1440 and the duplicate test reuses one on purpose.

## What We're NOT Doing

- No product markup changes (no new `aria-label`s); locators lean on visible text, so a copy change is a reviewed diff.
- No real sign-in-form test and no Mailpit or magic-link flow; sign-in is set up through the app's own route.
- No day-notes flow and no seeded history data.
- Only Chromium; no Firefox or WebKit.
- No promotion of `e2e` to a required check (a ruleset edit after several green PRs, outside this change) and no CI retries that would hide flakes.
- No change to the unit or integration suites, the smoke script or the app.

## Implementation Approach

Three phases: (1) Playwright setup, the server, the signed-in session and a green seed spec; (2) the real alert-rules tests and the deliberate break; (3) the CI job and the docs. Defaults I chose without asking, recorded for review: specs in `tests/e2e/` (beside `tests/integration/`); Chromium only; the test server is the production build (`npm run build && node ./dist/server/entry.mjs`) on `127.0.0.1:4321` with `APP_ORIGIN` set to the base URL and never an existing server reused; a `globalTeardown` deletes the created user through `pg` (a local-hosts-only guard copied in spirit from `privileged.ts`, not imported from the integration helpers); no retries; `trace: "retain-on-failure"`; the HTML report is uploaded only when CI fails; `@playwright/test` pinned to the exact version installed; a `test:e2e` script separate from `npm test`; `context/foundation/test-stack.md` written by hand because `/10x-e2e-setup` is not installed.

## Phase 1: Playwright setup and a green seed spec

### Overview

Add the dependency, the config, the signed-in session, the teardown and a seed spec, so `npm run test:e2e` is green before any real flow exists.

### Changes Required:

#### 1. Dependency and script

**File**: `package.json`, `package-lock.json`

**Intent**: Add the test runner and a way to run it.

**Contract**: `@playwright/test` as a devDependency, pinned to the exact version installed; script `"test:e2e": "playwright test"`. The updated `package-lock.json` is committed with it, because `npm ci` in every CI job and in the Dockerfile reads it. Browsers come from `npx playwright install chromium`, not from `npm ci`.

#### 2. Playwright config

**File**: `playwright.config.ts`

**Intent**: Run the production build on a fixed local address, sign in once, and reuse the session.

**Contract**: `testDir: "tests/e2e"`; `use.baseURL: "http://127.0.0.1:4321"`, `trace: "retain-on-failure"`; `reporter` is `list` locally and `list` plus an HTML report (`open: "never"`) when `CI`; `retries: 0`. Projects: `setup` (`testMatch: /.*\.setup\.ts/`) and `chromium` (`devices["Desktop Chrome"]`, `storageState: "tests/e2e/.auth/owner.json"`, `dependencies: ["setup"]`). `globalTeardown: "./tests/e2e/global.teardown.ts"`. `webServer`: `command: "npm run build && node ./dist/server/entry.mjs"`, `url: "http://127.0.0.1:4321/api/health"`, `timeout: 180_000`, `reuseExistingServer: false` (a taken port fails loudly, so a leftover server can never serve a stale build, which would also make the deliberate break prove nothing), `env` inheriting `process.env` plus `HOST=127.0.0.1`, `PORT=4321`, `APP_ORIGIN=http://127.0.0.1:4321`, `APP_VERSION=e2e`. The config fails with a clear message when `SUPABASE_URL` or `SUPABASE_ANON_KEY` is missing, not local (`127.0.0.1` or `localhost`, `http:`) or not an anon key, as `tests/integration/support/stack.ts` does. Playwright does not load `.env`, so the message names the repo's recipe for taking only the two values from the stack: `scripts/remote-docker.sh exec npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)='` (`docs/prerequisites.md`, `test-plan.md` §6.2).

#### 3. Signed-in session

**File**: `tests/e2e/auth.setup.ts`

**Intent**: Create a fresh owner and save a signed-in session without touching the sign-in form.

**Contract**: sign a unique user up through `POST {SUPABASE_URL}/auth/v1/signup` (header `apikey`, JSON email and password, email `e2e-<timestamp>-<random>@example.com`), expect 200 with a session and write the email to `tests/e2e/.auth/owner-email.txt` immediately, before signing in, so a failed sign-in still leaves the teardown something to delete; then `POST /api/auth/signin` through the `request` fixture as a form with `email` and `password` and an `Origin` header equal to the base URL, `maxRedirects: 0`, expect 302 to `/dashboard`; save `request.storageState({ path: "tests/e2e/.auth/owner.json" })`.

#### 4. Teardown

**File**: `tests/e2e/global.teardown.ts`

**Intent**: Leave no test user behind (its rules and notes go with it through the cascade).

**Contract**: read the email file; if absent do nothing; connect with `pg` to `SUPABASE_DB_URL` (default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`), refuse a non-local host, run `delete from auth.users where email = $1`, always disconnect.

#### 5. Seed spec

**File**: `tests/e2e/seed.spec.ts`

**Intent**: Prove the setup, and the access gate, from a user's point of view.

**Contract**: (a) with an empty `storageState` (`{ cookies: [], origins: [] }`), opening `/dashboard/alerts` ends on `/auth/signin` and shows the heading "Zaloguj się"; (b) signed in, opening `/dashboard/alerts` shows the heading "Reguły alertów" and the nav link "Alerty" with `aria-current="page"`. Role, label and text locators only; web-first assertions; no timeouts.

#### 6. Housekeeping

**File**: `.gitignore`, `.prettierignore`, `.dockerignore`, `eslint.config.js` (only if the new files trip it), `tsconfig.json` (only if needed)

**Intent**: Keep generated output and the session file out of git, lint and formatting.

**Contract**: add `test-results/`, `playwright-report/`, `blob-report/` and `tests/e2e/.auth/` to `.gitignore` and `.prettierignore`, and `test-results/`, `playwright-report/` and `blob-report/` to `.dockerignore` (otherwise they enter the Docker build context); if the strict type-checked rules or `react-hooks/rules-of-hooks` object to Playwright's fixture callback, rename the callback or add a narrow `tests/e2e/**` override with a comment, never a blanket disable.

### Success Criteria:

#### Automated Verification:

- The seed spec passes against the local stack: `npm run test:e2e`
- Lint, type checks and formatting pass: `npm run lint`, `npx astro check` and `npx prettier --check tests playwright.config.ts package.json`
- The existing unit suite is unaffected: `npm test`
- The teardown removed the test user: `node -e 'const {Client}=require("pg");(async()=>{const c=new Client({connectionString:process.env.SUPABASE_DB_URL??"postgresql://postgres:postgres@127.0.0.1:54322/postgres"});await c.connect();const r=await c.query("select count(*)::int as n from auth.users where email like $1",["e2e-%"]);console.log(r.rows[0].n);await c.end()})()'` prints 0 after the run

#### Manual Verification:

- Open the report with `npx playwright show-report`: the two seed checks read as user actions (open the page, see the sign-in heading, see the alerts heading)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: The alert-rules tests and the deliberate break

### Overview

Add the real browser flows for alert rules and prove they catch the drift they exist for.

### Changes Required:

#### 1. Alert-rules spec

**File**: `tests/e2e/alert-rules.spec.ts`

**Intent**: Drive the real forms the way the owner does and assert what the owner sees.

**Contract**: three independent tests, each creating its own rule with a unique label (`e2e-<timestamp>-<random>`) and a whole-minute `live_stale` threshold drawn at random inside a range reserved for that test, all below 1000 so no number renders with a thousands separator: the lifecycle create 15-299 and its edit 300-599, the duplicate 600-899 (the invalid test uses the fixed value 5). Each test removes what it created through the page.

- Lifecycle: open the create `<details>` via its summary "Dodaj regułę", choose the kind "Dane z domu są nieaktualne", fill "Próg", "Nazwa (opcjonalnie, do 60 znaków)", submit with the button named exactly "Dodaj"; wait for the URL `alert=created`, see the status "Reguła dodana.", and see the rule's list item (found by its label) with the text "starsze niż <N> min" and "w normie". Edit: "Edytuj", change the threshold, "Zapisz" → status "Reguła zapisana." and the new threshold text. Toggle: "Wyłącz" → "Stan reguły zmieniony.", the item shows "wyłączona" and its button reads "Włącz". Delete: "Usuń" then the button named exactly "Na pewno usuń" → "Reguła usunięta." and no item with that label remains.
- Invalid: a `live_stale` threshold of 5 (below 15) → URL `alert=invalid` and the status "Reguła ma niepoprawne dane. Sprawdź próg, nazwę i odstęp między przypomnieniami."; no item with the label appears. This test guards the refusal message only: under the field-rename break below it stays green (every submit is invalid), so only the lifecycle and duplicate tests are drift detectors.
- Duplicate: create a rule, then create a second with the same kind and threshold and a different label → URL `alert=duplicate` and "Taka reguła już istnieje: ten sam rodzaj i próg."; only the first item exists; the test deletes it at the end.
  Scope every per-rule control to `getByRole("listitem").filter({ hasText: label })` and the create controls to the opened create `<details>`; the status through `getByRole("status")`. Texts are literals written in the spec, not read from the app's constants. No CSS, XPath or DOM-structure locators, no `waitForTimeout`; waits are `toHaveURL`, `toBeVisible` and the like.

#### 2. The deliberate break

**File**: `src/components/alerts/AlertRulesPanel.astro` (temporarily, worktree only)

**Intent**: Show that the test catches the drift it was written for.

**Contract**: rename the create form's `name="threshold"` to a different name in the worktree only, run the spec and see the lifecycle and duplicate tests go red (the route then answers `alert=invalid`; the invalid test stays green, as it should, and the config never reuses a server, so the rebuilt markup is what runs), then restore the file with `git checkout --`. The edit is never committed.

### Success Criteria:

#### Automated Verification:

- The three alert-rules tests pass: `npm run test:e2e`
- They stay green when repeated: `npx playwright test --repeat-each=5`
- Lint and type checks pass: `npm run lint` and `npx astro check`
- The other suites still pass: `npm test` and `npm run test:integration`
- The forbidden patterns are absent from the specs: `grep -rnE "waitForTimeout|page\.locator\(|xpath" tests/e2e` prints nothing

#### Manual Verification:

- Run once headed with `npx playwright test --headed alert-rules`: the page is driven the way an owner would, and no test rule is left on `/dashboard/alerts` afterwards

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: CI job and docs

### Overview

Run the test on every pull request without making it a required check, and record the layer in the docs.

### Changes Required:

#### 1. CI job

**File**: `.github/workflows/ci.yml`

**Intent**: A fourth, independent job that runs the browser test against a fresh local Supabase.

**Contract**: job `e2e` on `ubuntu-latest`, `timeout-minutes: 25`, same actions pinned to the same SHAs as the other jobs: checkout, setup-node 22 with npm cache, `npm ci`, `npx playwright install --with-deps chromium`, the local composite action `./.github/actions/local-supabase`, then one step that sources `supabase.env` and runs `SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" npm run test:e2e` (the webServer builds and starts the app); on failure upload `playwright-report/` and `test-results/` with the already pinned upload-artifact action; a final `if: always()` step runs `npx supabase stop --no-backup`. No `needs:`, not added to the ruleset.

#### 2. Test stack and test plan

**File**: `context/foundation/test-stack.md` (new), `context/foundation/test-plan.md`

**Intent**: Record the layer where the strategy and the cookbook live.

**Contract**: `test-stack.md` lists the tools and their pinned versions, the config in one place (projects, `storageState` path, `webServer`), how to run locally (stack reachable, the relay on this setup, `npx playwright install chromium`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` taken with `scripts/remote-docker.sh exec npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)='`, then `npm run test:e2e`) and in CI, the rules from `~/code/CLAUDE.md` (locators, no timeouts, independence and cleanup) and the five review questions used on the specs. `test-plan.md`, so it no longer contradicts itself: the "browser e2e" row of the tools table and the "end-to-end over HTTP" row pointing to it; a new risk #8 in the §2 risk map (the page's forms and the route's expected fields drift apart, cheapest layer a browser e2e) and the scoped wording of risk #3's anti-pattern ("promoting the check to a browser"); a Phase 5 row in §3 and the removal of the statement that browser end-to-end tests "are not in the rollout"; the test-base profile line saying pages have no tests; a non-required `e2e` row in the §5 gates table; §6.3 "Adding an e2e test" (the cookbook: when e2e is justified, the sign-in setup, locating a rule, cleanup, the deliberate break); a §6.6 note; and the "Last updated" line and the §8 freshness ledger.

#### 3. Docs in step with the code

**File**: `docs/decisions.md`, `docs/prerequisites.md`, `README.md`, `CLAUDE.md` (`AGENTS.md` is a symlink to it)

**Intent**: Keep the project docs in step (`context/foundation/lessons.md`) and name the prerequisites outside the repo.

**Contract**: `decisions.md` gets a dated entry (a browser-only risk justifies one e2e layer; sign-in through the route; a non-required job first; test-only; the rejected options). `prerequisites.md`: the local e2e needs the Supabase stack reachable (on this setup the relay to the UGREEN) and a one-time `npx playwright install chromium` (about 170 MB), and the CI job installs its own browser. `README.md`: the command, a row in the test-layer table (about L53-56) and the CI sentence at about L149 ("three jobs ... a ruleset requires all three") reworded to three required jobs plus a non-required `e2e` job. `CLAUDE.md` (one edit; `AGENTS.md` is a symlink to it): the command in its list (about L16) and the same CI sentence (about L67). `docs/prerequisites.md`: the job enumeration at about L112 and L116 likewise.

### Success Criteria:

#### Automated Verification:

- Formatting is clean on the workflow and docs: `npx prettier --check .github docs README.md context/foundation`
- Lint and unit tests pass: `npm run lint` and `npm test`
- The docs name the command: `grep -c "test:e2e" README.md CLAUDE.md docs/prerequisites.md context/foundation/test-stack.md` is at least 1 for each file

#### Manual Verification:

- After the pull request is open, the `e2e` job passes next to the three required checks: `gh pr checks`
- On a throwaway branch that is never merged, renaming a form field in `AlertRulesPanel.astro` makes the `e2e` job fail and upload the `playwright-report` artifact

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None added; the change adds no application logic. The existing suites must stay green.

### Integration Tests:

- None added. The browser test is the new layer; it runs against the real build and a real local Supabase.

### Manual Testing Steps:

1. Install Chromium once (`npx playwright install chromium`), start the Supabase relay, and run `npm run test:e2e`.
2. Run the alert-rules spec headed and watch it drive the page.
3. Rename a form field in the real markup, confirm the spec goes red, restore the file.
4. After the PR is open, confirm the `e2e` job is green; on a throwaway branch confirm a deliberate break fails it and uploads the report.

## Performance Considerations

The test server needs a production build before the first test (about a minute), which is why the `webServer` timeout is 180 s. The CI job adds roughly 2-3 minutes of runner time per PR (Supabase start, Chromium, build, three short tests) and runs in parallel with the other jobs.

## Migration Notes

None: no schema, no data and no production change. The new dev dependency only affects development and the CI `e2e` job.

## References

- Related research: none saved; planning used inline exploration of the UI surface and the test and CI infrastructure.
- Strategy and tools table: `context/foundation/test-plan.md` (§1 principles, §3 tools, §6.3, §8)
- Similar pattern: `tests/integration/support/stack.ts` and `privileged.ts` (local-only guard, user creation and cleanup), `scripts/smoke.mjs` (password user and sign-in), `.github/workflows/ci.yml:29-48` (the smoke job the new job mirrors)
- UI contract: `src/components/alerts/AlertRulesPanel.astro`, `AlertNotice.astro`, `src/pages/api/alert-rules.ts`, `src/lib/services/alert-rules.ts`
- Rules applied by hand: `~/code/CLAUDE.md` (E2E section)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Playwright setup and a green seed spec

#### Automated

- [x] 1.1 The seed spec passes against the local stack: `npm run test:e2e` — 00f2b14
- [x] 1.2 Lint, type checks and formatting pass: `npm run lint`, `npx astro check` and `npx prettier --check tests playwright.config.ts package.json` — 00f2b14
- [x] 1.3 The existing unit suite is unaffected: `npm test` — 00f2b14
- [x] 1.4 The teardown removed the test user: `node -e 'const {Client}=require("pg");(async()=>{const c=new Client({connectionString:process.env.SUPABASE_DB_URL??"postgresql://postgres:postgres@127.0.0.1:54322/postgres"});await c.connect();const r=await c.query("select count(*)::int as n from auth.users where email like $1",["e2e-%"]);console.log(r.rows[0].n);await c.end()})()'` prints 0 after the run — 00f2b14

#### Manual

- [x] 1.5 Open the report with `npx playwright show-report`: the two seed checks read as user actions (open the page, see the sign-in heading, see the alerts heading) — 00f2b14

### Phase 2: The alert-rules tests and the deliberate break

#### Automated

- [x] 2.1 The three alert-rules tests pass: `npm run test:e2e`
- [x] 2.2 They stay green when repeated: `npx playwright test --repeat-each=5`
- [x] 2.3 Lint and type checks pass: `npm run lint` and `npx astro check`
- [x] 2.4 The other suites still pass: `npm test` and `npm run test:integration`
- [x] 2.5 The forbidden patterns are absent from the specs: `grep -rnE "waitForTimeout|page\.locator\(|xpath" tests/e2e` prints nothing

#### Manual

- [x] 2.6 Run once headed with `npx playwright test --headed alert-rules`: the page is driven the way an owner would, and no test rule is left on `/dashboard/alerts` afterwards

### Phase 3: CI job and docs

#### Automated

- [ ] 3.1 Formatting is clean on the workflow and docs: `npx prettier --check .github docs README.md context/foundation`
- [ ] 3.2 Lint and unit tests pass: `npm run lint` and `npm test`
- [ ] 3.3 The docs name the command: `grep -c "test:e2e" README.md CLAUDE.md docs/prerequisites.md context/foundation/test-stack.md` is at least 1 for each file

#### Manual

- [ ] 3.4 After the pull request is open, the `e2e` job passes next to the three required checks: `gh pr checks`
- [ ] 3.5 On a throwaway branch that is never merged, renaming a form field in `AlertRulesPanel.astro` makes the `e2e` job fail and upload the `playwright-report` artifact
