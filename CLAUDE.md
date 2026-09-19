# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Commands

- `npm run dev` — start the Astro development server
- `npm run build` — production build (standalone Node server via `@astrojs/node`)
- `npm run preview` — preview the production build locally
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server, `BASE_URL` env (default `http://localhost:4321`). It creates a user and therefore requires `ALLOW_SIGNUP=true`; never run it against production.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed as a Node.js 22 container.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_ANON_KEY`; secret/service-role keys are forbidden.
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`. Signup is available only when `ALLOW_SIGNUP=true`.
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

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
- Mutating `/api/*` requests are protected in `src/middleware.ts` by comparing the `Origin` header with `APP_ORIGIN` (or the request origin locally). Astro's built-in origin check is disabled because the Micr.us/Cloudflare proxy changes the internal request origin.
- Local Supabase: `npx supabase start` (requires Docker)
- Production: `HOST=2a01:4f9:6b:4f6b::170 PORT=20170 node ./dist/server/entry.mjs`; Compose loads runtime configuration and secrets from uncommitted `.env.runtime` and image/version from `release.env`. Bind the dedicated IPv6 address, not `::`, because Micr.us already listens on the IPv4 side of port `20170`.

## CI

GitHub Actions runs lint, type checks, build and a local-Supabase smoke test on pushes and pull requests to `main`. A successful push publishes an immutable GHCR image; production deployment is manual through the protected `production` environment.
