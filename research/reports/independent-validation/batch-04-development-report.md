# Batch 4 development correction — `mcq-2024-23-2090`

**Purpose:** investigate and correct the frozen Batch 4 failure. This question is development data and is excluded from independent validation, including future detector revisions. The original Batch 4 failure record and pre-render selection lock are preserved unchanged.

## Root cause

The catalog associates Questions 23–25 with catalog page 2090, but the scanned bank-07 PDF places the shared acid table on physical source page 2090 and the individual bodies of Questions 23–25 on page 2091. The Q23 catalog text preview also reflects Question 22 rather than the Q23 stem. Page 2090's native PDF text is only Studocu footer text; because that page furniture exceeded the old OCR activation threshold, OCR did not run. The old path then reused the broad stored rectangle as though it were a crop.

The updated detector filters page-furniture text before deciding whether a scan needs OCR, splits OCR lines at wide column gutters, detects a shared-group range even when expressed as “through,” preserves shared stimulus and body as ordered separate regions, and proposes adjacent-page bodies only as manual-review candidates. Unresolved prior coordinates are diagnostic-only; the continuation fallback now returns `rect: null` if it has no measurable content. Catalog pages and source metadata are not rewritten.

## Corrected Q23 proposal

| Order | Role | PDF page | Coordinates (PDF points) | Confidence | Review |
|---|---|---:|---|---:|---|
| 1 | Shared acid-table stimulus | 2090 | `[37.0, 50.5, 562.5, 244.0]` | 0.42, low | Manual |
| 2 | Question 23 body | 2091 | `[24.0, 61.5, 299.62, 214.5]` | 0.18, low | Manual |

The original stored rectangle was `[20, 45, 575, 797]` on page 2090. It included the Q22 body, footer material, page number, and extensive blank area while omitting Q23. The revised first segment includes the shared-group instruction and all four table rows, including the lower table rule. The second includes the visually identified Q23 stem and choices A–D. The crop excludes Q22, Q24, Q25, the printed page number, Studocu footer, and QR. No answer-marking overlay was visible inside either crop. The scan is readable but soft; OCR reports number “21” and only 0.444 stem-token coverage against incorrect catalog text. Therefore the extraction is visually complete and clean for this development case, but automatic approval remains blocked.

## Bounded bank-07 neighbor diagnostic

Only Questions 21–26 were checked. Results show the issue is **systematic within the shared group**, not isolated to Q23: the catalog lists Q23–25 on 2090, while the scanned bodies are on 2091. Q23 received a visually verified candidate region. Q24 and Q25 also received adjacent-page candidates but remain manual-only; their provisional rectangles extend too far into blank/footer space and are not counted as successful extractions. Q21 (2091), Q22 (2090), and Q26 (2092) did not show this same cross-page mapping pattern in the bounded check. No catalog records were changed.

| Question | Detector proposal | Outcome |
|---|---|---|
| Q21 | page 2091 body | Existing-page proposal; scan requires manual review |
| Q22 | shared stimulus + body on 2090 | Existing-page proposal; scan requires manual review |
| Q23 | shared stimulus 2090 + body candidate 2091 | Visually complete and clean; manual-only |
| Q24 | shared stimulus 2090 + body candidate 2091 | Manual-only; candidate crop too tall, unresolved |
| Q25 | shared stimulus 2090 + body candidate 2091 | Manual-only; candidate crop too tall, unresolved |
| Q26 | page 2092 body | Existing-page proposal; scan requires manual review |

## Verification

`python -m unittest discover -s tests -v`: **39 passed, 0 failed, 0 skipped**. The Tesseract-dependent scanned-page regression executed. New tests cover Q23 ordered cross-page segments, four choices, neighbor/footer geometry, shared-table lower-border inclusion, catalog provenance preservation, and continuation failure-safe behavior. Existing Batch 3 page-number regression also passed.

The original Batch 4 proposal/failure and selection lock were not changed. Q23 remains development data, not independent validation evidence. Detector SHA-256: `b6190120574ac7f3f68a0d631a031b9e81c4dc8dc197aa19ddd18619d3302f63`.

## Remaining blockers

- Q23 remains manual-review only because OCR and catalog-text evidence disagree, despite visual confirmation of the stem and four choices.
- The Q24 and Q25 neighbor candidates need separate repair or manual source mapping; they were not counted as extracted successfully.
- The source scan has soft text and Studocu footer/QR artifacts outside the proposed crops.
- Before resuming independent validation, preserve this checkpoint, freeze the detector revision, and select a replacement for Q23 (and any debugging overlap) before rendering/scoring; keep all metrics separated by detector revision.
