---
change_id: frosted-aurora-dashboard
title: Field-preserving Frosted Aurora dashboard refresh
status: archived
created: 2026-09-29
updated: 2026-09-29
archived_at: 2026-09-29T16:06:05Z
---

## Notes

User approved the "B" colour direction from the visual proposal: a restrained frosted aurora palette with deep
blue-black background, navy/graphite cards, soft violet primary accents, cyan PV/home accents, magenta battery and
muted slate grid.

The existing production-like `/dashboard` prototype is the source of truth. The refresh may rearrange content,
improve hierarchy and keep/add truthful animation, but every existing visible field and every existing
empty/error/stale/insufficient state must remain visible or accessible. The live URL redirects to login from the
agent environment, so the source audit is the checked-in dashboard route and components.

External `/10x-ui` link supplied by the user was not readable from this environment (`404` through both web fetch and
read-only GitHub CLI), so this change follows the local `/10x-ui` conventions already present in the repository:
token-first styling, no second UI stack, no invented data, field-preserving screenshots, and no new chart/animation
dependency.

**Closed as superseded 2026-09-29.** PR 65 (the Frosted Aurora theme) is merged. Its palette is replaced by `dashboard-refresh-icons-sparklines`, which takes the palette from the approved Claude Designer canvas instead ("Palette from the design, not from PR 65"), so manual checks 1.7–1.9 were not run and no longer apply; that change carries its own palette, contrast and motion checks.
