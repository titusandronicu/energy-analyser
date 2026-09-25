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
- `daily_history` should hold complete past days plus today. Today's entry is partial; each later push replaces it until the day is over.
- `pv_forecast_kwh` (optional, may be `null`) in a `daily_history` entry is the PV forecast for that day as known in the morning.
- Every object is strict: unknown keys are rejected with 422. Add a field only after this contract gains it.

## Never send

PGE CSV rows, customer or POD identifiers, hourly private readings, Home Assistant entity IDs or tokens, LLM credentials, hostnames or IPs. The contract doesn't accept the lab bundle's `prompt`, `comparison_values` or `safety` blocks, so leave them out.

## Responses

| Status    | Body                                                   | Meaning                                                 | Retry?                                     |
| --------- | ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------ |
| 201       | `{"status":"created"}`                                 | Stored                                                  | —                                          |
| 200       | `{"status":"duplicate"}`                               | Same `captured_at` and identical content already stored | —                                          |
| 400       | `{"error":"invalid JSON"}`                             | Body isn't JSON                                         | No — fix the sender                        |
| 401       | `{"error":"unauthorized"}`                             | Missing, unknown or revoked token                       | No — check the token                       |
| 409       | `{"error":"capture time conflict"}`                    | Same `captured_at`, different content                   | No — a lab bug; never reuse a capture time |
| 413       | `{"error":"payload too large"}`                        | Over 256 KB                                             | No                                         |
| 422       | `{"error":"invalid payload","path":"…","message":"…"}` | Schema violation (`path` names the first bad field)     | No — fix the sender                        |
| 500 / 503 | `{"error":…}`                                          | App or database problem                                 | Yes, with the same payload                 |

Retry network errors and 5xx with the **same** payload; the duplicate rule makes that safe. Never retry 4xx.

What gets stored: raw pushes for 14 days, daily totals per day (the push with the latest `captured_at` wins) and each recommendation once per `generated_at`.

## Tokens

Tokens are stored only as SHA-256 hashes in `public.ingest_tokens`, and there is no service-role key anywhere.

Payload validation (strict keys, size cap, capture-time window) happens in the app, not in the database. The `ingest_push` function checks only the token, so someone holding both an ingest token and the app's Supabase anon key could bypass validation by calling it directly. That's accepted for v1 because the home lab never receives the anon key. Keep it that way: give pushers only the ingest token, and never both secrets.

1. **Create:** `node scripts/create-ingest-token.mjs <label>` prints the token once, plus an `insert` statement. Run the statement in the Supabase SQL editor and put the token in the home lab's push config (never in either repo).
2. **Verify:** `BASE_URL=<app origin> INGEST_TOKEN=<token> node scripts/push-fixture.mjs` should print `201`. It sends only the live `state` section, which the next real push supersedes. `--full` also sends the example's made-up recommendation and daily history; use it only against a local database, because recommendations are never pruned.
3. **Rotate:** create a new token, switch the lab to it, then revoke the old one. Both work in the meantime.
4. **Revoke:** `update public.ingest_tokens set revoked_at = now() where label = '<label>';`

Local development and CI use the seeded token `local-dev-ingest-token-not-secret` (from `supabase/seed.sql`, which never runs in production).

## Changing the contract

- Edit `src/lib/ingest/contract.ts`, run `npm run contract:export`, and commit the regenerated schema. `npm test` fails if the committed schema drifts from the code.
- Adding an optional field is backward compatible within v1 only after the app is deployed first. Deploy the app, then update the lab.
- Anything else (renaming, removing, tightening, a new required field) is `contract_version: 2`. The app must accept both versions before the lab switches.
