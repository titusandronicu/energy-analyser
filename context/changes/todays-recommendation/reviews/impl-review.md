<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Today's Recommendation

- **Plan**: context/changes/todays-recommendation/plan.md
- **Scope**: Full plan; all automated rows complete, manual rows 1.5, 2.4, 3.2–3.4 open
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated: `npm test` 66/66, lint clean, `astro check` 0 errors; CI smoke on #14 proved push → dashboard. Production (2026-09-25): migration `20260923150859_owner_read_recommendations` applied, owner row inserted, RLS simulated (owner reads own row; another signed-in user reads nothing). The security advisor no longer lists `recommendations` or `app_owners`.

## Findings

### F1 — LLM Markdown would show as raw symbols

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/RecommendationCard.astro (text paragraph)
- **Detail**: The card renders `text` as plain text with `whitespace-pre-line`, which is correct for safety. But the lab's prompt asks for "maksymalnie 3 obserwacje, 3 sprawdzenia na jutro i brakujące dane" (homelab-2 `run-energy-advisory.py`, `concise_prompt`). Models answer that with Markdown (`**Obserwacje:**`, `- …`, `1. …`), which would appear on the dashboard as literal asterisks and dashes.
- **Fix A ⭐ Recommended**: Render a tiny safe subset server-side (paragraphs, `-`/`1.` lists, `**bold**`), escaping everything else
  - Strength: Readable structure while keeping HTML injection impossible (no raw HTML passthrough).
  - Tradeoff: A small formatter with unit tests; subset rules to maintain.
  - Confidence: MED — depends on the real lab output, which hasn't reached production yet.
  - Blind spot: Actual gemma/HA output format not yet seen.
- **Fix B**: Strip Markdown markers (`**`, leading `-`/`#`) and keep plain text
  - Strength: Trivial and safe.
  - Tradeoff: Loses list structure; long answers become a wall of text.
  - Confidence: HIGH — simple string handling.
  - Blind spot: Numbered lists or tables in the output.
- **Decision**: FIXED via Fix A — src/lib/format/advice-markdown.ts (+9 tests) renders paragraphs, -/1. lists, headings and **bold** as structured, escaped text; verified on a local dashboard (lists/bold rendered, <script> shown escaped)

### F2 — The lab's narration isn't a "battery setting for today"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: homelab-2 infra/compose/energy-app/scripts/run-energy-advisory.py (concise_prompt)
- **Detail**: FR-005 and the north star ask for "a plain-language battery-setting recommendation for today". The lab's prompt asks for up to 3 observations, 3 checks for tomorrow and missing data, a general advisory. The app shows whatever the lab sends, so the north star can be met technically while the content answers a different question.
- **Fix A ⭐ Recommended**: In homelab-2, add a dedicated first line to the prompt, for example "Najpierw jedno zdanie: zalecane ustawienie baterii na dziś (rezerwa, ładowanie z sieci) i dlaczego", followed by the rest
  - Strength: Meets FR-005 without app changes; the card shows the recommendation first.
  - Tradeoff: A homelab-2 prompt change that also affects the lab's own page.
  - Confidence: MED — LLM compliance needs checking on real output.
  - Blind spot: How HA conversation, gemma and OpenRouter each follow it.
- **Fix B**: Accept the general advisory for v1 and record FR-005 as partially met
  - Strength: No change.
  - Tradeoff: The main screen may not answer "what should the battery do today?".
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — homelab-2 PR #17: the advisory prompt leads with one sentence on today's battery setting

### F3 — Narration text is derived from private lab memory

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: homelab-2 run-energy-advisory.py (prompt includes PGE anomalies, cross-check and hourly memory)
- **Detail**: The push contract keeps raw PGE rows out, but the narrated text is free text generated from private summaries and is shown in a public app. The app can't validate its content. The risk is low (single owner, authenticated page), but the "raw data never leaves the lab" guardrail now depends on the prompt.
- **Fix**: Add to the lab prompt: "Nie podawaj identyfikatorów, numerów PPE/klienta ani surowych odczytów godzinowych", and mention it in homelab-2 runbooks/energy-analyser-push.md.
- **Decision**: FIXED — same homelab-2 PR #17: the prompt forbids identifiers and raw hourly readings; push runbook notes the guardrail

### F4 — Evidence exists for two unticked manual rows

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/todays-recommendation/plan.md (Progress 1.5, 3.2)
- **Detail**: 1.5 was verified in the local DB on 2026-09-23 (owner 1 row, non-owner 0, anon denied). 3.2 was done in production on 2026-09-25 (migration applied, owner row inserted, RLS simulated). Both are still unticked.
- **Fix**: Tick 1.5 and 3.2, citing this review.
- **Decision**: FIXED — Progress 1.5 and 3.2 ticked with the evidence cited in this report
