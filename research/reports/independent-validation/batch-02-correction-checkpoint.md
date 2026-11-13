# Batch 2 crop-cleanliness defect correction checkpoint

## Frozen-revision finding

The original selection lock for Batch 2 was committed before crop generation. Under detector commit `acfead30f34ce9e48842c6c4b663bc358b7f1fac` (detector SHA-256 `d692cdf3c11eb4f83c2c5d08de48168d29385d08e2a183f8776252a56b0b3809`), the first selected question, `frq-2011-1-1655`, exposed a material defect. The untouched Batch 1 report and 40-question preregistration were not changed. The frozen result remains recorded in `batch-02-frozen-results.json`; this question is development data and is excluded from revised-detector independent accuracy.

The five original selections were samples 6–10. Only sample 6 was visually inspected. Samples 7–10 remain unscored; their proposal coordinates were generated and exposed, but no crop panels were reviewed. The batch was stopped at the first visual defect.

## Correction and visual recheck

The source page contains extractable question text plus a PES image, and a separate source-platform QR/footer image and text. The detector previously recognized the question and graph but did not recognize the third-party footer as page furniture. Those footer lines were then counted as question content, the nearby QR was admitted as a graphic, and the crop extended to the page bottom while retaining excess blank response space. It was automatically proposed at heuristic confidence 0.82.

The footer and boilerplate filters now recognize `Downloaded by`, `Scan to open on Studocu`, and `lOMoARcPSD` overlay lines. This lets the measured question content, including the PES graph, determine the lower boundary. A real-PDF geometry regression verifies the graph remains wholly inside the crop and the QR/logo images stay outside.

- **Before:** `[8.00, 304.21, 605.65, 792.00]`.
- **After:** `[19.98, 304.21, 605.65, 638.07]`.
- **Content completeness:** pass; bromine stem, (a) and (b), PES graph/axes/units, and subparts (i) and (ii) remain.
- **Cleanliness:** pass; platform footer, page marker and large unused response area are excluded. About 18 PDF points remain below the final line.
- **Readability:** pass on the regenerated 2× panel; graph labels, scale and peaks are visible.
- **Review routing:** remains automatic (`manualReview=false`) at 0.82 heuristic confidence because the corrected text-based source region and graphic dependency are resolved. The original false automatic approval remains recorded against the frozen old revision.

Panel: `batch-02-development-panels/frq-2011-1-1655-segment-1.png`. Original failing panel remains at `batch-02-panels/frq-2011-1-1655-segment-1.png`; both are checksummed in the evidence manifest. Source PDF is unchanged.

## Regression results and freeze

Added `test_2011_frq_excludes_download_footer_qr_and_unused_response_space` to the real-PDF crop quality tests. It checks expected question text, actual graph containment, footer image exclusion and geometry, rather than text presence alone. The complete suite after the correction passed: `python -m unittest discover -s tests -v` — **33 passed, 0 failed, 0 skipped**. The Tesseract-dependent scanned-page case ran (Tesseract 5.5.0 available).

The corrected detector is identified by SHA-256 `992d06e28b86ebf9d6513ea67480d2d457128b907fc0983d8e119f00e5a93814` and is frozen in the GitHub checkpoint containing this report and regression. `frq-2011-1-1655` is not independent evidence for this revision. No other questions from the stopped Batch 2 have been visually scored.
