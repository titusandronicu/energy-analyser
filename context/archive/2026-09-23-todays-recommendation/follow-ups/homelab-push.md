# Brief: home-lab push to Energy Analyser (homelab-2 change)

This is a self-contained brief for the **separate homelab-2 change** that makes the S-03 north star real. It adds a push step to the lab's refresh job, so production `/dashboard` shows the lab's latest recommendation instead of the empty state. Follow homelab-2's `AGENTS.md` for anything that deploys or runs at home.

Contract and rules: `docs/ingest/README.md` (request, responses, retry, tokens) and `docs/ingest/contract-v1.schema.json` / `example-v1.json` in the energy-analyser repo.

## Where

At the end of `infra/compose/energy-app/scripts/refresh-energy-agent-data.sh`, after the briefing, history and the optional hourly advisory have been written. Add a new script (for example `scripts/push-energy-analyser.py`) that reads the lab's public-safe files and POSTs one v1 payload. A push failure must only log a warning; it must never fail the refresh.

## Payload mapping

| Contract field | Lab source |
| --- | --- |
| `contract_version`, `source` | `1`, `"homelab"` |
| `captured_at` | snapshot `generated_at` (ISO with offset); one push per snapshot, never reused |
| `state.pv_w`, `home_load_w`, `grid_w`, `battery_w`, `battery_soc_pct`, `pv_today_kwh`, `grid_import_today_kwh`, `grid_export_today_kwh` | briefing `current_state` (same names; grid positive = import, battery positive = discharge) |
| `state.source_health` | briefing `source.snapshot_health` |
| `recommendation` | only when `energy-agent-response.json` has `response_text` and `provider != "none"` |
| `recommendation.generated_at`, `model`, `language` | response `generated_at`, `model`, `language` (`"pl"`) |
| `recommendation.text` | response `response_text` (1–4000 chars; truncate defensively) |
| `recommendation.provider` | response `provider`, **mapped**: `home_assistant_conversation` → `ha_conversation`; `ollama`, `openrouter` unchanged |
| `recommendation.forecast` | briefing `current_state.forecast_today_kwh` / `forecast_tomorrow_kwh` as `today_kwh` / `tomorrow_kwh`; add `confidence` (`low`/`medium`/`high`) only when the lab computes one |
| `recommendation.facts` | `current_state`, `balance_today`, `local_findings`, `sanity_checks` from the briefing, **scalar values only** (numbers, strings ≤ 500 chars, booleans, null); drop nested objects and lists inside items; at most 50 findings/checks |
| `daily_history` | optional; per Europe/Warsaw calendar day totals (`pv_kwh`, `load_kwh`, `grid_import_kwh`, `grid_export_kwh`) for up to 62 recent days; needed later by S-04 |

Never include: `prompt`, `comparison_values`, `safety`, `raw_response`, `failures`, PGE rows, POD/customer ids, entity ids, hostnames, IPs or tokens. Every object is strict, so unknown keys get a 422.

## Token and endpoint

- Endpoint: `https://neil170-20170.mikrus.cloud/api/ingest`, `Authorization: Bearer <token>`.
- Token: the production `homelab` token already registered in `public.ingest_tokens` (only its hash is stored). Keep it in a `0600` env file next to the other lab secrets, never in either repo.
- Retry network errors and 5xx with the **same** payload; never retry 4xx. Log 4xx bodies (`path` names the bad field).

## Done when

- The refresh job pushes every cycle and gets `201` (or `200` on a retry).
- Production `/dashboard` shows the lab's latest Polish recommendation, and "Nieaktualna" disappears within one advisory cycle.
- Stopping the push for more than 2 hours shows "Nieaktualna" on the dashboard (the degrade-gracefully guardrail).

## Known gaps

- No forecast confidence yet; the dashboard shows "nieznana" until the lab adds it (FR-006).
- `daily_history` isn't produced as daily totals yet; it can come in a follow-up before S-04.
