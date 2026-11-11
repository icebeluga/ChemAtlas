# Independent validation Batch 4 — revised detector stopped after sample 8

## Frozen revision and selection

- Branch: `work/automatic-pdf-boundaries`
- Frozen detector checkpoint: `e0bf22ddf1b2094cf5ec6f36db25005a7c9d74af`
- Detector SHA-256: `aa87de11393cbd864cd0b4551c09ae167a6a0d2e8f1c5ed5bdc91f4b33eedca8`
- Pre-render lock: `batch-04-revision-2-lock.json`, committed as `eb9cded2891c70e27ef3666c5dac67f9d6f67963`. It contains the four untouched remainder of the original locked selection; sample 7 and nearby Q24/Q25 were already development data.
- Baseline on frozen detector: 41 passed, 0 failed, 0 skipped; the Tesseract-dependent scanned-page regression executed.

## Sample 8 — `frq-2024-4-2123`

Source: bank-08, catalog pages 2123–2124 (physical PDF pages 23–24). The catalog's previous regions were `[18, 40, 577, 797]` on each page. The proposed regions are `[0.0, 36.0, 578.5, 562.0]` on page 2123 and `[0.0, 0.0, 595.0, 806.0]` on page 2124. Confidence is 0.36 and `manualReview=true`.

Visual comparison confirms the experimental setup, calorimeter diagram, data table, and subparts (a)–(d) are present. Readability passes with a soft-scan limitation. Cleanliness fails: page 2123 retains a large blank response area and “Begin your response” banner; page 2124 retains substantial blank answer space, the Question 4/continuation headers, copyright footer, printed page 15, “GO ON TO THE NEXT PAGE,” and response instructions. Manual review routing is correct, but the crop is not a usable question-only extraction. This is a frozen-revision extraction failure and is now development data.

## Batch status

| Measure | Frozen revision result |
|---|---:|
| Questions visually scored | 1 |
| Complete content | 1/1 |
| Clean question-only crops | 0/1 |
| Readable content | 1/1 (soft scan) |
| Correctly blocked for manual review | 1/1 |
| False automatic approvals | 0/1 |
| Incomplete or contaminated | 1/1 |

A material cleanliness defect stopped this batch. Samples 9 (`mcq-2014-26-182`), 10 (`frq-2022-6-434`), and 16 (`mcq-2024-47-2105`) have generated proposals and panels but were not visually inspected or scored. Their existing panels are preserved only as unscored outputs; after a correction they must be regenerated under a new frozen detector revision before evaluation.

The original Batch 4 selection lock, original sample-7 failure, and the just-created revised-revision lock are preserved. No source PDF or catalog metadata was changed. This single-question result is not an estimate of corpus-wide performance.
