# Independent validation Batch 4, revision 3 — stopped after sample 16

## Frozen revision and lock

- Branch: `work/automatic-pdf-boundaries`
- Detector revision: `88e2aadc6213e82db67ff0a456fa944fe8d374ad`
- Detector SHA-256: `245c187a20988b0528b3b4d0f4f8c505428ce98aceb26fe020fbc9e84a5920e1`
- Pre-render lock: `batch-04-revision-3-lock.json`, committed before regenerating the three still-uninspected Batch 4 questions. Samples 7 and 8 remain development data from earlier failures.
- Regression baseline for this detector: 42 passed, 0 failed, 0 skipped; Tesseract scan regression executed.
- A corpus-wide proposal command stopped producing output and left no visible process or artifact. It was not retried. The same detector function was run on only the three locked question records; it completed and generated this batch’s proposals.

## Question results

| Sample / source | Original → proposed crop (PDF points) | Completeness | Cleanliness | Readability | Routing / result |
|---|---|---|---|---|---|
| 9 `mcq-2014-26-182`, bank-01, page 182 | `[0,55,612,557.69]` → `[26,50.9,582.83,281.87]` | Pass: figure, stem, A–D | Pass: excludes Q27 and other column | Pass | confidence 1.00; automatic; pass |
| 10 `frq-2022-6-434`, bank-02, pages 434–435 (PDF 134–135) | `[0,25,594,719]`; `[20,40,574,719]` → `[9.37,25,569.19,619.73]`; `[33.62,80.92,570.1,464.42]` | Pass: setup, graphs, diagram, a–c | Minor issue: “Begin your response” banner remains on page 434; large blank response areas and footers removed | Pass | overall manual review due to continuation; minor issue, not a clean pass |
| 16 `mcq-2024-47-2105`, bank-08, page 2105 (PDF 5) | `[20,45,575,797]` → `[22,198,243.38,422]` | **Fail:** referenced particle diagram above the stem is missing; stem is clipped; only 3/4 choice markers detected | Fail as a usable crop because required content is absent | Fail for clipped stem | confidence 0.76 but `manualReview=true`; correctly blocked, critical extraction failure |

For sample 16, the catalog’s `fullText` starts with Question 49, although the source page and detected question are Question 47. This is preserved as a provenance discrepancy; catalog metadata was not modified. The detector’s column and answer-choice signals appropriately triggered review, but did not make the crop complete. This material defect stops the batch and moves sample 16 to development.

## Revision 3 metrics (n=3; not a reliability estimate)

- Complete and clean: **1/3**.
- Minor extraction issue: **1/3** (banner retained on sample 10).
- Incomplete/contaminated: **1/3**, including one critical omission/clipped-stem failure.
- Correctly routed to manual review: **2/2 cases requiring review**.
- False automatic approvals: **0**.
- Sample 9 was automatically approved and visually passed.

The batch stopped immediately after the sample-16 defect. Its proposals and all four comparison panels are saved; no detector correction was made using this validation case. The next eligible validation work must follow a new frozen detector revision after a generalizable correction. No remaining uninspected questions remain in the locked Batch 4 remainder. Other questions from the original preregistered 40 may be selected only with a fresh pre-render lock and eligibility review.

The previous revision-2 cleanliness failure for sample 8, original Batch 4 lock, and sample-7 Q23 failure remain unchanged. Samples 7, 8, and 16 are development cases and are excluded from independent success counts.
