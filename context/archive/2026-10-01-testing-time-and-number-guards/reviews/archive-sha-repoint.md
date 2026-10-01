# Archive SHA repoint

- **Date**: 2026-10-01
- **Target**: `origin/main` of titusandronicu/energy-analyser, snapshot `60ceb75c365f786e781813adc1937e96486f626c`
- **Integration commit**: `1efe18c940bca057562d4ddf2eb34d0c7b824337` "test: time and number guards (test plan Phase 1) (#95)"
- **PR**: https://github.com/titusandronicu/energy-analyser/pull/95 (merged, base `main`, squash)
- **Evidence**: the four old SHAs resolve locally but are not ancestors of the target (the branch was rebased before its first push, then squash-merged). The squash commit is an ancestor of the target and its diff (25 files, +1933/-26) holds the whole implementation of phases 1-4; the PR's five commits (`10d110b`, `f1db157`, `b59e47e`, `dbfbfc5`, `a93405f`) carry the same changes. The later review fixes (PR #96, `60ceb75`) are not part of this mapping.
- **Decision**: Update and archive, approved by the owner
- **Rows repointed**: 25

| Row ID           | Old suffix (resolved OID)                              | New SHA   |
| ---------------- | ------------------------------------------------------ | --------- |
| 1.1-1.7 (7 rows) | `1d05696` (`1d056963cd97f5910b0d2175c3b0181335546617`) | `1efe18c` |
| 2.1-2.6 (6 rows) | `6bdc785` (`6bdc7857eb1bd61cde7c3bc4d6643af6314525f2`) | `1efe18c` |
| 3.1-3.5 (5 rows) | `2bfb89c` (`2bfb89c92d525d360d342164b4b665f32a4218c1`) | `1efe18c` |
| 4.1-4.7 (7 rows) | `81215a6` (`81215a6b4fffa07715b463670fd9ddb2e2bccb01`) | `1efe18c` |
