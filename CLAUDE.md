# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Commands

- `npm run dev` — start the Astro development server
- `npm run build` — production build (standalone Node server via `@astrojs/node`)
- `npm run preview` — preview the production build locally
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm test` — Vitest unit tests (`src/**/*.test.ts`)
- `npm run contract:export` — regenerate `docs/ingest/contract-v1.schema.json` from the zod contract; `npm test` fails if the committed schema drifts
- `npm run smoke` — dependency-free smoke test (`scripts/smoke.mjs`) of the auth flow and push ingestion against a running server, `BASE_URL` env (default `http://localhost:4321`). It creates a user and uses the local seed ingest token, so it requires `ALLOW_SIGNUP=true` and local Supabase; never run it against production. `SUPABASE_URL` + `SUPABASE_ANON_KEY` enable its direct-table access check.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed as a Node.js 22 container.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_ANON_KEY`; secret/service-role keys are forbidden.
- `src/middleware.ts` — runs on every request, resolves the current user (which also refreshes the session), attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- Sign-in has two paths, and there is no sign-up form: (1) email + password, `POST src/pages/api/auth/signin.ts` (`src/lib/services/password-signin.ts`), existing accounts only; (2) an emailed one-time link: `src/pages/auth/signin.astro` → `POST src/pages/api/auth/magic-link.ts` → email (`supabase/templates/magic-link.html`, token-hash link that works on any device) → `GET src/pages/auth/confirm.ts` → `/dashboard`. Logic and tests: `src/lib/services/magic-link.ts`. The request always ends on `/auth/check-email` so account existence is never revealed. `/auth/confirm` also accepts `?code=` (Supabase's default template, same browser only), and `/` forwards `?code=`/`?token_hash=` there.
- `ALLOW_SIGNUP=true` (local/CI only) lets a link request create a new user; production is `false`. Sign-out: `src/pages/api/auth/signout.ts`.
- The production email templates ("Magic link" and "Confirm signup") must match `supabase/templates/magic-link.html`; they are set by hand in the Supabase dashboard.
- Protected page example: `src/pages/dashboard.astro`

### Push ingestion

- The home lab pushes data to `POST /api/ingest` (`src/pages/api/ingest.ts` → `src/lib/services/ingest.ts`), authenticated with a bearer token. The payload contract is `src/lib/ingest/contract.ts`; the handoff for the home lab is `docs/ingest/README.md`.
- Writes go through the `public.ingest_push` `SECURITY DEFINER` function (anon role, token checked against SHA-256 hashes in `ingest_tokens`). Reads are owner-only: users in `public.app_owners` may read `recommendations` and, through column grants, `ingest_pushes` (`source`, `captured_at`, `received_at`, `payload`; never `token_id` or `payload_hash`). The dashboard reads the newest snapshot through the `security_invoker` view `public.live_state`, but owners can also read the retained raw payloads from the table directly. Anon and non-owners read nothing.
- External prerequisites (Home Assistant integrations, lab jobs, LLM configuration, secrets, one-time production steps) are listed in `docs/prerequisites.md`; a change that adds or alters one updates that file in the same PR.
- Tokens: `scripts/create-ingest-token.mjs` mints one and prints only its hash `insert`; `scripts/push-fixture.mjs` verifies an environment (state only by default). `supabase/seed.sql` holds a public local/CI-only token.

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOW_SIGNUP`, `APP_VERSION`, `APP_ORIGIN` (copy `.env.example` to `.env` locally)
- Mutating `/api/*` requests are protected in `src/middleware.ts` by comparing the `Origin` header with `APP_ORIGIN` (or the request origin locally). Astro's built-in origin check is disabled because the Micr.us/Cloudflare proxy changes the internal request origin. Exception: exact paths in `TOKEN_AUTH_ROUTES` (currently `/api/ingest`) skip the Origin check and session lookup because they are bearer-token authenticated and never use cookies; don't add cookie-authenticated routes there.
- Local Supabase: `npx supabase start` (requires Docker)
- Production: `HOST=2a01:4f9:6b:4f6b::170 PORT=20170 node ./dist/server/entry.mjs`; Compose loads runtime configuration and secrets from uncommitted `.env.runtime` and image/version from `release.env`. Bind the dedicated IPv6 address, not `::`, because Micr.us already listens on the IPv4 side of port `20170`.

## CI

GitHub Actions runs lint, unit tests, type checks, build and a local-Supabase smoke test on pushes and pull requests to `main`. A successful push publishes an immutable GHCR image; production deployment is manual through the protected `production` environment.
