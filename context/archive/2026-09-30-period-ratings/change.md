---
change_id: period-ratings
title: Rate each completed day and month good, neutral or bad
status: archived
created: 2026-09-30
updated: 2026-09-30
archived_at: 2026-09-30T14:22:18Z
---

## Notes

Roadmap S-17 (US-05, FR-022). The user sees a good / neutral / bad rating for each completed day and month in the history calendar (S-15, `/dashboard/history`), based on self-sufficiency (`1 − import ÷ consumption`, clamped to 0–100%, over complete days with consumption above 0) against a norm, with the basis and period stated and no advice.

From the roadmap and PRD:

- The rating is computed in the app, like S-04's insight, and reuses its season window, fallback and disclosure.
- Until about July 2027, every rating uses the recent (trailing) norm, and the card says so plainly.
- The median is the norm statistic.
- The thresholds are set in this plan.

Open question 8 (the autumn heating ramp) must be settled in the plan: a falling autumn trend must not paint every day red (for example, by using a shorter window than 30 days).

The calendar already reserves a `rating: null` slot on each day, month and quarter view model (`src/lib/services/calendar-view.ts`).

Grid import is over-reported from 4 August 2026, which lowers self-sufficiency; the rating must say so or account for it.
