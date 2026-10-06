# Push ingestion contract (v1)

The home lab pushes public-safe energy data to Energy Analyser. The app never connects into the home network; this endpoint is the only way data gets in.

- Schema: [contract-v1.schema.json](contract-v1.schema.json) (JSON Schema 2020-12, generated from `src/lib/ingest/contract.ts`)
- Example: [example-v1.json](example-v1.json)

## Request

```http
POST /api/ingest
Authorization: Bearer <ingest token>
Content-Type: application/json
```

- Body: one v1 payload, at most 256 KB.
- Cadence: one push per refresh (the lab's refresh job runs every 5 minutes).
- `captured_at`: the lab's snapshot time, ISO 8601 with offset. It must be at most 5 minutes in the future and at most 14 days old. It is the push's identity: one push per `captured_at`.
- `state` is required. Include `recommendation` when there is a narrated recommendation, and `daily_history` with recent days (at most 62, one entry per Europe/Warsaw calendar day). Sending the same recommendation or day again is fine.
- `bill_forecast` (optional) is the current-month bill forecast, sent exactly as the lab computes it. It is a union on `status`: an `ok` body carries the projection, its range, the settlement and pricing facts it rests on and an optional `closed_month_check`; a `no_data` body carries only `status`, `reason`, `message`, `generated_at`, `month` and `method`, and the schema rejects a `no_data` body that still carries a figure. A settled period (`settlement.reference_period`, `closed_month_check.period`) is either `YYYY-MM` or the PGE connector's `DD.MM.YYYY - DD.MM.YYYY` text, and the lab's optional `privacy` notice is accepted, so the lab can send its file unchanged. Its own `generated_at` — not the push's `captured_at` — decides whether the app shows a figure; anything older than 30 minutes is shown as no figure with the reason. The derived kWh figures (`projected_import_kwh`, `projected_credit_kwh`, `projected_billable_kwh`, `credit_left_kwh`) may be negative on the wire; the app refuses to show a figure from such a body instead of rejecting the push. Any change to the keys of `current-month-bill-forecast.json` (top level or inside `settlement`) needs a contract change deployed first, and `scripts/fixtures/bill-forecast/lab-shape.json` must be refreshed in shape (synthetic values only), or every push is rejected with 422.
- `daily_history` should hold complete past days plus today. Today's entry is partial; each later push replaces it until the day is over.
- `pv_forecast_kwh` (optional, may be `null`) in a `daily_history` entry is the PV forecast for that day as known in the morning. A missing or `null` value keeps a forecast already stored for that day.
- `hourly_history` (optional) holds per-clock-hour totals from the lab's 5-minute history, at most 900 entries with unique `hour_start` values. Each entry is `hour_start` (ISO 8601 with offset, on a whole hour; the instant the hour begins), `load_kwh` and `pv_kwh` (not negative), `grid_net_kwh` and `samples`. Send complete hours only (an hour whose end is at or before `captured_at`), never the hour in progress, so a partial hour can't overwrite a complete one. A regular push sends the last 48 complete hours; the app accumulates them. A one-off backfill of up to 35 days is the lab push run once with `--hourly-hours` (at most 840). Sending the same hour again is fine: the push with the later `captured_at` wins. Each hour's `load_kwh` and `pv_kwh` must be 0–50 kWh and `grid_net_kwh` within ±50 kWh; one value outside that refuses the whole push (422).
- `grid_net_kwh` is the hour's net grid energy: import positive, export negative, the same sign as `state.grid_w`. It is the hourly-balanced quantity PGE bills on. `samples` is the number of 5-minute readings the hour rests on, 0–12 (12 for a full hour); the app uses it to decide whether an hour is complete.
- `period_summaries` (optional) carries the lab's plain-language texts for today, completed days and completed months (`docs/logic.md`, "Period summaries"): 1–80 entries, one per `(kind, period)` pair. `kind` is `today`, `day` or `month`; `period` is the Europe/Warsaw date (`YYYY-MM-DD`) for `today` and `day`, and the month (`YYYY-MM`) for `month`. Each entry has `built_at` (ISO 8601 with offset; when the lab built the facts and the text), `facts` (the scalar figures the text was written from, keys up to 100 characters) and `narration`, which is either `null` (the cloud model failed; the facts still go) or `{text, generated_at, provider, model}` with `text` 1–1500 characters and `provider` always `openrouter`. **`facts` may hold at most 40 keys.** That limit is checked by the app but is not visible in the JSON Schema, which can't express it, and neither is the rule tying the `period` form to the `kind`. Sending the same entry again is fine: the app keeps the entry with the latest `built_at`, and an equal one rewrites it. A newer entry with `narration: null` never clears a stored narration: the app skips it and keeps the stored text with its facts. A regular push carries today, the last 7 completed days and the last 2 months; a backfill sends batches that fit the 80-entry and 256 KB limits.
- **Deploy order for `period_summaries`:** the app (the contract and the `period_summaries` migration) must be live in production before the lab sends the section. Until then every push that carries it, `state` included, is rejected with 422.
- Every object is strict: unknown keys are rejected with 422. Add a field only after this contract gains it.

## Sign conventions

`state.grid_w`: positive is power bought from the grid (import), negative is power fed into it (export). `state.battery_w`: positive is discharge, negative is charge. `pv_w` and `home_load_w` are not signed. The app shows each value unsigned with a direction word and draws the direction arrows from these signs (`docs/logic.md`, Live state). The lab collector documents the same convention (homelab-2 `collect-ha-snapshot.py`, `sign_conventions`).

Checked on 2026-09-29 against 400 real pushes from 2026-09-27 to 2026-09-29: import positive (the import counter rose in 74 of 74 intervals with `grid_w > 0`), battery discharge positive (SOC fell in 110 of 110) and charge negative (SOC rose in 98 of 99). Export negative was not observed in that window because the house did not export; it follows from import being positive. Evidence: `context/archive/2026-09-29-live-flow-interaction/research.md`.

## Never send

PGE CSV rows, customer or POD identifiers, readings finer than the hourly totals in `hourly_history` (single 5-minute or instantaneous history values), Home Assistant entity IDs or tokens, LLM credentials, hostnames or IPs. The contract doesn't accept the lab bundle's `prompt`, `comparison_values` or `safety` blocks, so leave them out.

## Responses

| Status    | Body                                                   | Meaning                                                     | Retry?                                     |
| --------- | ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------ |
| 201       | `{"status":"created"}`                                 | Stored                                                      | —                                          |
| 200       | `{"status":"duplicate"}`                               | Same `captured_at` and identical content already stored     | —                                          |
| 400       | `{"error":"invalid JSON"}`                             | Body isn't JSON                                             | No — fix the sender                        |
| 401       | `{"error":"unauthorized"}`                             | Missing, unknown or revoked token (checked before the body) | No — check the token                       |
| 409       | `{"error":"capture time conflict"}`                    | Same `captured_at`, different content                       | No — a lab bug; never reuse a capture time |
| 413       | `{"error":"payload too large"}`                        | Over 256 KB                                                 | No                                         |
| 422       | `{"error":"invalid payload","path":"…","message":"…"}` | Schema violation (`path` names the first bad field)         | No — fix the sender                        |
| 500 / 503 | `{"error":…}`                                          | App or database problem                                     | Yes, with the same payload                 |

The checks run in this order: the `Authorization` header, the token (the database function `ingest_token_ok`), the body size, JSON parsing, the schema, then the store. A bad token therefore always gets 401, whatever the body holds, and an oversized or malformed body is answered only for a valid token.

Retry network errors and 5xx with the **same** payload; the duplicate rule makes that safe. Never retry 4xx.

What gets stored: raw pushes for 14 days, daily totals per day and hourly totals per hour for 35 days (for both, the push with the latest `captured_at` wins), each recommendation once per `generated_at`, and one period summary row per `(kind, period)` in `public.period_summaries`, kept without pruning (the entry with the latest `built_at` wins, except that a newer entry without a narration never clears a stored one; owners read every column except the push id). The bill forecast gets no table of its own — it is a current-month snapshot recomputed with every push — and is read back from the raw pushes through the `bill_forecast` view, which returns the newest push that carries the section. A push that omits it therefore leaves the last one in place rather than blanking the card.

## Tokens

Tokens are stored only as SHA-256 hashes in `public.ingest_tokens`, and there is no service-role key anywhere.

Payload validation (strict keys, size cap, capture-time window) happens in the app, not in the database. The token is checked before the body is read, and `ingest_push` checks it again for a token revoked in between; neither function validates the payload, so someone holding both an ingest token and the app's Supabase anon key could bypass validation by calling `ingest_push` directly. That's accepted for v1 because the home lab never receives the anon key. Keep it that way: give pushers only the ingest token, and never both secrets.

1. **Create:** `node scripts/create-ingest-token.mjs <label>` prints the token once, plus an `insert` statement. Run the statement in the Supabase SQL editor and put the token in the home lab's push config (never in either repo).
2. **Verify:** `BASE_URL=<app origin> INGEST_TOKEN=<token> node scripts/push-fixture.mjs` should print `201`. It sends only the live `state` section, which the next real push supersedes. `--full` also sends the example's made-up recommendation, daily history, bill forecast, hourly history and period summaries; use it only against a local database, because recommendations and period summaries are never pruned. Against a non-local `BASE_URL` a whole body is refused unless `--allow-remote` is passed, which exists for a deliberate staging push.
   - `--file <path>` sends a whole body from another file instead of the example — the variants in `scripts/fixtures/bill-forecast/` cover the forecast's refusal paths and verdict boundaries. A named file is always sent whole, so it is local-only for the same reason as `--full`.
   - `--captured-at <iso>` sets `captured_at` instead of now and `--shift-days` moves every `daily_history` day so the newest is the Warsaw calendar day of the capture time actually sent (and every `hourly_history` hour by the same number of days); with the variants in `scripts/fixtures/live-flow/` they reproduce each state of the live card, and the ordering rules are in the script's header.
   - `--hourly-days <n>` (1–35) replaces `hourly_history` with made-up hours for the "Godziny zużycia" card: the `n` whole Warsaw days before the capture day plus the capture day's hours up to the last complete one, with a daily load shape, two high-load days and three gap hours (fewer than 10 of 12 readings) at the start of the capture day. The card then counts exactly `n` complete days (35 gives 34, because the app prunes hours older than 35 × 24 hours), so `--hourly-days 3` shows "za mało dni: 3 z 7". It adds to the default state-only push as well as to `--full` or `--file`, and it is local-only like a whole body: against a non-local `BASE_URL` it needs `--allow-remote`.
   - Both forms rewrite `bill_forecast.generated_at` to now (and say so), because the committed bodies carry fixed timestamps that are always past the card's 30-minute freshness rule. `--keep-generated-at` leaves it alone, which is what the deliberately stale variant needs. The same goes for each `period_summaries` entry's `built_at` and `narration.generated_at`: rewritten to the capture time unless `--keep-generated-at` is passed, so pushing the example again with an earlier `--captured-at` leaves the stored summaries unchanged and a later one replaces them.
3. **Rotate:** create a new token, switch the lab to it, then revoke the old one. Both work in the meantime.
4. **Revoke:** `update public.ingest_tokens set revoked_at = now() where label = '<label>';`

Local development and CI use the seeded token `local-dev-ingest-token-not-secret` (from `supabase/seed.sql`, which never runs in production).

## Changing the contract

- Edit `src/lib/ingest/contract.ts`, run `npm run contract:export`, and commit the regenerated schema. `npm test` fails if the committed schema drifts from the code.
- Adding an optional field is backward compatible within v1 only after the app is deployed first. Deploy the app, then update the lab.
- Anything else (renaming, removing, tightening, a new required field) is `contract_version: 2`. The app must accept both versions before the lab switches.
