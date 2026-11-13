# Worksheet source coverage audit

The counts below describe isolated print sources. All catalog questions are now selectable. The worksheet uses reviewed source regions when available and otherwise renders the recorded full source pages using the Question Bank PDF renderer. Full pages may include nearby questions or printed answers.

Scope: bundled ChemAtlas question catalog and the eight PDF segments in its source manifest. Browser-local uploads are outside this count. All catalog and registry rectangles were checked against the corresponding PDF page dimensions.

| Measurement | Records |
| --- | ---: |
| Catalog total | 1,651 |
| All referenced source pages exist in the bundled PDFs | 1,651 |
| Catalog supplies crop metadata | 1,572 |
| In-bounds catalog crop on every referenced page | 1,558 |
| Has a catalog text preview | 1,651 |
| Approved for complete worksheet rendering | 72 (64 MCQs, 8 FRQs) |
| Verified answer tied to the original source key | 33 |

A page reference confirms that the page exists. An in-bounds rectangle confirms geometry. Neither establishes the correct question number, complete content, or absence of printed answers. Text previews are catalog excerpts. Completeness outside the 72-question print registry remains unverified.

## Why 1,579 records use the full-page fallback

- **1,211 MCQs** are outside the two source ranges currently supported by the registry builder.
- **316 FRQs** are outside the supported 2005 FRQ booklet.
- **52 MCQs** are within the supported ranges but failed conservative checks. First failing conditions were shared context indicators (30), incompatible page or region layout (12), uncertain numbered stem boundaries (9), and answer-choice marker mismatch (1).

Only keys matched to the original booklet and question number are included. The existing registry derives 33 answers from the printed 2008 practice key. Other potential keys and FRQ scoring material have yet to be matched.

## Expansion sequence

1. Build a booklet manifest with year, edition, question and answer page ranges, expected numbering, and any source-specific page formats. Start with clean, text-backed booklets.
2. Generate candidate crops from numbered stems and all answer markers. Group shared passages and diagrams with their questions, retain all pages for FRQ continuations, and reject answer pages and crop overflow.
3. Render ambiguous candidates for comparison against the original pages. Check figures, chemical notation, page breaks, answer leakage, and neighboring question boundaries. Keep unresolved records out of the print registry.
4. Link answers and scoring guides separately using booklet, edition, page, and question number. A printable question can be approved with no key.
5. Add verified entries in reproducible batches. Test mixed worksheets, pages with graphs and equations, and multi-page FRQs, then compare counts and source provenance before publishing each batch.
