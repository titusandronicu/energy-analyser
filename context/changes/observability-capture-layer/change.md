---
change_id: observability-capture-layer
title: Capture layer with a structured logger, error boundary and auth outage 503
status: implementing
created: 2026-10-03
updated: 2026-10-05
archived_at: null
---

## Notes

Structured logger with request id, APP_VERSION and environment plus a middleware error boundary; a shared loader helper (throwQueryError) that keeps the Postgres code and cause; and reading the getUser error in the middleware with a 503 "sign-in unavailable" page on a provider outage.

From the observability audit `context/audits/observability/2026-10-03_1812-lab-push-sign-in-dashboard-reads.md`, fixes 1-3 of section 6 (closes S1, S8, S9, D2, D3, P3 and part of P1).

Owner decisions 2026-10-03: scope is the top three fixes only; an auth outage shows a 503 page, not a redirect; no new vendor (the logger is tracker-agnostic).
