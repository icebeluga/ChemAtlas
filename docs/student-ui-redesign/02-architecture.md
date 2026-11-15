# ChemAtlas student UI redesign: target architecture

Decisions for integrating the approved Question Bank and Practice Builder into the existing app. Facts about today's code come from `01-existing-system.md` (source-grounded, as of `4f965e3`); this file cites it rather than repeating it. Statements marked **Assumption** were not verified and are listed again in section 9.

## 1. Guiding decisions in one page

| # | Decision | Why |
|---|---|---|
| D1 | **The Practice Builder preview is the real PDF**, produced by the existing `renderWorksheet` → `composeWorksheet` and shown by the existing `WorksheetPreview`. The HTML "paper" from the prototype is not built. | The export pipeline has rules an HTML preview cannot reproduce (section 3). The authoritative preview already exists and works. |
| D2 | **One worksheet state: the existing `Backup` in `localStorage["chematlas-worksheets-v1"]`**, validated by the existing zod schema, mutated only through `lib/worksheet.ts`. Both screens use it through one new hook. No new key, no schema change, no migration. | Everything the prototype needs already has a field in `Draft`/`Format`. A second store would be a competing system. |
| D3 | **Print readiness is asked of the composer, never re-derived in the UI.** | Whether a question exports cropped or as a full page depends on the other questions in the worksheet, not only on the question. |
| D4 | **Strangler migration inside `components/student-app.tsx`**: extract services first with no visible change, then replace view branches one at a time. No rewrite, no new framework, no new dependencies. | The app is one 578-line component with working logic and a release smoke test that pins its output. |
| D5 | **One question viewer**: `PdfQuestionPage`, moved to its own file. The prototype's canvas code is discarded. | Avoids a competing renderer; the existing one handles user banks, highlights and range loading. |
| D6 | **Filtering stays "any related topic"**, in one shared pure function. Unit is always derived from the topic id. | That is today's rule in both screens; `primaryUnit` is stale in 569 of 735 classified records. |
| D7 | **Phones get different navigation, not a shrunken desktop**: all nine units visible without scrolling, topics in a sheet, the question as its own history entry. | Addresses the Session 1 mobile concerns (section 6). |

## 2. What the prototype got wrong for production

These are corrections to `design-previews/v2`, found by reading the real code:

1. **Its paper preview could mislead.** It showed a crop while saying the PDF would use the full page. Fixed by D1.
2. **Its "print-ready" flag was too simple.** It tested only "has an entry in `worksheet-content.json`". The composer also falls back when a question shares a page with a fallback question, or is stimulus-linked without a context. Fixed by D3.
3. **It kept its own worksheet list** and ignored drafts, format, per-entry breaks and response lines, presets, undo, import/export. Fixed by D2.
4. **It used STIX Two Text for the page.** With a real PDF preview there is no HTML page to typeset, so STIX is dropped. Two families remain.
5. **Its list used `role="listbox"` with buttons inside options**, which is invalid. Section 6 replaces it.
6. **Its phone layout relied on sideways scrolling** for units and topics. Section 6 replaces it.

## 3. Question rendering and PDF fidelity

### 3.1 Three concepts that must stay separate

| Concept | Source of truth today | Who may read it | UI wording |
|---|---|---|---|
| **Browsable** | `status === "classified"` and a `primaryTopic` in `public/student-questions.json` (735 of 1,564) | Question Bank filter | Not labelled; it is simply what the bank lists |
| **Image approved** | The private review system (D1/R2, `app/api/admin/question-review/**`). **Not available to the student bundle at all**; `approvedImages` is an empty constant | Nothing in the student app | Not shown. The student UI must not claim an image is "approved" or "verified" |
| **Has a reviewed print layout** | An entry in `public/worksheet-content.json` `questions` (201 total, 83 of them classified) | Bank filter and labels | "Reviewed print layout" |
| **How it will print in this worksheet** | Only the composer knows (section 3.3) | Practice Builder | "Prints as a cropped question" / "Prints as its full source page" / "Printed with question N" |

The redesign changes none of these data sources and writes to none of them.

### 3.2 Approach comparison

| Criterion | A. HTML preview | B. PDF preview only | **C. Hybrid (chosen)** |
|---|---|---|---|
| Accuracy | Approximate by nature | Exact | Exact where it claims to be |
| Performance | Fast | Regenerates on every edit, main thread | Editing is instant; PDF regenerates on demand or when idle |
| Complexity | New layout engine to keep in step with pdf-lib | Low | Low: both halves exist |
| Reuse | None | Full | Full |
| Mobile | Good | Poor for editing | Good: edit in outline, check in preview tab |
| Maintainability | Two renderers drift | One | One renderer, one list |
| Incomplete crops | Would show crops that never print | Correct | Correct |
| Shared stimuli, fallback | Must re-implement dedupe and page-sharing rules | Correct | Correct |
| Pagination, spacing | Cannot match scale-down and 0.92 fit rule | Exact | Exact |
| Extensibility | Poor | Good | Good |

**Chosen: C.** The outline (HTML) is where the worksheet is organised; the preview pane shows pages generated by the production pipeline. The outline never draws question content, so it cannot disagree with the export.

### 3.3 Required decisions

| Question | Decision |
|---|---|
| Authoritative layout source | `composeWorksheet` in `lib/worksheet-pdf.ts`, fed by the active `Draft`, `worksheet-content.json`, `worksheet-sources.json` and `worksheet-fragments.pdf`. Unchanged. |
| How image approval affects export | It does not, today: approved PNGs never reach the student bundle. Export depends only on reviewed layout data. This stays true until the owner decides otherwise (open decision O2). |
| How fallback pages are represented | In the preview: as the real full page, with the composer's own caption ("Full source page. May contain adjacent questions or printed answers."). In the outline: a text label per row from the export plan (3.4). Never as a crop. |
| Shared material | Left to the composer (context printed once, with the first question that carries it). The outline shows "Printed with question N" on later rows. The Question Bank pane shows the shared block above the question using the same `contexts` data, labelled as shared. |
| Preview freshness | The preview carries the draft revision it was built from. Any edit marks it **out of date** at once: pages stay visible but dimmed under an "Out of date" banner with **Update preview**. On desktop it also regenerates automatically about 600 ms after the last edit, cancelling any run in flight (the existing `AbortSignal`). On phones it regenerates only when the Preview tab is opened or the button is pressed. |
| Approximate or authoritative | Authoritative. The download button serves the same bytes that are on screen, and is disabled while the preview is out of date or generating. |
| Failures | Generation errors keep the last good preview (dimmed), show the composer's message and a Retry button, and disable download. A source PDF that fails to load names the file. Catalog or content JSON failing to load blocks the builder with a retry, not an empty worksheet. |
| Not misleading the student | (1) No question content is drawn anywhere but the real viewer and the real PDF. (2) The bank says "Reviewed print layout" only as a fact about data. (3) The builder states the print outcome per row from the plan. (4) The export summary counts full-page questions before download. |

### 3.4 The one change proposed to the PDF library (needs approval, O3)

The outline needs to know, per entry, what the composer did. Proposed: `composeWorksheet` additionally **reports** a plan, with no change to what it draws.

```ts
type EntryOutcome = { id: string; mode: "typeset" | "source-page" | "see-earlier" | "missing"; firstPage: number; sharedWith?: string };
// returned alongside the bytes, or delivered through an optional callback
```

**Verified feasible.** `composeWorksheet` decides the mode of every entry *before* it draws anything: `lib/worksheet-pdf.ts` L33–54 builds a `useFallback` set (no reviewed blocks, or stimulus-linked without a context, L37) and then spreads fallback to every question sharing a fallback page until nothing changes (L45–49). Drawing starts later and only reads that set (L247–266). So the proposal is in two small parts:

1. **Extract L33–54 unchanged into an exported pure function**, `planExport(draft, catalog, registry, content)`, and have `composeWorksheet` call it. The outline can then show each row's outcome instantly and synchronously, without generating a PDF. `"see-earlier"` and `sharedWith` come from the same ordered walk the drawing loop does (L247–266).
2. **Optionally report `firstPage` per entry** from the drawing loop, so an outline row can jump the preview to its page. This part needs a generated PDF and can wait.

Both are behaviour-neutral for the PDF and are covered by extending `tests/stage3-worksheet.test.mjs` (same bytes before and after for a fixed draft, plus plan assertions). If the owner declines O3, the outline falls back to the static "Reviewed print layout / Full source page" label with a standing note that the preview is the final word, and makes no per-row claim.

## 4. Question Bank

### 4.1 Structure

```
AppShell (top bar: Question bank | Practice builder (n) | More)
└─ QuestionBank
   ├─ CourseBand          9 unit toggles + heat strips; topic chips for the open unit
   ├─ BankFilters         type, year, reviewed-layout only, search (URL-backed)
   ├─ QuestionList        rows; selection; add/remove toggle
   ├─ QuestionPane        header, Question | Full page, status, PdfQuestionPage, topics, parts
   └─ WorksheetStrip      active draft's entries as numbered tiles; link to the builder
```

### 4.2 Reuse, adapt, replace, create

| Piece | Decision | Notes |
|---|---|---|
| Catalog fetch and derived `questions`/`topics` memos (`student-app.tsx` L239–287) | **Reuse**, lift into `useCatalog()` | Keeps user topic overrides and user-bank questions working |
| Filter predicate (`filteredQuestions` L320–326; builder `candidates`) | **Adapt** into one pure `filterQuestions()` | Adds year and reviewed-layout, which the builder already has |
| URL state (`app/navigation.mjs`) | **Adapt** | Add `year`, `ready`; old `view=desk|unit|library|detail` URLs resolve to the bank with the same unit, topic and question |
| `PdfQuestionPage` (L77–134) | **Reuse**, move to its own file | See 4.5 for the improved version on `fix/local-workers-runtime` |
| `partsForTopic`, "Primary topic / Also filed under" copy | **Reuse** | Already explains cross-topic matches |
| Home (`desk`), unit page (`unit`), bank (`library`), detail (`detail`) view branches | **Replace** with `QuestionBank` | Four screens become one |
| `DirectoryCard`, `UnitDirectoryCard` | **Retire** when the last user is gone | `AtlasButton` stays |
| `CourseBand`, `QuestionList`, `QuestionPane`, `WorksheetStrip`, `AppShell` | **Create** | From the approved prototype's markup and CSS, on real data |
| Search | **Reuse** the existing substring match | No search engine. Fields: year, exam, number, preview text, topic name; add topic code |

### 4.3 Cross-topic and cross-unit questions

Verified: 366 of 735 classified questions have more than one related topic; 210 span more than one unit. Both existing screens match a unit or topic against **any** related topic. Keep that rule and document it in the UI:

- **Counts**: a topic chip's count equals the list length when that topic is chosen. A unit's count is the number of distinct questions with any topic in that unit. Unit counts therefore add up to more than 735; "All" shows 735. This is stated once, in the band's help text.
- **Why is this here**: when a topic is selected and it is not the question's primary topic, the row shows a small "Primary: 4.7" marker, and the pane shows "Primary topic" and "Also filed under" chips with the selected topic emphasised. For free-response questions the existing per-part table shows which parts test the selected topic, and the existing yellow highlights mark them on the page.
- **Unit colour** of a row follows the topic the row is listed under (the selected topic, else the primary).
- **Unit of a topic** is computed from the topic id. `primaryUnit` is never read.
- The taxonomy is not changed.

### 4.4 Keyboard

`↑`/`↓` or `J`/`K` move the selection, `A` toggles the selected question on the active worksheet, `F` toggles Full page, `/` focuses search, `Esc` leaves a field or the phone question view. Shortcuts are ignored while a field has focus or a modifier key is held. They are an enhancement: every action also has a visible control reachable with Tab.

### 4.5 The viewer and `fix/local-workers-runtime`

Commit `eba3977` on that branch rewrites the detail view and substantially improves `PdfQuestionPage`: zoom, fit width, fit page, 1:1, fullscreen, a ref-counted PDF cache, a 16-megapixel render cap, refit on resize, a loading state instead of a "not found" flash, hiding of stale canvases, shared-stimulus stacking, and a default of crop-only-when-verified.

**Recommendation (owner decision O1):** take the *viewer* from `eba3977` as the starting point for the extracted `PdfQuestionPage`, by cherry-picking or porting it onto the redesign branch with its author's agreement; let the redesign's `QuestionPane` replace that commit's two-column detail *layout*. Nothing on that branch is discarded: it stays as it is, and what is not adopted is listed in the migration matrix.

Its `verifiedCropReviews` data has no source on `main` (section 9). Until that is explained, the pane defaults to the Question view and offers Full page, without calling anything "verified".

## 5. Practice Builder and worksheet state

### 5.1 State owner

```
localStorage["chematlas-worksheets-v1"]  ── Backup { version: 1, active, drafts[≤100] }
        ▲ zod backupSchema (lib/worksheet.ts)        Draft { id, name, format, entries[≤500] }
        │                                            Entry { id, breakBefore, lines? }
   useWorksheets()   ← the only reader and writer in the UI
        ├── Question Bank: WorksheetStrip, row toggles, pane button
        └── Practice Builder: outline, layout panel, preview, export
```

`useWorksheets()` is new and thin. It lifts the load, validate, legacy-migrate and save code that is in `student-app.tsx` today, and returns:

```ts
{ backup, draft,                       // validated Backup and the active Draft
  has(id), add(ids), remove(id), move(from, to), replace(oldId, newId),
  setEntry(id, patch), setFormat(patch), rename(name), applyPreset(i),
  newDraft(), duplicate(), setActive(id), importDrafts(file), exportDrafts(),
  undo(), canUndo, status }            // status: "ready" | "memory-only" | "recovered"
```

Every mutation goes through the existing pure helpers in `lib/worksheet.ts` (`addEntries`, `newDraft`, `newWorksheetId`, defaults, presets). The hook adds no rules of its own.

### 5.2 Answers to the required points

1. **Owner**: the hook over the existing `Backup`. Components hold no copy of entries.
2. **Persistence**: unchanged key and schema. The legacy id-array key keeps migrating as today.
3. **Contracts**: the types above; `Draft`, `Entry`, `Format` as defined in `lib/worksheet.ts`.
4. **Both screens**: call the same hook. Because the two screens are separate routes today, each mount reads storage; a `storage` event listener re-reads when another tab or route writes.
5. **Existing drafts**: untouched. No field is added, renamed or removed. Drafts containing review, legacy or user-bank questions (the current builder allows all 1,564) still open, list and export; their rows are labelled "Not in the question bank".
6. **Failures and stale state**: if storage is unavailable, work continues in memory with a visible banner. If stored data fails validation, it is **not overwritten**: it is copied to `chematlas-worksheets-v1.recovery` and the user is told, then a fresh backup starts. Two tabs editing the same draft: last write wins, per whole backup, as today; the losing tab re-reads on the `storage` event. A draft entry whose question id is no longer in the catalog stays in the draft and is shown as "Missing catalog record" (existing behaviour).
7. **Migration**: none.
8. **Duplicates**: `add()` ignores ids already in the active draft and stops at 500. Verified: `addEntries` already does both (`lib/worksheet.ts` L69–77), and returns the same draft object when nothing changed.

### 5.3 Prototype controls mapped to existing fields

| Prototype | Existing field |
|---|---|
| Worksheet title | `draft.name` (and `format.title` for the printed title) |
| My order / By question type | `format.grouping` `"none"` / `"type"` (`"topic"` also exists and is offered) |
| Name and date lines | `format.name`, `format.date` (`classField` also offered) |
| Source lines | `format.citations` |
| Remove with undo | existing single-level undo (covers add, move, replace, remove, break, lines, preset) |

### 5.4 Builder layout

```
PracticeBuilder
├─ DraftBar        worksheet name, draft switcher, New, Duplicate, Download drafts, Import drafts
├─ Outline         one row per entry: handle, number, question, topic, print outcome,
│                  move up, move down, remove; expandable: page break before, response lines
├─ LayoutPanel     existing format controls and presets, regrouped (no new options)
├─ PreviewPane     WorksheetPreview over generated bytes; freshness banner; page controls
└─ ExportBar       contents (questions / answer key / both), Download PDF, Open to print
```

- The four-step wizard goes away; nothing it could do is removed. Its step 1 picker is replaced by the Question Bank ("Add questions" goes there). Steps 2–4 become the outline, layout panel and preview on one screen.
- **Kept**: multiple drafts, duplicate, import/export of drafts, presets, every `Format` option, per-entry page break and response lines, undo, answer-key modes, the "no verified answer key" notice.
- **Moved to the bank or left for a product decision (O4)**: "Replace" (becomes remove + add), "Auto-add from matches", and the "previously attempted / missed" and "original source" filters.
- Reordering under grouping: a row moves only within its section, by swapping positions in the saved order. The composer already "sets section order while preserving your order within each section".

### 5.5 Navigation between the two screens

`/` and `/practice-builder` stay as two routes with the same URLs. Correctness does not depend on how the user gets between them, because state is in storage. To avoid a full reload and catalog refetch on every switch (all responses are `no-store`), Phase A tests whether client-side navigation works under vinext; if it does, the top bar uses it. **Assumption** until tested.

## 6. Responsive and accessibility architecture

| Width | Layout |
|---|---|
| ≥ 1100 px | Band with unit names; list and pane side by side; strip under the pane. Builder: outline, preview, layout panel as a drawer |
| 700–1099 px | Unselected unit tabs show numbers only, selected tab widens with its name; list and pane side by side; topic chips wrap |
| < 700 px | Separate behaviour, below |

### Phone decisions

1. **All nine units, no scrolling**: a fixed nine-column row of numbered tiles (each about 38 × 48 px at 390 px), heat strip included. Under it, one full-width line names the open unit with its count and a "Show all units" button.
2. **Topics**: a "Topic: All topics ▾" button opens a bottom sheet (`<dialog>`) listing every topic of the unit with full name and count, plus "All topics". No sideways chip row.
3. **List to question**: opening a question pushes a history entry (`question=` in the URL), so the system Back button returns to the list. The view has a labelled "Back to results" button, "3 of 61", and previous/next. The list stays mounted underneath so its scroll position is unchanged.
4. **Selected questions**: a bottom bar with the count and "Arrange in Practice builder" is always visible, including over the question view.
5. **Builder**: two tabs, Outline and Preview (`role="tablist"`). The preview generates when its tab is opened.
6. **Reordering**: Move up and Move down buttons on every row at every width (touch and screen reader). `Alt`+`↑`/`↓` on a focused row. Pointer drag is a desktop enhancement only. A polite live region announces "Question 4 moved to position 3 of 8". No drag-and-drop library.
7. **Long questions and diagrams**: the viewer fits to width by default and scrolls vertically; pinch-zoom and pan inside the viewer (`touch-action: pan-x pan-y pinch-zoom`), with zoom buttons, 1:1 and fullscreen, under the 16-megapixel cap.
8. **Focus and scroll**: opening the question view moves focus to its heading; closing returns focus to the row that opened it. Filter changes keep focus on the control used and reset the list to the top. Dialogs and sheets use `<dialog>` for focus trapping and `Esc`.
9. **Loading and errors**: catalog: skeleton rows, then a retry message on failure. Question image: placeholder at the expected aspect ratio, then on failure a message with Retry and "Open full page". Preview: section 3.3.
10. **Reduced motion**: all transitions and the list slide helper are disabled under `prefers-reduced-motion`; nothing waits for an animation to finish.

### Semantics and measurable requirements

- Unit tiles and topic chips are toggle buttons (`aria-pressed`) inside a labelled `<nav>`; they are not tabs, because they can be switched off.
- The result list is a `<ul>`. Each row has a select button (`aria-current="true"` when shown in the pane) and a separate add toggle (`aria-pressed`, label names the question). Arrow-key movement is a roving-tabindex enhancement.
- Result count and worksheet count changes are announced through `role="status"` regions.
- Question images have `role="img"` with a label naming the question; where reviewed text blocks exist they are real text.
- Text contrast ≥ 4.5:1, large text and control boundaries ≥ 3:1, for every unit's deep-on-tint, white-on-deep and deep-on-white pair. Checked by a script over the tokens (automatable).
- Interactive targets ≥ 44 × 44 px on coarse pointers, ≥ 24 × 24 px otherwise.
- Visible focus ring on every control; no information by colour alone (unit colour always accompanies a topic code; question type is a text tag).

## 7. Components, contracts and boundaries

```
student/app/{page,practice-builder/page}.tsx
        └─ ChemAtlas (components/student-app.tsx, shrinking)
             ├─ useCatalog()        ──► public/student-questions.json  (+ overrides, user banks)
             ├─ useWorksheets()     ──► localStorage chematlas-worksheets-v1 ──► lib/worksheet.ts
             ├─ useExportData()     ──► worksheet-content.json, worksheet-sources.json (lazy)
             ├─ AppShell
             ├─ QuestionBank ── CourseBand, BankFilters, QuestionList, QuestionPane, WorksheetStrip
             │                         └─ PdfQuestionPage ──► pdf.js ──► public/source/*.pdf, IndexedDB
             ├─ PracticeBuilder ── DraftBar, Outline, LayoutPanel, PreviewPane, ExportBar
             │                         └─ renderWorksheet ──► composeWorksheet (pdf-lib) ──► WorksheetPreview
             └─ legacy views (practice sessions, progress, review, audit, banks): unchanged markup in the new shell
lib/question-filter.ts   pure: filterQuestions(questions, topics, filters)
app/navigation.mjs       URL ⇄ state (extended, tests updated)
```

| Component | New / existing | Responsibility | Inputs | Mutates | Depends on | Tests |
|---|---|---|---|---|---|---|
| `useCatalog` | New, lifted | Fetch catalog, apply overrides, derive topics and counts | none | nothing shared | catalog JSON, `apchem-studio-v2` | Unit: counts equal the 735 / 366 / 210 figures; unit derived from topic id |
| `useWorksheets` | New, lifted | Section 5 | none | the Backup | `lib/worksheet.ts` | Unit: every mutation, limits, invalid storage, `storage` event, legacy key |
| `useExportData` | New, lifted from builder | Lazy-load content and registry | none | nothing | two JSON files | Unit: load failure surfaces |
| `filterQuestions` | New, from two copies | The one predicate | questions, filters | nothing | none | Unit: any-related rule, year, reviewed, search |
| `AppShell` | New | Top bar, skip link, notice area, legacy menu | view, count | navigation | `navigation.mjs` | Smoke: nav reaches both screens |
| `CourseBand` | New | Unit and topic choice with counts and heat | units, counts, selection | URL filters | none | Component: counts, toggle off, phone sheet |
| `BankFilters` | New | Type, year, reviewed-only, search | filters, years | URL filters | none | Component |
| `QuestionList` | New | Rows, selection, add toggle, paging | results, selection, `has()` | selection, `add/remove` | `useWorksheets` | Component: keyboard, toggle state |
| `QuestionPane` | New | Header, view switch, status, viewer, topics, parts | question, filters | `add/remove`, view mode | `PdfQuestionPage`, `partsForTopic` | Smoke: canvas drawn for `mcq-2008-1-29` |
| `PdfQuestionPage` | Existing, moved | Draw page or crop from source PDFs | page, regions, bank | nothing | pdf.js, IndexedDB | Existing smoke canvas check; manual visual |
| `WorksheetStrip` | New | Show active draft entries; link to builder | draft, catalog | selection | `useWorksheets` | Component |
| `PracticeBuilder` | Existing, restructured | Compose the builder | catalog, hook | via hook | all below | Smoke: heading and count |
| `Outline` | New, from step 2 | Order, remove, per-entry options | draft, plan | `move/remove/setEntry` | hook | Component: move within section, announce |
| `LayoutPanel` | Existing controls, moved | Format and presets | `draft.format` | `setFormat/applyPreset` | hook | Component |
| `PreviewPane` | New wrapper | Generate, freshness, errors | draft revision, data | nothing | `renderWorksheet`, `WorksheetPreview` | Integration: stale banner, abort, error keeps last good |
| `ExportBar` | Existing, moved | Mode, download, open | bytes, freshness | nothing | none | Integration: disabled when stale |

No state library, no context beyond what the two hooks need, no generic "design system" package: tokens are one CSS file.

## 8. Protected boundaries and local development

### 8.1 Files by risk

| Class | Paths | Rule |
|---|---|---|
| **Free to change** | `components/student-app.tsx`, `components/practice-builder.tsx`, `components/worksheet-preview.tsx`, `components/ui/atlas-controls*`, `app/student-workspace.css`, `student/app/**`, new files under `components/student/**`, new pure modules in `lib/` (`question-filter`, hooks) | Normal review |
| **Extra review** | `lib/worksheet.ts`, `lib/worksheet-pdf.ts`, `lib/worksheet-content.ts` (export behaviour); `app/navigation.mjs` and its tests (URL contract); `app/globals.css` (shared with the review dashboard's `.qiv-*` styles: add nothing global, remove nothing); `scripts/release/smoke.cjs` (release gate; must change in the same PR as the markup it pins); `package.json`, `pnpm-lock.yaml` (no new dependencies are planned) | Owner or second reviewer signs off; behaviour-neutral unless stated |
| **Do not touch** | `public/*.json`, `public/*.pdf`, `public/source/**`; `app/admin/**`, `app/api/admin/**`, `db/**`, `drizzle/**`, `lib/question-review-*`, `lib/cloudflare-access.mjs`, `lib/student-access.mjs`, `worker/**`, `wrangler*.jsonc`, `.github/**`, `scripts/assert-student-private-config.mjs`, review tests; `research/**`, extraction and classification scripts; every other branch and worktree | Out of scope for the redesign |

### 8.2 Security findings

- **`b5ceab5` on `fix/local-workers-runtime` adds `import.meta.env.DEV ? { ok: true } : await authenticateStudentRequest(...)` to `worker/index.ts`.** That is an authentication bypass in source, safe only if the production build always removes it. Nobody has verified that. **It must not reach the redesign branch or `main` as part of UI work.** If the owner wants it, it needs its own review with a build-output check and a test that an unauthenticated request to the built Worker is refused (O1).
- **No Content-Security-Policy exists.** Google Fonts would load, but the app is private and gated; calling a third party on every load leaks usage. Fonts are self-hosted (two variable woff2 files).
- **Every response is `Cache-Control: private, no-store`**, including source PDFs, the catalog and (in future) fonts. This is a deliberate Worker policy and is not changed here. It is a performance cost the redesign must live with: keep assets few and small, avoid refetching on screen switches (5.5), and report measured load to the owner (O5).
- The redesign adds no network endpoints, no new storage of personal data, and no reads from the review system.

### 8.3 Local development without weakening access control

Two supported ways, neither touching production configuration:

1. **UI work: run the student app without the Worker.** A dev-only Vite config with `vinext({ appDir: "student" })` and no Cloudflare plugin (today's untracked `vite.design.local.config.ts`). The gate is not bypassed; the Worker simply is not in the request path, and nothing built from this config is deployable. Proposal: commit it as `vite.ui.config.ts` with a comment, and have `check:private` continue to assert on `dist` from the real config only (O6).
2. **Gate-in-path testing: the README's method**, a local-only simulated Access JWT with signed test fixtures, as `tests/student-access.test.mjs` does. Used for the release smoke run, not for day-to-day UI work.

## 9. Assumptions and unknowns to settle in Session 3

| Item | Status | How to settle |
|---|---|---|
| `addEntries` de-duplicates and enforces 500 | **Verified** (`lib/worksheet.ts` L69–77) | Add a unit test |
| The composer can report per-entry outcomes without restructuring | **Verified** (`lib/worksheet-pdf.ts` L33–54 plan, L247–266 draw) | See 3.4 |
| Client-side navigation between the two routes works under vinext 1.0.0-beta.5 | Unknown | 30-minute spike in Phase A |
| `import.meta.env.DEV` folds to `false` in the Worker build | Unknown | Only relevant if `b5ceab5` is adopted |
| Where `worksheet-content.json`, `worksheet-fragments.pdf`, `worksheet-sources.json` are generated, and where `eba3977`'s `verifiedCropReviews` comes from | Unknown | Ask the owner; the UI only reads these files |
| PDF generation time for 20 and 50 entries with full-page fallbacks | Not measured | Measure in Phase C; if over about 3 s on a mid phone, move generation off the main thread as a follow-up |
| Contrast of the nine unit colour pairs | Not measured | Token contrast script in Phase A |

## 10. Rulings on items found while compiling the migration matrix

`04-component-migration-matrix.md` lists existing behaviour that sections 1–9 did not address. Decisions:

| # | Existing item | Ruling |
|---|---|---|
| 1 | Home-page metric tiles (records, topics, MCQ, FRQ counts) | Retire. The band shows the total and per-unit counts; type counts appear in the filter row |
| 2 | Footnote links to `classification-method.md` and `student-page-audit.json` | Keep. Move to an "About the catalog" item in the More menu |
| 3 | Topic definition panel and curriculum note | Adapt. The topic description and learning objectives sit under the list heading when a topic is chosen; the College Board source note moves to "About the catalog" |
| 4 | Footer line | Retire; its three statements move to "About the catalog" |
| 5 | Hard-coded profile badge "J" | Retire. There is no account; it implies one |
| 6 | Mobile hamburger menu | Replace with the top bar's two destinations plus the More menu |
| 7 | Previous/next in the detail view | Reuse in `QuestionPane` (already in the approved design) |
| 8 | Builder picker extras: per-row source preview, `content.review` note, "Verified answer" chip | The picker goes. The review note becomes the reason text in the pane's status line. "Verified answer" becomes an "Answer key available" mark in the pane and on outline rows, because the answer-key export modes depend on it |
| 9 | Builder status line ("Drafts autosave in this browser…", notices) | Adapt into `DraftBar`, driven by the hook's `status` |
| 10 | A preset also sets the picker's type filter (`practice-builder.tsx:271`) | With no picker, a preset sets format only. Behaviour change; listed under O4 |
| 11 | Unused `FilterChip` | Leave; delete in Phase E cleanup if still unused |
| 12 | Third copy of the any-related rule in `startSession` (`student-app.tsx:341–352`) | Route it through `filterQuestions` in Phase A, same behaviour |
| 13 | Registry fetch failure falls back silently (`practice-builder.tsx:56–58`) | Change. Per section 3.3, a failure to load `worksheet-content.json` or `worksheet-sources.json` is an error state with Retry; preview and download are disabled until both load. A silent fallback would turn every question into a full source page without saying why |
| 14 | Review view stores `""` as a topic override (`student-app.tsx:386, 569, 284`) | Existing defect in a legacy view. Not changed by the redesign; reported to the owner |
| 15 | Fallback URL `/ap-chemistry-mega.pdf`, which is not in `public/` | Existing dead fallback. Moved unchanged with `PdfQuestionPage`; reported to the owner |
| 16 | "Approved image" tab (never shown: `approvedImages` is always empty) | Not carried into `QuestionPane`. If approved crops are ever bridged to the student bundle, it returns as part of O2 |
| 17 | Full-page navigation when leaving the worksheet route | Covered by the client-navigation spike (section 5.5) |

### Test tooling rulings

- **No DOM test runner is installed and none is added.** Where `03` says "component tests", read: pure-logic unit tests for the functions behind each component (filter, counts, reorder-within-section, freshness state machine) plus headless-browser scenarios for the rendered behaviour. This changes the kind of evidence, not what must be shown.
- **Accessibility scan without a new dependency.** The headless script reads the browser's accessibility tree over the DevTools protocol (`Accessibility.getFullAXTree`) and fails on any interactive node without a name or with a wrong role. It measures target sizes and emulates `prefers-reduced-motion` (`Emulation.setEmulatedMedia`) the same way. Installing axe-core as a development-only dependency would be more thorough and is offered to the owner as O7; the plan does not depend on it.
- **The token contrast script runs under `pnpm test`** through a thin wrapper, `tests/token-contrast.test.mjs`.
- **Search fields.** Phase A keeps each screen's current field list. Adding the topic code to the bank's search is Phase B.
- Correction: the catalog fetch effect begins at `student-app.tsx` L236, not L239.
