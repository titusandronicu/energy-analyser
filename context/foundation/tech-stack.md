---
starter_id: 10x-astro-starter
package_manager: npm
project_name: energy-analyser
hints:
  language_family: js
  team_size: solo
  deployment_target: self-host
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
---

## Why this stack

A solo operator shipping a single-user energy-insight MVP keeps the existing agent-friendly Astro 7, React 19, TypeScript and Supabase foundation, but deploys it as a persistent Node.js service on the existing Micr.us server. Self-hosting removes the Cloudflare edge-runtime constraint from the daily HA/Deye ingestion and recommendation pipeline, and permits longer-running requests. (Superseded 2026-09-23: the app no longer connects to Home Assistant or the local LLM; the home lab pushes data to it. See below.) The Cloudflare adapter must be replaced with `@astrojs/node` in standalone mode; Docker Compose provides repeatable deployment, restart policy and health checks. Supabase remains the managed auth/PostgreSQL service. GitHub Actions keeps checks automatic, but production rollout and secret changes remain human-approved.

## Existing system and integration (2026-09-23)

HA ingestion, PGE parsing, deterministic advisory facts and LLM narration already run in the owner's home lab (Python + SQLite + local Ollama). This repo does not re-implement them. The home lab pushes public-safe snapshots, history aggregates and the narrated recommendation to an authenticated ingestion endpoint; this app stores them in Supabase and owns access control, feedback CRUD and the season-adjusted baseline and anomaly logic. As a result, `has_ai` is met by displaying lab-narrated output, and `has_background_jobs` needs no scheduler in this repo. See [existing-system.md](existing-system.md) and `infrastructure.md`.
