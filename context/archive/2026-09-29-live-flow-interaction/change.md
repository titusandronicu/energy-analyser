---
change_id: live-flow-interaction
title: Truthful, interactive energy flow for Stan na żywo
status: archived
created: 2026-09-29
updated: 2026-09-29
archived_at: 2026-09-29T16:11:14Z
---

## Notes

/10x-ui change. **One view:** `Stan na żywo` (`src/components/LiveStateCard.astro`). **Token source:** `:root` in `src/styles/global.css` (dark palette lives in `:root`; the app has no light mode). Follow-up to `live-state-flow-visual`, which shipped icon nodes plus an ambient pulse but no connectors, direction arrows, node details or freshness gating.

Input: the Carbon Atlas → Energy Analyser handoff (pasted 2026-09-29), adapted to this repository in `handoff-adapted.md`. Ideas only; no Atlas code or assets are copied (the Atlas repository states no licence). The sibling change for the recommendation card is `recommendation-card-refresh`.

Owner decisions (2026-09-29):

- Two changes, flow first, then `recommendation-card-refresh`.
- Animation: static direction arrows always; motion only on fresh, nonzero flows; stops when stale, missing or paused; reduced motion keeps the static arrows.
- Button: keep the existing Radix-based `button.tsx` and extend it; Base UI migration is out of scope (log the deviation from the design brief in `docs/decisions.md`).

Next: `/10x-research live-flow-interaction` (only the open questions in `handoff-adapted.md`), then `/10x-plan`.

Owner approved the dashboard mockup 2026-09-29 (rough draft, sample figures): icon on every node and card heading (lucide-react in the real app), a `Scale` icon on the balance junction instead of a dot, and the recommendation findings block always visible (not behind the disclosure) with the forecast inline. The last two also apply to `recommendation-card-refresh`.

Owner decisions and the proposed node verdict rules are recorded at the end of `handoff-adapted.md` (2026-09-29).

2026-09-29: PV verdict is shown only from 15:00 (owner). Mockup with tinted nodes approved ("the rest looks very good"). Open items left for the plan: expected share of the forecast by 15:00, and the live-snapshot check of the grid/battery sign.

2026-09-29 (implementation review): two `bill-forecast` guards (central estimate inside its range, `generated_at` not more than 5 minutes ahead of the app clock) were added in `e39f6c8` to answer PR 57 review comments; they are unrelated to the flow card, tested, and documented in `docs/logic.md`. A migration exposing `daily_energy.captured_at` to owners was added in `8ef3575` for a Codex finding on PR 58; apply it in production with the deploy.

2026-09-29 (archive): the `daily_energy.captured_at` migration is applied in production, as `20260929101548_owner_read_daily_energy_captured_at` (renamed from `20260929130000_…` in PR 61); `authenticated` holds the column grant and `anon` has none. Rows 2.4 and 5.5 (local smoke runs) stay open by the owner's decision; the CI `smoke` job covers them.
