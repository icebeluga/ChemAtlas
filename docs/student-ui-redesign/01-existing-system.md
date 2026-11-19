# ChemAtlas existing system (as of 4f965e3)

Facts only, with `path:line` references. Read from the worktree `../ChemAtlas-redesign` (branch `feature/student-ui-redesign`, HEAD `7f720f9`). `git diff --stat 4f965e3 HEAD` over `components lib app worker public student scripts tests package.json vite.config.ts` is empty, so production code equals `4f965e3`; HEAD only adds `design-previews/` and `docs/`. Line numbers refer to this worktree unless a section says otherwise. `components/student-app.tsx` is 578 lines, mostly very long single-line JSX, so ranges below are line spans of those long lines.

Counts were produced with read-only `node -e` over `public/*.json` in the worktree.

---

## A. Question catalog

### A1. Files in `public/` and who loads them

| File | Size | Loaded by / when | Top-level shape |
|---|---|---|---|
| `student-questions.json` | 3.2 MB | `components/student-app.tsx:237` `fetch("/student-questions.json")` in a mount `useEffect` (L236), on every page load of `/` and `/practice-builder` (both render `ChemAtlas`) | object: `units`(9), `questions`(1564), `sourcePages`(2159), `includedSourcePages`(886), `sourceFiles`(8), `topicDetails`(91 keys), `audit`, `stats` |
| `questions.json` | 3.2 MB | **Not fetched by any app code.** Read by tests (`tests/public-catalog-integrity.test.mjs:5`, `tests/stage3-worksheet.test.mjs`, `tests/worksheet.test.mjs`, `tests/stage3-catalog.test.mjs`) and probed for HTTP 200 by `scripts/release/smoke.cjs:56`. Same shape, 1542 questions (baseline; student file adds 22) | same keys as above |
| `curriculum-topics.json` | 53 KB | Not fetched by the app. Only existence/non-empty asserted in `scripts/assert-student-private-config.mjs:45` | `version, reviewedAt, sources, units(9), topics(91: id,name,unit,description,learningObjectives,pdfPages,printedPages,sourceUrl)` |
| `worksheet-content.json` | 150 KB | `components/practice-builder.tsx:59` (mount effect, `/practice-builder` page only) | `{questions, contexts, review}` (type `lib/worksheet-content.ts:9-13`) |
| `worksheet-sources.json` | 8.8 KB | `components/practice-builder.tsx:56` (same effect). On failure falls back to an empty registry (L57) | `{questions(72), references:[439,440,441], answerKeyPage:2064}` (type `Registry`, `lib/worksheet.ts:10`) |
| `worksheet-fragments.pdf` | 2.2 MB | `lib/worksheet-render.ts:9` default `loadFragments`, called only when composing a PDF that contains a `region` block | PDF, one page per vector fragment (max index used = 247) |
| `student-page-audit.json` | 15 KB | Linked as a download at `components/student-app.tsx:453` (`<a href="/student-page-audit.json">`); same data is embedded as `catalog.audit` and rendered by the `audit` view (L567). Asserted by `tests/stage3-catalog.test.mjs` | audit object (`totalPages, questionRecords, pagesReferencedByQuestionRecords, unreferencedPages, unresolvedPages, classified, legacy, review, assignmentsByEvidence, coverageNote`) |
| `page-audit.json` | 14 KB | Not referenced by any app, test or script found | same keys |
| `classification-method.md` | 11 KB | Linked at `components/student-app.tsx:453` (`target=_blank`) | markdown |
| `pdf.worker.min.mjs` | 1.3 MB | pdf.js worker: `GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"` at `student-app.tsx:86`, `:186`, `components/worksheet-preview.tsx:24` | pdf.js worker |
| `source/bank-01.pdf` … `bank-08.pdf` | 4.4 to 14 MB each | `catalog.sourceFiles[i].url`; opened by pdf.js with `rangeChunkSize: 65536` (`student-app.tsx:89`, `:189`) | `sourceFiles` = 8 entries `{url, from, to, bytes}`: bank-01 pages 1-300, bank-02 301-600, bank-03 601-900, bank-04 901-1200, bank-05 1201-1500, bank-06 1501-1800, bank-07 1801-2100, bank-08 2101-2159 (global compiled-PDF page numbers) |
| `favicon.svg` | | `student/app/layout.tsx:8` | |
| `student-version.json` | | **Not in repo.** Generated into `public/` at release build time and deleted after (`scripts/release/validate.sh`, `scripts/release/manifest.py:192-195`); probed by `smoke.cjs:57` | |

Fallback URL `"/ap-chemistry-mega.pdf"` appears at `student-app.tsx:89`, `:189` and `lib/question-source.ts:15` for a page not covered by `sourceFiles`; no such file exists in `public/` (not found).

Also bundled into the client JS (not fetched): `research/stimuli.json` imported at `student-app.tsx:6` and `lib/worksheet-pdf.ts:3` (3.4 KB, 6 shared stimuli; shape `{schemaVersion, stimuli:{id:{sourceDocument, regions[{page,rect}], questionIds[], verificationStatus, verificationNote}}}`).

### A2. Question record type

`type Question` at `components/student-app.tsx:35-43` (client-side type; the JSON has more keys):

| Field | Type / values | Notes |
|---|---|---|
| `id` | string | Formats found in the 1564 records: `frq-<year>-<n>-<n>` (222), `mcq-<year>-<n>-<n>` (1336), `mcq-<year>-practice-<n>-<n>` (3), `frq-<year>-sample-<n>-<n>` (2), `frq-<year>-practice-<n>-<n>` (1). User-added questions: `manual-<bankId>-<page>-<number>-<Date.now()>` (`student-app.tsx:381`) |
| `type` | `"MCQ" \| "FRQ"` | 1285 MCQ, 279 FRQ |
| `year` | `string \| null` | `null` for user-added banks |
| `exam`, `number`, `source` | string, number, string | `source` is the bank display name |
| `pages` | `number[]` | global compiled-PDF page numbers (for user banks: pages inside that PDF). In all 735 classified, `pages` equals `sourcePagesOriginal` |
| `sourcePagesOriginal` | `number[]?` | preferred by `originalPagesFor` (L391) |
| `primaryUnit`, `unitName` | string? | **Stale relative to `primaryTopic`**: 569 of 735 classified records have a `primaryUnit` different from the unit that owns their `primaryTopic` (example `frq-2005-1-6`: `primaryUnit:"u3"`, `primaryTopic:"8.3"`). The UI never filters on `primaryUnit` (only set in `addSourceQuestion`, L382). `tests/public-catalog-integrity.test.mjs:32` checks only that `primaryUnit` is a known unit id |
| `primaryTopic`, `topicName` | `string \| null` | topic ids are `N.M` (91 topics; unit id `uN` owns topics `N.*`, verified 0 mismatches) |
| `secondaryTopics`, `secondaryTopicNames` | `string[]` | |
| `relatedTopics` | `string[]?` | superset including the primary topic (0 classified records lack it; primary always present) |
| `topicParts` | `{label, topics[], topicNames[], textPreview, confidence?, rationale?}[]?` | per-FRQ-part topic mapping; present on 255 classified records |
| `multiConcept` | boolean | 260 classified true |
| `classificationConfidence` | number | range 0 to 1 |
| `status` | `"classified" \| "review" \| "legacy"` | |
| `classificationRationale`, `classificationMethod`, `legacyConcepts`, `evidencePages`, `reviewReason`, `textPreview` | | |
| `sourceRegions` | `{page:number; rect:number[4]}[]?` | `rect = [x0,y0,x1,y1]` in PDF points at scale 1, origin top-left (used as viewport coordinates in `PdfQuestionPage`, L100-110). Present (non-empty) on 1541 of 1564 |
| `sourceAssets` | `string[]?` | e.g. `["/source/bank-01.pdf"]`; present in JSON, not read by the UI |
| `sourceBank` | `string?` | absent on every bundled record; `bank-<uuid>` for user-added banks (`student-app.tsx:372`); `"mega"` treated as bundled |
| `stimulusIds` | `string[]?` | links to `research/stimuli.json`; 15 classified records have it |
| JSON-only keys (not in the TS type) | `fullText, extractionWarnings` | `fullText` present on 733 classified |
| `displayTopic`, `displayName` | computed in `questions` memo (L283-288) | override-aware |

Related types: `Unit {id, name, topics:[id,name][]}` (L33), `Bank` (L44), `Attempt {attempts, wrong, correct, last, history[{date,result}]}` (L45), `Saved` (L46), `Catalog` (L47). Lib-level partial types: `QuestionSource {pages, sourcePagesOriginal?, sourceBank?}` and `Region`, `SourceFile` at `lib/question-source.ts:3-5`; `WorksheetQuestion` at `lib/worksheet-pdf.ts:10`; `Candidate` at `components/practice-builder.tsx:14`.

### A3. Verified counts (`public/student-questions.json` unless stated)

| Metric | Count |
|---|---|
| Total questions | **1564** (`stats.questions` = 1564) |
| By status | classified **735**, review **789**, legacy **40** |
| By type (all) | MCQ 1285, FRQ 279. Among classified: MCQ 480, FRQ 255 |
| Classified with `primaryTopic` | **735** (all) |
| Classified with more than 1 `relatedTopics` | **366** (histogram of `relatedTopics.length` among classified: 1:369, 2:151, 3:83, 4:81, 5:30, 6:17, 7:1, 10:1, 11:2) |
| Classified whose `relatedTopics` span more than one unit | **210** |
| Classified with non-empty `sourceRegions` | **714** (all statuses: 1541) |
| Classified with `topicParts` | 255; `multiConcept` true 260; with `stimulusIds` 15 |
| `worksheet-content.json` `questions` entries | **201** |
| Of those, classified (reviewed print layout among classified) | **83** (confirms prior session). Others: review 116, legacy 2. All 201 ids exist in the catalog |
| Entries with a `context` | **17** |
| `contexts` | **6** (`2008-a-reactions-15-17`, `2008-a-elements`, `2008-a-titration`, `2008-a-gases`, `2008-a-energies`, `2008-a-signs`) |
| Block kinds in `questions` | region 242, paragraph 4, choices 4 (no `table` blocks present) |
| Block kinds in `contexts` | region 6, paragraph 1 |
| `worksheet-content.json` `review` entries | **1450** (id to a reason string, e.g. "The question needs a verified column or multiple source regions."); by catalog status: classified 652, review 673, legacy 38, id not in catalog 87 |
| `worksheet-sources.json` `questions` | 72 entries, 33 with an `answer`; 8 are classified; 72 are all in `worksheet-content.json` |
| Units | 9 (`u1`..`u9`; topic counts 8,7,13,9,11,9,12,11,11 = 91) |
| `questions.json` (baseline) | 1542 total: classified 715, review 788, legacy 39 |

Classified counts per unit if matching `primaryTopic` only: u1 78, u2 59, u3 150, u4 116, u5 69, u6 48, u7 73, u8 84, u9 58 (sum 735). If matching any `relatedTopics`: u1 96, u2 95, u3 219, u4 187, u5 88, u6 80, u7 97, u8 106, u9 83 (sum 1051).

Classified year values: 1984, 1999, 2001-2006, 2008-2011, 2014-2018, 2020-2024.

### A4. How filtering works today

**Question Bank (`view === "library"`, `student-app.tsx:468-516`)**
- Pool: `questions` memo (L283-288) = all catalog records after overrides. `includeReview` is a constant `false` (L199), so `filteredQuestions` (L320-326) keeps only `status === "classified"`.
- Unit match: any `relatedTopics` id whose unit equals `selectedUnit` (`matchingUnits.includes(selectedUnit)`), i.e. any-related, not primary-only.
- Topic match: `relatedTopics.includes(selectedTopic)`.
- Type: `typeFilter === "Mixed" || q.type === typeFilter`.
- Search: case-insensitive substring over `"${year} ${exam} ${number} ${textPreview} ${displayName}"`.
- Override handling (L283-288): a user topic override sets `status` to `classified`, `displayTopic` to the override, and `relatedTopics = [override, ...old related minus primary and override]`.
- Filter state lives in the URL (`unit`, `topic`, `type`, `q`) via `updateFilters` (L226-235, `history.replaceState`), parsed by `parseChemAtlasLocation`. `resultPage` resets to 0 on filter change.
- Pagination: 50 per page via `slice(resultPage*50, (resultPage+1)*50)` (L482) with Previous/Next and "Page x of y" (L513).
- Controls: selects UNIT / TOPIC (topics limited to the unit) / TYPE, plus a SEARCH input (L472); "Clear filters" button (L474).
- `available` (L316) = classified with a `displayTopic`; used only for per-unit and per-topic counts (L452, L465), counting any-related.
- `startSession(focus?)` (L341-352) uses the same any-related unit/topic/type rules, plus `focus` (a topic id, or `"weak"` meaning questions with `progress.wrong > 0`); shuffles with `Math.random` and slices `sessionSize` (5/10/15/20/30).
- Detail prev/next: `detailSequence` = `filteredQuestions` if the current question is in it, else all `questions` (L331).

**Practice Builder (`components/practice-builder.tsx:96-108`)**
- Pool: `questions` prop, which is the **entire** merged catalog (`student-app.tsx:436`), with **no status filter**: `review` and `legacy` records are selectable (1564).
- `tagged = relatedTopics?.length ? relatedTopics : [displayTopic]`.
- Unit: `tagged.some(t => t.split(".")[0] === unit.replace(/^U/i,""))` (any-related). Topic: `tagged.includes(topic)`. Type: `all|MCQ|FRQ`.
- Extra filters (`filterDefaults`, L25): `year` (from registry exam year else `q.year`), `source`, `history` (`attempted` = `progress.attempts`, `missed` = `progress.wrong`), `print` (`ready` = has an entry in `content.questions`), `search` (over `"${registry exam ?? exam} ${number} ${displayName} ${textPreview}"`).
- Pagination: 20 per page (`resultSize`, L26, L211, L233-235). Local state only, not in the URL.
- "Auto-add from matches": first `amount` (1-50, default 5) matches not yet selected (L207-208).

**Where topic labels are shown**
- List row: `"Primary topic"` if the context topic equals `displayTopic`, else `"Also filed under"` (L496), where the context topic is the selected topic filter or else the question's own topic (L483). "Classification details" `<details>` lists primary topic, rationale, "Secondary topics" (related minus primary) and `topicParts` (L504-510). A "N mapped part(s)" label shows when parts exist for the topic (L503). `q.textPreview` shows only when there are no relevant parts (L497).
- Detail view: `PRIMARY TOPIC` callout and `ALSO FILED UNDER` tags with `unit · id · name` (L522); "WHY THIS QUESTION APPEARS HERE" panel with parts (L523); classification evidence (L524).
- Practice view footer: `Primary topic:` plus `secondaryTopicNames` as "Also:" tags (L535).
- `partsForTopic(q, topicId?)` (L388): `(q.topicParts||[]).filter(part => !topicId || part.topics.includes(topicId))`. In the detail source viewer the part labels become `highlightLabels` (yellow marks on text anchors starting with the label, L526).

### A5. Catalog validation on this branch

- `tests/public-catalog-integrity.test.mjs` (reads `public/questions.json`): unique ids, types match `stats`, units and `relatedTopics` reference the curriculum, `pages` map into `sourceFiles`.
- `tests/stage3-catalog.test.mjs`: baseline `questions.json` vs `docs/stage-3/questions.stage3-v1.json` (1564 records, 22 accepted additions, 87 pending, 864 pending shared changes, 6 stimuli, 17 stimulus links); student catalog equals the staged one except `frq-2016-1-385` and `mcq-2014-practice-17-179`; `student-page-audit.json` equals `catalog.audit`.
- `scripts/assert-student-private-config.mjs:33-35` (built check): `catalog.units.length === 9` and `questions.length === stats.questions`.
- `lib/catalog-audit` and `lib/source-audit`: not found on this branch.
- Python tests in `tests/test_*.py` cover extraction, crop geometry and boundary detection (7 files, not read in detail).
- Build tooling for the catalog: `scripts/assemble_catalog.py`, `scripts/build-stage3-catalog.py`, `scripts/diff_catalog.py`, `scripts/index_bank.py`, `scripts/package_source.py` (names only; not read).

---

## B. Question images and source documents

### B1. `PdfQuestionPage` (`components/student-app.tsx:77-134`)

Props (L77): `page` (local page number inside the file), `sourcePage` (global compiled-PDF page), `bankId?`, `bankName`, `questionNumber=0`, `cropView=false`, `highlightLabels=[]`, `sourceAsset?`, `sourceRegions=[]`.

- pdf.js: `await import("pdfjs-dist/legacy/build/pdf.mjs")` (L85), `workerSrc = "/pdf.worker.min.mjs"` (L86).
- Document: for a user bank (`bankId && bankId !== "mega"`), reads the PDF `ArrayBuffer` from IndexedDB with `readPdf(bankId)` (L87; throws "This added bank PDF is no longer available in this browser." if missing), else `getDocument({ url: sourceAsset || "/ap-chemistry-mega.pdf", rangeChunkSize: 65536 })` (L89). So bundled PDFs use HTTP range requests; every `PdfQuestionPage` mount opens its own document task and destroys it on unmount (L127). No shared cache on this branch.
- IndexedDB: database `apchem-practice-bank` v1, object store `pdfs`, key = bank id, value = the `File` (`student-app.tsx:51-76`, constants L49-52).
- Render: scale = `min(2, max(0.6, (frameWidth - 24) / pageWidth))` (L95); full page rendered to an offscreen scratch canvas, then drawn to the visible canvas.
- Crop (L108-118): when `cropView` and `sourceRegions` has entries on `sourcePage`, crop rect = union (min/max) of those regions times scale, clamped to the viewport; otherwise whole page. Canvas CSS size = crop size.
- Highlight (L120-123): for each `highlightLabels` entry find the first text item whose trimmed text starts with the label, inside the crop and (if regions exist) inside a region; fill `rgba(250,197,90,.48)` over its text box.
- States: `busy` shows `.pdf-wait` "Rendering original page…" (L131); error text shows `.pdf-error` (L133); `cropView` note `.pdf-crop-note` ("Source region · full page remains available…" or "No reliable crop boundary recorded; showing the full page.", L132). Header `.pdf-label` "PDF SOURCE IMAGE" plus bank name and original page (L130).
- No zoom, fit or fullscreen controls on this branch (these exist only on `eba3977`, section E). Re-renders on change of `page, bankId, questionNumber, cropView, sourceAsset, sourcePage, JSON.stringify(sourceRegions), highlightLabels` (L126).

Page mapping helpers: `originalPagesFor(q)` (L391) = `sourcePagesOriginal` if non-empty else `pages` else `[1]`; `pagesFor(q)` (L392) converts global pages to local file page numbers via `sourceFiles`; `sourceAssetFor(q,i)` (L393) returns the file URL. Library equivalents: `originalSourcePages`, `sourcePageLocation(page, files, bankId)` (`lib/question-source.ts:7-16`), `sourceBounds`, `renderSourceCanvas` (L18-37).

### B2. Named items

| Name | Status on this branch |
|---|---|
| `approvedImages` | `const [approvedImages] = useState<Record<string,string[]>>({})` at `student-app.tsx:146`. There is no setter and no code that fills it, so it is always `{}`. Consumers: `openQuestion` (L387) and the detail image panel (L526) would show an "Approved image" tab and `<img src>` stack, which can never render. **Approved PNGs are not loaded anywhere in the student app.** Only the private review API/plugin builds an `approvedImages` map (`app/api/admin/question-review/route.ts:62-75`, `scripts/vite/question-review-plugin.mjs:268-286`) |
| `verifiedCropReviews`, `cropIsVerified`, `stimulusIsVerified` | **Not found on this branch** (no match anywhere in the repo excluding node_modules). They exist only in commit `eba3977` (`components/student-app.tsx:80-85` there), reading `research/crop-visual-review.json` (exists on main: 96 reviews, 94 `visually_verified`, 2 `needs_review`, each `{questionId,type,source,originalPage,status,reviewedAt,verification,region?}`) and `research/stimuli.json` `verificationStatus` |
| `canonicalStimulusLinks` | `lib/question-review-backup.mjs:6-18`: builds `{questionId:[stimulusId,…]}` from `stimuli.json` `questionIds`, validating ids against `/^[a-zA-Z0-9_-]{1,160}$/`. Used only by review-backup API routes (`app/api/admin/question-review/backup/route.ts:4`, `…/backup/import/route.ts:5`) and `tests/question-review-backup.test.mjs`. Not used by student code |
| `stimulusDocument` | `import stimulusDocument from "../research/stimuli.json"` (`student-app.tsx:6`); used as the `stimuli` argument of `planWorksheet` in the old session worksheet (L544). Bundled in the client |
| `planWorksheet(questions, stimuli, originalPagesFor)` | `lib/worksheet.mjs:2-38` (types `lib/worksheet.d.mts`). Returns `[{question, segments:[{page, regions, stimulusId?}]}]`. Rules: a page where a question has no `sourceRegions` entry is a "full page" and is emitted once per worksheet (key `${sourceBank||"mega"}:${page}`); shared stimulus regions are emitted once per stimulus (first question that lists it), skipped if their page is already a full page; otherwise each page yields its `sourceRegions` for that page. Used by the old session worksheet (`student-app.tsx:544`) and by `composeWorksheet` for the fallback path (`lib/worksheet-pdf.ts:54`) |

### B3. Private question-image review system (boundary only)

- UI: `app/admin/question-review/page.tsx`, `app/admin/question-review/review-dashboard.tsx`.
- API: `app/api/admin/question-review/route.ts` (GET manifest + `approvedImages`, POST saves), `…/backup/route.ts`, `…/backup/import/route.ts`, `…/image/[folder]/[filename]/route.ts`. These use `import { env } from "cloudflare:workers"` and `export const runtime = "edge"`.
- Dev plugin: `scripts/vite/question-review-plugin.mjs` (local filesystem mode; `question-image-review.json` manifest, per `research/QUESTION_IMAGE_REVIEW.md:23`).
- Libraries: `lib/question-review-storage.mjs` (file, D1 and R2 adapters; `sha256Hex` at L8), `lib/question-review-backup.mjs` (`buildImageManifest`, `verifyBackupImageManifest`: checks PNG signature, byte length, SHA-256), `lib/cloudflare-access.mjs` (`authenticateReviewRequest`, fetches `https://<team>/cdn-cgi/access/certs`).
- D1 schema `db/schema.ts` (migration `drizzle/0001_question_image_review.sql`): `review_records(owner_id, entity_type[question|stimulus], entity_id, status, payload_json, updated_at)`; `review_history(history_id, owner_id, entity_type, entity_id, revision int, event_json, created_at)`; `crop_revisions(owner_id, entity_type, entity_id, revision text, crop_json, created_by, created_at, notes)`; `image_objects(…, revision, segment, object_key, byte_length, sha256, mime_type, created_at)`; `stimulus_links(owner_id, question_id, stimulus_id, created_at)`. R2 bucket binding `REVIEW_IMAGES`; image keys `owners/<owner>/question-images/<entity>/<revision>-segment-<n>.png`; PNG objects are immutable per revision (`lib/question-review-storage.mjs:41`, `:206`).
- Statuses (`route.ts:9`): `not_generated, pending_review, accepted, rejected, corrected_pending_review, missing_source`. The GET "approved" rule (`route.ts:62-73`): review `accepted`, `imageRevision === sourceRegionsRevision`, every PNG exists in R2, and every linked stimulus is also accepted with matching revisions.
- Deployed separately: `wrangler.private-review.jsonc` (name `chematlas-private-question-review`, D1 `DB`, R2 `REVIEW_IMAGES`, `workers_dev:true`). The student worker returns 404 for `/admin/**` and `/api/admin/**` (`worker/index.ts:10`, `lib/student-access.mjs:21-28`).
- **Does any student-facing code read review data at runtime? No.** The student code reads no review endpoint; `student/app/**` imports only `components/student-app` and CSS. `README.md:49-51` states the student build "uses original PDF fallback for review images until an independently authorized read-only integration is audited". `scripts/assert-student-private-config.mjs:28-32` fails the build if any `admin|review-dashboard|question-review|question-images` path is in the student build output.
- **How approved crops reach the student bundle:** they do not. No generated JSON or image set derived from the review system exists in `public/`. The student catalog's `sourceRegions` (in `student-questions.json`), `research/stimuli.json`, and the reviewed print content in `public/worksheet-content.json` + `public/worksheet-fragments.pdf` are static files committed to the repo (build scripts for them were not located; see section "Could not determine"). `research/crop-visual-review.json` is committed but is unused by the student app on this branch (used only on `eba3977`).
- Files a student-UI change must not touch (to keep the boundary): everything under `app/admin/**`, `app/api/admin/**`, `db/**`, `drizzle/**`, `wrangler.private-review.jsonc`, `lib/question-review-*.mjs`, `lib/cloudflare-access.mjs`, `scripts/vite/question-review-plugin.mjs`, and tests `tests/question-image-review.integration.test.mjs`, `tests/question-review-*.test.mjs`. Note `app/globals.css` is shared: it holds the review dashboard `.qiv-*` styles (L36-61) as well as student styles, and `app/layout.tsx` (non-student appDir) imports it; `student/app/layout.tsx` imports `@/app/globals.css` plus `@/app/student-workspace.css`.

### B4. Worksheet libraries: exported functions

`lib/worksheet.ts`
- `steps` (L5) `["Select","Arrange","Format","Export PDF"]`; `formats`/`ExportMode` = `questions | answers | combined` (L6-7).
- Types `Printable {pages:Region[]; exam?; answer?}`, `Registry {questions:Record<string,Printable>; references:number[]; answerKeyPage:number}` (L9-10).
- `worksheetSource(question, registry?) -> {pages, fullPages, answer?, exam?}` (L11-20): approved registry pages for bundled-bank questions, else the full original pages (`rect: []`). Used for the Step 1 "Preview" only.
- `formatSchema`, `draftSchema`, `backupSchema`, types `Format`, `Draft`, `Backup`, `defaultFormat`, `presets` (L22-57); `newWorksheetId()` (L59), `newDraft(name?)` (L65), `addEntries(draft, ids)` (L69), `worksheetStorageKey = "chematlas-worksheets-v1"` (L80).

`lib/worksheet-content.ts` (types only): `ContentBlock` = `paragraph {text}` | `choices {choices[]}` | `table {rows[][]}` | `region {fragment, page, rect}`; `QuestionContent {blocks, context?}`; `WorksheetContent {questions, review?, contexts}`.

`lib/worksheet-render.ts`
- `renderWorksheet(draft, questions, registry, mode, files, open, signal, content, loadFragments?) -> Promise<Uint8Array>` (L6-39): dynamically imports `worksheet-pdf`, calls `composeWorksheet`, supplying a `render(region, question)` callback that opens the source PDF via `open`, gets the page, computes `sourceBounds`, renders to a canvas at **300 dpi** (`300/72`), encodes PNG, returns `{png,width,height}`. Throws user-facing errors if a PDF or page cannot be opened. Honors `AbortSignal`.

`lib/worksheet-pdf.ts`
- `orderedEntries(draft, questions)` (L13-20): stable sort by group key: `type` (MCQ "0" before FRQ "1"), `topic` (displayTopic, "~" last), none (L16-19). Sort uses `localeCompare` with numeric collation.
- `composeWorksheet(draft, catalog, registry, mode, content, loadFragments, render) -> Promise<Uint8Array>` (L22-306). Inputs: draft; full question list (`WorksheetQuestion[]`); `Registry`; `ExportMode`; `WorksheetContent`; a loader returning the fragments PDF bytes; and `render(region, question?) -> {png,width,height}`. Output: PDF bytes from `pdf.save()`. Throws if an entry id is missing from the catalog (L27), references requested but `registry.references` empty (L57), no entries (L58), or `mode !== "questions"` and no entry has a verified answer (L59).
- Reviewed content path (question has `content.questions[id]` with blocks, and, if it has `stimulusIds`, a `context`; only for bundled-bank questions, L28, L37): drawn from `blocks`. `region` = vector page `fragment` index (0-based `getPage(index)`) of `worksheet-fragments.pdf`, embedded with `pdf.embedPage` using its crop box and scaled to `min(1.2, available/width)` (L153-170); `paragraph` typeset with Helvetica, supports `_{…}` subscript and `^{…}` superscript runs (L107-145); `choices` drawn as `(A)  text` lines inset 13 pt (L146-148); `table` rows joined by `   |   ` (L176). For MCQ: `[...sharedContext, ...blocks]` as one unit; for FRQ: first block with shared context, each further block as its own unit headed "Question N (continued)" (L267-275). `placeBlock` (L179-198) scales a unit down (never up) to fit the page, preferring to fill the rest of the current page if that needs at least 92 percent of the fit scale, else starts a new page.
- Shared contexts: `usedContexts` set (L56, L264-266): the first question (in `orderedEntries` order) that carries a given `context` gets `content.contexts[context]` blocks prepended; every later question with the same context gets none. This is de-duplication across the whole worksheet, not only consecutive questions. A missing context key throws (L265).
- Question WITHOUT reviewed content (no entry or empty blocks; stimulus-linked without a context; every user-added-bank question): put in `useFallback` (L36-38), and the fallback closes over pages: any other question that touches a fallback page (own pages or its stimulus regions) also falls back (L39-53). `planWorksheet` is called on those with `sourceRegions: undefined`, so each page is a full page. Each segment is rendered by `place()` (L200-223) as a PNG of the **entire source page** at 300 dpi, scaled to `min(1.2, available/width)` and height-fit, headed with the question label (continued pages get "(continued)") and the citation line plus "Full source page. May contain adjacent questions or printed answers." (L258). A page already printed for an earlier fallback question is not printed again; the later question prints "<title> · See source page included earlier." (L250-252). It does not use `registry.questions[id].pages` for layout.
- Answer key (L289-300): `mode !== "questions"` appends an "Answer key" page listing `i. <registry answer>` or "Verified answer unavailable"; footer "Printed key source: 2008 AP Chemistry Practice Exam · compiled PDF page {answerKeyPage}" (answerKeyPage = 2064). `mode === "answers"` skips the questions section. Answers come only from `registry.questions[id].answer` for bundled questions (33 of 72 registry entries have one). The UI disables "answers"/"combined" unless at least one selected entry has an answer (`practice-builder.tsx:149, 301`).
- Pagination: first page header (title, subtitle, Name/Date/Class fields, instructions); `ensure(space)` adds a page when `y - space < floor` (floor = margin + 12 if page numbers); `entry.breakBefore && i` forces `addPage()` (L239); section heading shown when the group changes (type or topic grouping, L237-244); FRQ response lines (`entry.lines ?? f.lines`, 16 pt apart) with a "response space" heading on page overflow (L277-281); `f.gap` spacing after each question; AP reference tables (compiled pages 439, 440, 441) each on its own page when `f.references` (L284-287); footer "n / N" if `pageNumbers` (L301-304).
- Fonts: no font files. `pdf-lib` `StandardFonts.Helvetica` (body), `StandardFonts.Symbol` (for characters in `/[αβγΔδμλπσΩ→←⇌−]/`), `StandardFonts.TimesRomanBold` (headings) (L62-64, L111). Characters not encodable in the font become `?` (`safe`, L74-78; `glyph`, L112-116).

`lib/worksheet.mjs`: `planWorksheet` (see B2). `lib/worksheet-sources*`: not found; the registry is `public/worksheet-sources.json`.

---

## C. Worksheet state and export

### C1. Draft / backup data model (`lib/worksheet.ts`)

- `Format` (zod `formatSchema`, L22-32): `title`(str ≤100), `subtitle`(≤120), `paper` `"Letter"|"A4"`, `landscape` bool, `margin` 24-72, `font` 9-16, `gap` 4-36, `lines` int 0-12, `name`, `date`, `classField`, `numbering`, `citations`, `pageNumbers`, `references` (bools), `grouping` `"none"|"type"|"topic"`, `mcqTitle`(≤80), `frqTitle`(≤80), `instructions`(≤320), `mcqInstructions`(≤240, default ""), `frqInstructions`(≤240, default "").
- `defaultFormat` (L44-49): title "AP Chemistry Practice", Letter, portrait, margin 36, font 11, gap 16, lines 3, name true, date true, classField false, numbering true, citations false, pageNumbers true, references false, grouping `"type"`, mcqTitle "Multiple choice", frqTitle "Free response".
- Entry (`entrySchema`, L33): `{id: string 1-200, breakBefore: boolean, lines?: int 0-12}`.
- `Draft` (L34-37): `{id: string 1-100, name: string ≤100, format, entries: Entry[] max 500}`, refine: no duplicate entry ids.
- `Backup` (L38-39): `{version: 1, active: string, drafts: Draft[] max 100}`, refine: unique draft ids and `active` must be one of them.
- `presets` (L51-57): Standard Practice Worksheet; AP Chemistry MCQ Practice (`lines:0`); AP Chemistry FRQ Practice (`lines:6`); Mixed Practice Examination (`classField:true`, `lines:5`); Compact Review Sheet (`margin:28, gap:6, lines:0, grouping:"none"`). Applying a preset also sets the builder's type filter.
- `newWorksheetId()` = 32 hex chars from `crypto.getRandomValues(16 bytes)` (L59-63). `newDraft(name="Untitled worksheet")` = `{id: newWorksheetId(), name, format:{...defaultFormat}, entries:[]}` (L65-67). `addEntries(draft, ids)` skips duplicates and stops at 500, returning the same draft if nothing added, new entries `{id, breakBefore:false}` (L69-78).
- Import limits: file ≤ 2,000,000 bytes (`practice-builder.tsx:172`), total drafts ≤ 100 (L174); imported drafts get new ids (L175). Export file name `chematlas-worksheets.json` (L145).

### C2. Where state lives and persists

| Store | Key | Value | Read / written by |
|---|---|---|---|
| localStorage | `chematlas-worksheets-v1` (`worksheetStorageKey`, `lib/worksheet.ts:80`) | JSON `Backup` | read in a mount effect (`student-app.tsx:154-176`) with `backupSchema.safeParse`; written by `saveWorksheets` (L177-181) on every change; on failure sets notice "Draft changes could not be saved in this browser. Download a worksheet backup before leaving." |
| localStorage (legacy) | `chematlas-student-worksheet-v1` (`BANK_WORKSHEET_KEY`, L50) | JSON array of question id strings (≤200 chars each) | migrated into the active draft (or a new draft "Imported Question Bank selection" if 100 drafts exist and a saved Backup parsed); key removed only if every id was added (L158-173) |
| localStorage | `apchem-studio-v2` (`STORAGE_KEY`, L49) | `Saved = {progress: Record<id, Attempt>, overrides: Record<id, topicId>, banks: Bank[] (non-"mega"), questions: Question[] (only those with sourceBank), sessions: number}` | read in the mount effect (L238-248), written by an effect when `catalog.questions.length` is non-zero (L250). `Attempt = {attempts, wrong, correct, last: "YYYY-MM-DD", history:[{date, result:"correct"\|"missed"\|"unsure"}]}` |
| localStorage (legacy) | `apchem-studio-v1` | `{progress:{id:{attempts,wrong,correct,last,history:[{date,correct:boolean}]}}}` | read once and migrated (L239-247); never written |
| IndexedDB | DB `apchem-practice-bank` v1, store `pdfs`, key = bank id (`bank-<uuid>`) | the uploaded `File` | `savePdf` / `readPdf` (L62-76); written by `importPdf` (L368-377) |

Other facts: progress export/import (`lib/progress-transfer.mjs`) is JSON `{format:"chematlas-browser-progress", version:1, exportedAt, progress, overrides, sessions}` capped at 2,000,000 chars, ≤20,000 records; it does not include banks, PDFs or worksheet drafts (`student-app.tsx:252-282`). No server-side persistence for students. State is not shared between `/` and `/practice-builder` except through these storage keys (each page load re-reads them).

In `student-app.tsx`: `const [backup, setBackup] = useState<Backup>()` (L153) is `undefined` until the mount effect ends (builder shows "Loading Practice Builder…", L436); `activeDraft = backup?.drafts.find(d => d.id === backup.active)` (L182); `worksheetIds = activeDraft?.entries.map(e => e.id) ?? []` (L183), used for the "View worksheet (N)" bar (L477-479) and for disabling "Add to Worksheet" (L498). The list "Add to Worksheet" handler calls `saveWorksheets({...backup, drafts: ...addEntries(draft,[q.id])})` (L499-501); no undo there.

`openWorksheetPdf(url?, bankId?)` (L184-190, `useCallback`): dynamic-imports pdf.js, sets worker, loads a user bank from IndexedDB or opens `url ?? "/ap-chemistry-mega.pdf"` with `rangeChunkSize: 65536`; returns `PDFDocumentProxy`. A new document is opened on every call (no cache).

`PracticeBuilder` props (`practice-builder.tsx:15-24`, passed at `student-app.tsx:436-442`): `questions` (all merged catalog records), `topics` (flat `{id,name,unit,unitName}`), `files` (`catalog.sourceFiles ?? []`), `progress`, `backup`, `save` (= `saveWorksheets`), `openPdf` (= `openWorksheetPdf`), `renderSource(question, region)` (returns a `<PdfQuestionPage>` using `sourcePageLocation`, with `cropView={!!region.rect.length}`).

### C3. `components/practice-builder.tsx` (315 lines)

- Steps (`steps` constant, tab strip L183-185; panel titles L148): 0 Select ("Select questions"), 1 Arrange ("Arrange worksheet"), 2 Format ("Format document"), 3 Export PDF ("Preview and export"). Header: title field, "Saved worksheets" select, "New worksheet", and a "Worksheet actions" `<details>` with Duplicate, Download drafts, Import drafts (L159-182). "N selected" count (L157).
- Step 0 (L191-237): search/unit/topic/type, "Additional filters" (year, source, print status, history), Clear filters, Auto-add, per-row Preview (renders `renderSource(q, region)` for the reviewed region(s) or original pages, L214-229), Add button. Chips: "Export ready" if `content.questions[id]` else "Full source page fallback" (L220); `content.review[id]` text shown (L221); "Verified answer" if the registry has one (L219).
- Step 1 (L239-265): rows with a drag handle (native HTML5 DnD: `draggable`, `onDragStart`/`onDrop`, L245-246), move up/down icon buttons, "Page break before" checkbox, FRQ "Response lines" number (0-12), Replace, Remove, and "Undo last change".
- Step 2 (L267-296): preset select, title/subtitle/instructions, paper, orientation, range sliders (margin, font, gap, lines), grouping, section headings and instructions, checkboxes for name/date/class/page numbers/numbering/citations/AP reference tables.
- Step 3 (L298-312): "PDF contents" select (Questions only / Separate answer key / Questions and answer key; the last two disabled without verified answers), Download PDF and "Open PDF to print" links (shown when bytes exist and not generating), status messages, and `<WorksheetPreview>`.
- Undo: single-level. `const [undo, setUndo] = useState<Draft>()` (L39) stores the previous whole draft when `update(next, true)` is called (L110-113). Undoable: add (list add and Auto-add), replace, move, page-break toggle, response-lines change, remove, apply preset. Not undoable: title/format field changes (`changeFormat` calls `update(next)` with `remember` false), draft name edits, new/duplicate/import (these clear undo). Undo applies only if `undo.id === draft.id`. Not persisted.
- Replace flow: Step 1 "Replace" sets `replacement = entry.id` and goes to Step 0 (L259); in Step 0 `add()` with `replacement` swaps the first eligible id into that entry, clearing its `lines`, goes back to Step 1 and sets notice "Question replaced." (L122-127); button label becomes "Use replacement"; "Cancel replacement" available (L210).
- Auto-add: L207-208 as above; ids not already in the draft, capped by `addEntries` at 500.
- Import/export of drafts: L143-147 (download JSON of the whole `Backup`) and L169-179 (validate with `backupSchema`, 2 MB cap, 100-draft cap, re-id).
- PDF generation (L65-82): effect with deps `[content, draft, files, mode, openPdf, questions, registry, step]`. It clears bytes, and only when `step === 3`, `registry` and `content` are loaded and the draft is non-empty, it starts a 120 ms `setTimeout` (the debounce), then `import("@/lib/worksheet-render")` and calls `renderWorksheet(draft, questions, registry, mode, files, openPdf, controller.signal, content)`. Cleanup clears the timer and aborts. It runs on the **main thread** (pdf-lib composition and canvas rendering; only pdf.js parsing uses its own worker). Result `Uint8Array` goes to `bytes`; an effect creates an object URL Blob (`application/pdf`) for the download/open links (L84-89). Any edit while on step 3 regenerates (draft changes each autosave).
- Registry fetch failure falls back to `{questions:{}, references:[], answerKeyPage:0}` silently (L27, L57); content fetch failure sets error "The reviewed worksheet content could not be loaded. Refresh and try again." (L60).

### C4. `components/worksheet-preview.tsx` (78 lines)

Props `{bytes: Uint8Array, count: number, onCount(n)}`. Loads the generated bytes with pdf.js (`getDocument({data: bytes.slice()})`, worker `/pdf.worker.min.mjs`, L19-32), calls `onCount(document.numPages)` once the document loads (L28). Shows one page at a time on a single `<canvas>`: Previous/Next, "Page X of N" (`aria-live`), zoom 0.5 to 2 in 0.25 steps, "Fit width" / "Fit page" (`aria-pressed`) (L62-72). Render scale = `zoom * min(width/natural.width, fitHeight/natural.height)` at `min(devicePixelRatio, 2)`; a `ResizeObserver` tracks the container (L33-41, L42-60). Container is `role="region"` `aria-label="Worksheet PDF"` `tabIndex=0`, canvas `role="img"` with label "PDF preview page N". Errors: "Could not display the preview. You can still download the PDF." / "This preview page could not be rendered.". Uses `AtlasButton` from `./ui/atlas-controls`. No thumbnails, no multi-page scroll.

### C5. Older print path in the session view

`view === "practice"` is the "Practice sessions" flow (builder form at L518, started by `startSession`, route `?view=practice&question=…&session=id1,id2…&step=n`). Inside it, a "Worksheet" button (`setShowWorksheet(true)`, L530) switches to `<section className="page worksheet">` (L536-562): heading "AP Chemistry practice worksheet" and, for each question in the session queue, `planWorksheet(activeQueue, stimulusDocument.stimuli, originalPagesFor)` segments drawn as live `<PdfQuestionPage>` canvases (crop when regions exist, "Shared stimulus" h3 for stimulus segments, "See the source page included earlier in this worksheet." for empty segments, an empty `.worksheet-answer` box). "Print or save PDF" calls `printWorksheet()` (L394-403): blocks with a notice if any `.pdf-error` or `.pdf-wait` is present, else `window.print()`. Print CSS: `app/globals.css:110-116` (`@media print` hides `.site-nav`, `.worksheet-actions`, `.pdf-crop-note`). It is entirely **separate** from Practice Builder: it uses `showWorksheet` state, browser print, no drafts, no `composeWorksheet`, no reviewed content, no answer key. `navigate()` resets `showWorksheet` to false (L219).

---

## D. Application infrastructure

### D1. Framework, build, routing

- Stack: vinext `1.0.0-beta.5` (Next.js-compatible runtime on Vite), Vite `8.0.13`, `@cloudflare/vite-plugin` `1.37.1`, wrangler `4.140.0`, `next` 16.3.4 (types/APIs), React 19.2.6 (`package.json:13-69`).
- `vite.config.ts:7-16`: `vinext({ appDir: "student" })` plus `cloudflare({ configPath: "./wrangler.student.jsonc", viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }, inspectorPort: false })`. So the student build uses `student/app/**` as its app directory; `app/**` is NOT the student appDir (it holds the review app: `app/admin`, `app/api`, `app/layout.tsx`, `app/page.tsx`, `app/chatgpt-auth.ts`), but `student/app/layout.tsx:2-3` imports `@/app/globals.css` and `@/app/student-workspace.css`, and components import `../app/navigation.mjs`.
- `student/app` contains `layout.tsx` (metadata title "AP Chemistry Question Catalog", favicon, `<html lang="en"><body className="antialiased">`), `page.tsx` (`<ChemAtlas />`), `practice-builder/page.tsx` (`<ChemAtlas worksheet />`, title "Practice Builder · ChemAtlas").
- `/practice-builder` is a separate route and a separate document: the nav item is a plain `<a href="/practice-builder">` (`student-app.tsx:425`, and the "View worksheet" link L478), a full page load. Both routes render the same `ChemAtlas` component; the `worksheet` boolean prop is the only difference (`student/app/practice-builder/page.tsx:6`). In `worksheet` mode the component renders `<PracticeBuilder>` instead of the view switch (L436), and its `navigate()` does `window.location.assign(buildChemAtlasUrl(new URL("/", locationHref).href, next, updates))` (L211), i.e. leaves for `/?view=…` with a full load. Every top nav button therefore does a full navigation from the builder. Each route reloads `student-questions.json` and re-reads localStorage.
- `app/navigation.mjs`: `parseChemAtlasLocation(search)` (L11-31) returns `{view, unit, topic, type, query, questionId, sessionIds, step}`. Params: `view` (default `"desk"`; allowed `desk, unit, library, builder, detail, practice, progress, review, banks, audit`), `unit` (`/^u[1-9]$/` else `"all"`), `topic` (`/^\d+\.\d+$/` else `"all"`), `type` (`MCQ|FRQ` else `"Mixed"`), `q` (query), `question` (id), `session` (comma ids, max 30), `step` (int 0-29). `buildChemAtlasUrl(currentUrl, view, updates)` (L39-78): returns `path+search+hash`; `desk` clears all filter params; filters `all`/`Mixed`/empty delete the param; `question` kept only for `detail` and `practice`; `session` and `step` only for `practice`. Location is read through `useSyncExternalStore` on `popstate` and a custom `chematlas:navigate` event (`student-app.tsx:23-34`, `:138`); SSR snapshot is `https://chematlas.invalid/`.
- `next.config.ts`: empty config object. `tsconfig.json`: `paths: {"@/*": ["./*"]}`, `strict`, `resolveJsonModule`, `moduleResolution: "bundler"`; excludes `examples`, `dist`, `.vinext`, `.wrangler`, `.sites-runtime`, `outputs`, `work`.
- `postcss.config.mjs`: only `@tailwindcss/postcss`.

### D2. Component organization, CSS, icons

- `components/`: `student-app.tsx` (578 lines), `practice-builder.tsx` (315), `worksheet-preview.tsx` (78), `connector-error.tsx` (36, imports `@/components/ui/button`, not used by the student app), and `components/ui/*` (62 files including `atlas-controls.tsx`).
- Student imports from `components/ui`: only `atlas-controls.tsx` (48 lines). `student-app.tsx:12` imports `DirectoryCard`, `UnitDirectoryCard`; `practice-builder.tsx:11` and `worksheet-preview.tsx:6` import `AtlasButton` (variants `primary|secondary|tertiary|ghost|destructive|icon`, `busy`, renders `atlas-action atlas-action--<variant>`). `FilterChip` is exported but unused. No other `components/ui/*` file is imported by student code.
- Icons: `lucide-react` (`student-app.tsx:5`: Activity, ArrowUpRight, Beaker, BookOpen, ChevronDown, FileText, FlaskConical, LayoutGrid, LibraryBig, ListChecks, Menu; `practice-builder.tsx:10`: ArrowDown, ArrowUp, Check, ChevronDown, GripVertical; `worksheet-preview.tsx:5`: Minus, Plus; `atlas-controls.tsx:2`). Brand mark is text `C✦` (L409).
- CSS loaded by the student layout: `app/globals.css` (173 lines) and `app/student-workspace.css` (563 lines). `globals.css` L1 `@import "tailwindcss"`, then dense legacy rules for shell, nav, unit cards, catalog rows, detail, practice, worksheet, review and `.qiv-*` review dashboard; print rules at L110-116 and L173. `student-workspace.css` is scoped under `.student-workspace` (the app shell root class, `student-app.tsx:405`) and defines the student palette tokens (`--ca-canvas`, `--ca-brand:#005C48`, `--ca-text`, `--ca-border`, `--ca-control-border`, `--color-primary`, `--color-background`, `--color-surface`, `--color-text-*`, `--color-border`, `--color-focus`, `--atlas-hover`, `--atlas-reveal`, `--atlas-ease`, etc., from L1-43 on) and the rules for Question Bank rows (`.bank-page`, `.atlas-result*`), directory cards, unit menu, and `.worksheet-page` form controls. Legacy `:root` tokens at `globals.css:2,13,64` (`--ink`, `--paper`, `--forest`, `--line`…).
- Tailwind/shadcn tokens: `globals.css` has no `@theme` block and no shadcn tokens (`--background`, `--primary`, `--card` count 0). Student components use custom class names (`.page`, `.panel`, `.outline`, `.primary`, `.atlas-*`), not Tailwind utility classes or shadcn components. `tw-animate-css` is a devDependency but is not imported by either CSS file.
- Fonts: no `@font-face`, no web-font links; `font-family: Arial,Helvetica,sans-serif` (`globals.css:3`), Georgia for the brandmark and serif tokens. No `@page` rule found.
- Motion: CSS transitions only (`--atlas-hover`/`--atlas-reveal`), with `prefers-reduced-motion` overrides (`student-workspace.css:497-500`).

### D3. Auth and delivery

Request flow, `worker/index.ts:6-47`:
1. `isRestrictedStudentPath(pathname)` true returns 404 "Not found" with `Cache-Control: private, no-store`. The regex (`lib/student-access.mjs:21-28`) is `^/(?:api/)?admin(?:/|$)` after URL-decoding, `\` to `/`, slash collapsing and lower-casing; a decode failure also returns true.
2. `authenticateStudentRequest(request, env)` (`lib/student-access.mjs:30-76`): requires env `CF_ACCESS_TEAM_DOMAIN` (must match `*.cloudflareaccess.com`) and `CHEMATLAS_STUDENT_ACCESS_AUD`, else 503 "Private student access is not configured."; requires header `cf-access-jwt-assertion` (else 403 "Cloudflare Access is required."); verifies three-part JWT, header `alg === "RS256"` with `kid`, claims `iss === https://<team>`, non-empty `sub`, `aud` includes the configured audience, `exp` in the future, `nbf` not more than 30 s ahead, a syntactically valid `email`, and the RS256 signature against the team's `/cdn-cgi/access/certs` JWKS (cached 5 min per team domain, L87). Any failure returns 403 "Cloudflare Access could not verify this session." It does not check an email allowlist (the file header says the allowlist is Zero Trust's job).
3. On failure responses carry `Cache-Control: private, no-store`, `Content-Type: text/plain; charset=utf-8`, `X-Robots-Tag: noindex, nofollow, noarchive` (L22-29).
4. On success: GET/HEAD for `/_next/static/*` are served by `env.ASSETS.fetch(request)`; everything else goes to `handler.fetch` (vinext fetch handler) (L34-37).
5. Headers set on every successful response (L38-40): `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow, noarchive`.

- **Content-Security-Policy: not set.** No CSP string in `worker/index.ts`, `student/app/layout.tsx`, wrangler config, `public/_headers` (absent), or anywhere in the repo outside `design-previews/` (grep for `content-security-policy` found none). No other security headers (HSTS, X-Frame-Options, Referrer-Policy, etc.) are set by the Worker.
- Caching: every response is `private, no-store`, including the multi-megabyte PDFs and JSON.
- `public/` assets: served by Workers Static Assets through the `ASSETS` binding with `run_worker_first: true`, so each asset request passes the JWT check first. The build output directory is `dist/client` (`scripts/assert-student-private-config.mjs:25`).
- `wrangler.student.jsonc`: `name: "chematlas-student-private"`, `main: "./worker/index.ts"`, `compatibility_date: "2026-11-12"`, `compatibility_flags: ["nodejs_compat"]`, `workers_dev: false`, `preview_urls: false`, `assets: {binding: "ASSETS", run_worker_first: true}`. No routes, no D1/R2/KV bindings, no `vars`.
- `wrangler.private-review.jsonc`: name `chematlas-private-question-review`, `main: dist/server/index.js`, compatibility date `2026-05-15`, `workers_dev: true`, D1 `DB` (`chematlas-private-review`), R2 `REVIEW_IMAGES`, assets directory `dist/client`, `keep_vars: true`.
- `scripts/assert-student-private-config.mjs` asserts (source config and built `dist/server/wrangler.json`): name equals `chematlas-student-private`; `workers_dev === false`; `preview_urls === false`; `assets.binding === "ASSETS"`; `assets.run_worker_first === true`; no `route`/`routes`; no `d1_databases`/`r2_buckets`. Built mode (`--built`, or if `dist/server/wrangler.json` exists): asset root equals `dist/client`; no file in the client output matching `admin|review-dashboard|question-review|question-images`; no `/admin/` in `.vite/manifest.json`; `student-questions.json` has 9 units and `questions.length === stats.questions`; client JS and CSS exist; and these files are non-empty: all manifest client files, `student-page-audit.json`, `curriculum-topics.json`, `pdf.worker.min.mjs`, `worksheet-sources.json`, `worksheet-content.json`, `worksheet-fragments.pdf`, and each `sourceFiles` URL.
- Local browser testing per `README.md:31-34`: needs a "local-only simulated Cloudflare Access JWT configured for development or signed test fixtures"; without Access settings the built Worker fails closed. Helpers that exist: `scripts/release/smoke.cjs` (Miniflare with env `CF_ACCESS_TEAM_DOMAIN=local-fixture.cloudflareaccess.com`, `CHEMATLAS_STUDENT_ACCESS_AUD=qa`, a mocked certs endpoint, an RS256 keypair generated per run, and Playwright routing that injects `cf-access-jwt-assertion` on every request, L15-31, L81-91; requires a built `dist/`) and `tests/student-access.test.mjs:9-27` (in-process RS256 fixture and fetch mock for unit tests, no browser). No dev-server fixture or `.dev.vars` in this repo (`ls -a` of the worktree shows none). `pnpm dev` is `vite dev --host 127.0.0.1` (the Worker runs under the Cloudflare Vite plugin and still enforces the check on this branch; see section E for the change in `b5ceab5`).

### D4. Tests and checks

`package.json` scripts: `dev` (`vite dev --host 127.0.0.1`), `build` (`vite build`), `start` (`wrangler dev --config dist/server/wrangler.json --local --ip 127.0.0.1 --inspector-port 0`), `lint` (`eslint . --ignore-pattern dist --ignore-pattern .next`), `check` (`tsc --noEmit`), `test` (`node --test tests/*.test.mjs`), `check:private` (`node scripts/assert-student-private-config.mjs`), `test:question-review`, `test:question-review-storage`, `db:generate`, `install:ci`.

| Test file | What it pins down | Breaks if student markup, class names or copy change? |
|---|---|---|
| `tests/navigation.test.mjs` | `parseChemAtlasLocation` and `buildChemAtlasUrl` (params, view default, caps of 30 session ids and step 29, clearing on `desk`) | No (pure functions in `app/navigation.mjs`); would break if the URL scheme changes |
| `tests/progress-transfer.test.mjs` | progress export/import round trip and rejection | No |
| `tests/public-catalog-integrity.test.mjs` | `public/questions.json` integrity (see A5) | No |
| `tests/stage3-catalog.test.mjs` | catalog versioning and the exact student-catalog delta | No (data) |
| `tests/stage3-worksheet.test.mjs` | bundles `lib/worksheet-pdf.ts` and `lib/worksheet.ts` with esbuild and calls `composeWorksheet`, `addEntries`, `backupSchema`, `newDraft`: duplicate suppression, schema validity, fallback renders the shared page once and keeps multi-page FRQ order (calls `render(region, q)` with `(sourceBank||"mega", page, rect)`), reviewed 2008 set does not call `render`, answers mode requires a verified answer (error `/no verified answers/`) | No (no DOM); would break if `composeWorksheet` signature `(draft, catalog, registry, mode, content, loadFragments, render)`, error text or the `Backup` schema change |
| `tests/worksheet.test.mjs` | `planWorksheet` segments for the 2008 Q1-3 group and full-page fallback | No (fixed to `lib/worksheet.mjs` behavior) |
| `tests/student-access.test.mjs` | JWT verification and `isRestrictedStudentPath` | No |
| `tests/question-image-review.integration.test.mjs`, `question-review-storage.test.mjs`, `question-review-backup.test.mjs` | private review API, adapters, backup | No (review boundary) |
| `tests/test_*.py` (7) | Python extraction and crop tests | No |

**No `tests/*.mjs` file reads `components/*.tsx` or CSS, or matches class names or visible copy** (grep for `.tsx`, `.css`, `student-app`, `className` found no hits). The only checks that pin student markup/copy are in the release smoke script `scripts/release/smoke.cjs:90-104` (run by `scripts/release/validate.sh:32` in CI):
- heading matching `/Browse by unit/i` on `/`;
- a button whose accessible name matches `/Unit 1.*Atomic Structure and Properties/i` (click) then a heading exactly "Atomic Structure and Properties";
- `/?view=library` must show a `.catalog-row` element;
- `/?view=detail&question=mcq-2008-1-29` must have a `canvas` with a set `style.width` and `width > 200`;
- `/practice-builder` must show a heading exactly "Practice Builder" and text exactly "0 selected";
- no `pageerror` events, at viewports 1440x900 and 390x844;
- HTTP checks: `/`, `/practice-builder`, `/questions.json`, `/student-questions.json`, `/student-version.json`, `/pdf.worker.min.mjs`, `/worksheet-content.json`, `/worksheet-sources.json`, `/worksheet-fragments.pdf`, every source PDF and the page's JS/CSS bundles return 200 with JWT, 403 without or with wrong audience, and `cache-control: private, no-store`; `/admin/question-review`, `/api/admin/question-review`, `…/backup`, `…/backup/import` return 404 (GET and POST). The same Cloudflare release script (`.github/scripts/cloudflare-student-release.mjs:55`) probes `/`, `/practice-builder`, `/student-version.json`, `/questions.json`, `/student-q…` (list truncated in the line I read).

CI workflows (`.github/workflows/`):
- `chematlas-pr-head-validation.yml`: on `pull_request` to `main`; runs `scripts/release/validate.sh` on the PR head SHA: install (frozen lockfile), `pnpm run check`, `pnpm test`, Python unittests, `check:private`, build, `check:private --built`, `wrangler deploy --dry-run`, `smoke.cjs`; no deploy, no secrets (installs tesseract, PyMuPDF 1.26.6, Playwright 1.62.1 chromium; Node 24.22.1, pnpm 11.25.0).
- `chematlas-release-validation.yml`: on push to `release/**`, pull_request to `main` and `release/**`, and `workflow_dispatch`; same validation pinned to a reviewed SHA (`3c78883006beb48c2dab68443e6e93b87bb9a769` default) plus `rehearse.py`; no deploy.
- `cloudflare-student-check.yml`: on push to `deployment/cloudflare-student` and `workflow_dispatch`; `pnpm install --frozen-lockfile`, `check`, `check:private`, `build`, `check:private`, `pnpm test`, Python unittests.
- `cloudflare-student-release.yml`: `workflow_dispatch` only, `main` ref only, requires typed confirmation `PROMOTE STUDENT <sha>`, environment `chematlas-student-production`; header says "Inactive proposal".
- ESLint (`pnpm run lint`) is not run by any workflow found.

### D5. Dependencies (`package.json`)

React 19.2.6, react-dom 19.2.6, next 16.3.4, vinext 1.0.0-beta.5, vite 8.0.13, `@cloudflare/vite-plugin` 1.37.1, wrangler 4.140.0, TypeScript 5.9.3, Tailwind 4.2.1 (`@tailwindcss/postcss`), `pdfjs-dist` ^6.4.299, `pdf-lib` 1.17.1, `lucide-react` ^1.31.0, `zod` ^3.25.76, `radix-ui` ^1.6.7, `@base-ui/react` ^1.7.0, `@shadcn/react` ^0.3.0, `class-variance-authority`, `clsx`, `tailwind-merge`, `cmdk`, `date-fns`, `react-day-picker`, `react-hook-form`, `@hookform/resolvers`, `embla-carousel-react`, `input-otp`, `next-themes`, `react-resizable-panels`, `recharts`, `sonner`, `vaul`, `drizzle-orm` 0.45.2 (review app), `tw-animate-css` ^1.4.0 (devDependency, CSS only, not imported).
- **Drag-and-drop library: none installed** (no dnd-kit, react-dnd, sortable, etc.). The builder uses native HTML5 drag events (`practice-builder.tsx:245-246`).
- **Animation library: none installed** (no framer-motion/motion, react-spring, etc.). Only CSS transitions and the unused `tw-animate-css` package.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (minutes, 7 days) and `strictDepBuilds: true`, so newly published versions are blocked by pnpm policy.

---

## E. Overlapping branch `fix/local-workers-runtime`

Both commits are local, 2 ahead of `4f965e3`; `eba3977`'s parent is `b5ceab5`, and `b5ceab5`'s parent is `4f965e3`. Author on both: `icebeluga` (email omitted here).

### E1. `b5ceab5` "Fix local Workers dev runtime for the student app"

- Date: Fri Nov 13 2026 21:07:04 -0500. Co-author line: Claude Opus 5.5.
- Intent (commit message): dev-only changes; production build and Cloudflare config unchanged (compat date `2026-11-12`, `run_worker_first: true`).
- Files: `package.json` 4 lines (2+/2-), `pnpm-lock.yaml` 650 lines (353 insertions combined across files; lock 650 changed lines), `vite.config.ts` 28 lines, `worker/index.ts` 12 lines. 4 files, 353 insertions, 341 deletions total.
- `package.json`: `@cloudflare/vite-plugin` `1.37.1` to `1.67.0`; `wrangler` `4.140.0` to `4.158.0`. Reason given: the workerd bundled with plugin 1.37.1 crashes in dev on Windows.
- `pnpm-lock.yaml`: those two specifiers; `@cloudflare/vite-plugin@1.67.0`; workerd platform packages `1.20260515.1`/`1.20260923.1` to `1.20261101.1`/`1.20261104.1`; `workerd@1.20261101.1`; miniflare `4.20260515.0` to `5.20261101.0-beta` and `5.20260923.0-alpha` to `5.20261104.0-beta`; `@cloudflare/unenv-preset` bumped; `esbuild` 0.28.1 to 0.28.2 appears in resolution strings; `workerd@1.20260923.1` removed.
- `vite.config.ts` (changed to `defineConfig(({ command }) => ({…}))`): adds `localWorkerdDate()` (reads the bundled workerd's `compatibilityDate` via the plugin's miniflare, same lookup as `scripts/release/smoke.cjs:7-9`), and `cloudflare({ config })` used only when `command === "serve"`: sets `assets: {...worker.assets, run_worker_first: false}` and clamps `compatibility_date` to the local workerd date if newer; builds use `config: undefined`. Adds `server.watch.ignored: ["**/.sites-runtime/**"]`.
- `worker/index.ts` diff hunks (verbatim):

```diff
+/// <reference types="vite/client" />
 import handler from "vinext/server/fetch-handler";
...
-    const access = await authenticateStudentRequest(
-      request,
-      env as unknown as Record<string, unknown>,
-    );
+    // `vite dev` only: Vite replaces import.meta.env.DEV with false in builds, so this bypass is stripped from deployments.
+    const access = import.meta.env.DEV
+      ? { ok: true as const }
+      : await authenticateStudentRequest(
+        request,
+        env as unknown as Record<string, unknown>,
+      );
```

- Security behavior: **this commit changes the Access check in source.** In `vite dev` (`import.meta.env.DEV` true) the signed-JWT check is skipped entirely; `isRestrictedStudentPath` (the 404 for `/admin/**`) still runs before it. In builds the comment says Vite folds `import.meta.env.DEV` to false so the JWT check remains; I could not build, so that folding in this vinext/Cloudflare RSC environment is **unverified by me**. `wrangler.student.jsonc` and `scripts/assert-student-private-config.mjs` are unchanged; the dev-only `run_worker_first: false` is not applied to builds (`command === "serve"` only). Also `smoke.cjs` against `dist/` would exercise the built worker (not run).
- Independent of UI: yes, no component, CSS, test or UI file touched. It conflicts with a redesign only through `package.json`, `pnpm-lock.yaml`, `vite.config.ts` and `worker/index.ts` if those are edited.

### E2. `eba3977` "Redesign the question-detail page around the source viewer"

- Date: Sat Nov 14 2026 00:03:41 -0500. Co-author line: Claude Opus 5.5. 2 files: `app/globals.css` +119 (pure insertions), `components/student-app.tsx` 341 lines changed (405 insertions and 55 deletions combined). `student-app.tsx` grows 578 to 809 lines. Intent: rebuild question detail as a two-column workspace (dominant source viewer plus compact classification sidebar), "Screenshot 4 layout".
- Line references below are in `eba3977:components/student-app.tsx`.

New imports: `ReactNode` type, lucide `ArrowLeft, ArrowRight, Maximize2, Minimize2, Minus, MoveHorizontal, Plus, RotateCcw, Scan`, and `research/crop-visual-review.json` (L1-10).

New module-level code (L78-120):
- `type ViewerZoom = "width" | "page" | number` (L78).
- `verifiedCropReviews`, `cropIsVerified(q)`, `stimulusIsVerified(id)` (L80-85): a crop is "verified" if it has regions and every region matches a `visually_verified` review of that question and page (rect within 0.6 pt, or the only region on that page when the review has no rect); a stimulus is verified if `verificationStatus === "visually_verified"`.
- `pdfDocs` map with `acquirePdf(key, open)` / `releasePdf(key)` (L86-107): PDFs shared across viewers by key, ref-counted, idle documents beyond the three most recent are destroyed.
- `inkBounds(context, x, y, w, h)` (L108-117): left/right extent of non-white pixels.
- `defaultZoom()` (L118): `0.9` if `window.innerWidth < 600`, else `"width"`. `normalizeText` (L119).

`PdfQuestionPage` changes (L121-~230): new optional props `zoom, onScale, fitBox, focusText, cropNote`. Documents come from the shared `acquirePdf` cache and are released on cleanup; stale renders are cancelled via `renderTask.cancel()`; canvas is hidden (`visibility:hidden`) until new content is drawn so the previous question never shows under a new label; render at device resolution (`ratio = min(devicePixelRatio, sqrt(16e6 / pixels))`, minimum 1) with a canvas transform; `ResizeObserver` on the nearest `[data-pdf-viewport]` refits when the viewport size changes (sidebar toggle, fullscreen, window resize); scale: `zoom === undefined` keeps the old fit-to-page-width scale (used by the worksheet/session paths), else `"width"` = `min(2, fitWidth)`, `"page"` = fit width and height of the viewport minus label chrome, number = that scale, clamped 0.25 to 4; below 600 px viewport width the fit basis is the text block width and blank horizontal margins are trimmed using `inkBounds`; highlight now picks the first text anchor starting with the label within the crop; `focusText` scrolls the viewport once per question/mode to the question's first line (first three words of `textPreview`, number prefix stripped, minimum 8 characters) leaving a quarter-viewport above, else resets to top; `cropNote` overrides the crop note; the busy flag is set false at the end.

New state (L309-330): `modeChoice {id, mode}` replaces `imageMode` state; `viewerResets`, `catalogReady`, `zoom`, `viewerScale`, `showClassification` (default true), `viewerRef`, `fullscreen`; `stepZoom(delta)` snaps the current scale to a quarter then steps, clamped 0.25-4; `toggleFullscreen()` calls `viewerRef.current.requestFullscreen()` (catch sets notice "Fullscreen is not available in this browser.") or `document.exitFullscreen()`; a `fullscreenchange` listener syncs `fullscreen` (L318-322). `catalogReady` is set in `.finally` of the catalog fetch (L362).
- `imageMode` is now derived (L423-425): user choice for this question id, else `approved` if `approvedImages` has entries (never), else `crop` if `hasCompleteCrop(q)` (crop verified and all linked stimuli verified), else `full`. `setImageMode` stores `{id, mode}`. `openQuestion` resets zoom to `defaultZoom()` and `modeChoice` (L519-521).
- New helpers `addToWorksheet(q)` (L516-518; the list's Add button now calls it too, L630 area) and `segmentSource(page, bankId)` (L526; also used by the session worksheet, which is otherwise unchanged in behavior, L768-790).

Question-detail view (`view === "detail" && current`, L652-758), replacing the old single-column detail (old L520-527):
- Header `.detail-header` with "Back to list" button, title, badges (type; "Classified" / "Outside current framework" / "Needs topic review"); `<nav aria-label="Question navigation">` Previous/Next with `aria-live` "Question N of M".
- `.detail-workspace` grid (class `classification-hidden` when sidebar hidden): left `<section class="detail-viewer" aria-labelledby="detail-viewer-title">` and right `<aside class="detail-classification" id="detail-classification" hidden={!showClassification}>`.
- Viewer head actions: "Add to worksheet" / "Added to worksheet" (disabled when no backup/draft, already added, or 500 entries), "Hide/Show classification" (`aria-pressed`, `aria-controls`), image-mode group (`role="group" aria-label="Image mode"`) with Approved image (never), "Question crop" (disabled with title "No question region is recorded for this source page" when `sourceRegions` is empty) and "Full page", each `aria-pressed`. Order of crop/full buttons swapped versus old.
- Toolbar (`role="toolbar" aria-label="Image zoom"`): Zoom out/in icon buttons (disabled at 25%/400%), `<output aria-label="Zoom level">` percent, Fit width, Fit page, Actual size (1:1) (each `aria-pressed`), Reset (zoom default, page 0, clears mode choice, bumps `key` to remount the scroll area), Full screen / Exit full screen (`aria-pressed`, targets the `.detail-viewer` element). Label text hidden on small screens (`.vt-label`), icons stay.
- Source area: `.pdf-tabs` page buttons (only in Full-page mode and when more than one page) now carry `aria-pressed`. `.detail-scroll[data-pdf-viewport]` shows in Crop mode the segments from `planWorksheet([current], stimulusDocument.stimuli, originalPagesFor)[0].segments` stacked (shared stimulus segments first, labelled "Shared stimulus", with fit box when more than one segment), each as a `PdfQuestionPage` with a `cropNote` ("Visually verified shared stimulus." / "Visually verified question region · Full page shows surrounding context." / "Automatic crop, not yet visually verified · check Full page to confirm nothing is missing."); in Full-page mode one `PdfQuestionPage` for the current page.
- Sidebar: Primary topic, Also filed under (badges `UNIT · id · name` with unit name as title; empty state text), Topic mapping (heading includes the topic filter; parts list with label, rationale/preview and topic names; empty-state "Indexed as a whole-question match. Inspect the source image before changing its topic assignment."), collapsible "Classification evidence" `<details>`, `<dl>` metadata (Type, Year, Question, PDF page(s), Source, Crop status: "No question crop recorded" / "Crop visually verified" / "Crop not yet visually verified"). The old "WHY THIS QUESTION APPEARS HERE" panel and `.detail-meta-grid` are no longer rendered (their CSS classes remain).
- Loading and not-found: new "Loading question…" empty state (`role="status"`) while `!catalogReady`; the "Question not found" state only after `catalogReady` (L759-760). This fixes the old flash of "not found" on direct links.
- No new keyboard handlers were added (no `onKeyDown`/`keydown` in the diff; fullscreen exit relies on the browser's Esc). Buttons are native elements.

New CSS in `app/globals.css` (+119 lines, pure additions): `.app-shell:has(.detail-page)`, `.detail-page`, `.detail-header`, `.detail-back`, `.detail-title`, `.detail-badges`, `.detail-badge(.is-review)`, `.detail-page .detail-navigation`, `.detail-step(.is-next)`, `.detail-position`, `.detail-workspace(.classification-hidden)`, `.detail-viewer`, `.detail-viewer-head`, `.detail-viewer-actions`, `.viewer-modes`, `.viewer-action(.is-added)`, `.viewer-shell`, `.viewer-toolbar`, `.viewer-group`, `.viewer-fit`, `.viewer-zoom`, `.viewer-end`, `.viewer-fullscreen`, `.vt-icon`, `.detail-scroll` and its `.pdf-frame`/`.pdf-label`/`.pdf-crop-note`/`canvas`/`.pdf-wait` overrides, `.detail-segment-label`, `.detail-segment + .detail-segment`, `.detail-viewer:fullscreen` (+ `.viewer-shell`, `.detail-scroll`), `.detail-classification(.[hidden])`, `.detail-side-block`, `.detail-primary-topic`, `.detail-topic-badges`, `.detail-topic-badge`, `.detail-side-empty`, `.detail-part-list`, `.detail-part-label`, `.detail-evidence*`, `.detail-meta` (`dt`, `dd`, `.is-wide`), `.detail-page :is(button,summary):focus-visible`, plus media blocks: `prefers-reduced-motion: reduce`, `max-width:1280px`, `1100px`, `760px`. The commit message cites phone behavior: 90 percent open zoom, icon-only toolbar with 40 px+ touch targets (I did not measure the CSS).

Behavior and fixes a redesign must not lose (from the commit message and diff): (1) open on the question itself, with Question crop only when the crop and its shared stimuli are visually verified, else Full page scrolled to the question's first line; (2) shared stimuli shown above MCQ crops and labelled; unverified crops labelled; (3) refit on resize and sidebar toggle; (4) stale-render cancellation and the hidden-canvas-until-drawn rule so a previous question never appears under a new label; (5) shared/ref-counted PDF cache; (6) device-resolution rendering within a 16 MP cap; (7) loading state instead of a "not found" flash; (8) `aria-pressed` states, toolbar/group roles, `aria-live` position, `hidden` sidebar, focus-visible styles and reduced-motion rule; (9) the unchanged worksheet/session path continues to use `zoom === undefined` (old fit-to-width behavior).

Line ranges (in `eba3977`) overlapping list/detail/worksheet rendering: library list `L602-650` (only the Add-to-worksheet handler changed), detail `L652-758`, detail loading/not-found `L759-760`, session worksheet `L768-790` (`segmentSource` use only), shared state/handlers `L309-330`, `L423-425`, `L516-526`, and `PdfQuestionPage` `L121-~230`. On the base (`4f965e3`/worktree) the corresponding ranges are library L468-516, detail L520-528, session worksheet L536-562, `PdfQuestionPage` L77-134.

---

## Could not determine

- How `public/worksheet-content.json`, `public/worksheet-fragments.pdf`, `public/worksheet-sources.json` and `research/stimuli.json` are generated or who approves their contents; no generating script was identified (scripts in `scripts/` were listed, not read). Likewise the pipeline from private-review approvals to any of these files (no code path found).
- Whether `import.meta.env.DEV` folds to `false` in the vinext/Cloudflare RSC production build for `worker/index.ts` on `b5ceab5` (no build was run).
- Which Vite config builds `wrangler.private-review.jsonc` (`main: dist/server/index.js`); the only `vite.config.ts` uses `appDir: "student"` and the student wrangler config. `docs/private-review-deployment-phase-1.md:76-80` says `pnpm build` then `wrangler … --config wrangler.private-review.jsonc`; that cannot be reconciled with this config from code alone.
- The full list of paths probed by `.github/scripts/cloudflare-student-release.mjs:55` (line truncated in my read).
- Whether `public/page-audit.json` and `public/curriculum-topics.json` are used by anything outside this repo's tracked app code (not referenced by app, tests or build scripts found).
- Runtime behavior (rendering, PDF output, filter results in a browser): nothing was executed; all statements come from reading source. Counts come from reading `public/*.json`.
- Python test files and `scripts/*.py` contents were not read.
- `fix/local-workers-runtime` UI behavior (zoom, fullscreen, touch target sizes, phone legibility) was read from the diff only and not run or measured.
- `lucide-react` `^1.31.0`, `pdfjs-dist` `^6.4.299` are caret ranges; the resolved versions are in `pnpm-lock.yaml` (not read for these).
