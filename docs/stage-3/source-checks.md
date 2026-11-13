# Catalog source checks

The [Stage 2 audit](https://github.com/icebeluga/ChemAtlas/tree/42d31dafe1f4b94a0b86d2d1f6a346f7ea18be43/docs/stage-2) supplies the addition and shared-field ledgers. The candidate generator validates their coverage against the two pinned catalog blobs. The source bank PDF blobs match the archive. The 22 records were also checked for duplicate ID, exam/type/number and printed page/number conflicts.

| Edition | Source identity | Acceptance |
| --- | --- | --- |
| 2008 AP Chemistry Practice Exam Version A | Printed cover and Version A sequence. Extracted numbered prompts on pages 33–44 and checked them against the archive completeness audit. The key begins on page 47. | 16 MCQ records, including one legacy record. Full source pages. |
| 2014 AP Chemistry Practice Exam | Printed practice header, numbered stems on pages 179, 180, 183 and Section II question on pages 200–201. | Three MCQs and one FRQ. Full source pages. |
| 2020 AP Chemistry Exam Sample Questions | OCR confirmed the cover, Sample Question 1 on lead in drinking water and Sample Question 2 on methanoic acid. The archived visual audit verified the complete page sequences 113–115 and 116–118. | Two FRQs. Full source pages. |

- 87 pending additions have per-ID possible same-identity and same-printed-slot matches in the decision ledger. Prioritize the 1994 number collisions, then verify remaining booklet identities and prompts before accepting.
- 864 shared rows retain the Cloudflare values. The decision ledger names each proposed field and points to the pinned archive. Prioritize the six changed page ranges, four disputed year values, 41 type differences and reported 2016 FRQ discrepancy. Review classification as a complete mapping and evidence bundle. The Stage 2 structured-delta ledger supplies the before/after values.
- The separately versioned catalog stays under this directory. The protected student build reads the pinned 1,542-record catalog during UI validation.
