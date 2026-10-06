# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Name every prerequisite outside the repo

- **Context:** `docs/prerequisites.md`; F-05 `solar-forecast-source` (2026-09-26).
- **Problem:** The PV forecast was missing for two months because a Home Assistant integration existed only in a UI config that was lost in a host move, and nothing listed it as a dependency. The live LLM order (cloud first) also differed from what the PRD assumed.
- **Rule:** Every plan lists the external prerequisites its change needs: Home Assistant integrations and their settings, lab jobs, LLM provider and model configuration, secrets and where they live, one-time production steps. The change updates `docs/prerequisites.md` in the same PR. Settings that exist only in a UI are also recorded in homelab-2's inventory.
- **Applies to:** every change that reads new lab data, adds a contract section, depends on an LLM, or needs a manual production step.

## Keep the project docs in step with the code

- **Context:** `docs/architecture.md`, `docs/logic.md`, `docs/decisions.md` (2026-09-26); the project is also a course submission read on GitHub.
- **Problem:** Rules and decisions lived only in plans, reviews and conversations, so a reader of the repository could not follow how the app reasons or why it is built this way.
- **Rule:** A change that adds or alters a rule or threshold updates `docs/logic.md`; a change that makes a product or technical decision adds a dated entry to `docs/decisions.md`; a change to the data flow, security model or LLM roles updates `docs/architecture.md`. Planned rules move from "planned" to the built sections when their slice is archived.
- **Applies to:** every change in this repository, reviewed in `/10x-impl-review`.

## Plan before implementing, even straight after research

- **Context:** `context/archive/2026-09-26-usage-norm-scale/` (plan.md written retrospectively; reviews/impl-review.md F2).
- **Problem:** After `/10x-research`, an "implement" request went straight to code. The research's open questions were settled by the agent's defaults instead of the owner, there was no plan review, no Progress or manual-check list, and the review later found edge-case issues (rounded kWh against range edges, +40% wording) a plan review would likely have caught.
- **Rule:** An "implement" request after research goes through `/10x-plan` (a short plan is fine), `/10x-plan-review` and `/10x-implement`. Before planning, the open questions in research.md are put to the owner; a default is used only when the owner explicitly says so, and the plan records which were defaults.
- **Applies to:** every change in this repository, including small, single-card changes.

## A safety guard that exists as copies is fixed in all copies at once

- **Context:** `tests/e2e/support/env.ts`, `tests/integration/support/stack.ts` and `privileged.ts`; implementation review of `e2e-alert-rules`, findings F1 and F7 (2026-10-06).
- **Problem:** The guard that keeps a test run from touching a non-local database exists in more than one copy. A flaw (the pg driver lets a `?host=` query parameter override the host the guard had checked) sat in two copies unnoticed until a review of the newest one.
- **Rule:** A safety guard that is copied is changed in every copy in the same change and covered by one shared test table; when a further copy is about to be written, extract a shared pure module instead.
- **Applies to:** every guard that stops a test run or script from reaching a non-local database or a secret key.

## Do not rely on GitHub's scheduler for anything that must be regular

- **Context:** alert-rules Phase 4 (2026-10-06); `docs/decisions.md`, "alert trigger".
- **Problem:** The `*/10` alerts workflow produced no run in about 80 minutes after the deploy, and the weekly mutation run had started almost 7 hours after its slot. The plan had assumed delays of a few minutes.
- **Rule:** A trigger that must be regular (alerts, health pings) runs on a host we control (a compose service or cron). GitHub's schedule is for non-urgent work, and a plan that uses it names the first scheduled run as a verification step.
- **Applies to:** every change that adds a scheduled workflow or depends on one for timeliness.
