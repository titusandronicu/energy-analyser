# Test Stack

> The tools, versions and configuration of the browser e2e layer, and the rules its specs follow. The strategy and the
> cookbook for adding a test are in `context/foundation/test-plan.md` (§2 risk #8, §6.3). Written by hand, because the
> `/10x-e2e-setup` skill is not installed in this project.
>
> Last updated: 2026-10-06

## Tools

| Tool               | Version                     | Used for                                                                                                          |
| ------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@playwright/test` | 1.63.0 (pinned)             | The browser runner, `request` fixture and web-first assertions; Chromium only (`npx playwright install chromium`) |
| `pg`               | the existing dev dependency | The teardown's one privileged statement (`delete from auth.users`), local hosts only                              |
| Local Supabase     | the CLI's local stack       | Auth and database the build talks to (same reduced stack as the `smoke` and `integration` jobs)                   |

Unit and integration tests stay on Vitest and never collect `tests/e2e/`. The e2e layer is not part of `npm test`.

## Layout

```
playwright.config.ts            config (below)
tests/e2e/support/env.ts        guards: stack env (local host, http:, anon key only) and DB url (local host only)
tests/e2e/auth.setup.ts         the `setup` project: a fresh owner, signed in, saved as storageState
tests/e2e/global.teardown.ts    deletes that user through pg after every project
tests/e2e/seed.spec.ts          the access gate and the signed-in page (2 tests)
tests/e2e/alert-rules.spec.ts   lifecycle, invalid and duplicate (3 tests)
tests/e2e/.auth/                gitignored: owner.json (storageState) and owner-email.txt
```

A run is 6 tests: 1 setup, 2 in the seed spec, 3 in the alert-rules spec.

## Configuration

All in `playwright.config.ts`.

- **Projects:** `setup` (`testMatch: /.*\.setup\.ts/`) and `chromium` (`devices["Desktop Chrome"]`, `storageState: "tests/e2e/.auth/owner.json"`, `dependencies: ["setup"]`). Chromium is the only browser.
- **Session:** `auth.setup.ts` signs a unique user (`e2e-<timestamp>-<random>@example.com`) up through Supabase's `POST /auth/v1/signup` (the seed trigger of the local stack makes every new user an owner), writes the email to `tests/e2e/.auth/owner-email.txt` before anything else can fail, then signs in through the app's own route, `POST /api/auth/signin` with an `Origin` header equal to the base URL, and saves the cookies as `tests/e2e/.auth/owner.json`. The sign-in form is not used: its two React islands share a label and would make every test depend on hydration timing.
- **Teardown:** `globalTeardown` deletes that user through `pg` (`SUPABASE_DB_URL`, default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, local hosts only); the user's alert rules go with it through the cascade.
- **webServer:** `npm run build && node ./dist/server/entry.mjs` on `127.0.0.1:4321`, ready when `/api/health` answers, `timeout: 180_000`, `reuseExistingServer: false` (a taken port fails loudly, so a leftover server can never serve a stale build), `APP_ORIGIN` equal to the base URL (the middleware refuses a mutating request whose `Origin` differs), `APP_VERSION=e2e`.
- **Run policy:** `retries: 0` (a retry would hide flakes), `trace: "retain-on-failure"`, reporter `list` locally and `list` plus an HTML report (`playwright-report/`, `open: "never"`) in CI.
- **Env:** Playwright does not load `.env`, so `SUPABASE_URL` and `SUPABASE_ANON_KEY` must be in the shell. The config refuses a missing value, a non-local host, a non-`http:` URL and any key that is not an anon key, and never skips.

## Running locally

On this setup the stack runs on the UGREEN.

1. Make the stack reachable: `scripts/remote-docker.sh relay-start` (dev-hub; the default relay ports 54321 and 54322 are what is needed). Changing the stack needs the owner's explicit OK.
2. Once per machine: `npx playwright install chromium` (about 170 MB).
3. Take only the two values the run needs: `scripts/remote-docker.sh exec npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)='` (the unfiltered output also carries secret keys, which must not reach logs, `.env` or commits). Export `API_URL` as `SUPABASE_URL` and `ANON_KEY` as `SUPABASE_ANON_KEY`.
4. `npm run test:e2e`. After the first build a run takes about 10 seconds. Single spec: `npx playwright test alert-rules`; repeated: `npx playwright test --repeat-each=5`; watched: `--headed`; report: `npx playwright show-report`.

The run creates one user and a few rules and removes them. It does not reset the database and does not touch the live, bill or recommendation rows, but run it only on a stack you are free to write to.

## Running in CI

The `e2e` job of `.github/workflows/ci.yml` runs next to `ci`, `smoke` and `integration` with no `needs:`. It installs Chromium with `npx playwright install --with-deps chromium`, starts the same reduced local Supabase through `.github/actions/local-supabase`, sources `supabase.env` and runs `npm run test:e2e` (the webServer builds and starts the app). On failure it uploads `playwright-report/` and `test-results/` as the `playwright-report` artifact, and it always stops the stack. The job is not a required check: the ruleset requires only `ci`, `smoke` and `integration`. Promoting it is a later ruleset edit, after several green pull requests.

## Rules for the specs

From `~/code/CLAUDE.md`:

- **Locators:** `getByRole`, `getByLabel`, `getByText` first; `getByTestId` only when accessibility attributes are ambiguous. Never CSS selectors, XPath or DOM structure.
- **No timers:** never `page.waitForTimeout()`. Wait for state: `toBeVisible()`, `toHaveURL()`, `waitForURL()`, `waitForResponse()`.
- **Independence and cleanup:** each test runs alone with its own setup, action, assertion and cleanup. Ids are unique (timestamp plus random suffix) so parallel runs and re-runs do not collide.
- **A red test is a signal:** a changed selector means updating the locator in a reviewed diff; a changed business behaviour means the test caught a bug, and the assertion is never edited to match it.

Check with: `grep -rnE "waitForTimeout|page\.locator\(|xpath" tests/e2e` (prints nothing).

## The five review questions

Asked of every spec before it is accepted:

1. Does every locator use role, label or text, never CSS, XPath or DOM structure?
2. Does every wait use a state (URL, visibility), never a timer?
3. Does the test own its data (unique ids, its own cleanup) and run alone?
4. Does it assert what the user sees, with literals typed in the spec, not values read from the app?
5. Does a deliberate break turn it red?

The deliberate break that proves the alert-rules spec: in a worktree, rename `name="threshold"` of the create form in `src/components/alerts/AlertRulesPanel.astro`, run `npm run test:e2e` and see the lifecycle and duplicate tests go red (the route then answers `alert=invalid`). The invalid test stays green on purpose: it guards the refusal message, not the field names. Restore the file with `git checkout --`; the break is never committed.
