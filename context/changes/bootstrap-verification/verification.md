---
bootstrapped_at: 2026-09-15T12:32:15Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: energy-analyser
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: energy-analyser
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: true
```

### Why this stack

A solo operator shipping a single-user energy-insight MVP in 3 after-hours weeks needs a battle-tested, agent-friendly starter that handles auth and a database out of the box rather than assembling them from scratch. 10x Astro Starter is the recommended default for `(web, js)`, clears all four agent-friendly gates, and its Supabase layer covers the access-key login (FR-001) and the feedback CRUD surface (FR-007–010) directly. AI is in scope (FR-005 LLM narration over a deterministic facts bundle) and background jobs are in scope (the daily refresh pipeline for the historical baseline and recommendation, per the Non-Functional Requirements) — the latter is a known friction point on Cloudflare's edge runtime and will need a queue or external worker alongside the app rather than an inline cron. Payments and realtime are out of scope. CI runs on GitHub Actions with auto-deploy-on-merge, matching a solo-operator workflow; deployment stays on the starter's Cloudflare Pages default.

## Pre-scaffold verification

| Signal      | Value                                                 | Severity | Notes                                                        |
| ----------- | ------------------------------------------------------ | -------- | ------------------------------------------------------------- |
| npm package | not run                                                 | n/a      | `cmd_template` starts with `git clone`; no npm CLI to check   |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12T21:16:08Z | fresh    | from card `docs_url`                                          |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 21 (`.env.example`, `.github`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `AGENTS.md`, `astro.config.mjs`, `CLAUDE.md`, `components.json`, `eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`, `README.md`, `scripts`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: append-merged (cwd's `.DS_Store` kept first, scaffold's dedupe-checked patterns appended under a `# from 10x-astro-starter` separator)
**.bootstrap-scaffold cleanup**: deleted (including the cloned `.git/`, removed before move-up so upstream starter history did not leak into this project)

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: not applicable — 0 findings across 804 total dependencies (377 prod, 269 dev, 167 optional)

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

None.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                     | Value              |
| ------------------------ | ------------------- |
| bootstrapper_confidence  | first-class          |
| quality_override         | false                |
| path_taken               | standard             |
| self_check_answers       | null                 |
| team_size                | solo                 |
| deployment_target        | cloudflare-pages     |
| ci_provider              | github-actions       |
| ci_default_flow          | auto-deploy-on-merge |
| has_auth                 | true                 |
| has_payments             | false                |
| has_realtime             | false                |
| has_ai                   | true                 |
| has_background_jobs      | true                 |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history — this run only found an existing `.git/` at the project root and did not touch it.
- The scaffold ships its own `CLAUDE.md` / `AGENTS.md` (the latter a symlink to the former); these were not present in cwd before this run, so they moved in silently — review them against this project's own conventions.
- `has_background_jobs: true` combined with the Cloudflare edge runtime is a known friction point per the hand-off's "Why this stack" note — plan for a queue or external worker for the daily refresh pipeline rather than an inline cron.
- Address audit findings per your project's risk tolerance — this run's tree audited clean (0 findings).
