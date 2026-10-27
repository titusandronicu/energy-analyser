---
name: ingest-contract
description: Change the push ingestion payload contract (a new or altered field the home lab sends to POST /api/ingest). Load when editing src/lib/ingest/contract.ts, docs/ingest/, or the fixtures the lab shape is tested against.
---

# Ingest contract change

## When to use

- A field is added, removed or loosened in the payload the lab pushes.
- The lab's `current-month-bill-forecast.json` or another lab file changes its keys.

## Steps

1. Edit the zod contract in `src/lib/ingest/contract.ts`. Every object is strict: unknown keys are rejected with 422, so a lab that sends a new field before the app knows it breaks every push.
2. Run `npm run contract:export` to regenerate `docs/ingest/contract-v1.schema.json`. `npm test` fails if the committed schema drifts.
3. Update `docs/ingest/example-v1.json` and the prose in `docs/ingest/README.md` (the handoff the lab reads). Rules the JSON Schema cannot express (key-count limits, kind/period pairing) must be written there.
4. If the lab file shape changed, refresh `scripts/fixtures/` in shape only, with synthetic values.
5. If the change needs a migration (a new table or an `ingest_push` change), use the `supabase-migration` skill and state the deploy order: the app and migration go live before the lab sends the new section.
6. Add the deploy order to `docs/prerequisites.md` (`prerequisites-update` skill).

## Check

- `npm test` and `npm run lint` pass with the regenerated schema committed.
- `npm run test:integration` passes when the change touches `ingest_push` (local Supabase only, see `local-supabase`).
