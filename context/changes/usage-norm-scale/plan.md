# Usage Norm as a Median, with Ranges and a Sense of Scale — Implementation Plan

> **Retrospective plan (written 2026-09-26, after the fact).** This change went from `/10x-research` straight to implementation in a conversation with the owner (PR #42, merged as 19f3686), skipping `/10x-plan`, `/10x-plan-review` and `/10x-implement`. This file records what the owner approved and what was built, so `/10x-impl-review` and `/10x-archive` can run on the normal path. The decisions below come from `research.md` and the owner's answers on 2026-09-26; nothing here was changed after the code landed except this note.

## Overview

The "Co to znaczy?" section on the usage card explains words, not numbers (roadmap open question 4, raised after S-14). Replace it on the usage card with the meaning of the day: the day's kWh, the norm in kWh, and low / normal / high / very high ranges from the home's own history. Compute the norm as the median instead of the mean. Add a comparison with a typical Polish ~140 m² heat-pump house as context only.

## Current State Analysis

See `research.md`. In short: the norm is the arithmetic mean of the baseline days (`src/lib/services/usage-insight.ts:65,168-169`), chosen by default with no recorded reason; the badge and deltas use ±15% / +40% against it; the card shows glossary terms `kwh`, `norm`, `grid_import` (`src/components/UsageInsightCard.astro:63`). On production data the mean and median disagree on 3 of 19 compared days, all because of inconsistent rows from 2026-07-26 to 2026-08-03.

## Desired End State

The usage card's badge, "wobec normy" deltas and a new "Co to znaczy?" block all read against one median norm. The block states the day's kWh, the norm, four kWh ranges whose edges are the badge thresholds (so the marked range always matches the badge), a one-line verdict, what grid purchase means, and the typical heat-pump house's use in that month, labelled as an estimate.

### Owner decisions (2026-09-26)

- Median replaces the mean everywhere (load badge, load delta, purchase delta, ranges) — accepted from the research recommendation.
- "Co to znaczy?" shows the meaning of the day instead of the glossary.
- Ranges come from the home's own history only; the public figure is context, never part of the norm.
- The house has an air-source heat pump; the reference is a ~140 m² heat-pump house.
- Defaults taken where the owner did not answer the research's open questions: keep "not enough data" below 7 own days (FR-019); median also for purchase; show the comparison line; wording "Zwykle zużywa … — to mediana z …".

### Owner confirmation of the defaults (2026-09-26, during the implementation review, F2)

- Comparison line: keep — confirmed.
- Purchase delta against the median: keep — confirmed.
- Wording "Zwykle zużywa … — to mediana z …": keep — confirmed.
- Fewer than 7 own days: **changed** — the owner wants the typical-house ranges shown, marked as an estimate, instead of "not enough data". This alters FR-019, so it is a follow-up change with its own plan (see `follow-ups/review-fixes.md`), not part of this one.

## What We're NOT Doing

- Blending the public estimate into the norm (it would mark ordinary days as above the norm; see research).
- Seasonal or degree-day adjustment of the norm for the autumn heating ramp (a later slice; S-17 already has to check this).
- Correcting or excluding the inconsistent rows from 2026-07-26 to 2026-08-03 (a homelab-2 follow-up).
- Changing thresholds, windows or minimum-data rules.
- Changing the other cards or their glossary blocks.

## Phase 1: Median norm and ranges in the view model

### Changes Required:

#### 1. Median and bands

**File**: `src/lib/services/usage-insight.ts`

**Intent**: Replace `mean()` with an exported `median()` (mean of the two middle values for an even count). Derive the band (low / normal / high / very_high) from the same thresholds as the badge and map it to the existing status labels. Add `meaning: UsageMeaning | null` to the insight view: norm label, band, four range labels, and the reference sentence; `null` when the norm is 0.

#### 2. Reference figures

**File**: `src/lib/format/reference-usage.ts` (new)

**Intent**: Monthly kWh/day for a typical ~140 m² Polish heat-pump house (29, 28, 24, 20, 15, 11, 10, 11, 13, 18, 24, 28) with sources in a comment, and the Polish comparison sentence for a given day.

#### 3. Tests

**File**: `src/lib/services/usage-insight.test.ts`

**Intent**: Cover a skewed baseline, an even count, a zero purchase median, range/badge agreement at each threshold, the month in the comparison, a zero norm, and `median()`; rename "mean" in existing test names.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint and types pass: `npm run lint`, `npx astro check`
- Build passes: `npm run build`

## Phase 2: Card, glossary and docs

### Changes Required:

#### 1. Usage card

**File**: `src/components/UsageInsightCard.astro`

**Intent**: Replace the glossary block with the meaning of the day when `meaning` is present (keep the glossary when it is `null`); say "mediana z" instead of "średnia z" in both baseline notices.

#### 2. Glossary

**File**: `src/lib/format/glossary.ts`

**Intent**: The `norm` explanation describes the median in plain words.

#### 3. Docs

**Files**: `docs/logic.md`, `docs/decisions.md`

**Intent**: Usage insight rules describe the median norm, the ranges and the comparison line (lessons.md "Keep the project docs in step with the code"); a dated decision records the median choice and why the public figure stays out of the norm.

### Success Criteria:

#### Automated Verification:

- CI passes on the PR (lint, tests, types, build, smoke)

#### Manual Verification:

- The owner opens the dashboard on a phone and finds the "Co to znaczy?" text on the usage card understandable, with the marked range matching the badge

## Phase 3: Implementation-review fixes

Added 2026-09-26 after `/10x-impl-review` (`reviews/impl-review.md`) and `/10x-plan-review` (`reviews/plan-review.md`).

### Changes Required:

#### 1. Edge-safe figures

**File**: `src/lib/services/usage-insight.ts`, `src/lib/services/usage-insight.test.ts`

**Intent**: The day's kWh shows two decimals when one decimal would print a range edge it is not on (review F1); `deltaLabel` shows one decimal at +40% as it does at ±15% (F4). Edge tests for both.

#### 2. Meaning text in the view model

**File**: `src/lib/services/usage-insight.ts`, `src/components/UsageInsightCard.astro`, `src/lib/format/glossary.ts`

**Intent**: Range names and the verdict sentence move into `UsageMeaning` and are tested (F5); wording and screen-reader fixes, and `class:list={cn(...)}` (F6, F9).

#### 3. Docs in step

**Files**: `docs/logic.md`, `context/foundation/prd-v3.md`, `context/foundation/roadmap.md`, `context/foundation/lessons.md`, `src/lib/format/reference-usage.ts`, this change's `research.md`, `change.md`, `follow-ups/review-fixes.md`

**Intent**: Sources and the monthly table for the reference figures, "median" in the S-17/S-20 planned rules, neutral "norm" in the PRD, roadmap open question 4 partly answered, the lesson from review F2, and the follow-ups (F3, F7, F8).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint, types and build pass: `npm run lint`, `npx astro check`, `npm run build`

## References

- Research: `context/changes/usage-norm-scale/research.md`
- PR: https://github.com/titusandronicu/energy-analyser/pull/42 (merged as 19f3686)
- Earlier slice: `context/archive/2026-09-25-seasonal-usage-insight/plan.md`, `context/archive/2026-09-26-data-period-transparency/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Median norm and ranges in the view model

#### Automated

- [x] 1.1 Median, bands and meaning in the usage view model — f1f0c25
- [x] 1.2 Typical heat-pump house reference figures — f1f0c25
- [x] 1.3 Unit tests for median, ranges and reference — f1f0c25
- [x] 1.4 Unit tests pass — f1f0c25
- [x] 1.5 Lint and types pass — f1f0c25
- [x] 1.6 Build passes — f1f0c25

### Phase 2: Card, glossary and docs

#### Automated

- [x] 2.1 Usage card shows the meaning of the day — f1f0c25
- [x] 2.2 Glossary and baseline wording say median — f1f0c25
- [x] 2.3 logic.md and decisions.md updated — f1f0c25
- [x] 2.4 CI passes on the PR — f1f0c25

#### Manual

- [ ] 2.5 Owner reads the usage card on a phone

### Phase 3: Implementation-review fixes

#### Automated

- [x] 3.1 Edge-safe kWh and percentage figures
- [x] 3.2 Meaning text in the view model
- [x] 3.3 Docs in step
- [x] 3.4 Unit tests pass
- [x] 3.5 Lint, types and build pass
