# Sources: documents

- documents: 4 requirements (prd.md v1, prd-v2.md, prd-v3.md newest, shape-notes.md), 33 archived change folders + 2 in-flight change folders (narrative; each holds plan, research, review files), 9 reference (README.md, docs/architecture.md, docs/logic.md, docs/decisions.md, docs/prerequisites.md, docs/ingest/README.md, docs/ingest/contract-v1.schema.json, docs/ingest/example-v1.json, supabase email templates are code), 8 engineering (context/foundation/test-plan.md, lessons.md, tech-stack.md, infrastructure.md, bootstrap-verification.md, context/deployment/_, context/audits/observability/_)
- newest requirements statement wins: prd-v3.md (created 2026-09-26, with v3.1 notes); `context/foundation/prd.md` (v1) and `prd-v2.md` are superseded history
- agent instruction files that describe the product (reference, read by the docs agent only): `CLAUDE.md` (app), `AGENTS.md`

## Domain documents

| path                                                                                                              | kind                      | what it is about                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `context/foundation/prd-v3.md`                                                                                    | requirements              | newest product requirements: vision, success criteria, user stories, functional requirements, business logic, access control, non-goals |
| `context/foundation/prd-v2.md`, `context/foundation/prd.md`                                                       | requirements (superseded) | earlier versions of the same requirements                                                                                               |
| `context/foundation/shape-notes.md`                                                                               | requirements              | discovery notes the first requirements were written from                                                                                |
| `context/foundation/existing-system.md`                                                                           | reference                 | the data plane that already ran before this application                                                                                 |
| `context/foundation/roadmap.md`                                                                                   | narrative                 | milestone and slice roadmap                                                                                                             |
| `docs/logic.md`                                                                                                   | reference                 | the rules the application and the lab apply to data, with thresholds; some marked planned                                               |
| `docs/architecture.md`                                                                                            | reference                 | data flow, security model, how the application fits with the lab                                                                        |
| `docs/decisions.md`                                                                                               | narrative                 | dated product and technical decisions, newest first, with reasons                                                                       |
| `docs/ingest/README.md`, `docs/ingest/contract-v1.schema.json`, `docs/ingest/example-v1.json`                     | reference                 | the payload contract handed to the lab                                                                                                  |
| `docs/prerequisites.md`                                                                                           | reference                 | external prerequisites                                                                                                                  |
| `README.md`                                                                                                       | reference                 | what the application does, in plain words                                                                                               |
| `context/archive/*/` (33 folders)                                                                                 | narrative                 | plans, research and reviews per change; the team's vocabulary over time                                                                 |
| `context/changes/*/` (2 folders)                                                                                  | narrative                 | in-flight changes                                                                                                                       |
| `context/foundation/test-plan.md`, `lessons.md`                                                                   | engineering               | test strategy and team lessons; read for rules only                                                                                     |
| `context/audits/observability/*`, `context/deployment/*`, `context/foundation/tech-stack.md`, `infrastructure.md` | engineering               | audit, runbooks, stack decisions; read for rules only                                                                                   |

## Product goals

- `context/foundation/prd-v3.md:19`: "The sole operator of a home PV + battery + grid system gets no timely feedback on energy cost — PGE bills post roughly a month after the usage they cover — and has no forecast-informed guidance for battery settings, so charge/reserve decisions are made reactively, without knowing what weather or season is coming."
- `context/foundation/prd-v3.md:44`: "End-to-end flow works: opening the app with the access key shows current state (near-live Home Assistant telemetry pushed from the home lab) plus one derived insight against the historical baseline (computed in this app from pushed history), and an LLM-narrated battery-setting recommendation for today, informed by a solar (PV) production forecast."
- `context/foundation/prd-v3.md:49`: "The user sees the expected cost of the current month before the PGE bill arrives, and the actual cost of the last closed period, instead of learning it a month later from the bill."
- Guardrails, `context/foundation/prd-v3.md:53-55`: "The app never writes to Home Assistant or the inverter — recommendations are advisory-only, for human review." / "No private-network data or secrets (telemetry, bills, credentials, local network topology) leak into the public repo." / "The app degrades gracefully when the home lab stops pushing ...: it shows last-known data with a clear staleness indicator instead of failing."
- Non-goals, `context/foundation/prd-v3.md:281-288`: no custom weather-forecast modelling; no multi-user or multi-household support; no bill reconciliation (predicted vs actual); no CSV upload in the app; no live LLM generation per page view; "No advice from ratings or summaries"; no accept/dismiss feedback; "Notes never alter anything".
- `README.md:3`: "It answers two everyday questions in plain Polish: _what should the battery do today?_ and _was recent usage normal?_"

## Change goals

Each folder under `context/archive/` and `context/changes/` states the goals of one change (for example one slice or one test phase). They are narrative evidence of vocabulary and decisions and are not used to judge the Core.

## Limitations

- The newest requirements version (`prd-v3.md`) carries status `draft`; its roadmap slices S-07..S-20 are partly shipped (see archive folders), so some requirement statements may be older than the code.
- `docs/logic.md` marks some rules as **planned**; the docs agent must separate planned from implemented statements.
- The narrative sample is large (35 change folders); the docs agent reads the vocabulary-bearing files (plan and research headings), not every file.
- The lab (home-lab repository) is outside this repository; its rules are known only from what these documents say.
