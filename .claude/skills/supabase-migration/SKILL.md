---
name: supabase-migration
description: Add or change a Supabase migration (table, policy, grant, SECURITY DEFINER function). Load when creating a file in supabase/migrations/ or touching RLS.
---

# Supabase migration

## When to use

- A new table, column, view, policy, grant or function.
- Any change to `ingest_push` or the alert functions.

## Steps

1. Name the file `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`, later than the newest existing one.
2. Enable RLS on every new table, with a separate policy per operation and per role. Reads are owner-only (`public.app_owners`); anon and non-owners read nothing.
3. Grant columns, not tables, to clients. Never expose `token_id` or `payload_hash`. Fields owned by the database or the evaluator get no client write grant.
4. Functions: `SECURITY DEFINER` only when anon must call them behind a token table; set `search_path = ''`, schema-qualify names, and `revoke all ... from public, anon, authenticated` before granting back what is needed.
5. Mirror any limit that the app also enforces (for example in `src/lib/services/`), and cover the drift in an integration test, as `alert_rules` does.
6. Only the anon key and the service-free local stack are used; never put a service-role key anywhere.
7. Record when it must be applied in production and in which order relative to the app deploy in `docs/prerequisites.md` ("One-time production steps"). Use `npx supabase db push --linked --dry-run` first.

## Check

- The migration applies cleanly on a local stack (`local-supabase`) and `npm run test:integration` passes, including the access tests.
- No table without RLS; no policy that covers more than one operation.
