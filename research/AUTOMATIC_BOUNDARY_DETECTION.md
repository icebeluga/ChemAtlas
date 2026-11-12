# Automatic question boundary proposals

`research/detect_question_boundaries.py` analyzes the question catalog and source PDFs and writes a **proposal file**. It does not alter `public/questions.json`, reviews, approval state, or generated images. Phase 2 automatic proposal application is disabled: all outputs remain proposals until a person reviews and accepts them.

```bash
python research/detect_question_boundaries.py \
  --root . \
  --pdf-root public \
  --output /tmp/question-boundary-proposals.json
```

The former `--apply-high-confidence` option is retained only to fail safely for older scripts; invoking it now returns an error and writes no catalog.

```bash
python research/detect_question_boundaries.py \
  --root . --pdf-root public \
  --output /tmp/question-boundary-proposals.json \
  --apply-high-confidence \
  --catalog-output /tmp/questions.with-boundary-proposals.json
```

The script uses each question's ID/type/number, page mapping, stored `sourceRegions`, and shared-stimulus links as its source selection and spatial prior. PyMuPDF extracts line-level text boxes, image placements, vector drawing bounds, and page rotation. It detects numbered question starts, metadata-matched next-question starts, MCQ A–E markers, and FRQ lettered subparts. It checks full text-box widths, preserves wrapped final choices, recognizes shared-question graph directions, captures referenced upstream equations, and can propose an adjacent FRQ continuation when the next sequential subpart is found. Those inferred associations remain manual-review only.

Scanned or image-only pages have no reliable text anchors. With a stored crop, the script returns that prior and sets `manualReview: true`; without one, `rect` is `null`. It never silently substitutes the full page. Rotation and multi-column evidence are recorded in each result.

## Proposal evidence

Each page proposal includes:

- `confidence`: a transparent 0–1 evidence score, not a calibrated probability.
- `confidenceBand`: high (`>= 0.78`), medium (`>= 0.58`), or low.
- `manualReview`: true for sparse text, a missing expected question start, or score below 0.58.
- `signals`: candidate-crop and full-page text character counts, exact start match count, next-boundary presence, detected answer-choice/subpart count and sequence, included graphics and shared stimuli, column count, and page rotation.
- `reasons`: human-readable signals and any limitation that triggered review.
- `automaticApplicationEnabled: false` and `approvalStatus: proposal-only`: proposal confidence and routing diagnostics never constitute approval.

Score contributions are fixed and inspectable: question-start match 0.32; next-question boundary 0.18; at least 80 candidate-crop text characters 0.18 (25–79 gives 0.08); a usable MCQ choice sequence or at least one FRQ subpart 0.14; page graphics or shared context 0.10; and a prior crop 0.08. Sparse-text pages are always manual-review cases. These thresholds are conservative routing rules and have not been statistically calibrated.

## Validation

The isolated unit tests create synthetic text PDFs with MCQ choices, FRQ subparts, vector graphics, shared context, two-column layout, page rotation, a multi-page FRQ, and a text-poor scan. They verify crop geometry and ambiguity routing without modifying production records.
