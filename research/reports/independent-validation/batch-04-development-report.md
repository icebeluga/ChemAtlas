# Batch 4 development correction — scanned shared group Q22–25

**Purpose:** investigate the frozen Batch 4 failure for `mcq-2024-23-2090` and the bounded neighboring questions. These questions are development data, excluded from independent validation on this and later detector revisions. The original Batch 4 failure record and selection lock remain unchanged.

## Root cause

The catalog associates Questions 23–25 with page 2090, but the scanned bank-07 source places the shared acid table and Q22 on page 2090 and the individual bodies of Q23–25 on page 2091. The Q23 catalog preview also reflects Q22 rather than the target stem. Native PDF text on these scans consists almost entirely of Studocu footer text; the old OCR gate counted that page furniture and did not OCR the target page. The old failure path then reused broad stored coordinates as if they were a valid crop.

The detector now ignores footer/header text when deciding whether OCR is needed, separates columns at wide OCR-word gaps, recognizes shared-group wording such as “through,” extracts shared stimulus separately, and searches the next page in the same source PDF for a candidate body. Adjacent-page candidates remain manual-only when OCR identity evidence is weak. Candidate crops use measured text bounds to avoid blank/footer bleed; full-page raster graphics are explicitly marked unverified. When no measurable extraction exists, the prior rectangle remains diagnostic-only and `rect` is null. Catalog metadata and source PDFs were not modified.

## Corrected Q23 proposal

| Order | Role | PDF page | Coordinates (PDF points) | Confidence | Routing |
|---|---|---:|---|---:|---|
| 1 | Shared acid-table stimulus | 2090 | `[37.0, 50.5, 562.5, 244.0]` | 0.42, low | Manual |
| 2 | Question 23 body | 2091 | `[24.0, 61.5, 299.62, 201.5]` | 0.18, low | Manual |

The old stored region `[20, 45, 575, 797]` on page 2090 included Q22, footer material, page number, QR overlay, and large blank areas while omitting Q23. The new stimulus segment contains the group instruction and all four table rows, including the lower border. The body segment contains the visually identified Q23 stem and options A–D. It excludes Q22, Q24, Q25, page numbers, Studocu footer and QR, and excess blank page space. No answer-marking overlay appears within the proposed content. The scan text is soft but legible. OCR reads the stem number as “21,” and the catalog stem conflicts with the visual source; therefore completeness and cleanliness pass on direct visual comparison, but the result remains manual-only and is not a validation success.

## Bounded neighbor check

Only Q21–Q26 were checked. The page-association discrepancy is systematic within the shared group: Q23–25 are cataloged on 2090 but their bodies are on 2091. Q24 and Q25 now have tight candidate regions and direct visual checks show their stems and A–D choices without neighboring question text or footer. Both remain manual-only because OCR does not fully establish their identity and the source is a full-page raster whose non-text graphics cannot be certified by OCR.

| Question | Proposed segments | Visual/result status |
|---|---|---|
| Q21 | Body on 2091 | Existing-page proposal; scan remains manual |
| Q22 | Shared stimulus + body on 2090 | Existing-page proposal; scan remains manual |
| Q23 | Shared stimulus 2090 + body 2091 | Visually complete/clean; manual only due identity evidence mismatch |
| Q24 | Shared stimulus 2090 + body 2091 | Visually complete/clean text crop; manual only, scan graphics unverified |
| Q25 | Shared stimulus 2090 + body 2091 | Visually complete/clean text crop; manual only, scan graphics unverified |
| Q26 | Body on 2092 | Existing-page proposal; scan remains manual |

No catalog records were rewritten. The original Q23 holdout failure remains frozen as a failure and is not recounted as independent evidence.

## Verification

`python -m unittest discover -s tests -v`: **41 passed, 0 failed, 0 skipped**. The Tesseract-dependent scanned-page regression executed. New real-PDF regressions cover ordered adjacent-page segments, the four Q23 choices, table lower-border geometry, neighboring-question/footer bounds, Q25 right-column number inclusion, unchanged catalog provenance, and failure-safe continuation behavior. The existing 1984 printed-page-number regression also passed.

Detector SHA-256: `aa87de11393cbd864cd0b4551c09ae167a6a0d2e8f1c5ed5bdc91f4b33eedca8`.

## Preserved validation state and remaining work

The original frozen Batch 4 failure and pre-render selection lock are unchanged. Q23–25 are development data. Batch 4 samples 8, 9, 10, and 16 remain uninspected and eligible; after this correction checkpoint, freeze this detector revision and continue with those locked selections. No statistical reliability claim is made.
