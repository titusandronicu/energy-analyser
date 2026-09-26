# Prerequisites outside this repo

Everything Energy Analyser depends on that its own code does not set up: Home Assistant integrations, the home lab's jobs and LLM configuration, secrets, and one-time production steps. When a change adds or changes one of these, it updates this file (see `context/foundation/lessons.md`).

State as of 2026-09-26. Secrets are named with their location only; no values belong here.

## Where things run

| Piece                      | Where                                                                           | Notes                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home Assistant Core 2026.8 | UGREEN, container `ugreen-homeassistant-rehearsal`, `http://192.168.50.63:8123` | All integration settings live in `/home/Funky/AppData/homeassistant-rehearsal/config`, with **no backup yet** (homelab-2 #24). Settings that exist only in the UI are recorded in homelab-2 `inventory/services/ugreen-homeassistant-rehearsal.yaml` (`ui_only_settings`). |
| Energy lab stack           | docker-core VM (`funky@192.168.50.30`), `/srv/homelab/energy-app-stack`         | `homelab-energy-refresh.timer` runs every 5 minutes: snapshot → history → briefing → LLM narration (about hourly) → push to this app. Operator access: `ssh -i ~/.ssh/docker-core`. Runbook: homelab-2 `runbooks/energy-analyser-push.md`.                                 |
| Local LLM (Ollama)         | docker-core, `http://127.0.0.1:11434`                                           | Installed models: `gemma3:4b`, `qwen3:4b`, `qwen3:1.7b`, `nomic-embed-text`.                                                                                                                                                                                               |
| Energy Analyser app        | Mikrus VPS (`https://neil170-20170.mikrus.cloud`), Docker image from GHCR       | Production deploy is manual through the protected `production` environment.                                                                                                                                                                                                |
| Database and auth          | Supabase (cloud project linked in `supabase/.temp`)                             | Migrations in `supabase/migrations/`.                                                                                                                                                                                                                                      |

## Home Assistant integrations

The lab's collector reads these entities (homelab-2 `infra/compose/energy-app/scripts/collect-ha-snapshot.py`, `ENTITY_MAP`). Any missing mapped entity marks the snapshot `degraded`.

| Integration                                                              | Install                | Used for                                                                              | App features that need it                                                                               | Setup notes                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DeyeCloud Integration** (HACS, heavenknows1978)                        | HACS                   | Live power (PV, grid, battery, load), battery %, daily counters                       | Live state (S-02), daily history (F-02), insight (S-04), everything built on daily totals               | Primary energy source. Entities `sensor.deye_inverter_2505305044_*` and `sensor.deye_station_61507285_*`. Needs the DeyeCloud account in HA.                                                                                                                                                |
| **Solcast PV Forecast** (HACS `solcast_solar`)                           | HACS + Solcast account | PV forecast today/tomorrow, power now, low/high estimates (`estimate10`/`estimate90`) | Recommendation forecast (S-03), per-day forecast (F-02), forecast accuracy and certainty (S-11, FR-020) | Forecast source since 2026-09-26 (F-05). Free "home user" account at toolkit.solcast.com.au, one rooftop site: flat, 10 kWp, facing north (Solcast azimuth 0 = north, 180 = south). API key entered in the HA UI only. API limit 10 polls/day, auto update on, estimate10/90 attributes on. |
| **Forecast.Solar** (core)                                                | HA UI                  | Comparison forecast (`sensor.energy_production_*`)                                    | S-11 source comparison                                                                                  | One plane: declination 0, azimuth 0 (HA: 0 = north), modules power 10000 W, no API key. Comparison only; today/tomorrow kept in lab history once homelab-2 #28 is installed. Removing it requires removing its four keys from `ENTITY_MAP`.                                                                                                                     |
| **Solarman** (local)                                                     | HACS                   | Comparison values only (`sensor.solarman_*`)                                          | none                                                                                                    | Known unreliable since 2026-07-21; kept for diagnostics.                                                                                                                                                                                                                                    |
| **PGE Sensor**                                                           | HACS                   | Live billing values (`sensor.pge_sensor_*`)                                           | Bill forecast and closed-period bill (S-07, S-08)                                                       | S-08 also needs the full G11 tariff deployed in the lab (blocked).                                                                                                                                                                                                                          |
| **Solar Accelerator**                                                    | HACS                   | Dynamic buy/sell prices                                                               | none yet (dynamic prices are parked)                                                                    | Read by the collector; the app never writes to the inverter.                                                                                                                                                                                                                                |
| **Google AI conversation agent** (`conversation.google_ai_conversation`) | HA UI                  | Optional LLM provider (`ha_conversation`)                                             | Recommendation narration fallback                                                                       | Cloud model; last in the live provider order.                                                                                                                                                                                                                                               |
| **Met.no**                                                               | core                   | Weather context (`weather.forecast_home`)                                             | Lab briefing context                                                                                    | —                                                                                                                                                                                                                                                                                           |

Panel facts: one array on inverter input PV1 (PV2/PV3 unused), observed peak 7.06 kW (Jul–Sep 2026).

## LLM configuration (lab)

Narration runs in the lab (`scripts/run-energy-advisory.py`), never in this app. Settings in `/srv/homelab/energy-app-stack/.env.llm` on docker-core (template: homelab-2 `infra/compose/energy-app/ha-llm.env.example`):

| Setting                    | Live value (2026-09-26)               | Notes                                                                                                               |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `LLM_PROVIDER_ORDER`       | `openrouter,ollama,ha_conversation`   | The template's default is `ha_conversation,ollama,openrouter`. **All recommendations so far came from OpenRouter.** |
| `OPENROUTER_MODEL`         | `openai/gpt-4.1-mini`                 | Cloud; `OPENROUTER_API_KEY` is set in `.env.llm`.                                                                   |
| `OLLAMA_MODEL`             | `gemma3:4b`                           | Local; temperature 0.2.                                                                                             |
| `HA_CONVERSATION_AGENT_ID` | `conversation.google_ai_conversation` | Cloud via Home Assistant.                                                                                           |
| `LLM_LANGUAGE`             | `pl`                                  | All user-facing text is Polish.                                                                                     |

**How the two models split the work (owner's decision, 2026-09-26; configuration unchanged):**

- **Local model (Ollama) probes often.** `run-local-micro-analysis.py` runs from the refresh job whenever the last observation is older than about 12 minutes and writes short notes to `web/memory/energy/local-micro-analysis.md` (and `.json`/`.jsonl`). It sees the snapshot, the consumption plan and PGE anomalies, and never talks to the user.
- **Stronger model interprets.** The hourly advisory (`run-energy-advisory.py`, provider order above) reads those notes plus the verified facts and writes every user-facing text: the daily recommendation now, and the plain-language explanation of today and the day/month summaries in PRD v3 (FR-023, FR-030; roadmap F-04).
- If the cloud providers fail, the chain still falls back to local Ollama, so a text may occasionally come from the small model; the recommendation records its `provider` and `model`.

## Secrets and where they live

| Secret                              | Location                                                                                                                  | Used by                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| HA long-lived token (read-only use) | docker-core `.env.ha` and `.env.llm`, mode 0600                                                                           | Collector, HA conversation provider       |
| Ingest token `homelab`              | docker-core `.env.push`; password manager "Energy Analyser ingest token"; only its SHA-256 hash in `public.ingest_tokens` | Push to `/api/ingest`                     |
| OpenRouter API key                  | docker-core `.env.llm`                                                                                                    | Cloud narration                           |
| Solcast API key                     | HA UI (Solcast integration) and the owner's Solcast account                                                               | Forecast                                  |
| Supabase URL and anon key           | app `.env` locally, `.env.runtime` on the VPS (not committed)                                                             | This app; service-role keys are forbidden |
| Uptime Kuma push URL (optional)     | docker-core `.env.push`                                                                                                   | Push heartbeat                            |

## One-time production steps (app)

- Owner row in `public.app_owners` (inserted by hand; see `context/deployment/micrus-runbook.md`).
- Supabase "Magic link" and "Confirm signup" email templates set to `supabase/templates/magic-link.html`.
- Ingest token hash row in `public.ingest_tokens` (`scripts/create-ingest-token.mjs`).
- Each migration applied in production with its deploy.

## Prerequisites by roadmap item

| Item                                 | Needs outside this repo                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-03 history backfill                | The lab's `energy-history.jsonl` (starts 2026-07-16); one push of the push script with enough `--days`, within the contract's 62-day limit. |
| F-04 lab texts (today, days, months) | The existing narration chain (stronger model) plus the local micro-analysis notes; a new optional contract section.                                               |
| F-05 solar forecast                  | Solcast integration and site (done 2026-09-26); Forecast.Solar for comparison (done).                                                                             |
| S-07 bill forecast                   | Lab bill-forecast job running (`build-current-month-bill-forecast.py`).                                                                                           |
| S-08 closed-period bill              | Full G11 tariff deployed in the lab (blocked).                                                                                                                    |
| S-09 consumption-plan actions        | Lab consumption-plan job (`build-deye-consumption-plan.py`).                                                                                                      |
| S-10 usage profile                   | PGE hourly imports in the lab.                                                                                                                                    |
| S-11 accuracy and certainty          | 1–2 weeks of Solcast forecasts after F-05 (count from 2026-09-27); low/high estimates are already recorded in lab history; Forecast.Solar values in history need homelab-2 #28 installed. |
| S-12 inverter schedule               | Lab Deye settings snapshot (`collect-deye-settings-snapshot.py`).                                                                                                 |
| S-18 summaries                       | F-04.                                                                                                                                                             |

## If Home Assistant's config is lost

Until homelab-2 #24 adds backups: reinstall the HACS integrations above, sign in to DeyeCloud, re-add Solcast (API key from the Solcast account) and Forecast.Solar with the settings in this file, issue a new long-lived token and update `.env.ha` and `.env.llm` on docker-core. The collector's entity IDs must match `ENTITY_MAP`.
