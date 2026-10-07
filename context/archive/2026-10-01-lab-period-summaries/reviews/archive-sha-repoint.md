# Archive SHA repoint: lab-period-summaries

- **Date:** 2026-10-07
- **This change spans two repositories**, so the table names the repository of each SHA. Rows citing a `titusandronicu/energy-analyser` SHA were repointed against this repo's `main`; rows citing a `titusandronicu/homelab-2` SHA were repointed against that repo's `main`. Row 3.4 already cited `bd42189`, homelab-2's squash, and was left as it was.
- **energy-analyser** (target `origin/main`, snapshot `9d8d2cf732b7a507654b10469ba5a319699b6012`): `19c42ad` is in the commit list of PR #90 (https://github.com/titusandronicu/energy-analyser/pull/90, "feat(lab-period-summaries): period summaries contract and storage (F-04)"), whose squash merge `0056976` is an ancestor of the target; `git diff --stat 6093bc2 0056976 -- <the 19 files the PR changed>` is empty.
- **homelab-2** (the local clone at `a818aec`, `main`): `7101a1a`, `eae8269` and `dafa9d9` are the commit list of PR #41 (https://github.com/titusandronicu/homelab-2/pull/41, "feat(energy-app): period summaries (F-04)"), whose squash merge `bd42189` is an ancestor of that repo's `HEAD`; `git diff --stat dafa9d9 bd42189 -- <the 8 files the PR changed>` is empty. The three old SHAs now exist only on the branch `origin/feat/lab-period-summaries` there.
- **Decision:** the owner chose "Update all 15 rows and archive" at the /10x-archive prompt on 2026-10-07.
- **Rows repointed:** 15.

| Row | Repository      | Old suffix (resolved OID)                          | New SHA |
| --- | --------------- | -------------------------------------------------- | ------- |
| 1.1 | energy-analyser | 19c42ad (19c42adeb4326ba75571559a97178697ed5962ca) | 0056976 |
| 1.2 | energy-analyser | 19c42ad (19c42adeb4326ba75571559a97178697ed5962ca) | 0056976 |
| 1.3 | energy-analyser | 19c42ad (19c42adeb4326ba75571559a97178697ed5962ca) | 0056976 |
| 1.4 | energy-analyser | 19c42ad (19c42adeb4326ba75571559a97178697ed5962ca) | 0056976 |
| 1.5 | energy-analyser | 19c42ad (19c42adeb4326ba75571559a97178697ed5962ca) | 0056976 |
| 1.6 | energy-analyser | 19c42ad (19c42adeb4326ba75571559a97178697ed5962ca) | 0056976 |
| 1.7 | energy-analyser | 19c42ad (19c42adeb4326ba75571559a97178697ed5962ca) | 0056976 |
| 2.1 | homelab-2       | 7101a1a (7101a1a0ad7612fbe1c11741570d3d665182ff3f) | bd42189 |
| 2.2 | homelab-2       | 7101a1a (7101a1a0ad7612fbe1c11741570d3d665182ff3f) | bd42189 |
| 2.3 | homelab-2       | 7101a1a (7101a1a0ad7612fbe1c11741570d3d665182ff3f) | bd42189 |
| 2.4 | homelab-2       | 7101a1a (7101a1a0ad7612fbe1c11741570d3d665182ff3f) | bd42189 |
| 2.5 | homelab-2       | eae8269 (eae8269982e8586845b4dab57a4f5c4d9ca74aee) | bd42189 |
| 3.1 | homelab-2       | dafa9d9 (dafa9d918996d0bf5691cf940f61047b7e1a7418) | bd42189 |
| 3.2 | homelab-2       | dafa9d9 (dafa9d918996d0bf5691cf940f61047b7e1a7418) | bd42189 |
| 3.3 | homelab-2       | dafa9d9 (dafa9d918996d0bf5691cf940f61047b7e1a7418) | bd42189 |
