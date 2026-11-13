# C. Catalog reconciliation

## Verified scope

Read the two GitHub catalog blobs and reproduced their Git object hashes locally. A Sites v48 `126f4b46fb1cdb8868dc199eb74974a3898f719a`; B Cloudflare `3eef99956b037611afc9b5a60a056f1cbbb311b0`. The restoration, integration and deployment-repair branch HEAD share B's catalog blob.

| Snapshot | Unique IDs | MCQ | FRQ | Classified | Review | Legacy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sites v48 | 1,651 | 1,327 | 324 | 1,587 | 1 | 63 |
| Cloudflare repair | 1,542 | 1,266 | 276 | 715 | 788 | 39 |

Exactly 1,542 IDs are shared, 109 are Sites-only and zero are Cloudflare-only. No duplicate stable IDs in either file. The 109 are **102 MCQs and 7 FRQs**. The aggregate type totals combine additions with 41 shared changes (MCQ → FRQ 41).

## 109 additions

[Complete ID ledger](sites-only-ids.csv) lists type, exam, number, pages, status and mapping. Its evidence column distinguishes these 22 documented omissions:

| Evidence | IDs covered | Source pages |
| --- | ---: | --- |
| [research/2008-mcq-completeness-audit.md](https://github.com/icebeluga/ChemAtlas/blob/6f4a568382eef820418a9f84fe97bd5cbd21d721/research/2008-mcq-completeness-audit.md) | 16 | 29–45 source section |
| [research/2014-practice-mcq-audit.md](https://github.com/icebeluga/ChemAtlas/blob/6f4a568382eef820418a9f84fe97bd5cbd21d721/research/2014-practice-mcq-audit.md) | 3 | 179, 180, 183 |
| [research/2014-practice-frq-audit.md](https://github.com/icebeluga/ChemAtlas/blob/6f4a568382eef820418a9f84fe97bd5cbd21d721/research/2014-practice-frq-audit.md) | 1 | 200–201 |
| [research/2020-sample-frq-audit.md](https://github.com/icebeluga/ChemAtlas/blob/6f4a568382eef820418a9f84fe97bd5cbd21d721/research/2020-sample-frq-audit.md) | 2 | 113–118 |

The original audits document visual verification. Stage 2 matched their IDs or exam/number/pages to the archived catalog. The other **87** require booklet identity and prompt checks before inclusion. Three Sites-only 1994 records `mcq-1994-7-678`, `mcq-1994-8-678` and `mcq-1994-9-678` share type/year/exam/number with Cloudflare records on 632–634. Their stored normalized text differs. Compare the printed booklet/page before declaring equivalence. [Identity candidates](catalog-identity-candidates.tsv) records 289 repeated identity keys in A and 306 in B. These are collision candidates, including possible different editions and reused bank pages. Stable-ID preservation is required until source evidence resolves them.

## Shared records

678 shared records are identical, 864 differ. The comparison joins on `id`, compares the union of all top-level field names by structural equality, retains array order, and distinguishes missing and null values. [Record-level field ledger](shared-record-deltas.tsv) and [before/after structured values](shared-structured-deltas.jsonl) provide the migration inputs. The JSONL includes structured identity, mapping and source values. Original prompt text and free-form rationales can be inspected on the pinned source catalogs. [public/questions.json](https://github.com/icebeluga/ChemAtlas/blob/6f4a568382eef820418a9f84fe97bd5cbd21d721/public/questions.json) · [public/questions.json](https://github.com/icebeluga/ChemAtlas/blob/63fd7e4b5287d74f66227742e8b2a4f47e37920f/public/questions.json)

| Cloudflare → Sites status | Shared count |
| --- | ---: |
| classified → classified | 715 |
| legacy → legacy | 39 |
| review → legacy | 22 |
| review → classified | 765 |
| review → review | 1 |

| Field | Changed IDs |
| --- | ---: |
| `classificationMethod` | 767 |
| `classificationRationale` | 789 |
| `evidencePages` | 771 |
| `exam` | 31 |
| `fullText` | 2 |
| `legacyConcepts` | 17 |
| `multiConcept` | 60 |
| `pages` | 6 |
| `primaryTopic` | 770 |
| `relatedTopics` | 771 |
| `reviewReason` | 787 |
| `secondaryTopicNames` | 539 |
| `secondaryTopics` | 539 |
| `sourceAssets` | 4 |
| `sourcePagesOriginal` | 6 |
| `sourceRegions` | 147 |
| `status` | 787 |
| `stimulusIds` | 17 |
| `topicName` | 770 |
| `topicParts` | 43 |
| `type` | 41 |
| `year` | 4 |

`units`, `sourcePages`, `sourceFiles` and `topicDetails` match structurally. `includedSourcePages`, `audit` and `stats` differ and should be rebuilt from a reviewed candidate rather than copied.

## Page and stimulus evidence

All eight PDF blobs match, as do their declared URLs, ranges and sizes. A range check found zero out-of-range entries in `pages`, `sourcePagesOriginal`, `evidencePages` and `sourceRegions[].page` in both catalogs. This audit did not re-render the PDFs, inspect every rectangle against its printed prompt, or determine answer leakage.

B has six shared groups and 17 question associations. All registry links match the B catalog bidirectionally. A has no explicit `stimulusIds`. Preserve the registry, including 2008 Q1–3 on page 29. The existing B worksheet test verifies deduplication and full-page fallback. [research/stimuli.json](https://github.com/icebeluga/ChemAtlas/blob/63fd7e4b5287d74f66227742e8b2a4f47e37920f/research/stimuli.json)

Six shared IDs change pages. B has expanded 2022 Q2/Q3 ranges (`mcq-2022-2-1657`, `mcq-2022-3-1659`); A restores continuation pages for Form I records ending `58-1691`, `59-1696`, `60-1701` and `62-1709`. Inspect all six against the complete prompt. A changes four year fields, including three page-1610-series records labeled 2015 MCQ in B and 2021 FRQ in A, plus the source-year-unstated record `mcq-2018-3-2026`. Preserve IDs through these decisions. Also resolve the historical `frq-2016-1-385` discrepancy.

## Migration rules for Stage 3

1. Freeze A and B catalog blobs. Generate a new candidate and a machine-readable decision ledger with ID, source SHA, fields, reason and validation for each accepted change. Keep B as the rollback artifact.
2. Import the 22 documented omissions after checking page/edition identity, stable-ID uniqueness and source availability. Keep the 87 as an audit queue until each has a documented disposition. Check for semantic duplicates across exam labels and source pages.
3. Evaluate A classification fields as bundles: status/reason, topic/related topics, part tags, evidence and rationale. Validate topic IDs, known type/year conflicts and repeated identities before promotion. Track each deferred status change. Leave B geometry and stimuli authoritative where A offers no stronger evidence.
4. Apply an explicit allowlist for page/crop/edition overrides after visual review. Use full-page fallback where crop completeness is unverified. Preserve worksheet/progress/review joins, including IDs whose prefixes disagree with canonical type.
5. Recompute counts, filter indexes and assets. Require unique IDs, valid references, intact six groups/17 links, zero unexplained removals and an auditable disposition for every difference. Publish a separately versioned catalog artifact and manifest only with the eventual approved release.
