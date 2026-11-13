# Stage 5 validation evidence

[GitHub Actions run 43501394152](https://github.com/icebeluga/ChemAtlas/actions/runs/43501394152) passed for both the exact Stage 4 application and the Stage 5 controls commit. The workflow SHA was `84edb90d838e53ee63db81f4c60afd922e650bcf`.

| Check | Exact Stage 4 candidate result |
| --- | --- |
| Source and package | Clean checkout at `3c78883006beb48c2dab68443e6e93b87bb9a769`, frozen pnpm install, TypeScript, 41 Node tests, 51 Python tests, production build and Wrangler dry run passed. |
| Catalog and assets | 1,564 records across nine units, six shared-stimulus groups and 17 links. Both catalogs, worksheet registries and fragment PDF, and eight source PDFs matched the reviewed source and built package hashes. |
| Student Worker | Synthetic signed, wrong-audience and anonymous requests exercised the protected pages, version endpoint, JS/CSS, catalog, worksheet and PDFs. Admin and backup routes were denied. Local emulator used compatibility date 2026-05-15. The production-config dry run kept 2026-11-12. |
| Browser | Chromium passed Browse, unit navigation, Question Bank, PDF detail and Practice Builder at 1440 and 390 pixels. |
| Fail-closed rehearsal | Rejected a branch name, wrong checkout SHA, wrong manifest SHA, catalog digest, worksheet digest, version asset, owner approval digest and incomplete hosted evidence. Re-extracted the sealed archive and checked each file hash. |
| Rollback | Offline package rehearsal bound the artifact to the prior release metadata. Local mock scenarios checked the production preflight, stale rollback UUID rejection, deployment record and automatic rollback. The live prior UUID still needs owner verification. |

[Download the Stage 4 artifact](https://github.com/icebeluga/ChemAtlas/actions/runs/43501394152/artifacts/14074740993). The downloaded ZIP matched GitHub's digest. Its extracted tar, every sealed build file, and all seven evidence logs were verified against the exact Stage 4 checkout. The [verified build manifest](stage4-verified-build.json) is retained in Git.

| File | SHA-256 |
| --- | --- |
| GitHub artifact ZIP | `220e3379e7a4c2497492da6fff13374068a6bec9bc516bbddc0783c2911102e9` |
| student-dist.tar.gz | `e8ed2136875a8b1093a619c41eca5f4a96d9e17a1e4e5b11b29b25de63c79500` |
| release-manifest.json | `6107a2797b6b2d9d4d52526d1a13baec13e554d36889cba3b5019194d69af00a` |

GitHub reports artifact expiry on February 11, 2027. Retain the exact artifact and logs before expiry. If the artifact expires, rerun validation and repeat isolated hosted verification against the newly sealed package before approving it.

The earlier runs surfaced a workflow context error and a local runtime compatibility error. The final successful run corrected both. Hosted Access evidence remains outstanding.
