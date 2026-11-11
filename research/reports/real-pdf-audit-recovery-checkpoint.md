# Real-PDF audit recovery checkpoint

Date: 2026-11-11 UTC

This checkpoint records work recovered after the execution workspace was pruned. It is an interim Phase 2 artifact, not a completion claim.

## Recovered and verified

- All eight original source PDFs are present under `public/source/` and open successfully with PyMuPDF.
- The catalog contains 1,542 unique question IDs.
- The recovered detector contains the latest local refinements for answer-choice markers, prior-crop-informed columns, numeric-only question starts, shared question groups, FRQ continuation pages, footer exclusion, catalog-text mismatch detection, and nearby graphical content.
- `python tests/test_question_boundary_detection.py -v` completed successfully: 9 tests passed, including real-PDF tests for 2005 FRQ Question 1 and the continuation page of 2005 FRQ Question 3.
- The latest completed recovered corpus artifact before the final detector edit is `real-question-boundary-proposals.final.json`. It contains 1,542 question results and 1,642 page-segment results. It flags 309 questions for manual review, contains 66 multi-page questions, and has question-level confidence bands of 279 high, 1,032 medium, and 231 low.

## Visual audit status

- 2005 FRQ Question 1 was visually verified against the original source page. The proposal preserves the introductory equation and subparts (a) through (e), while excluding the examination header and footer.
- Other inspected real cases exposed adjacent-question bleed, clipped choices or graphics, shared context separated from target questions, and scanned-page/catalog-text mismatches. These findings informed the recovered algorithm changes.
- The required 20-question tuning sample and 10-question disjoint holdout sample have not yet been fully classified. Do not treat the corpus confidence bands as visual pass rates.

## Safety and hosted state

- No hosted review record, approval, crop revision, D1 row, or R2 object was modified while producing this checkpoint.
- No Phase 3 bulk generation was started.
- The most recent read-only hosted snapshot remains 5 question records (1 accepted and 4 pending), 1 pending shared-stimulus record, 8 PNG objects totaling 1,303,129 bytes, 17 canonical stimulus associations, and no temporary test-history entries.

## Next bounded batch

1. Rerun the recovered detector against all 1,542 questions and save a newly named proposal artifact.
2. Render and classify a five-question real-PDF batch, saving source-page and proposal previews plus exact findings.
3. Commit that batch before starting the next five questions.

