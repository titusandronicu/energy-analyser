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
