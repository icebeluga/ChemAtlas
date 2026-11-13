# Batch 3 correction checkpoint — development cases

## Scope and separation

These are two cases that exposed defects in the frozen Batch 3 detector. They are development data for the revised detector and are excluded from independent validation accuracy. The original Batch 3 results in `batch-03-report.md` and `batch-03-frozen-results.json` remain unchanged and continue to describe detector commit `66445d0ba511f1e3167c472430d3d99ee69ef3fd` only. Original sample selection and source PDFs were not changed.

The revised detector SHA-256 is `24d7bc01539de572348d4303b99decde8a5c3a9b5e0fa92622dcbff54d644777`.

## Case 1 — `frq-2008-4-896`, bank-03, pp. 896–897

- **Before:** p. 896 `[26, 169.03, 586.73, 624.8]`; p. 897 `[46, 14.23, 581.81, 426.78]` (PDF points). The continuation crop included the unrelated two-line “2008 AP Chemistry Free-Response Questions (Form B)” title.
- **After:** p. 896 unchanged; p. 897 `[46, 60.05, 581.81, 426.78]`. Segment order remains p. 896 then p. 897.
- **Recovered/preserved:** The question setup, worked example, part (a), and continuation parts (b) and (c), including their response boxes/lines. Visual inspection shows the continuation now begins at part (b); no subpart is clipped.
- **Removed:** The page title header and page footer/page number. The crop retains blank response areas integral to the printed FRQ response template; this is a paper FRQ rather than a question-only MCQ.
- **Completeness:** PASS across both ordered segments.
- **Cleanliness:** PASS for the corrected continuation; no exam title/footer. Segment 1 retains the question’s printed directions and example as context.
- **Readability:** PASS; text, equations, and response areas are legible.
- **Review routing:** Manual review remains required (low-confidence continuation, 0.36). The first segment is 0.82/high and not individually flagged, but question-level review remains true.
- **Evidence:** `batch-03-correction-panels/frq-2008-4-896-segment-1.png` and `...segment-2.png`.

## Case 2 — catalog ID `mcq-2018-4-1945`, bank-07, p. 1945

- **Before and after coordinates:** `[26, 33.05, 583.84, 376.09]` PDF points; the crop content/geometry does not change. Segment order remains p. 1945 only.
- **Visual content:** The crop contains question 4’s complete cobalt calibration-graph stimulus, axes/values, stem, sample preparation context, and parts (a)–(c). It excludes the blank answer-writing area below the question, copyright/footer text, and printed page number.
- **Completeness:** PASS.
- **Cleanliness:** PASS; reasonably tight around question content, with the graph intact and no neighboring question.
- **Readability:** PASS; graph axes, labels, points, chemical notation and subscripts are visible.
- **Review routing:** Corrected from automatic to manual provenance review. The catalog type and exam identify an FRQ, as does the page content, while the immutable record ID begins `mcq-`. The detector now emits `questionIdTypeMismatch=true` and an explicit provenance-review reason. No catalog metadata or ID was rewritten.
- **Evidence:** `batch-03-correction-panels/mcq-2018-4-1945-segment-1.png`.

## Corrections and regressions

- Header matching now handles the split two-line AP Chemistry Form B title so the continuation crop starts below it.
- A question ID prefix/type mismatch now independently forces manual review, even when geometric confidence is high.
- Added focused tests `test_2008_frq_continuation_excludes_form_header_and_keeps_b_c` and `test_catalog_id_prefix_type_mismatch_blocks_automatic_approval` in `tests/test_crop_quality_regressions.py`.

## Verification

`python -m unittest discover -s tests -v`: **35 passed, 0 failed, 0 skipped**. The scanned-page OCR regression ran with Tesseract 5.5.0 installed. The correction panels listed above were visually inspected against the corresponding original PDF pages. This is regression/development verification, not new independent accuracy evidence. The Batch 3 frozen-revision score remains 4/5 complete-and-clean, 1/5 contaminated by a header, 1 correctly blocked case, and 1 false automatic approval; it must not be retroactively scored against this fix.

The detector confidence values remain heuristic signals, not calibrated probabilities. No reliability claim is made from this small, hand-selected sample.
