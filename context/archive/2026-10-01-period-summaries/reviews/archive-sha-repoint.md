# Archive SHA repoint — period-summaries

- **Date**: 2026-10-01
- **Target**: `titusandronicu/energy-analyser`, branch `main`, snapshot OID `271226878953e0d5b60ee59f3c919d33db316f3f` (fetched fresh before the check; repository not shallow)
- **Integration commit**: `271226878953e0d5b60ee59f3c919d33db316f3f` — "feat(period-summaries): show the lab's period summaries (S-18) (#92)" (single-parent squash commit)
- **PR**: https://github.com/titusandronicu/energy-analyser/pull/92 (merged, base `main`)
- **Evidence / change scope**: the PR's commit list contains the five implementation commits (`4249b3a`, `74cecd0`, `4a5dc25`, `12cf708`, `87f87ef`), none of which is an ancestor of the target (`git merge-base --is-ancestor` exit 1 for each). The squash commit's diff against its parent has the same 24 files and identical per-file additions and deletions as the PR (+1405 / −42), and the source, scripts, docs and supabase trees are identical between the PR head `87f87ef` and the squash commit.
- **Decision**: the owner chose "Zaktualizuj i archiwizuj" (update and archive) after being shown this mapping.
- **Not changed**: row 3.10 already carried `2712268` (an ancestor of the target). No pending or SHA-less rows existed.

| Row ID | Old suffix (resolved OID)                              | New SHA   |
| ------ | ------------------------------------------------------ | --------- |
| 1.1    | `4249b3a` (`4249b3add0034c89e7a8c41c2f4b269a7fbcc008`) | `2712268` |
| 1.2    | `4249b3a` (`4249b3add0034c89e7a8c41c2f4b269a7fbcc008`) | `2712268` |
| 1.3    | `4249b3a` (`4249b3add0034c89e7a8c41c2f4b269a7fbcc008`) | `2712268` |
| 1.4    | `4249b3a` (`4249b3add0034c89e7a8c41c2f4b269a7fbcc008`) | `2712268` |
| 2.1    | `74cecd0` (`74cecd0ee8986601dffbf40562125ce79169f5ee`) | `2712268` |
| 2.2    | `74cecd0` (`74cecd0ee8986601dffbf40562125ce79169f5ee`) | `2712268` |
| 2.3    | `74cecd0` (`74cecd0ee8986601dffbf40562125ce79169f5ee`) | `2712268` |
| 2.4    | `74cecd0` (`74cecd0ee8986601dffbf40562125ce79169f5ee`) | `2712268` |
| 2.5    | `74cecd0` (`74cecd0ee8986601dffbf40562125ce79169f5ee`) | `2712268` |
| 2.6    | `74cecd0` (`74cecd0ee8986601dffbf40562125ce79169f5ee`) | `2712268` |
| 2.7    | `74cecd0` (`74cecd0ee8986601dffbf40562125ce79169f5ee`) | `2712268` |
| 2.8    | `74cecd0` (`74cecd0ee8986601dffbf40562125ce79169f5ee`) | `2712268` |
| 2.9    | `74cecd0` (`74cecd0ee8986601dffbf40562125ce79169f5ee`) | `2712268` |
| 3.1    | `4a5dc25` (`4a5dc25b805249c9654bb9e458784f79c8967459`) | `2712268` |
| 3.2    | `4a5dc25` (`4a5dc25b805249c9654bb9e458784f79c8967459`) | `2712268` |
| 3.3    | `4a5dc25` (`4a5dc25b805249c9654bb9e458784f79c8967459`) | `2712268` |
| 3.4    | `4a5dc25` (`4a5dc25b805249c9654bb9e458784f79c8967459`) | `2712268` |
| 3.5    | `4a5dc25` (`4a5dc25b805249c9654bb9e458784f79c8967459`) | `2712268` |
| 3.6    | `4a5dc25` (`4a5dc25b805249c9654bb9e458784f79c8967459`) | `2712268` |
| 3.7    | `4a5dc25` (`4a5dc25b805249c9654bb9e458784f79c8967459`) | `2712268` |
| 3.8    | `4a5dc25` (`4a5dc25b805249c9654bb9e458784f79c8967459`) | `2712268` |
| 3.9    | `4a5dc25` (`4a5dc25b805249c9654bb9e458784f79c8967459`) | `2712268` |

**Total rows repointed: 22.**

This note is provenance only; it is not an implementation review and not review coverage.
