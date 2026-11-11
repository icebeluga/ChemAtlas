# ChemAtlas Phase 2 recovery checkpoint

Date: 2026-11-11
Working branch: work/automatic-pdf-boundaries
Remote head before checkpoint: 5b75b4774fb257299a6bae062970cfadb95db664
Original PDF baseline recovered from the branch archive; latest local detector edits were interrupted by loss of the execution environment and are not included in this branch checkpoint.

## Source recovery

- Recovered and opened all eight original bank PDFs under public/source. PyMuPDF parsed all eight successfully; catalog contains 1,542 unique question IDs and source mapping covers 2,159 pages.
- The PDFs were obtained from an authenticated archive of the feature branch because connector file reads do not return large binary bytes and Git CLI authentication was unavailable.
- Filenames are bank-01.pdf through bank-08.pdf. Their verified byte sizes and SHA-256 hashes are recorded in research/source-manifest.json.
- The full-corpus detector was run repeatedly. The latest completed corpus pass before the final local refinements analyzed 1,542 questions and marked 309 for manual review. This is an interim count: rerun after restoring the latest detector edits before reporting final metrics.

## Detector and real-PDF audit

- The branch already includes commit 361926d1d6dbd1611f98aa782d4f2c295784b83e (detector refinement) and 5b75b4774fb257299a6bae062970cfadb95db664 (real-PDF regression test).
- In the interrupted workspace, the 2005 FRQ Question 1 proposal was visually checked against its original PDF. The corrected crop kept its equation and all five subparts while excluding the exam header/footer. Nine detector tests passed at the last completed test run, including real-PDF tests for this question and an FRQ continuation.
- Additional unsaved local refinements were made for answer-choice marker extraction, prior-crop-informed columns, stand-alone next-question numbers, shared question groups, continuation pages, footer removal, text-to-catalog mismatch, and graphics adjacent to the question body. These edits were not committed before the environment disappeared. Treat them as lost/unverified; recover by reapplying the changes from the conversation or rerun from the workspace if it returns.
- Visual sample and holdout contact sheets were generated locally but were not committed. Audit observations included false adjacent-question inclusion, clipped answer choices/graphics, pages requiring manual review, and shared stimulus blocks separated from the target by other numbered questions. Do not characterize the sample as passing until the latest algorithm is restored and all sample/holdout sheets are reviewed again.
- Do not use the interim final proposal JSON files as acceptance evidence. They were generated locally and were not committed.

## Fresh hosted D1/R2 snapshot

A new read-only export was inspected at 2026-11-11 02:22:33 UTC. No hosted D1/R2 write, restore, reset, crop edit, upload, approval, or deletion was performed during this recovery work.

The snapshot differs from the older historical baseline. Preserve the current state; do not restore the old baseline automatically.

- Question records: 5 total — frq-2005-1-6 is accepted; frq-2005-3-8, mcq-2008-1-29, mcq-2008-69-44, and mcq-2024-12-2084 are pending_review.
- Shared stimulus record: 1 pending_review — stimulus-2008-mcq-1-3-page29.
- R2 PNG objects: 8 segments, 1,303,129 bytes (historical baseline was 7 segments / 1,120,906 bytes).
- All eight object byte counts and SHA-256 values matched the backup manifest and D1 image metadata.
- Canonical stimulus associations: 17. Temporary test-history entries: 0.
- Review history: two events for frq-2005-1-6 (crop edit, then acceptance). Crop revision history: two records for that question. Preserve this valid post-checkpoint user edit.
- The accepted crop revision is r619cfa9. It contains one PNG segment (182,223 bytes; SHA-256 abeca42d674871f1d157ec422b6df45095bf19cdc6365b751c5cd8b98ceb94a2).
- The other seven verified PNGs are the stimulus-2008-mcq-1-3-page29, frq-2005-1-6 prior revision, two frq-2005-3-8 segments, mcq-2008-1-29, mcq-2008-69-44, and mcq-2024-12-2084 objects listed in the exported backup manifest.

## Remaining Phase 2 work

- Rerun current detector code on the 1,542-question catalog; recalculate question-level and segment-level confidence/manual-review counts.
- Regenerate durable final and holdout contact sheets; visually classify at least 20 questions plus 10 disjoint holdout questions, including 2005 FRQ Question 1.
- Verify browser crop edit → PDF.js PNG regeneration → R2 upload → D1 revision persistence → refresh. This was not completed: the local browser preview returned connection refused and the cloud browser could not reach the local server.
- Fix and test the backup round-trip defect. The current importer still has a 48 MiB request limit, and D1 restoreSnapshot still rejects more than 75 statements. No resumable large restore was implemented or tested; do not begin Phase 3.
- Image statistics source changes were drafted locally but not saved or tested. The hosted snapshot's actual count is 8 segments and 1,303,129 bytes.
- No destructive test was run against genuine hosted records. No restore was attempted.
- GitHub main, the public UI recovery branch, and the published ChemAtlas Site were not modified.

## Decision

PHASE 2 INCOMPLETE. Blocked by unsaved/unverified latest detector refinements, unfinished full visual/holdout audit, unverified browser regeneration, and missing resumable large-archive recovery. Resume only on work/automatic-pdf-boundaries and preserve the current hosted state.
