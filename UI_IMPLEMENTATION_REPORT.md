# ChemAtlas UI implementation report

| View | Implemented |
| --- | --- |
| Browse by unit | Compact data-driven metrics, shared directory cards, three/two/one-column reflow |
| Unit Topic Browser | Four/three/two/one-column directory, wrapping titles, consistent labels and a distinct unit-level action |
| Question Bank | Pinned controls on standard viewports, active filter chips, clear action, view and worksheet actions, expandable classification |
| Practice Builder | Editable worksheet title, saved-worksheet actions, current-step indicator, advanced filter disclosure, grouped format controls, selected and export-ready states |
| Individual question | Document-first reading order, a 75/25 split at 1,440px, collapsible metadata, keyboard-focusable PDF viewport, quiet zoom and fit controls |

Shared tokens and workspace rules live in `app/atlas-tokens.css` and `app/atlas-workspace.css`. Shared React actions and directory cards live in `components/ui/atlas-controls.tsx`. Catalog, workflow and preview markup changed in `components/chem-atlas.tsx`, `components/practice-builder.tsx` and `components/worksheet-preview.tsx`. The PDF export engine, original source PDFs, extraction scripts, and catalog data retain the baseline Git bytes.

## Verification

- TypeScript and Git whitespace checks passed.
- Worksheet regression suite passed shared MCQ, compact mixed-source MCQ, multipart FRQ, mixed PDF, and 60-question cases.
- Checked directory, topics, Question Bank, question detail and Practice Builder at 390×844, 768×1024, 1024×768, 1440×900 and 1920×1080 in real Chrome iframe viewports. No measured page-level horizontal overflow. Checked 720×450 for narrow reflow as a proxy for 200% zoom. Browser-native 200% zoom and a full assistive-technology audit were outside the verified matrix.
- Chrome verified unit and topic navigation, search and type chips, Clear filters, keyboard unit picker, details, source audit, question crop/full page, zoom in, Fit Page, Actual Size, Reset, and sidebar collapse. Checked the native fullscreen control visually; fullscreen activation was outside the verified flows.
- Chrome verified worksheet creation, add/remove and undo, format edits, generated preview, draft persistence on refresh, duplication and the backup menu. The download event timed out in the cloud browser. Backup export and import were not exercised end to end.
- Contrast calculations passed for principal body text (14.01:1), secondary text on white (6.01:1) and muted surfaces (5.35:1), white on primary (8.00:1), selected text (6.91:1), input outlines against white (3.26:1), warning (6.06:1) and error (6.27:1).
- Baseline and changed-source lint show the same 10 frontend React lint errors. Repository-wide baseline also includes five bundled-worker errors and 1,879 warnings. These predate the redesign.
- Captured browser screenshots for the five main views before and after the change. Baseline images used the standard browser viewport; responsive results above are layout measurements.

## Limits

This change deliberately retains native topic selectors, existing question matching, and existing PDF composition. Existing source crop quality and coverage remain governed by their own audit. The redesign targets WCAG AA but the checks above are not a conformance certification.

## Adaptive layout follow-up

Chrome viewport checks measured page-level horizontal overflow with global clipping removed. Unit, topics, Question Bank, question detail, and all four Practice Builder steps measured zero overflow at 320×540, 390×844, 768×1024, 1024×768, 1440×900, and 1920×1080. Units reflowed through one to four columns. Topics reflowed through one to five. The 1440px question workspace measured 1023px for the PDF and 317px for classification, with a 16px gap.

Verified unit-to-topic and question navigation, keyboard unit menu opening and closing, tablet Tools menu overflow correction, question crop/full-page switching, classification collapse, Actual Size, zoom out and reset, and a generated worksheet preview at 390px. The mobile preview fit its 292px scroller with a 276px canvas and no horizontal scroll. Browser-native fullscreen was denied by the test browser. The viewer reported that and kept the canvas available. Browser-native zoom was not independently verified. The reported lines crossing headings did not reproduce in the inspected baseline.

References for intrinsic grids, fluid measures and component-level queries include [MDN Responsive Design](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design), [MDN Grid](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Grids), [MDN Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries), [web.dev](https://web.dev/learn/design), [Carbon](https://carbondesignsystem.com/), [Every Layout](https://every-layout.dev/layouts/) and [Tailwind responsive design](https://tailwindcss.com/docs/responsive-design).

## Multi-hue follow-up

- `app/atlas-tokens.css` adds the requested palette and maps existing semantic aliases to it. `app/atlas-workspace.css` applies the shared tone variants, neutral action surfaces, directory accents, and PDF chrome. `app/globals.css` drops the obsolete hardcoded metric palette.
- `components/chem-atlas.tsx` and `components/practice-builder.tsx` assign labeled status and type variants using existing record data. `scripts/verify-color-contrast.mjs` checks the palette's text, control, and focus pairs.
- Chrome verified both question badge pairs on the same tablet Question Bank page, a real amber worksheet review state, and mobile labels and layout in grayscale. Adobe's three color-vision simulations flagged similar swatches, so the interface deliberately retains text and state cues independent of hue.
- Research references include [NN/g](https://www.nngroup.com/articles/color-enhance-design/), [Adobe palette theory](https://www.adobe.com/uk/creativecloud/design/discover/color-palette.html), [Carbon foundations](https://www.carbondesignsystem.com/building-blocks/foundations/color/overview), [Carbon categorical and alert palettes](https://www.carbondesignsystem.com/data-visualization/color-palettes/), [Adobe Spectrum](https://spectrum.adobe.com/page/using-color), [Material 3 color roles](https://developer.android.com/codelabs/jetpack-compose-theming), and [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
