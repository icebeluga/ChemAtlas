# ChemAtlas concept classification

Goal: for every question (and every FRQ part), record which chemistry **concepts a student must actually use** to answer it. This is in addition to the existing unit and topic classification, not a replacement. The work is on branch `feature/concept-classification-pipeline`. Nothing here is published to the student site.

Files in this folder: this README (architecture, method, how to run), [pilot-report.md](pilot-report.md) (pilot results and accuracy), [graphify-and-skills.md](graphify-and-skills.md) (how Graphify and Claude Code skills were used), [student-search-plan.md](student-search-plan.md) (how students will search by concept), [overnight-progress.md](overnight-progress.md) (checkpoint log).

## 1. How the existing question bank fits together

| Piece | Where | Notes |
| --- | --- | --- |
| **Authoritative catalog** | `public/student-questions.json` | 1,564 questions (1,285 MCQ, 279 FRQ). This is the file the student app loads. It is the Stage 4 catalog: the 1,542-record baseline in `public/questions.json` plus 22 verified additions (`docs/stage-3/catalog-decisions.jsonl`, checked by `tests/stage3-catalog.test.mjs`). |
| Question IDs | `id`, e.g. `mcq-2008-6-31` = MCQ, exam year, question number, compiled PDF page | Stable; never renamed by this work. |
| Unit/topic | `primaryTopic`, `secondaryTopics`, `relatedTopics`, `primaryUnit`, `status` | `status` is `classified` (735), `review` (789, topic not verified) or `legacy` (40). `primaryUnit` is null or disagrees with `primaryTopic` in 572 records, so this work derives the unit from the topic. |
| FRQ parts | `topicParts[]` with `label` such as `(a)`, `(c)(ii)` | 259 of 279 FRQs have parts. Concept work uses these as part IDs (`a`, `c-ii`). |
| Question text | `fullText`, `textPreview` | Extracted with PyMuPDF (`research/extract_corpus.py`), OCR for scans (`research/ocr_scans.py`). Not authoritative: it loses subscripts, charges and diagrams, and sometimes contains neighbouring questions. |
| Source PDFs and crops | `public/source/bank-01…08.pdf`, `sourceFiles` page ranges, `sourceRegions` rectangles (PDF points) | 230 questions span more than one region. |
| Crop verification | `research/crop-visual-review.json` (96 reviewed: 94 visually verified, 2 needs review), `extractionWarnings` (111 records) | Most crops have **not** been manually verified. |
| Shared stimuli | `research/stimuli.json` (6 groups, 17 MCQs via `stimulusIds`) | Only the 2008 groups are registered; other shared stimuli are inside page crops. |
| Answer keys / scoring | None in the catalog | 54 records point at answer/scoring pages (flagged). Classification never uses or invents a key. |
| Private image review | `app/admin/question-review`, `lib/question-review-storage.mjs`, D1 tables in `db/schema.ts`, R2 images | Not touched. Concept review is a separate export (section 5). |
| Search/filter UI | `components/student-app.tsx` (`filteredQuestions`, unit/topic/type selects) | Unchanged. See [student-search-plan.md](student-search-plan.md). |

## 2. What was built

```
research/concept-taxonomy/     original research files (unchanged, hash-checked)
research/concepts/
  concepts.v1.source.json      authored canonical taxonomy (edit this)
  taxonomy.v1.json             generated: + hashes, micro-label map, research crosswalk
  concept-graph.json           generated chemistry graph (graphify node-link format)
  classifications.json         versioned store: current record + history per question
  prompts/                     classifier.v1.md, concept-reference.v1.txt
  runs/<run>/                  selection, packets, results-a/-b, compare, evaluation, review sheet
  benchmark/                   reference sets for precision/recall
lib/concepts/                  taxonomy, content, candidates, records, evaluate, search, graph, review-sheet
scripts/concepts/cli.mjs       command line (below); render_regions.py renders crops
tests/concept-*.test.mjs       automated tests
```

### Taxonomy (v1.0.0)

- **109 canonical concepts** (105 in the current AP course, 4 marked `beyond-ap` for legacy questions: colligative properties, nuclear, organic naming, descriptive chemistry) in **14 groups**, plus **6 problem-solving skills** (dimensional analysis, logarithms, graph analysis, experimental design, error analysis, particulate modeling) kept separate from concepts.
- Each concept has a stable id, student-facing name, definition, include rule, exclude rule, positive and negative example, aliases, related concepts, prerequisites, primary and related official topics, and a hash of its meaning-bearing fields.
- Every one of the 91 topics has at least one primary concept; concepts cross topics and units freely (e.g. `pka-speciation` is relevant to 8.5, 8.7 and 8.9).
- **Research traceability:** all 810 research micro-labels map to exactly one concept or skill (800 by pattern, 9 to skills, 1 by topic default), recorded in `taxonomy.v1.json → microConceptMap`. All 57 research groups are crosswalked (kept, renamed, split or merged).
- Findings about the research draft: several near-duplicates (e.g. `formal charge calculation` listed under 2.5, 2.6 and 2.7; Brønsted-Lowry and conjugate pairs under both 4.8 and 8.1); some labels are skills rather than concepts (`dimensional analysis`, `slope of concentration-time graph`, `natural-log algebra`); some are prerequisites (`Lewis structure as prerequisite`); groups were missing for whole topics (mass spectrometry, PES, empirical formula, alloys, solid types, phase-change energy, catalysis, buffer capacity, coupled reactions, Nernst); topic 8.4's name in the research file ("Acid-Base Reactions") differs from the catalog and CED ("Acid-Base Reactions and Buffers"); the catalog name is kept.
- **Versioning:** classifications store the taxonomy version and the hash of every concept they assign. Editing a concept's definition, include or exclude text changes its hash and marks only the classifications that used it as stale (`cli.mjs status`). Renaming a display name or adding aliases does not.

**Adding or changing a concept safely:** edit `concepts.v1.source.json`, run `node scripts/concepts/cli.mjs build-taxonomy` (it refuses to write if any id, topic, link or pattern is invalid or creates a prerequisite cycle), run `node --test tests/concept-*.test.mjs`, then `cli.mjs status` to see which stored classifications became stale and re-run them with `prepare --skip-classified`. Never reuse or delete an id that has been assigned; mark it deprecated and point to the replacement instead. A change that alters meaning for many concepts should bump `taxonomyVersion`.

## 3. Classification method

The classifier is asked "what must a student do to answer this?", not "which words appear?".

1. **Content retrieval** (`lib/concepts/content.mjs`): gathers text, crop rectangles, source PDF pages, shared stimulus, FRQ part list, catalog topics, crop-verification status and warnings, and computes a **content hash**.
2. **Readiness gate**: flags records whose text cannot be trusted alone: answer/scoring pages, illegible question numbers, scans with no text layer, short or OCR-damaged text, references to diagrams/graphs/tables, MCQs whose choices are missing from the text, text that runs into the next question, unregistered stimuli, unverified crops. Flagged questions **must** be checked visually (the validator rejects a result that did not look at the image).
3. **Image handling** (`render_regions.py`): renders each crop at 2x, the full source page for context, and each shared stimulus. The classifier compares crop and page, reports crop defects (`cropIssue`), and may classify from the full page when the crop is cut off. If essential content is not visible anywhere, the record is stored as `blocked` with **no concept tags**.
4. **Candidate narrowing** (`candidates.mjs`): 8–24 likely concepts with definitions, from the catalog topics, related concepts and terms in the text. It is a reading aid; the classifier may choose any concept in the compact reference, so cross-topic concepts are not lost.
5. **Solution-requirement analysis** (prompt `classifier.v1`): per part, decide the operation, the chemical relationship, and for MCQs what separates the key from distractors; assign `primary` (normally one, at most two), `supporting` (materially necessary non-trivial steps), `contextual` (mentioned but not needed; never searchable), actions, representations, skills, and a one-sentence evidence statement for each primary/supporting tag. No answers are recorded.
6. **Validation** (`records.mjs`): concept ids exist (aliases are normalized with a warning), question and part ids resolve (refined parts such as `b-i` must refine a catalog part), every catalog part is covered, no duplicate tags, evidence present, actions/representations from the fixed lists, official topics exist, `answerKeyUsed` is false, visual check performed when required. Invalid results are never stored.
7. **Independent second pass**: a different model classifies blind; `cli.mjs compare` marks agreement as `machine_reviewed` and disagreement as `needs_attention`.
8. **Human verification**: review sheet → decisions file → `cli.mjs review`. Only `human_verified` records are published by default.
9. **Versioned persistence** (`classifications.json`): each question has a `current` record (content hash, taxonomy version/hash, concept hashes, prompt version, engine/model/run, flags, review status) and a `history` of superseded records and review events. A human-verified record is never overwritten by machine output unless forced.

Review states: `machine_generated` → `machine_reviewed` (second pass agreed) or `needs_attention` → `human_verified` or `rejected`; `blocked` for incomplete content. Rejected and blocked questions are re-run by preparing them again.

### Models

The pilot used Claude Opus 5.5 (pass A) and Claude Sonnet 5.5 (pass B) as Claude Code subagents with the prompt files above, because no API key is configured on this machine and the subagents can read the rendered images. For the full catalog, the same packets and prompt can be sent through the Message Batches API (50% price) with prompt caching of the fixed prompt and concept reference. Measured cost and throughput are in [pilot-report.md](pilot-report.md). That API path is not implemented in code yet: it needs the official `@anthropic-ai/sdk` dependency, which would change the student Worker's lockfile, and credentials. Do it in a separate tooling package or with `ant` once an owner approves the dependency.

## 4. Running it

```bash
node scripts/concepts/cli.mjs build-taxonomy        # validate research + source, write taxonomy and graph
node scripts/concepts/cli.mjs select-pilot --run pilot-v1
node scripts/concepts/cli.mjs prepare --run pilot-v1                 # packets + rendered images (needs uv; uses PyMuPDF 1.26.6)
node scripts/concepts/cli.mjs prepare --run unit2 --unit u2 --type MCQ --skip-classified   # selections; skip current, non-stale records
#   classifiers write runs/<run>/results-a/<id>.json following prompts/classifier.v1.md
node scripts/concepts/cli.mjs ingest --run pilot-v1 --pass a --dry-run   # validate only
node scripts/concepts/cli.mjs ingest --run pilot-v1 --pass a             # store (keeps history)
node scripts/concepts/cli.mjs compare --run pilot-v1 --pass b            # independent second pass
node scripts/concepts/cli.mjs evaluate --run pilot-v1 --reference research/concepts/benchmark/reference-pilot-v1.json
node scripts/concepts/cli.mjs review-sheet --run pilot-v1                # HTML for human review
node scripts/concepts/cli.mjs review --file concept-review-decisions.json
node scripts/concepts/cli.mjs status                                     # counts and stale records
node scripts/concepts/cli.mjs export-index                               # verified-only search index
node scripts/concepts/cli.mjs export-index --provisional                 # includes machine output, for testing only
node --test tests/concept-*.test.mjs
```

Resuming: `prepare` and `render_regions.py` skip existing images; results are one file per question, so an interrupted batch keeps what it wrote. `--skip-classified` avoids re-classifying records that are current and not stale (content hash and concept hashes unchanged). Everything except `ingest`/`compare`/`review` without `--dry-run` is read-only on the store.

Querying the concept graph with Graphify:

```bash
graphify explain "Formal charge" --graph research/concepts/concept-graph.json
graphify path "Formal charge" "Topic 2.7 VSEPR and Hybridization" --graph research/concepts/concept-graph.json
```

## 5. Human review

The private question-image review service stores crop approvals in D1/R2 with its own state machine; reusing it would mix concept decisions into crop history. Concept review is a separate, file-based flow: `review-sheet` writes a standalone HTML page per run showing the crop images, every tag with role and evidence, flags, content/diagram status and the second-pass disagreement. A reviewer approves, rejects, flags, unticks tags or adds tags, then downloads a decisions JSON that `cli.mjs review` applies with full history. The sheet never writes anywhere itself.

## 6. Known limitations

- No human-verified benchmark exists yet. Accuracy numbers in the pilot report are measured against a **model-adjudicated** reference and must be confirmed by a chemistry teacher before broad tagging.
- Concept definitions and boundaries are ChemAtlas proposals, not reviewed by a teacher.
- The micro-label map was produced by patterns; it is for traceability only and is not used to classify questions.
- Shared stimuli outside the six registered 2008 groups are only visible if they are inside the crop or on the same page; questions whose stimulus is on another page are blocked rather than guessed.
- The catalog's `primaryUnit` field is inconsistent (section 1); this work does not modify it.
