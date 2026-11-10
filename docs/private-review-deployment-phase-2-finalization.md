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
