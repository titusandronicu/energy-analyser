---
name: local-supabase
description: Start or reach the local Supabase stack and run the tests that need it (smoke, integration, e2e). Load before running npm run smoke, test:integration or test:e2e, or when a sign-in or push fails locally.
---

# Local Supabase and the tests that need it

## When to use

- Running `npm run smoke`, `npm run test:integration` or `npm run test:e2e`.
- Sign-in, ingest or dashboard behaviour has to be checked against a real database.

`npm run lint`, `npm test`, `npx astro check` and `npm run build` need no Supabase.

## Steps

1. Find the stack. On the owner's machine it runs on the UGREEN through remote Docker with a relay on ports 54321 and 54322 (`scripts/remote-docker.sh relay-start` in dev-hub). Starting, resetting or migrating that stack needs the owner's explicit OK. In a Cursor VM or a cloud session, start the reduced stack with the exclusion list from `.github/actions/local-supabase/action.yml` (keep it identical).
2. Write the gitignored `.env` from `npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)='` only. Map `API_URL` to `SUPABASE_URL` and `ANON_KEY` to `SUPABASE_ANON_KEY`; add `ALLOW_SIGNUP=true` and `APP_ORIGIN=http://127.0.0.1:4321`. The unfiltered output holds secret keys that must never reach `.env`, logs or commits.
3. Run smoke first, then the integration suite. The suite's pushes are newer than smoke's, so smoke's dashboard steps fail within about a minute after it.
4. The integration and e2e suites overwrite the newest live, bill and recommendation rows and prune old rows. Run them only on a stack that receives no real lab pushes. Never run smoke against production.
5. e2e also needs Postgres on 54322, a free port 4321 and a one-time `npx playwright install chromium`.

## Check

- The suite refuses non-local URLs; if it names the relay, port 54322 is not reachable.
- Rules and recipes: `docs/prerequisites.md` ("Local Supabase stack") and `context/foundation/test-stack.md`.
