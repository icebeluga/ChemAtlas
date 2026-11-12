# Batch 6 — Frozen independent validation results

**Frozen detector:** `3df2cb9af033996a48735374fdb280fa91f6ac57` (`544a489d093dd124584efb89a5e5faf2aed4836f352ee2a7c9db88732e1f7216`)  
**Selection lock:** `a2d97d4b86a3712e70281e45323e942c6ce0ec5c`, committed before any proposal render.  
**Scoring:** all five locked questions and all eleven original-versus-proposal panels reviewed before changing the detector.

## Results

| Measure | Result |
|---|---:|
| Complete extractions | 3/5 |
| Clean crops | 4/5 |
| Readable crops | 5/5 (one scanned source has lower source quality) |
| Cases requiring manual review | 4/5 |
| Required cases routed to manual review | 4/4 |
| Proposals automatically applied | 0 |

## Question-level findings

- **Sample 22 — `mcq-2023-43-1731`: incomplete and unclean.** The crop starts within the question’s two-column area and cuts off the left side of the required graph and the beginning of the stem. The marker diagnostic correctly reports 0/4 choices; the proposal is manual-review only. See [panel](batch-06-panels/mcq-2023-43-1731-segment-1.jpg).
- **Sample 23 — `mcq-2023-34-1830`: complete, clean, readable.** Stem, diagram, table, and choices A–D are present; neighboring material is excluded. Manual review was not indicated, which matches the visual result. Proposal-only safeguard still prevents application. See [panel](batch-06-panels/mcq-2023-34-1830-segment-1.jpg).
- **Sample 24 — `frq-2024-2-2115`: complete and readable; clean within the scanned source quality.** Ordered segments cover the Lewis structure, equations, experimental diagrams/table, and parts a–f across pages 2115–2118. It was appropriately sent to manual review because the pages are scans and OCR cannot certify all image content. See panels [1](batch-06-panels/frq-2024-2-2115-segment-1.jpg), [2](batch-06-panels/frq-2024-2-2115-segment-2.jpg), [3](batch-06-panels/frq-2024-2-2115-segment-3.jpg), [4](batch-06-panels/frq-2024-2-2115-segment-4.jpg), [5](batch-06-panels/frq-2024-2-2115-segment-5.jpg).
- **Sample 25 — `mcq-2014-58-196`: incomplete but visually clean/readable.** The table, stem, and choices are present, but the question explicitly refers to the reaction “above”; the preceding reaction equation is not in the crop. The detector’s unresolved dependency/table signal correctly routed it to manual review. See [panel](batch-06-panels/mcq-2014-58-196-segment-1.jpg).
- **Sample 26 — `frq-2021-3-405`: complete, clean with minor page instructions, readable.** All setup, data, parts a–g, and the standard curve are present over three pages; no neighboring question is included. Low-confidence continuation segments were manually routed. See panels [1](batch-06-panels/frq-2021-3-405-segment-1.jpg), [2](batch-06-panels/frq-2021-3-405-segment-2.jpg), [3](batch-06-panels/frq-2021-3-405-segment-3.jpg).

## Interpretation

Batch 6 is **not an independent success batch**: completeness was 3/5 and cleanliness 4/5. Both extraction failures remained proposals and were correctly routed to manual review, so neither became an approval. The errors are logged against frozen detector `3df2cb9…`; they must not be reclassified as passes after any future correction. The two failure cases are now development cases and must be excluded from later independent success metrics. Batch 6 results do not modify any prior frozen batch.

The test result for the frozen revision was **51 passed, 0 failed, 0 skipped**. No code changes were made while Batch 6 was visually scored.
