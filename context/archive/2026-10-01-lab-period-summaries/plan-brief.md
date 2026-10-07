# Lab Period Summaries — Plan Brief

> Full plan: `context/changes/lab-period-summaries/plan.md`
> Research: `context/changes/lab-period-summaries/research.md`

## What & Why

Roadmap F-04 (FR-023, FR-030). The home lab writes plain-language texts for someone without energy knowledge, all generated ahead of the owner's visit:

- an explanation of what today's figures mean, refreshed every hour;
- a summary of each completed day;
- a summary of each completed month.

The texts describe what happened; they never advise and never introduce numbers of their own. Each one is pushed with its facts, so a failed LLM call still delivers the facts. This unlocks S-18, which shows the texts on the dashboard and next to the calendar ratings.

## Starting Point

The lab already narrates an hourly battery recommendation with the cloud model (OpenRouter `gpt-4.1-mini`). That prompt is shaped for advice, though, and its HTTP client crashes on an SSL error. The local "observations" are almost all fixed rules built on the faulty grid counters. Grid import, export and house use are wrong for the whole history; PV, the forecast and the battery figures are sound. The app has no table for summaries, and its strict contract rejects an unknown section.

## Desired End State

The app stores one row per period: today, day or month. Each row holds the facts, plus the cloud model's narration once it exists. About every hour, today's explanation is rewritten. Each completed day, and each month with at least 7 complete days, gets a summary. July to September 2026 are backfilled. Grid figures stay in the facts with a reliability flag and never appear in the text. S-18 can then display all of it.

## Key Decisions Made

| Decision           | Choice                                                                                                        | Why (1 sentence)                                                 | Source   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| Faulty figures     | Kept in facts with `grid_sensor_reliable: false`; never quoted in text                                        | The text won't repeat wrong numbers as truth (option A)          | Plan     |
| Local observations | Left out for now; fixing the micro-analysis is a separate change                                              | They are 97% rules on the faulty counters                        | Plan     |
| Narrator           | OpenRouter only; when the cloud fails, facts go with `narration: null` and a later run fills it in            | Small local models write weaker Polish (decision 2026-09-26)     | Plan     |
| Today              | Its own cloud call about every hour, facts and text built together; stale after 2 h (like the recommendation) | A clean descriptive prompt, failures independent of the advisory | Plan     |
| Versions           | Latest `built_at` wins; day after it closes, month on the 1st                                                 | Lets narration arrive later and texts improve after gap fills    | Plan     |
| Thin periods       | No summary for incomplete days or months under 7 complete days                                                | FR-019 and US-05 (enough data first)                             | Plan     |
| Backfill           | Once for 2026-07-16..09-30, from SQLite                                                                       | The calendar has texts for its whole history                     | Plan     |
| SSL crash          | Fixed here in the shared HTTP client                                                                          | The summaries reuse the same client                              | Plan     |
| Facts apart        | Narration nullable inside each entry; the recommendation gate untouched                                       | Roadmap F-04 risk; decisions 2026-09-30                          | Research |
| Storage            | New `period_summaries` table + `ingest_push` redefinition (hourly_energy pattern)                             | Pushes are pruned after 14 days, so a view can't serve history   | Research |
| No made-up numbers | The lab rejects a narration with any number missing from its facts                                            | FR-030: "introduces no numbers of its own"                       | Plan     |

## Scope

**In scope:**

- The app: the contract section, the table, `ingest_push`, schema, example, fixtures, smoke and docs.
- The lab: `build-period-summaries.py` (facts, prompt, numbers check, cadence, state file), the advisory's SSL fix, refresh wiring, the push section, the backfill, tests, the runbook and the deploy.

**Out of scope:**

- The display (S-18).
- Ollama or HA narration of these texts, and the micro-analysis fix.
- Weather data and same-season comparison.
- Recommendation changes.
- PGE data, and day notes in the facts.

## Architecture / Approach

Every 5 minutes, the lab refresh runs `build-period-summaries.py`, which:

1. decides which periods are due;
2. builds their facts from the history (today) and SQLite (days and months);
3. narrates them via OpenRouter, using a description-only prompt;
4. rejects any narration with numbers that aren't in its facts;
5. keeps the results in `period-summaries.json`, never downgrading a narration.

The push then sends today, the last 7 days and the last 2 months as `period_summaries`. The app's `ingest_push` upserts them into `public.period_summaries`, where the latest `built_at` wins and only the owner can read them.

## Phases at a Glance

| Phase                        | What it delivers                                           | Key risk                                                          |
| ---------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. App contract and storage  | Section, table, `ingest_push`, schema, smoke, docs         | Must be live in production before the lab sends; strict contract  |
| 2. Lab facts and summary job | Bundles, prompt, numbers check, cadence, state, SSL fix    | The text sounding advisory or quoting grid figures (dry-run read) |
| 3. Push, backfill and deploy | Push section, range backfill, runbook, docker-core install | Deploy order; backfill narration gaps                             |

**Prerequisites:**

- Local Supabase on the UGREEN for the Phase 1 gates (owner's OK).
- The owner's approval for the production migration, the app deploy and the docker-core install.
- OpenRouter key already on docker-core.

**Estimated effort:** about 3 sessions across 3 phases.

## Open Risks & Assumptions

- The numbers check may reject fluent texts that round differently. Its tolerance is pinned by tests and checked in the dry run.
- The battery counters are assumed sound, though that is unverified. If they aren't, they get the same reliability flag.
- About 4 USD a month of extra OpenRouter spend for the hourly today texts.

## Success Criteria (Summary)

- Production `period_summaries` holds narrated rows for today, every complete day since 2026-07-16, and July, August and September.
- The texts read as plain Polish descriptions, with no advice, no grid figures and no numbers missing from their facts.
- A failed cloud call still delivers the facts, and the narration appears on a later run.
