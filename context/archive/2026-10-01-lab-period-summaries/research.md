---
topic: How the lab can write and push plain-language texts for today, completed days and completed months (F-04), and how the app stores them for S-18
date: 2026-10-01
researcher: Claude (Opus 5.5) for the owner
git_commit: 0d03194
branch: main
repository: energy-analyser (+ homelab-2 at main)
status: complete
last_updated: 2026-10-01
last_updated_by: Claude
---

# Research: lab period summaries (F-04)

## Question

What do the requirements and earlier decisions demand of the lab's period texts? What exists in homelab-2 to produce them, and which app contract and storage pattern fits so that S-18 can show them later?

## Summary

### Requirements (all must-have)

- **FR-023** (`context/foundation/prd-v3.md:215`): each completed day and month gets a short summary.
  - The lab's LLM narrates a facts bundle, takes Polish seasons into account, and gives no advice.
  - It is generated ahead of the visit.
- **FR-030** (:234): the dashboard shows a short plain-language explanation of today's figures.
  - The stronger (cloud) model in the existing narration chain writes it.
  - The local model only gathers frequent observations.
  - It narrates verified facts and "introduces no numbers of its own".
- **US-05** (:126-127): a summary shows only for a period with enough data, and it never advises.
- **NFRs** (:256-261): only aggregates, facts and narration leave the lab; no LLM call happens on page view.

### Decided upstream

- **Facts travel apart from the narration.** A failed LLM call must leave the facts in the push (roadmap F-04 Risk `roadmap.md:143`; `docs/decisions.md:43`). The old recommendation block keeps its gate.
- **Model roles:** the local model probes and the stronger model writes every user-facing text (`docs/decisions.md:97`). The micro-analysis feed is input only and is never shown raw (:43; roadmap Parked :452).
- **The live LLM configuration stays as it is** (`prd-v3.md:241-243`): OpenRouter `openai/gpt-4.1-mini` first, then Ollama, then HA (`docs/prerequisites.md:37-53`).

### The narration chain can be reused, but not as it is

- `run-energy-advisory.py` runs about every 55 minutes: 26 runs in 24 h, 25 on OpenRouter.
- Its prompt is advice-shaped (`:109-170`), so F-04 needs a new description-only prompt.
- **Crash bug:** `request_json` (`:68-75`) does not catch `ssl.SSLError` or `OSError`. On 2026-09-30 10:11 EDT an SSL read error crashed it, and Ollama was never tried.

### The "local model's observations" are almost all fixed rules

- 281 of the last 288 micro-analysis rows came from `local_rules`; Ollama `gemma3:4b` produced 7. It runs on 4 CPU cores, with likely timeouts that the code swallows (`run-local-micro-analysis.py:141-200`).
- The rules rely on import and export counters from the faulty grid sensor.
- The rows are kept for about 3 days (288 rows).

### Trustworthy facts

- **PV production and the Solcast forecast** are sound.
- **Battery counters** are probably sound, but unverified.
- **Grid import, export and house use** are wrong for the whole history (`docs/logic.md:152-188`; `context/archive/2026-09-30-inverter-grid-correction/`). The app shows them only with the whole-history caveat (option A, "nothing corrected numerically").
- **Ratings** exist for completed days and months, but they rest on import and use.
- **Weather:** none. Season can come only from the date.

### Storage

- **A view over `ingest_pushes` won't work:** payloads are pruned after 14 days.
- **What fits is the `hourly_energy` pattern:** a new owner-read table, plus `public.ingest_push` redefined from its latest body (`supabase/migrations/20260930081229_hourly_energy.sql:29-136`).
- The contract section is optional, so the app must be deployed before the lab sends it (`docs/ingest/README.md:71-75`; roadmap open question 1 `:424`).

### Cost

- Today the advisory costs about 0.0054 USD per call, which is about 4 USD a month.
- One extra call per completed day and per month is negligible.
- A separate hourly "today" call would add about 4 USD a month, unless it rides the existing advisory call.

## Detailed findings

### Requirements and decisions

- **US-01** (`prd-v3.md:59-75`): every card must be readable without energy knowledge (:73). The recommendation comes from the last daily refresh (:68).
- **FR-031** (:235-243): consumption trends.
  - Same-season comparison only from about July 2027.
  - The local model probes about every 12 minutes and the stronger model writes the texts. "The summaries in FR-023 follow the same plain style and the same split."
- **FR-019** (:205): "not enough data yet". Nothing is derived from a single day.
- **Non-goals** (:279-280): no live LLM per page view, and no advice from ratings or summaries.
- **Lab-feature-port** (`context/archive/2026-09-28-lab-feature-port/research.md:136-141`): HA `script.energy_report` (`packages/gemini_home_reports.yaml:63-97`) is a ready Polish daily-summary model. It explains the "opust" credit and tells the model not to quote PLN amounts.
- **Q3 and Q5 decisions** (`change.md:26,28`): facts are separated from the LLM gate in the F-04 section, and micro-analysis is input only.
- **S-18** (`roadmap.md:298-308`): shown "as narrated, with its generation time and the period it covers".
  - Reserved slot: `ReservedSlots.summary` (`src/lib/services/calendar-view.ts:193-199`), spread into the month, quarter and day views (:481, :514, :623), and pinned `null` in tests (`calendar-view.test.ts:282,328,376,391`).
  - The dashboard has no slot yet (`src/components/DashboardBody.astro:29-40`).
- **Recommendation precedent** (`src/lib/services/recommendation.ts`):
  - It goes stale after more than 2 hours or on an earlier Warsaw day (:9, :95-103).
  - Historical mode is neutral (:160-184).
  - The model label is `model (provider)` (:19-23).
  - Facts are untrusted jsonb, guarded field by field.
  - The app has no facts-only check. The no-advice rule lives only in the PRD, the roadmap and the prompts.
- **Lessons:**
  - A change that depends on an LLM or adds a contract section updates `prerequisites.md`, `logic.md`, `decisions.md` and `architecture.md` in the same PR (`context/foundation/lessons.md:8-10,16`).
  - The lab's findings now use Polish diacritics and fact-only wording (`context/archive/2026-09-30-lab-findings-cleanup/`).

### Lab: narration chain and data (homelab-2 `infra/compose/energy-app/scripts/`)

**Cadence**

- `homelab-energy-refresh.timer` runs every 5 minutes.
- Micro-analysis runs when its output is older than 12 minutes (`refresh-energy-agent-data.sh:110-124`), about every 15 minutes in practice.
- The advisory runs when its output is older than 55 minutes (:126-138).
- The live scripts are identical to the repo (no drift).

**Advisory output** (`web/data/energy-agent-response.json`)

- Fields: `generated_at`, `provider_chain`, `provider`, `model`, `fallback_used`, `failures[]`, `response_text`, `raw_response` (`run-energy-advisory.py:326-339`).
- It falls back to the next provider only on `ProviderError` (:319-324).
- The prompt carries about 44k characters of memory excerpts (:129-153), including micro-analysis capped at 5,000 characters (:136).

**Push gate** (`push-energy-analyser.py:201-231`)

- `build_recommendation` drops the whole block, facts included, when the response is missing or empty, the provider is unknown (`"none"` on total failure), or `generated_at` or `model` is missing.
- It has no age check: a stale response is re-sent with its old `generated_at`.

**Completed-day detection** (`push-energy-analyser.py:255-349`)

- `build_daily_history` and `daily_counters` define a day as complete when it has a usable sample at or after 23:00 Warsaw time. Incomplete days get null totals.
- This can be reused as the "day is closed" trigger.

**Data for bundles**

- `web/data/energy-history.jsonl`:
  - 5-minute rows, kept for about 90 days (25,920 rows; the first rows drop around 2026-10-30).
  - Contents: W readings, SOC, battery temperature, Solcast today, tomorrow and p10/p90 (from 09-26), and the day counters (`produced`, `consumed`, `bought`, `exported`, battery charged and discharged, `counters_ok`).
- `private/energy.sqlite3` `energy_snapshot`:
  - Not trimmed, 17,476 rows since 07-17.
  - The only source older than 90 days, so monthly bundles are safe.
- `pge_hourly_reading` must stay in the lab.
- `aggregate-energy-history-hourly.py`: the last 48 hours of hourly averages and maxima.
- Bill forecast:
  - `closed_month_check` (`build-current-month-bill-forecast.py:451-475`).
  - It reads `no_data` on the 1st of a month.
- No weather source exists in the lab.

**Push assembly**

- `build_payload` (`:515-541`) adds `recommendation`, `daily_history`, `bill_forecast` and `hourly_history`.
- The body is capped at 256 KB. `fit_body` drops `hourly_history`, then `bill_forecast` (:491-512).
- Patterns to copy for a new section:
  - `load_bill_forecast` (:454-485): returns `(body | None, reason)`, with size, status, freshness and identifier guards.
  - `build_hourly_history`: a pure builder.
- Tests are in `test_push_energy_analyser.py` (unittest).
- Deploy follows `runbooks/energy-analyser-push.md`: deploy the app contract first, keep `.bak` files, install with `sudo install`. Prompts, raw responses and provider failures are never pushed (:13).

**Models**

- OpenRouter `gpt-4.1-mini`: the latest call used 11.7k prompt and 437 completion tokens.
- Ollama on docker-core (4 cores, 7 GB RAM, CPU only): `gemma3:4b`, `qwen3:4b`, `qwen3:1.7b`.
- Unused in the refresh: `run-ha-conversation-advisory.py`. It looks like legacy code.

### App: contract and storage (energy-analyser)

**Contract** (`src/lib/ingest/contract.ts`)

- Version 1, built from strict objects, so unknown keys get a 422 for the whole push (:3-5).
- Precedent for narrated text: `recommendation` (:40-52) has `generated_at`, `language: "pl"`, `text` 1–4000, a provider enum and a model.
- Fact records: keys up to 100 characters; values are a number, a string of at most 500 characters, a boolean or null (:16-17).
- Sections are optional at :189-206.
- Adding a section touches:
  - the exported schema (`npm run contract:export`; drift test `contract.test.ts:55-59`);
  - `example-v1.json` and the `sections()` helper (:24-30);
  - the "only state" test (:65-73);
  - `push-fixture.mjs`, which strips sections (:109-113);
  - `smoke.mjs` `freshPush` (:47-58);
  - an anon-read-denied step per table (:276-354) and an owner-read step (:355-400);
  - the README section list (:19-25) and change rule (:71-75).

**Storage**

- `ingest_push` (latest body `20260930081229_hourly_energy.sql:29-132`):
  - `daily_energy` and `hourly_energy` use "latest `captured_at` wins".
  - `recommendations` uses "first wins" (`on conflict (generated_at) do nothing`).
  - Pushes are pruned after 14 days, hours after 35 days.
  - Grants are restated after each redefinition (:135-136).
- **Owner-read pattern:** `revoke all`, a column `grant select`, and an `app_owners` policy (:17-21, :140-147). Internal columns stay hidden (`20260930085907_…`).
- **Suggested key** for summaries: `(period_kind in ('today','day','month'), period_key)`. Facts are stored apart from the nullable narration columns (text, provider, model, generated_at), and `push_id … on delete set null`.

**Process precedents**

- **bill-forecast** (`context/archive/2026-09-27-bill-forecast/plan.md:77-192`): a view, no table, and `ingest_push` unchanged.
- **grid-export-mismatch** (`context/archive/2026-09-28-grid-export-mismatch/plan.md:102-170,312-358`):
  - A table plus an `ingest_push` redefinition.
  - Lab `fit_body` drop order.
  - The migration applied before the lab sends (`docs/prerequisites.md:73`).
  - A follow-up to hide `captured_at`.

## Open questions for the owner

1. **Facts in the bundles.**
   - Sound and cheap: PV produced vs forecast, battery cycling, the season from the date, the rating with its basis, and the data period.
   - Should grid import, house use and self-sufficiency be left out of the narration while the sensor is faulty, or mentioned only with the sensor caveat?
2. **The local observations.** They are 97% rules on faulty counters. Should they feed the narration as they are, be left out until the micro-analysis is fixed, or be fixed first (Ollama timeout, swallowed errors)?
3. **A text from an Ollama fallback.** Show it with its model label, as the recommendation does, or keep the facts and drop the narration when the cloud fails?
4. **Today's explanation.** Generated in the same call as the hourly advisory (no extra cost), or as its own call? How stale may it get before the app calls it out of date (the recommendation uses 2 hours)?
5. **Completed periods.** Write once when the day or month closes ("first wins"), or let a later push replace them, for example after a backfill or a fix ("latest wins")? And when should the month summary run: the 1st, or once the bill forecast's closed-month check exists?
6. **Thin days.** For days with too little data, "Poza oceną" days (2026-08-03 to 08-17) and inconsistent early rows: no summary, or a summary that says so?
7. **Backfill.** Write summaries for past days and months (July to September) once, or only from deployment onward?
8. **Bundled fix:** fix the advisory's SSL crash (`request_json`) in this change, since the new texts reuse the same chain?

## Facts for planning

- **Two repos, in this order:**
  1. The app: contract section, table, `ingest_push`, schema, example, fixtures, smoke, docs. Deployed and migrated first.
  2. homelab-2: the summary job, the prompt, the push section, tests, runbook. Deployed after the app.
- **Section shape:** each entry carries facts (required) and narration (nullable), with `provider`, `model` and `generated_at` describing the narration only. The lab sends the section even when the LLM failed. Text and facts need size limits, and the section's place in `fit_body` must be decided.
- **No advice and no numbers of its own:** the prompt enforces it, and the lab could add a cheap check (for example, every number in the text must appear in the facts) before pushing. The app shows the text as narrated.
- **Docs to update:** `prerequisites.md` (the LLM job and deploy order), `logic.md`, `decisions.md`, `architecture.md` (the "The two LLMs" planned line, `docs/architecture.md:71-78`), `docs/ingest/README.md`, and the homelab-2 runbook.
