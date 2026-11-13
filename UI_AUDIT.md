# ChemAtlas interface audit

Baseline commit: `b66e225`. Next App Router on Vinext and Vite serves `/` and `/practice-builder`. The catalog, topics, tools and source details are views inside the catalog shell. The site uses React 19, Tailwind 4, global CSS, native controls and Google-hosted IBM Plex Serif and Inter. Lucide and reusable UI primitives are already installed.

| Area | Source | Audit and planned treatment |
| --- | --- | --- |
| Shell, menus, headings | `components/chem-atlas.tsx`, `app/globals.css` | Repeated sidebar sizing rules and hover-dependent unit menu. Preserve routes and hover behavior, provide a keyboard and touch disclosure, and keep a persistent horizontal header. |
| Unit and topic directory | `components/chem-atlas.tsx` | Separate button markup with inconsistent labels, cards, and column counts. Share a card pattern, shrink-to-fit tracks, and consistent statistics. |
| Question Bank | `components/chem-atlas.tsx` | Filters and result count already stay above a scrollable result pane. Add removable filter chips, preserve matching, and group secondary topic evidence under a disclosure. |
| Practice Builder | `components/practice-builder.tsx`, `lib/worksheet.ts` | Draft controls compete with workflow, small actions, and one large group of settings. Refine header, use a quiet stepper and group fields. Preserve local storage, schema, preview, backup and selection. |
| PDF workspace | `components/chem-atlas.tsx`, `components/worksheet-preview.tsx`, `lib/question-source.ts` | Existing PDF.js viewer already observes size, caps device-pixel scaling, and cancels stale renders. Retain this pipeline and source regions. Prioritize the document in layout and make both toolbars consistent. |
| Supporting views | `components/chem-atlas.tsx` | Practice, progress, review, import and audit share existing classes and inherit the theme. Preserve grading and source workflows. |
| Export | `lib/worksheet-render.ts`, `lib/worksheet-pdf.ts`, `scripts/verify-worksheet-export.mts` | PDF-LIB and reviewed source fragments. Keep the export renderer and catalog inputs intact. |

Baseline type check passed. Repository lint reported 15 errors and 1,879 warnings across the existing source and vendored assets. The previous deployed build and worksheet export tests passed.

## Resolution

All five main views received shared design styles. The navigation menu supports click, keyboard and hover. The two directories use the same card. The Question Bank shows removable active filters and disclosures for question mappings. Practice Builder uses a stepper, secondary worksheet actions, grouped print settings and explicit readiness labels. Question detail and worksheet preview share quiet document controls. Data, classification, source references, and PDF composition are outside the change set.

Native dropdowns were retained for platform keyboard behavior. Legacy tool views share the palette and shell but keep their existing specialized layouts. The cloud browser download event remains unverified. Baseline lint errors are tracked separately in the implementation report.

## Responsive follow-up

The prior baseline used custom CSS layered over Tailwind with Grid for card tracks and Flexbox for navigation, controls, and the app shell. Several layouts still repeated viewport breakpoints or widths despite identical page gutters. The bank's fixed-height shell needed a width and height guard. Its toolbar separator duplicated the boundary above the results. Opening Tools at 768px and 820px exposed 53px and 35px of overflow after removing the page-wide clipping rule. The menu now anchors to the trailing edge of its trigger.

The inspected baseline Question Bank heading was in normal flow without a border or text decoration. Its visible borders belonged to the navigation and filter area, below their contents. A line through the heading was not reproduced. The revised bank keeps one divider below the result header and avoids sticky navigation in short windows.

Both PDF.js previews were subtracting padding from the ResizeObserver content box. Worksheet Fit Page also used a fixed height. The new fit math uses measured space and preserves the source aspect ratio, PDF rendering cancellation, and device-density scaling. Classification and source crop coordinates were not changed. Question detail uses the same source-file mapping as the baseline.

## Multi-hue color audit

Forest green remains the brand, navigation, primary action, focus, and worksheet selection color. The previous stylesheet also used green for unit arrows and labels, topic codes, document controls, classification marks, and every metric icon. These information and category roles now use blue, purple, or teal. Green marks successful actions. Amber identifies review and coral identifies failures or destructive actions. The directory cards, question rows, and filters retain neutral surfaces. Decorative variation is limited to metric accents and small indicators. Existing exam page colors and annotations are preserved.
