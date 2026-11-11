# Independent crop-quality validation — Batch 3

## Frozen selection and revision

This is the original preregistered sample 11–15, locked before crop generation in `batch-03-lock.json`. The detector was frozen at commit `66445d0ba511f1e3167c472430d3d99ee69ef3fd` (SHA-256 `992d06e28b86ebf9d6513ea67480d2d457128b907fc0983d8e119f00e5a93814`). All five selected questions were rendered and visually checked against every source page/segment. The four Batch 1 development examples and Batch 2 sample 6 are excluded from independent accuracy for this revision. Samples 7–10 from the stopped Batch 2 remain unscored.

## Per-question results

| Question / source | Original → proposed coordinates (PDF points) | Completeness | Cleanliness | Readability | Review routing / finding |
| --- | --- | --- | --- | --- | --- |
| `frq-2008-4-896` · bank-03, pp. 896–897 | p896 `[0,55,612,737]` → `[26,169.03,586.73,624.8]`; p897 `[20,40,592,737]` → `[46,14.23,581.81,426.78]` | Pass; setup and parts (a)–(c) present | **Minor fail:** p897 retains the unrelated exam title header | Pass; text and answer templates legible | Manual due low-confidence continuation; correctly blocked. The worked Mg example is printed instruction content, not an answer to Q4. |
| `mcq-2016-13-1058` · bank-04, p. 1058 | `[306,55,612,737]` → `[305.3,55,574.27,645.3]` | Pass; stem, graph and choices A–D | Pass; neighboring questions/footer excluded | Pass; graph labels and curves legible | Automatic, no identified mismatch |
| `mcq-2014-17-1448` · bank-05, p. 1448 | `[40,30,550,405]` → `[26,29.7,561.87,407.67]` | Pass; potential-energy graph and choices A–D | Pass | Pass; labels/subscripts legible | Automatic |
| `mcq-2023-47-1733` · bank-06, p. 1733 | `[0,55,612,375.78]` → `[14.53,44.69,605.65,368.78]` | Pass; diagram, A/B arrows, stem and choices A–D | Pass; Q48 and footer excluded | Pass | Automatic at 1.00 heuristic confidence |
| `mcq-2018-4-1945` · bank-07, p. 1945 | `[40,39.1,569.8,366.1]` → `[26,33.05,583.84,376.09]` | Pass; calibration graph and parts (a)–(c) | Pass; response lines and footer excluded | Pass | **False automatic approval:** ID prefix says `mcq-`, while catalog type/exam and page content identify an FRQ. Keep metadata unchanged and route to provenance review. |

## Separate metrics (n=5)

| Metric | Result |
| --- | ---: |
| Complete and clean crops | 4/5 |
| Incomplete or contaminated crops | 1/5 (header contamination; no required content was clipped) |
| Correctly blocked manual-review cases | 1 (the 2008 continuation) |
| False automatic approvals | 1 (unresolved 2018 ID/type mismatch) |
| Required content readable | 5/5 |

The 2008 header and 2018 ID/type mismatch are recorded against the frozen revision. Both examples are now development data and cannot count as independent evidence for the revised detector. The other three questions were complete, clean, readable and automatically proposed. Scores such as 0.82 and 1.00 are heuristic evidence, not calibrated probabilities.

## Evidence

Rendered 2× page/crop panels are in `batch-03-panels/`; their SHA-256 values and source PDF hashes are listed in `batch-03-evidence-manifest.json`. The original preregistration and Batch 1 report remain unchanged. No original PDF was modified.
