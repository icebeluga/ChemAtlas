# ChemAtlas student UI redesign: risk register and implementation roadmap

Companion to `02-architecture.md`. Section and decision numbers (D1–D7, O1–O6) refer to that file and to `PROGRESS.md`.

## 1. Risk register

Severity: **H** could ship wrong output, lose data or weaken security; **M** costs rework or degrades use; **L** minor.

| # | Risk | Area | Sev | Mitigation | Owner of the check |
|---|---|---|---|---|---|
| R1 | A student sees a cropped question on screen and gets a full source page (possibly with adjacent answers) in the PDF | Correctness | H | D1: preview is the real PDF. D3: per-row outcome from `planExport`. Export summary counts full-page questions before download | Phase D acceptance |
| R2 | The dev-mode authentication bypass in `b5ceab5` (`worker/index.ts`) reaches `main` inside UI work | Security | H | Not merged into the redesign branch. Separate review with a build-output check and an unauthenticated-request test if the owner wants it (O1) | Owner |
| R3 | Existing worksheet drafts are lost or corrupted by the new state hook | Data | H | D2: same key, same schema, no migration. Invalid stored data is copied to a recovery key, never overwritten. Unit tests replay real-shaped backups, the legacy id-array key and invalid data | Phase A acceptance |
| R4 | Extracting `planExport` changes PDF output | Correctness | H | Move lines unchanged; test asserts identical bytes (or identical page count and text per page) for fixed drafts before and after | Phase D acceptance |
| R5 | The release smoke test (`scripts/release/smoke.cjs`) pins headings, `.catalog-row`, "0 selected"; a UI change breaks the release gate, or the gate is weakened to pass | Release | H | Update the smoke test in the same PR as the markup, keeping every kind of assertion (home, unit, list, question canvas, builder, admin 404s, no page errors) | Phase B and C acceptance |
| R6 | `app/globals.css` is shared with the private review dashboard (`.qiv-*`); a token or reset change restyles it | Regression | M | New tokens live in a student-only stylesheet scoped under the shell class. No edits to global selectors | Review of every CSS diff |
| R7 | PDF generation on the main thread freezes the builder for large worksheets with full-page fallbacks at 300 dpi | Performance | M | Abortable, debounced, on demand on phones. Measure 20 and 50 entries in Phase C; move to a worker only if needed | Phase C measurement |
| R8 | Everything is served `no-store`; two routes with full reloads refetch the catalog and PDFs on each switch | Performance | M | Client-side navigation if vinext supports it (spike). Keep new assets small. Report numbers to owner (O5) | Phase A spike |
| R9 | vinext is 1.0.0-beta; client navigation or route behaviour differs from Next | Technical | M | Spike first; the design works with full reloads because state is in storage | Phase A |
| R10 | Features of the current builder are silently dropped (replace, auto-add, history and source filters, presets, answer-key modes) | Product | M | Section 5.4 lists each as kept, moved or pending decision (O4). Migration matrix tracks every control | Phase C checklist |
| R11 | Drafts containing review, legacy or user-bank questions (allowed today) break in a bank that lists only classified questions | Data | M | Outline and export accept any catalog id; rows are labelled, not removed | Phase C test |
| R12 | Unit counts add up to more than the total and confuse users | Usability | L | Any-topic rule stated in the band; "All" shows the distinct total | Phase B review |
| R13 | `primaryUnit` (stale in 569 records) is used by new code | Correctness | M | Unit is derived from topic id in `useCatalog`; a unit test fails if `primaryUnit` is read for filtering or colour | Phase A test |
| R14 | Nine unit colours fail contrast on some pairs | Accessibility | M | Token contrast script with thresholds in Phase A; adjust lightness, keep hues | Phase A |
| R15 | Screen-reader and keyboard regressions from the custom list and reorder controls | Accessibility | M | Native elements, buttons for every action, live announcements; manual screen-reader pass each phase | Phase B, C, E |
| R16 | `fix/local-workers-runtime` and the redesign both rewrite the detail view and `PdfQuestionPage`; whichever lands second conflicts | Process | M | Decide O1 before Phase B. Recommended: adopt its viewer, supersede its layout, with the author's agreement | Owner |
| R17 | Dependency bumps in `b5ceab5` (vite plugin, wrangler, workerd) enter with UI work | Release | M | No dependency changes on the redesign branch | Review |
| R18 | User topic overrides and user-added banks (stored in `apchem-studio-v2`, IndexedDB) stop working after the catalog code moves | Regression | M | `useCatalog` is a lift, not a rewrite; test with an override and a user-bank question | Phase A test |
| R19 | Review-system data or admin paths leak into the student bundle | Security | H | No imports from admin, db or review libs; `check:private` runs on every phase build | Every phase |
| R20 | Self-hosted fonts add weight to every uncached load | Performance | L | Two variable woff2 files, `font-display: swap`, system fallback stack | Phase A |
| R21 | The prototypes drift from the implementation and are mistaken for the spec | Process | L | `02-architecture.md` section 2 lists where the prototype is superseded | Handoff |

## 2. Roadmap

The phases in the brief are reordered in one way: **shared worksheet state moves into the foundation**, ahead of the Question Bank. The bank's add buttons and worksheet strip are useless without it, and doing it first means every later phase is an end-to-end slice against real drafts.

Where a phase below says "component tests", read it as ruled in `02-architecture.md` section 10: pure-logic unit tests plus headless-browser scenarios, because no DOM test runner is installed and no dependency is added. "Axe scan" likewise means the accessibility-tree check described there, unless the owner approves O7.

Each phase is one branch-local series of commits ending in a state that passes `pnpm run check`, `pnpm test`, `pnpm run build`, `pnpm run check:private` and the smoke run. Nothing is pushed or merged without owner approval.

### Smallest useful vertical slice

**Phase A plus the first half of Phase B**: with the hooks extracted, replace only the `library` view with the new list and pane and add the worksheet strip. A student can pick a unit and topic, read a printed question, add it, and open the *existing* Practice Builder with that question in the real draft. This proves the state, the viewer reuse, the URL contract and the smoke-test update before any builder work.

### Phase A — Foundation (no visible change)

| | |
|---|---|
| Objective | Create the seams the redesign needs, with the UI pixel-identical |
| Scope | Extract `useCatalog`, `useWorksheets`, `useExportData`, `filterQuestions`; move `PdfQuestionPage` to its own file; add the student token stylesheet and self-hosted fonts (loaded but unused); spike client-side navigation between the two routes; add the token contrast script; add a tracked UI-only dev config if O6 is approved |
| Files | `components/student-app.tsx`, `components/practice-builder.tsx` (consume hooks), new `components/student/hooks/*.ts`, `components/student/pdf-question-page.tsx`, `lib/question-filter.ts`, `app/student-tokens.css` (new, student-scoped), `public/fonts/*`, new tests under `tests/` |
| Dependencies | O1 decided (which `PdfQuestionPage` to move), O6 |
| Risks | R3, R13, R18, R6, R9 |
| Acceptance | Smoke test passes **unmodified**. Existing drafts, legacy id-array key, overrides and a user bank still load (unit tests with fixtures). Catalog counts test: 735 classified, 366 multi-topic, 210 multi-unit. `filterQuestions` returns the same ids as the old inline predicate for a table of filter combinations. Contrast script passes or lists the pairs to adjust |
| Tests | New unit tests for the three hooks and the filter; existing suite |
| Model | Sonnet (`frontend-implementer`) for the extractions from this spec; Fable reviews the hook API and the storage-failure behaviour only |
| Done when | All checks pass and a diff of rendered HTML for the smoke URLs is empty or explained |

### Phase B — Question Bank on real state

| | |
|---|---|
| Objective | Replace home, unit, bank and detail views with the approved Question Bank |
| Scope | `AppShell`, `CourseBand`, `BankFilters`, `QuestionList`, `QuestionPane`, `WorksheetStrip`; URL extensions and old-URL mapping in `navigation.mjs`; keyboard shortcuts; desktop and tablet layout; baseline phone layout (section 6 items 1–4); update `smoke.cjs` |
| Files | New `components/student/bank/*.tsx`, `components/student/app-shell.tsx`; `components/student-app.tsx` (remove four view branches); `app/navigation.mjs` + `tests/` for it; `app/student-workspace.css` (remove dead rules); `scripts/release/smoke.cjs` (extra review) |
| Dependencies | Phase A |
| Risks | R5, R12, R15, R16, R10 |
| Acceptance | For every unit and topic, list length equals the chip count and equals `filterQuestions` output. Old URLs (`?view=library&unit=u3&topic=3.4`, `?view=detail&question=mcq-2008-1-29`) open the bank in the equivalent state. Adding from row, pane or `A` writes to the active draft and survives reload and a visit to `/practice-builder`. A cross-topic question shows its primary topic and why it is listed. Printed question draws for a reviewed, an unreviewed and a no-crop question; Full page works for each. No console errors. Smoke test updated and passing with the same categories of assertion |
| Tests | Component tests for band, list, pane; navigation tests; headless interaction script adapted from `design-previews/v2/check.mjs`; manual keyboard and screen-reader pass |
| Model | Sonnet implements from the prototype markup and this spec; `verification-assistant` (Sonnet) runs the interaction and screenshot pass; Fable reviews screenshots and the cross-topic presentation |
| Done when | Acceptance met at 1440, 768 and 390 px and the legacy views still open from the "More" menu |

### Phase C — Practice Builder on the existing pipeline

| | |
|---|---|
| Objective | Rebuild the builder as outline + layout panel + authoritative preview |
| Scope | `DraftBar`, `Outline`, `LayoutPanel`, `PreviewPane` (freshness, abort, errors), `ExportBar`; remove the wizard and the in-builder picker; static print-outcome labels; measure generation time |
| Files | `components/practice-builder.tsx` (restructure), new `components/student/builder/*.tsx`, `components/worksheet-preview.tsx` (only if page-jump or sizing needs it), `scripts/release/smoke.cjs` |
| Dependencies | Phase A; O4 decided |
| Risks | R1 (partially, until D), R7, R10, R11 |
| Acceptance | Every control of the old builder is present, moved or covered by an approved O4 decision (checked against the migration matrix). Reorder by buttons, keyboard and drag updates the draft; grouped reorder stays within a section. Undo restores add, move, remove, break, lines, preset. Editing marks the preview out of date within one frame; download is disabled until it is current. A forced generation error keeps the last good pages and shows the message. Drafts with review or user-bank entries open and export. Generation time recorded for 5, 20 and 50 entries |
| Tests | Component tests for outline; integration test for freshness and abort with a stubbed renderer; existing `stage3-worksheet` tests unchanged and passing; manual PDF inspection for a mixed worksheet |
| Model | Sonnet implements; Fable reviews the freshness state machine and the failure paths |
| Done when | A worksheet built in Phase B's bank can be arranged, previewed and downloaded, and the PDF matches what the old builder produces for the same draft (byte or page-text comparison) |

### Phase D — Export fidelity

| | |
|---|---|
| Objective | Make the print outcome of every entry explicit before generation |
| Scope | Extract `planExport` (O3), per-row outcome labels, "Printed with question N", export summary, optional `firstPage` for page jump, "Reviewed print layout" label and filter in the bank backed by the same data |
| Files | `lib/worksheet-pdf.ts` (extra review), `tests/stage3-worksheet.test.mjs`, outline and export bar, bank row and pane status |
| Dependencies | Phase C; O2 and O3 decided |
| Risks | R1, R4 |
| Acceptance | For fixed drafts, PDF output is unchanged by the extraction. `planExport` agrees with the generated PDF for: reviewed only; unreviewed only; reviewed sharing a page with unreviewed (both fall back); stimulus-linked without context; two questions sharing a context (second says "with question N"); two questions on the same fallback page (second says "see earlier"). No screen shows a crop for an entry whose outcome is a source page |
| Tests | Unit tests for `planExport`; PDF text-extraction check per case; manual review of three exported PDFs |
| Model | **Fable** reviews the extraction diff and the test cases (highest-risk change); Sonnet writes the tests and UI labels |
| Done when | Acceptance met and the owner has seen one exported worksheet per case |

### Phase E — Responsive, accessibility and regression

| | |
|---|---|
| Objective | Finish phone behaviour and prove nothing regressed |
| Scope | Topic sheet, history-backed question view, focus return, builder tabs, live announcements, viewer zoom and pan, reduced motion, touch-target audit; full regression run; remove dead CSS and retired components |
| Files | Bank and builder components, student stylesheets |
| Dependencies | Phases B–D |
| Risks | R15, R14, R8 |
| Acceptance | No horizontal overflow at 390, 768, 1440. All targets ≥ 44 px on touch. Back button returns from question to list at the same scroll position with focus on the originating row. Full keyboard path: find, add, arrange, export, without a pointer. Screen-reader pass (NVDA + Chrome, VoiceOver + Safari) with no unlabelled control and announced result and reorder changes. Reduced motion: no transitions. All automated suites and the smoke run pass |
| Tests | Headless script at three sizes; axe scan; manual assistive-technology pass; real-phone check of long FRQ zoom |
| Model | `verification-assistant` (Sonnet) for scripted checks; human for assistive technology; Fable for final visual review |
| Done when | Acceptance met; owner approves; PR opened only on the owner's instruction |

### Not in this roadmap

Practice sessions, progress and the maintenance tools keep their current markup inside the new shell (O4 covers where they sit). Restyling them is a later, separate piece of work. Pre-rendered question images and caching policy are owner decisions outside the UI work (O5).

## 3. Suggested sequencing of approvals

O1 (fix branch) and O6 (dev config) before Phase A. O4 (builder features, navigation) before Phase C. O2 and O3 (export rules, `planExport`) before Phase D. O5 can wait for measurements.
