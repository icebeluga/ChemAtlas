# ChemAtlas Stage 5 handoff

**Production is blocked pending isolated hosted Cloudflare Access verification and owner approval.**

| Reference | Exact source |
| --- | --- |
| Stage 5 branch | [release/chematlas-stage5-controls](https://github.com/icebeluga/ChemAtlas/tree/release/chematlas-stage5-controls) |
| Stage 4 application | `3c78883006beb48c2dab68443e6e93b87bb9a769` |
| Stage 4 handoff and Stage 5 parent | `8069929f3231c24a581788b678b6f874d8c86a0a` |
| Stage 3 handoff | `3469db4ea06389c5d8b4df6f9ca9fd9f01852517` |
| Stage 2 audit | `42d31dafe1f4b94a0b86d2d1f6a346f7ea18be43` |
| Archived Sites v48 | `6f4a568382eef820418a9f84fe97bd5cbd21d721` |
| Historical Cloudflare rollback source | `63fd7e4b5287d74f66227742e8b2a4f47e37920f` |

The Stage 4 handoff added only evidence to the tested application. At inspection, `main` was `25c4528307776533575f8f07993e35a851798156`. Its manual release workflow checked out the historical Cloudflare SHA via `APPROVED_COMMIT` independently of the workflow SHA. It defaulted to a read-only preflight, built from a frozen lockfile, and offered a live deploy guarded by Access inspection and rollback. It staged a release config with workers.dev enabled only after verifying the existing protected hostname, and kept previews disabled and retained Access variables. GitHub workflow history and the Stage 2 audit identify the historical source. Obtain the actual live Worker version in Stage 6.

## Validation and identity

[Passing validation, exact Stage 4 artifact and digests](validation.md) · [Verified build manifest](stage4-verified-build.json)

The [no-deploy workflow](../../.github/workflows/chematlas-release-validation.yml) checks out the workflow and exact application separately. It runs on release branch pushes and pull requests targeting the approved branch. Stage 5 pushes also validate the exact Stage 4 application against the [reviewed input manifest](stage4-inputs.json). The branch builds use a clean Git checkout, frozen pnpm install, typecheck, Node and Python suites, production build, Wrangler dry run, protected Worker checks and desktop/mobile browser smoke. A successful run retains the sealed tar archive, hash, JSON manifests and validation logs as an Actions artifact.

From a clean checkout of the candidate and with the pinned Node, pnpm, Python, PyMuPDF, Tesseract and Playwright/Chromium installed, use the same entry point locally. Keep the controls checkout and output directory outside the application checkout.

```sh
bash ../controls/scripts/release/validate.sh \
  "$(git rev-parse HEAD)" "$(git -C ../controls rev-parse HEAD)" \
  ../student-release ../controls/docs/stage-5/stage4-inputs.json
```

The optional fourth argument is the independently reviewed input manifest. Use it for Stage 4. For subsequent release candidates, review the workflow-generated input manifest before production approval. Generated build digests describe the exact archived build. Generated IDs and checkout paths can differ in a fresh build.

An authorized student session can request `/student-version.json` to see the application SHA, validation workflow SHA, release ID and catalog hash/count. The validation package injects this generated asset before building so the Worker registers the route, hashes it with the rest of the package, and tests it through the Worker. Its path and digest travel with the archive. The version asset contains no credentials, account identifiers or private review metadata.

## Stage 6 promotion procedure

1. Verify the approved source against the pinned input manifest and obtain a successful validation run for that exact application SHA. Identify and retain the artifact by numeric Actions run and artifact IDs. Download it, verify its tar and manifest SHA-256, and keep the logs. Use the same sealed archive for the hosted rehearsal and promotion.
2. In an authorized isolated Access environment, exercise the genuine allowed and denied identities and an anonymous browser. Check home, Question Bank and Practice Builder, direct JS/CSS, both catalogs and audit, all worksheet assets, the PDF worker and all eight source PDFs, plus the version asset. Confirm admin, backup and import paths are denied, including signed requests. Record the artifact SHA and evidence without credentials or personal identities. Confirm the published Access policy still limits intended users.
3. Use read-only Cloudflare dashboard or API access to identify the existing student Worker and its single active 100% deployment. Confirm the exact Worker UUID matches a known-good source/build record and retain its catalog, worksheet availability and PDF hashes. Attach the rollback record before asking for promotion.
4. Prepare a reviewed PR with `docs/releases/student-inputs.json` copied from the selected artifact, and the owner approval record defined in [manifest fields](manifest.md). Copy the [inactive workflow](production-release.yml.example) to `.github/workflows/cloudflare-student-release.yml` and the [guarded script](cloudflare-student-release.mjs.example) to `.github/scripts/cloudflare-student-release.mjs` in that same PR. Integrate only with owner approval and green CI. Preserve the old release workflow in Git history. If integration creates a new application candidate, validate and rehearse that SHA before selecting it.
5. The owner sets the SHA-256 of the reviewed approval JSON as the `STUDENT_RELEASE_APPROVAL_SHA256` secret in the production environment, after reviewing the package, rollback version and hosted evidence. Configure the Cloudflare secrets and production protection as documented in [governance](governance.md). Dispatch from `main` with the full SHA and `PROMOTE STUDENT <full SHA>`. The digest gate binds the approval to exact bytes and the workflow reuses the sealed archive. Keep the deployment record from Actions and link it from the release history.
6. After an authorized promotion, compare the live Worker version and authorized `/student-version.json` response with the deployment record. Check the critical assets and route denials again. Review each worksheet with full-page fallback before distribution as answer-free. Such pages can include adjacent questions, printed answers or scoring material.

No live deployment, main merge, active pin update, Access policy change or private review operation is part of Stage 5.
