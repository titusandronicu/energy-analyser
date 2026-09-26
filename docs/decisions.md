# Decisions

The main product and technical decisions, newest first, each with the reason. Detailed plans for each change are in `context/changes/` (active) and `context/archive/` (done); the product requirements are in `context/foundation/prd-v3.md` and the ordered work in `context/foundation/roadmap.md`.

## 2026-09-26

- **Status thresholds for the cards (S-14): live data is worth checking after 15 minutes and a problem after 2 hours; consumption is good up to +15% over the norm (below it too), worth checking above that and a problem above +40%; the recommendation is worth checking when older than 2 hours and a problem when from an earlier day.** _Why:_ 15 minutes is three missed 5-minute pushes and 2 hours means the lab has most likely stopped; ±15% is the rule the usage insight already used, and +40% separates an unusual day from one worth acting on; advice from another day describes the wrong forecast and battery plan. Using less is never bad, so "below the norm" is green.
- **The lab's forecast confidence is ignored until S-11; certainty shows as "not known yet".** _Why:_ the lab rarely sends it and never says what it is based on, and the app has no forecast history to check it against before 2026-09-27. A figure without its basis would read as trustworthy when it is not.
- **Ratings use a disclosed recent norm until a year of history exists.** _Why:_ the lab's history starts on 2026-07-16 and PGE data holds grid import/export only, so no same-season norm exists before about July 2027; season-only ratings would be grey for the whole MVP. This is the rule the usage insight already follows.
- **The backfill covers only ten days, and the year view is parked.** _Why:_ the same history check showed the "full history" is 2026-07-16 to 2026-07-25 beyond what the app already has; a year view would show part of one year. This replaces the reason given for the backfill below.
- **The bill forecast (S-07) moves up to right after S-14; the recommendation's context cards (consumption plan, inverter schedule, pipeline status) become stretch in their own story, US-07; the forecast in the recommendation (FR-006) is a must-have.** _Why:_ late cost feedback is the first problem the PRD names and the lab already computes the forecast; US-01, the north star, could not be accepted by the deadline while it depended on slices sequenced last.
- **Forecast.Solar values are recorded in the lab's history.** _Why:_ keeping Forecast.Solar "for comparison" only in the live snapshot left nothing to compare later (homelab-2 #28).
- **The local model probes, a stronger model interprets.** The local Ollama model writes short observations every ~12 minutes; the stronger cloud model turns them and the verified facts into every text the owner reads. _Why:_ small local models write weaker Polish; the stronger model gets a compact trail of notes instead of raw telemetry. The live LLM configuration stays unchanged.
- **Write for someone without energy knowledge.** Plain Polish, every technical term explained where it appears, colours plus text labels for status, remarks on consumption trends. _Why:_ the owner does not read kW, kWh or PV figures fluently; raw numbers alone do not answer "is this good?".
- **Solcast is the PV forecast source; Forecast.Solar is kept for comparison.** _Why:_ on this flat (0° tilt), 10 kWp array Forecast.Solar predicted 36.3 kWh for a day Solcast put at 27.6, above any real September day (best 26.3). Solcast also provides low/high estimates for a certainty measure.
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
