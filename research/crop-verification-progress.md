# ChemAtlas Crop Verification Progress

## Current checkpoint

Branch: `work/question-crop-verification`  
Baseline commit: `d3e0b4723044371bcbdd2dc83357edad7a504d31`  
Checkpoint state: local work includes flagged-region batches 12–14 and a separate 2008 shared-context batch. No website deployment was performed.

## Current catalog and verification counts

| Measure | Current count |
| --- | ---: |
| Catalog questions | 1,542 |
| MCQ / FRQ records | 1,266 / 276 |
| Unique question records visually verified | 94 |
| Visually verified MCQs / FRQs | 68 / 26 |
| Visual-review records needing review | 2 |
| Unique questions not visually verified | 1,448 |
| Shared-stimulus groups explicitly recorded | 6 |
| Question regions geometry-valid | 1,814 |
| Shared-stimulus regions geometry-valid | 6 |
| Geometry errors / warnings | 0 / 240 |

The 1,448 not visually verified count is `1,542 - 94`; it does not imply these records are geometrically invalid. Automated geometry checks are not visual verification. Two additional records are explicitly in `needs_review` rather than counted as verified: one 1994 apparatus crop and the water-quality/diagram question from 2024 whose source watermark obscures part of choice D.

## Original 334 flagged-region reconciliation

The original 334 regions are all accounted for in `crop-backlog-ledger.json` across 14 batches. Counts reconcile exactly:

| Disposition | Count |
| --- | ---: |
| A. Correct as-is | 129 |
| B. Corrected boundary | 74 |
| C. Incomplete, fixed | 51 |
| D. Shared-stimulus issue resolved within flagged-region set | 0 |
| E. Unresolved with evidence and next action recorded | 80 |
| Not reviewed | 0 |
| **Total** | **334** |

“Accounted for” does not mean all crops are ready: 80 flagged regions remain unresolved because the cited page conflicts with the catalog identity/type/year or appears in a derivative scoring source, and one 2024 crop has a watermark over an answer choice. Ledger entries preserve original crops and specify the source reconciliation or clean-source evidence needed. Do not call these 80 fixed or verified.

The post-correction geometry audit still reports 240 near-full-page warnings. These are crop-area warnings, not confirmed crop defects, and need content-aware review; some large FRQ regions are legitimate.

## Flagged-region batches completed

Batches 1–14 process the full original flagged set. Batches 12–14 were the final batches:

- **Batch 12 (regions 276–300):** 17 corrected; 8 unresolved. Five records previously labeled MCQ were corrected to FRQ where the original pages show multipart free-response questions. Source-native export was visually inspected.
- **Batch 13 (regions 301–325):** 25 corrected; 10 mislabeled multipart FRQs corrected to FRQ. Crop boundaries and PDF export pages were visually checked.
- **Batch 14 (regions 326–334):** 8 corrected; 1 unresolved. The unresolved 2024 item has a Studocu watermark/QR obscuring part of choice D; no reconstruction was attempted. The corrected crops and export pages were inspected, including complete answer-choice diagrams.

Earlier batch-level details and region-specific evidence remain in the ledger. The current split is 129 A + 74 B + 51 C + 0 D + 80 E = 334.

## Supplemental 2008 common-context batch

The source pages for 2008 MCQs 4–17 were reviewed and five shared contexts were separated into reusable stimulus records:

- Q4–6: titration graph.
- Q7–9: common list of gas species.
- Q10–11: common terminology list.
- Q12–14: enthalpy/entropy combinations.
- Q15–17: reaction choices.

Each of the 14 questions has its own individual stem crop and an explicit stimulus association. Selecting one question emits its context; selecting all questions in a group emits the shared stimulus once. Q5, Q13, and Q16 were tested as standalone selections. Q4–6 were exported together to verify deduplication. All pages in the batch exports and the two standalone exports were visually inspected. Together with the previously recorded 2008 Q1–3 group, there are six verified stimulus groups. This is not a complete stimulus audit of all MCQs.

Evidence and exports are under `research/diagnostics/crop-batches/`; machine-readable records are in `research/stimuli.json`, `research/crop-visual-review.json`, and the supplemental section of `research/crop-backlog-ledger.json`.

## Validation

- `python -m unittest tests.test_source_region_export -v`: **4 tests pass**.
- `python research/audit_crop_geometry.py --root . --output research/crop-geometry-audit.json`: **0 geometry errors**, 1,814 question regions and 6 stimulus regions geometry-valid, **240 warnings** remain.
- Source crops were composed with PyMuPDF `show_pdf_page`, preserving vector PDF content for export samples.

## Remaining work

1. Resolve the 80 flagged-region source/identity or clean-source exceptions without guessing.
2. Review the 240 post-correction near-full-page warnings for content accuracy; area alone is not proof of an error.
3. Continue visual verification of the 1,448 unverified unique questions, prioritizing source/year batches and diagram-rich records.
4. Continue shared-stimulus detection across source PDFs beyond the six currently verified groups.
5. Continue FRQ completeness review across all years; only 26 of 276 FRQs are currently visually verified.

The local Git checkout has no `origin` remote configured, so pushing cannot be performed from this checkout as-is. Preserve the next local checkpoint and report this separately from content-processing completion.
