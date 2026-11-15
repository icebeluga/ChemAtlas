# Component migration matrix

Purpose: one row per existing UI unit and per user-visible control in the student app, so that nothing in today's app is dropped unnoticed. The matrix records decisions already made in `02-architecture.md` and `03-risks-and-roadmap.md` and the owner decisions O1 to O6 in `PROGRESS.md`. It makes no new decisions. Where `02` says nothing about an item, the Decision is "Pending owner decision" and the item is repeated in the closing list "Items with no decision in 02".

Base: `4f965e3` (production code in this worktree is identical to it, per `01-existing-system.md`). Line numbers were confirmed in this worktree.

## Abbreviations

| Short | Path |
|---|---|
| SA | `components/student-app.tsx` |
| PB | `components/practice-builder.tsx` |
| WP | `components/worksheet-preview.tsx` |
| WS | `lib/worksheet.ts` |
| WPDF | `lib/worksheet-pdf.ts` |
| NAV | `app/navigation.mjs` |

Decision values: Reuse (moved or lifted, behaviour unchanged), Adapt (kept, changed), Replace (new component takes over), Retire (removed, nothing replaces it), Keep as is, Pending owner decision. "Legacy view in new shell" means the markup stays in `SA` and is reached from the new top bar (`02` section 7, `03` "Not in this roadmap").

Phase letters are from `03`. Phase A has no visible change; its rows are extractions.

---

## 1. Shell and navigation

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 1.1 Skip link "Skip to content" | SA:406 | Adapt | `AppShell` | B | none | L | Keep target `#main-content` (SA:433, `tabIndex=-1`). |
| 1.2 App shell root `.app-shell.student-workspace` | SA:405 | Adapt | `AppShell`; new `app/student-tokens.css` scoped under this class | A (tokens), B (shell) | A6 tokens | M (R6) | The class scopes the student CSS. Tokens must be scoped under it so `.qiv-*` review styles are not affected. |
| 1.3 Header `.site-nav` | SA:407 to 432 | Replace | `AppShell` top bar: Question bank, Practice builder (n), More | B | `useWorksheets` for the count | M (R5) | Smoke does not click header items except the unit button (see 6.x). |
| 1.4 Mobile menu toggle (hamburger, `aria-expanded`) | SA:408; state SA:195 | Pending owner decision | none stated in 02 | B or E | O4 | M (R15) | `02` section 6 defines phone navigation for units and the bank, not for the header. Listed in the closing list. |
| 1.5 Brand lockup button "ChemAtlas home" (`C✦`, "AP Chemistry Studio") | SA:409 | Adapt | `AppShell` brand | B | navigation target decided in B | L | On `/practice-builder` it does `window.location.assign("/")`; elsewhere `navigate("desk")`. `desk` is retired, so the target must map to the bank (`02` 4.2 old-URL rule). |
| 1.6 `<nav aria-label="Main navigation">` | SA:410 | Adapt | `AppShell` | B | none | L | Keep a labelled landmark. |
| 1.7 Nav item "Browse by unit" (selected on `desk`/`unit`, `aria-current` on `desk`) | SA:412 to 416 | Retire | replaced by "Question bank" item; unit choice moves to `CourseBand` | B | NAV old-URL mapping | M (R5) | Smoke asserts this heading and the "Unit 1" button today (rows 6.6 to 6.7). |
| 1.8 Unit menu toggle "Show all units" (`aria-controls="student-unit-menu"`) | SA:417 to 418; state SA:193 | Retire | `CourseBand` nine unit toggles | B | `useCatalog` counts | M | Phone uses the nine-tile row (`02` section 6 item 1). |
| 1.9 Unit menu (nine buttons "Unit n" + name; opens `unit` view with filters reset) | SA:419 to 422 | Replace | `CourseBand` | B | NAV | M | |
| 1.10 Escape closes unit menu and refocuses toggle | SA:411 | Retire | `<dialog>`/sheet Esc behaviour (`02` section 6 item 8) | B/E | none | L | Goes with 1.8. |
| 1.11 Nav item "Question bank" (selected on `library`/`detail`) | SA:424 | Adapt | `AppShell` "Question bank" | B | NAV | L | |
| 1.12 Nav link "Practice Builder" (plain `<a href="/practice-builder">`, full page load) | SA:425 | Adapt | `AppShell` "Practice builder (n)" with draft count | B | Phase A navigation spike (A7, R8, R9); `useWorksheets` | M (R8, R9) | Stays a link to the same URL. Client-side navigation only if the spike shows it works (`02` 5.5, assumption). |
| 1.13 Nav item "Practice sessions" (`view=builder`) | SA:426 | Pending owner decision | More menu, first group (O4 recommendation) | B | O4 | M | Architect recommendation: "More" menu, first group. |
| 1.14 Tools toggle (`aria-haspopup="menu"`, selected on progress/review/audit/banks) | SA:427 | Adapt | More menu | B | O4 | M (R15) | |
| 1.15 Tools menu item "Progress" | SA:428 | Pending owner decision | More menu, first group (O4 recommendation) | B | O4 | L | Legacy view in new shell. |
| 1.16 Tools menu item "Review queue" with count badge (`reviewQuestions.length`) | SA:428 | Pending owner decision | More menu, "Catalog tools" group (O4 recommendation) | B | O4 | L | Sets `reviewKind="review"` before navigating. |
| 1.17 Tools menu item "Source page audit" | SA:428 | Pending owner decision | More menu, "Catalog tools" group (O4 recommendation) | B | O4 | L | |
| 1.18 Tools menu item "Legacy content" | SA:428 | Pending owner decision | More menu, "Catalog tools" group (O4 recommendation) | B | O4 | L | Sets `reviewKind="legacy"`. |
| 1.19 Tools menu item "Manage test banks" | SA:428 | Pending owner decision | More menu, "Catalog tools" group (O4 recommendation) | B | O4 | L | |
| 1.20 Profile badge "J" (`title="Study profile"`) | SA:431 | Pending owner decision | none stated in 02 | B | owner | L | Hard-coded letter, not interactive. Listed in the closing list. |
| 1.21 Notice bar (`role="status"`, dismiss "×") | SA:434; state SA:204 | Adapt | `AppShell` notice area | B | none | L | Used by many handlers (storage failure, import results). `02` section 6 requires `role="status"` announcements. |
| 1.22 Footer "College Board unit/topic map · Original source pages · Progress saved locally" | SA:573 | Pending owner decision | none stated in 02 | B | owner | L | Listed in the closing list. |
| 1.23 "Loading Practice Builder…" status while `backup` is undefined | SA:442 | Replace | skeleton/retry states (`02` 3.3, section 6 item 9) | C | `useWorksheets` status | L | |
| 1.24 Focus main on entering `library`/`detail` | SA:308 to 312 | Adapt | focus rules (`02` section 6 item 8: focus heading, return to row) | E | none | M (R15) | |
| 1.25 Browser history subscription (`popstate`, `chematlas:navigate`, `useSyncExternalStore`) | SA:22 to 31, 138 | Keep as is | `ChemAtlas` | A | none | L | Basis for the history-backed question view (E). |

## 2. Views in `components/student-app.tsx`

### 2.1 View rows

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 2.1 `desk` view ("Browse by unit": heading, 4 metric tiles, unit grid, footnote) | SA:443 to 454 | Replace | `QuestionBank` (`CourseBand`) | B | NAV old-URL mapping | M (R5) | `?view=desk` must open the bank (`02` 4.2). Sub-items 2.2 to 2.4. |
| 2.2 Desk metric tiles: Question records, Curriculum topics, Total MCQs, Total FRQs | SA:445 to 450 | Pending owner decision | none stated in 02 | B | owner | L | Listed in the closing list. |
| 2.3 Desk unit grid (`UnitDirectoryCard` x9: "n topics · m classified questions") | SA:451 to 452 | Replace | `CourseBand` unit toggles with counts | B | `useCatalog` counts | M (R12) | Count rule: distinct questions with any topic in the unit (`02` 4.3). |
| 2.4 Desk footnote links "Read the classification method" and "Source coverage audit" | SA:453 | Pending owner decision | none stated in 02 | B | owner | L | Links to `/classification-method.md` and `/student-page-audit.json`. Also in the audit view (row 2.53). |
| 2.5 `unit` view (back, heading, "View unit questions →", topic cards) | SA:456 to 467 | Replace | `QuestionBank` (`CourseBand` topic chips) | B | NAV | M | `?view=unit&unit=…` maps to the bank with that unit. |
| 2.6 Unit view "← All units" button | SA:457 | Retire | none | B | none | L | |
| 2.7 Unit view topic cards (`DirectoryCard`, "n classified questions") | SA:463 to 466 | Replace | `CourseBand` topic chips with counts | B | `useCatalog` | M | Chip count equals list length (`02` 4.3). |
| 2.8 `library` view (Question bank) | SA:468 to 516 | Replace | `QuestionBank` | B | Phase A hooks | M (R5, R10) | Sub-items 2.20 to 2.39. |
| 2.9 `builder` view "Practice sessions" (unit, topic, type, question count selects; summary; "Start n-question practice") | SA:518 | Pending owner decision | legacy view in new shell | B | O4 | M | Uses `selectedUnit/Topic/typeFilter` from URL; uses the same any-related predicate in `startSession` (SA:341 to 352), a third copy of the rule not named in `02`. |
| 2.10 Practice sessions side panel: "Browse the question bank →" | SA:518 | Pending owner decision | legacy view in new shell | B | O4 | L | Navigates to `library`; must still resolve. |
| 2.11 `detail` view | SA:520 to 528 | Replace | `QuestionPane` | B | O1 for the viewer | M (R16) | Sub-items 2.40 to 2.49. |
| 2.12 `detail` "Question not found" state with "Back to Question Bank" | SA:528 | Adapt | `QuestionPane` / loading state | B | `useCatalog` ready flag | L | `eba3977` adds "Loading question…" to stop a false not-found flash (section 7). |
| 2.13 `practice` view (session question: source page, work textarea, submit, self-check) | SA:530 to 535 | Pending owner decision | legacy view in new shell | B | O4 | M | Sub-items 2.50. |
| 2.14 `practice` empty state "No questions in this session" + "Browse questions" | SA:563 | Pending owner decision | legacy view in new shell | B | O4 | L | |
| 2.15 Session worksheet / print view (`showWorksheet`) | SA:536 to 562 | Pending owner decision | legacy view in new shell | B | O4 | M | Separate from Practice Builder (01 C5). Uses `planWorksheet` and live `PdfQuestionPage` canvases. |
| 2.16 `progress` view | SA:565 | Pending owner decision | legacy view in new shell | B | O4 | L | Row 2.52. |
| 2.17 `audit` view (Source page audit) | SA:567 | Pending owner decision | legacy view in new shell | B | O4 | L | Row 2.53. |
| 2.18 `review` view (Classification review / Legacy content) | SA:569 | Pending owner decision | legacy view in new shell | B | O4 | M | Writes topic overrides read by `useCatalog` (R18). Row 2.54. |
| 2.19 `banks` view (Manage test banks) | SA:571 | Pending owner decision | legacy view in new shell | B | O4 | M | Writes IndexedDB and user questions (R18). Row 2.55. |

### 2.2 Controls inside `library` (SA:468 to 516)

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 2.20 Page title and help text "Multi-concept FRQs appear under each matched topic" | SA:470 to 471 | Adapt | `QuestionBank` help text | B | none | L | `02` 4.3 says the any-topic rule is documented in the UI, once, in the band's help text. |
| 2.21 UNIT select (resets topic) | SA:472 | Replace | `CourseBand` unit toggles | B | NAV | M | |
| 2.22 TOPIC select (topics of the unit) | SA:472 | Replace | `CourseBand` topic chips; phone: topic bottom sheet | B (desktop), E (sheet) | NAV | M | |
| 2.23 TYPE select (Mixed/MCQ/FRQ) | SA:472 | Replace | `BankFilters` MCQ/FRQ | B | NAV | L | URL value `Mixed` today; new URL contract extends NAV. |
| 2.24 SEARCH input | SA:472 | Adapt | `BankFilters` search | B | NAV `q` | L | Same substring rule; add topic code (`02` 4.2). Keep field list per handoff A1 until merged deliberately. |
| 2.25 "Clear filters" button (shown when any filter set) | SA:473 to 474 | Adapt | `BankFilters` clear | B | NAV | L | |
| 2.26 Result head (title for scope + "n catalog entries · uncertain matches are in Review") with `role="status"` | SA:476 | Adapt | result count in `role="status"` region | B | none | L | The "uncertain matches are in Review" text points to a legacy tool; wording not decided in 02. |
| 2.27 "View worksheet (n)" bar (link to `/practice-builder`) | SA:477 to 479 | Replace | `WorksheetStrip` + link to builder | B | `useWorksheets` | L | |
| 2.28 Results scroll region (`role="region"`, `tabIndex=0`) and scroll-to-top effect | SA:480, 327 to 329 | Adapt | `QuestionList` | B | none | L | `02` section 6: list is a `<ul>`; filter changes reset to top. |
| 2.29 Topic definition panel (description, learning objectives, CED note) | SA:481 | Pending owner decision | none stated in 02 | B | owner | L | Data `catalog.topicDetails`. Listed in the closing list. |
| 2.30 Result row `article.catalog-row` (type chip, "year · Question n", exam, original page(s)) | SA:487 to 492 | Replace | `QuestionList` row | B | smoke row 6.8 | M (R5) | `.catalog-row` is asserted by smoke today. |
| 2.31 "View question ↗" button (opens detail, aria-label names question) | SA:493 | Replace | row select button (`aria-current`) | B | none | L | |
| 2.32 Row context line "Primary topic" / "Also filed under" | SA:496 | Adapt | row "Primary: 4.7" marker + pane chips | B | none | L | `02` 4.3. |
| 2.33 Row text preview (when no relevant parts) | SA:497 | Adapt | `QuestionList` row | B | none | L | |
| 2.34 "Add to Worksheet" / "Added to worksheet" button (disabled with no draft, already added, or 500 entries) | SA:498 to 503 | Replace | row add toggle (`aria-pressed`) via `useWorksheets.add/remove` | B | A3 hook | M (R3) | Today it cannot remove; the new toggle adds remove. No undo in the list today (01 C2). |
| 2.35 "Needs topic review" chip and "n mapped part(s)" label | SA:503 | Adapt | row status | B | none | L | Chip never shows in the bank today (only classified rows are listed). |
| 2.36 "Classification details" disclosure (primary topic, rationale, secondary topics, parts list) | SA:504 to 510 | Adapt | `QuestionPane` topics and parts | B | `partsForTopic` | L | Content stays; location moves to the pane. |
| 2.37 Pagination "← Previous / Page x of y / Next →" (50 per page) | SA:513 | Adapt | `QuestionList` paging | B | none | L | |
| 2.38 Empty state "No classified questions in this view" + "Open classification review" | SA:513 | Adapt | empty state | B | O4 (review link target) | L | Link target is a legacy tool. |
| 2.39 Curriculum note "Curriculum source · AP Chemistry Course and Exam Description" | SA:514 | Pending owner decision | none stated in 02 | B | owner | L | Listed in the closing list. |

### 2.3 Controls inside `detail` (SA:520 to 527)

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 2.40 "← Back to catalog" button | SA:520 | Replace | phone "Back to results"; desktop none (list stays visible) | B (desktop), E (phone) | history entry (`02` section 6 item 3) | L | |
| 2.41 Heading (exam eyebrow, "type number · year"), status label "Classified"/"Needs topic review", source line | SA:520 | Adapt | `QuestionPane` header | B | none | L | |
| 2.42 Previous/Next question buttons, "Question n of m" | SA:521; `detailSequence` SA:331 | Pending owner decision | none stated in 02 for desktop | B | owner | L | `02` 6 item 3 gives phone previous/next with "3 of 61"; desktop not stated. Sequence falls back to all questions when the current one is not in the filtered list. Listed in the closing list. |
| 2.43 Topic map: "PRIMARY TOPIC" callout, "ALSO FILED UNDER" tags (`UNIT · id · name`) | SA:522 | Adapt | `QuestionPane` "Primary topic" and "Also filed under" chips | B | none | L | `02` 4.3: selected topic emphasised. |
| 2.44 Parts panel "WHY THIS QUESTION APPEARS HERE" (parts for selected topic; whole-question text; MULTI-CONCEPT FRQ tag) | SA:523 | Adapt | `QuestionPane` parts table | B | `partsForTopic` | L | Reuse `partsForTopic` (SA:388). |
| 2.45 "Classification evidence" (rationale, method, supporting pages, legacy concepts) | SA:524 | Adapt | `QuestionPane` (collapsible) | B | none | L | |
| 2.46 Meta grid (type, year, number, exam/version, source pages, classification status) | SA:525 | Adapt | `QuestionPane` header/status | B | none | L | `eba3977` converts it to a `<dl>` (section 7). |
| 2.47 Image mode tabs: "Approved image" (only if `approvedImages` has entries), "Full page", "Question crop" | SA:526; `approvedImages` SA:146 | Adapt | `QuestionPane` "Question / Full page" switch | B | O1 | M (R1) | `approvedImages` is a constant `{}` (01 B2); the "Approved image" tab can never show. `02` 3.1: the student UI must not claim an image is approved. Removal of the dead tab is implied, not stated. |
| 2.48 Page tabs "Original page n" (multi-page questions) | SA:526 | Adapt | `QuestionPane` page switch | B | none | L | |
| 2.49 Source image `PdfQuestionPage` with yellow part highlights (`highlightLabels`) | SA:526 | Reuse | `PdfQuestionPage` (own file) | A | O1 | M | See row 4.11 and section 7. |

### 2.4 Controls inside legacy views (kept in the new shell)

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 2.50 Practice session controls: "← Exit session", "Worksheet", Previous, progress line, question counter, page tabs, "Your work / answer" textarea, "Submit response", self-check buttons (Got it, Missed it, Not sure), guided mistake review, "Next question"/"Finish session", question footer (primary topic, secondary tags, source note) | SA:530 to 535 | Pending owner decision | legacy view in new shell | B | O4 | M | Behaviour unchanged. "Exit session" navigates to `desk`, which is retired; target must map to the bank. |
| 2.51 Session worksheet controls: "← Back to session", "Print or save PDF" (`printWorksheet`), per-question canvases, "Shared stimulus", answer box | SA:536 to 562, 394 to 403 | Pending owner decision | legacy view in new shell | B | O4; print CSS `app/globals.css:110-116` | M | `globals.css` may not be edited (02 section 8.1), so print rules stay. |
| 2.52 Progress controls: "Export progress (.json)", "Import progress (.json)" (file input, 2 MB cap, confirm), stat tiles, "Build review session →", "Practice →" per concept, "Review →" per missed question | SA:565, 252 to 280 | Pending owner decision | legacy view in new shell | B | O4; `lib/progress-transfer.mjs` | M | Export does not include banks, PDFs or drafts (01 C2). Covered by `tests/progress-transfer.test.mjs`. |
| 2.53 Audit controls: "GO TO PAGE" number input, Previous/Next page, links "Open complete page list", "Read method and topic boundaries" | SA:567 | Pending owner decision | legacy view in new shell | B | O4 | L | |
| 2.54 Review controls: "Unresolved (n)" / "Legacy (n)" buttons, search input, per-row topic select ("Choose primary topic…"), "View image", pagination, "Browse classified →" | SA:569 | Pending owner decision | legacy view in new shell | B | O4; `useCatalog` overrides | M (R18) | "View image" calls `openQuestion`, which navigates to `detail`; must resolve to the new pane. |
| 2.55 Manage banks controls: PDF upload zone ("Choose a PDF to add"), manual question reference form (bank, page, number, type, topic, "Add source question"), bank list | SA:571, 368 to 384 | Pending owner decision | legacy view in new shell | B | O4; IndexedDB helpers (row 4.12) | M (R18) | Creates `manual-…` ids. |

---

## 3. Practice Builder (`components/practice-builder.tsx`)

Decisions follow `02` section 5.4: the four-step wizard goes away; steps 2 to 4 become Outline, LayoutPanel and PreviewPane on one screen; the step-1 picker is replaced by the Question Bank; kept: multiple drafts, duplicate, import/export of drafts, presets, every `Format` option, per-entry page break and response lines, undo, answer-key modes, the "no verified answer key" notice; moved or pending O4: Replace, Auto-add, attempted/missed and original-source filters.

### 3.1 Header, drafts bar, steps

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 3.1 Page heading "Practice Builder" and intro text | PB:155 to 156 | Adapt | `PracticeBuilder` heading | C | smoke 6.10 | M (R5) | Smoke asserts heading exactly "Practice Builder". |
| 3.2 "n selected" count (`aria-live="polite"`) | PB:157 | Adapt | `PracticeBuilder` count | C | smoke 6.11 | M (R5) | Smoke asserts text exactly "0 selected". |
| 3.3 Worksheet title field (`draft.name`, max 100) | PB:160 | Reuse | `DraftBar` | C | `useWorksheets.rename` | L | `02` 5.3: title is `draft.name`; printed title is `format.title`. |
| 3.4 "Saved worksheets" select (switch draft; resets step, undo, replacement, mode) | PB:161 to 163 | Reuse | `DraftBar` draft switcher | C | `useWorksheets.setActive` | L | |
| 3.5 "New worksheet" | PB:165 | Reuse | `DraftBar` New | C | `useWorksheets.newDraft` | L | 100-draft limit message PB:115. |
| 3.6 "Worksheet actions" disclosure | PB:166 | Adapt | `DraftBar` | C | none | L | |
| 3.7 Duplicate (name + " (copy)", truncated to 93 chars) | PB:167 | Reuse | `DraftBar` Duplicate | C | `useWorksheets.duplicate` | L | |
| 3.8 "Download drafts" (`chematlas-worksheets.json`) | PB:143 to 147, 168 | Reuse | `DraftBar` | C | `useWorksheets.exportDrafts` | L | |
| 3.9 "Import drafts" (2 MB cap, 100-draft cap, new ids, schema-validated) | PB:169 to 179 | Reuse | `DraftBar` | C | `useWorksheets.importDrafts` | M (R3) | Error text "Could not import that worksheet backup." |
| 3.10 Step tab strip "Worksheet steps" (Select, Arrange, Format, Export PDF) | PB:183 to 185 | Retire | none; outline, layout and preview share one screen | C | none | M (R10) | `02` 5.4: "nothing it could do is removed". The `steps` constant (WS:5) becomes unused. |
| 3.11 Status line (`role="status"`: notice or "Drafts autosave in this browser…") | PB:186 | Pending owner decision | none stated in 02 | C | owner | L | Hook `status` ("memory-only", "recovered") adds banners (`02` 5.2). Listed in the closing list. |
| 3.12 Error alert (`role="alert"`) | PB:187 | Adapt | `PreviewPane` error with Retry | C | `useExportData` | M | `02` 3.3: errors keep last good preview and add Retry. |
| 3.13 Panel titles per step (`labels`) | PB:148, 190 | Retire | none | C | none | L | |

### 3.2 Step 1 "Select questions"

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 3.14 Help text (replacement vs normal) | PB:192 | Retire | none | C | none | L | Print-outcome explanation moves to row labels (3.40). |
| 3.15 Search | PB:194 | Replace | `BankFilters` search | C | A1 `filterQuestions` | L | Builder search fields: registry exam, number, display name, preview. |
| 3.16 Unit select | PB:195 | Replace | `CourseBand` | C | none | L | |
| 3.17 Topic select | PB:196 | Replace | `CourseBand` | C | none | L | |
| 3.18 Type select | PB:197 | Replace | `BankFilters` | C | none | L | |
| 3.19 "Additional filters" disclosure with "· active" marker | PB:199 | Retire | none (its four filters are decided separately) | C | none | L | |
| 3.20 Exam year filter (`registry` exam year, else `q.year`; adds "2008") | PB:99, 200 | Replace | `BankFilters` year | B | A1 | M | `02` 4.1: bank filter has year. Builder takes the registry exam year first; the bank rule for years must be stated by the implementer (not in 02). |
| 3.21 Original source filter | PB:201 | Pending owner decision | bank filter row, Phase E or later (O4 recommendation) | E | O4 | L | |
| 3.22 Print status filter ("Reviewed print layout") | PB:202 | Replace | `BankFilters` "reviewed print layout only" | D (data-backed per 03), B (filter control per 02 4.1) | `useExportData.hasReviewedLayout` | M (R1) | `02` 4.1 lists it in the bank filters; `03` Phase D scope lists the label and filter. |
| 3.23 Practice history filter (previously attempted / missed) | PB:106, 203 | Pending owner decision | bank filter row, Phase E or later (O4 recommendation) | E | O4 | L | Dropped from the builder, not from the product, if O4 is accepted. |
| 3.24 "Clear filters" | PB:206 | Replace | `BankFilters` clear | B | none | L | |
| 3.25 "Auto-add count" input (1 to 50) and "Auto-add from matches" button | PB:207 to 208 | Pending owner decision | bank "Add all shown" (max 50), Phase E or later (O4 recommendation) | E | O4 | M (R10) | Adds the first n unselected matches. |
| 3.26 "n matches" count | PB:210 | Replace | bank result count | B | none | L | |
| 3.27 "Cancel replacement" | PB:210 | Pending owner decision | none (O4: Replace flow dropped) | C | O4 | M (R10) | |
| 3.28 Result row: type chip, number, exam, topic, display name | PB:218 to 219 | Replace | `QuestionList` row | B | none | L | |
| 3.29 "Verified answer" marker on a row | PB:219 | Pending owner decision | none stated in 02 | C | owner | L | Answer-key mode (3.55) remains. Listed in the closing list. |
| 3.30 "Export ready" / "Full source page fallback" chips | PB:220 | Replace | per-row print outcome from `planExport` | C (static label), D (per-entry plan) | O3 | H (R1) | `02` 3.3, D3. If O3 is declined, static "Reviewed print layout / Full source page" label (`02` 3.4). |
| 3.31 Reviewer note `content.review[id]` shown on a row | PB:221, 249 | Pending owner decision | none stated in 02 | C | owner | L | 1450 entries exist (01 A3). Listed in the closing list. |
| 3.32 Per-row "Preview" / "Close preview" toggle and source-page/region buttons ("Source page n · region m"), rendering the print regions via `renderSource` | PB:224 to 230 | Pending owner decision | none stated in 02 | C | owner | M (R1) | The bank pane shows the question and full page; the print-regions preview in the picker has no stated successor. Listed in the closing list. |
| 3.33 "Add to Worksheet" / "Added" / "Use replacement" button | PB:225 | Replace | bank row add toggle | B | A3 | M | |
| 3.34 Results pagination "Previous results / Next results", "Page x of y" (20 per page) | PB:211, 233 to 235 | Retire | bank pagination (row 2.37) | B | none | L | |
| 3.35 "Arrange worksheet →" | PB:236 | Retire | none (one screen) | C | none | L | |

### 3.3 Step 2 "Arrange worksheet" (becomes `Outline`)

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 3.36 Help text "Drag using the handle or use the move buttons…" | PB:240 | Adapt | `Outline` help text | C | none | L | |
| 3.37 "Undo last change" (single level; enabled only if `undo.id === draft.id`) | PB:241, 110 to 113 | Reuse | `useWorksheets.undo` | C | A3 | M (R3) | Covers add, move, replace, remove, break, lines, preset. Not undoable: format field edits, rename, new/duplicate/import. |
| 3.38 Empty message "No questions selected. Open Select to add questions." | PB:242 | Adapt | `Outline` empty state pointing to the bank | C | none | L | Wording refers to the removed step. |
| 3.39 Row label "n. type number · exam", "Missing catalog record" for unknown ids | PB:247 to 248 | Adapt | `Outline` row | C | none | M (R11) | Entry stays in the draft (`02` 5.2 item 6). Rows labelled "Not in the question bank" for review/legacy/user-bank. |
| 3.40 Row suffix " · Full source page fallback" (from `content.questions` only) | PB:247 | Replace | print outcome label from `planExport` ("Prints as a cropped question" / "Prints as its full source page" / "Printed with question N") | C (static), D (plan) | O3 | H (R1) | `02` 2 item 2: the old test was too simple. |
| 3.41 Drag handle (native HTML5 DnD; `aria-hidden`, `draggable`) and row drop target | PB:245 to 246 | Adapt | pointer drag as desktop enhancement only | C | none | M (R15) | No DnD library (`02` section 6 item 6). Handle is not keyboard reachable today. |
| 3.42 "Page break before" checkbox | PB:252 | Reuse | `Outline` expandable row | C | `setEntry` | L | `Entry.breakBefore`. |
| 3.43 "Response lines" number (FRQ only, 0 to 12, default `format.lines`) | PB:253 to 256 | Reuse | `Outline` expandable row | C | `setEntry` | L | |
| 3.44 Move up / Move down icon buttons (`aria-label` "Move item n up/down") | PB:257 to 258 | Reuse | `Outline` buttons at every width + `Alt`+arrows + live announcement | C | none | M (R15) | Under grouping a row moves only within its section (`02` 5.4). |
| 3.45 "Replace" button (goes to step 1 in replacement mode; clears `lines`) | PB:259, 122 to 127 | Pending owner decision | remove + add (O4 recommendation) | C | O4 | M (R10) | Notice "Question replaced." disappears with it. |
| 3.46 "Remove" button (destructive; notice "Question removed from worksheet.") | PB:260 | Reuse | `Outline` remove | C | `useWorksheets.remove` | L | Undoable. |
| 3.47 "Format document →" | PB:264 | Retire | none | C | none | L | |

### 3.4 Step 3 "Format document" (becomes `LayoutPanel`)

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 3.48 "Apply a preset" select (5 presets; also sets the type filter; undoable) | PB:268 to 272; `presets` WS:51 to 57 | Adapt | `LayoutPanel` preset select | C | `useWorksheets.applyPreset` | M (R10) | The type-filter side effect (PB:271) has no target once the in-builder picker is gone; see closing list. |
| 3.49 Title, Subtitle, Worksheet instructions | PB:274 to 276 | Reuse | `LayoutPanel` | C | `setFormat` | L | Max 100, 120, 320. |
| 3.50 Paper size, Orientation | PB:278 to 279 | Reuse | `LayoutPanel` | C | `setFormat` | L | |
| 3.51 Range sliders: Margins, Document text, Question spacing, FRQ response lines (with `<output>`) | PB:280 to 281 | Reuse | `LayoutPanel` | C | `setFormat` | L | |
| 3.52 Group by (Custom order / MCQ and FRQ / Topic) | PB:284 | Reuse | `LayoutPanel` | C | `setFormat` | L | `02` 5.3: "none"/"type" from the prototype, "topic" also offered. |
| 3.53 MCQ and FRQ section headings; MCQ and FRQ section instructions (only when grouping is "type") | PB:285 to 291 | Reuse | `LayoutPanel` | C | `setFormat` | L | |
| 3.54 Seven checkboxes: Name field, Date field, Class field, Page numbers, Worksheet numbering, Original source citations, AP reference tables; note "Original question labels… preserved inside the source image" | PB:292 to 294 | Reuse | `LayoutPanel` | C | `setFormat` | L | Prototype "Source lines" = `format.citations`. |
| 3.55 "Preview PDF →" | PB:295 | Retire | none | C | none | L | |

### 3.5 Step 4 "Preview and export"

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 3.56 "PDF contents" select (Questions only / Separate answer key / Questions and answer key; last two disabled without a verified answer) | PB:300 to 302, 149, 152 | Reuse | `ExportBar` | C | `useExportData` registry | M | |
| 3.57 "Download PDF" link (filename from title, " - answer key" suffix) and "Open PDF to print" link | PB:303 to 304 | Adapt | `ExportBar` | C | preview freshness (`02` 3.3) | H (R1) | Disabled while the preview is out of date or generating; must serve the bytes on screen. |
| 3.58 Caution "Full source pages can include adjacent questions or printed answers…" | PB:306 | Adapt | export summary counting full-page questions | D | O3 | H (R1) | `02` 3.3 item 4. |
| 3.59 "This worksheet has no verified answer key." | PB:307 | Reuse | `ExportBar` | C | none | L | Kept per `02` 5.4. |
| 3.60 "Add questions before exporting." | PB:308 | Adapt | `ExportBar` empty state | C | none | L | |
| 3.61 "Generating print-quality PDF…" status | PB:309 | Adapt | `PreviewPane` generating state | C | none | M | |
| 3.62 "PDF ready · n pages" status | PB:310 | Adapt | `PreviewPane` | C | none | L | |
| 3.63 `WorksheetPreview` | PB:311 | Reuse | `PreviewPane` | C | row 4.18 | M | |
| 3.64 Generation effect: runs only on step 3, 120 ms debounce, abort on change, main thread | PB:65 to 82 | Adapt | `PreviewPane` freshness state machine (out of date, ~600 ms auto-refresh on desktop, on demand on phones, keep last good on error, Retry) | C | `renderWorksheet` | H (R7, R1) | Fable reviews the state machine (`03` Phase C). |
| 3.65 Object URL effect for bytes | PB:84 to 89 | Reuse | `PreviewPane` | C | none | L | |
| 3.66 Reset to "questions" mode when no answers | PB:152 | Reuse | `ExportBar` | C | none | L | |
| 3.67 Notices: "Added n question(s).", "No eligible questions to add.", "Last worksheet change undone.", "Applied <preset>.", "Worksheet drafts imported.", limit messages | PB:115, 131, 174, 177, 241, 271 | Adapt | `AppShell` notice area / live region | C | none | L | `02` section 6: announce changes via `role="status"`. |

---

## 4. Services and logic

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 4.1 Catalog fetch of `/student-questions.json`, merge with user-bank questions | SA:236 to 237 | Reuse | `useCatalog` | A | A2 | M (R18) | On failure sets notice "Question catalog could not be loaded." (SA:237). |
| 4.2 Saved state read/write (`apchem-studio-v2`, legacy `apchem-studio-v1` migration) | SA:238 to 250 | Reuse | `useCatalog` (overrides, banks, user questions); progress stays in `ChemAtlas` | A | A2 | M (R18) | Not named in 02 beyond "keeps user topic overrides and user-bank questions working". |
| 4.3 `topics` memo | SA:282 | Reuse | `useCatalog` | A | A2 | L | |
| 4.4 `questions` memo (override-aware `displayTopic`, `relatedTopics`, `displayName`, status) | SA:283 to 287 | Reuse | `useCatalog` | A | A2 | M (R13, R18) | Unit derived from topic id; `primaryUnit` never read. |
| 4.5 `available` and per-unit/topic counts | SA:316, 452, 465 | Adapt | `useCatalog` counts | A | A2 | M (R12) | Any-related rule; unit count = distinct questions. |
| 4.6 `filteredQuestions` predicate | SA:320 to 326 | Adapt | `filterQuestions` in `lib/question-filter.ts` | A | A1 | M | Copy 1 of 2 (bank). Status gate is `includeReview=false` constant (SA:199). |
| 4.7 `candidates` predicate | PB:96 to 108 | Adapt | `filterQuestions` composed with the builder's extra filters | A | A1 | M | Copy 2 of 2 (builder). No status filter (all 1564). |
| 4.8 `startSession` pool predicate | SA:341 to 352 | Pending owner decision | legacy view in new shell | A/B | O4 | L | A third inline copy of the any-related rule that `02` does not list as a copy. Randomised (`Math.random`). |
| 4.9 URL state: `parseChemAtlasLocation`, `buildChemAtlasUrl` | NAV:11 to 78 | Adapt | add `year`, `ready`; map old `desk`/`unit`/`library`/`detail` URLs | B | `tests/navigation.test.mjs` updated | H (R5) | Extra-review file. |
| 4.10 `navigate()` and `updateFilters()` (history push/replace, `chematlas:navigate` event; full page load from `/practice-builder`) | SA:210 to 234 | Adapt | `AppShell` and `ChemAtlas` | A (spike), B | A7 spike (R9) | M (R8, R9) | |
| 4.11 `PdfQuestionPage` | SA:77 to 134 | Reuse | `components/student/pdf-question-page.tsx` | A | O1 (A4) | M (R16) | Moved unchanged first; viewer improvements ported in a separate commit. |
| 4.12 IndexedDB helpers `openDb`, `savePdf`, `readPdf` (db `apchem-practice-bank`, store `pdfs`) | SA:49 to 76 | Reuse | moves with `PdfQuestionPage` (needed by `banks` view) | A | A4 | M (R18) | |
| 4.13 `openWorksheetPdf` (new pdf.js document per call, no cache) | SA:184 to 190 | Reuse | `PracticeBuilder` prop / `useExportData` neighbour | C | none | M | `eba3977` adds a shared cache (section 7). |
| 4.14 Worksheet storage load, zod validation, legacy id-array migration | SA:153 to 176 | Reuse | `useWorksheets` | A | A3 | H (R3) | Same key `chematlas-worksheets-v1`; legacy key `chematlas-student-worksheet-v1` keeps migrating. |
| 4.15 `saveWorksheets` (localStorage write; failure notice) | SA:177 to 181 | Adapt | `useWorksheets` (adds `memory-only` status, `storage` event, recovery key `chematlas-worksheets-v1.recovery`) | A | A3 | H (R3) | These three additions are the only new behaviour (handoff A3). |
| 4.16 Draft mutations and single-level undo in the builder (`update`, `open`, `add`, `move`, `changeFormat`) | PB:110 to 142, 39 | Reuse | `useWorksheets` | A | A3; `lib/worksheet.ts` helpers | H (R3) | Hook adds no rules of its own. |
| 4.17 `lib/worksheet.ts` helpers: `addEntries`, `newDraft`, `newWorksheetId`, `defaultFormat`, `presets`, schemas, `worksheetSource`, `steps` | WS:5 to 80 | Keep as is | unchanged; `steps` becomes unused | A | none | H (R3) | Extra-review file. `worksheetSource` is used only by the old step-1 preview (01 B4). |
| 4.18 `WorksheetPreview` (page nav, zoom 0.5 to 2, Fit width, Fit page, `ResizeObserver`, `onCount`) | WP:19 to 72 | Reuse | inside `PreviewPane` | C | none | L | Change only if page jump or sizing needs it (`03` Phase C files). |
| 4.19 `renderWorksheet` (300 dpi canvas, abortable) | `lib/worksheet-render.ts:6-39` | Keep as is | called by `PreviewPane` | C | none | M (R7) | |
| 4.20 `composeWorksheet` | WPDF:22 to 306 | Keep as is | unchanged output | D | O3 | H (R4) | Extra-review file. |
| 4.21 `planExport` (to be extracted from the `useFallback` computation, WPDF:33 to 54) | WPDF:33 to 54 (does not exist yet) | Adapt | new exported pure function; `composeWorksheet` calls it | D | O3 | H (R4, R1) | Move lines unchanged; the plan reports `typeset`, `source-page`, `see-earlier`, `missing` (`02` 3.4). Optional `firstPage` from the drawing loop (WPDF:247 to 266) can wait. |
| 4.22 `orderedEntries` | WPDF:13 to 20 | Keep as is | used by `planExport` order walk | D | none | M | |
| 4.23 `lib/worksheet-content.ts` types | `lib/worksheet-content.ts:9-13` | Keep as is | `useExportData` types | A | none | L | |
| 4.24 Lazy fetch of `worksheet-content.json` and `worksheet-sources.json` | PB:49 to 63 | Reuse | `useExportData` | A | A5 | M | Content failure sets the error text (PB:60). Registry failure falls back silently to an empty registry (PB:57); see closing list. |
| 4.25 `planWorksheet` | `lib/worksheet.mjs:2-38` | Keep as is | legacy session worksheet and fallback path | n/a | `tests/worksheet.test.mjs` | L | |
| 4.26 `lib/question-source.ts` helpers (`sourcePageLocation`, `originalSourcePages`, `sourceBounds`, `renderSourceCanvas`) | `lib/question-source.ts:3-37` | Keep as is | used by `PdfQuestionPage` and `renderWorksheet` | n/a | none | L | |
| 4.27 Progress storage and transfer (`apchem-studio-v2` progress, `lib/progress-transfer.mjs`) | SA:147, 250, 252 to 280 | Keep as is | legacy view in new shell | n/a | O4 | L | |
| 4.28 User PDF banks (IndexedDB `importPdf`, `addSourceQuestion`) | SA:368 to 384 | Keep as is | legacy view in new shell | n/a | O4; row 4.12 | M (R18) | |
| 4.29 Topic overrides (`updateClassification`, `addReviewItem`) | SA:385 to 386 | Keep as is | `useCatalog` | A | A2 | M (R18) | See closing list for the empty-string override. |
| 4.30 `partsForTopic`, `originalPagesFor`, `pagesFor`, `sourceAssetFor`, `bankName` | SA:388 to 393 | Reuse | `QuestionPane` and `PdfQuestionPage` callers | B | none | L | |
| 4.31 `printWorksheet` (browser print guard on `.pdf-error`/`.pdf-wait`) | SA:394 to 403 | Keep as is | legacy session worksheet | n/a | O4 | L | |

---

## 5. Styling and assets

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 5.1 `app/globals.css` (173 lines; shell, nav, cards, catalog, detail, practice, worksheet, review, print, `.qiv-*` review dashboard) | `app/globals.css:1-173`; print `:110-116` | Keep as is | unchanged | all | none | M (R6) | Shared with the private review dashboard (`app/layout.tsx`). Add nothing global, remove nothing (`02` 8.1). |
| 5.2 `app/student-workspace.css` (563 lines; student tokens, bank rows, directory cards, unit menu, worksheet form controls; reduced-motion rules at L497 to 500) | `app/student-workspace.css` | Adapt | remove dead rules after views are replaced; new rules added for new components | B (remove), C, E | views replaced | M (R6) | Free-to-change file (`02` 8.1). Dead-rule removal listed in `03` Phase B and E. |
| 5.3 New token stylesheet `app/student-tokens.css` (tokens and nine `[data-u]` unit colours, scoped under the shell class; no `--doc` token) | not yet created | Replace | new file | A | A6 | M (R6, R14) | Loaded but unused in Phase A. |
| 5.4 `components/ui/atlas-controls.tsx`: `AtlasButton` | `components/ui/atlas-controls.tsx:10` | Keep as is | used by `PracticeBuilder`, `WorksheetPreview` | C | none | L | `02` 4.2: stays. |
| 5.5 `DirectoryCard`, `UnitDirectoryCard` | `components/ui/atlas-controls.tsx:14, 28` | Retire | none (when last user is gone) | B | SA:452, 464 removed | L | |
| 5.6 `FilterChip` (exported, unused) | `components/ui/atlas-controls.tsx:44` | Pending owner decision | none stated in 02 | B/E | owner | L | Not named in 02. Listed in the closing list. |
| 5.7 Icons: `lucide-react` (SA:5, PB:10, WP:5) | those lines | Keep as is | same library | all | none | L | No new dependency. |
| 5.8 Brand mark text `C✦` | SA:409 | Adapt | `AppShell` brand | B | none | L | |
| 5.9 Fonts: none self-hosted; Arial/Helvetica stack, Georgia for brand | `app/globals.css:3` | Replace | Bricolage Grotesque and Atkinson Hyperlegible Next, variable woff2, `font-display: swap`, system fallback | A (load), B (use) | licence files included (handoff A6) | L (R20) | STIX Two Text dropped (`02` section 2). |
| 5.10 Print CSS for the session worksheet | `app/globals.css:110-116, 173` | Keep as is | legacy session worksheet | n/a | none | L | |
| 5.11 Motion: CSS transitions with reduced-motion overrides | `app/student-workspace.css:497-500` | Adapt | all new transitions disabled under `prefers-reduced-motion` | E | none | L | `02` section 6 item 10. |
| 5.12 Static assets: `classification-method.md`, `student-page-audit.json` links | `public/` | Keep as is | link targets of rows 2.4, 2.53 | n/a | none | L | `public/` is do-not-touch. |

---

## 6. Tests and release tooling

Phase A acceptance requires the smoke script to pass unmodified. Phases B and C change it in the same PR as the markup, keeping every category of assertion (R5, `03` Phase B and C). "Replaced by" names proposals only; test IDs are defined in `05-test-and-acceptance-plan.md`.

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 6.1 Smoke: JS and CSS bundles referenced by `/` exist | `scripts/release/smoke.cjs:52-54` | Keep as is | unchanged | all | none | L | |
| 6.2 Smoke: each listed path, every source PDF and bundle return 200 with valid JWT, 403 without or wrong audience, `cache-control: private, no-store` | `scripts/release/smoke.cjs:55-66` | Keep as is | unchanged | all | none | H (R19) | Protected system (worker, access). |
| 6.3 Smoke: `/student-version.json` equals the build version | `scripts/release/smoke.cjs:67` | Keep as is | unchanged | all | none | L | |
| 6.4 Smoke: `/admin/question-review`, `/api/admin/question-review`, `…/backup`, `…/backup/import` return 404 for GET (with and without JWT) and POST | `scripts/release/smoke.cjs:68-78` | Keep as is | unchanged | all | none | H (R19) | |
| 6.5 Smoke: no `pageerror` at 1440x900 and 390x844 | `scripts/release/smoke.cjs:83-86, 102` | Keep as is | unchanged | all | none | M (R5) | New headless checks add 768. |
| 6.6 Smoke: heading "Browse by unit" on `/` | `scripts/release/smoke.cjs:91` | Replace | assert the Question Bank heading (or the first control of `CourseBand`) on `/` | B | new markup | H (R5) | Same category: home loads. Unchanged in Phase A. |
| 6.7 Smoke: button named "Unit 1 … Atomic Structure and Properties" clicks, then heading "Atomic Structure and Properties" | `scripts/release/smoke.cjs:92-93` | Replace | click the Unit 1 toggle in `CourseBand`, assert its name or topic chips appear | B | new markup | H (R5) | Same category: unit selection. |
| 6.8 Smoke: `/?view=library` shows `.catalog-row` | `scripts/release/smoke.cjs:94-95` | Replace | assert a list row exists for the old URL and the new URL | B | NAV mapping | H (R5) | Same category: list renders; also exercises old-URL mapping. |
| 6.9 Smoke: `/?view=detail&question=mcq-2008-1-29` draws a canvas with `style.width` and `width > 200` | `scripts/release/smoke.cjs:96-98` | Keep as is | assertion unchanged (the pane must still draw this question) | B | `PdfQuestionPage` | H (R5) | Selector `canvas` must stay valid. |
| 6.10 Smoke: `/practice-builder` heading exactly "Practice Builder" | `scripts/release/smoke.cjs:99-100` | Keep as is | unchanged unless heading text changes | C | none | M (R5) | |
| 6.11 Smoke: text exactly "0 selected" | `scripts/release/smoke.cjs:101` | Keep as is | unchanged unless count text changes | C | none | M (R5) | |
| 6.12 `tests/navigation.test.mjs` | `tests/navigation.test.mjs` | Adapt | extend for new params and old-URL mapping | B | NAV | H (R5) | URL contract; extra review. |
| 6.13 `tests/stage3-worksheet.test.mjs` | `tests/stage3-worksheet.test.mjs` | Adapt | add `planExport` cases; existing assertions unchanged and passing | D | O3 | H (R4) | Calls `composeWorksheet(draft, catalog, registry, mode, content, loadFragments, render)`; signature must not change. |
| 6.14 `tests/worksheet.test.mjs` (`planWorksheet`) | `tests/worksheet.test.mjs` | Keep as is | unchanged | all | none | L | |
| 6.15 `tests/progress-transfer.test.mjs` | `tests/progress-transfer.test.mjs` | Keep as is | unchanged | all | none | L | |
| 6.16 `tests/public-catalog-integrity.test.mjs`, `tests/stage3-catalog.test.mjs` | those files | Keep as is | unchanged | all | `public/` not edited | L | |
| 6.17 `tests/student-access.test.mjs` | `tests/student-access.test.mjs` | Keep as is | unchanged | all | none | H (R19) | Protected system. |
| 6.18 Review tests (`question-image-review.integration`, `question-review-storage`, `question-review-backup`) | `tests/` | Keep as is | unchanged | all | none | H (R19) | Do not touch. |
| 6.19 Python tests `tests/test_*.py` (7) | `tests/` | Keep as is | unchanged | all | none | L | |
| 6.20 `pnpm run check:private` (`scripts/assert-student-private-config.mjs`) | `scripts/assert-student-private-config.mjs` | Keep as is | run in every phase, source and `--built` | all | none | H (R19) | Do not edit. |
| 6.21 CI workflows (`.github/workflows/*`) | `.github/` | Keep as is | unchanged | all | none | M | Do not touch. `pnpm run lint` is not run by any workflow (01 D4). |
| 6.22 Prototype `design-previews/v2/check.mjs` | `design-previews/v2/check.mjs` | Adapt | basis for the headless checks in `05` | B to E | none | L | Prototype only. |

---

## 7. Branch `fix/local-workers-runtime`

Everything in this section is **Pending owner decision O1**. Architect's recommendation (`02` 4.5, `PROGRESS.md` O1 option A): keep the branch untouched; port only the viewer improvements from `eba3977` into the extracted `PdfQuestionPage` during Phase A (task A4, separate commit, original commit credited); the redesign's `QuestionPane` replaces that commit's detail layout; `b5ceab5` stays off the redesign branch and, if wanted, gets its own security review. Facts from `01-existing-system.md` section E. Nothing was run or merged.

| Existing item | Where | Decision | Target | Phase | Dependencies | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 7.1 `b5ceab5` dev-mode skip of the Access check (`import.meta.env.DEV ? { ok: true } : await authenticateStudentRequest(...)`) | `worker/index.ts` on `b5ceab5` | Pending owner decision (O1) | none on this branch | n/a | O1 | H (R2) | Recommendation: not adopted. Authentication bypass in source; folding of `import.meta.env.DEV` in the build is unverified. Needs its own review with a build-output check and an unauthenticated-request test. `worker/**` is do-not-touch. |
| 7.2 `b5ceab5` dependency bumps (`@cloudflare/vite-plugin` 1.37.1 to 1.67.0, `wrangler` 4.140.0 to 4.158.0, lockfile) | `package.json`, `pnpm-lock.yaml` on `b5ceab5` | Pending owner decision (O1) | none | n/a | O1 | M (R17) | Recommendation: left. No dependency changes on the redesign branch. |
| 7.3 `b5ceab5` `vite.config.ts` (`localWorkerdDate()`, serve-only config, `server.watch.ignored`) | `vite.config.ts` on `b5ceab5` | Pending owner decision (O1) | none; `vite.ui.config.ts` covers local UI work (O6) | A | O1, O6 | M (R17) | Recommendation: left. |
| 7.4 `eba3977` viewer zoom controls (zoom in/out, Fit width, Fit page, Actual size, Reset) | `components/student-app.tsx` on `eba3977` (L78, toolbar) | Pending owner decision (O1) | `PdfQuestionPage` / `QuestionPane` toolbar | A (A4) | O1 | M (R16) | Recommendation: adopted (viewer). Toolbar semantics: `role="toolbar"`, `aria-pressed`. |
| 7.5 `eba3977` fullscreen toggle (`requestFullscreen`, notice "Fullscreen is not available in this browser.") | same, L309 to 330 | Pending owner decision (O1) | viewer | A (A4) | O1 | M | Recommendation: adopted. |
| 7.6 `eba3977` ref-counted shared PDF cache (`acquirePdf`/`releasePdf`, three idle documents kept) | same, L86 to 107 | Pending owner decision (O1) | `PdfQuestionPage` | A (A4) | O1 | M (R8) | Recommendation: adopted. Today every mount opens its own document (01 B1). |
| 7.7 `eba3977` 16-megapixel render cap with device-resolution rendering | same, `PdfQuestionPage` | Pending owner decision (O1) | `PdfQuestionPage` | A (A4) | O1 | M | Recommendation: adopted. |
| 7.8 `eba3977` refit on resize (`ResizeObserver` on `[data-pdf-viewport]`), stale render cancel, hidden canvas until drawn | same | Pending owner decision (O1) | `PdfQuestionPage` | A (A4) | O1 | M | Recommendation: adopted. These fixes are listed as behaviour a redesign must not lose (01 E2). |
| 7.9 `eba3977` `focusText` scroll to first line and phone zoom default 0.9, ink-bounds trimming | same, L108 to 119 | Pending owner decision (O1) | `PdfQuestionPage` | A (A4) | O1 | M | Recommendation: adopted with the viewer; not named separately in 02. |
| 7.10 `eba3977` `zoom === undefined` keeps old fit-to-width for the session worksheet and builder | same | Pending owner decision (O1) | `PdfQuestionPage` callers in legacy worksheet | A (A4) | O1 | L | Recommendation: preserve. |
| 7.11 `eba3977` "Loading question…" state instead of a false "Question not found" | same, L759 to 760 | Pending owner decision (O1) | `QuestionPane` loading state | B | O1 | L | Recommendation: behaviour adopted; layout superseded. |
| 7.12 `eba3977` two-column detail layout (header, source viewer, classification sidebar, Hide/Show classification, metadata `<dl>`, Previous/Next with `aria-live`) | same, L652 to 758; `app/globals.css` +119 lines | Pending owner decision (O1) | superseded by `QuestionPane` | B | O1 | M (R16) | Recommendation: superseded, not discarded. `app/globals.css` is not edited by the redesign. |
| 7.13 `eba3977` `verifiedCropReviews`, `cropIsVerified`, `stimulusIsVerified` and default "Question crop only when verified" | same, L80 to 85; reads `research/crop-visual-review.json` | Pending owner decision (O1) | none until the data source is explained | A | O1; unresolved fact in `PROGRESS.md` | H (R1) | Recommendation: not adopted yet (`02` 4.5; handoff A4). Default to existing behaviour; do not call any crop "verified". |
| 7.14 `eba3977` "Add to worksheet" handler `addToWorksheet(q)` and `segmentSource` helper | same, L516 to 526 | Pending owner decision (O1) | superseded by `useWorksheets.add` | A/B | O1 | L | Recommendation: superseded. |
| 7.15 `eba3977` image-mode group (Approved image never, Question crop, Full page) | same | Pending owner decision (O1) | `QuestionPane` Question / Full page | B | O1 | M | Recommendation: superseded (see row 2.47). |

---

## Items with no decision in 02

Stated factually. Each is a Pending owner decision in the matrix; no choice is made here.

1. Desk metric tiles (question records, curriculum topics, total MCQs, total FRQs) at `components/student-app.tsx:445-450`.
2. Footnote links to `/classification-method.md` and `/student-page-audit.json` (`components/student-app.tsx:453`, also `:567`).
3. Topic definition panel (topic description and learning objectives from `catalog.topicDetails`) at `components/student-app.tsx:481`, and the "Curriculum source" note at `:514`.
4. Footer text at `components/student-app.tsx:573`.
5. Hard-coded profile badge "J" at `components/student-app.tsx:431`.
6. Mobile hamburger menu toggle at `components/student-app.tsx:408`; `02` section 6 specifies phone navigation for units, topics, question view and builder, not the header.
7. Desktop Previous/Next question navigation in the detail view (`components/student-app.tsx:521`, `detailSequence` at `:331`); `02` specifies previous/next only for the phone question view.
8. In the builder picker: the per-row print-region Preview with its page and region buttons (`components/practice-builder.tsx:224-230`), the reviewer note `content.review[id]` (`:221`, `:249`; 1450 entries per `01`), and the "Verified answer" marker (`:219`).
9. The builder status line "Drafts autosave in this browser…" (`components/practice-builder.tsx:186`).
10. Applying a preset also sets the builder's type filter (`components/practice-builder.tsx:271`); the filter state disappears with the in-builder picker.
11. `FilterChip` exported but unused (`components/ui/atlas-controls.tsx:44`).
12. A third inline copy of the any-related unit/topic/type rule in `startSession` (`components/student-app.tsx:341-352`); `02` names two copies.
13. The registry (`worksheet-sources.json`) fetch failure falls back silently to an empty registry (`components/practice-builder.tsx:56-58`); `02` section 3.3 specifies blocking with a retry for catalog and content JSON, and says nothing about the registry. Handoff A5 says loading failures must surface as an error state.
14. Topic override select in the review view: choosing the empty option calls `addReviewItem`, which stores `""` in `overrides` (`components/student-app.tsx:386`, `:569`), while the `questions` memo uses `overrides[q.id] ?? q.primaryTopic` (`:284`), which keeps `""` as the topic. Observed from reading only; not run.
15. The hard-coded fallback URL `/ap-chemistry-mega.pdf` (`components/student-app.tsx:89`, `:189`; `lib/question-source.ts:15`), for which no file exists in `public/` (`01` A1).
16. Removal of the dead "Approved image" tab and `approvedImages` constant (`components/student-app.tsx:146`, `:526`): `02` 3.1 says the student UI must not claim approval, but does not say to delete the code.
17. The `/practice-builder` route's `worksheet` prop and its full-page-load `navigate()` (`components/student-app.tsx:211`) beyond the client-navigation spike in `02` 5.5.
