# 2020 AP Chemistry Sample FRQ source audit

## Source check

- Compiled bank: `AP Chemistry MEGA Compiled Test Bank.pdf`, original pages 112–118.
- Pages 113–118 were rendered from the source and reviewed visually as a contact sheet; OCR was used as a second reading aid. The printed footer labels them as 2020 Exam Sample Questions, pages 2–7.
- Page 112 is a cover. Pages 113–115 contain Sample Question 1 (parts a–j). Pages 116–118 contain Sample Question 2 (parts a–h).
- The same six original pages were rendered from the website's `bank-01.pdf` chunk. All are the same printed pages; pages 113, 115, 117, and 118 were pixel-identical at the comparison render size. Pages 114 and 116 differed at the pixel level, but side-by-side inspection confirmed the same diagrams, equations, text, and footer; the difference is rasterization/source encoding, not a page mismatch.
- These were genuine omitted question records, not miscellaneous support pages. The PDF pages remain the authoritative question images. No answer key is linked to these sample questions, so the site must not invent answers.

## Topic mapping recorded

| Record | Primary topic | Additional concepts identified by subpart |
|---|---|---|
| 2020 Sample Question 1, pp. 113–115 | 7.11 Introduction to Solubility Equilibria | (a) net ionic equations and redox; (b–e) Ksp, common-ion effect, Q vs. Ksp; (f) Le Châtelier and endothermic/exothermic processes; (g) VSEPR; (h) resonance; (i) intermolecular forces; (j) photoelectron spectroscopy |
| 2020 Sample Question 2, pp. 116–118 | 5.8 Reaction Mechanism and Rate Law | (a) catalysis; (b) reaction mechanism and rate; (c) energy diagrams/enthalpy; (d–e) intermolecular forces and distillation; (f–h) acid-base titration and stoichiometry |

These primary-topic choices reflect the opening/main conceptual thread of each multi-concept question. Parts are mapped independently so a learner can find the question from every relevant topic. The full-page fallback is used because reliable crop boundaries were not established for these scanned pages.

## Implementation and verification

- Added `frq-2020-sample-1-113` and `frq-2020-sample-2-116` with original page references and per-part topic mappings.
- Updated question/page totals and removed original pages 113–118 from the unlinked-page list.
- The 1,244 remaining unlinked pages are not visually cleared; continue the page-by-page review before claiming the entire compilation is complete.
- Topic names and boundaries were checked against the bundled College Board AP Chemistry Course and Exam Description (2024), including the Unit 7 solubility topics, Unit 5 kinetics topics, and Unit 8 acid-base titration topics.
