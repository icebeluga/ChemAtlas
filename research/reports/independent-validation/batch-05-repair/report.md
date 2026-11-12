# Batch 5 development repairs — frozen examples, not validation successes

## Scope and safeguards

This work repairs the Batch 5 development cases against the detector state recorded in `batch-05-results.json`. None of these repaired records is counted as a new independent validation pass. The source PDFs, catalog metadata, hosted review records, and deployed site were not modified.

Phase 2 automatic application is suspended. Candidate generation, confidence scores, and manual-review diagnostics continue, but every result is marked `approvalStatus: proposal-only` and `automaticApplicationEligible: false`. The legacy high-confidence apply function is now a safe no-op, while the command-line option fails before writing an output catalog.

## Root causes and correction results

| Case | Root cause | General correction | Before → proposed geometry and visual result | Routing |
|---|---|---|---|---|
| `mcq-1984-53-128` | Batch scoring ran on a one-question subset. The lone half-page prior was not used to anchor the column split, so paragraph-start spacing produced a false gutter through the long E answer. The detector counted A–E markers and catalog words but did not verify full text-box containment. | A lone half-page crop now anchors a two-column layout; wrapped final-choice lines enter the required-content geometry. The full text-box width is checked and any unresolved crossing triggers review. | p.128 `[14,381.78,221.58,542.55]` → `[14,381.78,314.56,542.55]`. The new panel shows the full stem and wrapped E text through “same concentrations,” while Q54 in the right column remains outside. | Complete crop. `manualReview` diagnostic is false, but application eligibility is false and status is proposal-only. |
| `mcq-2002-15-754` | Shared-group detection did not recognize “Questions 15–16 relate to the graph below.” Therefore the page’s shared graph was not linked to Q15. The body crop also ended less than one point into Q16’s stem. | Shared-group language includes “relate to”; raster/vector content between the shared direction and first question is emitted as an ordered `sharedStimulus` segment. The body segment stops before the next group anchor. Unlocated referenced graphics remain unresolved/manual. | p.754 `[14,296.4,306,425.96]` → shared graph `[55.5,105.52,306,321.14]`, then Q15 body `[28,322.28,302.68,426.96]`. The visual panel shows the full heating curve, axes, time labels, Q15 stem and choices; Q16’s stem is outside. | Both segments are proposal-only; graph dependency signal resolves. |
| `frq-2011-1-1220` | “Directions” text chaining allowed a small line gap to absorb the following combustion equation into the instruction block, pushing the crop below it. The catalog page list ends at 1220 even though the same FRQ continues with part (g), a boiling-point table, and a second equation on p.1221. | Instruction chaining stops at paragraph breaks and generic directions. Explicit upstream equation references collect aligned formula fragments. For text PDFs, adjacent-page lookahead adds only the exact next subpart in sequence and rejects a page if another numbered FRQ starts first. Inferred continuation remains manual. | p.1220 `[26,294.3,585.27,567.07]` → `[26,264.23,585.27,567.07]`; inferred p.1221 segment `[47.28,35.71,575.64,363.99]`. The panels show the complete combustion equation, question parts a–f, the complete table, ethene/water equation, and part (g), with response lines/footer excluded. | Both pages are manual-review only because p.1221 is inferred beyond the catalog page list. |

## Provenance check: `frq-2016-1-385`

The page mapping is consistent: catalog page 385 maps to physical PDF page 85 in `bank-02.pdf`, and page 386 maps to physical page 86. The page header printed in the source is “2019 AP Chemistry Free-Response Questions”; its Question 1 is the urea problem in the catalog preview, and page 386 continues the same problem with parts (c)–(h). No matching duplicate 2019 urea record was found in the catalog. The evidence points to an incorrectly labeled catalog ID/year (`frq-2016-1-385` / 2016), rather than an incorrectly localized page. The catalog was not rewritten; source-year diagnostics keep it in manual review.

## Cleanliness review: `frq-2010-4-921`

The first segment starts with Question 4 and retains the magnesium worked example. That example explains the requested answer format and appears between the question instructions and part (a); removing it could discard useful setup. The exam title/header is outside the crop. Page 922 contains parts (b) and (c). Sequential lookahead correctly rejects page 923 because Question 5 begins before that page’s (d) marker. No cosmetic trimming was made at the expense of context.

## Verification

- Full suite: `python -m unittest discover -s tests -v` — **51 passed, 0 failed, 0 skipped** (including Tesseract-dependent scanned-page regressions).
- New Batch 5 regression file: six tests cover right-edge text geometry, shared graph segmentation and neighbor exclusion, upstream equation and inferred page continuation, source-year conflict, retained response-format example, and disabled application.
- Visual comparison: nine rendered source/boundary/crop panels were inspected. See the nine source-versus-crop panels in `panels/` and the coordinate record in `before-after-coordinates.json`.
- Detector SHA-256: `544a489d093dd124584efb89a5e5faf2aed4836f352ee2a7c9db88732e1f7216`.
- The five source PDFs used in this repair retain their original checksums, recorded in `evidence-manifest.json`.

The previous Batch 5 frozen findings remain intact. The corrected cases are development regressions only. The next independent validation will use a separately committed pre-render lock drawn from original preregistered samples 22–40.
