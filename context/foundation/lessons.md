# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Name every prerequisite outside the repo

- **Context:** `docs/prerequisites.md`; F-05 `solar-forecast-source` (2026-09-26).
- **Problem:** The PV forecast was missing for two months because a Home Assistant integration existed only in a UI config that was lost in a host move, and nothing listed it as a dependency. The live LLM order (cloud first) also differed from what the PRD assumed.
- **Rule:** Every plan lists the external prerequisites its change needs: Home Assistant integrations and their settings, lab jobs, LLM provider and model configuration, secrets and where they live, one-time production steps. The change updates `docs/prerequisites.md` in the same PR. Settings that exist only in a UI are also recorded in homelab-2's inventory.
- **Applies to:** every change that reads new lab data, adds a contract section, depends on an LLM, or needs a manual production step.
