# Review fixes (alert-rules implementation review, 2026-10-06)

Decided in `reviews/impl-review.md`. They need one new migration (never an edit of the applied `20261007090000_alert_rules.sql`), so a production database push before the app deploy, then a deploy.

- [x] F1 `alerts_record` only updates enabled rules; the evaluator records each rule right after its own send (not once at the end); document delivery as at-least-once in `docs/logic.md` and `docs/decisions.md`.
- [x] F2 `scripts/alerts-trigger.mjs` calls an optional `ALERTS_HEARTBEAT_URL` after every 2xx answer (never logged); document it in `docs/prerequisites.md`; the Uptime Kuma push monitor is a separate homelab-2 step.
- [x] F3 Correct the stale text: `AlertRulesPanel.astro:70` (every 5 minutes), `docs/architecture.md:108`, `docs/logic.md:245`, `src/pages/api/alerts/evaluate.ts:18`, `scripts/create-alert-token.mjs:15` (the production token for the VPS service is `alerts-vps` in `.env.alerts`), `scripts/smoke.mjs:493`.
- [x] F4 `alerts_snapshot` returns only `captured_at` and `received_at` for the live row (no `state`); adjust the service's snapshot schema and tests.
- [x] F5 Cap enabled rules per owner (20) in the migration; treat a Telegram 429 as "stop sending this run, retry next run".
- [x] F6 Per-rule try/catch in the evaluator: a thrown error becomes `unknown` with a fixed reason.
- [x] F7 `telegram.ts` cancels the response body.
- [x] F8 `alerts_snapshot` joins `app_owners`; correct the 22023 comment in the new migration.
