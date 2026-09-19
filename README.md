# Energy Analyser

Astro 7 application for a single owner to review household energy data and recommendations. This first production release contains Supabase authentication and the deployment path only; Home Assistant, Deye, scheduling and LLM integrations are intentionally not implemented yet.

## Stack

- Astro 7 SSR with the standalone Node adapter
- React 19, TypeScript and Tailwind CSS 4
- Supabase Auth
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

| Variable            | Purpose                                                             | Default        |
| ------------------- | ------------------------------------------------------------------- | -------------- |
| `SUPABASE_URL`      | Supabase project URL                                                | unset          |
| `SUPABASE_ANON_KEY` | Public/anon Supabase key; service-role and secret keys are rejected | unset          |
| `ALLOW_SIGNUP`      | Enables the signup page and endpoint only when exactly `true`       | `false`        |
| `APP_VERSION`       | Release identifier returned by `/api/health`                        | `development`  |
| `APP_ORIGIN`        | Trusted public origin for CSRF checks on mutating API requests      | request origin |
| `HOST`              | Address used by the standalone Node server                          | `::`           |

For local auth testing, start Supabase with `npx supabase start`, copy its API URL and anon key to `.env`, and set `ALLOW_SIGNUP=true`. Public signup stays disabled in production; create the owner account manually in Supabase. In hosted Supabase, keep the email provider enabled for sign-in while setting the global `auth.enable_signup` option to `false`.

## Commands

- `npm run dev` — development server
- `npm run lint` — ESLint
- `npx astro check` — Astro and TypeScript checks
- `npm run build` — standalone Node production build
- `npm run preview` — local production preview
- `npm run smoke` — auth-flow smoke test against `BASE_URL`

The smoke test creates a user. Run it only against a disposable/local Supabase instance with `ALLOW_SIGNUP=true`, never against production.

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
```

The production service listens on the VPS's dedicated IPv6 address, port `20170`. Binding the specific IPv6 address avoids the IPv4 `rathole` listener that Micr.us uses on the same port. Micr.us terminates TLS and forwards `https://neil170-20170.mikrus.cloud` to that port.

## Health endpoint

`GET /api/health` returns only the application status, version and response time. It does not probe or reveal dependencies.

## Delivery

- `ci.yml` checks pushes and pull requests to `main`, including an auth smoke test using local Supabase.
- `publish-image.yml` publishes `ghcr.io/titusandronicu/energy-analyser:sha-<full-sha>` after successful push CI.
- `deploy-production.yml` accepts a full SHA, uses the protected `production` environment, deploys over SSH and rolls back when health verification fails.

Configure these GitHub environment secrets: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, and a pre-verified `SSH_KNOWN_HOSTS` entry. The deploy user must own `/opt/energy-analyser` and be allowed to use Docker. Keep production approval enabled on the `production` environment.

The reviewed rollout and infrastructure gates are recorded in [`context/deployment/deploy-plan.md`](context/deployment/deploy-plan.md).
The one-time bootstrap, GitHub setup, verification, and rollback commands are in [`context/deployment/micrus-runbook.md`](context/deployment/micrus-runbook.md).
