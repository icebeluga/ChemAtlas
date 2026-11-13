# ChemAtlas Stage 4 handoff

**Candidate verified locally. Release blocked on hosted Cloudflare Access verification.**

Tested application commit `3c78883006beb48c2dab68443e6e93b87bb9a769` on `verification/chematlas-stage4`. The report commit adds only evidence under this directory. The student app serves 1,564 records. The original 1,542-record catalog and its audit remain available as the rollback assets and continue to serve the private review code path.

- [Functional and visual parity](parity.md)
- [Catalog decisions and evidence](catalog.md) · [Per-ID ledger](catalog-decisions.tsv)
- [PDF output checks](pdf.md) · [Rendered combined worksheet](screens/worksheet.jpg)
- [Authentication and isolation](security.md)
- [Defects and corrections](defects.md)
- [Release manifest](release-manifest.json) · [Asset hashes](build-assets.sha256)

## Independent baseline

GitHub's comparison identifies `a8e0c6bcc611687e1dc36ca73dfcfdd7a3c85dfc` as the direct ancestor of `3469db4ea06389c5d8b4df6f9ca9fd9f01852517`. Its sole follow-up touched the handoff README, manifest and three images. The verification branch started at the exact handoff. The Stage 2 reports and ledgers informed the checks, and Stage 3 results served as reference.

For local verification, source files were reconstructed in a fresh directory and matched against the pinned recursive GitHub blob inventory. The Sites v48 reference had all 512 archived files. Three of 977 baseline files were unavailable in the local reconstruction, all under `research/reports/independent-validation/`: the Batch 1 catalog context JSON, Batch 4 Q47 grayscale PNG, and Batch 4 revision 3 contact-sheet PDF. They are unchanged in the GitHub candidate and outside the exercised application build and test paths. All changed files were matched back to the GitHub candidate by Git blob hash.

## Reproduction and results

Node 24.22.1, pnpm 11.25.0, Python 3.12, PyMuPDF 1.26.6 and Tesseract 5.5.0. The clean candidate install used the same lockfile as the final application. The Sites archive was separately installed and built using its own frozen lockfile. Browser tests used Playwright with Chromium headless shell in local isolated Workers.

| Exact command | Stage 3 baseline | Stage 4 application |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Passed, 654 packages | Same frozen installation and lockfile |
| `pnpm check` | Passed | Passed |
| `pnpm test` | 40 passed | 41 passed |
| `python -m unittest discover -s tests -p 'test_*.py'` | 51 passed | 51 passed |
| `pnpm check:private` | Passed | Source configuration checked again by built assertion |
| `pnpm build` | Passed | Passed |
| `pnpm check:private --built` | Passed, 1,542 records | Passed, 1,564 records |
| `pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json` | Passed, 43 files and ASSETS binding | Passed, 45 files and ASSETS binding |

The build emitted Vinext dynamic import warnings. The dry run exited before upload. The release manifest distinguishes deterministic source hashes from build outputs. Vite/Wrangler output can include generated values and checkout paths, so the built digests describe this run.

## Release gate and version-control safeguards

1. Exercise this exact application and catalog in an authorized, isolated Access environment. Verify an allowed identity, a denied identity and an anonymous session against the app, direct JS/CSS, both catalog URLs, worksheet assets, PDF worker and all source PDFs. Check that the admin and backup paths remain denied and that the protected Worker has only the intended asset binding. Stage 4 had only synthetic signed identities and local Workers.
2. Capture the active student Worker version and its rollback version before any Stage 5 release approval. Keep application, student catalog, worksheet registries and build artifacts under the same immutable release pin. Roll back the student application and matching assets together. Keep private recovery independent.
3. Require a no-deploy check on candidate commits and an explicit approval before updating the release pin. Record GitHub source and workflow commits, asset digests, browser fixtures, and approved deferrals. Retain prior manifests, build evidence and exact Sites snapshots.
4. Review any worksheet containing fallback pages before using it as an answer-free handout. The output flags those pages. Individual crop or scoring-guide cleanup can continue against the catalog ledger.

Stage 4 made no production deployment, main merge, release pin update, live Access change or private review service change.
