---
project: energy-analyser
researched_at: 2026-09-17
recommended_platform: "Micr.us VPS (self-hosted Docker Compose)"
runner_up: "Cloudflare Workers"
context_type: mvp
tech_stack:
  language: TypeScript
  framework: "Astro 7 + React 19"
  runtime: "Node.js 22, Docker Compose"
---

## Recommendation

**Deploy on the existing Micr.us VPS with Docker Compose.**

This is the user's accepted choice after comparing six managed platforms plus AWS and self-hosting. It best fits the decisive project constraint: reliable access to Home Assistant/Deye and an optional local LLM without forcing a short-lived serverless function to cross the public internet for every refresh. It should also keep incremental hosting cost minimal because the server already exists. The trade-off is explicit: the owner, not a managed platform, is responsible for patching, monitoring, backups, TLS and recovery.

Use Tailscale between Micr.us and the home network. Do not expose Home Assistant, Ollama or a NAS management interface directly to the public internet. Keep Supabase managed and use OpenRouter as an LLM fallback.

## Existing home-lab data plane (reviewed 2026-09-23)

This plan was written as if the data sources would be new integrations. They already run in the home lab (see [existing-system.md](existing-system.md)): Home Assistant with the Deye inverter, PGE import and bill math, a 5-minute refresh job, SQLite history, and the lab analyser's LLM provider chain (HA conversation → local Ollama → OpenRouter). Consequences for this plan:

- **The private path isn't ready.** Home Assistant, the history store and the analyser are LAN-only. Ollama is bound to localhost on its host. The home lab's only Tailscale node today is the legacy NAS that is being retired, and Tailscale for the new platform is still planned. The "Micr.us → Tailscale → HA/LLM" link in *Getting Started* step 4 has nothing to connect to yet.
- **Local LLM is the running primary, not a fallback.** OpenRouter is opt-in escalation in the existing system. If the VPS keeps OpenRouter as the default, recommendation text will differ from what the lab page produces from the same facts.
- **Much of the pipeline already exists.** The daily ingestion and pre-compute job in this plan duplicates the home-lab refresh pipeline. The cheaper option is to pull its public-safe aggregates, which were designed to leave the private store, rather than re-collecting from HA.
- **Hosting at home is an option.** Running the app inside the home lab removes the VPS-to-home trust path entirely, at the cost of a public URL. A public URL is only a "nice to have" for 10xDevs certification.

## Platform Comparison

| Platform | CLI-first | Managed / serverless | Agent-readable docs | Stable deployment API | MCP / agent integration | Project fit |
|---|---|---|---|---|---|---|
| Micr.us VPS | Pass | Fail | Partial | Pass | Partial | **Selected: existing server, persistent Node and private HA path** |
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | Best managed alternative; exact current adapter, but event-driven runtime |
| Netlify | Pass | Pass | Pass | Pass | Pass | Good DX; adapter change and 30-second scheduled-function limit |
| AWS Amplify + Lambda | Partial | Pass | Pass | Pass | Partial | Low usage cost, but community Astro adapter and IAM complexity |
| Vercel | Pass | Pass | Pass | Pass | Partial | Requires Vercel adapter; Hobby cron and rollback caveats |
| Railway | Pass | Pass | Pass | Partial | Pass | Persistent runtime and cron, but approximately $5/month minimum |
| Render | Pass | Pass | Pass | Pass | Pass | Persistent runtime; practical web + cron baseline is higher |
| Fly.io | Pass | Partial | Pass | Pass | Partial | Persistent process, but more container and scheduling operations |

Micr.us passes the operational CLI test because routine work is scriptable through SSH, Git and Docker Compose. It fails the managed-platform criterion by design: OS lifecycle, firewall, reverse proxy, TLS, capacity and recovery are owner-operated. Documentation quality depends on the selected components rather than one platform manual. Deployment is deterministic when image tags or digests and a versioned Compose file are used. Agent integration is through standard SSH/Docker tooling rather than a first-party platform MCP.

Cloudflare Workers is the strongest managed runner-up. The current `@astrojs/cloudflare` and Wrangler configuration are already aligned with it, Cron Triggers cover the daily job, and low traffic should fit the free tier. It lost because the project owner prefers the HA-facing compute to be persistent and under their control.

Netlify offers excellent CLI and agent integration, but requires an adapter migration and its scheduled functions have a 30-second ceiling. AWS can run the workload cheaply through Amplify, Lambda and EventBridge, but requires a community Astro adapter and materially more IAM and service configuration. Vercel also requires an adapter change and cannot host an always-on collector. Railway, Render and Fly.io support persistent Node services, but add a new paid provider despite an existing VPS.

Research references: [Cloudflare Astro deployment](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/), [Cloudflare cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/), [AWS Astro SSR](https://docs.aws.amazon.com/amplify/latest/userguide/server-side-rendering-amplify.html), [AWS EventBridge Scheduler](https://aws.amazon.com/eventbridge/scheduler/), [Vercel Astro](https://vercel.com/docs/frameworks/frontend/astro), [Railway Astro](https://docs.railway.com/guides/astro), [Render Astro](https://render.com/docs/deploy-astro), [Fly.io Astro](https://fly.io/docs/js/frameworks/astro/), and [Astro Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/).

### Shortlisted Platforms

#### 1. Micr.us VPS (Recommended)

It reuses an existing paid asset, supports a persistent Node.js process and daily jobs without function-duration limits, and can reach HA and the local LLM over Tailscale. It also keeps the public application outside the home network. Its weakness is operational ownership.

#### 2. Cloudflare Workers

It is the lowest-friction managed option and matches the original starter exactly. Choose it if maintaining the VPS becomes burdensome or if the HA integration is later changed to push snapshots into Supabase independently.

#### 3. AWS Amplify + Lambda/EventBridge

It offers inexpensive serverless execution and strong scheduling, using an account the owner already has. It ranks third because migrating the Astro runtime and maintaining IAM, Amplify, Lambda, EventBridge and CloudWatch is disproportionate for a single-user MVP.

## Anti-Bias Cross-Check: Micr.us VPS

### Devil's Advocate — Weaknesses

1. The VPS is a single point of failure; platform, kernel, disk or provider incidents stop both the UI and scheduled work.
2. Security patching, firewall rules, TLS renewal, Docker lifecycle and capacity alarms are the owner's responsibility.
3. A private link from the public VPS to the home network creates a sensitive trust path. An over-broad Tailscale ACL could expose more than HA and the local LLM.
4. A container rollback does not reverse Supabase migrations, corrupted history or rotated secrets.
5. The existing Astro Cloudflare adapter cannot be used for a persistent Node server; the adapter and deployment verification must change together.

### Pre-Mortem — How This Could Fail

Six months after launch, the app stopped refreshing recommendations even though its public page still loaded. The Node container had restarted after a VPS update, but the scheduler process did not return because its restart policy and health check covered only the web process. No freshness alert existed, so stale telemetry appeared current for several days. Earlier, the Tailscale policy had been written for convenience and allowed the VPS to reach the entire home subnet rather than only the HA and LLM ports. A dependency vulnerability in the public service therefore created a much larger blast radius than intended. When a new image failed, the operator attempted a rollback, but the Compose file referenced a mutable `latest` tag and the previous artifact could not be reproduced. Supabase schema changes had also been applied separately and were incompatible with the old image. Backups existed only on the VPS disk and had never been restored in a rehearsal. The decision failed not because self-hosting was technically unsuitable, but because the team treated an unmanaged server like a managed platform. Pinned images, least-privilege networking, separate scheduler health, freshness alerts, off-host backups and rehearsed rollback would have prevented the incident.

### Unknown Unknowns

- Micr.us resource limits, snapshot policy, outbound filtering and provider recovery process must be verified before production deployment.
- Tailscale subnet routing is unnecessary and riskier if direct device-to-device access to explicit ports will work.
- Astro's Node adapter behavior differs from the current Cloudflare adapter; middleware, environment access and smoke tests must be revalidated.
- Local LLM latency and memory pressure can delay a scheduled job; the job needs a hard timeout and OpenRouter fallback.
- DNS and TLS ownership must be documented so recovery does not depend on an undocumented dashboard account.

## Operational Story

- **Preview deploys**: pull-request CI builds and tests the image but does not expose it publicly. If a live preview is required, run a separately named Compose project on a non-production hostname protected by authentication; fork PRs never receive deployment secrets.
- **Secrets**: production values live in a root-readable environment file or Docker secrets on Micr.us and in GitHub Environment secrets for deployment. HA, Tailscale, Supabase and LLM tokens are individually scoped. They are never committed or embedded in Compose YAML. Rotation is manual and followed by `docker compose up -d` plus a smoke test.
- **Rollback**: deploy immutable image tags keyed by Git SHA. Roll back with `docker compose pull && docker compose up -d` after changing the approved image tag to the preceding SHA. Target recovery is under five minutes. Database migrations require a separately reviewed forward-fix or tested down migration.
- **Approval**: CI may build, scan and publish images automatically. A human approves production deployment, network/ACL changes, primary secret rotation, database migrations and destructive actions.
- **Logs**: read application and scheduler output with `docker compose logs --since=1h --timestamps app scheduler`; inspect health with `docker compose ps`. Provide read-only monitoring where possible and send freshness/health alerts to the existing monitoring system.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| VPS or container outage | Pre-mortem | M | H | Restart policies, health checks, external uptime monitor and documented provider recovery |
| Over-broad VPS-to-home access | Devil's advocate | M | H | Tailscale ACL restricted to exact HA/LLM devices, ports and service identity |
| Silent stale telemetry | Pre-mortem | M | H | Store `last_success_at`, show staleness in UI and alert when refresh misses its SLA |
| Irreproducible rollback | Pre-mortem | M | H | Pin image by Git SHA/digest; retain several known-good images and test rollback |
| Database migration incompatible with rollback | Devil's advocate | M | H | Backward-compatible migrations, pre-deploy backup and separate migration approval |
| VPS secrets exposed | Research finding | L | H | Root-readable files/Docker secrets, scoped tokens, no secrets in repo or logs |
| Local LLM unavailable or slow | Unknown unknowns | M | M | Timeout, bounded retries, verified facts bundle and OpenRouter fallback |
| Supabase/OpenRouter internet outage | Research finding | M | M | Cache last good state, degrade visibly and retry asynchronously |
| Micr.us resource limit unknown | Unknown unknowns | M | M | Confirm CPU/RAM/disk/backup limits and run a load/soak check before launch |
| Unpatched host or dependencies | Devil's advocate | M | H | Monthly patch window, automated vulnerability scan and explicit upgrade runbook |
| No remote path from VPS to home lab yet | Existing-system review | H | H | Decide hosting location first; if VPS, stand up Tailscale on the new platform with an ACL scoped to one read-only endpoint |
| Duplicate pipeline drifts from the lab analyser | Existing-system review | M | M | Consume the lab analyser's public-safe aggregates/facts bundle instead of re-deriving them |

## Getting Started

1. Confirm Micr.us provides a supported Linux release, Docker Engine/Compose, sufficient RAM/disk, snapshots and SSH-key access; record actual limits.
2. Replace `@astrojs/cloudflare` with the version-compatible `@astrojs/node` adapter in standalone mode, then make `npm run build` and the smoke flow pass against the Node artifact.
3. Add a multi-stage Dockerfile and Compose services for `app` and `scheduler`, using immutable image tags, health checks and `restart: unless-stopped`.
4. Connect Micr.us to the tailnet with an ACL that permits only the required HA and local-LLM endpoints; verify those endpoints are not publicly reachable.
5. Put Caddy or Traefik in front of the app, connect the production domain, inject scoped secrets, deploy with human approval, and verify HTTPS, auth, live HA data, stale-data behavior, scheduled refresh, LLM fallback, logs and rollback.

## Out of Scope

The following were not implemented by this research:

- Docker image and Compose configuration
- CI/CD pipeline configuration
- Production-scale multi-region availability or disaster recovery
- Changes to the Micr.us server, DNS, Tailscale ACLs or live secrets
