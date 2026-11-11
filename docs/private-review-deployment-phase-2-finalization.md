# ChemAtlas private review deployment — Phase 2 finalization

## Hosted resources

- Worker: `chematlas-private-question-review`
- D1: `chematlas-private-review`
- R2: `chematlas-private-review-images`
- Authentication: owner-only Cloudflare Access policy; the application and API routes remain behind Access.

The existing ChemAtlas public Site uses a separate deployment and is not part of this Worker.

## Backup format

Hosted exports use `chematlas-question-image-review` format version 2. The archive contains the review manifest, the complete canonical question-to-stimulus mapping from `research/stimuli.json`, all R2 PNG objects, and D1 image checksums, review-history events, crop revisions, and record timestamps. Import validates catalog IDs, paths, byte counts, PNG signatures, SHA-256 values, and the complete stimulus map before it changes persistent state.

Import stages immutable PNGs first, then replaces the owner's D1 snapshot in one D1 batch. If the D1 batch fails, newly added R2 objects are removed and the previous D1 snapshot remains. Stale R2 objects are pruned only after a successful version 2 restore. The Worker currently enforces a 48 MiB compressed and decompressed archive limit and a 75-statement atomic D1 restore limit; larger future image corpora need a resumable batch-restore workflow before large-scale generation begins.

The importer continues to accept version 1 archives. Version 1 archives do not carry the complete D1 history/checksum metadata available in version 2 and should be treated as legacy recovery sources.

## Crop editing and image generation

The crop editor uses PDF.js in the authenticated browser to render the original PDF page, stores crop coordinates in source-page points, validates them against the PDF page dimensions, and submits the resulting PNG segments to the authenticated Worker API. The Worker persists the PNG bytes in R2 and metadata/revisions in D1; PDF rasterization does not run inside the Worker. A saved crop revision is marked for re-review, invalidating approval of an older image revision.

## Statistics

The review header distinguishes question records with PNGs from stored PNG segments. Segment counts come from the current owner's R2 object listing and include both question and shared-stimulus images, plus any retained prior revisions. Question review-state counts remain based on D1 review records; segments are not treated as question approvals.

## Verified current migration baseline

- Five question review records and one shared-stimulus review record; all are pending review.
- Seven baseline PNG segments: six question segments and one shared-stimulus segment.
- Baseline PNG bytes total 1,120,906; each archived PNG's SHA-256 was checked against the source asset.
- The 2008 MCQ 1 to shared-stimulus association is preserved.
- No temporary review-history events remain after reversible hosted action tests.

## Verification boundary

These Phase 2 checks cover the currently migrated records and assets only. They do not indicate that the remaining catalog questions have generated or approved images. Do not begin large-scale PNG generation until a resumable batch backup/restore path is implemented and tested for archives above the Worker import limits.


## Recovery checkpoint — hosted baseline restored — 2026-11-10

Source baseline: branch `work/private-review-deployment`, commit `1f583294930c08a81b9bd92aa0eed3d0a1102dc5`. The browser dashboard showed the hosted state before recovery: 8 question records with PNGs, 13 stored segments, 5 accepted questions, 3 pending questions, and 12 review-history / 12 crop-revision entries. No restore was assumed from the interrupted run.

The original pending snapshot was rebuilt from the branch manifest and the original revision PNGs still present in the current hosted export. A first archive was rejected because it used PAX tar metadata. It was rebuilt as USTAR; the browser dashboard then confirmed: “Restored 5 question reviews, 1 stimulus reviews, and 7 image segments.” The restore used the dashboard's production import route. The two rejected archive attempts did not change hosted state.

A fresh export after the successful restore verified:

- Questions: `mcq-2008-69-44` (`rc18c0a3c`), `mcq-2008-1-29` (`rd9a187c`), `mcq-2024-12-2084` (`rb7fe7c21`), `frq-2005-1-6` (`r7a97d6df`), and `frq-2005-3-8` (`r86a14332`); all `pending_review`.
- Shared stimulus: `stimulus-2008-mcq-1-3-page29` (`r43aa0acd`); `pending_review`.
- Images: 7 segments totaling 1,120,906 bytes. Every segment's exported byte length and SHA-256 matched the PNG bytes in the same fresh export.
- All 17 canonical stimulus associations were preserved. Questions `mcq-2008-1-29`, `mcq-2008-2-29`, and `mcq-2008-3-29` link to the restored shared stimulus.
- `reviewHistory` contains 0 events; `cropRevisions` contains 0 rows; six target-record timestamps remain. No temporary review-history entries remain.
- Hosted dashboard statistics show 5 questions with PNGs, 7 stored PNG segments, 5 pending, 0 accepted, 0 rejected, and 1,537 not generated.

The existing branch test files were run against an isolated temporary store and synthetic catalog: `node --test tests/question-review-backup.test.mjs tests/question-image-review.integration.test.mjs` — 11 passed. Coverage includes saving a changed crop as a replacement image revision and invalidating its prior approval, invalidating dependent MCQ approval when a shared stimulus changes, local backup export/import round-trip and conflict protection, and version-2 image manifest byte-length/SHA-256 validation.

Still unverified: browser-level PDF.js crop editing and raster regeneration end to end on a separate isolated preview. That UI path was not exercised against the genuine hosted records. A separate re-import of the fresh production export was also not run against D1/R2; the production import route was verified by the requested baseline restore, and backup round-trip behavior was exercised in the isolated test suite. Phase 3, the published ChemAtlas Site, and GitHub `main` were not touched.
