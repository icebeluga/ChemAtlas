# Independent crop-quality validation — Batch 4 stopped after sample 7

## Frozen revision and selection

- Branch: `work/automatic-pdf-boundaries`
- Detector checkpoint: `908b3f60c4ad7bc4f2e55fdee446fc0583c0ae0e`
- Detector SHA-256: `24d7bc01539de572348d4303b99decde8a5c3a9b5e0fa92622dcbff54d644777`
- Pre-render selection lock: `batch-04-lock.json`, committed as `16c956a43b7e96adb4d95ace9466e0f61d6d0ead` before proposals or images were generated for this run.
- Baseline: `python -m unittest discover -s tests -v` — 35 passed, 0 failed, 0 skipped. The Tesseract-dependent scanned-page test executed with Tesseract 5.5.0.

The locked selection was original preregistered samples 7–10 plus sample 16. Samples 7–10 had metadata-only proposals recorded under the earlier detector revision but had never been rendered or visually scored; fresh proposals were regenerated after the lock. The first visual result exposed a material defect, so the batch stopped immediately. Samples 8–10 and 16 remain unscored. No replacement was made.

## Sample 7 result — `mcq-2024-23-2090`

- Source: `public/source/bank-07.pdf`.
- Catalog/source page recorded for the target: 2090 (PDF physical page 290; printed footer page `-16-`).
- Catalog crop before detection: `[20, 45, 575, 797]` PDF points.
- Proposed crop: `[20, 45, 575, 797]` on page 2090; no additional segment was proposed.
- Confidence: 0.08 (low); `manualReview=true`.
- Signals: only 73 characters extracted; expected numbered start not found; 0 answer-choice markers; 0 graphics detected. Detector reason: “Expected numbered question start was not located; the prior crop is retained unchanged for manual review.”

### Visual classification

- **Completeness: FAIL.** The crop shows the shared acid table and Question 22 with its particle-diagram answers. It does not show the target Question 23 stem or choices A–D. The target is visibly on the next scanned source page, catalog page 2091 (PDF physical page 291; printed page `-17-`).
- **Cleanliness: FAIL.** The proposed p. 2090 crop includes unrelated Question 22 and its answer choices, very large blank areas, and the source footer/page number, Studocu logo, downloader text, and QR overlay.
- **Readability: FAIL for the target extraction.** The table and Question 22 are legible in the crop, but the target question is absent. The adjacent scanned page shows Q23 and its choices but is not included by the detector.
- **Review routing: CORRECTLY BLOCKED.** The low-confidence/manual flag prevented automatic approval. This is a failed extraction, not a successful crop.

The page evidence indicates a source-page/catalog association problem: the shared stimulus and Q22 are on catalog page 2090; Q23 is on page 2091. A usable Q23 extraction likely needs the shared table as a separate stimulus segment followed by a tightly bounded Q23 segment from the scanned next page. This is a diagnostic observation only; no catalog metadata or source PDF was changed.

## Frozen-revision metrics (n=1 visually scored)

| Metric | Result |
| --- | ---: |
| Complete and clean crops | 0/1 |
| Incomplete or contaminated crops | 1/1 |
| Correctly blocked manual-review cases | 1/1 |
| False automatic approvals | 0/1 |
| Readable target content | 0/1 |

This case is now development/debugging data and must not count as independent evidence for a later detector revision. The original Batch 1–3 results and Batch 2 sample 6 failure remain unchanged.

## Preserved evidence

- `batch-04-proposals.json` preserves all five regenerated proposals and detector signals. Only sample 7 was visually scored.
- `batch-04-panels/mcq-2024-23-2090-segment-1.png` compares the source page with the proposed crop.
- `batch-04-panels/source-page-2091-context.png` is contextual source-page evidence showing Q23, Q24 and Q25 on the scanned next page; it is not a proposed crop.
- `batch-04-evidence-manifest.json` records hashes for the detector, selection, proposals, panels and original PDF.

No detector changes were made after the frozen revision. No source PDF was modified. No reliability claim is supported by this stopped one-question batch.
