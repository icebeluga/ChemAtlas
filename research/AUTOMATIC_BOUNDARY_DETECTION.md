# Automatic question boundary proposals

`research/detect_question_boundaries.py` analyzes the question catalog and source PDFs and writes a **proposal file**. It does not alter `public/questions.json`, reviews, approval state, or generated images. Review and apply proposals explicitly after visual inspection.

```bash
python research/detect_question_boundaries.py \
  --root . \
  --pdf-root public \
  --output /tmp/question-boundary-proposals.json
```

To prepare a separate catalog containing only high-confidence automatic updates (review it before replacing any catalog):

```bash
python research/detect_question_boundaries.py \
  --root . --pdf-root public \
  --output /tmp/question-boundary-proposals.json \
  --apply-high-confidence \
  --catalog-output /tmp/questions.with-boundary-proposals.json
```

The script uses each question's ID/type/number, page mapping, stored `sourceRegions`, and shared-stimulus links as its source selection and spatial prior. It can optionally write a separate catalog copy with only fully high-confidence, non-manual proposals applied; existing catalog files are never overwritten by that option. PyMuPDF extracts line-level text boxes, image placements, vector drawing bounds, and page rotation. It detects numbered question starts, metadata-matched next-question starts, MCQ A–E markers, and FRQ lettered subparts. It keeps multi-page records page by page and detects one or two text columns before locating the next boundary. Nearby equation/setup text and linked shared-stimulus regions are included above the question number where present.

Scanned or image-only pages have no reliable text anchors. With a stored crop, the script returns that prior and sets `manualReview: true`; without one, `rect` is `null`. It never silently substitutes the full page. Rotation and multi-column evidence are recorded in each result.

## Proposal evidence

Each page proposal includes:

- `confidence`: a transparent 0–1 evidence score, not a calibrated probability.
- `confidenceBand`: high (`>= 0.78`), medium (`>= 0.58`), or low.
- `manualReview`: true for sparse text, a missing expected question start, or score below 0.58.
- `signals`: candidate-crop and full-page text character counts, exact start match count, next-boundary presence, detected answer-choice/subpart count and sequence, included graphics and shared stimuli, column count, and page rotation.
- `reasons`: human-readable signals and any limitation that triggered review.

Score contributions are fixed and inspectable: question-start match 0.32; next-question boundary 0.18; at least 80 candidate-crop text characters 0.18 (25–79 gives 0.08); a usable MCQ choice sequence or at least one FRQ subpart 0.14; page graphics or shared context 0.10; and a prior crop 0.08. Sparse-text pages are always manual-review cases. These thresholds are conservative routing rules and have not been statistically calibrated.

## Validation

The isolated unit tests create synthetic text PDFs with MCQ choices, FRQ subparts, vector graphics, shared context, two-column layout, page rotation, a multi-page FRQ, and a text-poor scan. They verify crop geometry and ambiguity routing without modifying production records.
