# Crop Verification Progress

## Scope of this checkpoint

This checkpoint corrects a confirmed 2013 MCQ crop, separates the verified
2008 Questions 1–3 common answer-category stimulus from their individual
stems, and adds a vector-preserving source-region PDF exporter.

## Current inventory and verification counts

The catalog currently contains 1,285 MCQs and 257 FRQs. Geometry validation
passes for 1,823 question regions and one shared-stimulus region covering all
1,542 records. The unique-region count fell from 1,826 because the 2008 common
region is now stored once instead of being repeated in three question records.
Geometry validation is not content verification.

| Type | Total | Visually verified | Geometry checked | Needs visual review |
| --- | ---: | ---: | ---: | ---: |
| MCQ | 1,285 | 4 | 1,285 | 1,281 |
| FRQ | 257 | 1 | 257 | 256 |

One shared-stimulus group is visually verified: 2008 MCQ Questions 1–3 on
original page 29. Its common answer-category block is stored once in
`stimuli.json`; each question retains its own individual stem crop. Selecting
one question includes the stimulus. Selecting all three emits the stimulus
once. Other groups have not yet been audited, so their count is unknown.

The geometry heuristic currently flags 334 near-full-page regions: 131 MCQ
regions and 203 FRQ regions. These are review leads, not automatic crop errors.
An additional 1994 MCQ crop is explicitly marked `needs_review` because the
apparatus image appears close to the crop boundary.

## Confirmed correction

`mcq-2013-33-961`, source `/source/bank-04.pdf`, original page 961, was reduced
from the entire page to `[40, 34, 300, 174]` points. Visual review confirmed
that it includes the complete stem and choices A–E while excluding the
unrelated notice about removed Questions 34–36.

## Export and tests

`export_source_regions.py` composes source PDF regions into a new PDF by placing
the original PDF pages as vector content. It includes linked stimuli and
deduplicates them within a selected question batch.

Diagnostic PDFs are in `research/diagnostics/`. Four automated tests pass,
covering a single shared-stimulus MCQ, three questions sharing one stimulus,
the corrected MCQ, and a complete 2005 FRQ.

## Remaining work

Most of the bank remains visually unreviewed. The shared-stimulus scan is only
a verified initial example, not a full-catalog detector. Multi-page FRQs,
diagram boundaries, crops that include answer keys, and two-column question
boundaries still require systematic review. Do not describe the catalog as
fully extraction-ready until that work is complete.
