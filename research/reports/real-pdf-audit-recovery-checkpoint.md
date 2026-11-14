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

The recovered detector was rerun successfully after this checkpoint was drafted. The command completed in approximately 53 seconds and wrote `real-question-boundary-proposals.recovered.json`. The durable GitHub artifact is the byte-for-byte gzip-compressed file `real-question-boundary-proposals.recovered.json.gz`.

- Question results: 1,542 (262 high, 1,048 medium, 232 low).
- Page-segment results: 1,642 (294 high, 1,072 medium, 276 low).
- Manual-review questions: 309.
- Multi-page questions: 66.
- Shared-stimulus dependencies detected: 17.
- Missing question regions: 0; null crop rectangles: 0; invalid crop rectangles: 0.
- Text-poor page segments: 150.
- Material differences from stored crop rectangles: 655.
- Manual-review segments containing detected graphics: 91.
- Artifact SHA-256: `96159d1d2c9e46a85f79b10b8c75aac1a8ca77dc50fad4e7dbc19e81ce4784ef`.
- Compressed artifact SHA-256: `f139f72e77b4b0e83e6ccce9ab9c69f735c939d550b1301963390b6499e8937e`.

These are detector diagnostics rather than visual accuracy measurements. Confidence values are deterministic heuristic scores, not calibrated probabilities.

Next, render and classify a five-question real-PDF batch, save source-page and proposal previews plus exact findings, and commit that batch before starting the next five questions.

