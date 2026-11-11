# Independent real-PDF validation — Batch 1

- **Question set:** preregistered samples 1–5; five PDFs represented, one question per PDF.
- **Frozen detector:** commit `2f11785cc8dd4bc557989b98e70ee445b18d9fc3`; SHA-256 `4d479249cceeaf976fc2289e75b3955a414c3dda25f482def5ce419fe64ed3a0`.
- **Audit method:** rendered original-page/proposed-crop comparison panels at 2×. All eight page segments were visually inspected.
- **Regression suite after batch:** 28/28 passed.

| Question | Source PDF / page(s) | Proposed rectangles (PDF points) | Confidence / review | Result and visual evidence |
|---|---|---|---|---|
| `frq-2006-6-25` | bank-01, 25–26 | p25 `[0,55,612,525.06]`; p26 `[39.68,55.17,583.2,396.28]` | 0.82 high + 0.36 low; both manual | **Correctly blocked.** Page 25 includes the glucose/cyclohexane structures and all parts (a)–(c); p26 includes the four reaction diagrams and part (d). No adjacent question or answer marking seen. The p25 rectangle spans a suspicious two-column page, so manual routing is appropriate. |
| `frq-2023-6-456` | bank-02, 456–457 | p456 `[0,26,594,561.36]`; p457 `[31.84,32.9,536.93,114.72]` | 0.72 medium + 0.36 low; both manual | **Correctly blocked.** p456 contains the stem, both data tables, and parts (a)–(b); p457 contains continuation part (c). No neighboring question or answer marking seen. The detector did not measure the visible tables/graphics, a valid reason for manual review. |
| `mcq-2002-7-606` | bank-03, 606 | `[286.9,126.29,585.03,760.68]` | 0.72 medium; **automatic** (`manualReview=false`) | **Fail / false automatic approval.** The crop includes the shared phase diagram and answer choices, but also the stems for Questions 5 and 6 along with target Question 7. Those neighboring stems are unrelated content for this target. The detector recognized a shared group yet did not route the contaminated crop to review. This is a newly observed material boundary defect. |
| `frq-2017-3-1157` | bank-04, 1157–1158 | both pages `[18,40,577.2,796.92]` | 0.08 low on both; manual | **Correctly blocked.** These are scanned/image-only pages. The prior full-page rectangles were retained and explicitly flagged for manual review; they were not silently auto-approved. Visual inspection shows the question's prompt, blank drawing box, reaction/graph, and continuation subparts. No answer markings seen. |
| `mcq-2014-49-1464` | bank-05, 1464 | `[138.02,543.91,476.12,678.86]` | 0.72 medium; manual | **Correctly blocked.** Stem and choices A–D are visible, but the necessary structural-formula/molar-mass table immediately above is outside the crop. The detector flagged missing graphical context and routed the incomplete proposal for manual review. No visible answer marking seen. |

## Batch metrics

- **Clean automatic crop pass rate:** 0/1 automatic proposals passed cleanly (0%). The only automatic proposal failed due to neighboring question stems.
- **Correct manual-review routing:** 4/4 manual proposals were blocked from automatic approval.
- **False automatic approvals:** 1 (`mcq-2002-7-606`).
- **Critical crop failures:** 0. The one automatic failure contains the target's shared stimulus and choices but is contaminated by two neighboring stems; the four incomplete/ambiguous proposals were manual-routed.
- **By source PDF:** bank-01 0 auto / 1 manual-blocked; bank-02 0 / 1; bank-03 1 auto failure / 0; bank-04 0 / 1; bank-05 0 / 1.
- **By catalog type:** 2 MCQs (one auto failure, one manual-blocked); 3 FRQs (all manual-blocked).
- **Layouts observed:** two-column/shared stimulus with a shared choice set; single-column multi-page FRQ with tables; scanned multi-page FRQ; molecular-structure table context. No source answer markings were visible in these panels.

## Decision

Stop further independent batches. The shared-stimulus MCQ failure is development data now, not an independent validation result. Preserve this batch as the first five selected cases; fix and regression-test the defect separately. After a correction, freeze a new detector revision and use a fresh, disjoint sample for independent validation. The 40-question plan remains pre-registered, but later questions have not been rendered or scored. This five-question batch does not support corpus-wide reliability claims.
