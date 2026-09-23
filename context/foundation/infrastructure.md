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

Integrate with the home lab by **push, not pull**: the home lab sends public-safe data outbound to an authenticated ingestion endpoint on Micr.us, and nothing connects into the home network (decided 2026-09-23). Tailscale stays as an **optional** private channel between Micr.us and the home network for admin access and future on-demand features; the v1 data flow does not depend on it. Keep Supabase managed. Do not expose Home Assistant, Ollama or a NAS management interface to the public internet.

## Home-lab integration: push ingestion (decided 2026-09-23)

The data sources already run in the home lab ([existing-system.md](existing-system.md)): Home Assistant with the Deye inverter, PGE import and bill math, a 5-minute refresh job, SQLite history, and LLM narration (HA conversation → local Ollama → OpenRouter). They are LAN-only, and there is no production remote-access path into the home network. So the app does not reach in; the home lab pushes out.

```text
home lab (LAN-only)                                  Micr.us VPS (public)
HA + Deye ─► refresh job (every 5 min) ─► push ──HTTPS──► POST /api/ingest ─► Supabase
PGE CSV ─►   facts bundle + LLM narration      bearer token     (validate)     (RLS tables)
                                                                                   │
                                                             app pages ◄───────────┘
```

**What is pushed:** the current PV / battery / grid / load snapshot with its capture time; daily history aggregates for the baseline; the facts bundle and the narrated recommendation with provider and model; freshness per source.

**What never leaves the home lab:** PGE CSV files, customer/POD identifiers, hourly private readings, HA and LLM credentials.

**Design constraints for the ingestion change** (to settle in `/10x-plan`):

- Authenticate the push with a dedicated, rotatable bearer token that can only write ingestion data.
- Keep the repo's rule that no Supabase service-role key is used. The write path needs another mechanism: for example a `SECURITY DEFINER` function that checks the ingestion token, or a dedicated ingest user bound by RLS.
- Validate payloads with zod against a versioned contract, reject unknown fields, and cap payload size.
- Make pushes idempotent: re-sending the same capture time must not duplicate rows.
- The pushing side is a small addition to the home lab's existing refresh job (a homelab-2 change, not in this repo).

What this removes from the original plan: the app-side `scheduler` service and app-held HA/LLM credentials. Tailscale is kept, but moves from required data path to optional channel (below).

### Optional private channel: Tailscale via Micr.us

Micr.us joins the tailnet as an entry point into the home network from outside. It adds flexibility (operator access to lab UIs while away, on-demand refresh or drill-down queries later) without changing the push-based data flow. Rules:

- **Not on the critical path.** Every v1 feature works with Tailscale down. Anything that starts to depend on it must be decided explicitly and added to the risk register.
- **Tag-based ACL, least privilege.** Micr.us is a tagged node (e.g. `tag:vps`) allowed to reach only named home-lab hosts and ports. No subnet routing, no exit node, and no access from the home lab back to the VPS beyond what the push needs.
- **App isolation.** Tailscale runs on the VPS host; the public app container gets no tailnet access by default. A future feature that needs it gets its own narrowly scoped path.
- **Home-side prerequisite.** The new platform has no Tailscale node yet (the only one runs on the legacy NAS being retired). Setting it up is a homelab-2 change.


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

It reuses an existing paid asset, supports a persistent Node.js process and daily jobs without function-duration limits, and can receive pushes from the home lab at a stable HTTPS endpoint. It also keeps the public application outside the home network. Its weakness is operational ownership.

#### 2. Cloudflare Workers

It is the lowest-friction managed option and matches the original starter exactly. Choose it if maintaining the VPS becomes burdensome or if the HA integration is later changed to push snapshots into Supabase independently.

#### 3. AWS Amplify + Lambda/EventBridge

It offers inexpensive serverless execution and strong scheduling, using an account the owner already has. It ranks third because migrating the Astro runtime and maintaining IAM, Amplify, Lambda, EventBridge and CloudWatch is disproportionate for a single-user MVP.

## Anti-Bias Cross-Check: Micr.us VPS

### Devil's Advocate — Weaknesses

1. The VPS is a single point of failure; platform, kernel, disk or provider incidents stop both the UI and scheduled work.
2. Security patching, firewall rules, TLS renewal, Docker lifecycle and capacity alarms are the owner's responsibility.
3. A private link from the public VPS to the home network is a sensitive trust path. With the push model it is optional rather than required, but if Micr.us is compromised while on the tailnet, an over-broad ACL would expose more of the home network than intended. The ingestion token is a second, smaller trust path: if it leaks, an attacker can write fake data but cannot read the home network.
4. A container rollback does not reverse Supabase migrations, corrupted history or rotated secrets.
5. The existing Astro Cloudflare adapter cannot be used for a persistent Node server; the adapter and deployment verification must change together.

### Pre-Mortem — How This Could Fail

Six months after launch, the app stopped refreshing recommendations even though its public page still loaded. The Node container had restarted after a VPS update, but the scheduler process did not return because its restart policy and health check covered only the web process. No freshness alert existed, so stale telemetry appeared current for several days. Earlier, the Tailscale policy had been written for convenience and allowed the VPS to reach the entire home subnet rather than only the HA and LLM ports. A dependency vulnerability in the public service therefore created a much larger blast radius than intended. When a new image failed, the operator attempted a rollback, but the Compose file referenced a mutable `latest` tag and the previous artifact could not be reproduced. Supabase schema changes had also been applied separately and were incompatible with the old image. Backups existed only on the VPS disk and had never been restored in a rehearsal. The decision failed not because self-hosting was technically unsuitable, but because the team treated an unmanaged server like a managed platform. Pinned images, least-privilege networking, separate scheduler health, freshness alerts, off-host backups and rehearsed rollback would have prevented the incident.

### Unknown Unknowns

- Micr.us resource limits, snapshot policy, outbound filtering and provider recovery process must be verified before production deployment.
- How the home lab's push behaves across its own outages (buffer and resend vs. skip) decides whether history has gaps.
- Tailscale subnet routing is unnecessary and riskier than device-to-device access to explicit ports.
- Astro's Node adapter behavior differs from the current Cloudflare adapter; middleware, environment access and smoke tests must be revalidated.
- Local LLM latency and memory pressure can delay the home lab's narration; the app must show the last narrated recommendation with its age rather than wait.
- DNS and TLS ownership must be documented so recovery does not depend on an undocumented dashboard account.

## Operational Story

- **Preview deploys**: pull-request CI builds and tests the image but does not expose it publicly. If a live preview is required, run a separately named Compose project on a non-production hostname protected by authentication; fork PRs never receive deployment secrets.
- **Secrets**: production values live in a root-readable environment file or Docker secrets on Micr.us and in GitHub Environment secrets for deployment. Supabase keys and the push-ingestion token are individually scoped; HA and LLM credentials stay in the home lab. They are never committed or embedded in Compose YAML. Rotation is manual and followed by `docker compose up -d` plus a smoke test.
- **Rollback**: deploy immutable image tags keyed by Git SHA. Roll back with `docker compose pull && docker compose up -d` after changing the approved image tag to the preceding SHA. Target recovery is under five minutes. Database migrations require a separately reviewed forward-fix or tested down migration.
- **Approval**: CI may build, scan and publish images automatically. A human approves production deployment, network/ACL changes, primary secret rotation, database migrations and destructive actions.
- **Logs**: read application output with `docker compose logs --since=1h --timestamps app`; inspect health with `docker compose ps`. Provide read-only monitoring where possible and send freshness/health alerts to the existing monitoring system, including an alert when home-lab pushes stop.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---:|---:|---|
| VPS or container outage | Pre-mortem | M | H | Restart policies, health checks, external uptime monitor and documented provider recovery |
| Ingestion token leaked or over-privileged | Push-model review | L | M | Write-only token scoped to ingestion; rotate on suspicion; rate-limit and size-cap the endpoint; audit rows by source |
| Silent stale telemetry | Pre-mortem | M | H | Store `last_success_at`, show staleness in UI and alert when refresh misses its SLA |
| Irreproducible rollback | Pre-mortem | M | H | Pin image by Git SHA/digest; retain several known-good images and test rollback |
| Database migration incompatible with rollback | Devil's advocate | M | H | Backward-compatible migrations, pre-deploy backup and separate migration approval |
| VPS secrets exposed | Research finding | L | H | Root-readable files/Docker secrets, scoped tokens, no secrets in repo or logs |
| Home-lab push stops silently | Push-model review | M | H | Store `last_push_at` per source; staleness indicator in the UI; external uptime check alerts when pushes miss their window |
| Supabase or home-lab internet outage | Research finding | M | M | Cache last good state, degrade visibly and retry asynchronously |
| Micr.us resource limit unknown | Unknown unknowns | M | M | Confirm CPU/RAM/disk/backup limits and run a load/soak check before launch |
| Unpatched host or dependencies | Devil's advocate | M | H | Monthly patch window, automated vulnerability scan and explicit upgrade runbook |
| Over-broad VPS-to-home access via Tailscale | Devil's advocate | L | H | Tag-based ACL to named hosts/ports only; no subnet routing; app container kept off the tailnet; review ACL on every change |
| Private data leaks through the push payload | Push-model review | L | H | Versioned allow-list payload contract; reject unknown fields; the home lab sends aggregates only |
| Duplicate pipeline drifts from the lab analyser | Existing-system review | M | M | Consume the lab analyser's public-safe aggregates/facts bundle instead of re-deriving them |

## Getting Started

1. Confirm Micr.us provides a supported Linux release, Docker Engine/Compose, sufficient RAM/disk, snapshots and SSH-key access; record actual limits.
2. Replace `@astrojs/cloudflare` with the version-compatible `@astrojs/node` adapter in standalone mode, then make `npm run build` and the smoke flow pass against the Node artifact.
3. Add a multi-stage Dockerfile and a Compose `app` service, using immutable image tags, health checks and `restart: unless-stopped`. No separate scheduler is needed: the home lab pushes data in.
4. Add the `/api/ingest` endpoint and its Supabase tables and policies, issue the ingestion token, then extend the home lab's refresh job to push. Verify that raw PGE data and credentials never appear in payloads or logs.
5. Optional, independent of 4: once the home lab has a Tailscale node, join Micr.us as a tagged node with a least-privilege ACL and verify the app container cannot reach the tailnet.
6. Put Caddy or Traefik in front of the app, connect the production domain, inject scoped secrets, deploy with human approval, and verify HTTPS, auth, live HA data, stale-data behavior, scheduled refresh, LLM fallback, logs and rollback.

## Out of Scope

The following were not implemented by this research:

- Docker image and Compose configuration
- CI/CD pipeline configuration
- Production-scale multi-region availability or disaster recovery
- Changes to the Micr.us server, DNS, Tailscale ACLs or live secrets
