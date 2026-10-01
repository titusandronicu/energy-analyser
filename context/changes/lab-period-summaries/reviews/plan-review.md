<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Lab Period Summaries

- **Plan**: context/changes/lab-period-summaries/plan.md
- **Mode**: Deep
- **Date**: 2026-10-01
- **Verdict**: REVISE
- **Findings**: 0 critical, 5 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 8/8 paths ✓; Progress↔Phase 3/3 phases ✓; brief↔plan ✓.

Symbols checked against homelab-2 and the app:

- **Confirmed:**
  - `request_json`/`ProviderError` (run-energy-advisory.py:27-75)
  - `run_openrouter(env, prompt)` (:243-285)
  - a side-effect-free import (main guard :349-350)
  - the `load_module` pattern (build-current-month-bill-forecast.py:85-92)
  - `--from/--to` (push-energy-analyser.py:600-613)
  - `fit_body`/`DROPPABLE_SECTIONS` (:491-512)
  - `counters_usable`/`daily_counters` (:240-276)
  - `energy_snapshot` columns (store-energy-snapshot-sqlite.py:27-53)
  - `factRecord` (contract.ts:16-17, module-private)
  - the refresh guard pattern (:80-86)
- **Contradicted** (findings below): `run_openrouter` reuse; a 62-day range "in batches"; `build_daily_history` reuse.

## Findings

### F1 — A backfill push can silently drop the whole summaries section

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1–2 (range mode, backfill step); Key Discoveries (drop order)
- **Detail**: Range mode is one normal push. A 62-day range carries up to 65 entries, at about 150–200 KB with narrations and facts, plus the recommendation. Near the 256 KB cap, `fit_body` drops `period_summaries` and the push still "succeeds", with only a log line. The backfill would then silently store nothing. The "well under 64 KB" estimate holds only for the regular push.
- **Fix**: Back-fill in batches of at most 14 days (plus their months). In range mode, a dropped `period_summaries` counts as an error: the push exits non-zero and names the range. The runbook lists the batches.
  - Strength: Deterministic size, around 50 KB per batch, and failures are visible.
  - Tradeoff: About 6 backfill invocations instead of 2.
  - Confidence: HIGH — the sizes follow from the contract limits.
  - Blind spot: How large real narrations are; they're capped at 1500 characters.
- **Decision**: FIXED — backfill batches ≤ 14 days; a dropped section in range mode is an error

### F2 — The today entry can pair fresh facts with an hour-old narration

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (cadence, never-downgrade state)
- **Detail**: The job runs every 5 minutes, but the today narration refreshes every 55 minutes. If the today facts were rebuilt on every run while the stored narration is kept, the entry would carry facts the text doesn't describe. The numbers check would also have passed against different facts.
- **Fix**: Build the today facts and the narration together, once per hour. Between those builds, re-send the stored entry unchanged (same `built_at`). Only a failed narration produces a facts-only today entry.
  - Strength: The text and its facts always match, so S-18 can show both.
  - Tradeoff: Today's facts can be up to an hour old (the app's 2 h staleness covers it).
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED — today facts and text built together hourly, re-sent unchanged in between

### F3 — `run_openrouter` can't be reused for a description-only prompt

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §2 (loads the advisory "for … the OpenRouter call settings")
- **Detail**: `run_openrouter` (run-energy-advisory.py:243-285) hardcodes an "advisory-only home energy analyst" system message and wraps the prompt in `compact_prompt`, which asks for observations, "co sprawdzić jutro" and missing data. Both are advice-shaped.
- **Fix**: The job builds its own OpenRouter request through `request_json`, with its own system message. It reuses only the env keys (`OPENROUTER_API_KEY`, `_MODEL`, `_BASE_URL`, `_TEMPERATURE`, `_TIMEOUT_SECONDS`, `_HTTP_REFERER`, `_X_TITLE`).
- **Decision**: FIXED — own OpenRouter request via request_json; env keys only

### F4 — The SSL fix misses other mid-response failures

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §1
- **Detail**: `ssl.SSLError` is already an `OSError`. A truncated body raises `http.client.IncompleteRead` (an `HTTPException`), a bad JSON body raises `ValueError`, and `run_openrouter` indexes `choices[0]` without type checks. None of these become a `ProviderError`.
- **Fix**: `request_json` maps `OSError`, `http.client.HTTPException` and `ValueError` (JSON decode) to `ProviderError`, and the OpenRouter response parsing type-checks. Test each of the three.
- **Decision**: FIXED — OSError, HTTPException and ValueError mapped, with tests

### F5 — "At most 3 attempts per day" conflicts with "a later run fills it in"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details (cadence); Desired End State
- **Detail**: With a hard cap of 3, a day whose 3 attempts all fail during an outage stays facts-only forever. That contradicts the end state.
- **Fix**: A missing day or month narration is retried at most once per hour for 3 days. After that it stops and is listed in the log. A later `--from/--to` run can still fill it in.
- **Decision**: FIXED — hourly retry for 3 days, then logged

### F6 — Day facts can't come from `build_daily_history`, and SQLite rows need mapping

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 (Facts, Completeness)
- **Detail**: `build_daily_history` returns only pv, load, grid and the forecast, and clamps ranges to 62 days. `energy_snapshot` uses `captured_at` instead of `generated_at` and has no `counters_ok`. `energy-history.jsonl` still covers everything since 07-16 and has the battery, SOC, forecast and `counters_ok` fields.
- **Fix**: Use `counters_usable` and `daily_counters` directly. Take the battery totals from the chosen row, and SOC min/max over the day's rows. Read the JSONL for anything within its 90 days, and use SQLite (opened read-only, mapping `captured_at` to `generated_at` and using the legacy completeness rule) only for older dates.
- **Decision**: FIXED — counters_usable/daily_counters directly; JSONL within 90 days, SQLite older with mapping

### F7 — The 40-key facts cap needs a refine, and the shell gate should be `sh -n`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1; Phase 2 Success Criteria (2.4)
- **Detail**: `factRecord` limits key length but not the number of keys. A `.refine` doesn't appear in the exported JSON Schema. The refresh script is POSIX `sh` (`#!/usr/bin/env sh`, `set -eu`).
- **Fix**: Add the key-count refine and note in the README that the limit isn't in the schema. Gate 2.4 uses `sh -n`.
- **Decision**: FIXED — key-count refine noted in README; gate uses sh -n

### F8 — Narration calls can delay the push by minutes

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §3 (refresh wiring)
- **Detail**: The refresh is a oneshot unit. Up to 3 OpenRouter calls at the 120 s default timeout, run before the push, could hold the 5-minute push back by several minutes.
- **Fix**: The job uses a 30 s request timeout of its own and at most 2 narrations per run (today first, then the oldest missing period). The backfill CLI is not limited.
- **Decision**: FIXED — 30 s timeout, at most 2 narrations per run
