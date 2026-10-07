# Architecture report: Energy Analyser

Repository: `titusandronicu/energy-analyser`. History covered: 2026-09-14 to 2026-10-07 (3.5 weeks, 280 counted commits at the map head, one human author, 256 of 271 human commits co-authored with an AI agent). The repo map was regenerated at head `e630d36`; since then 10 commits (PRs #147-#156) landed. Sections 3-6 describe the push-boundary refactor of 2026-10-06; section 7 covers what followed.

## 1. The product in one paragraph

A single-owner web app (Astro 7 SSR, React 19, Supabase) for a home solar system. A home lab pushes data and advice text to `POST /api/ingest`. The app signs the owner in, stores the push, applies its own season-aware rules and shows a live power flow, a daily battery recommendation, a bill forecast, a history calendar with ratings and day notes, and Telegram alerts. It never controls any device.

## 2. Repo map (M4 L2): where the business lives and where it hurts

`context/map/repo-map.md` ranks 10 product capabilities (ingest, access, live-flow, bill, advice, history, ratings, notes, alerts, dashboard) plus platform, foundations and docs by criticality times buzz, from git history, GitHub discussion, an import graph and authorship.

- **Risk zones (5):** the push boundary (contract plus the `ingest_push` SQL function), live flow (imported by 7 capabilities), sign-in and owner access (the only capability with real behaviour defects), the Warsaw-time and value helpers behind every money and boundary decision, and the unattended alert evaluator, which runs from cron with no page view to show a break.
- **Watch:** bill forecast (money logic, one week old) and history (widest fan-out: its page imports 20 files).
- **Looks hot, is not:** platform CI churn, a flat 19-30% fix share (55% of fix commits are planned review-fix rounds), 0 reverts, eleven deliberate break-proof PRs, planning-doc churn.
- **Limits:** 3.5 weeks of history (one day for alerts), one author, and SQL and RLS have no import graph (a hand-built table stands in).

## 3. Feature research (M4 L3)

`context/archive/2026-10-01-testing-push-to-page-integration/research.md` (three read-only agents plus spot checks) verified how the write path orders its checks and which history-safety rules are enforced or left open. It gave the refactoring its facts: the token was checked only after the body was validated, five latest-wins rules live only as upsert clauses, and five behaviours were pinned as KNOWN GAPs instead of fixed.

## 4. Domain notes (M4 L5): the language and the rules

`context/domain/domain-distillation.md` and the glossary `context/domain/glossary.md` came from three independent agents (documents, code language, code rules).

- **43 terms** in the table: 15 Core, 28 Supporting; 5 are missing in code, all documented as planned. **Core subdomains:** advice and usage verdicts, and cost foresight.
- **Overloaded words** are the strongest drift: "complete" carries five rules, "state" six meanings.
- **35 rules** checked against the code: 19 enforced, 14 declared (soft, client-only or held by absence), 1 undocumented exposure, none ignored or contradicted. **14 drift rows:** 3 fixed in code, 8 in docs, 3 need a decision.
- **Ranking #1:** the push boundary: rules in a zod contract, a service and an SQL function redefined in five migrations; a direct RPC call skips the contract.

## 5. Refactoring plan (M4 L4) and what it did

Plan: `context/archive/2026-10-06-refactor-push-boundary/plan.md` (review: `reviews/plan-review.md`, 7 findings, all fixed before coding). Five phases, only one changes behaviour.

1. **Safety net first:** a golden replay and characterization tests, pinning today's behaviour including the five KNOWN GAPs.
2. **SQL restructure (pure):** `ingest_push` split into one helper per section in a non-exposed `ingest` schema; privileges proven with `has_function_privilege`, retention windows named once with a drift test.
3. **Service restructure (pure):** `handleIngest` as named stages in the same order; the JSON Schema stays byte-identical.
4. **Behaviour change:** the token is checked first through `ingest_token_ok`, so a bad token gets 401 whatever the body holds.
5. **Docs** in step with the code.

Evidence: CI green at every phase. A TypeScript-level break turned the new tests red locally; a database-level break (removing one upsert guard) turned the `integration` job red on exactly 2 of 62 tests. Production: both migrations applied after a dry run, deploy approved and verified (`/api/health` reports the new release; the first lab push after it was stored with all sections).

## 6. What I would defend, and what is still open

- **Defend:** prove first and change second; one behaviour change isolated in its own phase; the decisions are recorded in `docs/decisions.md` (2026-10-06), including the rejected options. The plan's ticks are true: all five phases shipped and both migrations ran in production.
- **Open, on purpose:** a direct RPC call with a valid token and an out-of-contract payload (for example a negative total) is still stored. Only the token-order half is closed; it is recorded as a follow-up with the five pinned KNOWN GAP behaviours.
- **Process lesson:** PR #131 is titled "phases 1-2 of 5" because it was squash-merged as a draft while commits were still coming, yet its five commits, both migrations and the docs are all in it. The plan's SHAs were repointed at archive time (`reviews/archive-sha-repoint.md`, 22 rows) and the last ticks needed a follow-up PR.
- **Limits:** three weeks and one author mean no trend can be trusted; lab-side rules are known only from `docs/logic.md`.

## 7. Since the map: the same method on two smaller changes

- **`refactor-opportunities` (#149):** four read-only agents ranked the duplication; one PR shared three copied test-safety guards and a few helpers without changing behaviour (the 12 `KNOWN GAP` tests and the schema drift test stayed untouched).
- **`refactor-followups` (#151-#153):** a review of that PR by two independent readers found no behaviour change, only low-severity leftovers. Its one behaviour change, refusing an app key that is not a publishable or anon key, shipped warn-only first and refusing second, because the middleware builds the client on every request and a wrong guess would return 500 on every page.
- **A gate that was not real:** a "no warning in the production logs" answer came before that release was deployed; `/api/health` still reported the old commit. The rows were reopened (#154) and the deploys ordered: warn-only, a real log check, then the refusing release (now live). Lesson: verify a gate against the deployed version.

## Artifacts

| Block               | Artifact                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------- |
| L2 repo map         | `context/map/repo-map.md` (+ `context/map/evidence/`)                                    |
| L3 research         | `context/archive/2026-10-01-testing-push-to-page-integration/research.md`                |
| L4 refactoring plan | `context/archive/2026-10-06-refactor-push-boundary/plan.md`, `plan-brief.md`, `reviews/` |
| L5 domain notes     | `context/domain/domain-distillation.md`, `glossary.md` (+ `evidence/`)                   |
