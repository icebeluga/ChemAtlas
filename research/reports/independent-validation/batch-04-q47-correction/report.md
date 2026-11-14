# Q47 development correction — scanned two-column page

## Frozen corrected detector

- Detector SHA-256: `11648b5870d8a988b7ec0150b6efa7ad5417a358517aa7301f091d23d852a736`
- Validation baseline: `d930d141a4b6dff9562746586ef912598e742682`
- Q47 status: development-only, excluded from independent validation.

## Provenance and root cause

The record `mcq-2024-47-2105` correctly points to catalog page 2105, which maps to physical page 5 of `bank-08.pdf`. The full-page source scan visibly contains Question 47 in the left column. The diagram and its N/O legend sit above the stem in that same column; Q49 is in the right column and Q48 begins below Q47. No existing shared-stimulus record links Q47 to another region; its particle diagram is a local graphical dependency.

The record's `textPreview` begins with Q47, but `fullText` begins with Q49 and interleaves OCR from Q49 and Q48. Thus the page association is correct; the catalog text is contaminated by multi-column OCR. Global sparse-page OCR also mis-grouped columns, clipped the right edge of the stem, and detected only three target answer markers. The whole-page raster is excluded from vector-graphic bounds, so the referenced particle diagram was not measured. Existing routing correctly required manual review but the resulting crop was incomplete. The original catalog record and Batch 4 revision-3 failure remain unchanged.

## Corrected proposal

- Source: `bank-08.pdf`, catalog page 2105 / physical PDF page 5.
- Previous revision-3 crop: `[22.00, 198.00, 243.38, 422.00]` PDF points. It omitted the diagram and clipped the stem/choice set.
- Corrected proposal: one ordered region, page 2105, `[${region['rect'].map(x=>Number(x).toFixed(2)).join(', ')}]` PDF points. A single region is suitable because the diagram and question body are in the same column with only a short gap; splitting would add no useful separation.
- Segments: 1. Region order 1 contains particle diagram and legend, Q47 stem, and choices A–D.
- Excluded: Q49/right column, Q48/below, page number, footer, GO ON notice, Studocu label, and QR overlay.

## Quality assessment

- **Completeness: pass on visual inspection.** The particle diagram/legend, full stem, assumption sentence, and choices A–D are present. Column-specific OCR at 3× scale detects all four markers in sequence.
- **Cleanliness: pass.** The crop is constrained to the left column and ends above Q48. It excludes adjacent Q49 and all page furniture.
- **Readability: pass with scan limitation.** The molecular particles, N/O legend, formulas, subscripts, and answer labels are visually legible at the source scan resolution.
- **Routing: manual review required.** The source is a full-page raster and the catalog `fullText` starts with Q49, not Q47. The correction records `catalogQuestionNumberMismatch=true`; scan review and catalog-text reconciliation remain necessary. The proposal's heuristic confidence does not override these blockers.

## Frozen failure integrity

Q47 is development data. The original Batch 4 revision-3 result, frozen detector hash, and selection lock are preserved. This correction is not independent validation evidence. No catalog mapping, source PDF, hosted record, or deployed component was edited.

## Regression verification

`python -m unittest discover -s tests -v` passed **45 tests, 0 failed, 0 skipped**. The Tesseract-dependent real-PDF scanned-page regressions executed using Tesseract 5.5.0. This is focused regression evidence only; Q47 remains a development example and provides no independent accuracy evidence.
