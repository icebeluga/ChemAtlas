# Test and acceptance plan

Companion to `02-architecture.md` (sections 3, 5, 6), `03-risks-and-roadmap.md` (per-phase acceptance) and `SESSION-3-HANDOFF.md` (Phase A tasks and proposed test file names). It adds no acceptance criteria. Every test file named as "proposed" does not exist yet. Facts about today's tests come from `01-existing-system.md` section D4 and from reading `package.json`, `scripts/release/smoke.cjs` and `app/navigation.mjs` in this worktree.

## 1. Principles

1. A feature is not verified by a passing build or type check. `pnpm run check`, `pnpm run build` and `pnpm run check:private` show that code compiles and that private paths are absent; they say nothing about behaviour.
2. Each acceptance item below names its evidence: a test ID (UT, IT, HB, PDF, MN, RG, PF) or the words "evidence gap".
3. A claim about a PDF is verified against the generated PDF (page count, extracted text per page, and visual inspection), never against the on-screen outline or an HTML view.
4. A claim about what a student sees is verified in a real browser at 1440, 768 and 390 px, with the console checked for errors.
5. Evidence for a phase is recorded before the phase is called done: command output for automated items, a dated note and screenshots for manual items.
6. No new dependencies are planned (`SESSION-3-HANDOFF.md` section 1). Where a test would need one, the item is listed as an evidence gap in section 8, not silently dropped.

## 2. Existing automated checks and what they prove

### 2.1 `package.json` scripts

| Script | Command | Proves | Does not prove |
|---|---|---|---|
| `check` | `tsc --noEmit` | Types compile | Behaviour, rendering, CSS |
| `test` | `node --test tests/*.test.mjs` | The `.mjs` tests below pass | Any component, hook, CSS or browser behaviour; Python tests; files in subfolders of `tests/` |
| `build` | `vite build` | The student app builds with `appDir: "student"` | That the built app works |
| `check:private` | `node scripts/assert-student-private-config.mjs` | Source and (with `--built`) built config: worker name, `workers_dev` false, `preview_urls` false, assets binding and `run_worker_first`, no routes, no D1/R2; built output has no `admin`, `review-dashboard`, `question-review` or `question-images` paths; catalog has 9 units and `questions.length === stats.questions`; required assets are non-empty | UI behaviour; that the Access check works (that is `student-access.test.mjs` and the smoke script) |
| `lint` | `eslint . --ignore-pattern dist --ignore-pattern .next` | Style rules | Not run by any workflow found (01 D4) |
| `dev`, `start` | `vite dev`, `wrangler dev` | Not tests | `dev` runs the Worker, which refuses requests without Access settings |

### 2.2 `tests/*.mjs` by file

| File | Proves | Does not cover |
|---|---|---|
| `tests/navigation.test.mjs` | `parseChemAtlasLocation` and `buildChemAtlasUrl` params, view default, caps (30 session ids, step 29), clearing on `desk` | Any new param or old-URL mapping; browser history behaviour |
| `tests/progress-transfer.test.mjs` | Progress export/import round trip and rejection | The UI buttons that call it |
| `tests/public-catalog-integrity.test.mjs` | `public/questions.json`: unique ids, types match `stats`, units and related topics exist, pages map into `sourceFiles` | `public/student-questions.json` counts (735, 366, 210); unit derivation |
| `tests/stage3-catalog.test.mjs` | Baseline vs staged catalog delta; `student-page-audit.json` equals `catalog.audit` | Filtering, counts per unit |
| `tests/stage3-worksheet.test.mjs` | Bundles `lib/worksheet-pdf.ts` and `lib/worksheet.ts` with esbuild; `composeWorksheet` duplicate suppression, schema validity, fallback shared-page rule, multi-page FRQ order, reviewed 2008 set does not call `render`, answers mode needs a verified answer | Anything about `planExport` (does not exist), pdf byte equality, on-screen preview |
| `tests/worksheet.test.mjs` | `planWorksheet` segments for 2008 Q1-3 and full-page fallback | `composeWorksheet` |
| `tests/student-access.test.mjs` | JWT verification, `isRestrictedStudentPath` | The built Worker |
| `tests/question-image-review.integration.test.mjs`, `question-review-storage.test.mjs`, `question-review-backup.test.mjs` | Private review API and adapters | Student code (boundary) |
| `tests/test_*.py` (7) | Python extraction and crop tests | The UI |

No `tests/*.mjs` file reads `components/*.tsx` or CSS or matches visible copy (01 D4).

### 2.3 `scripts/release/smoke.cjs`

Requires a built `dist/` and Playwright (`CHEMATLAS_PLAYWRIGHT`, `CHEMATLAS_CHROMIUM` environment variables, `scripts/release/smoke.cjs:12, 81`). It runs Miniflare with a signed local Access fixture.

| Part | Lines | Proves |
|---|---|---|
| Bundles present | 52 to 54 | `/` references a JS and a CSS bundle |
| Status matrix | 55 to 66 | 200 with JWT, 403 without or with wrong audience, `cache-control: private, no-store` for pages, JSON, PDFs and bundles |
| Version | 67 | `/student-version.json` equals the release version |
| Admin denial | 68 to 78 | 404 for four admin paths, GET with and without JWT, and POST |
| Browser, 1440x900 and 390x844 | 81 to 105 | `Browse by unit` heading; Unit 1 button then its heading; `.catalog-row` on `?view=library`; a sized `canvas` on `?view=detail&question=mcq-2008-1-29`; `Practice Builder` heading and `0 selected`; no `pageerror` |

It does not cover: 768 px; any control interaction beyond one click; draft storage; PDF generation; console errors other than uncaught `pageerror`; accessibility; keyboard use.

### 2.4 CI workflows (`.github/workflows/`)

| Workflow | Trigger | Runs |
|---|---|---|
| `chematlas-pr-head-validation.yml` | `pull_request` to `main` | `scripts/release/validate.sh` on the PR head: frozen install, `check`, `test`, Python unittests, `check:private`, build, `check:private --built`, `wrangler deploy --dry-run`, `smoke.cjs`. No deploy |
| `chematlas-release-validation.yml` | push to `release/**`, `pull_request` to `main` and `release/**`, `workflow_dispatch` | Same validation pinned to a reviewed SHA, plus `rehearse.py`. No deploy |
| `cloudflare-student-check.yml` | push to `deployment/cloudflare-student`, `workflow_dispatch` | install, `check`, `check:private`, build, `check:private`, `test`, Python unittests |
| `cloudflare-student-release.yml` | `workflow_dispatch`, `main` only, typed confirmation | Release proposal, inactive. Not a test |

`pnpm run lint` runs in none of them. The redesign branch is not pushed, so none of these runs until the owner opens a PR. Local equivalents must be run and recorded.

## 3. New automated tests to add

Runner: `node --test tests/*.test.mjs`. There is no DOM test environment in the repo (no `jsdom` or Testing Library in `package.json`; not verified in `pnpm-lock.yaml`), and no new dependencies are planned. So "component" cases are written as tests of pure functions extracted for the purpose (reducers, selectors, state-machine functions), following how `tests/stage3-worksheet.test.mjs` bundles TypeScript with esbuild; whether `esbuild` resolves as a direct dependency is not verified. Behaviour that needs a DOM is covered in section 4. All paths are proposed.

Fixture ids are not guessed here. Where a case needs "a reviewed question", "a stimulus-linked question" and so on, the test selects ids from `public/student-questions.json`, `public/worksheet-content.json` and `research/stimuli.json` by rule and fails if none is found (01 A3 gives counts: 201 content entries, 83 classified, 17 with a context, 15 classified with `stimulusIds`).

| ID | Phase | Level | What it asserts | Fixture or data needed | File to create (proposed) |
|---|---|---|---|---|---|
| UT-01 | A | unit | `public/student-questions.json` has 735 classified (all with a `primaryTopic`), 366 classified with more than one `relatedTopics`, 210 classified whose `relatedTopics` span more than one unit | the real catalog | `tests/use-catalog.test.mjs` |
| UT-02 | A | unit | Per-unit and per-topic counts follow the any-related rule: per-unit sums 96, 95, 219, 187, 88, 80, 97, 106, 83 (1051); primary-only sums 78, 59, 150, 116, 69, 48, 73, 84, 58 (735) are not used for counts; "All" is 735 | real catalog | `tests/use-catalog.test.mjs` |
| UT-03 | A | unit | Unit of a topic is derived from the topic id (`N.M` belongs to `uN`), not `primaryUnit`: a record with stale `primaryUnit` (for example `frq-2005-1-6`, `primaryUnit` u3, `primaryTopic` 8.3, per 01 A2) is counted under u8; a test fails if filtering or colour reads `primaryUnit` (R13) | real catalog; small synthetic record | `tests/use-catalog.test.mjs` |
| UT-04 | A | unit | A user topic override sets `status` to classified, `displayTopic` to the override, and `relatedTopics = [override, ...old related minus primary and override]`; a user-bank question (`sourceBank`) is merged and survives a reload of `apchem-studio-v2` (R18) | synthetic saved state | `tests/use-catalog.test.mjs` |
| UT-05 | A | unit | The legacy `apchem-studio-v1` progress shape migrates to `result: "correct" or "missed"` and `apchem-studio-v2` wins on conflict | synthetic saved state | `tests/use-catalog.test.mjs` |
| UT-06 | A | unit | `filterQuestions` returns the same ids as the old inline `filteredQuestions` predicate for a table of combinations (unit x topic x type x query), expected ids captured from the current code before it is replaced | ids captured from `SA:320-326` before the change | `tests/question-filter.test.mjs` |
| UT-07 | A | unit | Same for the builder's old `candidates` predicate including year (registry exam year first, else `q.year`) and print status `ready` (`PB:96-108`), with the builder's extra filters composed on top | ids captured from `PB:96-108` before the change; real registry | `tests/question-filter.test.mjs` |
| UT-08 | A | unit | Any-related rule: a question with `relatedTopics` `["3.4","8.3"]` is returned for unit 3, unit 8, topic 3.4 and topic 8.3; not for unit 4 | synthetic records | `tests/question-filter.test.mjs` |
| UT-09 | A | unit | Year filter, reviewed-layout filter (uses `hasReviewedLayout`), type filter, status gate (`statuses`), and each screen's search field list (case-insensitive substring) | synthetic records | `tests/question-filter.test.mjs` |
| UT-10 | A | unit | Records with no `relatedTopics` fall back to `[displayTopic]` as the builder does today; records with neither are excluded from unit/topic filters | synthetic records | `tests/question-filter.test.mjs` |
| UT-11 | B | unit | For every unit and every topic, the chip count equals `filterQuestions(...).length` (91 topics, 9 units) | real catalog | `tests/question-filter.test.mjs` |
| UT-12 | A | unit | `useWorksheets` pure functions: each mutation (`add`, `remove`, `move`, `replace`, `setEntry`, `setFormat`, `rename`, `applyPreset`, `newDraft`, `duplicate`, `setActive`, `importDrafts`, `exportDrafts`, `undo`) returns the expected `Backup` and calls the existing `lib/worksheet.ts` helpers only | synthetic `Backup` | `tests/use-worksheets.test.mjs` |
| UT-13 | A | unit | Limits: add stops at 500 entries; 100-draft limit blocks `newDraft`, `duplicate` and `importDrafts` with the existing messages (`PB:115`, `PB:174`) | synthetic `Backup` | `tests/use-worksheets.test.mjs` |
| UT-14 | A | unit | Duplicate prevention: adding an id already in the draft is a no-op and returns the same draft object (`WS:69-78`) | synthetic `Backup` | `tests/use-worksheets.test.mjs` |
| UT-15 | A | unit | Legacy id-array key `chematlas-student-worksheet-v1`: ids migrate into the active draft, or into a new draft "Imported Question Bank selection" when fewer than 100 drafts exist and a saved Backup parsed; the legacy key is removed only if every id was added; ids over 200 chars or non-strings are dropped (`SA:157-173`) | storage stub | `tests/use-worksheets.test.mjs` |
| UT-16 | A | unit | Invalid stored data (bad JSON, wrong shape, duplicate draft ids, `active` not in drafts) is copied unchanged to `chematlas-worksheets-v1.recovery` before a fresh Backup starts; `status` is `"recovered"`; the original string is never overwritten (R3) | storage stub | `tests/use-worksheets.test.mjs` |
| UT-17 | A | unit | A `storage` event for the key re-reads and validates; an invalid value from another tab follows UT-16 | storage stub, event stub | `tests/use-worksheets.test.mjs` |
| UT-18 | A | unit | Storage that throws on read or write: work continues in memory, `status` is `"memory-only"`, no exception escapes | throwing storage stub | `tests/use-worksheets.test.mjs` |
| UT-19 | A | unit | Round trip: a realistic multi-draft Backup (several drafts, per-entry `breakBefore` and `lines`, all formats, entries for review, legacy and user-bank ids) loads and saves to a byte-identical string; no field added, renamed or removed (R3) | fixture built from the `Backup` schema, covering every `Format` field | `tests/use-worksheets.test.mjs` |
| UT-20 | A | unit | Undo: single level; restores add, move, replace, remove, page break, response lines, preset; does not restore format field edits, rename, new, duplicate, import; applies only when `undo.id` equals the active draft id | synthetic `Backup` | `tests/use-worksheets.test.mjs` |
| UT-21 | C | unit | Grouped reorder: with `grouping` "type" or "topic", a row moves only within its section by swapping positions in the saved order; section order follows `orderedEntries` | synthetic draft and catalog | `tests/use-worksheets.test.mjs` |
| UT-22 | A | unit | A draft entry whose id is not in the catalog stays in the draft and is reported as missing, not removed | synthetic | `tests/use-worksheets.test.mjs` |
| UT-23 | A | unit | `useExportData`: a failed fetch of `worksheet-content.json` surfaces an error state, not empty data; same for `worksheet-sources.json` (handoff A5); `hasReviewedLayout(id)` is true exactly for ids in `content.questions` | fetch stub; real content file | `tests/use-export-data.test.mjs` |
| UT-24 | B | unit | `parseChemAtlasLocation` and `buildChemAtlasUrl` handle the new params (`year`, `ready`) and keep all existing behaviour (existing assertions unchanged) | none | `tests/navigation.test.mjs` (extend) |
| UT-25 | B | unit | Old-URL mapping: `?view=desk`, `?view=unit&unit=u3`, `?view=library&unit=u3&topic=3.4`, `?view=detail&question=mcq-2008-1-29` resolve to the bank with the same unit, topic and question; other views (`builder`, `practice`, `progress`, `review`, `banks`, `audit`) are unchanged | none | `tests/navigation.test.mjs` (extend) |
| UT-26 | A | unit | Token contrast: for each of the nine unit colour pairs (deep on tint, white on deep, deep on white), text pairs are at least 4.5:1 and control-boundary or large-text pairs at least 3:1; the script exits non-zero and lists failing pairs | `app/student-tokens.css` | `scripts/check-token-contrast.mjs` (handoff A6) plus wrapper `tests/token-contrast.test.mjs` so `pnpm test` runs it |
| UT-27 | D | unit | `planExport`, case "reviewed only": every entry has mode `typeset` | selected from `content.questions` (classified) | `tests/stage3-worksheet.test.mjs` (extend) |
| UT-28 | D | unit | `planExport`, case "unreviewed only": every entry has mode `source-page` | ids not in `content.questions` | `tests/stage3-worksheet.test.mjs` (extend) |
| UT-29 | D | unit | `planExport`, case "reviewed sharing a page with unreviewed": both are `source-page` (fallback spreads to every question sharing a fallback page; WPDF:39-53) | pair chosen by script from pages shared across reviewed and unreviewed ids; not verified that such a pair exists | `tests/stage3-worksheet.test.mjs` (extend) |
| UT-30 | D | unit | `planExport`, case "stimulus-linked without a context": `source-page` (WPDF:37) | an id with `stimulusIds` and no `context` in content | `tests/stage3-worksheet.test.mjs` (extend) |
| UT-31 | D | unit | `planExport`, case "two questions sharing a context": the first is `typeset`, the second reports `sharedWith` the first (outline text "with question N") | two ids with the same `context` (contexts such as `2008-a-reactions-15-17`, 01 A3) | `tests/stage3-worksheet.test.mjs` (extend) |
| UT-32 | D | unit | `planExport`, case "two questions on the same fallback page": the second is `see-earlier` | two unreviewed ids whose pages overlap | `tests/stage3-worksheet.test.mjs` (extend) |
| UT-33 | D | unit | `planExport` for an id missing from the catalog returns mode `missing` (the `EntryOutcome` type in `02` 3.4 has this mode) and `composeWorksheet` still throws as today (WPDF:27); user-bank question is `source-page` (WPDF:28) | synthetic | `tests/stage3-worksheet.test.mjs` (extend) |
| PDF-01 | D | PDF | `composeWorksheet` output is unchanged by the extraction: for a set of fixed drafts, bytes before and after are identical, or (if timestamps make bytes differ) page count and extracted text per page are identical (R4) | golden outputs generated from the pre-extraction code and stored under `tests/fixtures/` | `tests/stage3-worksheet.test.mjs` (extend) |
| PDF-02 to PDF-07 | D | PDF | For each of the six `planExport` cases (UT-27 to UT-32), the generated PDF agrees with the plan: page text contains the typeset question, or the caption "Full source page. May contain adjacent questions or printed answers.", or "See source page included earlier." as the plan says (WPDF:250-258) | same drafts as UT-27 to UT-32; text extraction with the installed `pdfjs-dist` (running it under `node --test` is not verified) | `tests/stage3-worksheet.test.mjs` (extend) |
| IT-01 | C | integration | Preview freshness state machine (pure function plus stubbed renderer): any draft or mode change moves state to `out-of-date` synchronously; pages from the last good run stay | stubbed `renderWorksheet` | `tests/preview-state.test.mjs` |
| IT-02 | C | integration | Auto-regeneration after about 600 ms of quiet on desktop; on phones only when the Preview tab opens or the button is pressed; a new edit aborts the run in flight through the `AbortSignal`; an aborted run never sets bytes | stubbed renderer, fake timers | `tests/preview-state.test.mjs` |
| IT-03 | C | integration | A forced generation error keeps the last good pages (dimmed), exposes the composer's message and Retry, and disables download | stubbed renderer that throws | `tests/preview-state.test.mjs` |
| IT-04 | C | integration | Download and open are disabled while `out-of-date` or `generating`, enabled only when the bytes on screen are current | stubbed renderer | `tests/preview-state.test.mjs` |
| IT-05 | C | integration | A source PDF that fails to load produces an error that names the file; catalog or content JSON failure blocks the builder with a retry rather than an empty worksheet | stubbed `openPdf`, fetch stub | `tests/preview-state.test.mjs` |
| IT-06 | C | integration | A draft containing review, legacy and user-bank ids composes without throwing and produces `source-page` pages for them (R11) | synthetic catalog; stubbed `render` | `tests/stage3-worksheet.test.mjs` (extend) |

Level "component" from `02` section 7 (band, list, pane, outline, layout panel, strip): see section 8; covered by HB checks, not by `node --test`.

## 4. Headless browser checks

`design-previews/v2/check.mjs` is a prototype that drives headless Chrome over the DevTools protocol, runs interaction checks against the prototype, saves screenshots and prints console errors. It is not a production test. It is to be adapted, not reused as is: new scripts (proposed under `tests/browser/`, which `node --test tests/*.test.mjs` does not pick up) drive the real app served by the UI-only dev config (handoff A7) or by the built Worker with the smoke fixture. Every scenario runs at 1440, 768 and 390 px unless stated, with the console captured; any `error` entry or `pageerror` fails the scenario. The headless runs belong to the `verification-assistant` role in `03`.

### 4.1 Question Bank (proposed `tests/browser/bank-check.mjs`)

| ID | Scenario | Steps | Pass condition |
|---|---|---|---|
| HB-Q01 | Load | Open `/` | Bank renders at all three widths; nine unit toggles visible; at 390 px all nine visible without sideways scroll; no console errors |
| HB-Q02 | Old URLs | Open `/?view=library&unit=u3&topic=3.4`, `/?view=detail&question=mcq-2008-1-29`, `/?view=unit&unit=u3`, `/?view=desk` | Each opens the bank with the matching unit, topic and question selected |
| HB-Q03 | Unit and topic selection and counts | For each of the 9 units, then each topic of the unit: select, read the count shown, count list rows across all pages | Count equals the list length for every unit and topic; unit counts sum to more than 735; "All" shows 735 |
| HB-Q04 | Type filter | Select MCQ, FRQ, then both off | Every row's type tag matches; count updates in the status region |
| HB-Q05 | Search | Type a year, a question number, a topic code and a keyword; clear | Results match; clearing restores the previous list; URL carries `q` |
| HB-Q06 | Empty state | Search a string that matches nothing | Empty message and a way to clear filters; focus stays in the search field |
| HB-Q07 | Cross-topic question | Pick a topic that is not the primary topic of a multi-topic question (366 such exist; select by script) | Row shows "Primary: N.M"; pane shows "Primary topic" and "Also filed under" with the selected topic emphasised; for an FRQ with parts, the parts table lists the parts for that topic and highlights appear on the page |
| HB-Q08 | Keyboard shortcuts | With no field focused: ArrowUp/ArrowDown and J/K, A, F, `/`, Esc. Then with a field focused, and with Ctrl held | Selection moves; A toggles the question on the active draft; F toggles Full page; `/` focuses search; Esc leaves the field or the phone question view; no shortcut fires inside a field or with a modifier |
| HB-Q09 | Question image, reviewed layout | Open a question that has an entry in `content.questions` | A canvas is drawn with width above 200 and `style.width` set; status text matches the data |
| HB-Q10 | Question image, unreviewed | Open a classified question without an entry | Canvas drawn; no text anywhere calls it "approved" or "verified" |
| HB-Q11 | Question image, no crop | Open a question with empty `sourceRegions` | Full page shown with its note; Question view not offered as a crop, or shows the same page with the note |
| HB-Q12 | Full page | Toggle Full page on each of the three above | Whole page drawn; page tabs appear for multi-page questions and switch pages; toggling back restores the crop |
| HB-Q13 | Shared stimulus | Open a question with `stimulusIds` (15 classified have them) | Shared block shown above the question and labelled as shared |
| HB-Q14 | Add and remove | Add from the row, from the pane and with A; remove each; add until the strip has several tiles | Active draft in `localStorage["chematlas-worksheets-v1"]` changes after each action; row toggle `aria-pressed` and count status update; a duplicate add does nothing |
| HB-Q15 | Strip | Add three questions | Strip shows numbered tiles in draft order; link goes to the builder |
| HB-Q16 | Persistence | Add a question, reload, then open `/practice-builder` | The question is still in the active draft in both places |
| HB-Q17 | Navigation to builder | Use the top-bar item and the strip link | `/practice-builder` opens with the count equal to the draft's entries |
| HB-Q18 | More menu | Open More; open Practice sessions, Progress, Review queue, Source page audit, Legacy content, Manage test banks | Each legacy view opens in the new shell and its main control works (O4 placement: not verified until decided) |
| HB-Q19 | Phone only: topic sheet | At 390 px open the topic sheet | `<dialog>` lists every topic of the unit with name and count plus "All topics"; Esc closes it; focus returns to the opener |
| HB-Q20 | Phone only: question view | At 390 px open a question, press the system Back | Back returns to the list at the same scroll position with focus on the originating row; "Back to results" button does the same; "n of m" and previous/next work; the selection bar stays visible |
| HB-Q21 | Layout | At each width, read `document.documentElement.scrollWidth` against `innerWidth` | No horizontal overflow at 390, 768, 1440 |

### 4.2 Practice Builder (proposed `tests/browser/builder-check.mjs`)

| ID | Scenario | Steps | Pass condition |
|---|---|---|---|
| HB-B01 | Receive selection | Add 3 questions in the bank, open the builder | Outline lists 3 rows in the bank's order; heading "Practice Builder" and count text as the smoke script expects |
| HB-B02 | Empty draft | Open the builder with no entries | "0 selected" shown; export disabled; message points to the bank |
| HB-B03 | Reorder by button | Press Move up and Move down on rows, including first and last | Order in the outline and in `localStorage` changes; first row's Up and last row's Down are disabled; a polite status announces "Question 4 moved to position 3 of 8" |
| HB-B04 | Reorder by keyboard | Focus a row, press Alt+ArrowUp and Alt+ArrowDown | Same result as buttons; focus stays on the moved row |
| HB-B05 | Reorder by drag | At 1440 px, drag a handle onto another row | Order changes and persists; at 390 px drag is not required and buttons still work |
| HB-B06 | Grouped reorder | Set grouping to "MCQ and FRQ" and to "Topic", move a row | Row moves only within its section; section order unchanged |
| HB-B07 | Remove and undo | Remove a row, press Undo; repeat for add, move, page break, response lines, preset | Each is restored; Undo is disabled when nothing to undo; format field edits are not undone |
| HB-B08 | Drafts | Switch draft, New, Duplicate, Download drafts, Import drafts (valid file, invalid file, file over 2 MB, file that would exceed 100 drafts) | Active draft changes; copy is named "(copy)"; downloaded file passes `backupSchema`; import adds drafts with new ids; each failure shows the existing message and changes nothing |
| HB-B09 | Draft without storage | Block `localStorage` writes | Banner shows memory-only state; edits still work; no uncaught error |
| HB-B10 | Invalid stored data | Seed `localStorage` with invalid `chematlas-worksheets-v1` | Raw value appears under `chematlas-worksheets-v1.recovery`; the user is told; a fresh draft starts |
| HB-B11 | Format controls | Change each control: preset (all five), title, subtitle, instructions, paper, orientation, margin, font, spacing, lines, grouping, MCQ and FRQ headings and section instructions, seven checkboxes | Each persists in the draft's `format`; after Update, the generated PDF reflects it (page size, title text, grouping, fields) |
| HB-B12 | Preview generates | Open the preview with a draft of 5 entries | Real PDF pages shown by `WorksheetPreview`; page count equals the PDF's; no console errors |
| HB-B13 | Preview out of date | Edit any control after generation | Within one frame the pages dim with an "Out of date" banner and "Update preview"; Download and Open are disabled; after Update (or the desktop auto-refresh) they are enabled and the banner clears |
| HB-B14 | Forced error | Make the renderer fail (stub or remove a source PDF through request interception) | Last good pages stay (dimmed); message names the cause or the file; Retry is shown; download disabled; Retry after restoring the stub succeeds |
| HB-B15 | Download | Download after a current preview | File name from title; the file's bytes equal the bytes previewed (compare hash of the object URL blob) |
| HB-B16 | Contents mode | With no verified answer, then with one (registry entry with `answer`) | "Separate answer key" and "Questions and answer key" disabled and note shown without; enabled with; output has the answer-key page when chosen |
| HB-B17 | Print outcome labels | Build a draft per `planExport` case | Each row's label matches the plan; no row shows a crop for an entry whose outcome is a source page; the export summary count of full-page questions matches |
| HB-B18 | Mixed worksheet export | Reviewed, unreviewed, shared-context, review-status and user-bank entries in one draft | Export completes; PDF page count and per-page text recorded for manual inspection (MN-06) |
| HB-B19 | Phone tabs | At 390 px | Outline and Preview tabs (`role="tablist"`); preview generates only when its tab opens; no overflow |
| HB-B20 | Generation time | Drafts of 5, 20 and 50 entries including full-page fallbacks | Time from update to bytes recorded (PF-01) |

## 5. Manual checks that cannot be automated

| ID | Check | Who | How | Pass condition |
|---|---|---|---|---|
| MN-01 | Screen reader, Windows | A person | NVDA with Chrome: unit toggles, topic chips, result list and row toggles, question pane, builder outline, reorder, preview, export | No unlabelled control; result count and worksheet count changes are announced; "Question n moved to position m of k" is announced; every action reachable without a pointer |
| MN-02 | Screen reader, Apple | A person | VoiceOver with Safari, same walkthrough, plus the phone sheet and question view if tested on iOS | Same as MN-01 |
| MN-03 | Real phone, long FRQ | A person | Open a long free-response question on a real phone; pinch to zoom, pan, use the zoom buttons, 1:1 and fullscreen | Text is legible; pinch and pan work inside the viewer; no page-level horizontal scroll; no render freeze |
| MN-04 | Reduced motion | A person | Enable the OS setting; use bank and builder | No transitions or slide helpers; nothing waits for an animation |
| MN-05 | Touch reordering | A person | On a phone or tablet reorder with Move buttons; try drag on a tablet | Buttons work with touch; targets feel at least 44 px; drag, if present, does not break scrolling |
| MN-06 | Exported PDFs, one per case | A person | Open the PDFs exported for each `planExport` case (reviewed only, unreviewed only, reviewed with unreviewed on a shared page, stimulus without context, shared context, shared fallback page) and a mixed worksheet | Each question appears as the outline said; shared context printed once; "see earlier" pages present; no unexpected neighbouring question or printed answer in a typeset question; footer, numbering and response lines as formatted |
| MN-07 | Owner sees one worksheet per case | Owner | Owner reviews the PDFs from MN-06 | Owner confirms |
| MN-08 | Matrix walk-through | A person | Walk `04-component-migration-matrix.md` row by row against the running builder | Every row is present, moved, or covered by an approved O4 decision |
| MN-09 | Owner review of screenshots | Owner | Screenshots from HB runs at 1440, 768, 390 px for bank and builder, and the final visual review | Owner approves each phase before the next starts |
| MN-10 | Keyboard-only path | A person | No pointer: find a question, add it, open the builder, reorder, update the preview, download | Completes; focus visible at every step; no trap |
| MN-11 | Existing draft survives | A person | Before changing code, create a draft with order, format and per-entry settings in the old app; after Phase A open it in the new one | Order, format and per-entry page breaks and response lines unchanged |
| MN-12 | Contrast spot check | A person | Inspect three unit colour pairs in the running UI against the script's output | Visible text and boundaries meet the script's figures |

## 6. Regression and protected-system checks

| ID | Check | How | Pass condition |
|---|---|---|---|
| RG-01 | Types, tests, build, private check | `pnpm run check`, `pnpm test`, `pnpm run build`, `pnpm run check:private` and `check:private --built` | All pass; baseline recorded before any change (handoff section 2) |
| RG-02 | Catalog files unchanged | `git diff --stat 4f965e3 HEAD -- public` | Empty |
| RG-03 | Protected paths unchanged | `git diff --stat 4f965e3 HEAD -- public worker wrangler.student.jsonc wrangler.private-review.jsonc app/admin app/api db drizzle .github` (handoff A acceptance 6) | Empty. Also empty for `lib/question-review-*`, `lib/cloudflare-access.mjs`, `lib/student-access.mjs`, `scripts/assert-student-private-config.mjs`, `research`, `package.json`, `pnpm-lock.yaml` |
| RG-04 | No admin or review paths in the build | `check:private --built` (RG-01) | No file in `dist/client` matching `admin`, `review-dashboard`, `question-review`, `question-images`; no `/admin/` in `.vite/manifest.json` |
| RG-05 | Access gate | `tests/student-access.test.mjs` and smoke status matrix | 200 with JWT, 403 without or wrong audience; admin paths 404; `private, no-store` on every response |
| RG-06 | Smoke run | `scripts/release/smoke.cjs` against the built `dist/` (needs Playwright and Chrome environment variables) | Phase A: passes with the file unmodified. Phases B and C: passes with the file updated in the same change, keeping every assertion category (rows 6.1 to 6.11 of the matrix) |
| RG-07 | Rendered HTML diff | Script (proposed `tests/browser/html-diff.mjs`) fetches `/`, `/practice-builder`, `/?view=library`, `/?view=detail&question=mcq-2008-1-29` from the baseline and the changed build and diffs the HTML | Empty, or every difference explained (Phase A "Done when") |
| RG-08 | Smoke category review | Reviewer compares `smoke.cjs` before and after | Home, unit, list, question canvas, builder heading and count, admin 404s, no page errors each still asserted |
| RG-09 | Existing drafts fixture round trip | UT-19 plus MN-11 | Byte-identical Backup; draft opens with same order and settings |
| RG-10 | Old vs new builder PDF | Generate the PDF for the same draft with the old builder (baseline worktree) and the new one | Identical bytes, or identical page count and extracted text per page (`03` Phase C "Done when") |
| RG-11 | Existing suites unchanged | `tests/stage3-worksheet.test.mjs`, `tests/worksheet.test.mjs`, `tests/navigation.test.mjs` (before extension) | Pass without edits to existing assertions |
| RG-12 | Review-boundary tests | `tests/question-review-*.test.mjs`, `tests/question-image-review.integration.test.mjs` | Pass; no student file imports admin, db or review libraries (R19) |
| RG-13 | `globals.css` untouched | `git diff 4f965e3 HEAD -- app/globals.css` | Empty (or a reviewed, explained diff: `02` 8.1 says add nothing global, remove nothing) |
| PF-01 | Generation time | HB-B20 | Times for 5, 20 and 50 entries recorded in the phase report; if over about 3 s on a mid phone, a worker move is raised as a follow-up (`02` section 9) |

## 7. Acceptance gate per phase

Items are copied from `03-risks-and-roadmap.md`, not weakened and not extended. "Evidence gap" means no test or check in this plan can provide the evidence.

### Phase A: Foundation (no visible change)

- [ ] Smoke test passes unmodified. Evidence: RG-06, RG-08.
- [ ] Existing drafts, legacy id-array key, overrides and a user bank still load (unit tests with fixtures). Evidence: UT-15, UT-19, UT-04, UT-05, MN-11.
- [ ] Catalog counts test: 735 classified, 366 multi-topic, 210 multi-unit. Evidence: UT-01.
- [ ] `filterQuestions` returns the same ids as the old inline predicate for a table of filter combinations. Evidence: UT-06, UT-07.
- [ ] Contrast script passes or lists the pairs to adjust. Evidence: UT-26.
- [ ] Done when: all checks pass and a diff of rendered HTML for the smoke URLs is empty or explained. Evidence: RG-01, RG-07.

Handoff additions (`SESSION-3-HANDOFF.md`, Phase A acceptance), kept separate because they are not in `03`: build and checks pass (RG-01); smoke unmodified (RG-06); HTML identical (RG-07); new unit tests pass (UT-01 to UT-26); manual check in the UI-only dev server of an existing draft, a topic override, a question image and builder preview (MN-11, HB-Q09, HB-B12, UT-04); empty protected-path diff (RG-03).

### Phase B: Question Bank on real state

- [ ] For every unit and topic, list length equals the chip count and equals `filterQuestions` output. Evidence: UT-11, HB-Q03.
- [ ] Old URLs (`?view=library&unit=u3&topic=3.4`, `?view=detail&question=mcq-2008-1-29`) open the bank in the equivalent state. Evidence: UT-25, HB-Q02.
- [ ] Adding from row, pane or `A` writes to the active draft and survives reload and a visit to `/practice-builder`. Evidence: HB-Q14, HB-Q16, HB-Q08.
- [ ] A cross-topic question shows its primary topic and why it is listed. Evidence: HB-Q07.
- [ ] Printed question draws for a reviewed, an unreviewed and a no-crop question; Full page works for each. Evidence: HB-Q09, HB-Q10, HB-Q11, HB-Q12.
- [ ] No console errors. Evidence: console capture in every HB scenario.
- [ ] Smoke test updated and passing with the same categories of assertion. Evidence: RG-06, RG-08.
- [ ] Done when: acceptance met at 1440, 768 and 390 px and the legacy views still open from the "More" menu. Evidence: HB-Q01 to HB-Q21 at three widths, HB-Q18.
- [ ] Tests listed in `03` for B: component tests for band, list and pane. Evidence gap (no DOM test runner, no new dependencies; covered indirectly by HB-Q03, HB-Q08, HB-Q14). Navigation tests: UT-24, UT-25. Headless script: section 4.1. Manual keyboard and screen-reader pass: MN-01, MN-02, MN-10.

### Phase C: Practice Builder on the existing pipeline

- [ ] Every control of the old builder is present, moved or covered by an approved O4 decision (checked against the migration matrix). Evidence: MN-08. O4 must be decided first.
- [ ] Reorder by buttons, keyboard and drag updates the draft; grouped reorder stays within a section. Evidence: HB-B03, HB-B04, HB-B05, HB-B06, UT-21.
- [ ] Undo restores add, move, remove, break, lines, preset. Evidence: UT-20, HB-B07.
- [ ] Editing marks the preview out of date within one frame; download is disabled until it is current. Evidence: IT-01, IT-04, HB-B13.
- [ ] A forced generation error keeps the last good pages and shows the message. Evidence: IT-03, HB-B14.
- [ ] Drafts with review or user-bank entries open and export. Evidence: IT-06, HB-B18, UT-22.
- [ ] Generation time recorded for 5, 20 and 50 entries. Evidence: PF-01, HB-B20.
- [ ] Done when: a worksheet built in Phase B's bank can be arranged, previewed and downloaded, and the PDF matches what the old builder produces for the same draft. Evidence: HB-B01, HB-B12, HB-B15, RG-10.
- [ ] Tests listed in `03` for C: component tests for outline: evidence gap (as Phase B). Integration test for freshness and abort with a stubbed renderer: IT-01, IT-02, IT-03. `stage3-worksheet` tests unchanged and passing: RG-11. Manual PDF inspection for a mixed worksheet: MN-06, HB-B18.

### Phase D: Export fidelity

- [ ] For fixed drafts, PDF output is unchanged by the extraction. Evidence: PDF-01.
- [ ] `planExport` agrees with the generated PDF for: reviewed only; unreviewed only; reviewed sharing a page with unreviewed (both fall back); stimulus-linked without context; two questions sharing a context (second says "with question N"); two questions on the same fallback page (second says "see earlier"). Evidence: UT-27 to UT-32, PDF-02 to PDF-07.
- [ ] No screen shows a crop for an entry whose outcome is a source page. Evidence: HB-B17, MN-06.
- [ ] Done when: acceptance met and the owner has seen one exported worksheet per case. Evidence: MN-07.
- [ ] Tests listed in `03` for D: unit tests for `planExport`; PDF text-extraction check per case; manual review of three exported PDFs. Evidence: UT-27 to UT-33, PDF-02 to PDF-07, MN-06.

### Phase E: Responsive, accessibility and regression

- [ ] No horizontal overflow at 390, 768, 1440. Evidence: HB-Q21, HB-B19.
- [ ] All targets at least 44 px on touch. Evidence: HB-Q01 to HB-Q21 with a target-size measurement added to the scripts (proposed in the scripts, not yet written); MN-05. If the measurement is not written, evidence gap.
- [ ] Back button returns from question to list at the same scroll position with focus on the originating row. Evidence: HB-Q20.
- [ ] Full keyboard path: find, add, arrange, export, without a pointer. Evidence: MN-10, HB-Q08, HB-B04.
- [ ] Screen-reader pass (NVDA + Chrome, VoiceOver + Safari) with no unlabelled control and announced result and reorder changes. Evidence: MN-01, MN-02.
- [ ] Reduced motion: no transitions. Evidence: MN-04; a scripted check with `prefers-reduced-motion` emulation is proposed, not written.
- [ ] All automated suites and the smoke run pass. Evidence: RG-01, RG-06, RG-11, RG-12.
- [ ] Done when: acceptance met; owner approves; PR opened only on the owner's instruction. Evidence: MN-09.
- [ ] Tests listed in `03` for E: headless script at three sizes (section 4); axe scan: evidence gap (no axe tool in the repo and no new dependencies); manual assistive-technology pass: MN-01, MN-02; real-phone check of long FRQ zoom: MN-03.

## 8. Not covered and known gaps

1. Component tests (`03` Phases B and C name them): the repo has no DOM test environment and no new dependencies are planned. Only pure functions and the headless browser checks give evidence. Owner decision needed if component-level tests are wanted.
2. Axe scan (`03` Phase E): no axe tool is installed. Evidence gap unless the owner approves a development dependency.
3. Target size 44 px and reduced-motion emulation are proposed as additions to the headless scripts; they do not exist yet.
4. Whether `esbuild` is resolvable for bundling TypeScript in new tests, and whether `pdfjs-dist` text extraction runs under `node --test`, are not verified (the existing test bundles with esbuild; `esbuild` is not a direct dependency in `package.json`).
5. Fixture pairs for `planExport` cases (for example reviewed and unreviewed questions that share a page, or two questions sharing a context) are not identified here; the tests select them by rule from the data and fail if none exists.
6. Smoke, HB and PF runs need a built `dist/`, Playwright or Chrome, and the Access fixture or the UI-only dev config. The UI-only config does not exist yet (handoff A7).
7. Client-side navigation between `/` and `/practice-builder` under vinext is an unverified assumption (`02` section 9); HB-Q16 and HB-Q17 pass with either full reloads or client navigation.
8. Real network cost under `Cache-Control: private, no-store` (R8, O5) is reported by PF-01 and the Phase A spike only; no budget is set.
9. Assistive-technology and real-phone results depend on a person and on devices not available to an agent.
10. CI does not run `pnpm run lint`, and CI does not run on the unpushed branch. Local runs are the only evidence until the owner opens a PR.
11. `scripts/check-token-contrast.mjs` is in `scripts/`, so `pnpm test` does not run it unless the proposed wrapper `tests/token-contrast.test.mjs` is added.
12. Pixel-level visual regression is not planned; visual fidelity rests on MN-06, MN-09 and the owner's review.
