# Real-PDF visual audit - batch 01

Date: 2026-11-11 UTC

Proposal source: `real-question-boundary-proposals.recovered.json`  
Uncompressed proposal SHA-256: `96159d1d2c9e46a85f79b10b8c75aac1a8ca77dc50fad4e7dbc19e81ce4784ef`

The source page and proposed crop were rendered at 2x resolution for every segment. Results below are visual judgments, not inferences from confidence scores.

| Question | Type | Source | Stored crop | Proposed crop | Confidence evidence | Initial result | Finding and recommendation |
|---|---|---|---|---|---|---|---|
| `frq-2005-1-6` | FRQ | `bank-01.pdf`, catalog page 6 | `[0, 55, 612, 737]` | `[0, 268.63, 612, 711.14]` | medium 0.72; start found; subparts a-e; 3 introductory context lines | Minor issue | Complete and readable, including both equations and all subparts. The crop included the unnecessary score-weighting instruction above the equation. A general instruction-boundary rule was added; retest after a fresh proposal run. |
| `frq-2005-3-8` | FRQ, two pages | `bank-01.pdf`, catalog pages 8-9 | page 8 `[0, 55, 612, 737]`; page 9 `[20, 40, 592, 737]` | page 8 `[0, 44.87, 612, 669.32]`; page 9 `[46, 48.87, 552.1, 338.84]` | page 8 high 0.82; page 9 low 0.36/manual; continuation and graph detected | Pass | Segment order is correct. Page 8 contains the stem, rate data, parts (a)-(b), and the hydrogen-peroxide setup. Page 9 contains part (c), the complete graph, and all three subparts. Exam footer and STOP block are excluded. Keep the continuation page in manual review despite the visual pass. |
| `mcq-2008-19-33` | MCQ | `bank-01.pdf`, catalog page 33 | `[0, 433.0031, 306, 551.3831]` | `[14, 422, 311.2, 544.38]` | high 0.90; five choices; next boundary; two-column constraint | Pass | Stem, Br-minus notation, and choices A-E are complete and readable. Questions 18 and 20 and the right column are excluded. |
| `mcq-2008-4-31` | Shared-stimulus MCQ with graph | `bank-01.pdf`, catalog page 31 | `[32, 405, 300, 454]` | `[10, 53, 322, 457.75]` | high 0.86; linked stimulus; 21 graphics; next boundary; two-column constraint | Pass | Questions 4-6 introduction, full titration curve and labels A-E, axes, and Question 4 stem are complete. Question 5 and the unrelated right column are excluded. No separate answer list is expected because the labeled graph points supply the choices. |
| `mcq-2002-17-608` | MCQ, text-poor/legacy metadata | `bank-03.pdf`, catalog page 608 | `[0, 231.9281, 300.5, 735]` | `[300.5, 160.77, 555.83, 340.31]` | medium 0.58/manual; 0% catalog-term coverage; two-column constraint | Fail | The crop contains the tail of Question 16 and printed Question 17 about reaction rates. The catalog full text and classification instead describe the neighboring geometry question. Preserve the manual-review flag and correct the source metadata through a separate catalog review; do not hardcode this crop. |

## Batch totals

- Initial sample: 5 questions, 6 page segments.
- Pass: 3.
- Minor issue: 1.
- Fail: 1.
- Unverifiable: 0.
- Detector/manual-review alignment: the failed catalog-mismatch case and the FRQ continuation are both routed to manual review.

## General correction from this batch

The detector now treats an `Answer Question ... below` scoring/timing line as an instruction boundary. Introductory equations and diagrams are included only after the last such line and before the numbered question. This removes examination instructions while preserving necessary setup and is not tied to a particular question ID.

Nine detector tests pass after the change. The real 2005 FRQ Question 1 regression now asserts that the equation and `Ka` value remain while the score-weighting instruction is absent.
