# Visual sprint handoff: Question Bank and Practice Builder in the real app

Written for Codex (or any engineer) finishing the student UI redesign. It does not assume access to the conversation that produced it. Read `PROGRESS.md` for decisions and approvals, `02-architecture.md` for the target design, and this file for what is now in the code.

## 1. State

| | |
|---|---|
| Branch | `feature/student-ui-redesign` (worktree `../ChemAtlas-redesign`), local only, never pushed |
| Phase A end (start of this sprint) | `0e9c056bc72f63e16016be9b304ca23e17cc59a3` |
| Sprint commits | `8631f29` Question Bank and shared top bar · `68bfa82` Practice Builder restyle · `b3aa689` screenshots · plus this handoff |
| Untracked, not ours | `.graphifyignore` (local Graphify config; leave it) |
| Pushed / merged / deployed | No / No / No |

Checks run on the final code: `pnpm exec tsc --noEmit` clean; ESLint on `components app student` clean; `pnpm test` 82 pass, 0 fail; `pnpm run build` succeeds; `pnpm run check:private` passes ("13 client assets, and 1564 questions across 9 units"). **Not run:** `scripts/release/validate.sh` and the release smoke test (see section 9).

## 2. How to look at it

```
pnpm exec vite dev --config vite.ui.config.ts --host 127.0.0.1 --port 5193
```

Open `http://127.0.0.1:5193/` (Question Bank) and `/practice-builder`. This config runs the student app without the Worker, so there is no Access check, no `no-store` headers and no admin 404s; never use it to judge security behaviour.

Interaction checks and screenshots, with that server running (needs Chrome; no new dependencies):

```
node docs/student-ui-redesign/tools/capture-screens.mjs
```

It writes PNGs to `docs/student-ui-redesign/screenshots/` and prints one line per check plus any console errors, exceptions or HTTP errors. Last run: every check passed, no page errors.

## 3. What was implemented

### Question Bank (replaces the home, unit, bank and question-detail views)

- **Course band**: an "All" tile plus nine unit tiles in unit colours, each with a count and a heat strip (one block per topic, darker for more questions). Choosing a unit opens its topic chips below, with counts; chips toggle off.
- **List**: one row per question with topic code in unit colour, MCQ/FRQ tag (outlined vs solid, not colour), year and number, topic name (or "Primary: x.y" when listed under a secondary topic), one line of text, a tick for questions with a reviewed print layout, and an add/remove toggle. Filters: type, exam year, "Reviewed print layout only", search (also matches topic codes), clear. 100 rows at a time with "Show more".
- **Question pane**: title, exam and source pages, position in results, previous/next, Full page / Question crop, Add to worksheet, a status line ("Reviewed print layout…" or "No reviewed print layout yet… prints as its full source page", with the catalog's review note), topic chips (primary marked, the listed topic marked), a collapsible "parts that test x.y" table for free-response questions, then the Phase A viewer (zoom, fit width, fit page, 1:1, full screen, page tabs) filling the rest of the pane.
- **Worksheet strip**: the active draft's questions as numbered tiles in unit colours; clicking one opens that question; a button into the Practice Builder.
- **Keyboard**: ↑/↓ or J/K move, A adds or removes, F switches page/crop, / focuses search, Esc closes the phone question view. Ignored while typing.
- **Phones (<700 px)**: all nine unit tiles fit without scrolling; a line under them names the open unit with an "All topics ▾" button that opens a bottom sheet of topics and an "All units" button; the question opens as a full-screen layer that is its own history entry (system Back returns to the list); the worksheet strip stays fixed at the bottom.
- **States**: skeleton rows while loading, catalog-failure message, empty results with Clear filters, "Pick a question", viewer loading and error states from the existing component.

### Shared top bar (every student screen)

ChemAtlas wordmark; **Question bank**; **Practice builder** with the live worksheet count; **More** menu with Study (Practice sessions, Progress) and Catalog tools (Review queue with count, Source page audit, Legacy content, Manage test banks). Search appears on the Question Bank. The older views render unchanged inside this shell.

### Practice Builder

- Header: title, count, worksheet title, saved-worksheet switcher, New worksheet, Drafts menu (Duplicate, Download drafts, Import drafts), status line.
- **Outline** (left): one row per entry with drag handle, number, type tag, year and number, topic, "Prints as its full source page" warning where there is no reviewed layout, the catalog's review note, move up, move down, remove; an Options disclosure with page break before, response lines (FRQ) and Replace. Summary of counts and Undo at the top; "Add from the Question bank" at the bottom.
- **Tabs** (right): **Preview** (default when the draft has questions), **Layout**, **Add questions**.
- **Preview** is the PDF produced by the existing `renderWorksheet` pipeline, shown by the existing `WorksheetPreview` (page controls, zoom, fit). PDF contents (questions / answer key / both), Download PDF and Open PDF to print appear only when the current PDF is ready, so you cannot download a stale file. A note says it is the real PDF and how many questions print as full source pages.
- **Layout** and **Add questions** are the existing controls (presets, every `Format` option; the full picker with its extra filters and auto-add), moved into the new frame and not restyled.
- **Phones**: Outline, Preview, Layout and Add questions become four tabs.

### Unchanged by design

Catalog loading and overrides (`useCatalog`), filtering rule (`filterQuestions`, any related topic), URL contract (`app/navigation.mjs`; old `?view=desk|unit|library|detail` URLs open the bank in the same state), worksheet storage (`chematlas-worksheets-v1`, same schema), single-level undo, preview generation and cancellation, PDF composer, viewer (`PdfQuestionPage`), the other views' markup, authentication and Cloudflare configuration, all data in `public/`.

## 4. Files

| File | Change |
|---|---|
| `app/student-redesign.css` | New. Tokens (colour, unit ramp, type stacks, motion) and all new component styles. Every class is `ca-` prefixed and scoped under `.ca2`, because `app/globals.css` (shared with the private review dashboard) defines unprefixed global classes |
| `components/student/app-top-bar.tsx` | New. Shared top bar and More menu |
| `components/student/bank/question-bank.tsx` | New. `QuestionBank` and its internal `QuestionPane` |
| `components/student-app.tsx` | Old header and the desk, unit, library and detail branches removed; renders `AppTopBar`, then `QuestionBank`, `PracticeBuilder` or the legacy views. State only those views used was removed |
| `components/practice-builder.tsx` | Markup replaced (outline, tabs, preview frame); state, handlers and the preview effect kept. Adds `onOpenBank` prop. `step` now means the visible tab |
| `student/app/layout.tsx` | Loads `app/student-redesign.css` |
| `docs/student-ui-redesign/tools/capture-screens.mjs` | New. Headless-Chrome checks and screenshots |
| `docs/student-ui-redesign/screenshots/*.png` | New. 14 screenshots |

Not touched: `app/globals.css`, `app/student-workspace.css`, `app/navigation.mjs`, `lib/**`, `worker/**`, `wrangler*.jsonc`, `public/**`, `.github/**`, `scripts/**`, `package.json`, the lockfile.

## 5. Screenshot evidence

All in `docs/student-ui-redesign/screenshots/`, captured from the real app.

| File | Shows |
|---|---|
| `bank-all-desktop.png` | 1440 px, every unit |
| `bank-topic-desktop.png` | Unit 3, topic 3.4, a question open, two on the worksheet |
| `bank-crop-desktop.png` | Question crop mode |
| `bank-tablet.png` | 768 px, unit 8, topic 8.3, question open |
| `bank-phone.png` | 390 px list with nine unit tiles |
| `bank-topics-phone.png` | Phone topic sheet |
| `bank-question-phone.png` | Phone question layer |
| `builder-desktop.png` | Outline and the real PDF preview |
| `builder-layout-desktop.png`, `builder-add-desktop.png` | Layout and Add questions tabs |
| `builder-tablet.png` | 768 px builder |
| `builder-outline-phone.png`, `builder-preview-phone.png` | Phone builder tabs |
| `legacy-progress-desktop.png` | An older view inside the new top bar |

Prototype references for comparison: `design-previews/v2/screenshots/`.

## 6. Differences from the approved prototypes

| Area | Difference | Reason / next step |
|---|---|---|
| Typography | System font stacks instead of Bricolage Grotesque and Atkinson Hyperlegible Next | Fonts deferred by the owner pending release-input and licence checks. When approved, add the woff2 files and `@font-face`; the CSS already names the faces first |
| Builder page | Real PDF instead of the prototype's HTML paper | Approved architecture decision D1 |
| Builder grouping | Grouping is the existing select in Layout, not a segmented control in the outline; the outline does not show MCQ/FRQ sections | Next step 7.4 |
| Builder Layout and Add tabs | Existing styling inside the new frame | Next step 7.5 |
| PDF preview toolbar | Existing `WorksheetPreview` controls, spaced wider than the rest of the UI | Next step 7.5 |
| Question pane | Topics and part table sit above the image (prototype put them below), so the image fills the pane with one scroll area | Deliberate; judged better at 900 px height |
| Phone header | Builder header (title, switcher, actions) takes about a third of the first screen | Next step 7.6 |
| Bank print status | Says "reviewed print layout"; it does not state the outcome per worksheet | Per-worksheet outcome needs `planExport` (Phase D, O3) |

## 7. What Codex should do next, in order

Each item is independent unless stated. Keep the rules in `CODEX-PHASE-A-HANDOFF.md` section 2 (no dependency changes, no edits to `worker/**`, `public/**`, `app/globals.css`, `lib/worksheet*.ts` without the extra review it describes, no push).

1. **Run the release smoke test** (`bash scripts/release/validate.sh` or the smoke step in it). The redesign was built to satisfy every assertion in `scripts/release/smoke.cjs` L90–104 without editing it: a heading "Browse by unit" exists (visually hidden, inside the course band); unit buttons are labelled "Unit 1, Atomic Structure and Properties, …"; the list heading after choosing Unit 1 is "Atomic Structure and Properties"; rows keep the `catalog-row` class; the detail URL draws a canvas; the builder heading is "Practice Builder" and the count reads "0 selected" in a fresh browser. This is **unverified** until the smoke run passes. If it fails, change the markup, not the assertions, unless the owner agrees otherwise.
2. **Focus management** (`02-architecture.md` section 6, item 8): on phones, move focus to the pane heading when a question opens (the heading already has `tabIndex={-1}` in `QuestionPane`) and return it to the originating row's button on close.
3. **List keyboard semantics**: arrow keys currently move the selection globally. Add roving tabindex on the row buttons so Tab enters the list once and arrows move within it.
4. **Outline sections under grouping**: when `draft.format.grouping` is `"type"` or `"topic"`, show section headings in the outline and limit move up/down and drag to within a section (swap positions in the saved order). The composer already preserves order within sections.
5. **Restyle Layout and Add questions tabs** onto the `ca-` components (fields, checkboxes, buttons). Keep every control; this is visual only. Restyle `components/worksheet-preview.tsx` controls to `ca-icon` buttons in one compact bar.
6. **Phone builder header**: collapse the title, switcher and actions into a single row with a "Worksheet settings" disclosure.
7. **Preview freshness** (`02-architecture.md` section 3.3): today the old preview disappears while a new one generates. Keep the last good pages visible, dimmed, under an "Updating…" note, and keep the download disabled until the new PDF is ready. Do not change the generation pipeline.
8. **Contrast**: measure the nine unit colours (deep on tint, white on deep, deep on white) and adjust lightness where text falls below 4.5:1. Add a `node --test` check as planned in `05-test-and-acceptance-plan.md`.
9. **Fonts**, once the owner approves: self-host the two families, add licences, confirm `check:private` and release inputs.
10. **Phase D** (needs owner decisions O2 and O3): `planExport`, per-row "prints cropped / as source page / with question N" in the outline and pane.
11. **Dead code**: `components/ui/atlas-controls.tsx` `DirectoryCard` and `UnitDirectoryCard` and the old desk, unit, bank and detail CSS in `app/student-workspace.css` are now unused by the student app. Remove them only after confirming with `git grep` and the review dashboard.

## 8. Responsive and interaction requirements (as built)

| Width | Question Bank | Practice Builder |
|---|---|---|
| ≥ 1100 px | Unit tiles show names; list (5/11) beside pane (6/11); strip under the pane | Outline 300–400 px beside the tab area |
| 701–1099 px | Unselected tiles show number and count only; the selected tile widens with its name | Same as desktop |
| ≤ 700 px | Nine tiles, unit line, topic sheet; list full width; question as a history-backed layer; strip fixed at the bottom; touch targets ≥ 44 px except the search field's inner input and viewer toolbar icons (36 px) | Four tabs; preview generates when its tab is shown |

Motion: unit tiles rise in once on load; topic row opens with a height transition; phone question layer slides in; all disabled under `prefers-reduced-motion`.

## 9. Tests

**Done** (by `capture-screens.mjs` unless noted):
- Bank loads 735 classified questions across nine units; unit then topic selection; topic chip count equals the list length (3.4: 61)
- Add from rows writes to `chematlas-worksheets-v1` (verified in storage); strip and top-bar count update; selection survives reload and the move to the builder
- Keyboard ↓, A, F, /; search narrows, empty state, Clear filters restores
- "Reviewed print layout only" shows only ticked rows; type filter
- Old `?view=detail&question=mcq-2008-1-29` opens the bank with that question drawn
- An older view (Progress) renders inside the new shell
- Builder receives the selection; real PDF generated and drawn ("PDF ready · 2 pages"), download link present; move down, remove, undo update the draft and storage; Layout and Add tabs render
- Tablet and phone: no horizontal overflow; phone topic sheet; phone question layer opens and system Back closes it; phone builder Outline and Preview tabs each show only their content
- No console errors, exceptions or failed requests across the run
- `tsc`, ESLint, `pnpm test` (82), `pnpm run build`, `pnpm run check:private`

**Still required**:
- Release smoke test and `validate.sh` (section 7.1)
- Screen readers (NVDA with Chrome, VoiceOver with Safari)
- Real-phone check of pinch-zoom on a long FRQ and of drag reordering (drag is mouse only; buttons cover touch)
- Contrast measurement (7.8)
- A user-added PDF bank question opened in the new pane
- Export comparison: the same draft exported before and after this sprint should produce the same PDF (the pipeline was not changed; confirm)
- Browsers other than Chrome

## 10. Unresolved design decisions

- **O8**: whether `research/crop-visual-review.json` may set the viewer's default to the crop for verified questions. Until decided, every question opens on Full page.
- **O4**: whether Replace, Auto-add and the history and source filters stay in the builder (they do, under Options and Add questions) or move to the bank.
- **Fonts** (deferred).
- **O2, O3, O5, O7** in `PROGRESS.md`.
