---
name: prerequisites-update
description: Keep docs/prerequisites.md in step with a change that adds or alters something outside this repo (HA integration, lab job, LLM setting, secret, one-time production step). Load when a change depends on anything the code does not set up.
---

# Prerequisites update

## When to use

- A new Home Assistant integration or entity, a lab job or `.env.llm` setting.
- A new secret, repository variable, token or env var.
- A migration or deploy that must happen in a given order, or a new tool on a dev machine (for example an MCP connector).

## Steps

1. Put the item in the matching section of `docs/prerequisites.md`: "Where things run", "Home Assistant integrations", "LLM configuration (lab)", "Secrets and where they live", "One-time production steps (app)", or "Prerequisites by roadmap item".
2. Name secrets by location only. No values, ever.
3. For ordered steps, say what breaks if the order is reversed (for example "the contract rejects unknown keys, so every push is refused with 422").
4. Change `CLAUDE.md` / `AGENTS.md` only if a command or env var they list changed. Keep both files identical.
5. Do it in the same PR as the code change (`context/foundation/lessons.md`).

## Check

- Every new env var is also in `.env.example` and in the Environment list of `CLAUDE.md`.
- A reader with only this file can reproduce the setup.
