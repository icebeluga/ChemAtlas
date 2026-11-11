# Real-PDF failure regression verification

Date: 2026-11-11 UTC  
Base branch revision: `b6ff6f34f971c8be713c292e939df7848ac5a60a`  
This report covers known diagnostic and contradiction cases that were previously examined. It is regression evidence, not an independent validation sample and not a statistical estimate of detector accuracy.

## Results

| Question | Coordinates by catalog page | Confidence / routing | Visual result |
|---|---|---|---|
| `mcq-2008-70-44` | 44 `[14.00, 322.92, 309.06, 443.32]` | 0.90 high; automatic | Starts below Question 69's choices; all five target choices remain. |
| `mcq-2022-1-1617` | 1617 `[9.44, 37.41, 581.27, 167.66]` | 1.00 high; manual | Yellow answer highlight is still visible in the original; annotation flag blocks approval. |
| `mcq-2023-1-1720` | 1720 `[19.98, 229.49, 321.30, 364.61]` | 0.90 high; automatic | Excludes booklet directions and the Question 2 reaction equation; all four choices remain. |
| `mcq-2024-1-2129` | 2129 `[14.75, 81.59, 454.93, 194.34]` | 1.00 high; automatic | Complete four numerical choices; booklet/progress-check heading excluded. Vector-rendered numerical expressions were checked in the rendered crop. |
| `frq-2022-1-420` | 420 `[0, 328.37, 594, 442.02]`; 421 `[31.43, 32.88, 571.18, 509.37]`; 422 `[24.34, 29.58, 563.90, 657.50]`; 423 `[31.62, 32.88, 571.29, 672.62]` | 0.36 minimum; manual | Retains initial setup, purification paragraph, physical-properties table, structures, titration curve, parts (e)-(h), and the later graph. Continuation pages remain manual-review only. |
| `mcq-2022-1-1669` | 1669 `[14.75, 55.00, 598.00, 219.31]` | 0.86 high; manual | The source is a marked scoring guide with a green correct-answer band; source-quality flag blocks approval. |
| `mcq-2023-1-1812` | 1812 `[29.13, 256.20, 309.95, 490.54]` | 1.00 high; automatic | Previously passing crop remains complete. Choice-label completeness is now independent of unreliable PDF object serialization order. |
| `mcq-2024-12-2132` | 2132 `[14.75, 80.84, 562.06, 186.74]` | 0.90 high; automatic | Correctly treated as one column; full stem and all four choices fit within the right boundary. |
| `frq-2024-1-464` | 464 `[0, 297.61, 612, 563.68]`; 465 `[40.63, 39.92, 581.44, 533.90]`; 466 `[33.35, 36.62, 572.81, 556.82]`; 467 `[75.15, 39.92, 574.35, 356.85]` | 0.36 minimum; manual | Continuations retain titration setup and graph, experimental table, later experiment text, and parts (ii)-(iii). Continuation segments require manual review. |
| `frq-2024-1-484` | 484 `[0, 77.04, 612, 510.33]`; 485 `[43.00, 67.76, 558.52, 417.67]`; 486 `[43.00, 67.76, 589.21, 620.64]` | 0.36 minimum; manual | Page 485 now retains the solution setup and particle diagram above B/C; the booklet header is excluded. The source identifies 2025 while the catalog identifies 2024; mismatch is flagged on affected regions and metadata is unchanged. |

The saved proposal JSON contains per-region coordinates, confidence signals, source-quality flags, and manual-review reasons for every listed question and same-page neighbor.

## Additional regressions

- `mcq-1984-8-120`: the actual `detect()` pipeline now returns page 120 `[28.28, 389.22, 318.84, 619.70]`, excludes the printed page number, and includes the Questions 8-9 shared answers and Question 8 stem. Confidence 0.72 (medium); no automatic high-confidence application.
- `mcq-2023-1-1756`: the marked 2023 scoring-guide source has `colored_answer_key_marking` and is manual-review only, despite confidence 1.00.
- `frq-2023-1-442`: pages 442-444 retain the starting setup/equation, experimental mass table and subparts, then the battery diagram, reduction-potential table, and roman-numeral parts. Continuation pages require manual review.

## Visual evidence

All 23 source-page/crop comparison panels were freshly rendered at 2x resolution and visually inspected. The compact multi-page PDF contact sheet and individual panels are supplied as session evidence; the committed proposal JSON preserves exact coordinates and confidence/review signals. Source PDFs and `public/questions.json` were not changed. Rendered panels can be reproduced with `research/render_real_pdf_audit_batch.py` and `research/reports/real-pdf-proposals.failure-regressions.json`.

## Batch 3 contradiction correction

The prior Batch 3 report's preserved 5/5 final re-check claim is withdrawn for `mcq-1984-8-120`. The earlier visual was based on a direct single-region detector call and did not match the real pipeline, which merges the catalog's two stored page-120 regions before crop generation. That actual pipeline output extended to y=761.25 and included the printed page number. The corrected pipeline output above ends at y=619.70; the regenerated comparison panel confirms the printed page number is outside the crop. A new regression exercises `detect()` and checks both crop geometry and extracted crop content. The other four Batch 3 questions were not rerun in this correction pass and remain recorded as prior-session results only.

## Verification

- Original detector tests: 13/13 passed.
- New failure-specific real-PDF tests: 11/11 passed.
- Source-region export tests: 4/4 passed.
- All three Python test modules were explicitly run together: 28/28 passed. (`unittest discover` does not recurse into this repository's non-package `tests/` directory, so the modules were named directly.)
- The new suite exercises crop text/geometry, choice completeness, source annotation and answer-key flags, continuation context and graphics signals, source-year discrepancy routing, and the actual 1984 detector pipeline.
- These 28 regression tests do not establish corpus-wide reliability. A fresh source-diverse sample is still required after known-defect fixes.

## Remaining review items

- Answer-key/annotated originals (`mcq-2022-1-1617`, `mcq-2022-1-1669`, `mcq-2023-1-1756`) need clean source PDFs or a person-approved clean crop before approval.
- FRQ continuations (`frq-2022-1-420`, `frq-2023-1-442`, `frq-2024-1-464`) remain explicitly manual-review cases even though required context is retained.
- `frq-2024-1-484` remains blocked until the 2025 source/catalog 2024 provenance discrepancy is resolved by a verified source record.
- The repaired examples were used in development; a fresh representative holdout and broader Phase 2 coverage review remain acceptance blockers.
