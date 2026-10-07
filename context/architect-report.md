# Architecture report: Energy Analyser

Repository: `titusandronicu/energy-analyser`. History covered: 2026-09-14 to 2026-10-06 (3 weeks, 268 counted commits, one human author, 246 of 269 commits co-authored with an AI agent). The repo map has an addendum (section 8) for the 11 commits after its snapshot, mainly the alert-rules capability and the e2e layer.

## 1. The product in one paragraph

A single-owner web app (Astro 7 SSR, React 19, Supabase) for a home solar system. A home lab collects the data and writes the advice text, then pushes both to `POST /api/ingest`. The app signs the owner in, stores the push, applies its own season-aware rules and shows a live power flow, a daily battery recommendation, a bill forecast, a history calendar with ratings and day notes. It never controls any device.

## 2. Repo map (M4 L2): where the business lives and where it hurts

`context/map/repo-map.md` ranks 9 product capabilities (ingest, access, live-flow, bill, advice, history, ratings, notes, dashboard) plus platform, shared foundations and docs, by criticality times buzz from four evidence sources (git history, GitHub discussion, an import graph, authorship).

- **Risk zones (4):** the push boundary (contract plus the `ingest_push` SQL function), live flow (imported by 6 capabilities), sign-in and owner access (the only capability with real behaviour defects), and the Warsaw-time and value helpers every money and boundary decision rests on.
- **Watch:** bill forecast (money logic, one week old) and history (widest fan-out: its page imports 20 files).
- **Looks hot, is not:** platform CI churn, a flat 20-30% fix share (about 60% are planned review-fix rounds), 0 reverts, seven deliberate break-proof PRs, bot-only reviews, planning-doc churn.
- **Limits stated in the map:** 3 weeks of history, one author (every concentration is a baseline), SQL and RLS have no import graph.

## 3. Feature research (M4 L3)

`context/archive/2026-10-01-testing-push-to-page-integration/research.md` (three read-only agents plus spot checks) verified how the write path orders its checks, what each store section does with a replayed or older push, and which history-safety rules are enforced versus left open. It fed the test rollout and gave the refactoring its facts: the token was checked only after the body was validated, five latest-wins rules live only as upsert clauses, and five behaviours were pinned as KNOWN GAPs instead of fixed.

## 4. Domain notes (M4 L5): the language and the rules

`context/domain/domain-distillation.md` and the agent glossary `context/domain/glossary.md` were built from three independent agents (documents, code language, code rules) so agreement is real agreement.

- **43 terms** in the table: 15 Core, 28 Supporting; 5 are missing in code, all documented as planned. **Core subdomains:** advice and usage verdicts, and cost foresight.
- **Overloaded words** are the strongest drift: "complete" carries five rules, "norm" two computations, "state" six meanings.
- **35 rules** checked against the code: 19 enforced, 14 declared (soft, client-only or held by absence), 1 undocumented exposure, none ignored or contradicted. **14 drift rows:** 3 fixed in code, 8 in docs, 3 need a decision.
- **Ranking #1:** the push boundary. Its rules sit in a zod contract, a service and an SQL function redefined in five migrations; a direct RPC call skips the contract; anonymous callers saw validation details before any token check.

## 5. Refactoring plan (M4 L4) and what it did

Plan: `context/archive/2026-10-06-refactor-push-boundary/plan.md` (review: `reviews/plan-review.md`, 7 findings, all fixed before coding). Five phases, only one changes behaviour.

1. **Safety net first:** a golden replay and characterization tests, pinning today's behaviour including the five KNOWN GAPs.
2. **SQL restructure (pure):** `ingest_push` split into one helper per section in a non-exposed `ingest` schema; privileges proven with `has_function_privilege`, retention windows named once with a drift test.
3. **Service restructure (pure):** `handleIngest` as named stages in the same order; the JSON Schema stays byte-identical.
4. **Behaviour change:** the token is checked first through `ingest_token_ok`, so a bad token gets 401 whatever the body holds.
5. **Docs** in step with the code.

Evidence: CI green at every phase. A TypeScript-level break turned the new tests red locally. A database-level break (removing one upsert guard) turned the `integration` job red on exactly 2 of 62 tests. Production: both migrations applied with the Supabase CLI after a dry run, deploy approved and verified (`/api/health` reports the new release; the first lab push after it was stored with all sections).

## 6. What I would defend, and what is still open

- **Defend:** prove first and change second; one behaviour change isolated in its own phase; the decisions are recorded in `docs/decisions.md` (2026-10-06), including the rejected options.
- **Open, on purpose:** a direct RPC call with a valid token and an out-of-contract payload (for example a negative total) is still stored. The plan closes the token-order half of the exposure only; this is recorded as a follow-up, together with the five pinned KNOWN GAP behaviours.
- **Process lesson:** a draft PR was squash-merged while commits were still coming, so the plan's SHAs had to be repointed at archive time and the last ticks needed a follow-up PR.
- **Limits of the evidence:** three weeks and one author mean no trend can be trusted; lab-side rules are known only from `docs/logic.md`.

## Artifacts

| Block               | Artifact                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------- |
| L2 repo map         | `context/map/repo-map.md` (+ `context/map/evidence/`)                                    |
| L3 research         | `context/archive/2026-10-01-testing-push-to-page-integration/research.md`                |
| L4 refactoring plan | `context/archive/2026-10-06-refactor-push-boundary/plan.md`, `plan-brief.md`, `reviews/` |
| L5 domain notes     | `context/domain/domain-distillation.md`, `glossary.md` (+ `evidence/`)                   |
