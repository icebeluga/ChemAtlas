# Real-PDF visual audit - holdout 02

Fixed detector revision 144870a, PyMuPDF 1.26.7. Five IDs preregistered in batch 04, ten rendered segments. Detection included same-page catalog neighbors.

| ID | Result | Visual finding |
|---|---|---|
| mcq-2022-1-1669 | Fail | Complete crop but the scoring guide marks the correct choice. High confidence (0.86), no manual-review flag. Same stem as holdout-01 ID mcq-2022-1-1617. |
| mcq-2023-1-1812 | Pass | The complete mass spectrum, labels, stem and choices are present. The directions and adjacent questions are excluded. |
| mcq-2024-12-2132 | Fail | The right boundary cuts the stem and three choices on a single-column page. Medium confidence (0.76), no manual-review flag. |
| frq-2024-1-464 | Fail | Page 465 omits the titration setup above the plot. Page 466 omits the experiment table, part (d)(iii), and the response graph. Parts (e)(i)-(iii) are present on pages 466-467. Manual review was flagged. |
| frq-2024-1-484 | Fail | Page 485 omits the prose introducing the two solutions, though the labeled diagram and parts B-C remain. The source is visibly dated 2025, while the catalog ID says 2024. Manual review was flagged. |

This batch: 1 pass, 0 minor issues, 4 fail. Across the two holdout batches: 1 pass, 1 minor issue, 8 fail. These ten IDs are disjoint from the 20 tuning IDs, with repeated stems and shared source pages documented in the reports. The selected sample does not estimate corpus-wide accuracy.

Phase 2 acceptance remains open. The current detector can include adjacent choices, misclassify single-column layouts, omit continuation material above tables or plots, and pass through sources that expose the answer. No hosted review records were changed and no Phase 3 generation was started.
