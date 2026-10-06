# Sources: code

- repo_root: /Users/kamilnowosad/code/dev-hub/projects/energy-analyser
- code_scope: . (single application; one root package manifest)
- head: e334854 (dirty: untracked `.claude/launch.json` and `context/map/`; no tracked file is modified)
- path_alias: none

## Stack

- TypeScript (strict), Astro 7 server-rendered pages with React 19 islands, Tailwind 4, shadcn/ui primitives
- Supabase (Postgres, row-level security, SQL functions and views), `@supabase/ssr` cookie sessions
- Validation with zod; tests with Vitest (unit, colocated) and a Vitest integration suite against a local Supabase stack
- Node 22 container; GitHub Actions CI

## Layers

| layer             | path patterns                                                                                    | notes                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| entry points      | `src/pages/**` (pages, `api/**` endpoints, `auth/**`), `src/middleware.ts`                       | HTTP routes and the request middleware; no jobs, queues or CLI inside the scope                                          |
| application logic | `src/lib/services/*.ts`, `src/lib/calendar/*.ts`, `src/lib/*.ts`                                 | services and loaders; business rules live here and in the database                                                       |
| domain types      | `src/types.ts`, `src/lib/ingest/contract.ts`, `src/lib/format/*.ts`                              | there is no separate domain layer; types are shared DTOs and one payload contract in zod; format helpers hold some rules |
| persistence       | `supabase/migrations/*.sql`, `supabase/seed.sql`, `supabase/config.toml`, `supabase/templates/*` | tables, views, SQL functions, grants and row-level policies                                                              |
| UI                | `src/components/**` (`.astro`, `.tsx`), `src/layouts/**`, `src/styles/**`                        | Polish user-facing copy is inside components and helpers; no translation catalogue                                       |
| tests             | `src/**/*.test.ts` (colocated), `tests/integration/**`                                           | unit tests beside the code; integration suite pushes through the real handler and database                               |

## Excluded

| path                                                              | reason                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `context/domain/`, `context/archive/*-domain-distillation/`       | earlier distillations would feed back as evidence                                             |
| `context/map/`                                                    | an analysis artefact about the repository, not product code or a domain document              |
| `context/**` (other)                                              | planning documents; read by the docs agent only, not code                                     |
| `scripts/**`                                                      | developer tooling and fixtures (smoke run, token minting, payload fixtures), not product code |
| `.github/**`, `.husky/**`, `.claude/**`, `.ai/**`, `.vscode/**`   | CI, hooks, agent configuration and editor settings                                            |
| `public/**`, `package-lock.json`, `components.json`, config files | assets and tooling configuration                                                              |
| `docs/**`, `README.md`, `CLAUDE.md`, `AGENTS.md`                  | documents, not code; listed in the documents inventory                                        |
| generated code and vendored dependencies                          | none tracked in scope                                                                         |
