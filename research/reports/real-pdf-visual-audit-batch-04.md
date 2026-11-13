# Real-PDF visual audit - batch 04

Detector revision: 144870a0f7d8b717f596e79cff48751c79b8c3f1. All 13 detector tests passed locally with PyMuPDF 1.26.7. All eight original PDFs opened and the catalog contained 1,542 unique question IDs.

To keep the batch bounded, the detector ran on the eight requested IDs and all catalog questions sharing their pages (26 total), preserving same-page boundary context. Source pages and proposed crops were rendered side by side at 2x.

| Question | Result | Visual finding |
|---|---|---|
| mcq-2008-1-29 | Pass | Shared answer list and target stem are complete. Questions 2 and 3 are excluded. |
| mcq-2008-69-44 | Pass | Stem, chemical subscripts and five choices are complete. Adjacent questions and the other column are excluded. |
| mcq-2024-12-2084 | Minor issue | The scanned fallback preserves the graph, axis labels, stem and all four choices. Excess blank space and printed footer remain. The proposal is flagged for manual review. |
| frq-2023-1-442 | Fail | Page 442 includes section directions. Page 443 retains the data table and parts (b)-(e) but omits the heating/setup paragraph above the table. Page 444 preserves the battery diagram, reduction table and part (f), with a clipped continuation header at the top. Already routed to manual review. |
| mcq-2023-1-1756 | Fail | A scoring-guide source reveals the correct choice. The crop also cuts the stem horizontally and retains the exam heading. The detector did not flag manual review. This requires a source review and a separate geometry fix. |

Batch totals: 2 pass, 1 minor issue, 2 fail. Twenty distinct tuning questions have now been visually classified across four batches.

## Recheck of batch 03 findings

- frq-2021-1-399, page 401: the catalyst setup and reaction equation are now visible above part (e), and the graph and remaining parts are preserved.
- mcq-2018-17-1201: the preceding bank PDF now supplies a separate table segment with all data, including the structural formulas. The table's bottom rule is clipped. Question 17 and its four choices are intact in the second segment.
- mcq-1984-8-120: the printed page number still appears in the rendered crop despite the passing text-based regression. The shared choices and stem are complete.

## Holdout sample

Selected before rendering, with no IDs reused from the tuning sample. Keep the detector revision fixed while classifying these ten questions in groups of five.

- mcq-2008-70-44
- mcq-2022-1-1617
- mcq-2023-1-1720
- mcq-2024-1-2129
- frq-2022-1-420
- mcq-2022-1-1669
- mcq-2023-1-1812
- mcq-2024-12-2132
- frq-2024-1-464
- frq-2024-1-484
