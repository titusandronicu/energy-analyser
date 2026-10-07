# Energy Analyser

A web app for the owner of a home solar system (PV panels, a battery, the grid, a Deye inverter, a PGE G11 tariff). It answers two everyday questions in plain Polish: _what should the battery do today?_ and _was recent usage normal?_ The home lab collects the data and runs the advisory logic; this app signs the owner in, stores what the lab pushes, applies its own season-aware rules and presents the result. It never controls any device.

## What it does

- **Sign in** with an emailed one-time link or email and password. One owner account; there is no sign-up form.
- **Live state** (PV, battery, grid, home load) with a staleness warning when the lab stops pushing.
- **Today's recommendation**, narrated by an LLM from verified facts, with the PV forecast and the lab's findings.
- **Usage insight:** yesterday's use against a season-adjusted baseline.
- **Bill forecast** for the current month as a range, with the data it is based on.
- **History calendar** (day, month and quarter views): production against forecast, advice, plain-language summaries of days and months, and good / neutral / bad ratings for completed days and months.
- **Day notes:** add, view, edit and delete a note on any calendar day.
- **Alert rules:** keep rules on `/dashboard/alerts` (lab data older than N minutes, projected bill above X PLN) and get a Telegram message when one fires, again as a reminder, and when it clears.

Still to come (see [the roadmap](context/foundation/roadmap.md)): a year view, consumption trends, forecast accuracy and a usage profile.

## How it works

| Document                                                                                                  | What it covers                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                                                              | Data flow from Home Assistant through the home lab to the app, the security model, the two LLMs                 |
| [docs/logic.md](docs/logic.md)                                                                            | The rules and thresholds: staleness, the seasonal baseline, daily totals, planned ratings and trends            |
| [docs/decisions.md](docs/decisions.md)                                                                    | Dated product and technical decisions with the reason for each                                                  |
| [docs/prerequisites.md](docs/prerequisites.md)                                                            | Everything outside this repo: Home Assistant integrations, lab jobs, LLM configuration, secrets, one-time steps |
| [docs/ingest/README.md](docs/ingest/README.md)                                                            | The push contract the home lab follows                                                                          |
| [context/foundation/prd-v3.md](context/foundation/prd-v3.md), [roadmap.md](context/foundation/roadmap.md) | Product requirements and the ordered work                                                                       |

Beyond `docs/`, the [`context/`](context/) folder holds the working record of the project: `foundation/` (PRD, roadmap, test plan, lessons), `changes/` (work in flight) and `archive/` (finished changes, each with its research, plan and reviews), `map/` (the repo map), `domain/` (domain notes and glossary), `audits/`, `deployment/` (rollout plan and runbook), and the certification files described below.

## Access model

The app has one owner. Signing in is not enough to see data: the owner's user id must be in `public.app_owners`, and every data table and view is closed to `anon` and `authenticated` by default and opened again only by an owner policy and column grants (a user can read only their own `app_owners` row). A signed-in user who is not an owner reads nothing and writes nothing. This is proven against a real non-owner and an anonymous client in [`tests/integration/access-abuse.test.ts`](tests/integration/access-abuse.test.ts), and the request guard (the `Origin` check on mutating routes and the bearer-token exemption for the lab's push) is pinned in [`src/middleware.test.ts`](src/middleware.test.ts). Details are in [docs/architecture.md](docs/architecture.md).

## How it maps to the 10xBuilder requirements

This project was built with the 10xDevs workflow: shape, PRD, roadmap, then per change research, plan, implement, review and archive, with every change kept under [`context/`](context/).

| Requirement              | Where it lives                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access control           | Sign-in in `src/pages/auth/` and `src/middleware.ts`; owner-only reads through row-level security and `app_owners` (see Access model)                                                                                                               |
| CRUD                     | Day notes: `src/pages/api/notes.ts`, `src/lib/services/day-notes.ts`, `supabase/migrations/20261001072438_day_notes.sql`. The calendar shows a note, and the owner creates, edits and deletes it                                                    |
| Business logic           | Staleness rules, the seasonal baseline, the bill forecast and period ratings in `src/lib/services/`, written down in [docs/logic.md](docs/logic.md)                                                                                                 |
| Context documents        | [`context/foundation/`](context/foundation/): `prd-v3.md`, `roadmap.md`, `tech-stack.md`, `infrastructure.md`, `test-plan.md`, `lessons.md`; one folder per change in `context/changes/` and `context/archive/` with its research, plan and reviews |
| Tests for a defined risk | [`context/foundation/test-plan.md`](context/foundation/test-plan.md) ranks eight risks; see Testing below                                                                                                                                           |
| Public URL               | https://neil170-20170.mikrus.cloud                                                                                                                                                                                                                  |

## Badges and certification

The course awards the 10xBuilder certificate and two extra badges, 10xArchitect and 10xChampion. This repository carries the evidence for all three (Builder is not scored yet). What is still open is tracked in [`context/certification-todo.md`](context/certification-todo.md) (status as of 2026-10-07).

| Badge                 | What it asks for, as recorded here                                                                                                                                                                                                                                                                                   | Evidence in this repo                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 10xBuilder (M1-3)     | A full-stack MVP deployed to the cloud with access control, CRUD, business logic, context documents and tests for a defined risk; a public URL is welcome. The official text and a proof for each requirement are in [`context/foundation/certification-criteria.md`](context/foundation/certification-criteria.md). | The table above, [`certification-criteria.md`](context/foundation/certification-criteria.md), the public URL |
| 10xArchitect (M4)     | A report of about two pages built on four artifacts: a repo map (L2), a feature research (L3), a refactoring plan with its evidence (L4) and domain notes (L5).                                                                                                                                                      | [`context/architect-report.md`](context/architect-report.md) and the artifacts it lists                      |
| 10xChampion (M5 L2-3) | Proof of a code-review pipeline in CI: a pipeline view with a visible job, the job's logs during a review, and the agent's review comment on a pull request.                                                                                                                                                         | [`context/champion-evidence.md`](context/champion-evidence.md), `.github/workflows/code-review.yml`, PR #120 |

Rules, as recorded in the to-do: one attempt, one submission window, everything in one round. Whoever wants Architect or Champion sends the Builder form and the extra-badges form in the same window. The windows are 2026-11-04 (the chance of a distinction), 2026-12-06 and 2027-01-10 (final). The badges form is <https://baserow.io/form/Nht4zggvrLgHUE1__yPugj6gLbob449ETNTe9kehLA8>; the Builder form link is not recorded yet.

Still open: choosing the window and the badges, recording the Builder form link once the course shares it, three Champion screenshots (taken by hand, not stored in the repo), defending each Architect artifact, and re-running the repo map near submission because it is tied to a commit.

## Testing

The risks are ranked in [`context/foundation/test-plan.md`](context/foundation/test-plan.md) (stale data shown as current, wrong money figures, a broken push-to-page path, silent history loss, day and month boundaries, a non-owner getting in, markup in lab text or notes, and a page's forms drifting from the route that parses them). Each layer is the cheapest one that proves its risk:

| Layer                          | Where                                                | Run                             |
| ------------------------------ | ---------------------------------------------------- | ------------------------------- |
| Unit and contract tests        | `src/**/*.test.ts`, including the request guard      | `npm test`                      |
| Integration, real Postgres     | `tests/integration/`                                 | `npm run test:integration`      |
| End to end over HTTP           | `scripts/smoke.mjs` against a built server           | `npm run smoke`                 |
| End to end in a browser        | `tests/e2e/`, Playwright (Chromium), alert rules     | `npm run test:e2e`              |
| Mutation testing (report only) | Stryker on the pure logic in `src/lib`, weekly in CI | the `Mutation testing` workflow |

The integration and browser suites share one guard, [`tests/support/local-guards.ts`](tests/support/local-guards.ts): they refuse a non-local Supabase URL, a database URL that can be redirected, and any key that is not an anon key. A table test runs the same cases against every caller.

Differences between layers that were found and deliberately not fixed are pinned by tests whose names start with `KNOWN GAP`, so a later fix flips them knowingly (see [docs/decisions.md](docs/decisions.md)).

## Stack

- Astro 7 SSR with the standalone Node adapter
- React 19, TypeScript and Tailwind CSS 4
- Supabase Postgres (row-level security) and Auth
- Node.js 22 and Docker Compose
- GitHub Actions, GHCR and Micr.us

## Local development

Use Node.js 22.14.0 (see `.nvmrc`).

```bash
npm install
cp .env.example .env
npm run dev
```

Configuration:

| Variable             | Purpose                                                                                                                                                             | Default        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `SUPABASE_URL`       | Supabase project URL                                                                                                                                                | unset          |
| `SUPABASE_ANON_KEY`  | The Supabase key the app uses: an `sb_publishable_` key or an anon JWT only. A secret or service-role key, or any other shape, is rejected when a client is created | unset          |
| `ALLOW_SIGNUP`       | When exactly `true`, a sign-in link request may create a new user                                                                                                   | `false`        |
| `APP_VERSION`        | Release identifier returned by `/api/health`                                                                                                                        | `development`  |
| `APP_ORIGIN`         | Trusted public origin for CSRF checks on mutating API requests                                                                                                      | request origin |
| `APP_ENV`            | Environment name written on every log line (`production` in compose)                                                                                                | `development`  |
| `TELEGRAM_BOT_TOKEN` | Bot token for alert messages (the lab's bot, shared; secret). Without it and the chat id, `POST /api/alerts/evaluate` answers 503                                   | unset          |
| `TELEGRAM_CHAT_ID`   | Telegram chat the alert messages go to (secret)                                                                                                                     | unset          |
| `HOST`               | Address used by the standalone Node server                                                                                                                          | `::`           |

Sign-in on `/auth/signin` offers an emailed one-time link (`POST /api/auth/magic-link` → email → `/auth/confirm`) or email + password (`POST /api/auth/signin`) for existing accounts; there is no sign-up form. The email template lives in `supabase/templates/magic-link.html`; production must use the same template for "Magic link" and "Confirm signup" (Supabase → Authentication → Emails), or links won't work. For local testing, start Supabase with `npx supabase start` (emails land in Mailpit on port 54324), copy its API URL and anon key to `.env`, and set `ALLOW_SIGNUP=true` so new addresses can sign in. Production keeps `ALLOW_SIGNUP=false` and the global `auth.enable_signup` option off, so only the existing owner account gets a link.

## Commands

- `npm run dev` — development server
- `npm run lint` — ESLint (`npm run lint:fix` fixes what it can; `npm run format` runs Prettier)
- `npx astro check` — Astro and TypeScript checks
- `npm run build` — standalone Node production build
- `npm run preview` — local production preview
- `npm test` — Vitest unit tests
- `npm run contract:export` — regenerates `docs/ingest/contract-v1.schema.json` from the zod contract; `npm test` fails if the committed schema drifts
- `npm run mutate` — Stryker mutation testing of the pure logic in `src/lib` (report only; weekly in CI)
- `npm run smoke` — smoke test of sign-in and push ingestion against `BASE_URL`
- `npm run test:e2e` — browser tests (Playwright, Chromium) of the alert-rules page against a local Supabase and a production build the run starts itself; needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` (anon key only), a one-time `npx playwright install chromium`, and the stack's Postgres on port 54322 for its teardown; refuses non-local URLs; not part of `npm test` (`context/foundation/test-stack.md`)
- `npm run test:integration` — integration tests of push ingestion, owner-only access and notes limits against a local Supabase (`SUPABASE_URL` and `SUPABASE_ANON_KEY`; the access tests also use the stack's Postgres on port 54322, optionally `SUPABASE_DB_URL`; refuses non-local URLs; not part of `npm test`)

The smoke test creates a user and reads its sign-in email from Mailpit. Run it only against a disposable/local Supabase instance with `ALLOW_SIGNUP=true`, never against production.

## Container

Build and run locally:

```bash
docker build -t energy-analyser:local .
docker run --rm --read-only --tmpfs /tmp \
  -p 20170:20170 \
  -e HOST=:: -e PORT=20170 \
  -e APP_VERSION=local \
  -e ALLOW_SIGNUP=false \
  -e SUPABASE_URL=https://example.supabase.co \
  -e SUPABASE_ANON_KEY=your-anon-key \
  energy-analyser:local
```

Production Compose reads the immutable image and version from `release.env`:

```dotenv
IMAGE=ghcr.io/titusandronicu/energy-analyser:sha-<full-commit-sha>
APP_VERSION=<full-commit-sha>
```

Runtime secrets belong in `/opt/energy-analyser/.env.runtime` with mode `600`:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
ALLOW_SIGNUP=false
APP_ORIGIN=https://neil170-20170.mikrus.cloud
HOST=2a01:4f9:6b:4f6b::170
TELEGRAM_BOT_TOKEN=<copied from the lab bot, see docs/prerequisites.md>
TELEGRAM_CHAT_ID=<chat id>
```

The production service listens on the VPS's dedicated IPv6 address, port `20170`. Binding the specific IPv6 address avoids the IPv4 `rathole` listener that Micr.us uses on the same port. Micr.us terminates TLS and forwards `https://neil170-20170.mikrus.cloud` to that port.

## Health endpoint

`GET /api/health` returns only the application status, version and response time. It does not probe or reveal dependencies.

## Delivery

- `ci.yml` runs on pushes and pull requests to `main`: the `ci` job (lint, unit tests, type checks, build), the `smoke` job (a local Supabase, then the smoke test) and the `integration` job (a local Supabase, then the integration tests). A ruleset requires these three on `main`, so a red or missing check blocks the merge. A fourth job, `e2e` (a local Supabase, then the browser tests), runs on the same events but is not a required check.
- `publish-image.yml` publishes `ghcr.io/titusandronicu/energy-analyser:sha-<full-sha>` after successful push CI.
- `deploy-production.yml` accepts a full SHA, uses the protected `production` environment, deploys over SSH and rolls back when health verification fails.
- `code-review.yml` reviews a pull request's diff with Claude Code when the `claude-code-review` label is added, and posts the review as a comment; `code-review-fix.yml` applies the fixes from that review when the `claude-code-support` label is added. Both are driven by the prompts in `.ai/prompts/`. Add the label **before** the pull request is merged, or there is no diff to review.
- The `alerts-trigger` service in `compose.yaml` (`scripts/alerts-trigger.mjs`, same image as the app) calls `POST /api/alerts/evaluate` every 5 minutes on the production host, with its own token and the app's local address from `/opt/energy-analyser/.env.alerts` ([docs/prerequisites.md](docs/prerequisites.md)). `alerts-evaluate.yml` runs the evaluator once by hand (`workflow_dispatch`, repository secret `ALERTS_TOKEN`, variable `ALERTS_BASE_URL`); a failed call shows red in Actions.
- `mutation.yml` runs Stryker weekly and on demand. It reports and never gates a merge or a release.

Configure these GitHub environment secrets: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, and a pre-verified `SSH_KNOWN_HOSTS` entry. The deploy user must own `/opt/energy-analyser` and be allowed to use Docker. Keep production approval enabled on the `production` environment.

The reviewed rollout and infrastructure gates are recorded in [`context/deployment/deploy-plan.md`](context/deployment/deploy-plan.md).
The one-time bootstrap, GitHub setup, verification, and rollback commands are in [`context/deployment/micrus-runbook.md`](context/deployment/micrus-runbook.md).
