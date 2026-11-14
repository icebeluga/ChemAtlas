# ChemAtlas Catalog Compatibility Report

Date: 2026-11-10

## Compared snapshots

| Snapshot | Source | Records | MCQ | FRQ | Unique IDs |
| --- | --- | ---: | ---: | ---: | ---: |
| Public recovery | `work/public-ui-recovery` | 1,542 | 1,285 | 257 | 1,542 |
| Private review | `work/private-review-deployment` at `1f583294930c08a81b9bd92aa0eed3d0a1102dc5` | 1,542 | 1,266 | 276 | 1,542 |
| Desired screenshot | Screenshot aggregate only | 1,651 | 1,327 | 324 | Not available |

The two Git snapshots have the same 1,542 stable IDs: zero additions, zero removals, and zero duplicates. The screenshot aggregate is 109 records above the public snapshot, consisting of a difference of 42 MCQs and 67 FRQs. No target record IDs or target catalog file were available, so these screenshot-only records cannot be reconciled individually or safely added.

## Public versus private record differences

There are 21 record-level differences among the shared IDs:

- **19 type labels:** the private snapshot labels the following existing records FRQ where the public snapshot labels them MCQ:

  `mcq-2023-2-1745`, `mcq-2023-3-1747`, `mcq-2023-4-1749`, `mcq-2023-5-1750`, `mcq-2023-7-1753`, `mcq-2017-2-1850`, `mcq-2017-3-1854`, `mcq-2017-4-1858`, `mcq-2017-6-1862`, `mcq-2017-7-1864`, `mcq-2018-2-1937`, `mcq-2018-3-1941`, `mcq-2018-4-1945`, `mcq-2018-6-1949`, `mcq-2018-7-1951`, `mcq-2018-3-2026`, `mcq-2018-1-2057`, `mcq-2018-5-2061`, `mcq-2018-6-2062`.

- **Two source-page spans:** `mcq-2022-2-1657` changes from `[1657]` to `[1657, 1658]`; `mcq-2022-3-1659` changes from `[1659]` to `[1659, 1660, 1661]`. `sourcePagesOriginal` has the same expanded values in the private snapshot.

No primary unit, primary topic, related-topic assignment, or other compared classification field differs for these records.

## Schema and PDF metadata

The top-level catalog keys match. Question records share the public schema; the private snapshot adds the optional `stimulusIds` field to 17 2008 MCQs to associate shared stimulus groups. This association remains private-branch data and was not copied into the public catalog.

All eight `sourceFiles` entries match by URL, original-page range, and recorded byte size. This establishes metadata compatibility; it does not independently verify remote object availability. The public catalog integrity test confirms that every public question page resolves to a declared bundled PDF range.

## Handling and integration guidance

No question records, IDs, source-page mappings, PDFs, or private-review data were modified during this work. Keep the private catalog’s 19 type changes, two multi-page expansions, and 17 stimulus associations isolated until both branches receive a joint record-level review. The public site should not adopt the screenshot’s 1,651 total unless the 109 source records and their provenance are recovered.
