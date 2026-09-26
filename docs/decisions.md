# Decisions

The main product and technical decisions, newest first, each with the reason. Detailed plans for each change are in `context/changes/` (active) and `context/archive/` (done); the product requirements are in `context/foundation/prd-v3.md` and the ordered work in `context/foundation/roadmap.md`.

## 2026-09-26

- **The local model probes, a stronger model interprets.** The local Ollama model writes short observations every ~12 minutes; the stronger cloud model turns them and the verified facts into every text the owner reads. _Why:_ small local models write weaker Polish; the stronger model gets a compact trail of notes instead of raw telemetry. The live LLM configuration stays unchanged.
- **Write for someone without energy knowledge.** Plain Polish, every technical term explained where it appears, colours plus text labels for status, remarks on consumption trends. _Why:_ the owner does not read kW, kWh or PV figures fluently; raw numbers alone do not answer "is this good?".
- **Solcast is the PV forecast source; Forecast.Solar is kept for comparison.** _Why:_ on this flat, 10 kWp, north-facing array Forecast.Solar predicted 36.3 kWh for a day Solcast put at 27.6, above any real September day (best 26.3). Solcast also provides low/high estimates for a certainty measure.
- **Recommendation feedback (accept/dismiss) was dropped; the system rates days and months instead, and the owner keeps notes on days.** _Why:_ the owner wants to see which periods went well or badly and why, not to grade each recommendation. Notes on days remain the app's create/edit/delete feature and explain outliers.
- **Ratings use self-sufficiency against the season norm.** _Why:_ it measures what a PV + battery owner controls (how much of the consumption the system covered), uses data already stored, and does not depend on tariff figures that are not available yet.
- **The home lab backfills its full history once.** _Why:_ year views and season comparisons would otherwise take a year to become useful.
- **Every external prerequisite is written down** ([prerequisites.md](prerequisites.md)). _Why:_ the forecast silently disappeared for two months because a Home Assistant integration existed only in a UI config that was lost in a host move.

## 2026-09-25

- **The lab pushes per-day totals (35 days) with every push.** _Why:_ the season-adjusted insight and forecast accuracy need daily history, and resending recent days lets late corrections replace earlier values.
- **Cost, usage and context features of the lab's old analyser page move into the app (PRD v2).** _Why:_ the lab page showed sample figures; the app shows real aggregates the lab already computes.

## 2026-09-23

- **Push from the lab, never pull into it.** _Why:_ the home network is LAN-only; an outbound push keeps it closed and lets the app degrade gracefully (last-known data with a staleness warning) when the lab is down.
- **No service-role key in the app; ingest through a token-checked database function.** _Why:_ a leaked app key must not grant write access; only a hashed, revocable lab token can write.
- **Owner-only access through grants plus row-level security.** _Why:_ single-tenant by design; defence in depth means a missing policy exposes nothing because no table privilege exists either.
- **Sign-in by emailed magic link with a long session; password kept as an alternative; no sign-up.** _Why:_ one owner, no account creation needed; the password path was restored when production email templates were not yet set.
- **Season-adjusted baseline with a visible 30-day fallback.** _Why:_ a flat recent average flags normal seasonal change as anomalies; the fallback is disclosed because history is short at first.
- **The LLM only narrates a verified facts bundle and runs ahead of the visit.** _Why:_ it cannot invent numbers, and opening the app never waits for inference.
- **Advisory only.** _Why:_ a wrong automatic change to the inverter costs more than a missed tip; the owner decides.
