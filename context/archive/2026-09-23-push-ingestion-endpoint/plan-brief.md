# Push Ingestion Endpoint — Plan Brief

> Full plan: `context/changes/push-ingestion-endpoint/plan.md`

## What & Why

Add `POST /api/ingest`, the single door through which the home lab pushes public-safe data (live state, today's narrated recommendation, daily energy history) into Energy Analyser. This is roadmap foundation F-01: the north star (S-03, today's recommendation) and two other slices cannot show real data until it exists.

## Starting Point

The app has auth and a health route but no database schema. The middleware's Origin check rejects any non-browser POST to `/api/*`. The repo forbids service-role keys. The home lab already builds the bundle every 5 minutes (homelab-2 `build-energy-agent-briefing.py`), and it just needs somewhere to send it.

## Desired End State

The home lab (or a fixture script) pushes a v1 payload with a bearer token and gets clear answers: 201 new, 200 duplicate, 409 conflict, 401 bad token, 413/400/422 bad input. Data lands in four RLS-locked tables. homelab-2 has a committed JSON Schema, an example and a README to build its push step against. There are no new env vars or app secrets.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Contract scope | Envelope + state, recommendation and daily-history sections now | homelab-2 makes one push change instead of three, and real data flows before S-02/S-03 start. |
| Write path | Anon key → `SECURITY DEFINER` `ingest_push` that checks token hashes | No service-role key, no app secret, rotation is a DB row change, anon can do nothing else. |
| Duplicates | Identical re-send → 200; same time, different content → 409 | Retries are safe and lab bugs surface loudly instead of silently rewriting history. |
| Retention | Raw pushes 14 days, pruned on insert; daily energy and recommendations kept | Bounded storage without a scheduler. |
| Contract home | zod in this repo → exported JSON Schema + example, drift-tested | The receiver defines what it accepts, with one generated artifact for homelab-2. |
| Testing | Vitest for contract/service + smoke against local Supabase in CI | The SQL function, hashing and RLS are proven against a real DB on every PR. |
| Size cap | 256 KB on bytes read | Far above a normal push, bounded against misuse. |
| Time window | `captured_at` ≤ 5 min in the future and ≤ 14 days old | Catches lab clock bugs and avoids storing rows that would be pruned immediately. |

## Scope

**In scope:** v1 zod contract + JSON Schema export; Vitest; first migration (4 tables, RLS, `ingest_push`); local seed token; token-creation script; `/api/ingest` route + service; Origin-check exemption for that exact path; smoke cases; fixture push script; contract README; `npm test` in CI.

**Out of scope:** any UI or read policies (S-02–S-04); baseline/anomaly logic; homelab-2 changes; rate limiting; forecast-confidence modelling; token admin UI.

## Architecture / Approach

```text
home lab refresh job ──HTTPS, Bearer──► POST /api/ingest
                                         │ size cap → JSON → zod (strict v1)
                                         ▼
                              anon Supabase client .rpc("ingest_push", token, payload)
                                         │ (SECURITY DEFINER, one transaction)
                                         ▼
     token hash check → duplicate/conflict → ingest_pushes → daily_energy upsert
                     → recommendations insert-if-new → prune pushes > 14 days
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Contract and test tooling | zod v1 contract, JSON Schema + example, Vitest | Contract too strict for the lab's real bundle |
| 2. Database schema and ingest function | Migration, `ingest_push`, seed token, token script | `SECURITY DEFINER` search_path and grants done wrong |
| 3. Ingest endpoint and middleware exemption | `/api/ingest`, status mapping, Origin exemption | Exemption accidentally widening beyond the one path |
| 4. End-to-end verification and handoff | CI smoke cases, fixture push, homelab-2 README | Local Docker/Supabase setup friction in CI |

**Prerequisites:** local Supabase via the UGREEN Docker context (`scripts/remote-docker.sh`); access to the production Supabase SQL editor for the first token.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- Assumes the lab can produce per-day totals (Europe/Warsaw dates) for `daily_history`; its hourly aggregates suggest it can, but that work belongs to homelab-2.
- The lab bundle has no explicit forecast confidence; it's optional in v1, and S-03 decides how to present its absence.
- `jsonb` canonical hashing is assumed stable across Postgres minor versions (true for identical major versions; only affects duplicate-vs-conflict after an upgrade).

## Success Criteria (Summary)

- A fixture push to production returns 201, then 200 on re-send, and the data is visible in Supabase.
- CI proves auth, idempotency, conflict, size and schema rejections, and locked-down tables against a real database.
- homelab-2 can build its push step from `docs/ingest/` alone.
