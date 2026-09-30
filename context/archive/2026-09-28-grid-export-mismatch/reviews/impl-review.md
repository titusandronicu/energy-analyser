<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Night-Time Grid Draw and Highest/Lowest Consumption Hours

- **Plan**: context/changes/grid-export-mismatch/plan.md
- **Scope**: Full plan, plus the post-rollout addendum `1d7ac4f` (suspect hours, night-accuracy wording)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Evidence

- **Reviewed:** app `main` at `d372574` and homelab-2 `main` at `dce6b33`. Diff range: app `10a8d17..d372574` (21 files outside `context/`) and homelab-2 `b946339` (3 files).
- **Automated criteria re-run on `main`:**
  - `npm test`: 677 pass
  - Schema regeneration is a no-op
  - `npm run lint`, `npx astro check` (0 errors) and `npm run build` pass
  - Doc greps 2.4, 3.5 and 4.3 pass
  - Lab tests: 83 pass
  - The local database checks (1.6, 1.7) were not re-run, because the local stack is stopped. Both were recorded as passing and CI smoke was green on PR 75 and PR 76.
- **Manual rows:** all ticked, with evidence in `plan.md` and `change.md`.
- **Plan drift:**
  - Every planned change matches.
  - "What We're NOT Doing" was respected.
  - Nothing is missing.
  - The non-hourly body of the replaced `ingest_push` is byte-identical to `20260925151509_daily_forecast.sql`.
  - Row-level security and grants are owner-only, and anon can read nothing.
  - No injection or XSS risks were found.

## Findings

### F1 — "Complete hour" is judged on grid readings only

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: homelab-2 `infra/compose/energy-app/scripts/push-energy-analyser.py:381-382`
- **Detail**: `samples` counts only rows that have a `grid_w`, but `load_kwh` is averaged over however many `home_load_w` readings exist, which can be fewer. An hour can pass the app's 10-of-12 rule (`hourly-usage.ts:120`) while its house use rests on 2–3 readings, and the card ranks by house use. This may also feed the suspect low hours seen in production.
- **Fix**: `samples` = the smaller of the `grid_w` and `home_load_w` counts, capped at 12, with a lab test.
  - Strength: the completeness rule then protects the figure that is actually ranked; a one-line change.
  - Tradeoff: needs a lab redeploy on docker-core. Hours already stored keep their count until the 48-hour window rewrites them.
  - Confidence: HIGH — the counting line and the app rule are explicit.
  - Blind spot: how often `home_load_w` is missing while `grid_w` is present has not been measured.
- **Decision**: FIXED — homelab-2 `0562b7c` (branch `fix/hourly-samples-count-load`): `samples` = the smaller of the `grid_w` and `home_load_w` counts; new test, break-checked. Deploy to docker-core pending.

### F2 — Night-accuracy wording is inconsistent in three places

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `docs/logic.md:96`, `context/foundation/roadmap.md:412`, `docs/decisions.md:7`
- **Detail**: The addendum measured +11.8% at night ("usually about 10–20%"). Three older passages still say "within ±10%" or "agrees with PGE", and `logic.md:96` contradicts `logic.md:106` in the same section.
- **Fix**: Update `logic.md:96` and `roadmap.md:412` to the measured figure. Leave the dated `decisions.md` entry as written and add a one-line correction beneath it.
- **Decision**: FIXED — `docs/logic.md` and `roadmap.md` now give the measured 11.8% (22:00–06:00, 26–31 August); the dated `decisions.md` entry keeps its wording with a correction note beneath.

### F3 — Small unplanned refinements, all documented

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/components/StatusBadge.astro`; `src/lib/services/hourly-usage.ts:113-120`; homelab-2 `push-energy-analyser.py:363-364`
- **Detail**: Five things go beyond the plan:
  - StatusBadge's `text` prop and the neutral badge ("Pełne dane z N dni")
  - null readings counted as gaps
  - the "brak pełnego dnia" refusal text
  - the lab flooring negative load and PV means at 0
  - `--hourly-days 35` showing 34 days
    All are sensible, tested and documented.
- **Fix**: Accept as is.
- **Decision**: ACCEPTED — refinements kept as documented.

### F4 — No upper time bound on stored hours

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/hourly-usage.ts:92-101`; `src/lib/ingest/contract.ts`
- **Detail**: The loader reads newest first with no limit, and the contract accepts future `hour_start` values. Bad future rows could push real rows past PostgREST's 1,000-row cap.
- **Fix**: Add `.lt("hour_start", now)` to the loader.
- **Decision**: FIXED — `loadHourlyEnergy` reads only `hour_start < now` (`.lt`), asserted in the loader test.

### F5 — Owners are granted captured_at, which the app never reads

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260930081229_hourly_energy.sql:140`
- **Detail**: `daily_energy` deliberately withholds this column. Least privilege suggests dropping it here too.
- **Fix**: A later migration revokes `select (captured_at)`. It needs a production migration, so it can ride with the next one.
- **Decision**: FIXED — `20260930085907_hourly_energy_hide_captured_at.sql` revokes owners' select on `captured_at`; applied to production through the connector and confirmed in `list_migrations` and the column privileges.

### F6 — No sanity cap on readings

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/ingest/contract.ts` (hourly entry); homelab-2 `number()`
- **Detail**: A sensor glitch such as 1e9 W would be stored and ranked highest.
- **Fix**: Bound hourly energies in the contract, e.g. at most 50 kWh an hour; the house peaked at about 8 kWh an hour.
- **Decision**: FIXED — the contract bounds hourly `load_kwh`/`pv_kwh` at 0–50 kWh and `grid_net_kwh` at ±50 kWh (`MAX_HOURLY_KWH`, exported to the JSON Schema), with tests; break-checked.
