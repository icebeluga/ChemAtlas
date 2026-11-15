# ChemAtlas v2 design specification

Prototype of the approved direction: **Question Bank** (Atlas + Workbench) and **Practice Builder** (from Proof), as one application. Design only; nothing in the production app is changed.

Open it: start the `design-previews` server (`node design-previews/serve.mjs`), then go to
`http://127.0.0.1:5191/design-previews/v2/index.html`. The original three directions are still at `http://127.0.0.1:5191/`.

## 1. Product architecture

Two destinations in one top bar, sharing one worksheet:

| | Question bank | Practice builder |
|---|---|---|
| Job | Find and read questions, pick them | Arrange the picks into a worksheet |
| Layout | Course band → list → printed question | Outline → page preview |
| Worksheet shows as | A numbered strip under the question, always visible | The whole screen |

The count beside "Practice builder" in the top bar and the strip of numbered tiles are the same list in both places.

### Question bank: how Atlas and Workbench became one thing

The Atlas map and the Workbench sidebar did the same job (choose unit, then topic), so they are **one control, not two side by side**: the **course band**.

- Nine unit tabs across the top, each in its unit colour, each carrying a **heat strip**: one small block per topic, darker where there are more questions. This is the Atlas map, laid flat.
- Choosing a unit opens its topics directly below as chips with counts. Unit → topic is two clicks and no page change.
- Below the band is the Workbench part: a dense list on the left, the printed question on the right, the worksheet strip underneath it.

The eye and the workflow run the same way: unit, topic, list, question, add.

Why a band and not a left sidebar: a sidebar plus list plus question is three columns, which squeezed the printed question (the thing people came for) to under half the width. The band costs about 130 px of height and gives the question 55% of the width. It is also the same component at every screen size.

### Practice builder: what was kept from Proof

Kept: the worksheet is a real page on a desk, showing each question as it prints.
Changed: reordering happens in a compact **outline** beside the page, not by dragging tall blocks on the page. Short rows are easier to drag, work with arrow buttons and the keyboard, and stay usable with 20 questions. Clicking either side highlights the same question on the other.
Dropped: "try a question on the page" from inside the builder. Picking belongs to the Question bank; one job per screen.

## 2. Visual system

All tokens are in `app.css` under `:root`.

**Type**

| Role | Face | Why |
|---|---|---|
| Headings, topic codes, numbers | Bricolage Grotesque | Characterful; narrow enough for codes in small spaces |
| Interface and reading text | Atkinson Hyperlegible Next | Built for legibility; the audience is students |
| The worksheet page and typeset questions | STIX Two Text | The typeface of scientific publishing; matches the printed exams |

Scale: 13, 14, 15 (base), 20, 26 px. Figures are tabular wherever numbers line up.

**Colour**

- Surfaces: canvas `#F3F6F9`, surface `#FFFFFF`, sunk `#E9EEF3`. Ink `#14233A`, secondary ink `#4B5B70`, lines `#D3DBE4`.
- **Unit colour is the only hue used for content.** Nine hues in the order of a map's elevation tints, sea blue (Unit 1) to plum (Unit 9), so colour also says where in the course you are. Each unit has three steps: tint (backgrounds), mid (bars, tiles), deep (text, selected state). Defined once as `[data-u]` in `app.css`.
- Question type is shown by **shape, not colour**: outlined tag for multiple choice, solid tag for free response.
- Semantic colours, used sparingly: pencil blue `#2552C8` (focus ring, provisional notes on the page), amber `#75480A` on `#FFF3D9` (needs review), red `#AE2A1F` (remove, errors).
- Light surfaces only. The questions are black-on-white scans.

**Space and shape**: 4 px base (4, 8, 12, 16, 24, 32). Radius 4 px on controls, 2 px on small blocks. One shadow, used only for floating layers (toast, dialog) and the paper.

**Density**: list rows are two lines, about 54 px: about 9 rows visible at 1440 × 900 with the topic row open, against 3 in the current app.

## 3. Components

- **Top bar**: wordmark, two destinations, live worksheet count, search (bank) or Export (builder).
- **Course band**: unit tabs with heat strips; topic chips. On tablets unselected tabs shrink to their number and the selected one widens to show its name. On phones the tabs and chips scroll sideways.
- **Question row**: topic code in unit colour, type tag, year and number, topic name, one line of text, add button. A small tick marks print-ready questions.
- **Question pane**: title, previous/next, Question / Full page switch, Add button, status line, the printed question, topics, and what each free-response part tests.
- **Worksheet strip**: numbered tiles in unit colours, in worksheet order; click one to jump to that question; button into Practice builder.
- **Outline row** (builder): drag handle, number, question, topic, move up/down, remove.
- **Paper** (builder): title, name and date lines, optional sections, numbered questions, optional source lines.
- **Status**: "Print-ready" or "Needs review", always with the reason and the consequence.
- **States**: loading shimmer for question images, empty results with a way out, catalog load failure with retry, image failure with a pointer to Full page, undo toast after remove.

## 4. Interaction and motion

Keyboard (bank): `↑` `↓` or `J` `K` move through the list, `A` adds or removes, `F` switches to the full source page, `/` focuses search, `Esc` leaves a field or closes the phone question view.
Keyboard (builder): arrow keys move between outline rows, `Alt`+arrows move a question, `Delete` removes it, `Enter` scrolls the page to it.

Motion tokens: fast 130 ms (hover, press, toggles), medium 280 ms (panels, list moves), slow 480 ms (unit tab widening, the one load sequence). A decelerating curve for movement; a slight overshoot only for the worksheet count when you add.

- Lists keep their place: when a filter or reorder changes a list, rows slide from where they were (`flip()` in `app.js`, Web Animations API, no library).
- One unprompted animation: the unit tabs rise in once on load.
- `prefers-reduced-motion` turns all of it off. Nothing waits on an animation.
- Rejected after testing: whole-page view transitions (they block clicks during each animation).

## 5. Honest handling of question content

Only **83 of the 735** classified questions have a reviewed print layout in `public/worksheet-content.json`. The existing PDF export prints every other question as its full source page. The prototype shows this instead of hiding it:

- **Print-ready** questions are drawn from the reviewed layout, including shared stimuli and answer lists (labelled "Shared with neighbouring questions") and the few typeset ones.
- **Needs review** questions show the unreviewed crop with the catalog's own reason (for example "A shared passage, figure, or answer list needs to be associated with the stem") and the statement that they export as the full source page.
- **Full page** is one click or `F` away for every question. Questions with no crop at all open as full pages.
- The builder repeats the warning on the page (not printed) and lists the affected questions in the export dialog.
- A "Print-ready only" filter lets a teacher build a worksheet with no surprises.

## 6. What is real and what is not

| Real in the prototype | Demonstration only |
|---|---|
| Catalog, units, topics, counts (read from `public/`) | Worksheet storage (own `localStorage` key, not the app's drafts) |
| Filtering, search, year, type, print-ready | "Generate PDF" (disabled, explained in the dialog) |
| Printed questions drawn from the source PDFs, reviewed layouts, shared stimuli, full-page fallback | Page breaks and final spacing on the paper |
| Add, remove, undo, reorder, grouping, title, options | Answer keys, presets, multiple saved worksheets |
| Selection carried between the two screens and across reloads | Practice sessions and progress (not part of this session) |
| "Print preview" (browser print of the page shown) | |

## 7. Engineering considerations for production

1. **Question images.** The prototype rasterises PDF pages in the browser with pdf.js. A list that showed thumbnails, or a 20-question worksheet, would be slow on a phone. Pre-rendered crops for reviewed questions would remove this.
2. **Preview and PDF are two renderers.** The paper is HTML; the export is `lib/worksheet-pdf.ts`. Either accept the stated difference (current wording) or render the preview from the generated PDF, which the app already does in its final step.
3. **Print-ready coverage (11%).** The design is usable today but improves directly with review progress. Decide whether unreviewed crops may ever be exported.
4. **Worksheet state.** Map the prototype's single list onto the existing draft model (multiple drafts, per-entry page breaks and response lines, undo). The app has these; the prototype shows one worksheet.
5. **One route or two.** Practice Builder is currently a separate route with a full page load. Selection must be shared without a reload flash.
6. **Fonts.** Self-host the three families in the Worker assets; the prototype loads them from Google.
7. **Component split.** `components/student-app.tsx` is one 578-line component. The band, list, pane, strip, outline and paper are natural components; state and routing can stay where they are.
8. **Unit colours** use `oklch()` and `color-mix()`. Supported in current browsers; provide fallbacks if older ones matter.
9. **Drag reordering** uses HTML drag and drop, which does not work on touch. Arrow buttons cover touch; a pointer-based drag would be an addition.
10. **Accessibility work still owed**: measured contrast for all nine deep and tint pairs, screen-reader pass on the listbox pattern, focus return after closing the phone question view.
11. **Data quality surfaces in this design**: OCR debris in preview text, crops with large blank margins, and one record whose crop is cut at a column edge.

## 8. Approval checklist

Ready for your review:

- [ ] Course band as the single unit and topic control (replaces home, unit page and both dropdowns)
- [ ] List beside printed question, with the worksheet strip underneath
- [ ] Unit colour ramp, and type shown by tag shape rather than colour
- [ ] The three typefaces
- [ ] Print-ready / Needs review wording and the full-page fallback
- [ ] Practice builder as outline plus page
- [ ] Grouping by question type, name and date lines, source lines
- [ ] Export dialog wording
- [ ] Keyboard shortcuts
- [ ] Phone and tablet layouts

Unresolved, needs your decision:

- [ ] Base branch and commit for production work (AGENTS.md requires you to name it)
- [ ] Whether unreviewed crops may be exported, or only full source pages (current behaviour)
- [ ] Whether the builder preview should be HTML (fast, approximate) or the generated PDF (exact, slower)
- [ ] Where practice sessions, progress and the maintenance tools sit in the new navigation
- [ ] Whether to keep the prototypes in git (they are currently untracked and exist only on this machine)
