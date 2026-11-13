# ChemAtlas Interaction Design Audit

## Research sources

- Apple Human Interface Guidelines, Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Apple WWDC18, Designing Fluid Interfaces: https://developer.apple.com/videos/play/wwdc2018/803/
- Material Design 3, Motion overview: https://m3.material.io/styles/motion/overview/how-it-works
- Nielsen Norman Group, Microinteractions in User Experience: https://www.nngroup.com/articles/microinteractions/
- Nielsen Norman Group, The Role of Animation and Motion in UX: https://www.nngroup.com/articles/animation-purpose-ux/
- Nielsen Norman Group, Executing UX Animations: https://www.nngroup.com/articles/animation-duration/
- W3C WCAG 2.2, Animation from Interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions
- W3C WCAG 2.2, Focus Appearance and Target Size criteria: https://www.w3.org/TR/WCAG22/

## Findings applied

The strongest common guidance is to tie feedback to an action, keep repeated interactions quick, preserve cause and effect, avoid motion that delays content, expose keyboard focus, and honor reduced-motion preferences. For ChemAtlas, low-amplitude color, border, and short transform feedback helps make controls feel responsive; document content and reading stay still. CSS is sufficient for these effects, so no animation dependency is needed.

## Existing interaction audit

| Area | Current behavior | Decision | Priority |
| --- | --- | --- | --- |
| Shared navigation | Button-based page switching; unit mega-menu opens on hover and keyboard focus; Tools uses native disclosure | Keep current behavior; add explicit current-page state and consistent focus/press feedback | High |
| Unit/topic cards | Cards navigate to unit/topic; existing hover tint and lift | Keep the action, unify motion and palette states; no entrance animation | Medium |
| Question bank | Unit/topic/type filters and immediate keyword search; 50-row paging | Add one-click Clear filters only when filters are active; announce result-count changes | High |
| Question records | Whole row opens details; prior hover scale could overlap adjacent content | Replace scale with border/surface feedback, keeping the content in place | High |
| Question detail | Crop/full-page controls and multi-page source selector | Expose pressed state and accessible grouping; preserve image and question data | High |
| PDF viewer | Previous canvas scaled to a 1.35 maximum and could render below the available display resolution; no zoom, fit modes, pan, or focus mode | Render directly from the PDF at display density; add crop/full-page, fit, zoom, pan, fullscreen, and a collapsible classification panel | High |
| Practice | Text response submit, self-assessment, review feedback and next question | Keep answer disclosure rules and grading behavior; expose progress and selected self-check accessibly | High |
| Progress/review | Buttons navigate to review sessions; selectors change classification | Use shared control feedback; do not add unrequested charts, menus, or confirmation steps | Medium |
| Source page audit | Previous/next and page input | Keep direct navigation; shared keyboard focus and disabled states | Medium |
| Bank management | PDF upload with saving state and manual question indexing | Preserve status messaging and workflow; no extra animation | High |

## Shared interaction tokens

`--motion-instant: 80ms`, `--motion-fast: 140ms`, `--motion-standard: 180ms`, `--motion-expanded: 240ms`; standard and enter easing curves; forest-tinted focus ring and pressed surface. Controls use immediate press feedback, quick hover/focus transitions, and restrained card lift. A global reduced-motion rule removes nonessential motion.

## Deliberately excluded

- Page-wide animated transitions: the app changes among nine views inside one client component; this could make frequent navigation slower and distract from learning.
- Staggered unit/question list entrances: high-frequency, content-heavy lists benefit more from stable reading positions.
- Hover scaling on dense question rows: overlaps or shifts nearby records and reduces scan stability.
- Animated counters, progress celebrations, parallax, scroll-jacking, or decorative loops: they add attention cost without improving chemistry tasks.
- New animation dependencies: simple CSS feedback meets the identified needs with less runtime and maintenance cost.

## Implementation notes

- Added a one-click filter reset that appears only when at least one filter is active.
- Added live result-count announcements, current-page navigation semantics, accessible pressed states for view/page/self-check controls, and an ARIA progressbar for practice progress.
- Centralized interaction timing/easing tokens and shared focus, hover, pressed, and reduced-motion rules in `app/globals.css`.
- Implemented the same PDF controls in question detail, practice, and source-page audit. The viewer uses CSS transitions only for controls; document rendering stays still, and resize/zoom rebuilds the PDF canvas at a bounded device-pixel ratio.
- Existing question data, classification mappings, source references, progress storage, and practice answer behavior are unchanged.
