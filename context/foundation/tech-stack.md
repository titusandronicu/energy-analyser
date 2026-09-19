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

A solo operator shipping a single-user energy-insight MVP keeps the existing agent-friendly Astro 7, React 19, TypeScript and Supabase foundation, but deploys it as a persistent Node.js service on the existing Micr.us server. Self-hosting removes the Cloudflare edge-runtime constraint from the daily HA/Deye ingestion and recommendation pipeline, permits longer-running jobs, and gives the server a private Tailscale path to Home Assistant and the optional local LLM. The Cloudflare adapter must be replaced with `@astrojs/node` in standalone mode; Docker Compose provides repeatable deployment, restart policy and health checks. Supabase remains the managed auth/PostgreSQL service, while OpenRouter is the fallback when the local model is unavailable. GitHub Actions keeps checks automatic, but production rollout and secret changes remain human-approved.
