# Real-PDF visual audit - batch 02

Date: 2026-11-11 UTC

Proposal source: `real-question-boundary-proposals.batch01-corrected.json`  
Proposal SHA-256: `7b33db24eca3a5e347d19de50fbe77048c1bca715f38b033dafede56e04f8028`

This batch checks five questions affected by the general instruction-boundary correction. Every source page and proposed segment was rendered at 2x resolution.

| Question | Type | Source | Stored crop | Proposed crop | Confidence evidence | Initial result | Finding and recommendation |
|---|---|---|---|---|---|---|---|
| `frq-2006-1-20` | FRQ | `bank-01.pdf`, catalog page 20 | `[0, 55, 612, 737]` | initial `[0, 300.17, 612, 740.54]`; corrected `[0, 300.17, 612, 711.84]` | medium 0.72; start found; subparts a-d; catalog coverage 0.60 | Pass after correction | All setup, equations, and subparts are complete, and the scoring instruction is excluded. The general copyright-symbol footer rule removes the copyright and website footer without clipping part (d)(ii). |
| `frq-2004-1-292` | FRQ | `bank-01.pdf`, catalog page 292 | `[0, 55, 612, 737]` | `[0, 292.02, 612, 672.62]` | medium 0.72; start found; subparts a-g; catalog coverage 0.45 | Pass | Both solubility setups, equations, numerical values, and subparts (a)-(g) are complete. Examination instructions and footer are excluded. |
| `frq-2003-1-865` | FRQ, two pages | `bank-03.pdf`, catalog pages 865-866 | page 865 `[0, 55, 612, 737]`; page 866 `[20, 40, 592, 737]` | page 865 `[0, 277.27, 612, 679.84]`; page 866 `[45.94, 55.32, 565.22, 274.63]` | page 865 high 0.82/manual because catalog coverage is 0.17; page 866 low 0.36/manual continuation | Pass | Segment order is correct. The equilibrium equation, complete graph, and parts (a)-(b) are on the first segment; parts (c)-(f) are complete on the second. Headers, footer, and adjacent content are excluded. Retain manual review because of low catalog-text coverage and continuation inference. |
| `mcq-1999-1-546` | Catalog `type=FRQ`, but ID and exam label say MCQ | `bank-02.pdf`, catalog page 546 | `[0, 55, 612, 737]` | `[0, 273.65, 612, 572.3]` | medium 0.72; start found; subparts a-e; catalog coverage 0.48 | Fail | The rendered content is an FRQ with parts (a)-(e), while the canonical ID begins `mcq-` and the catalog exam field says `1999 AP Chemistry MCQ`. Route to catalog review; do not change the canonical ID or hardcode a boundary during this audit. |
| `frq-2011-1-944` | FRQ | `bank-04.pdf`, catalog page 944 | `[0, 55, 612, 737]` | `[0, 330.19, 612, 573.28]` | medium 0.72; start found; subparts a-d; catalog coverage 0.42 | Fail | The crop is visually complete, but its source page is headed `2002 AP Chemistry Free-Response Questions (Form B)` while the ID, year, and exam fields identify 2011. Route the source mapping/year discrepancy to catalog review without changing canonical IDs in this task. |

## Batch totals

- Sample: 5 questions, 6 page segments.
- Initial: 2 pass, 1 minor issue, 2 fail.
- Final after the footer correction: 3 pass, 0 minor issues, 2 fail.
- Fail: 2, both caused by catalog/source metadata conflicts rather than a missing crop boundary.
- Unverifiable: 0.

## General correction from this batch

Footer detection now recognizes copyright lines beginning with the copyright symbol and `The College Board. All rights reserved`, in addition to `Copyright`, College Board URLs, STOP blocks, and next-page text. A real 2006 FRQ regression test verifies that the final required subpart remains and the copyright footer is excluded.

All 10 detector tests pass after this correction. The fresh corpus run completed successfully with 1,542 questions and 309 manual-review questions. It produced 261 high-, 1,049 medium-, and 232 low-confidence question results. The footer correction changed 76 proposals and the corrected artifact SHA-256 is `fdf51e39d412e03df9a21ccbf9919aaa1a006562f6142ce10ad4e1aaca89df48`; its durable gzip artifact SHA-256 is `a17216cd4e356bab88ff398d83a7bebe322bbe9a794490bd62477c5278a2b61b`.

The corrected `frq-2006-1-20` crop was rendered again and visually passed: the last calculation instruction remains complete and the copyright, website, page number, and next-page footer are excluded.
