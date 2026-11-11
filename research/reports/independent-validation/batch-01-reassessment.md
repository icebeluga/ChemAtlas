# Batch 1 visual reassessment — crop quality vs. review routing

This is a separate reassessment of four Batch 1 examples after a reviewer identified visual defects. The original observations and classifications remain preserved in [`batch-01-report.md`](batch-01-report.md) and `batch-01-evidence.json`; those files were not edited. These four examples are development/debugging cases and do not count as independent validation evidence. The preregistered 40-question sample is preserved unchanged.

## Evaluation dimensions

- **Content completeness:** all necessary prompt text, choices, figures, data and continuation material are present.
- **Crop cleanliness:** unrelated question text, page furniture and excessive response space are excluded; whitespace needed for a response template is allowed.
- **Readability:** text and graphical details remain legible at the generated crop resolution.
- **Review routing:** uncertainty or source limitations require manual review. This is reported separately; routing never converts an incomplete crop into an extraction pass.

Panel PNGs are rendered from the unchanged source PDFs at 2×. Coordinates below are PDF points `[x0, y0, x1, y1]` in the catalog’s one-based page numbering. Current detector revision is recorded in `batch-01-reassessment/proposals.json`.

## Case results

### `frq-2006-6-25` — bank-01, pages 25–26

- **Original coordinates:** p25 `[0, 55, 612, 525.06]`; p26 `[39.68, 55.17, 583.2, 396.28]`.
- **Updated ordered segments:** p25 `[25.98, 55.00, 583.20, 582.72]` (confidence 0.82/high, segment review false); p26 `[39.68, 55.17, 583.20, 396.28]` (0.36/low, segment review true). Question-level review remains required because continuation detection is uncertain.
- **Recovered:** the boxed statement beneath part (c)(ii), including the claim about boiling water producing hydrogen and oxygen molecules. Molecular structures, equations, parts (a)–(c), all four reaction-energy diagrams and part (d) remain in page order.
- **Removed:** page copyright/footer and printed page numbers. No unrelated question is present.
- **Whitespace/readability:** p25 has moderate right-side whitespace because the equation and boxed statement span the page; all structures and math are legible. p26 retains the diagram row’s horizontal extent and has modest bottom whitespace.
- **Verdicts:** completeness **pass** across both pages; cleanliness **pass**; readability **pass**; review routing **manual review for continuation**, correctly separated from extraction quality.
- **Evidence:** `batch-01-reassessment/frq-2006-6-25-segment-{1,2}.png`.

### `mcq-2014-49-1464` — bank-05, page 1464

- **Original coordinates:** `[138.02, 543.91, 476.12, 678.86]`.
- **Updated segment:** `[138.02, 267.99, 476.12, 678.86]` (0.82/high, manual review false).
- **Recovered:** the table header and all rows for acetone, 1-propanol and butane, including structural formulas and molar masses; the question stem and all four choices A–D are included.
- **Removed:** the preceding Question 48 stem and choices, which lie above the table; copyright/footer and page number are outside the crop.
- **Whitespace/readability:** little extraneous vertical whitespace; table borders, names, formulas, masses and choices are legible. The crop includes the table as part of the same ordered segment because it is the explicit “table above” dependency.
- **Verdicts:** completeness **pass**; cleanliness **pass**; readability **pass**; review routing **automatic proposal**. Visual check found no reason to block this source.
- **Evidence:** `batch-01-reassessment/mcq-2014-49-1464-segment-1.png`.

### `frq-2017-3-1157` — bank-04, pages 1157–1158

- **Original coordinates:** both pages `[18, 40, 577.2, 796.92]` (full-page proposals).
- **Updated ordered segments:** p1157 `[29.00, 73.00, 566.00, 731.00]` (0.72/medium, manual review true); p1158 `[45.50, 70.00, 575.00, 207.50]` (0.36/low, manual review true).
- **Preserved:** p1157 prompt, the response box required to draw the ozone structure, equations, all lettered parts, and the referenced graph with axes/labels. p1158 contains the complete continuation (d)(i)–(iv). The graph precedes the continuation in the ordered segments, so its reference remains accessible.
- **Removed:** the long ruled response-writing area on p1158, page-footer/copyright material, and printed page number. p1157’s blank Lewis-structure box remains because it is explicitly part of the task; it is not ordinary answer-writing space.
- **Whitespace/readability:** p1157 necessarily retains the large drawing template and has some whitespace around the graph; scanned print is softer than native text but legible. p1158 is tightly bounded around the four subparts with about 14 points of lower padding and no answer lines.
- **Verdicts:** completeness **pass**; cleanliness **pass, with an essential response template retained**; readability **pass with scan limitation**; review routing **manual review on both pages**, required because OCR geometry cannot guarantee scan completeness.
- **Evidence:** `batch-01-reassessment/frq-2017-3-1157-segment-{1,2}.png`.

### `mcq-2002-7-606` — bank-03, page 606

- **Original coordinates:** `[286.9, 126.29, 585.03, 760.68]`.
- **Updated ordered segments:** shared stimulus `[286.90, 130.29, 560.85, 393.75]` (0.72/medium, manual review true), then question body `[306.64, 496.93, 571.03, 543.67]` (0.68/medium, manual review true). Both use the same shared-context ID. The body’s lower padding was increased after the first regenerated panel exposed a clipped final line; the geometry regression now requires at least 8 points below the final line box.
- **Preserved:** shared phase-diagram prompt, full diagram and A–E choice set in the first segment; target Question 7’s complete stem in the second segment. Questions 5 and 6 are linked to the same stimulus but their stems are not repeated in Q7’s body.
- **Removed:** unrelated neighboring stems, page directions/header, continuation arrow, and printed page marker.
- **Whitespace/readability:** first segment follows the diagram/options block and has moderate internal whitespace due to the scanned two-column layout; second is tightly bounded with safe padding. Scan resolution remains a limit.
- **Verdicts:** completeness **pass after final geometry correction**; cleanliness **pass**; readability **pass with scan limitation**; review routing **manual review for full-page raster source**.
- **Evidence:** `batch-01-reassessment/mcq-2002-7-606-segment-{1,2}.png`.

## Aggregate reassessment

| Dimension | Result |
| --- | --- |
| Content completeness | 4/4 questions pass after corrections |
| Crop cleanliness | 4/4 pass; the 2017 drawing box is intentionally retained as task content |
| Visual readability | 4/4 usable; the two scanned sources (2017 and 2002) retain a scan-quality limitation and manual review |
| Review routing | 2006 continuation, 2017 scans and 2002 raster are manually reviewed; 2014 table dependency is resolved and proposed automatically |

These four reassessed examples do not support a corpus-wide reliability claim. They are excluded from subsequent independent validation because they informed code and tests.

## Regression and evidence files

`tests/test_crop_quality_regressions.py` covers the four cases using actual catalog PDFs, geometry and image bounds. `tests/test_real_pdf_failure_regressions.py` also includes the corrected 1984 printed-page-number geometry check. The proposals JSON and seven rendered source/crop panels are in `batch-01-reassessment/`. Original PDF inputs were not changed. Evidence checksums are in `evidence-manifest.json`.


## Execution checkpoint

The bounded full suite completed successfully: `python -m unittest discover -s tests -v` — **32 passed, 0 failed**. This includes the new crop-quality cases, detector regression suite, source-region export tests, real-PDF failure regressions, and the corrected 1984 page-number geometry regression. This is regression evidence, not independent generalization evidence.
