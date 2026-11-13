# Real-PDF visual audit - batch 03

Date: 2026-11-11 UTC

Proposal source: `real-question-boundary-proposals.batch02-corrected.json`  
Proposal SHA-256: `fdf51e39d412e03df9a21ccbf9919aaa1a006562f6142ce10ad4e1aaca89df48`

This batch covers shared answer sets, cross-page shared context, mathematical notation, graphical MCQs, and a three-page FRQ. Every source page and proposed segment was rendered at 2x resolution.

| Question | Type | Source | Stored crop | Proposed crop | Confidence evidence | Initial result | Finding and recommendation |
|---|---|---|---|---|---|---|---|
| `mcq-2008-12-32` | Shared-answer MCQ | `bank-01.pdf`, catalog page 32 | `[32, 238, 300, 276]` | `[14, 53, 322, 294.7]` | high 0.86; shared group 12-14; linked stimulus; following shared group boundary | Pass | The complete enthalpy/entropy answer set and Question 12 stem are included. Questions 13-14 and the following Questions 15-17 context are excluded. |
| `mcq-1984-8-120` | Shared-answer MCQ | `bank-01.pdf`, catalog page 120 | two stored segments spanning y=398.22-737 | `[28.28, 389.22, 321.3, 761.25]` | medium 0.58; shared group 8-9; two-column constraint | Minor issue | The complete Questions 8-9 answer set and Question 8 stem are included, but the crop extends through a large blank area to the printed page number. A general page-number exclusion was added before bottom-bound calculation. |
| `frq-2021-1-399` | FRQ, three pages | `bank-02.pdf`, catalog pages 399-401 | four broad stored regions across pages 399-401 | page 399 `[0, 277.5, 594, 504.14]`; page 400 `[38.15, 57.72, 568.63, 471.98]`; page 401 `[38.34, 108.12, 552.27, 626.84]` | all manual; medium 0.72 then low 0.36/0.36; continuation and graphics detected | Fail | Pages 399-400 preserve the acid equation, parts (a)-(d), Lewis diagram box, hydrazine equation, and required space. Page 401 starts at part (e) and omits the required catalyst setup and `HCOOH -> H2 + CO2` equation immediately above it. Continuation logic now includes measured setup/equation lines preceding the first subpart and remains manual-review only. |
| `mcq-2018-17-1201` | Cross-page shared-context MCQ | `bank-05.pdf`, catalog page 1201; context on `bank-04.pdf`, page 1200 | `[0, 55, 301.68, 258.15]` | `[26, 32.71, 301.77, 251.14]` | medium 0.76; 100% catalog text; no measured graphics; initially not manual | Fail | The stem explicitly depends on structural formulas, but those formulas and the Questions 15-19 table are on the immediately preceding catalog page, across a source-PDF boundary. A general previous-page shared-group detector now emits that context as a separate segment and requires manual review. |
| `mcq-2008-25-34` | Mathematical MCQ | `bank-01.pdf`, catalog page 34 | `[0, 55, 612, 298.48]` | `[13.99, 55, 300.2, 291.48]` | high 0.90; five choices; next boundary; 100% catalog coverage | Pass | The gas-law stem and all five fraction expressions, units, subscripts, and temperature conversion are readable. Question 26 is excluded. |

## Batch totals

- Sample: 5 questions, 7 initial page segments.
- Initial pass: 2.
- Initial minor issue: 1.
- Initial fail: 2.
- Unverifiable: 0.

## General corrections from this batch

1. Continuation pages now inspect up to 100 points above the first lettered subpart for measurable setup text, equations, and nearby graphics. The inferred continuation remains manual-review only.
2. Printed page numbers are excluded before computing the bottom from body text, preventing a correct shared-answer crop from expanding through large blank space.
3. Questions that explicitly reference a graph, table, diagram, curve, structural formula, or illustration are routed to manual review when no graphical region is measured.
4. The immediately preceding catalog page is inspected for a `Questions X-Y` shared group containing the target number. When found, its measured context is emitted as a separate, ordered, manual-review segment, including across source-PDF boundaries.

All 13 detector tests pass after these changes, including real-PDF regressions for the 2021 FRQ continuation, the 1984 shared-answer crop, and the 2018 cross-page table.

## Final visual re-check checkpoint

Date: 2026-11-11 UTC. This checkpoint preserves the already completed final re-check; no pages were rendered or re-verified during checkpoint recovery. Per the operator's last checkpoint, all five questions below passed their final visual re-check (5/5).

| Question | Final re-check | Coordinates retained from the audited proposal |
|---|---|---|
| mcq-2008-12-32 | Pass | page 32: [14, 53, 322, 294.7] |
| mcq-1984-8-120 | Pass | page 120: [28.28, 389.22, 321.3, 761.25]; detector correction excludes printed page number from bottom-bound calculation |
| frq-2021-1-399 | Pass | page 399: [0, 277.5, 594, 504.14]; page 400: [38.15, 57.72, 568.63, 471.98]; page 401: [38.34, 108.12, 552.27, 626.84]; continuation correction includes measured setup/equation context above the first subpart |
| mcq-2018-17-1201 | Pass | page 1201: [26, 32.71, 301.77, 251.14]; previous-page shared stimulus remains a separate ordered segment and requires manual review |
| mcq-2008-25-34 | Pass | page 34: [13.99, 55, 300.2, 291.48] |

The coordinates above are the exact proposal coordinates already recorded in this audit. The saved detector changes address the FRQ continuation context, printed page-number exclusion, missing-graphics manual-review routing, and cross-page shared-group context. No replacement coordinate values were available in the current workspace, so this checkpoint does not claim new numeric values beyond the committed proposal.

### Checksums and evidence identifiers

- Proposal JSON SHA-256: fdf51e39d412e03df9a21ccbf9919aaa1a006562f6142ce10ad4e1aaca89df48 (unchanged from the initial audit).
- Rendered evidence Git blob IDs (Git SHA-1 object identifiers):
  - frq-2021-1-399-segment-1.png: ef59011fe32d5c7940e07925093c684448e80d4d
  - frq-2021-1-399-segment-2.png: a8ba3331451e8825021e6eb7416b91fbd01c97e3
  - frq-2021-1-399-segment-3.png: 4cc015c1c6f78b100825c02d8956350e39d720b3
  - mcq-1984-8-120-segment-1.png: 8f45497b99df15072bdb39f2419d185de45bb8e7
  - mcq-2008-12-32-segment-1.png: 827f8508ab7ca845bbc8ace7251d9c8167736952
  - mcq-2008-25-34-segment-1.png: 06916e06193dda6971b69129ad01770069fee238
  - mcq-2018-17-1201-segment-1.png: c83ff30ae7b0b968aeb42343eb0cdc258a2a7252

The 5/5 final visual result is a preserved checkpoint from the prior operator report, not a new verification run in this session. The prior committed code checkpoint reports 13 detector tests passing. This update records the final visual status without repeating those checks.

## Superseding correction: `mcq-1984-8-120`

Date: 2026-11-11 UTC. The earlier 5/5 final visual re-check statement above is withdrawn for this question. In this session, the reported discrepancy was reproduced from the source PDF: the direct single-region test did not exercise the production `detect()` path, which merges two stored regions on page 120. That pipeline produced `[28.28, 389.22, 318.84, 761.25]`, visibly including printed page number 2. The corrected `detect()` result is `[28.28, 389.22, 318.84, 619.70]`; the regenerated crop comparison shows the page number outside the crop. A failure-specific test now checks the full pipeline result and crop text. The remaining four Batch 3 questions were not rerun during this correction, so the old 5/5 statement is not a valid current-session result. See `real-pdf-failure-regressions.md` and `visual-audit/failure-regressions/mcq-1984-8-120-segment-1.png`.
