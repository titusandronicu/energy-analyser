# Existing System

Energy Analyser is a new application, but it is **not built on an empty field**. The data sources, billing logic and an advisory page with LLM narration already run in the owner's private home lab. This document records what exists, so planning builds on it instead of rebuilding it.

Recorded: 2026-09-23, from the private home-lab repository's inventory (last updated 2026-08-06). Public-safe summary: no addresses, hostnames, entity IDs or credentials. The authoritative details live in the private repo.

## What is already running

| Component | State | What it provides |
|---|---|---|
| **Home Assistant** | Live, production | Live PV / battery / grid / load telemetry. Deye inverter integrated via Solarman (local). HA conversation agent. The solar forecast integration was not recreated when HA moved hosts (~2026-07-21); see *Lab state (2026-09-25)*. |
| **Deye inverter** | Live | Telemetry through Home Assistant. Read-only settings snapshots (reserve, Grid Charge, Time-of-Use) are collected for analysis, never written. |
| **PGE billing data** | Live | PGE eBOK CSV import with validation (hourly readings, time-of-use aggregates), G11 tariff bill calculation, current-month bill forecast from daily grid import. |
| **Solar Energy Analyser** (lab page) | Live, lab status | Overview page (live energy, balance, bill and advisory status, stale data suppressed), PGE CSV upload, PGE vs Deye drift cross-check, advisory cards. Polish UI. |
| **Advisory / LLM logic** | Live, lab status | Deterministic rules build a facts bundle ("energy agent briefing"). LLM narration then runs through a provider chain: HA conversation agent → local Ollama (`gemma3:4b`) → OpenRouter (`gpt-4.1-mini`, opt-in). Includes a "Deye Expert" role backed by a curated knowledge pack. Advisory only, no write controls. |
| **Refresh pipeline** | Live | Scheduled job (every 5 minutes) collects the HA snapshot and Deye settings snapshot, rebuilds the briefing and appends history. |
| **History storage** | Live | Private SQLite: multi-month HA/Deye snapshot history plus PGE hourly readings. Public-safe JSON/JSONL cache (~90 days) and Markdown memory files for the UI and agents. |
| **Local LLM runtime** | Live | Ollama + Open WebUI in the home lab, bound to localhost only. |
| **Tailscale** | Live | The home lab's main host is a tailnet node (no subnet routes advertised, checked 2026-09-23). |

## What this means for Energy Analyser

Items the PRD and infrastructure plan treat as future work already exist in some form:

| Planned in Energy Analyser | Already exists | Implication |
|---|---|---|
| Live state from HA (FR-002) | HA telemetry + sanitized snapshot every 5 min | Consume it via push, don't re-collect it |
| Historical baseline (FR-003) | Multi-month SQLite history + PGE hourly readings | Cold start is smaller than assumed, but same-season year-ago data likely doesn't exist yet (history starts mid-2026), so the 30-day fallback is still needed |
| Deterministic advisory engine → facts bundle (FR-005) | Energy agent briefing | Resolved: the home lab's bundle is the source of truth and is pushed to the app (see *Integration decision*) |
| LLM narration (FR-005) | Provider chain HA → Ollama → OpenRouter, Polish output | Local LLM is primary, not "optional"; OpenRouter is the escalation, not the fallback |
| Weather-informed recommendation (FR-006) | Solar forecast in HA, forecast-accuracy tracking | A forecast source already exists |
| Daily refresh NFR | 5-minute refresh job | Already exceeds the daily-minimum requirement |
| Bill reconciliation (v2 non-goal) | PGE CSV import, PGE vs Deye cross-check, current-month bill forecast | Not a from-scratch v2; mostly a question of surfacing it |

What Energy Analyser adds that does **not** exist yet:

- A real access-controlled web app (the lab page has no login).
- Recommendation feedback CRUD (FR-007–010).
- A tested, CI-deployed, portfolio-grade codebase (the lab page is a static nginx prototype plus Python scripts).
- User-perspective tests and the 10xDevs workflow artifacts.

## Boundaries that stay

- Advisory only: nothing writes to Home Assistant, the inverter or battery schedules.
- PGE CSV is the financial source of truth; inverter telemetry is operational evidence.
- Raw PGE files, customer/POD identifiers, HA tokens and hourly private rows never leave the home lab. Only public-safe aggregates may reach this public repo or a public host.
- The home-lab services stay LAN-only. The only way in from outside is the optional Tailscale channel, restricted to named hosts and ports.

## Integration decision (2026-09-23)

**Push, not pull.** The home lab's refresh job sends public-safe data outbound to Energy Analyser's ingestion endpoint. No v1 feature depends on a connection into the home network. Tailscale via Micr.us is kept as an optional private channel (admin access, future on-demand features) under a least-privilege ACL.

| Stays in the home lab | Built in Energy Analyser |
|---|---|
| HA + Deye collection, PGE import and bill math | Access control (FR-001) |
| History store and aggregation | Season-adjusted baseline + anomaly flag over pushed history (FR-003) |
| Facts bundle + LLM narration (HA → Ollama → OpenRouter) | Display of state, insight and recommendation with staleness (FR-002, FR-004, FR-005) |
| The push step (homelab-2 change) | Ingestion endpoint + payload contract; feedback CRUD (FR-007–010) |

`context_type` stays `greenfield`: this repository is new code, and the home lab is an external data source.

## Lab state (2026-09-25)

Found and changed while building F-02 (daily history) and S-04 (seasonal insight). Details and runbooks live in the private home-lab repo.

| Area | State | Effect on Energy Analyser |
|---|---|---|
| **Push** | Every 5-minute push carries live state, the latest recommendation and the last 35 days of per-day totals (plus the morning PV forecast when known). Day totals use only samples whose counter sensors were present, ignore late dips and midnight carry-overs, and incomplete past days are sent empty. | `daily_energy` fills from 2026-07-26; 13 outage days are missing for good. |
| **Solar forecast** | Missing in Home Assistant since the move to the new host (~2026-07-21): every snapshot is marked `degraded` and every forecast field is null. | Recommendations carry no forecast; `pv_forecast_kwh` stays empty; FR-006 and S-11 wait on it. Owner action: add Forecast.Solar or Solcast in HA. |
| **Lab host outages** | The virtualisation host's network card hung (2026-09-13 → 19 and 09-21 → 25), leaving the lab up but offline, with no data and no alert. Fixed 2026-09-25 (segmentation offload off, persisted). | Outage days are absent from history; the seasonal insight uses the days it has and says how many. |
| **Monitoring** | Uptime Kuma (upgraded to 2.5.5, managed as code) receives a heartbeat after every successful push and pings the lab hosts; alerts go to Telegram. A second, unused Kuma instance was retired. | Silence from the lab now alerts within 15 minutes; the app's own staleness notices (S-02) remain the user-facing signal. |
| **Drift control** | The lab's live scripts had diverged from the repo; they were reconciled, and the lab runbooks now diff the host against the repo before any install. | Contract changes must land in the app first, then in the lab (a field the app does not know yet is rejected with 422). |

