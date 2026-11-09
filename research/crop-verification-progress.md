# Crop Verification Progress

## Scope of this checkpoint

This checkpoint corrects a confirmed 2013 MCQ crop, separates the verified
2008 Questions 1–3 common answer-category stimulus from their individual
stems, and adds a vector-preserving source-region PDF exporter.

## Current inventory and verification counts

The catalog currently contains 1,285 MCQs and 257 FRQs. Geometry validation
passes for 1,823 question regions; the single shared-stimulus region is also
geometry-valid. The question-region count fell from 1,826 because the 2008
common region is now stored once instead of being repeated in three question
records.
Geometry validation is not content verification.

| Type | Total | Visually verified | Geometry checked | Needs visual review |
| --- | ---: | ---: | ---: | ---: |
| MCQ | 1,285 | 18 | 1,285 | 1,267 |
| FRQ | 257 | 1 | 257 | 256 |

One shared-stimulus group is visually verified: 2008 MCQ Questions 1–3 on
original page 29. Its common answer-category block is stored once in
`stimuli.json`; each question retains its own individual stem crop. Selecting
one question includes the stimulus. Selecting all three emits the stimulus
once. Other groups have not yet been audited, so their count is unknown.

The initial geometry heuristic flagged 334 near-full-page regions: 131 MCQ
regions and 203 FRQ regions. These are review leads, not automatic crop errors.
The persistent ledger now accounts for 250: 129 correct as-is, 22 tightened,
42 incomplete crops fixed, and 57 unresolved due primarily to mismatched source
identities. Eighty-four flagged regions remain unreviewed (74 MCQ, 10 FRQ).
The current geometry audit has 301 near-full-page warnings; those warnings are
not equivalent to the 84 remaining ledger items because corrections can also
remove warnings and some correct-as-is regions remain large for valid reasons.
An additional 1994 MCQ crop is explicitly marked `needs_review` because the
apparatus image appears close to the crop boundary.

## Confirmed correction

`mcq-2013-33-961`, source `/source/bank-04.pdf`, original page 961, was reduced
from the entire page to `[40, 34, 300, 174]` points. Visual review confirmed
that it includes the complete stem and choices A–E while excluding the
unrelated notice about removed Questions 34–36.

## Batch 10 (flagged regions 226–250 in one-based ledger order)

Visually reviewed all 25 original PDF source pages in the range. Fourteen
genuine MCQ records had page-start omissions or excessively broad rectangles;
updated their crop rectangles and visually checked the source-native crop
previews. The batch fixes include a clipped gas-collection apparatus,
photoelectron spectra, graph-based items, equation and table context, and
particle/molecular diagrams. Eleven records are explicitly unresolved because
the catalog identifies them as MCQs but their cited source pages contain
2012/2018 multipart FRQs; finding the matching MCQ pages is required before
changing those records. No shared-stimulus group was confirmed in this batch.

The batch ledger records 3 B corrections, 11 C incomplete fixes, and 11 E
unresolved items. Crop-level verified totals are 18 MCQs and 1 FRQ; automated
geometry validation alone is not counted as visual verification. A three-page
vector-preserving sample PDF from this batch was rendered and visually checked.

## Export and tests

`export_source_regions.py` composes source PDF regions into a new PDF by placing
the original PDF pages as vector content. It includes linked stimuli and
deduplicates them within a selected question batch.

Diagnostic PDFs are in `research/diagnostics/`. Four automated tests pass,
covering a single shared-stimulus MCQ, three questions sharing one stimulus,
the corrected MCQ, and a complete 2005 FRQ.

## Remaining work

The remaining 84 flagged regions still require source-page review, followed by
the rest of the unflagged catalog. The shared-stimulus scan is only a verified
initial example, not a full-catalog detector. Multi-page FRQs, diagram
boundaries, crops that include answer keys, and two-column question boundaries
still require systematic review. Do not describe the catalog as fully
extraction-ready until that work is complete.
