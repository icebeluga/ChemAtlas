# ChemAtlas automatic boundary detection checkpoint

Date: 2026-11-11  
Working branch: `work/automatic-pdf-boundaries`  
Starting baseline: `work/private-review-deployment` at `19d94f890204dfedb80863980473b48d00b81b70`  
Latest feature commit before this checkpoint: `866b66d75653dc4c03befe6a5c9314be955138f1`

## Implemented and saved

- Added `research/detect_question_boundaries.py`, a general PyMuPDF corpus proposal pass. It reads catalog question IDs/types/numbers, page-to-PDF mappings, existing crop rectangles, and linked shared stimuli.
- Extracts line text boxes, image placement boxes, vector drawing bounds, page rotation, one/two-column layout, numbered starts, adjacent question starts, MCQ choice sequences, and FRQ subpart labels.
- Keeps continuation pages and weakly supported boundaries in manual review. Image-only/scanned pages retain an existing crop unchanged or return a null rectangle; the detector does not substitute a full-page crop.
- Emits measurable signals and a deterministic 0–1 evidence score. The score is explicitly not statistically calibrated.
- Default operation writes only a proposal JSON. Optional `--apply-high-confidence --catalog-output PATH` writes a separate catalog containing only fully high-confidence, non-manual proposals. It never overwrites the input catalog.
- Added `tests/test_question_boundary_detection.py` and `research/AUTOMATIC_BOUNDARY_DETECTION.md`.

## Verification completed

- `python -m py_compile research/detect_question_boundaries.py` passed.
- `python -m unittest tests/test_question_boundary_detection.py -v` passed: 7 tests covering MCQ, FRQ, image/vector inclusion, shared context, columns, rotation, multi-page continuation, scanned-page handling, and safe catalog application.
- Rendered and visually inspected a synthetic MCQ crop: introductory equation retained, all four choices and diagram included, following question excluded.
- Re-fetched all changed files through the GitHub connector and matched their text byte-for-byte to the local working copies.

## Full-corpus and UI work still unverified

- The branch contains eight source bank PDFs, but the pruned runtime has no local checkout. GitHub file access returned empty content for the large `public/source/bank-01.pdf`; therefore the detector has **not** been run across the actual question bank and no actual-PDF crop has been visually inspected in this pass.
- The browser review dashboard does not directly display proposal confidence yet. The script produces an offline proposal JSON and optional separate catalog output for review; no web UI, production image generation, deployment, or hosted record changes were made.
- Before applying catalog proposals, obtain the source PDFs in a normal checkout, run the detector, inspect representative real MCQ/FRQ/scan/multi-column crops, review ambiguous output, and regenerate imagery only through the approved isolated/reversible workflow.

## Hosted D1/R2 checkpoint

No hosted D1/R2 calls were made during this implementation pass. The last verified recovery export from the prior Phase 2 session reported:

- Pending question reviews: 5 — `mcq-2008-69-44`, `mcq-2008-1-29`, `mcq-2024-12-2084`, `frq-2005-1-6`, `frq-2005-3-8`.
- Pending shared-stimulus review: 1 — `stimulus-2008-mcq-1-3-page29`.
- Original PNG segments: 7, totaling 1,120,906 bytes, with hashes checked against a fresh export in `docs/private-review-deployment-phase-2-finalization.md`.
- Review history and crop revision history: 0 entries; no temporary test-history entries.
- All 17 canonical stimulus associations were preserved; dashboard image stats were 5 questions with PNGs, 7 segments, pending 5, accepted 0, rejected 0, and 1,537 not generated.

That is the last observed hosted state, not a fresh live read in this pass. Do not declare Phase 2 complete without a new read-only D1/R2 export and the remaining PDF.js editor/raster regeneration verification. No Phase 3 work, published Site change, or GitHub `main` change was made.
