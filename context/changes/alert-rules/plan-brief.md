# Alert Rules with Telegram Notifications — Plan Brief

> Full plan: `context/changes/alert-rules/plan.md`

## What & Why

The owner manages alert rules in the app and gets a Telegram message when one fires. First slice: `live_stale` (lab data older than N minutes) and `bill_above` (projected bill above X PLN). It adds a second owner-facing CRUD entity and covers a gap Uptime Kuma leaves: the lab keeps pushing but its data is stale or degraded.

## Starting Point

The app has no alerting; Uptime Kuma already alerts on lab push silence from the lab side. Staleness and the bill figure are computed in TypeScript (`live-state.ts`, `bill-forecast.ts`), `day_notes` is the CRUD template, and `/api/ingest` is the bearer-token route pattern. `ingest_tokens` has no scope.

## Desired End State

`/dashboard/alerts` lists, creates, edits, toggles and deletes rules and shows each rule's state and any "cannot evaluate" reason. Every ~10 minutes a GitHub Actions cron calls `POST /api/alerts/evaluate`; the app sends one Telegram message on ok→alarm, a reminder every N hours (default 6) while it lasts, and one on recovery. A rule that cannot be evaluated sends nothing and keeps its state.

## Key Decisions Made

| Decision                 | Choice                                                                                                                                             | Why (1 sentence)                                                             | Source |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| Who sends                | The app, with a Telegram token in `.env.runtime`                                                                                                   | Self-contained and works when the lab is down                                | Plan   |
| Scheduler                | GitHub Actions cron, every 10 minutes                                                                                                              | Independent of the lab and the VPS, lives in the repo                        | Plan   |
| Rule kinds               | `live_stale` and `bill_above`                                                                                                                      | Matches the requested slice and existing thresholds                          | Plan   |
| De-duplication           | Message on transition, reminder every N h, message on recovery                                                                                     | Less noise and the end of an incident is visible                             | Plan   |
| Token                    | Separate `alert_tokens` table and functions                                                                                                        | Leaves the ingest path untouched and a leaked cron token cannot forge pushes | Plan   |
| UI                       | Page `/dashboard/alerts`, no client JS                                                                                                             | Follows the `day_notes` pattern                                              | Plan   |
| Cannot evaluate          | Skip and keep state; show the reason                                                                                                               | No false alarm and no false "ok"                                             | Plan   |
| e2e                      | Separate follow-up change                                                                                                                          | Keeps this change focused; Playwright setup has its own workflow             | Plan   |
| Defaults (not asked)     | Dedicated bot; reminder 1-72 h; `live_stale` 15-1440 min; unique (kind, threshold); strict `>`; no push on record is an alarm; send then record    | Safe, consistent with existing code                                          | Plan   |
| Plan review (2026-10-06) | Snapshot reads `ingest_pushes` directly; `ALERTS_ENABLED` gates the cron; state resets on enable/threshold change; own tokens in integration tests | Fixes from the 10 review findings                                            | Review |

## Scope

**In scope:** `alert_rules` + `alert_tokens` migration and two `SECURITY DEFINER` functions, rules CRUD page, evaluator, Telegram sender, evaluate route, scheduled workflow, tests, docs and production steps.

**Out of scope:** Playwright e2e, email, other rule kinds, homelab-2 changes, React UI, alert history, multi-owner, pg_cron.

## Architecture / Approach

Cron → `POST /api/alerts/evaluate` (bearer alerts token, in `TOKEN_AUTH_ROUTES`) → `alerts_snapshot` (rules, newest live row, newest forecast row) → TypeScript evaluator reusing the existing view mappers → Telegram `sendMessage` → `alerts_record` writes back state only for what was actually sent. The owner edits rules through the cookie-authenticated `/api/alert-rules` route under RLS.

## Phases at a Glance

| Phase                     | What it delivers                                              | Key risk                                                 |
| ------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Data layer and token   | Migration, functions, seed and mint script, integration tests | Hardening of the anon-callable functions                 |
| 2. Owner CRUD             | Service, route, `/dashboard/alerts`, guards                   | Rows have no natural key, so `id` becomes readable       |
| 3. Evaluator and Telegram | Pure evaluator, sender, evaluate route, smoke                 | Duplicate or lost messages around failed sends           |
| 4. Scheduling and docs    | Workflow (gated by `ALERTS_ENABLED`), docs, production steps  | Mikrus may not reach Telegram; manual steps and ordering |

**Prerequisites:** a local Supabase on the UGREEN (`scripts/remote-docker.sh`), a Telegram bot from BotFather, access to the VPS `.env.runtime` and the GitHub repository secrets.
**Estimated effort:** about 4-6 sessions across 4 phases.

## Open Risks & Assumptions

- Mikrus egress to `api.telegram.org` is undocumented; checked in step 4.4 before the schedule matters.
- pg_cron is not used, so there is no dependency on its availability.
- GitHub cron can be delayed by several minutes and the workflow's secrets are repository-scoped, unlike the existing environment-scoped ones.
- The forecast view variant has no numeric figure today; Phase 3 adds `centralPln` after the existing guards, and a forecast flagged `isOtherMonth` is treated as "cannot evaluate".
- Single-owner assumption: one chat id, all enabled rules evaluated for it.

## Success Criteria (Summary)

- The owner can create, edit, disable and delete both kinds of rule and sees their state.
- A scheduled run sends exactly one alarm, reminders at the chosen interval and one recovery message, and never an alarm for a forecast that cannot be evaluated.
- Anon and non-owner clients read and write nothing; a leaked alerts token cannot push data and an ingest token cannot evaluate.
