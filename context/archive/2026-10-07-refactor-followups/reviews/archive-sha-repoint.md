# Archive SHA repoint: refactor-followups

- **Date:** 2026-10-07
- **Target:** `origin/main` of `titusandronicu/energy-analyser`, snapshot `598b8bc7f724def57d5f68b3f04dab0ba97fba9d` (fetched 2026-10-07)
- **Integration commits** (squash merges, each the integration of one implementation PR):
  - `4630c65` "refactor: review leftovers, test helper dedupes and two safe splits (#151)": its PR commit list holds 0d0984d, 81740f1, d3ec5c8, f06f2e4, 384b4ce and the head c4c7961.
  - `cedff13` "feat: shared anon-key classifier, warn-only in the app (#152)": its PR commit list holds fc80b4e and the head 41dc05d.
  - `9cd0171` "feat: refuse a non-anon SUPABASE_ANON_KEY in the app (#153)": its PR commit list holds 1d64c06 and the head cf1d1d6.
- **Evidence:** for each PR, `git diff --stat <PR head> <squash commit> -- <the files the PR changed>` is empty (41 files for #151, 10 for #152, 7 for #153), so each squash commit integrates the implementation its rows cite. The five rows already citing `9cd0171` (4) or `cedff13` (1) are in the target history and were left as they were.
- **Decision:** the owner chose "Update and archive" at the /10x-archive prompt on 2026-10-07.
- **Rows repointed:** 27.

| Row | Old suffix (resolved OID)                          | New SHA |
| --- | -------------------------------------------------- | ------- |
| 1.1 | 0d0984d (0d0984d319ac85a3a551bf0f6b84c97304bd5727) | 4630c65 |
| 1.2 | 0d0984d (0d0984d319ac85a3a551bf0f6b84c97304bd5727) | 4630c65 |
| 1.3 | 0d0984d (0d0984d319ac85a3a551bf0f6b84c97304bd5727) | 4630c65 |
| 1.4 | 0d0984d (0d0984d319ac85a3a551bf0f6b84c97304bd5727) | 4630c65 |
| 1.5 | 0d0984d (0d0984d319ac85a3a551bf0f6b84c97304bd5727) | 4630c65 |
| 1.6 | 384b4ce (384b4ce91b84af1546951bc7e0bc8cb22f400114) | 4630c65 |
| 2.1 | 81740f1 (81740f1bdb131ab9ef89bf0e1aa4fce25d36f750) | 4630c65 |
| 2.2 | 81740f1 (81740f1bdb131ab9ef89bf0e1aa4fce25d36f750) | 4630c65 |
| 2.3 | 81740f1 (81740f1bdb131ab9ef89bf0e1aa4fce25d36f750) | 4630c65 |
| 2.4 | 81740f1 (81740f1bdb131ab9ef89bf0e1aa4fce25d36f750) | 4630c65 |
| 2.5 | 81740f1 (81740f1bdb131ab9ef89bf0e1aa4fce25d36f750) | 4630c65 |
| 2.6 | f06f2e4 (f06f2e4045c30bc012a5704a633d985f9f229a08) | 4630c65 |
| 2.7 | 384b4ce (384b4ce91b84af1546951bc7e0bc8cb22f400114) | 4630c65 |
| 3.1 | d3ec5c8 (d3ec5c8e44aa1aa185f7cc4051554f07739ee7d8) | 4630c65 |
| 3.2 | d3ec5c8 (d3ec5c8e44aa1aa185f7cc4051554f07739ee7d8) | 4630c65 |
| 3.3 | d3ec5c8 (d3ec5c8e44aa1aa185f7cc4051554f07739ee7d8) | 4630c65 |
| 3.4 | d3ec5c8 (d3ec5c8e44aa1aa185f7cc4051554f07739ee7d8) | 4630c65 |
| 3.5 | f06f2e4 (f06f2e4045c30bc012a5704a633d985f9f229a08) | 4630c65 |
| 3.6 | 384b4ce (384b4ce91b84af1546951bc7e0bc8cb22f400114) | 4630c65 |
| 3.7 | 384b4ce (384b4ce91b84af1546951bc7e0bc8cb22f400114) | 4630c65 |
| 4.1 | fc80b4e (fc80b4ecd9543a15c81bf4ea5958d6e0fbf1cab8) | cedff13 |
| 4.2 | fc80b4e (fc80b4ecd9543a15c81bf4ea5958d6e0fbf1cab8) | cedff13 |
| 4.3 | fc80b4e (fc80b4ecd9543a15c81bf4ea5958d6e0fbf1cab8) | cedff13 |
| 4.4 | fc80b4e (fc80b4ecd9543a15c81bf4ea5958d6e0fbf1cab8) | cedff13 |
| 4.5 | fc80b4e (fc80b4ecd9543a15c81bf4ea5958d6e0fbf1cab8) | cedff13 |
| 5.1 | 1d64c06 (1d64c0695fc06fa03a10dae38f1d534713a1eb8a) | 9cd0171 |
| 5.2 | 1d64c06 (1d64c0695fc06fa03a10dae38f1d534713a1eb8a) | 9cd0171 |
